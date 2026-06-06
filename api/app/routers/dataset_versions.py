from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import dataset_versions as service

router = APIRouter(prefix="/dataset-versions", tags=["dataset-versions"])


class DatasetVersionUpdate(BaseModel):
    name:        Optional[str] = None
    version:     Optional[str] = None
    description: Optional[str] = None


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_dataset_version(
    project_id:  int                        = Form(...),
    name:        str                        = Form(...),
    version:     str                        = Form(...),
    description: Optional[str]             = Form(None),
    files:       Optional[List[UploadFile]] = File(None),
    db:          Session                    = Depends(get_db),
):
    """Create a dataset version and optionally upload images in the same request."""
    return service.create_version(db, project_id, name, version, description, files)


@router.get("/")
def list_versions(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    return service.list_versions(db, project_id)


@router.get("/{dv_id}")
def get_version(dv_id: int, db: Session = Depends(get_db)):
    return service.get_version(db, dv_id)


@router.patch("/{dv_id}")
def update_version(dv_id: int, body: DatasetVersionUpdate, db: Session = Depends(get_db)):
    return service.update_version(db, dv_id, body.name, body.version, body.description)


@router.delete("/{dv_id}", status_code=204)
def delete_version(dv_id: int, db: Session = Depends(get_db)):
    service.delete_version(db, dv_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Files (images) ────────────────────────────────────────────────────────────

@router.post("/{dv_id}/files", status_code=201)
async def upload_files(
    dv_id: int,
    files: List[UploadFile] = File(...),
    db:    Session          = Depends(get_db),
):
    """Upload additional image files to an existing dataset version."""
    return service.upload_files(db, dv_id, files)


@router.get("/{dv_id}/images")
def list_images(
    dv_id:  int,
    offset: int = 0,
    limit:  int = 20,
    db:     Session = Depends(get_db),
):
    """
    Paginated list of images stored in MinIO.
    Returns presigned URLs the browser can load directly.
    """
    return service.list_images(db, dv_id, offset=offset, limit=limit)


# ── Annotations / Labels ──────────────────────────────────────────────────────

@router.post("/{dv_id}/upload-labels")
async def upload_labels(
    dv_id: int,
    files: List[UploadFile] = File(...),
    db:    Session          = Depends(get_db),
):
    """Upload annotation files (COCO JSON, YOLO txt, etc.) and mark version as labeled."""
    return service.upload_labels(db, dv_id, files)


@router.get("/{dv_id}/annotations")
def list_annotations(dv_id: int, db: Session = Depends(get_db)):
    """List annotation files with presigned download URLs."""
    return service.list_annotations(db, dv_id)


@router.delete("/{dv_id}/labels", status_code=200)
def delete_labels(dv_id: int, db: Session = Depends(get_db)):
    """Remove all annotation files and reset label_type to 'unlabeled'."""
    return service.delete_labels(db, dv_id)
