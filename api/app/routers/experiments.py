from typing import Any, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.experiments import SAMPLING_STRATEGIES
from ..services import experiments as service

router = APIRouter(prefix="/experiments", tags=["experiments"])


# ── Request schemas ───────────────────────────────────────────────────────────

class DatasetEntry(BaseModel):
    dataset_version_id: int
    role: str = Field(..., pattern="^(TRAIN|VALIDATION|TEST)$")
    sampling_weight: float = Field(default=1.0, gt=0)


class CreateExperimentRequest(BaseModel):
    project_id:         int
    name:               str = Field(..., min_length=1, max_length=255)
    description:        Optional[str] = None
    ml_model_id:        int
    server_id:          str = Field(..., description="ID / hostname của compute node")
    datasets:           list[DatasetEntry] = Field(..., min_length=2)
    sampling_strategy:  str = Field(default="CONCAT")
    pretrained_ckpt_id: Optional[int] = None
    train_params:       dict[str, Any] = Field(default_factory=dict)

    @field_validator("sampling_strategy")
    @classmethod
    def validate_strategy(cls, v: str) -> str:
        if v not in SAMPLING_STRATEGIES:
            raise ValueError(f"sampling_strategy phải là một trong {SAMPLING_STRATEGIES}")
        return v


class ProgressUpdateRequest(BaseModel):
    status:        Optional[str] = None
    current_epoch: Optional[int] = None
    total_epochs:  Optional[int] = None
    metrics:       Optional[dict[str, Any]] = None


class CompleteRequest(BaseModel):
    output_checkpoint_key: str
    metrics:               dict[str, Any] = Field(default_factory=dict)


class FailRequest(BaseModel):
    error_message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def create_experiment(body: CreateExperimentRequest, db: Session = Depends(get_db)):
    return service.create_experiment(db, body.model_dump())


@router.get("/")
def list_experiments(project_id: int, db: Session = Depends(get_db)):
    return service.list_experiments(db, project_id)


@router.get("/{experiment_id}")
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    return service.get_experiment(db, experiment_id)


@router.post("/{experiment_id}/cancel")
def cancel_experiment(experiment_id: int, db: Session = Depends(get_db)):
    return service.cancel_experiment(db, experiment_id)


@router.patch("/{experiment_id}/progress")
def update_progress(experiment_id: int, body: ProgressUpdateRequest, db: Session = Depends(get_db)):
    return service.handle_progress_update(db, experiment_id, body.model_dump(exclude_none=True))


@router.patch("/{experiment_id}/complete")
def complete_experiment(experiment_id: int, body: CompleteRequest, db: Session = Depends(get_db)):
    return service.handle_complete(db, experiment_id, body.model_dump())


@router.delete("/{experiment_id}", status_code=204)
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    service.delete_experiment(db, experiment_id)
    return Response(status_code=204)


@router.patch("/{experiment_id}/fail")
def fail_experiment(experiment_id: int, body: FailRequest, db: Session = Depends(get_db)):
    from ..repositories import experiments as repo
    exp = repo.get_by_id(db, experiment_id)
    if exp:
        repo.update_status(db, exp, "FAILED", error_message=body.error_message)
    return {"status": "FAILED"}
