import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import checkpoints as service

router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])


class CheckpointUpdate(BaseModel):
    name:    Optional[str]              = None
    metrics: Optional[Dict[str, Any]]  = None


@router.post("/", status_code=201)
async def upload_pretrained(
    project_id: int           = Form(...),
    name:       str           = Form(...),
    metrics:    Optional[str] = Form(None),
    file:       UploadFile    = File(...),
    db:         Session       = Depends(get_db),
):
    """Upload a pre-trained checkpoint file."""
    parsed_metrics = json.loads(metrics) if metrics else None
    return service.upload_pretrained(db, project_id, name, file, parsed_metrics)


@router.get("/")
def list_checkpoints(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    return service.list_checkpoints(db, project_id)


@router.get("/{checkpoint_id}")
def get_checkpoint(checkpoint_id: int, db: Session = Depends(get_db)):
    return service.get_checkpoint(db, checkpoint_id)


@router.patch("/{checkpoint_id}")
def update_checkpoint(
    checkpoint_id: int,
    body:          CheckpointUpdate,
    db:            Session = Depends(get_db),
):
    return service.update_checkpoint(db, checkpoint_id, body.name, body.metrics)


@router.delete("/{checkpoint_id}", status_code=204)
def delete_checkpoint(checkpoint_id: int, db: Session = Depends(get_db)):
    service.delete_checkpoint(db, checkpoint_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{checkpoint_id}/download-url")
def get_download_url(
    checkpoint_id:   int,
    expires_seconds: int     = Query(default=3600, ge=60, le=86400),
    db:              Session = Depends(get_db),
):
    """
    Get a presigned URL to download the checkpoint file directly from MinIO.
    URL is valid for `expires_seconds` (default 1 h, max 24 h).
    """
    return service.get_download_url(db, checkpoint_id, expires_seconds)
