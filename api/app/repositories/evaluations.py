from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.evaluations import Evaluation, EvaluationDataset


def create(
    db: Session,
    *,
    project_id: int,
    ml_model_id: int,
    checkpoint_id: int,
    name: str,
    description: Optional[str],
    server_id: str,
) -> Evaluation:
    ev = Evaluation(
        project_id=project_id,
        ml_model_id=ml_model_id,
        checkpoint_id=checkpoint_id,
        name=name,
        description=description,
        server_id=server_id,
        status="PENDING",
    )
    db.add(ev)
    db.flush()
    return ev


def get_by_id(db: Session, evaluation_id: int) -> Optional[Evaluation]:
    return db.query(Evaluation).filter(Evaluation.id == evaluation_id).first()


def list_by_project(db: Session, project_id: int) -> list[Evaluation]:
    return (
        db.query(Evaluation)
        .filter(Evaluation.project_id == project_id)
        .order_by(Evaluation.created_at.desc())
        .all()
    )


def update_status(
    db: Session,
    ev: Evaluation,
    status: str,
    *,
    celery_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> Evaluation:
    ev.status = status
    if celery_task_id is not None:
        ev.celery_task_id = celery_task_id
    if status == "RUNNING" and ev.started_at is None:
        ev.started_at = datetime.utcnow()
    if status in ("COMPLETED", "FAILED"):
        ev.finished_at = datetime.utcnow()
    if error_message is not None:
        ev.error_message = error_message
    db.commit()
    db.refresh(ev)
    return ev


def complete(
    db: Session,
    ev: Evaluation,
    *,
    overall_metrics: dict,
    dataset_results: list,
) -> Evaluation:
    ev.status          = "COMPLETED"
    ev.overall_metrics = overall_metrics
    ev.dataset_results = dataset_results
    ev.finished_at     = datetime.utcnow()
    db.commit()
    db.refresh(ev)
    return ev


def add_dataset(
    db: Session,
    *,
    evaluation_id: int,
    dataset_version_id: int,
) -> EvaluationDataset:
    ed = EvaluationDataset(
        evaluation_id=evaluation_id,
        dataset_version_id=dataset_version_id,
    )
    db.add(ed)
    return ed


def get_datasets(db: Session, evaluation_id: int) -> list[EvaluationDataset]:
    return (
        db.query(EvaluationDataset)
        .filter(EvaluationDataset.evaluation_id == evaluation_id)
        .all()
    )
