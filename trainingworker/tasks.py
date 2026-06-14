"""
Celery task: run_experiment
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from celery import Task
from celery.exceptions import SoftTimeLimitExceeded

from celery_app import celery_app
from context import DataContext, CheckpointContext, ProgressReporter
from storage.minio_io import MinioIO
from registry import get_trainer_class

logger = logging.getLogger(__name__)

try:
    import mlflow
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False


@celery_app.task(
    bind=True,
    name="tasks.run_experiment",
    max_retries=0,
    acks_late=True,
)
def run_experiment(self: Task, payload: dict) -> dict:
    """
    payload shape (built by API service):
    {
        "experiment_id":        int,
        "ml_model_id":          int,
        "trainer_key":          str,   # "yolo" | "resnet" | …
        "minio":                { endpoint, bucket, ckpt_bucket, access_key, secret_key, secure },
        "datasets":             { "TRAIN": [...], "VALIDATION": [...], "TEST": [...] },
        "sampling_strategy":    str,
        "pretrained_checkpoint": str | None,
        "classes":              list[str],
        "train_params":         dict,
        "api_callback_url":     str,
    }
    """
    exp_id     = payload["experiment_id"]
    project_id = payload.get("project_id", 0)
    exp_dir    = Path(os.getenv("EXPERIMENT_WORKDIR", "/tmp")) / f"exp_{exp_id}"
    exp_dir.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(level=logging.INFO)
    logger.info("=== Starting experiment %d (trainer=%s) ===", exp_id, payload["trainer_key"])

    minio    = MinioIO(**payload["minio"])
    data_ctx = DataContext(payload, exp_dir, minio)
    ckpt_ctx = CheckpointContext(payload, exp_dir, minio)

    reporter = ProgressReporter(
        experiment_id=exp_id,
        api_base_url=payload["api_callback_url"],
        minio=minio,
        project_id=project_id,
    )

    # ── MLflow setup ──────────────────────────────────────────────────────────
    mlflow_active = False
    if MLFLOW_AVAILABLE:
        try:
            mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000"))
            mlflow.set_experiment(f"project_{project_id}")
            mlflow.start_run(run_name=f"exp_{exp_id}")
            mlflow.log_params({k: str(v)[:250] for k, v in payload["train_params"].items()})
            mlflow.set_tags({
                "trainer_key":   payload["trainer_key"],
                "experiment_id": str(exp_id),
                "project_id":    str(project_id),
            })
            mlflow_active = True
            logger.info("MLflow run started for experiment %d", exp_id)
        except Exception as e:
            logger.warning("MLflow setup failed: %s", e)

    try:
        # ── DOWNLOADING ───────────────────────────────────────────────────────
        reporter._update_status("DOWNLOADING")
        data_ctx.download_all()

        # ── Resolve trainer + build params ────────────────────────────────────
        TrainerCls = get_trainer_class(payload["trainer_key"])
        ParamsCls  = TrainerCls.TRAIN_PARAMS_CLASS
        params = ParamsCls(
            classes=payload["classes"],
            **payload["train_params"],
        )
        params.run_dir.mkdir(parents=True, exist_ok=True)

        # ── RUNNING ───────────────────────────────────────────────────────────
        reporter._update_status("RUNNING")
        trainer = TrainerCls(params, data_ctx, ckpt_ctx, reporter)
        history = trainer.fit()

        if MLFLOW_AVAILABLE and mlflow_active:
            try:
                final = history["val_metrics"][-1] if history["val_metrics"] else {}
                mlflow.log_metrics(final)
                mlflow.set_tag("status", "COMPLETED")
            except Exception as e:
                logger.warning("MLflow final logging failed: %s", e)

        logger.info("Experiment %d completed. History keys: %s", exp_id, list(history.keys()))
        return {"experiment_id": exp_id, "status": "COMPLETED"}

    except SoftTimeLimitExceeded:
        msg = f"Experiment {exp_id} hit the soft time limit and was cancelled."
        logger.warning(msg)
        if MLFLOW_AVAILABLE and mlflow_active:
            try: mlflow.set_tag("status", "CANCELLED")
            except Exception: pass
        reporter.fail(msg)
        raise

    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Experiment %d failed: %s", exp_id, msg)
        if MLFLOW_AVAILABLE and mlflow_active:
            try: mlflow.set_tag("status", "FAILED")
            except Exception: pass
        reporter.fail(msg)
        raise

    finally:
        if MLFLOW_AVAILABLE and mlflow_active:
            try: mlflow.end_run()
            except Exception: pass
