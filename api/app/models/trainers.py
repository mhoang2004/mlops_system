from sqlalchemy import Column, Integer, String, Text, Boolean, JSON, DateTime
from sqlalchemy.sql import func

from ..database import Base


class Trainer(Base):
    __tablename__ = "trainers"

    id                  = Column(Integer, primary_key=True, index=True)
    key                 = Column(String(50), unique=True, nullable=False, index=True)
    name                = Column(String(255), nullable=False)
    description         = Column(Text, nullable=True)
    train_params_schema = Column(JSON, nullable=False)
    infer_params_schema = Column(JSON, nullable=True)
    is_active           = Column(Boolean, nullable=False, default=True)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, server_default=func.now(), onupdate=func.now())
