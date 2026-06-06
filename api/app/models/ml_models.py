from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func

from ..database import Base


class MLModel(Base):
    __tablename__ = "ml_models"

    id          = Column(Integer, primary_key=True, index=True)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    trainer_id  = Column(Integer, ForeignKey("trainers.id", ondelete="RESTRICT"), nullable=False)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())
