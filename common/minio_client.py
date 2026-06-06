"""
MinIO client helpers.

Two clients are maintained:
  - Internal  (MINIO_ENDPOINT, default minio:9000)  — used for all server-side ops
  - Public    (MINIO_PUBLIC_ENDPOINT, default localhost:9000) — used ONLY for signing
                presigned URLs that the browser will access directly

Problem & fix for presigned URLs in Docker
------------------------------------------
MinIO's Python SDK does a bucket region discovery request (GET /bucket?location=)
before signing any presigned URL.  The *public* client uses `localhost:9000`, which
is not reachable from inside the Docker container (localhost = the API container).

Fix: we pre-populate the public client's internal region cache (_region_map) using
the *internal* client (which can reach minio:9000 without issues).  Once the region
is cached, no network call is made and the presigned URL is generated using the
public endpoint — so the final URL is `http://localhost:9000/...` which the browser
can resolve.

MinIO always reports "us-east-1" as the bucket region, so the cache entry is
stable and correct.
"""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import PurePosixPath

from minio import Minio
from minio.error import S3Error

MINIO_ENDPOINT        = os.getenv("MINIO_ENDPOINT",        "minio:9000")
MINIO_PUBLIC_ENDPOINT = os.getenv("MINIO_PUBLIC_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY      = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY      = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE          = os.getenv("MINIO_SECURE", "0") in ("1", "true", "True")

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}

_internal_client: Minio | None = None
_public_client:   Minio | None = None


# ── Client factories ──────────────────────────────────────────────────────────

def get_minio_client() -> Minio:
    """Internal client — all server-to-server operations (upload, delete, list)."""
    global _internal_client
    if _internal_client is None:
        _internal_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _internal_client


def _get_public_client() -> Minio:
    """
    Public client — used ONLY for presigned URL generation.
    Never makes operational requests; its region cache is pre-populated by
    _prime_public_region() before any signing call is made.
    """
    global _public_client
    if _public_client is None:
        _public_client = Minio(
            MINIO_PUBLIC_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _public_client


def _prime_public_region(bucket_name: str) -> None:
    """
    Ensure the public client has a cached region for `bucket_name` so it never
    needs to make a network call to MINIO_PUBLIC_ENDPOINT (which is unreachable
    from inside Docker).

    Strategy:
      1. If already cached — nothing to do.
      2. Try the internal client's cache first (free, no network).
      3. Fall back to asking the internal client (reaches minio:9000 fine).
      4. If all else fails, default to "us-east-1" (MinIO's standard region).
    """
    public = _get_public_client()

    # Already cached — nothing to do
    if bucket_name in public._region_map:
        return

    region = "us-east-1"  # safe default for MinIO

    internal = get_minio_client()
    if bucket_name in internal._region_map:
        # Free: already discovered by a previous internal operation
        region = internal._region_map[bucket_name]
    else:
        # Ask the internal client (can reach minio:9000)
        try:
            region = internal._get_region(bucket_name) or "us-east-1"
        except Exception:
            pass  # bucket might not exist yet; default is fine

    public._region_map[bucket_name] = region


# ── Core helpers ──────────────────────────────────────────────────────────────

def ensure_bucket(bucket_name: str) -> None:
    client = get_minio_client()
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
    except S3Error:
        raise


def upload_file(
    bucket_name: str,
    object_name: str,
    file_obj,
    content_type: str = "application/octet-stream",
) -> None:
    client = get_minio_client()
    file_obj.seek(0, 2)
    file_size = file_obj.tell()
    file_obj.seek(0)
    client.put_object(
        bucket_name,
        object_name,
        file_obj,
        length=file_size,
        content_type=content_type,
        part_size=10 * 1024 * 1024,
    )


def get_presigned_url(
    bucket_name: str,
    object_name: str,
    expires_seconds: int = 3600,
) -> str:
    """
    Generate a presigned GET URL pointing at MINIO_PUBLIC_ENDPOINT
    (so the browser can resolve it).

    Region is fetched via the internal client — no direct connection to
    MINIO_PUBLIC_ENDPOINT is made from within the container.
    """
    _prime_public_region(bucket_name)
    return _get_public_client().presigned_get_object(
        bucket_name,
        object_name,
        expires=timedelta(seconds=expires_seconds),
    )


# ── Paginated image listing ───────────────────────────────────────────────────

def list_images_paginated(
    bucket_name: str,
    prefix: str,
    offset: int = 0,
    limit: int = 20,
    presigned_ttl: int = 3600,
) -> dict:
    """
    List image files under `prefix`, paginated, with presigned URLs.

    Returns
    -------
    {
        "items":    [{ filename, key, url, size_bytes }, …],
        "total":    int,
        "offset":   int,
        "limit":    int,
        "has_more": bool,
    }
    """
    client = get_minio_client()

    try:
        all_objects = list(client.list_objects(bucket_name, prefix=prefix, recursive=True))
    except S3Error:
        all_objects = []

    image_objects = [
        obj for obj in all_objects
        if PurePosixPath(obj.object_name).suffix.lower() in _IMAGE_EXTS
    ]
    image_objects.sort(key=lambda o: o.object_name)  # stable pagination

    total      = len(image_objects)
    page_slice = image_objects[offset: offset + limit]

    items = [
        {
            "filename":   PurePosixPath(obj.object_name).name,
            "key":        obj.object_name,
            "url":        get_presigned_url(bucket_name, obj.object_name, presigned_ttl),
            "size_bytes": obj.size,
        }
        for obj in page_slice
    ]

    return {
        "items":    items,
        "total":    total,
        "offset":   offset,
        "limit":    limit,
        "has_more": (offset + limit) < total,
    }
