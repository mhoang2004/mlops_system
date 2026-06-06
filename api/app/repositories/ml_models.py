from typing import Optional
from sqlalchemy.orm import Session

from ..models.ml_models import MLModel


def get_all_by_project(db: Session, project_id: int) -> list[MLModel]:
    return (
        db.query(MLModel)
        .filter(MLModel.project_id == project_id)
        .order_by(MLModel.created_at.desc())
        .all()
    )


def get_by_id(db: Session, model_id: int) -> Optional[MLModel]:
    return db.query(MLModel).filter(MLModel.id == model_id).first()


def create(
    db: Session,
    *,
    project_id: int,
    trainer_id: int,
    name: str,
    description: Optional[str],
) -> MLModel:
    m = MLModel(
        project_id=project_id,
        trainer_id=trainer_id,
        name=name,
        description=description,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def delete(db: Session, model: MLModel) -> None:
    db.delete(model)
    db.commit()
