from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..repositories import trainers as repo


def list_trainers(db: Session) -> list[dict]:
    return [_serialize(t) for t in repo.get_all(db)]


def get_trainer(db: Session, trainer_id: int) -> dict:
    t = repo.get_by_id(db, trainer_id)
    if not t:
        raise HTTPException(404, f"Trainer {trainer_id} not found")
    return _serialize(t)


def register_trainer(db: Session, payload: dict) -> dict:
    """Upsert trainer by key. Called by training worker on startup."""
    t = repo.upsert(
        db,
        key=payload["key"],
        name=payload["name"],
        description=payload.get("description"),
        train_params_schema=payload["train_params_schema"],
        infer_params_schema=payload.get("infer_params_schema"),
    )
    return _serialize(t)


def _serialize(t) -> dict:
    return {
        "id":                  t.id,
        "key":                 t.key,
        "name":                t.name,
        "description":         t.description,
        "train_params_schema": t.train_params_schema,
        "infer_params_schema": t.infer_params_schema,
        "is_active":           t.is_active,
        "created_at":          t.created_at,
        "updated_at":          t.updated_at,
    }
