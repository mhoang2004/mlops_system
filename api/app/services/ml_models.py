from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..repositories import ml_models as repo
from ..repositories import trainers as trainer_repo
from ..repositories import projects as project_repo


def list_models(db: Session, project_id: int) -> list[dict]:
    models = repo.get_all_by_project(db, project_id)
    return [_serialize_with_trainer(db, m) for m in models]


def get_model(db: Session, model_id: int) -> dict:
    m = _get_or_404(db, model_id)
    return _serialize_with_trainer(db, m)


def create_model(db: Session, payload: dict) -> dict:
    project_id = payload["project_id"]
    trainer_id = payload["trainer_id"]

    if not project_repo.get_by_id(db, project_id):
        raise HTTPException(404, f"Project {project_id} not found")
    if not trainer_repo.get_by_id(db, trainer_id):
        raise HTTPException(404, f"Trainer {trainer_id} not found")

    m = repo.create(
        db,
        project_id=project_id,
        trainer_id=trainer_id,
        name=payload["name"],
        description=payload.get("description"),
    )
    return _serialize_with_trainer(db, m)


def delete_model(db: Session, model_id: int) -> None:
    m = _get_or_404(db, model_id)
    repo.delete(db, m)


def _get_or_404(db: Session, model_id: int):
    m = repo.get_by_id(db, model_id)
    if not m:
        raise HTTPException(404, f"MLModel {model_id} not found")
    return m


def _serialize_with_trainer(db: Session, m) -> dict:
    trainer = trainer_repo.get_by_id(db, m.trainer_id) if m.trainer_id else None
    return {
        "id":          m.id,
        "project_id":  m.project_id,
        "trainer_id":  m.trainer_id,
        "name":        m.name,
        "description": m.description,
        "created_at":  m.created_at,
        "updated_at":  m.updated_at,
        "trainer": {
            "id":                  trainer.id,
            "key":                 trainer.key,
            "name":                trainer.name,
            "description":         trainer.description,
            "train_params_schema": trainer.train_params_schema,
            "infer_params_schema": trainer.infer_params_schema,
            "is_active":           trainer.is_active,
        } if trainer else None,
    }
