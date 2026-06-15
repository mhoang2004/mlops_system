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


def _register_self_as_server() -> int | None:
    """Register this worker as a server. Returns the server DB ID (for queue routing)."""
    name = os.getenv("WORKER_NAME", "local-worker")
    host = os.getenv("WORKER_HOST", "localhost")
    nvidia_devices = os.getenv("NVIDIA_VISIBLE_DEVICES", "void")
    is_gpu = nvidia_devices not in ("void", "", "none", "NULL")

    payload: dict = {
        "name":        name,
        "host":        host,
        "server_type": "gpu" if is_gpu else "cpu",
        "gpu_count":   0 if not is_gpu else int(os.getenv("GPU_COUNT", "1")),
    }

    if is_gpu:
        gpu_type = os.getenv("GPU_TYPE")
        if gpu_type:
            payload["gpu_type"] = gpu_type

        node_exporter_port = os.getenv("NODE_EXPORTER_PORT")
        if node_exporter_port:
            payload["node_exporter_port"] = int(node_exporter_port)

        cadvisor_port = os.getenv("CADVISOR_PORT")
        if cadvisor_port:
            payload["cadvisor_port"] = int(cadvisor_port)

        dcgm_port = os.getenv("DCGM_EXPORTER_PORT")
        if dcgm_port:
            payload["dcgm_exporter_port"] = int(dcgm_port)
            log.info("[startup] DCGM exporter configured at port %s", dcgm_port)

    log.info("[startup] Registering server: name=%s host=%s type=%s", name, host, payload["server_type"])

    try:
        r = requests.post(f"{API_URL}/servers/", json=payload, timeout=10)
        log.info("[startup] POST /servers/ → %d %s", r.status_code, r.text[:200])
        if r.status_code == 201:
            server_id = r.json().get("id")
            log.info("[startup] Registered self as server '%s' (id=%s).", name, server_id)
            return server_id
        elif r.status_code == 409:
            log.info("[startup] Server '%s' already exists, updating...", name)
            list_r = requests.get(f"{API_URL}/servers/", timeout=10)
            existing = next((s for s in list_r.json() if s["name"] == name), None)
            if existing:
                requests.patch(f"{API_URL}/servers/{existing['id']}", json=payload, timeout=10)
                log.info("[startup] Updated server registration for '%s' (id=%s).", name, existing["id"])
                return existing["id"]
            else:
                log.warning("[startup] 409 but server '%s' not found in list.", name)
        else:
            log.warning("[startup] Server self-registration returned %d: %s", r.status_code, r.text[:500])
    except Exception as exc:
        log.exception("[startup] Server self-registration failed: %s", exc)
    return None


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
    server_id = _register_self_as_server()

    # Hand off to the Celery worker (or any command passed via argv)
    if len(sys.argv) > 1:
        celery_cmd = list(sys.argv[1:])
        if server_id is not None:
            dedicated_queue = f"server_{server_id}"
            if "-Q" in celery_cmd:
                q_idx = celery_cmd.index("-Q") + 1
                celery_cmd[q_idx] = f"{celery_cmd[q_idx]},{dedicated_queue}"
            else:
                celery_cmd += ["-Q", f"celery,{dedicated_queue}"]
            log.info("[startup] Worker queues: celery + %s", dedicated_queue)
        else:
            log.warning(
                "[startup] ⚠️  Server self-registration FAILED — worker will only listen to "
                "queue 'celery'. Tasks routed to server_{id} queues will NOT be consumed! "
                "Check WORKER_NAME, WORKER_HOST, API_INTERNAL_URL env vars."
            )
        log.info("[startup] Exec: %s", " ".join(celery_cmd))
        os.execvp(celery_cmd[0], celery_cmd)


if __name__ == "__main__":
    main()
