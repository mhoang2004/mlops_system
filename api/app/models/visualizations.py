from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, Text, Float
from sqlalchemy.sql import func
from ..database import Base

VISUALIZATION_STATUSES = {"PENDING", "RUNNING", "COMPLETED", "FAILED"}


class Visualization(Base):
    __tablename__ = "visualizations"

    id            = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.id",    ondelete="CASCADE"),   nullable=False)
    ml_model_id   = Column(Integer, ForeignKey("ml_models.id",   ondelete="RESTRICT"),  nullable=False)
    checkpoint_id = Column(Integer, ForeignKey("checkpoints.id", ondelete="RESTRICT"),  nullable=False)
    name          = Column(String(255), nullable=False)
    server_id     = Column(String(100), nullable=False)
    confidence    = Column(Float, nullable=False, default=0.5)

    status         = Column(String(20),  nullable=False, default="PENDING")
    celery_task_id = Column(String(255), nullable=True)

    # MinIO keys for uploaded input images
    input_image_keys = Column(JSON, nullable=True)

    # Per-image results: [{filename, output_filename, output_key, detections: [...]}]
    results       = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    started_at  = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())
