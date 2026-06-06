# =============================================================================
# Training Worker — CPU build
#
# Use this when you don't have an NVIDIA GPU or the NVIDIA Container Runtime.
# Training will run on CPU (slower, but works anywhere).
#
# docker compose --profile cpu up worker-cpu
# =============================================================================
FROM python:3.9-slim

# System deps
# libgomp1 : OpenMP required by PyTorch CPU kernels
# curl     : healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch CPU wheels first (large layer, cached separately)
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        torch==2.4.0+cpu \
        torchvision==0.19.0+cpu \
        --index-url https://download.pytorch.org/whl/cpu

# Install remaining shared deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application source
COPY . .

# Python module resolution:
#   /app          → tasks, celery_app, registry, context/, storage/, sampling/
#   /app/trainers → allows `from base_trainer import ...` inside yolo_trainer.py
ENV PYTHONPATH="/app:/app/trainers"

# Working directory for downloaded dataset images / checkpoints
ENV EXPERIMENT_WORKDIR="/workspace/experiments"
RUN mkdir -p /workspace/experiments

# Non-root user
RUN useradd -m -u 1001 worker \
    && chown -R worker:worker /app /workspace
USER worker

# Healthcheck — ping the worker process itself
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD celery -A celery_app inspect ping \
        -d "celery@$$HOSTNAME" --timeout 5 > /dev/null 2>&1 || exit 1

# --concurrency=1  : one training job at a time (CPU memory)
# --without-gossip : reduces Redis noise in single-worker setups
CMD ["celery", "-A", "celery_app", "worker", \
     "--loglevel=info", \
     "--concurrency=1", \
     "-Q", "celery", \
     "--without-gossip", \
     "--without-mingle"]
