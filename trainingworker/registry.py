"""
Trainer auto-discovery and registration with the API.
Called once at worker startup via the worker_ready Celery signal.

Discovery: scans trainers/*_trainer.py, finds BaseTrainer subclasses
that define TRAINER_KEY and TRAIN_PARAMS_CLASS, then POSTs their
Pydantic JSON schema to POST /trainers/register (upsert by key).
"""
from __future__ import annotations

import importlib
import inspect
import logging
import os
from pathlib import Path
from typing import Type

import requests

logger = logging.getLogger(__name__)

_API_URL = os.getenv("API_INTERNAL_URL", "http://api:8000")

# In-memory map trainer_key → TrainerClass (used by Celery tasks)
_REGISTRY: dict[str, type] = {}


def get_trainer_class(key: str) -> type:
    cls = _REGISTRY.get(key)
    if cls is None:
        raise KeyError(f"Unknown trainer key '{key}'. Known: {list(_REGISTRY.keys())}")
    return cls


def _scan_trainers() -> list:
    """Scan trainers/ directory and return list of discovered trainer classes."""
    trainers_dir = Path(__file__).parent / "trainers"
    from base_trainer import BaseTrainer
    found = []
    for file in sorted(trainers_dir.glob("*_trainer.py")):
        if file.stem == "base_trainer":
            continue
        module_name = f"trainers.{file.stem}"
        try:
            mod = importlib.import_module(module_name)
        except Exception as exc:
            logger.warning("Skipping %s — import failed: %s", module_name, exc)
            continue
        for _, cls in inspect.getmembers(mod, inspect.isclass):
            if (
                issubclass(cls, BaseTrainer)
                and cls is not BaseTrainer
                and hasattr(cls, "TRAINER_KEY")
                and hasattr(cls, "TRAIN_PARAMS_CLASS")
            ):
                found.append(cls)
    return found


def load_trainers_local() -> None:
    """Populate in-memory _REGISTRY without calling the API. Safe to call in forked workers."""
    for cls in _scan_trainers():
        key = cls.TRAINER_KEY
        _REGISTRY[key] = cls
        logger.info("Loaded trainer locally: key=%s", key)


def discover_and_register() -> None:
    """Auto-discover trainers, populate _REGISTRY, and register schemas with the API."""
    for cls in _scan_trainers():
        _register(cls)


def _register(trainer_cls: Type) -> None:
    key              = trainer_cls.TRAINER_KEY
    name             = getattr(trainer_cls, "TRAINER_NAME", "") or key.upper()
    description      = (trainer_cls.__doc__ or "").strip()
    train_params_cls = trainer_cls.TRAIN_PARAMS_CLASS
    infer_params_cls = getattr(trainer_cls, "INFER_PARAMS_CLASS", None)

    train_schema = train_params_cls.model_json_schema()
    infer_schema = infer_params_cls.model_json_schema() if infer_params_cls else None

    payload = {
        "key":                 key,
        "name":                name,
        "description":         description,
        "train_params_schema": train_schema,
        "infer_params_schema": infer_schema,
    }

    try:
        resp = requests.post(
            f"{_API_URL}/trainers/register",
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        _REGISTRY[key] = trainer_cls
        logger.info("Registered trainer: key=%s name=%s", key, name)
    except Exception as exc:
        logger.error("Failed to register trainer '%s': %s", key, exc)
