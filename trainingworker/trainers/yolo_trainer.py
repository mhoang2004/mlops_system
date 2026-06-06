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
    """
    Tham số training đặc thù cho YOLO.
    Kế thừa toàn bộ field từ BaseTrainParams.
    """

    # Model
    model_size: str = Field(
        default="n",
        pattern="^[nsmlx]$",
        description="Kích thước YOLO: n (nano) | s | m | l | x (extra-large)",
    )
    pretrained_weights: Optional[str] = Field(
        default=None,
        description="Đường dẫn file .pt pretrained, None để train from scratch",
    )

    # Image
    img_size: int = Field(default=640, ge=32, description="Kích thước ảnh đầu vào (pixels)")

    # Augmentation
    augment: bool = Field(default=True, description="Bật mosaic, flip, hsv augmentation")
    mosaic: float = Field(default=1.0, ge=0.0, le=1.0, description="Xác suất augment mosaic")

    # Optimizer
    momentum: float = Field(default=0.937, ge=0.0, le=1.0)
    warmup_epochs: int = Field(default=3, ge=0)
    lr_final: float = Field(default=0.01, gt=0, description="Learning rate cuối (cosine decay)")

    # Regularization
    dropout: float = Field(default=0.0, ge=0.0, le=1.0)

    # Early stopping
    patience: int = Field(default=50, ge=1, description="Số epoch không cải thiện thì dừng")

    # NMS
    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0, description="IoU threshold cho NMS")
    conf_threshold: float = Field(default=0.001, gt=0.0, description="Confidence threshold khi train")


class YoloInferParams(BaseInferParams):
    """
    Tham số inference đặc thù cho YOLO.
    Kế thừa: weights_path, confidence, device, img_size.
    """

    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0, description="IoU threshold cho NMS")
    max_det: int = Field(default=300, ge=1, description="Số detection tối đa mỗi ảnh")
    classes: Optional[list[int]] = Field(
        default=None,
        description="Lọc chỉ những class index nhất định, None = tất cả",
    )
    augment: bool = Field(default=False, description="Test-time augmentation")
    half: bool = Field(default=False, description="Dùng FP16 inference nếu GPU hỗ trợ")
    save_txt: bool = Field(default=False, description="Lưu kết quả dạng YOLO txt")


# ── Placeholder dataset (thay bằng YoloDataset thực tế) ──────────────────────

class _YoloDataset(Dataset):
    """
    Dataset placeholder — thay bằng implementation đọc ảnh + YOLO label txt.
    Mỗi sample trả về (image_tensor, target_tensor).
    """

    def __init__(self, data_path: str, classes: list[str], img_size: int, augment: bool) -> None:
        self.data_path = Path(data_path)
        self.classes = classes
        self.num_classes = len(classes)
        self.img_size = img_size
        self.augment = augment
        # TODO: scan thư mục thực tế, build danh sách file ảnh + label
        self._len = 100  # placeholder

    def __len__(self) -> int:
        return self._len

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        # TODO: đọc ảnh thực, parse YOLO label txt, áp augmentation
        image = torch.randn(3, self.img_size, self.img_size)
        # target shape: (num_anchors * (5 + num_classes), H/2, W/2)
        target = torch.zeros(3 * (5 + self.num_classes), self.img_size // 2, self.img_size // 2)
        return image, target


# ── YOLO Trainer ──────────────────────────────────────────────────────────────

class YoloTrainer(BaseTrainer[YoloTrainParams, YoloInferParams]):
    """
    Trainer cho YOLO object detection.

    Triển khai toàn bộ abstract method của BaseTrainer:
        load_dataset, load_model, configure_optimizer,
        train_step, evaluate, infer, save_checkpoint, load_checkpoint.
    """

    def __init__(self, params: YoloTrainParams) -> None:
        super().__init__(params)
        self.params: YoloTrainParams = params  # re-annotate để IDE hiểu đúng kiểu
        self._best_map: float = 0.0
        self._epochs_no_improve: int = 0

    # ── Abstract implementations ──────────────────────────────────────────────

    def load_dataset(self) -> tuple[DataLoader, DataLoader]:
        """Build train và val DataLoader từ data_path."""
        p = self.params
        train_ds = _YoloDataset(p.data_path, p.classes, p.img_size, augment=p.augment)
        val_ds   = _YoloDataset(p.data_path, p.classes, p.img_size, augment=False)

        train_loader = DataLoader(
            train_ds,
            batch_size=p.batch_size,
            shuffle=True,
            num_workers=4,
            pin_memory=self.device.type == "cuda",
        )
        val_loader = DataLoader(
            val_ds,
            batch_size=p.batch_size * 2,
            shuffle=False,
            num_workers=2,
            pin_memory=self.device.type == "cuda",
        )
        logger.info("Dataset: train=%d | val=%d samples", len(train_ds), len(val_ds))
        return train_loader, val_loader

    def load_model(self) -> nn.Module:
        """
        Load YOLOv8 từ Ultralytics hoặc build lightweight model.
        Nếu pretrained_weights được cung cấp thì load weights từ file.
        """
        # TODO: thay bằng `from ultralytics import YOLO` khi tích hợp thật
        model = _YoloNet(num_classes=self.params.num_classes)

        if self.params.pretrained_weights:
            self.load_checkpoint(self.params.pretrained_weights)
            logger.info("Loaded pretrained weights: %s", self.params.pretrained_weights)
        else:
            logger.info("Training from scratch | model_size=%s", self.params.model_size)

        return model

    def configure_optimizer(self) -> tuple[torch.optim.Optimizer, Any]:
        """
        SGD với momentum + cosine LR scheduler (giống YOLOv5/v8 default).
        """
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
        """
        Một bước forward + backward.
        Trả về loss (float) để BaseTrainer tổng hợp epoch loss.
        """
        assert self.model is not None and self.optimizer is not None

        images, targets = batch
        images  = images.to(self.device, non_blocking=True)
        targets = targets.to(self.device, non_blocking=True)

        self.optimizer.zero_grad(set_to_none=True)
        preds = self.model(images)

        # TODO: thay bằng YoloLoss thực tế (box + obj + cls loss)
        loss = nn.MSELoss()(preds, targets)

        loss.backward()
        # Gradient clipping (giống YOLO training)
        nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=10.0)
        self.optimizer.step()

        return loss.item()

    def evaluate(self) -> dict[str, float]:
        """
        Chạy evaluation trên val_loader.
        Trả về dict metrics: mAP50, mAP50-95, precision, recall.
        """
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

        # TODO: tính mAP thực tế bằng torchmetrics hoặc val_loader bbox decode
        metrics = {
            "val_loss":  round(avg_loss, 4),
            "mAP50":     0.0,   # placeholder
            "mAP50-95":  0.0,
            "precision": 0.0,
            "recall":    0.0,
        }
        return metrics

    def infer(self, source: Any, params: YoloInferParams) -> list[dict]:
        """
        Chạy inference trên một ảnh / list ảnh / video path.

        Parameters
        ----------
        source : str đường dẫn ảnh, numpy array, hoặc torch.Tensor (B,C,H,W)
        params : YoloInferParams

        Returns
        -------
        list[dict] — mỗi phần tử gồm: boxes, scores, class_ids, class_names
        """
        if self.model is None:
            self.model = self.load_model().to(self.device)
            self.load_checkpoint(params.weights_path)

        infer_device = self._resolve_device(params.device)
        self.model.to(infer_device).eval()

        # TODO: tiền xử lý source → tensor (resize, normalize)
        dummy_input = torch.randn(1, 3, params.img_size, params.img_size).to(infer_device)

        with torch.no_grad():
            raw_preds = self.model(dummy_input)

        # TODO: decode raw_preds → boxes, apply NMS với params.iou_threshold
        results = [
            {
                "boxes":       [],   # [[x1, y1, x2, y2], …]
                "scores":      [],   # [0.91, …]
                "class_ids":   [],   # [0, 2, …]
                "class_names": [],   # ["cat", "car", …]
            }
        ]
        return results

    def save_checkpoint(self) -> str:
        """Lưu best.pt vào run_dir. Trả về đường dẫn."""
        assert self.model is not None
        ckpt_path = self.params.run_dir / "best.pt"
        torch.save(
            {
                "model_state": self.model.state_dict(),
                "classes":     self.params.classes,
                "num_classes": self.params.num_classes,
                "img_size":    self.params.img_size,
                "model_size":  self.params.model_size,
            },
            ckpt_path,
        )
        logger.info("Checkpoint lưu tại: %s", ckpt_path)
        return str(ckpt_path)

    def load_checkpoint(self, weights_path: str) -> None:
        """Load state_dict vào self.model từ file .pt."""
        ckpt = torch.load(weights_path, map_location=self.device)
        state = ckpt["model_state"] if isinstance(ckpt, dict) else ckpt
        assert self.model is not None
        self.model.load_state_dict(state)
        logger.info("Loaded checkpoint: %s", weights_path)

    # ── Lifecycle hooks ───────────────────────────────────────────────────────

    def on_epoch_end(self, epoch: int, train_loss: float, val_metrics: dict) -> None:
        """Bước scheduler + early stopping."""
        if self.scheduler is not None:
            self.scheduler.step()

        current_map = val_metrics.get("mAP50", 0.0)
        if current_map > self._best_map:
            self._best_map = current_map
            self._epochs_no_improve = 0
            self.save_checkpoint()
            logger.info("New best mAP50: %.4f — checkpoint saved", self._best_map)
        else:
            self._epochs_no_improve += 1
            if self._epochs_no_improve >= self.params.patience:
                logger.info(
                    "Early stopping triggered sau %d epochs không cải thiện",
                    self.params.patience,
                )
                # Raise signal để BaseTrainer dừng loop (nếu muốn)

    def on_train_end(self, checkpoint_path: str) -> None:
        logger.info(
            "Training kết thúc | best mAP50=%.4f | checkpoint=%s",
            self._best_map, checkpoint_path,
        )


# ── Lightweight YOLO net (placeholder) ───────────────────────────────────────

class _YoloNet(nn.Module):
    """
    Model YOLO thu nhỏ để test pipeline.
    Thay bằng `ultralytics.YOLO` trong production.
    """

    def __init__(self, num_classes: int) -> None:
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.BatchNorm2d(32), nn.SiLU(),
            nn.Conv2d(32, 64, 3, stride=2, padding=1), nn.BatchNorm2d(64), nn.SiLU(),
            nn.Conv2d(64, 128, 3, stride=2, padding=1), nn.BatchNorm2d(128), nn.SiLU(),
        )
        # 3 anchors × (4 box + 1 obj + num_classes) per cell
        self.head = nn.Conv2d(128, 3 * (5 + num_classes), 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))
