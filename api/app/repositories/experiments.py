from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.experiments import Experiment, ExperimentDataset


# ── Experiment ────────────────────────────────────────────────────────────────

def create(
    db: Session,
    *,
    project_id: int,
    ml_model_id: int,
    name: str,
    description: Optional[str],
    server_id: str,
    pretrained_ckpt_id: Optional[int],
    sampling_strategy: str,
    train_params: dict,
) -> Experiment:
    exp = Experiment(
        project_id=project_id,
        ml_model_id=ml_model_id,
        name=name,
        description=description,
        server_id=server_id,
        pretrained_ckpt_id=pretrained_ckpt_id,
        sampling_strategy=sampling_strategy,
        train_params=train_params,
        status="PENDING",
    )
    db.add(exp)
    db.flush()
    return exp


def get_by_id(db: Session, experiment_id: int) -> Optional[Experiment]:
    return db.query(Experiment).filter(Experiment.id == experiment_id).first()


def list_by_project(db: Session, project_id: int) -> list[Experiment]:
    return (
        db.query(Experiment)
        .filter(Experiment.project_id == project_id)
        .order_by(Experiment.created_at.desc())
        .all()
    )


def list_active_by_server(db: Session, server_id: str) -> list[Experiment]:
    return (
        db.query(Experiment)
        .filter(
            Experiment.server_id == server_id,
            Experiment.status.in_(["PENDING", "DOWNLOADING", "RUNNING"]),
        )
        .order_by(Experiment.created_at.desc())
        .all()
    )


def update_status(
    db: Session,
    exp: Experiment,
    status: str,
    *,
    celery_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> Experiment:
    exp.status = status
    if celery_task_id is not None:
        exp.celery_task_id = celery_task_id
    if status == "RUNNING" and exp.started_at is None:
        exp.started_at = datetime.utcnow()
    if status in ("COMPLETED", "FAILED", "CANCELLED"):
        exp.finished_at = datetime.utcnow()
    if error_message is not None:
        exp.error_message = error_message
    db.commit()
    db.refresh(exp)
    return exp


def update_progress(
    db: Session,
    exp: Experiment,
    *,
    status: str,
    metrics: Optional[dict] = None,
) -> Experiment:
    exp.status = status
    if metrics:
        exp.metrics = metrics
    db.commit()
    db.refresh(exp)
    return exp


def complete(
    db: Session,
    exp: Experiment,
    *,
    metrics: dict,
    output_ckpt_id: int,
) -> Experiment:
    exp.status = "COMPLETED"
    exp.metrics = metrics
    exp.output_ckpt_id = output_ckpt_id
    exp.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(exp)
    return exp


# ── ExperimentDataset ─────────────────────────────────────────────────────────

def add_dataset(
    db: Session,
    *,
    experiment_id: int,
    dataset_version_id: int,
    role: str,
    sampling_weight: float,
) -> ExperimentDataset:
    ed = ExperimentDataset(
        experiment_id=experiment_id,
        dataset_version_id=dataset_version_id,
        role=role,
        sampling_weight=sampling_weight,
    )
    db.add(ed)
    return ed


def get_datasets(db: Session, experiment_id: int) -> list[ExperimentDataset]:
    return (
        db.query(ExperimentDataset)
        .filter(ExperimentDataset.experiment_id == experiment_id)
        .all()
    )
