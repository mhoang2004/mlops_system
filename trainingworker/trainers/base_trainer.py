"""
BaseTrainer — generic contract for every ML framework in this platform.
"""
from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, ClassVar, Generic, Optional, Type, TypeVar

import torch
from pydantic import BaseModel, ConfigDict, Field, field_validator

logger = logging.getLogger(__name__)

TP = TypeVar("TP", bound="BaseTrainParams")
IP = TypeVar("IP", bound="BaseInferParams")


class BaseMetrics(BaseModel):
    """Evaluation metrics schema returned by trainer.evaluate()."""
    model_config = ConfigDict(extra="allow")


# ── Parameter schemas ─────────────────────────────────────────────────────────

class BaseTrainParams(BaseModel):
    # Label info — hidden in UI (auto-populated from project)
    classes: list[str] = Field(
        ..., min_length=1,
        json_schema_extra={"ui_hidden": True},
    )

    # Training loop
    epochs: int = Field(
        default=50, ge=1,
        description="Số epoch training",
        json_schema_extra={"ui_group": "training"},
    )
    batch_size: int = Field(
        default=16, ge=1,
        description="Số mẫu mỗi batch",
        json_schema_extra={"ui_group": "training"},
    )
    learning_rate: float = Field(
        default=1e-3, gt=0,
        description="Learning rate ban đầu",
        json_schema_extra={"ui_group": "training"},
    )
    weight_decay: float = Field(
        default=1e-4, ge=0,
        description="Weight decay (L2 regularization)",
        json_schema_extra={"ui_group": "training"},
    )

    # Output — hidden in UI (set by worker)
    output_dir: str = Field(
        default="./runs/train",
        json_schema_extra={"ui_hidden": True},
    )
    experiment_name: str = Field(
        default="exp",
        json_schema_extra={"ui_hidden": True},
    )

    # Hardware
    device: str = Field(
        default="auto",
        description="Thiết bị training: auto tự phát hiện GPU",
        json_schema_extra={"ui_group": "hardware", "ui_options": ["auto", "cpu", "cuda"]},
    )

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
    weights_path: str   = Field(..., description="Local path or MinIO key of checkpoint")
    confidence:   float = Field(default=0.5, ge=0.0, le=1.0)
    device:       str   = Field(default="auto")
    img_size:     int   = Field(default=640, ge=32)


# ── Base Trainer ──────────────────────────────────────────────────────────────

class BaseTrainer(ABC, Generic[TP, IP]):
    # Subclasses MUST define these class-level attributes
    TRAINER_KEY:        ClassVar[str]
    TRAINER_NAME:       ClassVar[str] = ""
    TRAIN_PARAMS_CLASS: ClassVar[Type[BaseTrainParams]]
    INFER_PARAMS_CLASS: ClassVar[Type[BaseInferParams]]
    METRICS_CLASS:      ClassVar[Type[BaseMetrics]] = BaseMetrics

    def __init__(
        self,
        params: TP,
        data: Any,
        checkpoint: Any,
        reporter: Any,
    ) -> None:
        self.params:     TP  = params
        self.data:       Any = data
        self.checkpoint: Any = checkpoint
        self.reporter:   Any = reporter
        self.device:     torch.device = self._resolve_device(params.device)

        self.model:        Optional[torch.nn.Module]       = None
        self.optimizer:    Optional[torch.optim.Optimizer] = None
        self.scheduler:    Optional[Any]                   = None
        self.train_loader: Optional[Any]                   = None
        self.val_loader:   Optional[Any]                   = None

        params.run_dir.mkdir(parents=True, exist_ok=True)

    # ── Public entry point ────────────────────────────────────────────────────

    def fit(self) -> dict[str, list]:
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
            try:
                import mlflow
                mlflow_metrics: dict = {"train_loss": train_loss, **val_metrics}
                if self.optimizer:
                    mlflow_metrics["lr"] = self.optimizer.param_groups[0]["lr"]
                mlflow.log_metrics(mlflow_metrics, step=epoch + 1)
            except Exception:
                pass
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

    def on_epoch_end(self, epoch: int, train_loss: float, val_metrics: dict) -> None:
        pass

    def on_train_end(self, checkpoint_path: str) -> None:
        pass

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

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    def load_dataset(self) -> tuple[Any, Any]: ...

    @abstractmethod
    def load_model(self) -> torch.nn.Module: ...

    @abstractmethod
    def configure_optimizer(self) -> tuple[torch.optim.Optimizer, Any]: ...

    @abstractmethod
    def train_step(self, batch: Any) -> float: ...

    @abstractmethod
    def evaluate(self) -> dict[str, float]: ...

    @abstractmethod
    def infer(self, source: Any, params: IP) -> Any: ...

    @abstractmethod
    def save_checkpoint(self) -> str: ...

    @abstractmethod
    def load_checkpoint(self, weights_path: str) -> None: ...

    @abstractmethod
    def evaluate_dataset(self, image_dir: Path, annotation_file: Optional[Path]) -> dict[str, float]:
        """
        Evaluate the loaded model on a single dataset.
        Called by the evaluation Celery task for each dataset version.

        Parameters
        ----------
        image_dir       : directory containing downloaded images
        annotation_file : path to COCO JSON annotation file, or None if unavailable

        Returns
        -------
        dict of metric_name → float  (e.g. {"mAP50": 0.72, "precision": 0.85})
        """
        ...
