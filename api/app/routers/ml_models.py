from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import ml_models as service

router = APIRouter(prefix="/ml-models", tags=["ml-models"])


class CreateMLModelRequest(BaseModel):
    project_id:  int
    trainer_id:  int
    name:        str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


@router.post("/", status_code=201)
def create_model(body: CreateMLModelRequest, db: Session = Depends(get_db)):
    return service.create_model(db, body.model_dump())


@router.get("/")
def list_models(project_id: int, db: Session = Depends(get_db)):
    return service.list_models(db, project_id)


@router.get("/{model_id}")
def get_model(model_id: int, db: Session = Depends(get_db)):
    return service.get_model(db, model_id)


@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: int, db: Session = Depends(get_db)):
    service.delete_model(db, model_id)
    return Response(status_code=204)
