from __future__ import annotations

import os
from pathlib import PurePosixPath
from typing import List, Optional

from fastapi import HTTPException, UploadFile

from sqlalchemy.orm import Session

from ..repositories import visualizations as repo
from ..repositories import projects as project_repo
from ..repositories import checkpoints as ckpt_repo
from ..repositories import ml_models as model_repo
from ..repositories import trainers as trainer_repo
from common.minio_client import ensure_bucket, upload_file, get_presigned_url

try:
    from celery_app import celery_app  # type: ignore
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False

VIZ_BUCKET = "visualizations"
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def create_visualization(
    db: Session,
    project_id: int,
    name: str,
    ml_model_id: int,
    checkpoint_id: int,
    server_id: str,
    confidence: float,
    images: List[UploadFile],
) -> dict:
    if not images:
        raise HTTPException(400, "Cần ít nhất 1 ảnh")

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

    viz = repo.create(
        db,
        project_id=project_id,
        ml_model_id=ml_model_id,
        checkpoint_id=checkpoint_id,
        name=name,
        server_id=server_id,
        confidence=confidence,
    )

    # Upload images to MinIO
    ensure_bucket(VIZ_BUCKET)
    prefix = f"project_{project_id}/viz_{viz.id}/inputs/"
    input_keys: list[str] = []
    for img in images:
        ext = PurePosixPath(img.filename or "img.jpg").suffix.lower()
        if ext not in _IMAGE_EXTS:
            continue
        key = prefix + (img.filename or f"image{ext}")
        upload_file(VIZ_BUCKET, key, img.file, img.content_type or "image/jpeg")
        input_keys.append(key)

    if not input_keys:
        db.delete(viz)
        db.commit()
        raise HTTPException(400, "Không có file ảnh hợp lệ (chấp nhận jpg/png/webp/bmp)")

    repo.update_input_keys(db, viz, input_keys)

    classes = [lbl["name"] for lbl in (project.labels or [])]

    job_payload = {
        "visualization_id": viz.id,
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
        "viz_bucket":       VIZ_BUCKET,
        "checkpoint_key":   ckpt.file_path,
        "input_image_keys": input_keys,
        "classes":          classes,
        "confidence":       confidence,
        "api_callback_url": os.getenv("API_WORKER_URL") or os.getenv("API_INTERNAL_URL", "http://api:8000"),
    }

    if CELERY_AVAILABLE:
        queue = f"server_{server_id}_inference" if str(server_id).isdigit() else "inference"
        task = celery_app.send_task("tasks.run_visualization", args=[job_payload], queue=queue)
        repo.update_status(db, viz, "PENDING", celery_task_id=task.id)

    return _serialize(viz)


def list_visualizations(db: Session, project_id: int) -> list[dict]:
    return [_serialize(v) for v in repo.list_by_project(db, project_id)]


def get_visualization(db: Session, viz_id: int) -> dict:
    viz = _get_or_404(db, viz_id)
    return _serialize(viz)


def get_result_images(db: Session, viz_id: int) -> list[dict]:
    viz = _get_or_404(db, viz_id)
    if not viz.results:
        return []
    items = []
    for r in viz.results:
        item = {
            "filename":        r.get("filename"),
            "output_filename": r.get("output_filename"),
            "output_key":      r.get("output_key"),
            "detections":      r.get("detections", []),
            "output_url":      None,
        }
        if r.get("output_key"):
            try:
                item["output_url"] = get_presigned_url(VIZ_BUCKET, r["output_key"])
            except Exception:
                pass
        items.append(item)
    return items


def delete_visualization(db: Session, viz_id: int) -> None:
    viz = _get_or_404(db, viz_id)
    if viz.status == "RUNNING":
        raise HTTPException(400, "Không thể xóa visualization đang chạy")
    db.delete(viz)
    db.commit()


def handle_progress(db: Session, viz_id: int, body: dict) -> dict:
    viz = _get_or_404(db, viz_id)
    repo.update_status(db, viz, body.get("status", viz.status))
    return _serialize(viz)


def handle_complete(db: Session, viz_id: int, body: dict) -> dict:
    viz = _get_or_404(db, viz_id)
    repo.complete(db, viz, results=body["results"])
    return _serialize(viz)


def handle_fail(db: Session, viz_id: int, body: dict) -> dict:
    viz = _get_or_404(db, viz_id)
    repo.update_status(db, viz, "FAILED", error_message=body["error_message"])
    return _serialize(viz)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(db: Session, viz_id: int):
    viz = repo.get_by_id(db, viz_id)
    if not viz:
        raise HTTPException(404, f"Visualization {viz_id} not found")
    return viz


def _serialize(viz) -> dict:
    return {
        "id":               viz.id,
        "project_id":       viz.project_id,
        "ml_model_id":      viz.ml_model_id,
        "checkpoint_id":    viz.checkpoint_id,
        "name":             viz.name,
        "server_id":        viz.server_id,
        "confidence":       viz.confidence,
        "status":           viz.status,
        "celery_task_id":   viz.celery_task_id,
        "input_image_keys": viz.input_image_keys,
        "results":          viz.results,
        "error_message":    viz.error_message,
        "started_at":       viz.started_at,
        "finished_at":      viz.finished_at,
        "created_at":       viz.created_at,
        "updated_at":       viz.updated_at,
    }
