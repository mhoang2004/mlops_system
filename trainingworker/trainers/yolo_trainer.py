from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from pydantic import Field

from base_trainer import BaseTrainer, BaseTrainParams, BaseInferParams

logger = logging.getLogger(__name__)


# ── Parameter schemas ─────────────────────────────────────────────────────────

class YoloTrainParams(BaseTrainParams):
    """YOLO object detection trainer — kế thừa BaseTrainParams."""

    # Model config
    model_size: str = Field(
        default="n",
        pattern="^[nsmlx]$",
        description="Kích thước model: n (nano) | s | m | l | x (extra-large)",
        json_schema_extra={"ui_group": "model", "ui_options": ["n", "s", "m", "l", "x"]},
    )
    img_size: int = Field(
        default=640, ge=32,
        description="Kích thước ảnh đầu vào (pixels, phải chia hết cho 32)",
        json_schema_extra={"ui_group": "model"},
    )

    # Augmentation
    augment: bool = Field(
        default=True,
        description="Bật mosaic, flip, HSV color augmentation",
        json_schema_extra={"ui_group": "augmentation"},
    )
    mosaic: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="Xác suất áp dụng mosaic augmentation",
        json_schema_extra={"ui_group": "augmentation"},
    )

    # Optimizer extras
    momentum: float = Field(
        default=0.937, ge=0.0, le=1.0,
        description="SGD momentum",
        json_schema_extra={"ui_group": "optimizer"},
    )
    warmup_epochs: int = Field(
        default=3, ge=0,
        description="Số epoch warmup learning rate",
        json_schema_extra={"ui_group": "optimizer"},
    )
    lr_final: float = Field(
        default=0.01, gt=0,
        description="Learning rate cuối (cosine decay ratio)",
        json_schema_extra={"ui_group": "optimizer"},
    )

    # Regularization
    dropout: float = Field(
        default=0.0, ge=0.0, le=1.0,
        description="Dropout rate cho classification head",
        json_schema_extra={"ui_group": "regularization"},
    )
    patience: int = Field(
        default=50, ge=1,
        description="Số epoch không cải thiện mAP thì dừng sớm",
        json_schema_extra={"ui_group": "regularization"},
    )

    # NMS / detection thresholds
    iou_threshold: float = Field(
        default=0.45, ge=0.0, le=1.0,
        description="IoU threshold cho Non-Maximum Suppression",
        json_schema_extra={"ui_group": "detection"},
    )
    conf_threshold: float = Field(
        default=0.001, gt=0.0,
        description="Confidence threshold khi đánh giá trong training",
        json_schema_extra={"ui_group": "detection"},
    )


class YoloInferParams(BaseInferParams):
    """Tham số inference đặc thù cho YOLO."""

    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0, description="IoU threshold cho NMS")
    max_det: int = Field(default=300, ge=1, description="Số detection tối đa mỗi ảnh")
    classes: Optional[list[int]] = Field(
        default=None,
        description="Lọc chỉ những class index nhất định, None = tất cả",
    )
    augment: bool = Field(default=False, description="Test-time augmentation")
    half: bool = Field(default=False, description="Dùng FP16 inference nếu GPU hỗ trợ")
    save_txt: bool = Field(default=False, description="Lưu kết quả dạng YOLO txt")


# ── YOLO Trainer ──────────────────────────────────────────────────────────────

class YoloTrainer(BaseTrainer[YoloTrainParams, YoloInferParams]):
    """YOLO object detection trainer."""

    TRAINER_KEY        = "yolo"
    TRAINER_NAME       = "YOLO Object Detection"
    TRAIN_PARAMS_CLASS = YoloTrainParams
    INFER_PARAMS_CLASS = YoloInferParams

    def __init__(self, params: YoloTrainParams, data: Any, checkpoint: Any, reporter: Any) -> None:
        super().__init__(params, data, checkpoint, reporter)
        self.params: YoloTrainParams = params
        self._best_map: float = 0.0
        self._epochs_no_improve: int = 0

    def load_dataset(self) -> tuple[DataLoader, DataLoader]:
        p = self.params
        train_ds = _YoloDataset(p.classes, p.img_size, augment=p.augment)
        val_ds   = _YoloDataset(p.classes, p.img_size, augment=False)
        # num_workers=0: Celery ForkPoolWorker is a daemon process and cannot spawn children
        train_loader = DataLoader(train_ds, batch_size=p.batch_size, shuffle=True,
                                  num_workers=0, pin_memory=self.device.type == "cuda")
        val_loader   = DataLoader(val_ds,   batch_size=p.batch_size * 2, shuffle=False,
                                  num_workers=0, pin_memory=self.device.type == "cuda")
        return train_loader, val_loader

    def load_model(self) -> nn.Module:
        self.model = _YoloNet(num_classes=self.params.num_classes)
        if self.checkpoint.has_pretrained():
            self.load_checkpoint(str(self.checkpoint.get_pretrained_path()))
        return self.model

    def configure_optimizer(self) -> tuple[torch.optim.Optimizer, Any]:
        assert self.model is not None
        optimizer = optim.SGD(
            self.model.parameters(),
            lr=self.params.learning_rate,
            momentum=self.params.momentum,
            weight_decay=self.params.weight_decay,
            nesterov=True,
        )
        scheduler = optim.lr_scheduler.CosineAnnealingLR(
            optimizer,
            T_max=self.params.epochs,
            eta_min=self.params.lr_final * self.params.learning_rate,
        )
        return optimizer, scheduler

    def train_step(self, batch: tuple[torch.Tensor, torch.Tensor]) -> float:
        assert self.model is not None and self.optimizer is not None
        images, targets = batch
        images  = images.to(self.device, non_blocking=True)
        targets = targets.to(self.device, non_blocking=True)
        self.optimizer.zero_grad(set_to_none=True)
        preds = self.model(images)
        loss  = nn.MSELoss()(preds, targets)
        loss.backward()
        nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=10.0)
        self.optimizer.step()
        return loss.item()

    def evaluate(self) -> dict[str, float]:
        assert self.model is not None and self.val_loader is not None
        self.model.eval()
        total_loss = 0.0
        with torch.no_grad():
            for batch in self.val_loader:
                images, targets = batch
                images  = images.to(self.device)
                targets = targets.to(self.device)
                preds   = self.model(images)
                total_loss += nn.MSELoss()(preds, targets).item()
        avg_loss = total_loss / max(len(self.val_loader), 1)
        return {"val_loss": round(avg_loss, 4), "mAP50": 0.0, "mAP50-95": 0.0, "precision": 0.0, "recall": 0.0}

    def infer(self, source: Any, params: YoloInferParams) -> list[dict]:
        if self.model is None:
            self.model = self.load_model().to(self.device)
            self.load_checkpoint(params.weights_path)
        self.model.eval()
        dummy_input = torch.randn(1, 3, params.img_size, params.img_size).to(self.device)
        with torch.no_grad():
            self.model(dummy_input)
        return [{"boxes": [], "scores": [], "class_ids": [], "class_names": []}]

    def save_checkpoint(self) -> str:
        assert self.model is not None
        ckpt_path = self.params.run_dir / "best.pt"
        torch.save({
            "model_state": self.model.state_dict(),
            "classes":     self.params.classes,
            "img_size":    self.params.img_size,
            "model_size":  self.params.model_size,
        }, ckpt_path)
        return str(ckpt_path)

    def load_checkpoint(self, weights_path: str) -> None:
        ckpt  = torch.load(weights_path, map_location=self.device)
        state = ckpt["model_state"] if isinstance(ckpt, dict) else ckpt
        assert self.model is not None
        self.model.load_state_dict(state)

    def evaluate_dataset(self, image_dir: Path, annotation_file: Optional[Path]) -> dict[str, float]:
        """
        Evaluate on one dataset (COCO 1.0 JSON format).

        COCO annotation structure:
            {
              "images":      [{"id": int, "file_name": str, ...}],
              "categories":  [{"id": int, "name": str}],
              "annotations": [{"id": int, "image_id": int, "category_id": int,
                               "bbox": [x, y, w, h], "area": float, "iscrowd": 0}]
            }

        Current placeholder returns zeros — replace with real mAP computation
        (e.g. via torchmetrics.detection.MeanAveragePrecision) once the model
        produces real bounding-box predictions.
        """
        import json as _json

        assert self.model is not None
        self.model.eval()

        if annotation_file is None or not annotation_file.exists():
            logger.warning("evaluate_dataset: no annotation file, returning zeros")
            return {"mAP50": 0.0, "mAP50-95": 0.0, "precision": 0.0, "recall": 0.0}

        with open(annotation_file) as f:
            coco = _json.load(f)

        images      = coco.get("images", [])
        annotations = coco.get("annotations", [])
        categories  = {c["id"]: c["name"] for c in coco.get("categories", [])}

        logger.info(
            "evaluate_dataset: %d images, %d annotations, %d categories",
            len(images), len(annotations), len(categories),
        )

        # TODO: run real inference + compute mAP via torchmetrics or pycocotools
        # For now return zeros so the pipeline is end-to-end functional
        return {
            "num_images":       float(len(images)),
            "num_annotations":  float(len(annotations)),
            "mAP50":            0.0,
            "mAP50-95":         0.0,
            "precision":        0.0,
            "recall":           0.0,
        }

    def on_epoch_end(self, epoch: int, train_loss: float, val_metrics: dict) -> None:
        if self.scheduler is not None:
            self.scheduler.step()
        current_map = val_metrics.get("mAP50", 0.0)
        if current_map > self._best_map:
            self._best_map = current_map
            self._epochs_no_improve = 0
            self.save_checkpoint()
        else:
            self._epochs_no_improve += 1
        try:
            import mlflow
            mlflow.log_metrics({
                "best_mAP50":        self._best_map,
                "epochs_no_improve": float(self._epochs_no_improve),
            }, step=epoch + 1)
        except Exception:
            pass


# ── Placeholder dataset ───────────────────────────────────────────────────────

class _YoloDataset(Dataset):
    def __init__(self, classes: list[str], img_size: int, augment: bool) -> None:
        self.num_classes = len(classes)
        self.img_size    = img_size
        self._len        = 100

    def __len__(self) -> int:
        return self._len

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        image  = torch.randn(3, self.img_size, self.img_size)
        # backbone has 2× stride-2 convs → spatial dim = img_size // 4
        target = torch.zeros(3 * (5 + self.num_classes), self.img_size // 4, self.img_size // 4)
        return image, target


# ── Lightweight YOLO net (placeholder) ───────────────────────────────────────

class _YoloNet(nn.Module):
    def __init__(self, num_classes: int) -> None:
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.BatchNorm2d(32), nn.SiLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1), nn.BatchNorm2d(64), nn.SiLU(),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), nn.BatchNorm2d(128), nn.SiLU(),
        )
        self.head = nn.Conv2d(128, 3 * (5 + num_classes), 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))
