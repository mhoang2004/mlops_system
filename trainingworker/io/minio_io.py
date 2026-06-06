"""
MinioIO — thin wrapper over the Minio SDK.

Responsibilities:
  - Download a single object to a local path.
  - Download all objects under a prefix in parallel.
  - Upload a local file to MinIO.

Trainers and context objects use this class; they never touch the Minio SDK directly.
"""
from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)


class MinioIO:
    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        ckpt_bucket: str = "checkpoints",
        secure: bool = False,
    ) -> None:
        self.bucket      = bucket
        self.ckpt_bucket = ckpt_bucket
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)

    # ── Single file ───────────────────────────────────────────────────────────

    def download_file(
        self,
        minio_key: str,
        local_path: Path,
        *,
        bucket: Optional[str] = None,
    ) -> Path:
        """Download one object. Returns local_path. No-op if already exists."""
        if local_path.exists():
            return local_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        b = bucket or self.bucket
        try:
            self._client.fget_object(b, minio_key, str(local_path))
            logger.debug("Downloaded %s → %s", minio_key, local_path)
        except S3Error as exc:
            logger.error("Failed to download %s: %s", minio_key, exc)
            raise
        return local_path

    def upload_file(
        self,
        local_path: Path,
        minio_key: str,
        *,
        bucket: Optional[str] = None,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload local file to MinIO. Returns the minio_key."""
        b = bucket or self.ckpt_bucket
        size = local_path.stat().st_size
        with open(local_path, "rb") as f:
            self._client.put_object(b, minio_key, f, length=size, content_type=content_type)
        logger.info("Uploaded %s → %s/%s", local_path, b, minio_key)
        return minio_key

    # ── Prefix (directory) ────────────────────────────────────────────────────

    def list_prefix(self, prefix: str, *, bucket: Optional[str] = None) -> list[str]:
        """Return all object keys under the given prefix."""
        b = bucket or self.bucket
        objects = self._client.list_objects(b, prefix=prefix, recursive=True)
        return [obj.object_name for obj in objects]

    def download_prefix(
        self,
        prefix: str,
        local_dir: Path,
        *,
        bucket: Optional[str] = None,
        workers: int = 8,
    ) -> list[Path]:
        """
        Download all objects under `prefix` into `local_dir`, preserving
        filename (not the full prefix path).

        Returns list of downloaded local paths.
        """
        keys = self.list_prefix(prefix, bucket=bucket)
        if not keys:
            logger.warning("No objects found under prefix: %s", prefix)
            return []

        local_dir.mkdir(parents=True, exist_ok=True)
        results: list[Path] = []

        def _download(key: str) -> Path:
            filename   = Path(key).name
            local_path = local_dir / filename
            return self.download_file(key, local_path, bucket=bucket)

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_download, k): k for k in keys}
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as exc:
                    logger.error("Failed to download %s: %s", futures[future], exc)

        logger.info("Downloaded %d files from prefix '%s' → %s", len(results), prefix, local_dir)
        return results

    def object_exists(self, minio_key: str, *, bucket: Optional[str] = None) -> bool:
        b = bucket or self.bucket
        try:
            self._client.stat_object(b, minio_key)
            return True
        except S3Error:
            return False
