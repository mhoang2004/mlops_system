import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import checkpoints as service

router = APIRouter(prefix="/checkpoints", tags=["checkpoints"])


class CheckpointUpdate(BaseModel):
    name: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None


@router.post("/", status_code=201)
async def upload_pretrained(
    project_id: int = Form(...),
    name: str = Form(...),
    metrics: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    parsed_metrics = json.loads(metrics) if metrics else None
    return service.upload_pretrained(db, project_id, name, file, parsed_metrics)


@router.get("/")
def list_checkpoints(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    return service.list_checkpoints(db, project_id)


@router.get("/{checkpoint_id}")
def get_checkpoint(checkpoint_id: int, db: Session = Depends(get_db)):
    return service.get_checkpoint(db, checkpoint_id)


@router.patch("/{checkpoint_id}")
def update_checkpoint(checkpoint_id: int, body: CheckpointUpdate, db: Session = Depends(get_db)):
    return service.update_checkpoint(db, checkpoint_id, body.name, body.metrics)


@router.delete("/{checkpoint_id}", status_code=204)
def delete_checkpoint(checkpoint_id: int, db: Session = Depends(get_db)):
    service.delete_checkpoint(db, checkpoint_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
