from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import trainers as service

router = APIRouter(prefix="/trainers", tags=["trainers"])


class RegisterTrainerRequest(BaseModel):
    key:                 str
    name:                str
    description:         Optional[str] = None
    train_params_schema: dict[str, Any]
    infer_params_schema: Optional[dict[str, Any]] = None


@router.post("/register", status_code=200)
def register_trainer(body: RegisterTrainerRequest, db: Session = Depends(get_db)):
    return service.register_trainer(db, body.model_dump())


@router.get("/")
def list_trainers(db: Session = Depends(get_db)):
    return service.list_trainers(db)


@router.get("/{trainer_id}")
def get_trainer(trainer_id: int, db: Session = Depends(get_db)):
    return service.get_trainer(db, trainer_id)
