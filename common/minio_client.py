import os
from minio import Minio
from minio.error import S3Error

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE = os.getenv("MINIO_SECURE", "0") in ("1", "true", "True")

_client = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _client


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
