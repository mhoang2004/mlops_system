from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, Text, Float
from sqlalchemy.sql import func
from ..database import Base


# Allowed values — enforced in service layer, stored as VARCHAR
EXPERIMENT_STATUSES = {"PENDING", "DOWNLOADING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"}
DATASET_ROLES       = {"TRAIN", "VALIDATION", "TEST"}
SAMPLING_STRATEGIES = {"CONCAT", "WEIGHTED", "ROUND_ROBIN"}


class Experiment(Base):
    __tablename__ = "experiments"

    id                  = Column(Integer, primary_key=True, index=True)
    project_id          = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"),      nullable=False)
    ml_model_id         = Column(Integer, ForeignKey("ml_models.id", ondelete="RESTRICT"),    nullable=False)
    name                = Column(String(255), nullable=False)
    description         = Column(Text, nullable=True)
    server_id           = Column(String(100), nullable=False)
    pretrained_ckpt_id  = Column(Integer, ForeignKey("checkpoints.id", ondelete="SET NULL"), nullable=True)
    sampling_strategy   = Column(String(20), nullable=False, default="CONCAT")
    train_params        = Column(JSON, nullable=False)

    # Runtime
    status              = Column(String(20), nullable=False, default="PENDING")
    celery_task_id      = Column(String(255), nullable=True)
    mlflow_run_id       = Column(String(64),  nullable=True)

    # Results
    metrics             = Column(JSON, nullable=True)
    output_ckpt_id      = Column(Integer, ForeignKey("checkpoints.id", ondelete="SET NULL"), nullable=True)
    error_message       = Column(Text, nullable=True)

    started_at          = Column(DateTime, nullable=True)
    finished_at         = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ExperimentDataset(Base):
    __tablename__ = "experiment_datasets"

    id                  = Column(Integer, primary_key=True, index=True)
    experiment_id       = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"),      nullable=False)
    dataset_version_id  = Column(Integer, ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False)
    role                = Column(String(20), nullable=False)   # TRAIN | VALIDATION | TEST
    sampling_weight     = Column(Float, nullable=False, default=1.0)
