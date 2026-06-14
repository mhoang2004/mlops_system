"""
Experiment service — validation, MinIO path resolution, Celery dispatch.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.experiments import DATASET_ROLES, EXPERIMENT_STATUSES, SAMPLING_STRATEGIES
from ..models.dataset_versions import DatasetVersion
from ..models.checkpoints import Checkpoint
from ..repositories import experiments as repo
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
    """Return the first annotation file key under storage_path/annotations/, or None."""
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

def create_experiment(db: Session, payload: dict) -> dict:
    project_id        = payload["project_id"]
    name              = payload["name"]
    description       = payload.get("description")
    ml_model_id       = payload["ml_model_id"]
    server_id         = payload["server_id"]
    datasets_input    = payload["datasets"]
    sampling_strategy = payload.get("sampling_strategy", "CONCAT")
    pretrained_ckpt_id = payload.get("pretrained_ckpt_id")
    train_params      = payload["train_params"]

    # ── Validate project ──────────────────────────────────────────────────────
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(404, f"Project {project_id} not found")

    # ── Validate ML model ─────────────────────────────────────────────────────
    ml_model = model_repo.get_by_id(db, ml_model_id)
    if not ml_model:
        raise HTTPException(404, f"MLModel {ml_model_id} not found")
    if ml_model.project_id != project_id:
        raise HTTPException(400, f"MLModel {ml_model_id} không thuộc project {project_id}")

    trainer = trainer_repo.get_by_id(db, ml_model.trainer_id)
    if not trainer:
        raise HTTPException(404, f"Trainer for model {ml_model_id} not found")

    # ── Validate enums ────────────────────────────────────────────────────────
    if sampling_strategy not in SAMPLING_STRATEGIES:
        raise HTTPException(400, f"sampling_strategy phải là một trong {SAMPLING_STRATEGIES}")

    for entry in datasets_input:
        if entry["role"] not in DATASET_ROLES:
            raise HTTPException(400, f"role '{entry['role']}' không hợp lệ. Dùng: {DATASET_ROLES}")

    roles = [e["role"] for e in datasets_input]
    if "TRAIN" not in roles:
        raise HTTPException(400, "Experiment phải có ít nhất 1 dataset TRAIN")
    if "TEST" not in roles:
        raise HTTPException(400, "Experiment phải có ít nhất 1 dataset TEST")

    # ── Fetch & validate dataset versions ────────────────────────────────────
    warnings: list[str] = []
    resolved_datasets: list[dict] = []

    for entry in datasets_input:
        dv_id  = entry["dataset_version_id"]
        role   = entry["role"]
        weight = float(entry.get("sampling_weight", 1.0))

        dv: Optional[DatasetVersion] = dv_repo.get_by_id(db, dv_id)
        if not dv:
            raise HTTPException(404, f"DatasetVersion {dv_id} not found")
        if dv.project_id != project_id:
            raise HTTPException(400, f"DatasetVersion {dv_id} không thuộc project {project_id}")

        if dv.label_type != "human":
            warnings.append(
                f"Dataset '{dv.name} {dv.version}' (id={dv_id}, role={role}) "
                f"chưa có annotation — trainer sẽ bỏ qua ảnh không có nhãn."
            )

        base = dv.storage_path.rstrip("/")
        has_ann = dv.label_type == "human"
        ann_key = _find_annotation_key(base) if has_ann else None
        resolved_datasets.append({
            "dataset_version_id": dv_id,
            "name":               f"{dv.name} {dv.version}",
            "role":               role,
            "sampling_weight":    weight,
            "images_prefix":      f"{base}/files/",
            "annotations_key":    ann_key,
            "has_annotations":    ann_key is not None,
        })

    # ── Validate pretrained checkpoint ────────────────────────────────────────
    pretrained_key: Optional[str] = None
    if pretrained_ckpt_id is not None:
        ckpt: Optional[Checkpoint] = ckpt_repo.get_by_id(db, pretrained_ckpt_id)
        if not ckpt:
            raise HTTPException(404, f"Checkpoint {pretrained_ckpt_id} not found")
        if ckpt.project_id != project_id:
            raise HTTPException(400, f"Checkpoint {pretrained_ckpt_id} không thuộc project {project_id}")
        pretrained_key = ckpt.file_path

    # ── Fetch project labels as classes ───────────────────────────────────────
    project = project_repo.get_by_id(db, project_id)
    classes = [lbl["name"] for lbl in (project.labels or [])]

    # ── Persist experiment + dataset links ────────────────────────────────────
    exp = repo.create(
        db,
        project_id=project_id,
        ml_model_id=ml_model_id,
        name=name,
        description=description,
        server_id=server_id,
        pretrained_ckpt_id=pretrained_ckpt_id,
        sampling_strategy=sampling_strategy,
        train_params=train_params,
    )

    for entry in datasets_input:
        repo.add_dataset(
            db,
            experiment_id=exp.id,
            dataset_version_id=entry["dataset_version_id"],
            role=entry["role"],
            sampling_weight=float(entry.get("sampling_weight", 1.0)),
        )

    db.commit()
    db.refresh(exp)

    # ── Build job payload ─────────────────────────────────────────────────────
    datasets_by_role: dict[str, list] = {"TRAIN": [], "VALIDATION": [], "TEST": []}
    for rd in resolved_datasets:
        datasets_by_role[rd["role"]].append(rd)

    job_payload = {
        "experiment_id":    exp.id,
        "project_id":       project_id,
        "ml_model_id":      ml_model_id,
        "trainer_key":      trainer.key,
        "minio": {
            "endpoint":    os.getenv("MINIO_ENDPOINT",   "minio:9000"),
            "bucket":      "datasets",
            "ckpt_bucket": "checkpoints",
            "access_key":  os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            "secret_key":  os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            "secure":      os.getenv("MINIO_SECURE", "0") in ("1", "true"),
        },
        "datasets":               datasets_by_role,
        "sampling_strategy":      sampling_strategy,
        "pretrained_checkpoint":  pretrained_key,
        "classes":                classes,
        "train_params":           train_params,
        "api_callback_url":       os.getenv("API_INTERNAL_URL", "http://api:8000"),
    }

    if CELERY_AVAILABLE:
        task = celery_app.send_task("tasks.run_experiment", args=[job_payload])
        repo.update_status(db, exp, "PENDING", celery_task_id=task.id)
    else:
        import logging
        logging.getLogger(__name__).warning(
            "Celery not available — experiment %d queued but not dispatched", exp.id
        )

    return {"experiment": _serialize(exp), "warnings": warnings}


def get_experiment(db: Session, experiment_id: int) -> dict:
    exp = _get_or_404(db, experiment_id)
    datasets = repo.get_datasets(db, experiment_id)
    return {**_serialize(exp), "datasets": [_serialize_ed(ed) for ed in datasets]}


def list_experiments(db: Session, project_id: int) -> list[dict]:
    return [_serialize(e) for e in repo.list_by_project(db, project_id)]


def cancel_experiment(db: Session, experiment_id: int) -> dict:
    exp = _get_or_404(db, experiment_id)

    if exp.status not in ("PENDING", "DOWNLOADING", "RUNNING"):
        raise HTTPException(400, f"Không thể cancel experiment ở trạng thái '{exp.status}'")

    if CELERY_AVAILABLE and exp.celery_task_id:
        celery_app.control.revoke(exp.celery_task_id, terminate=True, signal="SIGTERM")

    repo.update_status(db, exp, "CANCELLED")
    return _serialize(exp)


def handle_progress_update(db: Session, experiment_id: int, body: dict) -> dict:
    exp = _get_or_404(db, experiment_id)
    repo.update_progress(db, exp, status=body.get("status", exp.status), metrics=body.get("metrics"))
    return _serialize(exp)


def delete_experiment(db: Session, experiment_id: int) -> None:
    exp = _get_or_404(db, experiment_id)
    if exp.status in ("RUNNING", "DOWNLOADING"):
        raise HTTPException(
            400,
            f"Cannot delete experiment while it is '{exp.status}'. Cancel it first."
        )
    db.delete(exp)
    db.commit()


def handle_complete(db: Session, experiment_id: int, body: dict) -> dict:
    from ..repositories import checkpoints as ckpt_repo_mod

    exp = _get_or_404(db, experiment_id)
    ckpt_key: str = body["output_checkpoint_key"]
    metrics:  dict = body.get("metrics", {})

    output_ckpt = ckpt_repo_mod.create(
        db,
        project_id=exp.project_id,
        name=f"{exp.name} — best",
        source="experiment",
        file_path=ckpt_key,
        metrics=metrics,
    )
    output_ckpt.experiment_id = experiment_id
    output_ckpt.ml_model_id   = exp.ml_model_id
    db.commit()

    repo.complete(db, exp, metrics=metrics, output_ckpt_id=output_ckpt.id)
    return _serialize(exp)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(db: Session, experiment_id: int):
    exp = repo.get_by_id(db, experiment_id)
    if not exp:
        raise HTTPException(404, f"Experiment {experiment_id} not found")
    return exp


def _serialize(exp) -> dict:
    return {
        "id":                  exp.id,
        "project_id":          exp.project_id,
        "ml_model_id":         exp.ml_model_id,
        "name":                exp.name,
        "description":         exp.description,
        "server_id":           exp.server_id,
        "sampling_strategy":   exp.sampling_strategy,
        "pretrained_ckpt_id":  exp.pretrained_ckpt_id,
        "train_params":        exp.train_params,
        "status":              exp.status,
        "celery_task_id":      exp.celery_task_id,
        "metrics":             exp.metrics,
        "output_ckpt_id":      exp.output_ckpt_id,
        "error_message":       exp.error_message,
        "started_at":          exp.started_at,
        "finished_at":         exp.finished_at,
        "created_at":          exp.created_at,
        "updated_at":          exp.updated_at,
    }


def _serialize_ed(ed) -> dict:
    return {
        "id":                  ed.id,
        "dataset_version_id":  ed.dataset_version_id,
        "role":                ed.role,
        "sampling_weight":     ed.sampling_weight,
    }
