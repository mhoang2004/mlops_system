from typing import List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..models.dataset_versions import DatasetVersion
from ..repositories import dataset_versions as repo
from ..repositories import projects as project_repo
from common.minio_client import (
    get_minio_client, ensure_bucket, upload_file,
    list_images_paginated, get_presigned_url,
)

BUCKET_NAME = "datasets"
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
_ANNOTATION_EXTS = {".json", ".txt", ".yaml", ".yml", ".xml", ".csv"}


def list_versions(db: Session, project_id: Optional[int] = None) -> List[DatasetVersion]:
    return repo.get_all(db, project_id)


def get_version(db: Session, dv_id: int) -> DatasetVersion:
    dv = repo.get_by_id(db, dv_id)
    if not dv:
        raise HTTPException(status_code=404, detail="Dataset version not found")
    return dv


def create_version(
    db: Session,
    project_id: int,
    name: str,
    version: str,
    description: Optional[str],
    files: Optional[List[UploadFile]],
) -> DatasetVersion:
    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    storage_path = f"datasets/project_{project_id}/{name}/{version}/"
    dv = repo.create(db, project_id, name, version, description, storage_path)

    if files:
        ensure_bucket(BUCKET_NAME)
        for f in files:
            object_name = f"{storage_path}files/{f.filename}"
            upload_file(BUCKET_NAME, object_name, f.file, f.content_type or "application/octet-stream")

    return dv


def upload_files(db: Session, dv_id: int, files: List[UploadFile]) -> dict:
    """Upload additional image files to an existing dataset version."""
    dv = get_version(db, dv_id)
    ensure_bucket(BUCKET_NAME)

    uploaded = []
    for f in files:
        object_name = f"{dv.storage_path}files/{f.filename}"
        upload_file(BUCKET_NAME, object_name, f.file, f.content_type or "application/octet-stream")
        uploaded.append(f.filename)

    return {"uploaded": uploaded, "count": len(uploaded)}


def update_version(
    db: Session,
    dv_id: int,
    name: Optional[str],
    version: Optional[str],
    description: Optional[str],
) -> DatasetVersion:
    dv = get_version(db, dv_id)
    return repo.update(db, dv, name, version, description)


def delete_version(db: Session, dv_id: int) -> None:
    dv = get_version(db, dv_id)
    client = get_minio_client()
    objects = client.list_objects(BUCKET_NAME, prefix=dv.storage_path, recursive=True)
    for obj in objects:
        client.remove_object(BUCKET_NAME, obj.object_name)
    repo.delete(db, dv)


# ── Images ────────────────────────────────────────────────────────────────────

def list_images(db: Session, dv_id: int, offset: int = 0, limit: int = 20) -> dict:
    dv = get_version(db, dv_id)
    prefix = f"{dv.storage_path}files/"
    return list_images_paginated(BUCKET_NAME, prefix, offset=offset, limit=limit)


# ── Annotations / Labels ──────────────────────────────────────────────────────

def upload_labels(db: Session, dv_id: int, files: List[UploadFile]) -> DatasetVersion:
    dv = get_version(db, dv_id)
    ensure_bucket(BUCKET_NAME)
    for f in files:
        object_name = f"{dv.storage_path}annotations/{f.filename}"
        upload_file(BUCKET_NAME, object_name, f.file, f.content_type or "application/octet-stream")
    return repo.set_label_type(db, dv, "human")


def list_annotations(db: Session, dv_id: int) -> dict:
    """
    List annotation files stored in MinIO for this dataset version.
    Returns filenames + presigned download URLs.
    """
    from pathlib import PurePosixPath
    dv = get_version(db, dv_id)
    prefix = f"{dv.storage_path}annotations/"
    client = get_minio_client()

    try:
        objects = list(client.list_objects(BUCKET_NAME, prefix=prefix, recursive=True))
    except Exception:
        objects = []

    items = []
    for obj in objects:
        ext = PurePosixPath(obj.object_name).suffix.lower()
        if ext in _ANNOTATION_EXTS or ext == "":
            items.append({
                "filename":   PurePosixPath(obj.object_name).name,
                "key":        obj.object_name,
                "url":        get_presigned_url(BUCKET_NAME, obj.object_name),
                "size_bytes": obj.size,
            })

    return {
        "items":      items,
        "total":      len(items),
        "label_type": dv.label_type,
    }


def delete_labels(db: Session, dv_id: int) -> DatasetVersion:
    """
    Remove all annotation files from MinIO and reset label_type to 'unlabeled'.
    """
    dv = get_version(db, dv_id)
    client = get_minio_client()
    prefix = f"{dv.storage_path}annotations/"

    try:
        objects = list(client.list_objects(BUCKET_NAME, prefix=prefix, recursive=True))
        for obj in objects:
            client.remove_object(BUCKET_NAME, obj.object_name)
    except Exception:
        pass  # prefix may not exist

    return repo.set_label_type(db, dv, "unlabeled")
