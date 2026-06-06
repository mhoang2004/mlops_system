import os
from celery import Celery

BROKER_URL  = os.getenv("CELERY_BROKER_URL",  "redis://redis:6379/0")
BACKEND_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

celery_app = Celery(
    "mlops_worker",
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=["tasks"],
)

celery_app.conf.update(
    task_serializer    = "json",
    result_serializer  = "json",
    accept_content     = ["json"],
    timezone           = "UTC",
    enable_utc         = True,
    task_track_started = True,
    # Soft time limit: trainer can clean up; hard limit kills the process
    task_soft_time_limit = int(os.getenv("TASK_SOFT_LIMIT_SEC", 3600 * 12)),
    task_time_limit      = int(os.getenv("TASK_HARD_LIMIT_SEC", 3600 * 13)),
)
