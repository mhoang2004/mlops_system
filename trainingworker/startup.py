"""
Container startup: wait for API → register trainers → exec Celery.
Replaces entrypoint.sh (avoids Windows CRLF issues with shell scripts).

Usage (from Dockerfile CMD or docker-compose command):
    python /app/startup.py celery -A celery_app worker ...
"""
from __future__ import annotations

import logging
import os
import sys
import time

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("startup")

API_URL = os.getenv("API_INTERNAL_URL", "http://api:8000")


def _wait_for_api(timeout: int = 120) -> None:
    log.info("[startup] Waiting for API at %s ...", API_URL)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{API_URL}/docs", timeout=3)
            if r.status_code < 500:
                log.info("[startup] API is ready.")
                return
        except Exception:
            pass
        log.info("[startup] Not ready, retry in 3s...")
        time.sleep(3)
    log.warning("[startup] API did not respond in %ds — proceeding anyway.", timeout)


def _register_self_as_server() -> None:
    name = os.getenv("WORKER_NAME", "local-worker")
    host = os.getenv("WORKER_HOST", "localhost")
    nvidia_devices = os.getenv("NVIDIA_VISIBLE_DEVICES", "void")
    is_gpu = nvidia_devices not in ("void", "", "none", "NULL")

    payload = {
        "name": name,
        "host": host,
        "server_type": "gpu" if is_gpu else "cpu",
        "gpu_count": 0 if not is_gpu else 1,
    }

    log.info("[startup] Registering server: name=%s host=%s type=%s", name, host, payload["server_type"])

    try:
        r = requests.post(f"{API_URL}/servers/", json=payload, timeout=10)
        log.info("[startup] POST /servers/ → %d %s", r.status_code, r.text[:200])
        if r.status_code == 201:
            log.info("[startup] Registered self as server '%s' (id=%s).", name, r.json().get("id"))
        elif r.status_code == 409:
            log.info("[startup] Server '%s' already exists, updating...", name)
            list_r = requests.get(f"{API_URL}/servers/", timeout=10)
            log.info("[startup] GET /servers/ → %d", list_r.status_code)
            existing = next((s for s in list_r.json() if s["name"] == name), None)
            if existing:
                patch_r = requests.patch(f"{API_URL}/servers/{existing['id']}", json=payload, timeout=10)
                log.info("[startup] PATCH /servers/%d → %d", existing["id"], patch_r.status_code)
                log.info("[startup] Updated server registration for '%s'.", name)
            else:
                log.warning("[startup] 409 but server '%s' not found in list.", name)
        else:
            log.warning("[startup] Server self-registration returned %d: %s", r.status_code, r.text[:500])
    except Exception as exc:
        log.exception("[startup] Server self-registration failed: %s", exc)


def main() -> None:
    _wait_for_api()

    log.info("[startup] Registering trainers...")
    try:
        from registry import discover_and_register
        discover_and_register()
        log.info("[startup] Trainer registration done.")
    except Exception as exc:
        log.error("[startup] Trainer registration failed: %s", exc)

    log.info("[startup] Registering self as server...")
    _register_self_as_server()

    # Hand off to the Celery worker (or any command passed via argv)
    if len(sys.argv) > 1:
        log.info("[startup] Exec: %s", " ".join(sys.argv[1:]))
        os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
