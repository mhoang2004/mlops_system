from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, Text
from sqlalchemy.sql import func
from ..database import Base

EVALUATION_STATUSES = {"PENDING", "RUNNING", "COMPLETED", "FAILED"}


class Evaluation(Base):
    __tablename__ = "evaluations"

    id              = Column(Integer, primary_key=True, index=True)
    project_id      = Column(Integer, ForeignKey("projects.id",     ondelete="CASCADE"),   nullable=False)
    ml_model_id     = Column(Integer, ForeignKey("ml_models.id",    ondelete="RESTRICT"),  nullable=False)
    checkpoint_id   = Column(Integer, ForeignKey("checkpoints.id",  ondelete="RESTRICT"),  nullable=False)
    name            = Column(String(255), nullable=False)
    description     = Column(Text, nullable=True)
    server_id       = Column(String(100), nullable=False)

    status          = Column(String(20),  nullable=False, default="PENDING")
    celery_task_id  = Column(String(255), nullable=True)

    # overall_metrics: aggregated across all evaluated datasets
    # dataset_results: list of {dataset_version_id, name, metrics}
    overall_metrics = Column(JSON, nullable=True)
    dataset_results = Column(JSON, nullable=True)
    error_message   = Column(Text, nullable=True)

    started_at  = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EvaluationDataset(Base):
    __tablename__ = "evaluation_datasets"

    id                 = Column(Integer, primary_key=True, index=True)
    evaluation_id      = Column(Integer, ForeignKey("evaluations.id",      ondelete="CASCADE"), nullable=False)
    dataset_version_id = Column(Integer, ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False)
