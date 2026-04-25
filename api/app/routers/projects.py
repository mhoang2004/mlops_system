from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from ..database import get_db
from ..models import projects as models
from pydantic import BaseModel

router = APIRouter(prefix="/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str
    labels: List[Dict[str, Any]] # Nhãn dạng JSON giống CVAT

@router.post("/")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = models.Project(name=project.name, labels=project.labels)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/")
def get_all_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).all()

@router.get("/{project_id}")
def get_project_details(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project