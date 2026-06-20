from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.visualizations import Visualization


def create(
    db: Session,
    *,
    project_id: int,
    ml_model_id: int,
    checkpoint_id: int,
    name: str,
    server_id: str,
    confidence: float,
) -> Visualization:
    viz = Visualization(
        project_id=project_id,
        ml_model_id=ml_model_id,
        checkpoint_id=checkpoint_id,
        name=name,
        server_id=server_id,
        confidence=confidence,
        status="PENDING",
    )
    db.add(viz)
    db.flush()
    return viz


def get_by_id(db: Session, viz_id: int) -> Optional[Visualization]:
    return db.query(Visualization).filter(Visualization.id == viz_id).first()


def list_by_project(db: Session, project_id: int) -> list[Visualization]:
    return (
        db.query(Visualization)
        .filter(Visualization.project_id == project_id)
        .order_by(Visualization.created_at.desc())
        .all()
    )


def update_input_keys(db: Session, viz: Visualization, keys: list[str]) -> Visualization:
    viz.input_image_keys = keys
    db.commit()
    db.refresh(viz)
    return viz


def update_status(
    db: Session,
    viz: Visualization,
    status: str,
    *,
    celery_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> Visualization:
    viz.status = status
    if celery_task_id is not None:
        viz.celery_task_id = celery_task_id
    if status == "RUNNING" and viz.started_at is None:
        viz.started_at = datetime.utcnow()
    if status in ("COMPLETED", "FAILED"):
        viz.finished_at = datetime.utcnow()
    if error_message is not None:
        viz.error_message = error_message
    db.commit()
    db.refresh(viz)
    return viz


def complete(db: Session, viz: Visualization, *, results: list) -> Visualization:
    viz.status     = "COMPLETED"
    viz.results    = results
    viz.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(viz)
    return viz
