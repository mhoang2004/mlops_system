from typing import Any, List, Optional

from sqlalchemy.orm import Session

from ..models.projects import Project


def get_all(db: Session) -> List[Project]:
    return db.query(Project).all()


def get_by_id(db: Session, project_id: int) -> Optional[Project]:
    return db.query(Project).filter(Project.id == project_id).first()


def create(db: Session, name: str, labels: Any) -> Project:
    project = Project(name=name, labels=labels)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
