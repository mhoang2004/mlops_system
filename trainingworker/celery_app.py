import os
from celery import Celery
from celery.signals import worker_ready, worker_process_init

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
    task_soft_time_limit = int(os.getenv("TASK_SOFT_LIMIT_SEC", 3600 * 12)),
    task_time_limit      = int(os.getenv("TASK_HARD_LIMIT_SEC", 3600 * 13)),
    # Keep Redis connections alive across Tailscale/VPN where idle connections get dropped
    broker_transport_options = {
        "socket_keepalive": True,
        "retry_on_timeout": True,
    },
    redis_socket_keepalive = True,
    broker_connection_retry_on_startup = True,
)


@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """Register all trainer schemas with the API when the worker starts."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        from registry import discover_and_register
        discover_and_register()
    except Exception as exc:
        logger.error("Trainer registration failed on startup: %s", exc)


@worker_process_init.connect
def on_worker_process_init(sender, **kwargs):
    """Populate in-memory registry in each forked worker process."""
    try:
        from registry import load_trainers_local
        load_trainers_local()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Local trainer load failed in worker process: %s", exc)
