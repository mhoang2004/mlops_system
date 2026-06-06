"""
ProgressReporter — hides API callbacks and MinIO checkpoint upload from AI Engineers.

What an engineer sees:
    # in on_epoch_end():
    self.reporter.update(epoch, total_epochs, metrics)

    # in on_train_end():
    self.reporter.complete(metrics, checkpoint_local_path)

    # in error handler:
    self.reporter.fail("CUDA OOM at epoch 12")
"""
from __future__ import annotations

import logging
from pathlib import Path

import requests

from storage.minio_io import MinioIO

logger = logging.getLogger(__name__)


class ProgressReporter:
    """
    Injected into BaseTrainer as ``self.reporter``.
    """

    def __init__(
        self,
        experiment_id: int,
        api_base_url: str,
        minio: MinioIO,
        project_id: int,
    ) -> None:
        self._exp_id     = experiment_id
        self._api_base   = api_base_url.rstrip("/")
        self._minio      = minio
        self._project_id = project_id

    # ── Public API ────────────────────────────────────────────────────────────

    def update(
        self,
        epoch: int,
        total_epochs: int,
        metrics: dict,
    ) -> None:
        """Send per-epoch progress to the API."""
        self._patch("progress", {
            "status":        "RUNNING",
            "current_epoch": epoch,
            "total_epochs":  total_epochs,
            "metrics":       metrics,
        })

    def complete(
        self,
        metrics: dict,
        checkpoint_local_path: str | Path,
    ) -> None:
        """
        Upload the best checkpoint to MinIO, then notify the API.
        Called by BaseTrainer at the end of training.
        """
        local = Path(checkpoint_local_path)
        minio_key = f"checkpoints/project_{self._project_id}/exp_{self._exp_id}/{local.name}"

        logger.info("Uploading output checkpoint: %s → %s", local, minio_key)
        self._minio.upload_file(local, minio_key)

        self._patch("complete", {
            "output_checkpoint_key": minio_key,
            "metrics":               metrics,
        })

    def fail(self, error_message: str) -> None:
        """Notify the API that the experiment failed."""
        self._patch("fail", {"error_message": error_message})

    # ── Internal ──────────────────────────────────────────────────────────────

    def _patch(self, endpoint: str, body: dict) -> None:
        url = f"{self._api_base}/experiments/{self._exp_id}/{endpoint}"
        try:
            resp = requests.patch(url, json=body, timeout=10)
            resp.raise_for_status()
        except Exception as exc:
            # Never let a reporter failure crash the training job
            logger.warning("ProgressReporter._patch(%s) failed: %s", endpoint, exc)

    def _update_status(self, status: str) -> None:
        """Used internally by the Celery task (not by AI Engineers)."""
        self._patch("progress", {"status": status})
