#!/bin/bash
# Runs before Celery starts:
#   1. Wait for the API to be reachable
#   2. Register all trainers (upsert — safe to run multiple times)
#   3. exec into CMD (celery worker)
set -e

API_URL="${API_INTERNAL_URL:-http://api:8000}"

echo "[entrypoint] Waiting for API at ${API_URL} ..."
until curl -sf "${API_URL}/docs" > /dev/null 2>&1; do
  echo "[entrypoint] API not ready, retrying in 3s..."
  sleep 3
done
echo "[entrypoint] API is up."

echo "[entrypoint] Registering trainers..."
python /app/register_trainers.py
echo "[entrypoint] Trainer registration done."

exec "$@"
