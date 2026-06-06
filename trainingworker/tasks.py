"""
Celery task: run_experiment

Receives a job payload from the API, sets up the three context objects,
resolves the correct trainer, and calls trainer.fit().
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
from registry import resolve

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="tasks.run_experiment",
    max_retries=0,          # training jobs are not idempotent — no auto-retry
    acks_late=True,         # ack only after success/failure (prevents silent loss)
)
def run_experiment(self: Task, payload: dict) -> dict:
    """
    payload shape (built by API service):
    {
        "experiment_id":   int,
        "trainer_type":    str,       # "yolo" | "resnet" | …
        "minio":           { endpoint, bucket, ckpt_bucket, access_key, secret_key, secure },
        "datasets":        { "TRAIN": [...], "VALIDATION": [...], "TEST": [...] },
        "sampling_strategy": str,
        "pretrained_checkpoint": str | None,
        "classes":         list[str],
        "train_params":    dict,
        "api_callback_url": str,
    }
    """
    exp_id   = payload["experiment_id"]
    exp_dir  = Path(os.getenv("EXPERIMENT_WORKDIR", "/tmp")) / f"exp_{exp_id}"
    exp_dir.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(level=logging.INFO)
    logger.info("=== Starting experiment %d (trainer=%s) ===", exp_id, payload["trainer_type"])

    # ── Init shared IO ────────────────────────────────────────────────────────
    minio = MinioIO(**payload["minio"])

    # ── Init context objects ──────────────────────────────────────────────────
    data_ctx   = DataContext(payload, exp_dir, minio)
    ckpt_ctx   = CheckpointContext(payload, exp_dir, minio)

    # Determine project_id from datasets payload (first entry in TRAIN)
    # API embeds it indirectly via storage_path, but we pass it explicitly.
    project_id = payload.get("project_id", 0)

    reporter = ProgressReporter(
        experiment_id=exp_id,
        api_base_url=payload["api_callback_url"],
        minio=minio,
        project_id=project_id,
    )

    try:
        # ── DOWNLOADING ───────────────────────────────────────────────────────
        reporter._update_status("DOWNLOADING")
        data_ctx.download_all()
        # Pretrained checkpoint is lazy-downloaded on first access — no need to
        # call anything here; CheckpointContext handles it in get_pretrained_path().

        # ── Resolve trainer + params ──────────────────────────────────────────
        TrainerCls, ParamsCls = resolve(payload["trainer_type"])
        params = ParamsCls(
            classes=payload["classes"],
            **payload["train_params"],
        )
        params.run_dir.mkdir(parents=True, exist_ok=True)

        # ── RUNNING ───────────────────────────────────────────────────────────
        reporter._update_status("RUNNING")
        trainer = TrainerCls(params, data_ctx, ckpt_ctx, reporter)
        history = trainer.fit()

        logger.info("Experiment %d completed. History keys: %s", exp_id, list(history.keys()))
        return {"experiment_id": exp_id, "status": "COMPLETED"}

    except SoftTimeLimitExceeded:
        msg = f"Experiment {exp_id} hit the soft time limit and was cancelled."
        logger.warning(msg)
        reporter.fail(msg)
        raise

    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.exception("Experiment %d failed: %s", exp_id, msg)
        reporter.fail(msg)
        raise
