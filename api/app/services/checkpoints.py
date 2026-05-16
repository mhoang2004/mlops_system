from typing import Any, Dict, List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models.checkpoints import Checkpoint
from ..repositories import checkpoints as repo
from ..repositories import projects as project_repo
from common.minio_client import get_minio_client, ensure_bucket, upload_file

BUCKET_NAME = "checkpoints"


def list_checkpoints(db: Session, project_id: Optional[int] = None) -> List[Checkpoint]:
    return repo.get_all(db, project_id)


def get_checkpoint(db: Session, checkpoint_id: int) -> Checkpoint:
    ckpt = repo.get_by_id(db, checkpoint_id)
    if not ckpt:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return ckpt


def upload_pretrained(
    db: Session,
    project_id: int,
    name: str,
    file: UploadFile,
    metrics: Optional[Dict[str, Any]],
) -> Checkpoint:
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    object_name = f"checkpoints/project_{project_id}/imported/{file.filename}"
    ensure_bucket(BUCKET_NAME)
    upload_file(BUCKET_NAME, object_name, file.file, file.content_type or "application/octet-stream")
    return repo.create(db, project_id, name, "pretrained", object_name, metrics)


def update_checkpoint(
    db: Session,
    checkpoint_id: int,
    name: Optional[str],
    metrics: Optional[Dict[str, Any]],
) -> Checkpoint:
    ckpt = get_checkpoint(db, checkpoint_id)
    return repo.update(db, ckpt, name, metrics)


def delete_checkpoint(db: Session, checkpoint_id: int) -> None:
    ckpt = get_checkpoint(db, checkpoint_id)
    client = get_minio_client()
    client.remove_object(BUCKET_NAME, ckpt.file_path)
    repo.delete(db, ckpt)
