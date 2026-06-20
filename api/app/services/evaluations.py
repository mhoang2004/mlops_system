"""
Evaluation service — create, dispatch, and track model evaluation jobs.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..repositories import evaluations as repo
from ..repositories import projects as project_repo
from ..repositories import checkpoints as ckpt_repo
from ..repositories import dataset_versions as dv_repo
from ..repositories import ml_models as model_repo
from ..repositories import trainers as trainer_repo

try:
    from celery_app import celery_app  # type: ignore
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False

try:
    from common.minio_client import get_minio_client as _get_minio
    _MINIO_AVAILABLE = True
except Exception:
    _MINIO_AVAILABLE = False


def _find_annotation_key(storage_path: str) -> Optional[str]:
    if not _MINIO_AVAILABLE:
        return None
    try:
        client = _get_minio()
        prefix = f"{storage_path.rstrip('/')}/annotations/"
        objs = list(client.list_objects("datasets", prefix=prefix, recursive=True))
        if objs:
            return objs[0].object_name
    except Exception:
        pass
    return None


# ── Public API ────────────────────────────────────────────────────────────────

def create_evaluation(db: Session, payload: dict) -> dict:
    project_id    = payload["project_id"]
    ml_model_id   = payload["ml_model_id"]
    checkpoint_id = payload["checkpoint_id"]
    server_id     = payload["server_id"]
    name          = payload["name"]
    description   = payload.get("description")
    dv_ids        = payload["dataset_version_ids"]

    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(404, f"Project {project_id} not found")

    ml_model = model_repo.get_by_id(db, ml_model_id)
    if not ml_model:
        raise HTTPException(404, f"MLModel {ml_model_id} not found")
    if ml_model.project_id != project_id:
        raise HTTPException(400, f"MLModel {ml_model_id} không thuộc project {project_id}")

    trainer = trainer_repo.get_by_id(db, ml_model.trainer_id)
    if not trainer:
        raise HTTPException(404, f"Trainer for model {ml_model_id} not found")

    ckpt = ckpt_repo.get_by_id(db, checkpoint_id)
    if not ckpt:
        raise HTTPException(404, f"Checkpoint {checkpoint_id} not found")
    if ckpt.project_id != project_id:
        raise HTTPException(400, f"Checkpoint {checkpoint_id} không thuộc project {project_id}")

    if not dv_ids:
        raise HTTPException(400, "Cần ít nhất 1 dataset version để evaluate")

    resolved_datasets = []
    for dv_id in dv_ids:
        dv = dv_repo.get_by_id(db, dv_id)
        if not dv:
            raise HTTPException(404, f"DatasetVersion {dv_id} not found")
        if dv.project_id != project_id:
            raise HTTPException(400, f"DatasetVersion {dv_id} không thuộc project {project_id}")

        base    = dv.storage_path.rstrip("/")
        has_ann = dv.label_type == "human"
        ann_key = _find_annotation_key(base) if has_ann else None
        resolved_datasets.append({
            "dataset_version_id": dv_id,
            "name":               f"{dv.name} {dv.version}",
            "images_prefix":      f"{base}/files/",
            "annotations_key":    ann_key,
            "has_annotations":    ann_key is not None,
        })

    classes = [lbl["name"] for lbl in (project.labels or [])]

    ev = repo.create(
        db,
        project_id=project_id,
        ml_model_id=ml_model_id,
        checkpoint_id=checkpoint_id,
        name=name,
        description=description,
        server_id=server_id,
    )
    for dv_id in dv_ids:
        repo.add_dataset(db, evaluation_id=ev.id, dataset_version_id=dv_id)
    db.commit()
    db.refresh(ev)

    job_payload = {
        "evaluation_id":    ev.id,
        "project_id":       project_id,
        "trainer_key":      trainer.key,
        "minio": {
            "endpoint":    os.getenv("MINIO_WORKER_ENDPOINT") or os.getenv("MINIO_ENDPOINT", "minio:9000"),
            "bucket":      "datasets",
            "ckpt_bucket": "checkpoints",
            "access_key":  os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            "secret_key":  os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            "secure":      os.getenv("MINIO_SECURE", "0") in ("1", "true"),
        },
        "checkpoint_key":   ckpt.file_path,
        "datasets":         resolved_datasets,
        "classes":          classes,
        "api_callback_url": os.getenv("API_WORKER_URL") or os.getenv("API_INTERNAL_URL", "http://api:8000"),
    }

    if CELERY_AVAILABLE:
        queue = f"server_{server_id}_inference" if str(server_id).isdigit() else "inference"
        task = celery_app.send_task("tasks.run_evaluation", args=[job_payload], queue=queue)
        repo.update_status(db, ev, "PENDING", celery_task_id=task.id)

    return _serialize(ev)


def list_evaluations(db: Session, project_id: int) -> list[dict]:
    return [_serialize(ev) for ev in repo.list_by_project(db, project_id)]


def get_evaluation(db: Session, evaluation_id: int) -> dict:
    ev       = _get_or_404(db, evaluation_id)
    datasets = repo.get_datasets(db, evaluation_id)
    return {
        **_serialize(ev),
        "datasets": [
            {"id": d.id, "dataset_version_id": d.dataset_version_id}
            for d in datasets
        ],
    }


def delete_evaluation(db: Session, evaluation_id: int) -> None:
    ev = _get_or_404(db, evaluation_id)
    if ev.status == "RUNNING":
        raise HTTPException(400, "Không thể xóa evaluation đang chạy")
    db.delete(ev)
    db.commit()


def handle_progress(db: Session, evaluation_id: int, body: dict) -> dict:
    ev = _get_or_404(db, evaluation_id)
    repo.update_status(db, ev, body.get("status", ev.status))
    return _serialize(ev)


def handle_complete(db: Session, evaluation_id: int, body: dict) -> dict:
    ev = _get_or_404(db, evaluation_id)
    repo.complete(
        db, ev,
        overall_metrics=body["overall_metrics"],
        dataset_results=body["dataset_results"],
    )
    return _serialize(ev)


def handle_fail(db: Session, evaluation_id: int, body: dict) -> dict:
    ev = _get_or_404(db, evaluation_id)
    repo.update_status(db, ev, "FAILED", error_message=body["error_message"])
    return _serialize(ev)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(db: Session, evaluation_id: int):
    ev = repo.get_by_id(db, evaluation_id)
    if not ev:
        raise HTTPException(404, f"Evaluation {evaluation_id} not found")
    return ev


def _serialize(ev) -> dict:
    return {
        "id":               ev.id,
        "project_id":       ev.project_id,
        "ml_model_id":      ev.ml_model_id,
        "checkpoint_id":    ev.checkpoint_id,
        "name":             ev.name,
        "description":      ev.description,
        "server_id":        ev.server_id,
        "status":           ev.status,
        "celery_task_id":   ev.celery_task_id,
        "overall_metrics":  ev.overall_metrics,
        "dataset_results":  ev.dataset_results,
        "error_message":    ev.error_message,
        "started_at":       ev.started_at,
        "finished_at":      ev.finished_at,
        "created_at":       ev.created_at,
        "updated_at":       ev.updated_at,
    }
