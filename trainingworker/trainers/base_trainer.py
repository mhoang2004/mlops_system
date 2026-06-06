"""
BaseTrainer — generic contract for every ML framework in this platform.

Design goals
------------
* Framework-agnostic: works for detection, classification, segmentation, table, …
* AI Engineers only implement pure training logic.
  Infrastructure concerns (MinIO, Celery, annotations, sampling) are fully
  hidden behind three injected context objects:

      self.data       — DataContext       (dataset access, DataLoader building)
      self.checkpoint — CheckpointContext (pretrained weights download)
      self.reporter   — ProgressReporter  (API callbacks, checkpoint upload)

* Generic over (TP, IP) so subclass trainers are fully typed.
"""
from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Generic, Optional, TypeVar

import torch
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

TP = TypeVar("TP", bound="BaseTrainParams")
IP = TypeVar("IP", bound="BaseInferParams")


# ── Parameter schemas ─────────────────────────────────────────────────────────

class BaseTrainParams(BaseModel):
    """
    Common training parameters.
    Framework trainers extend this with their own fields.
    """
    # Label info
    classes: list[str] = Field(..., min_length=1)

    # Training loop
    epochs:        int   = Field(default=50, ge=1)
    batch_size:    int   = Field(default=16, ge=1)
    learning_rate: float = Field(default=1e-3, gt=0)
    weight_decay:  float = Field(default=1e-4, ge=0)

    # Output
    output_dir:       str = Field(default="./runs/train")
    experiment_name:  str = Field(default="exp")

    # Hardware
    device: str = Field(default="auto")

    @field_validator("device")
    @classmethod
    def _validate_device(cls, v: str) -> str:
        ok = {"auto", "cpu", "cuda", "mps"}
        if v not in ok and not v.startswith("cuda:"):
            raise ValueError(f"device must be one of {ok} or 'cuda:<idx>'")
        return v

    @property
    def num_classes(self) -> int:
        return len(self.classes)

    @property
    def run_dir(self) -> Path:
        return Path(self.output_dir) / self.experiment_name


class BaseInferParams(BaseModel):
    """
    Common inference parameters.
    Framework trainers extend this with their own fields.
    """
    weights_path: str   = Field(..., description="Local path or MinIO key of checkpoint")
    confidence:   float = Field(default=0.5, ge=0.0, le=1.0)
    device:       str   = Field(default="auto")
    img_size:     int   = Field(default=640, ge=32)


# ── Base Trainer ──────────────────────────────────────────────────────────────

class BaseTrainer(ABC, Generic[TP, IP]):
    """
    Abstract base trainer.

    Subclasses MUST implement all @abstractmethod methods.
    Subclasses MAY override the lifecycle hooks (on_epoch_end, on_train_end).

    Parameters injected by the Celery task (not by the engineer):
        data       — DataContext
        checkpoint — CheckpointContext
        reporter   — ProgressReporter
    """

    def __init__(
        self,
        params: TP,
        data: Any,         # DataContext (typed as Any to avoid circular import)
        checkpoint: Any,   # CheckpointContext
        reporter: Any,     # ProgressReporter
    ) -> None:
        self.params:     TP  = params
        self.data:       Any = data
        self.checkpoint: Any = checkpoint
        self.reporter:   Any = reporter
        self.device:     torch.device = self._resolve_device(params.device)

        # Set by fit() before any abstract method is called
        self.model:      Optional[torch.nn.Module]       = None
        self.optimizer:  Optional[torch.optim.Optimizer] = None
        self.scheduler:  Optional[Any]                   = None
        self.train_loader: Optional[Any]                 = None
        self.val_loader:   Optional[Any]                 = None

        params.run_dir.mkdir(parents=True, exist_ok=True)

    # ── Public entry point ────────────────────────────────────────────────────

    def fit(self) -> dict[str, list]:
        """
        Run the full training pipeline.
        Returns loss/metric history.
        """
        logger.info("=== fit() | trainer=%s | device=%s ===",
                    type(self).__name__, self.device)

        self.train_loader, self.val_loader = self.load_dataset()
        self.model    = self.load_model().to(self.device)
        self.optimizer, self.scheduler = self.configure_optimizer()

        history: dict[str, list] = {"train_loss": [], "val_metrics": []}

        for epoch in range(self.params.epochs):
            train_loss  = self._run_epoch(epoch)
            val_metrics = self.evaluate()

            history["train_loss"].append(train_loss)
            history["val_metrics"].append(val_metrics)

            self.reporter.update(epoch + 1, self.params.epochs, {
                "train_loss": train_loss, **val_metrics
            })
            self.on_epoch_end(epoch, train_loss, val_metrics)

            logger.info("Epoch [%d/%d] loss=%.4f val=%s",
                        epoch + 1, self.params.epochs, train_loss, val_metrics)

        best_path = self.save_checkpoint()
        self._save_metadata(best_path)
        self.reporter.complete(
            metrics=history["val_metrics"][-1] if history["val_metrics"] else {},
            checkpoint_local_path=best_path,
        )
        self.on_train_end(best_path)
        return history

    # ── Optional lifecycle hooks ──────────────────────────────────────────────

    def on_epoch_end(self, epoch: int, train_loss: float, val_metrics: dict) -> None:
        """Override to add early stopping, LR scheduling, checkpoint saving per epoch, …"""

    def on_train_end(self, checkpoint_path: str) -> None:
        """Override to push artifacts, send notifications, …"""

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _run_epoch(self, epoch: int) -> float:
        assert self.model is not None and self.train_loader is not None
        self.model.train()
        total = 0.0
        for batch in self.train_loader:
            total += self.train_step(batch)
        return total / max(len(self.train_loader), 1)

    def _save_metadata(self, checkpoint_path: str) -> None:
        meta = {
            "trainer":     type(self).__name__,
            "classes":     self.params.classes,
            "num_classes": self.params.num_classes,
            "epochs":      self.params.epochs,
            "experiment":  self.params.experiment_name,
            "checkpoint":  checkpoint_path,
        }
        path = self.params.run_dir / "metadata.json"
        path.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    @staticmethod
    def _resolve_device(device_str: str) -> torch.device:
        if device_str == "auto":
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return torch.device(device_str)

    # ── Abstract interface — AI Engineers MUST implement ──────────────────────

    @abstractmethod
    def load_dataset(self) -> tuple[Any, Any]:
        """
        Use self.data.get_loader(...) to build DataLoaders.

        Example
        -------
        def load_dataset(self):
            train = self.data.get_loader("TRAIN",      self._make_dataset, batch_size=16)
            val   = self.data.get_loader("VALIDATION", self._make_dataset, batch_size=32)
            return train, val
        """

    @abstractmethod
    def load_model(self) -> torch.nn.Module:
        """
        Build or load the model architecture.
        Use self.checkpoint.has_pretrained() / .get_pretrained_path() for weights.
        Do NOT call .to(device) — BaseTrainer handles that.
        """

    @abstractmethod
    def configure_optimizer(self) -> tuple[torch.optim.Optimizer, Any]:
        """
        Return (optimizer, scheduler).
        scheduler may be None.
        """

    @abstractmethod
    def train_step(self, batch: Any) -> float:
        """
        Forward + backward on one batch.
        Returns the scalar loss value.
        """

    @abstractmethod
    def evaluate(self) -> dict[str, float]:
        """
        Run evaluation on self.val_loader.
        Returns a dict of metrics, e.g. {"mAP50": 0.82, "accuracy": 0.95}.
        Return {} if no validation split is available.
        """

    @abstractmethod
    def infer(self, source: Any, params: IP) -> Any:
        """
        Run inference on arbitrary input (image path, tensor, video, …).
        Returns framework-specific results.
        """

    @abstractmethod
    def save_checkpoint(self) -> str:
        """
        Save model weights (and any auxiliary files) to self.params.run_dir.
        Returns the path to the primary checkpoint file.
        """

    @abstractmethod
    def load_checkpoint(self, weights_path: str) -> None:
        """
        Load weights from a local path into self.model.
        Used by the trainer itself for resume or fine-tuning.
        """
