from typing import Any, List, Optional

from sqlalchemy.orm import Session

from ..models.projects import Project


def get_all(db: Session) -> List[Project]:
    return db.query(Project).all()


def get_by_id(db: Session, project_id: int) -> Optional[Project]:
    return db.query(Project).filter(Project.id == project_id).first()


def create(db: Session, name: str, labels: Any, description: Optional[str] = None) -> Project:
    project = Project(name=name, labels=labels, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update(
    db: Session,
    project: Project,
    name: Optional[str],
    labels: Optional[Any],
    description: Optional[str] = None,
) -> Project:
    if name is not None:
        project.name = name
    if labels is not None:
        project.labels = labels
    if description is not None:
        project.description = description
    db.commit()
    db.refresh(project)
    return project


def delete(db: Session, project: Project) -> None:
    db.delete(project)
    db.commit()
