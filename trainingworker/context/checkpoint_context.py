"""
CheckpointContext — hides pretrained checkpoint download from AI Engineers.

What an engineer sees:
    if self.checkpoint.has_pretrained():
        path = self.checkpoint.get_pretrained_path()
        model.load_state_dict(torch.load(path))
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from storage.minio_io import MinioIO

logger = logging.getLogger(__name__)


class CheckpointContext:
    """
    Injected into BaseTrainer as ``self.checkpoint``.
    Downloads the pretrained checkpoint on first access and caches it locally.
    """

    def __init__(
        self,
        payload: dict,
        experiment_dir: Path,
        minio: MinioIO,
    ) -> None:
        self._minio_key: Optional[str] = payload.get("pretrained_checkpoint")
        self._local_path: Optional[Path] = None
        self._exp_dir    = experiment_dir
        self._minio      = minio

    # ── Public API ────────────────────────────────────────────────────────────

    def has_pretrained(self) -> bool:
        """True if a pretrained checkpoint was supplied by the user."""
        return self._minio_key is not None

    def get_pretrained_path(self) -> Path:
        """
        Return the local path of the pretrained checkpoint.
        Downloads it from MinIO on first call, then returns the cached path.

        Raises
        ------
        RuntimeError if no pretrained checkpoint was provided.
        """
        if not self.has_pretrained():
            raise RuntimeError(
                "No pretrained checkpoint provided for this experiment. "
                "Check has_pretrained() before calling get_pretrained_path()."
            )

        if self._local_path is None:
            dest = self._exp_dir / "pretrained" / Path(self._minio_key).name  # type: ignore[arg-type]
            logger.info("Downloading pretrained checkpoint: %s", self._minio_key)
            self._minio.download_file(
                self._minio_key,   # type: ignore[arg-type]
                dest,
                bucket=self._minio.ckpt_bucket,
            )
            self._local_path = dest
            logger.info("Pretrained checkpoint ready at: %s", dest)

        return self._local_path
