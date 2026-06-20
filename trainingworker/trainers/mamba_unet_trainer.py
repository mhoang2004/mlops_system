"""
Mamba-UNet segmentation trainer — integrates the legacy mamba-unet codebase.

Dataset format expected in MinIO:
  annotations/ prefix → individual PNG mask files named identically to images
  files/ prefix       → input images (jpg/png)
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn
from pydantic import Field
from torch.utils.data import DataLoader, Dataset, ConcatDataset

# Expose legacy code to import system
_LEGACY_ROOT = Path(__file__).parent.parent / "models" / "mamba-unet"
if str(_LEGACY_ROOT) not in sys.path:
    sys.path.insert(0, str(_LEGACY_ROOT))

from base_trainer import BaseTrainer, BaseTrainParams, BaseInferParams, BaseMetrics

logger = logging.getLogger(__name__)

_IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# ── Parameter schemas ─────────────────────────────────────────────────────────

class MambaUNetTrainParams(BaseTrainParams):
    """Mamba-UNet medical image segmentation parameters."""

    img_size: int = Field(
        default=512, ge=64,
        description="Kích thước ảnh đầu vào (pixels, chia hết cho 32)",
        json_schema_extra={"ui_group": "model"},
    )
    embed_dim: int = Field(
        default=96, ge=24,
        description="Chiều rộng model (embed dimension)",
        json_schema_extra={"ui_group": "model", "ui_options": [24, 48, 96, 128]},
    )
    depths: list[int] = Field(
        default=[2, 2, 9, 2],
        description="Số VSS block mỗi tầng encoder [stage1, stage2, stage3, stage4]",
        json_schema_extra={"ui_hidden": True},
    )
    drop_path_rate: float = Field(
        default=0.2, ge=0.0, le=0.5,
        description="Stochastic depth drop rate",
        json_schema_extra={"ui_group": "model"},
    )
    loss_version: str = Field(
        default="improved",
        description="Loss: basic (CE+Dice) | improved (CE+Dice+Focal) | advanced",
        json_schema_extra={"ui_group": "training", "ui_options": ["basic", "improved", "advanced"]},
    )
    warmup_epochs: int = Field(
        default=10, ge=0,
        description="Số epoch warmup learning rate từ 0 lên full LR",
        json_schema_extra={"ui_group": "training"},
    )
    early_stop_patience: int = Field(
        default=25, ge=5,
        description="Dừng sớm nếu Dice không cải thiện sau N epoch",
        json_schema_extra={"ui_group": "training"},
    )
    # Override base default for segmentation
    epochs: int = Field(
        default=90, ge=1,
        description="Số epoch training tối đa",
        json_schema_extra={"ui_group": "training"},
    )
    learning_rate: float = Field(
        default=2e-4, gt=0,
        description="Learning rate ban đầu (AdamW)",
        json_schema_extra={"ui_group": "training"},
    )


class MambaUNetInferParams(BaseInferParams):
    img_size:  int   = Field(default=512, ge=64)
    threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Ngưỡng binary mask")


class MambaUNetMetrics(BaseMetrics):
    dice:      float = 0.0
    iou:       float = 0.0
    precision: float = 0.0
    recall:    float = 0.0


# ── Dataset adapter ───────────────────────────────────────────────────────────

class _SegDataset(Dataset):
    """
    Pairs images with PNG mask files of the same stem.
    Masks are stored in the annotations/ prefix (downloaded to mask_dir).
    If mask_dir is None or a mask is missing, returns a zero mask (unsupervised).
    """

    def __init__(
        self,
        image_dir: Path,
        mask_dir: Optional[Path],
        img_size: int,
        augment: bool,
    ) -> None:
        import albumentations as A
        from albumentations.pytorch import ToTensorV2

        self.image_dir = image_dir
        self.mask_dir  = mask_dir
        self.img_size  = img_size
        self.images    = sorted(p for p in image_dir.iterdir() if p.suffix.lower() in _IMG_EXTS)

        if augment:
            self.transform = A.Compose([
                A.Resize(img_size, img_size),
                A.HorizontalFlip(p=0.5),
                A.ShiftScaleRotate(shift_limit=0.1, scale_limit=0.1, rotate_limit=15, p=0.5),
                A.RandomBrightnessContrast(p=0.3),
                A.GaussNoise(p=0.2),
                A.CLAHE(p=0.3),
                A.Normalize(mean=0.5, std=0.5),
                ToTensorV2(),
            ])
        else:
            self.transform = A.Compose([
                A.Resize(img_size, img_size),
                A.CLAHE(p=1.0),
                A.Normalize(mean=0.5, std=0.5),
                ToTensorV2(),
            ])

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, idx: int):
        img_path = self.images[idx]
        img = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            img = np.zeros((self.img_size, self.img_size), dtype=np.uint8)

        mask = np.zeros(img.shape[:2], dtype=np.uint8)
        if self.mask_dir is not None:
            for ext in (".png", ".jpg", img_path.suffix):
                candidate = self.mask_dir / (img_path.stem + ext)
                if candidate.exists():
                    raw = cv2.imread(str(candidate), cv2.IMREAD_GRAYSCALE)
                    if raw is not None:
                        mask = (raw > 127).astype(np.uint8)
                    break

        out = self.transform(image=img, mask=mask)
        return out["image"].float(), out["mask"].long()


# ── Trainer ───────────────────────────────────────────────────────────────────

class MambaUNetTrainer(BaseTrainer[MambaUNetTrainParams, MambaUNetInferParams]):
    """Mamba-UNet medical image segmentation trainer."""

    TRAINER_KEY        = "mamba_unet"
    TRAINER_NAME       = "Mamba-UNet Segmentation"
    TRAIN_PARAMS_CLASS = MambaUNetTrainParams
    INFER_PARAMS_CLASS = MambaUNetInferParams
    METRICS_CLASS      = MambaUNetMetrics

    def __init__(self, params: MambaUNetTrainParams, data: Any, checkpoint: Any, reporter: Any) -> None:
        super().__init__(params, data, checkpoint, reporter)
        self._num_classes = max(2, len(params.classes))

    # ── Main entry point (overrides BaseTrainer.fit) ──────────────────────────

    def fit(self) -> dict[str, list]:
        from models.mamba_unet import create_mamba_unet
        from utils.losses import get_loss

        logger.info("=== MambaUNetTrainer.fit() | device=%s ===", self.device)
        p = self.params

        train_paths = self._capture_split_paths("TRAIN")
        if not train_paths:
            raise ValueError("No TRAIN dataset provided")
        val_paths = self._capture_split_paths("VALIDATION") if self.data.has_split("VALIDATION") else []

        train_loader = self._build_loader(train_paths, augment=True)
        val_loader   = self._build_loader(val_paths,   augment=False) if val_paths else None

        self.model = create_mamba_unet(
            img_size=p.img_size,
            embed_dim=p.embed_dim,
            depths=p.depths,
            num_classes=self._num_classes,
            drop_path_rate=p.drop_path_rate,
        ).to(self.device)

        if self.checkpoint.has_pretrained():
            self.load_checkpoint(str(self.checkpoint.get_pretrained_path()))

        optimizer  = torch.optim.AdamW(self.model.parameters(), lr=p.learning_rate, weight_decay=p.weight_decay)
        scheduler  = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=max(1, p.epochs - p.warmup_epochs), eta_min=p.learning_rate * 0.01,
        )
        criterion  = get_loss(version=p.loss_version)
        use_amp    = self.device.type == "cuda"
        scaler     = torch.cuda.amp.GradScaler() if use_amp else None

        history      = {"train_loss": [], "val_metrics": []}
        best_dice    = 0.0
        patience_ctr = 0
        best_path: Optional[str] = None

        self.reporter._update_status("RUNNING")

        for epoch in range(p.epochs):
            # Linear warmup
            if epoch < p.warmup_epochs:
                factor = (epoch + 1) / max(p.warmup_epochs, 1)
                for pg in optimizer.param_groups:
                    pg["lr"] = p.learning_rate * factor

            train_loss = self._train_epoch(train_loader, optimizer, criterion, scaler)
            val_m      = self._eval_loader(val_loader) if val_loader else {}

            history["train_loss"].append(train_loss)
            history["val_metrics"].append(val_m)

            if epoch >= p.warmup_epochs:
                scheduler.step()

            self.reporter.update(epoch + 1, p.epochs, {"train_loss": train_loss, **val_m})
            logger.info("Epoch [%d/%d] loss=%.4f val=%s", epoch + 1, p.epochs, train_loss, val_m)

            dice = val_m.get("dice", 0.0)
            if dice > best_dice or best_path is None:
                best_dice    = dice
                patience_ctr = 0
                best_path    = self._save_best()
            else:
                patience_ctr += 1
                if patience_ctr >= p.early_stop_patience:
                    logger.info("Early stopping at epoch %d (best dice=%.4f)", epoch + 1, best_dice)
                    break

        if best_path is None:
            best_path = self._save_best()

        self._save_metadata(best_path)
        final = history["val_metrics"][-1] if history["val_metrics"] else {}
        self.reporter.complete(metrics=final, checkpoint_local_path=best_path)
        return history

    # ── Training / evaluation helpers ─────────────────────────────────────────

    def _train_epoch(self, loader: DataLoader, optimizer, criterion, scaler) -> float:
        self.model.train()
        total = 0.0
        for imgs, masks in loader:
            imgs, masks = imgs.to(self.device), masks.to(self.device)
            optimizer.zero_grad()
            if scaler:
                with torch.cuda.amp.autocast():
                    loss = criterion(self.model(imgs), masks)
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 0.5)
                scaler.step(optimizer)
                scaler.update()
            else:
                loss = criterion(self.model(imgs), masks)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 0.5)
                optimizer.step()
            total += loss.item()
        return total / max(len(loader), 1)

    @torch.no_grad()
    def _eval_loader(self, loader: DataLoader) -> dict[str, float]:
        from utils.metrics import compute_all_metrics
        self.model.eval()
        preds_list, masks_list = [], []
        for imgs, masks in loader:
            logits = self.model(imgs.to(self.device))
            preds_list.append(logits.argmax(dim=1).cpu())
            masks_list.append(masks)
        preds_t = torch.cat(preds_list)
        masks_t = torch.cat(masks_list)
        m = compute_all_metrics(preds_t, masks_t)
        return {k: round(float(m.get(k, 0)), 4) for k in ("dice", "iou", "precision", "recall")}

    def _save_best(self) -> str:
        out = self.params.run_dir / "best.pt"
        out.parent.mkdir(parents=True, exist_ok=True)
        torch.save({"model_state": self.model.state_dict(), "params": self.params.model_dump()}, out)
        return str(out)

    def _capture_split_paths(self, role: str) -> list[tuple[Path, Optional[Path]]]:
        captured: list[tuple[Path, Optional[Path]]] = []

        class _Stub(Dataset):
            def __len__(self): return 0
            def __getitem__(self, _): return torch.zeros(1), torch.zeros(1)

        def _factory(image_dir: Path, annotation_file: Optional[Path]) -> Dataset:
            captured.append((image_dir, annotation_file))
            return _Stub()

        self.data.get_loader(role, _factory, batch_size=1, num_workers=0, pin_memory=False)
        return captured

    def _build_loader(self, paths: list[tuple[Path, Optional[Path]]], augment: bool) -> DataLoader:
        datasets = []
        for image_dir, annotation_file in paths:
            mask_dir = annotation_file.parent if (annotation_file and annotation_file.exists()) else None
            ds = _SegDataset(image_dir, mask_dir, self.params.img_size, augment)
            if len(ds) > 0:
                datasets.append(ds)
        if not datasets:
            raise ValueError("No images found in provided dataset paths")
        combined = ConcatDataset(datasets) if len(datasets) > 1 else datasets[0]
        return DataLoader(
            combined,
            batch_size=self.params.batch_size,
            shuffle=augment,
            num_workers=0,
            pin_memory=self.device.type == "cuda",
        )

    # ── Abstract method implementations ───────────────────────────────────────

    def load_dataset(self):
        raise NotImplementedError("MambaUNetTrainer overrides fit() directly")

    def load_model(self) -> nn.Module:
        from models.mamba_unet import create_mamba_unet
        p = self.params
        return create_mamba_unet(
            img_size=p.img_size,
            embed_dim=p.embed_dim,
            depths=p.depths,
            num_classes=self._num_classes,
            drop_path_rate=p.drop_path_rate,
        )

    def configure_optimizer(self):
        raise NotImplementedError("MambaUNetTrainer overrides fit() directly")

    def train_step(self, batch: Any) -> float:
        raise NotImplementedError("MambaUNetTrainer overrides fit() directly")

    def evaluate(self) -> dict[str, float]:
        return {}

    def save_checkpoint(self) -> str:
        return self._save_best()

    def load_checkpoint(self, weights_path: str) -> None:
        ckpt  = torch.load(weights_path, map_location=self.device)
        state = ckpt.get("model_state", ckpt)
        if self.model is None:
            self.model = self.load_model().to(self.device)
        self.model.load_state_dict(state, strict=False)
        logger.info("Loaded checkpoint: %s", weights_path)

    def infer(self, source: Any, params: MambaUNetInferParams) -> np.ndarray:
        import albumentations as A
        from albumentations.pytorch import ToTensorV2

        if self.model is None:
            self.load_checkpoint(params.weights_path)

        transform = A.Compose([
            A.Resize(params.img_size, params.img_size),
            A.CLAHE(p=1.0),
            A.Normalize(mean=0.5, std=0.5),
            ToTensorV2(),
        ])
        img = cv2.imread(str(source), cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Cannot read image: {source}")
        tensor = transform(image=img)["image"].float().unsqueeze(0).to(self.device)
        self.model.eval()
        with torch.no_grad():
            logits = self.model(tensor)
            probs  = torch.softmax(logits, dim=1)[0, 1].cpu().numpy()
        return (probs > params.threshold).astype(np.uint8)

    def evaluate_dataset(self, image_dir: Path, annotation_file: Optional[Path]) -> dict[str, float]:
        if self.model is None:
            logger.warning("evaluate_dataset called before model is loaded")
            return {}
        mask_dir = annotation_file.parent if (annotation_file and annotation_file.exists()) else None
        if mask_dir is None:
            logger.warning("No annotation masks found — skipping metrics computation")
            return {}
        loader = self._build_loader([(image_dir, annotation_file)], augment=False)
        return self._eval_loader(loader)

    def visualize(
        self,
        image_paths: list[Path],
        output_dir: Path,
        confidence: float = 0.5,
    ) -> list[dict]:
        import albumentations as A
        from albumentations.pytorch import ToTensorV2

        output_dir.mkdir(parents=True, exist_ok=True)
        p = self.params

        transform = A.Compose([
            A.Resize(p.img_size, p.img_size),
            A.CLAHE(p=1.0),
            A.Normalize(mean=0.5, std=0.5),
            ToTensorV2(),
        ])

        self.model.eval()
        results = []

        for img_path in image_paths:
            orig = cv2.imread(str(img_path))
            if orig is None:
                continue
            orig_h, orig_w = orig.shape[:2]
            gray = cv2.cvtColor(orig, cv2.COLOR_BGR2GRAY)

            tensor = transform(image=gray)["image"].float().unsqueeze(0).to(self.device)
            with torch.no_grad():
                probs = torch.softmax(self.model(tensor), dim=1)[0, 1].cpu().numpy()

            mask = cv2.resize(
                (probs > confidence).astype(np.uint8),
                (orig_w, orig_h),
                interpolation=cv2.INTER_NEAREST,
            )

            # Green semi-transparent overlay
            overlay = orig.copy()
            green = np.zeros_like(orig)
            green[:, :] = (0, 200, 0)
            overlay[mask == 1] = cv2.addWeighted(orig, 0.5, green, 0.5, 0)[mask == 1]

            out_name = img_path.stem + "_viz" + img_path.suffix
            cv2.imwrite(str(output_dir / out_name), overlay)

            pixel_count = int(mask.sum())
            coverage    = round(pixel_count / max(orig_h * orig_w, 1), 4)
            class_name  = p.classes[0] if p.classes else "foreground"

            results.append({
                "filename":        img_path.name,
                "output_filename": out_name,
                "detections": [{
                    "box":        [0, 0, orig_w, orig_h],
                    "score":      coverage,
                    "class_id":   0,
                    "class_name": class_name,
                }] if pixel_count > 0 else [],
            })

        return results
