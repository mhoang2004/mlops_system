from typing import Optional
from sqlalchemy.orm import Session

from ..models.trainers import Trainer


def get_all(db: Session) -> list[Trainer]:
    return db.query(Trainer).order_by(Trainer.key).all()


def get_by_id(db: Session, trainer_id: int) -> Optional[Trainer]:
    return db.query(Trainer).filter(Trainer.id == trainer_id).first()


def get_by_key(db: Session, key: str) -> Optional[Trainer]:
    return db.query(Trainer).filter(Trainer.key == key).first()


def upsert(
    db: Session,
    *,
    key: str,
    name: str,
    description: Optional[str],
    train_params_schema: dict,
    infer_params_schema: Optional[dict],
) -> Trainer:
    trainer = get_by_key(db, key)
    if trainer is None:
        trainer = Trainer(key=key)
        db.add(trainer)
    trainer.name                = name
    trainer.description         = description
    trainer.train_params_schema = train_params_schema
    trainer.infer_params_schema = infer_params_schema
    trainer.is_active           = True
    db.commit()
    db.refresh(trainer)
    return trainer


def set_active(db: Session, trainer: Trainer, active: bool) -> Trainer:
    trainer.is_active = active
    db.commit()
    db.refresh(trainer)
    return trainer
