"""
Standalone: discover and register trainers with the API. Idempotent.
Waits for the API before registering (useful when run manually).

    docker exec mlops-training-worker python /app/register_trainers.py
"""
from __future__ import annotations

import logging
import os
import time

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("register_trainers")

API_URL = os.getenv("API_INTERNAL_URL", "http://api:8000")


def _wait_for_api(timeout: int = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{API_URL}/docs", timeout=3)
            if r.status_code < 500:
                return
        except Exception:
            pass
        log.info("Waiting for API at %s ...", API_URL)
        time.sleep(3)


if __name__ == "__main__":
    _wait_for_api()
    from registry import discover_and_register
    discover_and_register()
