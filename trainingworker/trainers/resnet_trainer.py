from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from pydantic import Field

from base_trainer import BaseTrainer, BaseTrainParams, BaseInferParams, BaseMetrics

logger = logging.getLogger(__name__)

_IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# ── Parameter schemas ─────────────────────────────────────────────────────────

class ResNetTrainParams(BaseTrainParams):
    backbone: str = Field(
        default="resnet50",
        description="Kiến trúc backbone",
        json_schema_extra={
            "ui_group": "model",
            "ui_options": ["resnet18", "resnet34", "resnet50", "resnet101", "resnet152"],
        },
    )
    img_size: int = Field(
        default=224, ge=32,
        description="Kích thước ảnh đầu vào (pixels)",
        json_schema_extra={"ui_group": "model"},
    )
    pretrained: bool = Field(
        default=True,
        description="Dùng trọng số ImageNet pretrained",
        json_schema_extra={"ui_group": "model"},
    )
    freeze_backbone: bool = Field(
        default=False,
        description="Đóng băng backbone, chỉ huấn luyện classification head",
        json_schema_extra={"ui_group": "model"},
    )
    augment: bool = Field(
        default=True,
        description="Bật random flip, crop, color jitter",
        json_schema_extra={"ui_group": "augmentation"},
    )
    scheduler: str = Field(
        default="cosine",
        description="Chiến lược giảm learning rate",
        json_schema_extra={
            "ui_group": "optimizer",
            "ui_options": ["cosine", "step", "none"],
        },
    )
    label_smoothing: float = Field(
        default=0.1, ge=0.0, le=0.5,
        description="Label smoothing cho CrossEntropyLoss",
        json_schema_extra={"ui_group": "regularization"},
    )
    dropout: float = Field(
        default=0.0, ge=0.0, le=0.8,
        description="Dropout trước classification head",
        json_schema_extra={"ui_group": "regularization"},
    )


class ResNetInferParams(BaseInferParams):
    top_k: int = Field(default=5, ge=1, description="Số lượng top-k predictions trả về")


class ResNetMetrics(BaseMetrics):
    accuracy: float = 0.0
    accuracy_top5: Optional[float] = None
    val_loss: Optional[float] = None


# ── Dataset ───────────────────────────────────────────────────────────────────

class _ClsDataset(Dataset):
    """Classification dataset backed by COCO JSON annotations."""

    def __init__(
        self,
        image_dir: Path,
        annotation_file: Optional[Path],
        class_names: list[str],
        img_size: int,
        augment: bool,
    ) -> None:
        import albumentations as A
        from albumentations.pytorch import ToTensorV2

        self.img_size = img_size
        self.images = sorted(p for p in image_dir.iterdir() if p.suffix.lower() in _IMG_EXTS)

        name_to_idx = {name: i for i, name in enumerate(class_names)}
        self._labels: dict[str, int] = {}

        if annotation_file and annotation_file.exists():
            import json
            with open(annotation_file) as f:
                coco = json.load(f)

            cat_to_cls: dict[int, int] = {}
            for cat in coco.get("categories", []):
                idx = name_to_idx.get(cat["name"])
                if idx is not None:
                    cat_to_cls[cat["id"]] = idx

            id_to_stem = {img["id"]: Path(img["file_name"]).stem for img in coco.get("images", [])}
            for ann in coco.get("annotations", []):
                stem = id_to_stem.get(ann["image_id"])
                cls_idx = cat_to_cls.get(ann.get("category_id", -1))
                if stem and cls_idx is not None and stem not in self._labels:
                    self._labels[stem] = cls_idx

        mean = [0.485, 0.456, 0.406]
        std  = [0.229, 0.224, 0.225]

        if augment:
            self.transform = A.Compose([
                A.Resize(img_size + 32, img_size + 32),
                A.RandomCrop(img_size, img_size),
                A.HorizontalFlip(p=0.5),
                A.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1, p=0.5),
                A.Rotate(limit=15, p=0.3),
                A.Normalize(mean=mean, std=std),
                ToTensorV2(),
            ])
        else:
            self.transform = A.Compose([
                A.Resize(img_size, img_size),
                A.Normalize(mean=mean, std=std),
                ToTensorV2(),
            ])

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, idx: int):
        img_path = self.images[idx]
        img = cv2.imread(str(img_path))
        if img is None:
            img = np.zeros((self.img_size, self.img_size, 3), dtype=np.uint8)
        else:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        label = self._labels.get(img_path.stem, 0)
        out = self.transform(image=img)
        return out["image"].float(), torch.tensor(label, dtype=torch.long)


# ── Trainer ───────────────────────────────────────────────────────────────────

class ResNetTrainer(BaseTrainer[ResNetTrainParams, ResNetInferParams]):
    """Image classification trainer backed by torchvision ResNet."""

    TRAINER_KEY        = "resnet"
    TRAINER_NAME       = "ResNet Image Classification"
    TRAIN_PARAMS_CLASS = ResNetTrainParams
    INFER_PARAMS_CLASS = ResNetInferParams
    METRICS_CLASS      = ResNetMetrics

    def __init__(self, params: ResNetTrainParams, data: Any, checkpoint: Any, reporter: Any) -> None:
        super().__init__(params, data, checkpoint, reporter)
        self.params: ResNetTrainParams = params
        self._best_acc = 0.0
        self._best_ckpt_path: Optional[str] = None

    # ── Dataset ───────────────────────────────────────────────────────────────

    def load_dataset(self) -> tuple[DataLoader, Optional[DataLoader]]:
        train_loader = self._build_loader("TRAIN", augment=self.params.augment)
        val_loader = (
            self._build_loader("VALIDATION", augment=False)
            if self.data.has_split("VALIDATION")
            else None
        )
        return train_loader, val_loader

    def _build_loader(self, role: str, augment: bool) -> DataLoader:
        p = self.params

        def _factory(image_dir: Path, annotation_file: Optional[Path]) -> Dataset:
            return _ClsDataset(image_dir, annotation_file, p.classes, p.img_size, augment)

        return self.data.get_loader(
            role, _factory,
            batch_size=p.batch_size,
            num_workers=0,
            pin_memory=(self.device.type == "cuda"),
        )

    # ── Model ─────────────────────────────────────────────────────────────────

    def load_model(self) -> nn.Module:
        import torchvision.models as tv

        _valid = {"resnet18", "resnet34", "resnet50", "resnet101", "resnet152"}
        if self.params.backbone not in _valid:
            raise ValueError(f"Unsupported backbone '{self.params.backbone}'. Choose from {_valid}")

        weights = "DEFAULT" if self.params.pretrained else None
        model: nn.Module = getattr(tv, self.params.backbone)(weights=weights)

        if self.params.freeze_backbone:
            for param in model.parameters():
                param.requires_grad = False

        in_features: int = model.fc.in_features
        if self.params.dropout > 0:
            model.fc = nn.Sequential(
                nn.Dropout(p=self.params.dropout),
                nn.Linear(in_features, self.params.num_classes),
            )
        else:
            model.fc = nn.Linear(in_features, self.params.num_classes)

        for param in model.fc.parameters():
            param.requires_grad = True

        logger.info("Loaded %s | pretrained=%s | freeze_backbone=%s | num_classes=%d",
                    self.params.backbone, self.params.pretrained,
                    self.params.freeze_backbone, self.params.num_classes)
        return model

    # ── Optimizer ─────────────────────────────────────────────────────────────

    def configure_optimizer(self) -> tuple[torch.optim.Optimizer, Any]:
        trainable = [p for p in self.model.parameters() if p.requires_grad]
        optimizer = torch.optim.AdamW(
            trainable,
            lr=self.params.learning_rate,
            weight_decay=self.params.weight_decay,
        )

        sched_name = self.params.scheduler
        if sched_name == "cosine":
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=self.params.epochs, eta_min=1e-6,
            )
        elif sched_name == "step":
            scheduler = torch.optim.lr_scheduler.StepLR(
                optimizer, step_size=max(1, self.params.epochs // 3), gamma=0.1,
            )
        else:
            scheduler = None

        return optimizer, scheduler

    # ── Training step ─────────────────────────────────────────────────────────

    def train_step(self, batch: Any) -> float:
        images, labels = batch
        images = images.to(self.device)
        labels = labels.to(self.device)

        self.optimizer.zero_grad()
        loss = F.cross_entropy(
            self.model(images), labels,
            label_smoothing=self.params.label_smoothing,
        )
        loss.backward()
        self.optimizer.step()
        return loss.item()

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self) -> dict[str, float]:
        if self.val_loader is None:
            return {}
        return self._eval_loader(self.val_loader, save_best=True)

    def _eval_loader(self, loader: DataLoader, save_best: bool = False) -> dict[str, float]:
        self.model.eval()
        total = correct_top1 = correct_top5 = 0
        total_loss = 0.0

        with torch.no_grad():
            for images, labels in loader:
                images = images.to(self.device)
                labels = labels.to(self.device)
                logits = self.model(images)

                total_loss += F.cross_entropy(logits, labels).item() * len(labels)
                correct_top1 += (logits.argmax(dim=1) == labels).sum().item()

                if self.params.num_classes >= 5:
                    top5 = logits.topk(min(5, self.params.num_classes), dim=1).indices
                    correct_top5 += (top5 == labels.unsqueeze(1)).any(dim=1).sum().item()
                total += len(labels)

        self.model.train()
        if total == 0:
            return {}

        metrics: dict[str, float] = {
            "accuracy": round(correct_top1 / total, 4),
            "val_loss": round(total_loss / total, 4),
        }
        if self.params.num_classes >= 5:
            metrics["accuracy_top5"] = round(correct_top5 / total, 4)

        if save_best and metrics["accuracy"] > self._best_acc:
            self._best_acc = metrics["accuracy"]
            ckpt_path = str(self.params.run_dir / "best.pt")
            self._save_state(ckpt_path)
            self._best_ckpt_path = ckpt_path

        return metrics

    def on_epoch_end(self, epoch: int, train_loss: float, val_metrics: dict) -> None:
        if self.scheduler is not None:
            self.scheduler.step()

    # ── Checkpoint ────────────────────────────────────────────────────────────

    def save_checkpoint(self) -> str:
        if self._best_ckpt_path is None:
            path = str(self.params.run_dir / "last.pt")
            self._save_state(path)
            self._best_ckpt_path = path
        return self._best_ckpt_path

    def _save_state(self, path: str) -> None:
        torch.save({
            "model_state": self.model.state_dict(),
            "backbone":    self.params.backbone,
            "num_classes": self.params.num_classes,
            "classes":     self.params.classes,
            "img_size":    self.params.img_size,
        }, path)
        logger.info("Checkpoint saved → %s", path)

    def load_checkpoint(self, weights_path: str) -> None:
        ckpt = torch.load(weights_path, map_location=self.device, weights_only=True)
        if self.model is None:
            self.model = self.load_model().to(self.device)
        self.model.load_state_dict(ckpt["model_state"])
        self.model.eval()
        logger.info("Loaded checkpoint: %s", weights_path)

    # ── Inference ─────────────────────────────────────────────────────────────

    def _infer_transform(self):
        import albumentations as A
        from albumentations.pytorch import ToTensorV2
        return A.Compose([
            A.Resize(self.params.img_size, self.params.img_size),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ])

    def infer(self, source: Any, params: ResNetInferParams) -> list[dict]:
        if self.model is None:
            self.load_checkpoint(params.weights_path)

        self.model.eval()
        transform = self._infer_transform()
        paths = source if isinstance(source, list) else [source]
        results = []

        for p in paths:
            img = cv2.imread(str(p))
            if img is None:
                continue
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            tensor = transform(image=img)["image"].float().unsqueeze(0).to(self.device)

            with torch.no_grad():
                probs = F.softmax(self.model(tensor), dim=1)[0]
                top_k = min(params.top_k, self.params.num_classes)
                scores, indices = probs.topk(top_k)

            results.append({
                "file": str(p),
                "predictions": [
                    {
                        "class_id":   int(indices[i]),
                        "class_name": self.params.classes[int(indices[i])],
                        "score":      round(float(scores[i]), 4),
                    }
                    for i in range(top_k)
                ],
            })
        return results

    def visualize(
        self,
        image_paths: list[Path],
        output_dir: Path,
        confidence: float = 0.5,
    ) -> list[dict]:
        output_dir.mkdir(parents=True, exist_ok=True)
        transform = self._infer_transform()
        self.model.eval()
        results = []

        for img_path in image_paths:
            img_bgr = cv2.imread(str(img_path))
            if img_bgr is None:
                continue

            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            tensor = transform(image=img_rgb)["image"].float().unsqueeze(0).to(self.device)

            with torch.no_grad():
                probs = F.softmax(self.model(tensor), dim=1)[0]
                score, cls_idx = probs.max(dim=0)
                score = float(score)
                cls_idx = int(cls_idx)

            cls_name = self.params.classes[cls_idx] if cls_idx < len(self.params.classes) else str(cls_idx)

            vis = img_bgr.copy()
            h, w = vis.shape[:2]
            label_text = f"{cls_name}: {score:.2f}"
            font_scale = max(0.5, min(w, h) / 500)
            thickness = max(1, int(font_scale * 2))
            (tw, th), baseline = cv2.getTextSize(
                label_text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
            )
            cv2.rectangle(vis, (0, 0), (tw + 10, th + baseline + 10), (0, 0, 0), -1)
            cv2.putText(vis, label_text, (5, th + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

            out_name = img_path.stem + "_viz" + img_path.suffix
            cv2.imwrite(str(output_dir / out_name), vis)

            detections = []
            if score >= confidence:
                detections.append({
                    "box":        [0, 0, w, h],
                    "score":      round(score, 4),
                    "class_id":   cls_idx,
                    "class_name": cls_name,
                })

            results.append({
                "filename":        img_path.name,
                "output_filename": out_name,
                "detections":      detections,
            })

        return results

    def evaluate_dataset(self, image_dir: Path, annotation_file: Optional[Path]) -> dict[str, float]:
        if self.model is None:
            logger.warning("evaluate_dataset called before model is loaded")
            return {}
        if annotation_file is None or not annotation_file.exists():
            logger.warning("No annotation file — skipping metrics computation")
            return {}

        ds = _ClsDataset(
            image_dir, annotation_file,
            self.params.classes, self.params.img_size, augment=False,
        )
        loader = DataLoader(ds, batch_size=self.params.batch_size, shuffle=False, num_workers=0)
        return self._eval_loader(loader, save_best=False)
