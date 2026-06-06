"""
Trainer registry — map trainer_type string → (TrainerClass, ParamsClass).

To add a new trainer:
    1. Implement YourTrainer(BaseTrainer) and YourTrainParams(BaseTrainParams).
    2. Add one line here: register("your_key", YourTrainer, YourTrainParams)
"""
from __future__ import annotations

from typing import Type

from trainers.base_trainer import BaseTrainer, BaseTrainParams

_REGISTRY: dict[str, tuple[Type[BaseTrainer], Type[BaseTrainParams]]] = {}


def register(
    key: str,
    trainer_cls: Type[BaseTrainer],
    params_cls: Type[BaseTrainParams],
) -> None:
    _REGISTRY[key] = (trainer_cls, params_cls)


def resolve(trainer_type: str) -> tuple[Type[BaseTrainer], Type[BaseTrainParams]]:
    entry = _REGISTRY.get(trainer_type)
    if entry is None:
        available = list(_REGISTRY.keys())
        raise KeyError(
            f"Unknown trainer_type '{trainer_type}'. Available: {available}"
        )
    return entry


# ── Register built-in trainers ────────────────────────────────────────────────

from trainers.yolo_trainer import YoloTrainer, YoloTrainParams  # noqa: E402

register("yolo", YoloTrainer, YoloTrainParams)
