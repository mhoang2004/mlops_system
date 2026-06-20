from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import visualizations as service

router = APIRouter(prefix="/visualizations", tags=["visualizations"])


# ── Callback schemas ──────────────────────────────────────────────────────────

class ProgressRequest(BaseModel):
    status: str


class CompleteRequest(BaseModel):
    results: list


class FailRequest(BaseModel):
    error_message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_visualization(
    project_id:    int                  = Form(...),
    name:          str                  = Form(...),
    ml_model_id:   int                  = Form(...),
    checkpoint_id: int                  = Form(...),
    server_id:     str                  = Form(...),
    confidence:    float                = Form(default=0.5),
    images:        List[UploadFile]     = File(...),
    db:            Session              = Depends(get_db),
):
    return service.create_visualization(
        db, project_id, name, ml_model_id, checkpoint_id,
        server_id, confidence, images,
    )


@router.get("/")
def list_visualizations(project_id: int, db: Session = Depends(get_db)):
    return service.list_visualizations(db, project_id)


@router.get("/{viz_id}")
def get_visualization(viz_id: int, db: Session = Depends(get_db)):
    return service.get_visualization(db, viz_id)


@router.get("/{viz_id}/result-images")
def get_result_images(viz_id: int, db: Session = Depends(get_db)):
    return service.get_result_images(db, viz_id)


@router.delete("/{viz_id}", status_code=204)
def delete_visualization(viz_id: int, db: Session = Depends(get_db)):
    service.delete_visualization(db, viz_id)
    return Response(status_code=204)


@router.patch("/{viz_id}/progress")
def update_progress(viz_id: int, body: ProgressRequest, db: Session = Depends(get_db)):
    return service.handle_progress(db, viz_id, body.model_dump())


@router.patch("/{viz_id}/complete")
def complete_visualization(viz_id: int, body: CompleteRequest, db: Session = Depends(get_db)):
    return service.handle_complete(db, viz_id, body.model_dump())


@router.patch("/{viz_id}/fail")
def fail_visualization(viz_id: int, body: FailRequest, db: Session = Depends(get_db)):
    return service.handle_fail(db, viz_id, body.model_dump())
