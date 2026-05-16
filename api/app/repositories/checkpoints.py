from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.checkpoints import Checkpoint


def get_all(db: Session, project_id: Optional[int] = None) -> List[Checkpoint]:
    q = db.query(Checkpoint)
    if project_id is not None:
        q = q.filter(Checkpoint.project_id == project_id)
    return q.all()


def get_by_id(db: Session, checkpoint_id: int) -> Optional[Checkpoint]:
    return db.query(Checkpoint).filter(Checkpoint.id == checkpoint_id).first()


def create(
    db: Session,
    project_id: Optional[int],
    name: str,
    source: str,
    file_path: str,
    metrics: Optional[Dict[str, Any]],
) -> Checkpoint:
    ckpt = Checkpoint(
        project_id=project_id,
        name=name,
        source=source,
        file_path=file_path,
        metrics=metrics,
    )
    db.add(ckpt)
    db.commit()
    db.refresh(ckpt)
    return ckpt


def update(
    db: Session,
    ckpt: Checkpoint,
    name: Optional[str],
    metrics: Optional[Dict[str, Any]],
) -> Checkpoint:
    if name is not None:
        ckpt.name = name
    if metrics is not None:
        ckpt.metrics = metrics
    db.commit()
    db.refresh(ckpt)
    return ckpt


def delete(db: Session, ckpt: Checkpoint) -> None:
    db.delete(ckpt)
    db.commit()
