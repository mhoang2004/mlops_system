from typing import Any, List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.projects import Project
from ..repositories import projects as repo


def list_projects(db: Session) -> List[Project]:
    return repo.get_all(db)


def get_project(db: Session, project_id: int) -> Project:
    project = repo.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def create_project(db: Session, name: str, labels: Any) -> Project:
    return repo.create(db, name, labels)
