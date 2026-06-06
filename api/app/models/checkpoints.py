from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, Text
from sqlalchemy.sql import func

from ..database import Base


class Checkpoint(Base):
    __tablename__ = "checkpoints"
    id            = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    ml_model_id   = Column(Integer, ForeignKey("ml_models.id", ondelete="SET NULL"), nullable=True)
    experiment_id = Column(Integer, nullable=True)
    name          = Column(String(255), nullable=False)
    source        = Column(String(50), default="pretrained", nullable=False)
    file_path     = Column(Text, nullable=False)
    metrics       = Column(JSON)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, server_default=func.now(), onupdate=func.now())
