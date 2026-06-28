from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import projects as service

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name:        str
    labels:      List[Dict[str, Any]] = []
    description: Optional[str]        = None


class ProjectUpdate(BaseModel):
    name:        Optional[str]               = None
    labels:      Optional[List[Dict[str, Any]]] = None
    description: Optional[str]               = None


@router.post("/", status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    return service.create_project(db, body.name, body.labels, body.description)


@router.get("/")
def list_projects(db: Session = Depends(get_db)):
    return service.list_projects(db)


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    return service.get_project(db, project_id)


@router.patch("/{project_id}")
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db)):
    return service.update_project(db, project_id, body.name, body.labels, body.description)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    service.delete_project(db, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/stats")
def get_project_stats(project_id: int, db: Session = Depends(get_db)):
    """
    Returns aggregated counts for the project dashboard:
    dataset versions (total / labeled / unlabeled),
    checkpoints (total / pretrained / experiment),
    experiments (total / by status).
    """
    return service.get_project_stats(db, project_id)
