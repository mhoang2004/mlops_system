from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import evaluations as service

router = APIRouter(prefix="/evaluations", tags=["evaluations"])


# ── Request schemas ───────────────────────────────────────────────────────────

class CreateEvaluationRequest(BaseModel):
    project_id:          int
    name:                str      = Field(..., min_length=1, max_length=255)
    description:         Optional[str] = None
    ml_model_id:         int
    checkpoint_id:       int
    server_id:           str
    dataset_version_ids: list[int] = Field(..., min_length=1)


class ProgressRequest(BaseModel):
    status: str


class CompleteRequest(BaseModel):
    overall_metrics: dict
    dataset_results: list[dict]


class FailRequest(BaseModel):
    error_message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_evaluation(body: CreateEvaluationRequest, db: Session = Depends(get_db)):
    return service.create_evaluation(db, body.model_dump())


@router.get("/")
def list_evaluations(project_id: int, db: Session = Depends(get_db)):
    return service.list_evaluations(db, project_id)


@router.get("/{evaluation_id}")
def get_evaluation(evaluation_id: int, db: Session = Depends(get_db)):
    return service.get_evaluation(db, evaluation_id)


@router.delete("/{evaluation_id}", status_code=204)
def delete_evaluation(evaluation_id: int, db: Session = Depends(get_db)):
    service.delete_evaluation(db, evaluation_id)
    return Response(status_code=204)


@router.patch("/{evaluation_id}/progress")
def update_progress(evaluation_id: int, body: ProgressRequest, db: Session = Depends(get_db)):
    return service.handle_progress(db, evaluation_id, body.model_dump())


@router.patch("/{evaluation_id}/complete")
def complete_evaluation(evaluation_id: int, body: CompleteRequest, db: Session = Depends(get_db)):
    return service.handle_complete(db, evaluation_id, body.model_dump())


@router.patch("/{evaluation_id}/fail")
def fail_evaluation(evaluation_id: int, body: FailRequest, db: Session = Depends(get_db)):
    return service.handle_fail(db, evaluation_id, body.model_dump())
