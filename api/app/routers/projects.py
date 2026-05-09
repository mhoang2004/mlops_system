from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import projects as service

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    labels: List[Dict[str, Any]]


@router.post("/")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    return service.create_project(db, body.name, body.labels)


@router.get("/")
def list_projects(db: Session = Depends(get_db)):
    return service.list_projects(db)


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    return service.get_project(db, project_id)
