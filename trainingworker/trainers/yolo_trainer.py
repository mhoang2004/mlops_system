from __future__ import annotations

import json as _json
import logging
import shutil
from pathlib import Path
from typing import Any, Optional

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from pydantic import Field

from base_trainer import BaseTrainer, BaseTrainParams, BaseInferParams, BaseMetrics

logger = logging.getLogger(__name__)


# ── Parameter schemas ─────────────────────────────────────────────────────────

class YoloTrainParams(BaseTrainParams):
    """YOLO object detection trainer — kế thừa BaseTrainParams."""

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

    iou_threshold: float = Field(
        default=0.7, ge=0.0, le=1.0,
        description="IoU threshold cho Non-Maximum Suppression",
        json_schema_extra={"ui_group": "detection"},
    )


class YoloInferParams(BaseInferParams):
    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0, description="IoU threshold cho NMS")
    max_det: int = Field(default=300, ge=1, description="Số detection tối đa mỗi ảnh")
    classes: Optional[list[int]] = Field(default=None, description="Lọc class index, None = tất cả")
    augment: bool = Field(default=False, description="Test-time augmentation")
    half: bool = Field(default=False, description="FP16 inference nếu GPU hỗ trợ")


class YoloMetrics(BaseMetrics):
    val_loss:  Optional[float] = None
    mAP50:     float = 0.0
    mAP50_95:  float = 0.0
    precision: float = 0.0
    recall:    float = 0.0


# ── Sentinel dataset for path capture ────────────────────────────────────────

class _OneSampleDataset(Dataset):
    """Returned by the factory only to satisfy DataContext; never iterated."""
    def __len__(self): return 1
    def __getitem__(self, _): return torch.zeros(1), torch.zeros(1)


# ── YOLO Trainer ──────────────────────────────────────────────────────────────

class YoloTrainer(BaseTrainer[YoloTrainParams, YoloInferParams]):
    """YOLOv8 trainer backed by Ultralytics."""

    TRAINER_KEY        = "yolo"
    TRAINER_NAME       = "YOLO Object Detection"
    TRAIN_PARAMS_CLASS = YoloTrainParams
    INFER_PARAMS_CLASS = YoloInferParams
    METRICS_CLASS      = YoloMetrics

    def __init__(self, params: YoloTrainParams, data: Any, checkpoint: Any, reporter: Any) -> None:
        super().__init__(params, data, checkpoint, reporter)
        self.params: YoloTrainParams = params
        self._ulm: Optional[Any] = None           # ultralytics YOLO instance
        self._last_metrics: dict[str, float] = {}

    # ── Main entry point — overrides BaseTrainer.fit() ────────────────────────

    def fit(self) -> dict[str, list]:
        from ultralytics import YOLO

        logger.info("=== YoloTrainer.fit() | ultralytics | device=%s ===", self.device)

        # 1. Resolve dataset paths via DataContext
        train_paths = self._capture_split_paths("TRAIN")
        val_paths   = self._capture_split_paths("VALIDATION") if self.data.has_split("VALIDATION") else []

        if not train_paths:
            raise ValueError("No TRAIN dataset provided")

        # 2. Build YOLO-format workspace (COCO JSON → YOLO txt + data.yaml)
        workspace = self.params.run_dir / "data"
        data_yaml = self._build_dataset(workspace, train_paths, val_paths)

        # 3. Load model — pretrained checkpoint > baked weights > download to weights_dir
        if self.checkpoint.has_pretrained():
            model_path = str(self.checkpoint.get_pretrained_path())
        else:
            import os
            weights_dir = Path(os.environ.get("YOLO_WEIGHTS_DIR", "/opt/yolo_weights"))
            baked = weights_dir / f"yolov8{self.params.model_size}.pt"
            if not baked.exists():
                # Pass full path so ultralytics downloads directly here (no WEIGHTS_DIR redirect).
                # Avoids curl-23 write errors that occur when writing to the user's home config dir.
                logger.warning("Baked weights not found at %s — downloading to same dir", baked)
                try:
                    from ultralytics.utils.downloads import attempt_download_asset
                    weights_dir.mkdir(parents=True, exist_ok=True)
                    attempt_download_asset(str(baked))
                except Exception as _e:
                    logger.warning("Direct download failed: %s", _e)
            model_path = str(baked) if baked.exists() else f"yolov8{self.params.model_size}.pt"
        self._ulm = YOLO(model_path)

        # 4. Wire progress callbacks
        history: dict[str, list] = {"train_loss": [], "val_metrics": []}
        p = self.params

        def _on_fit_epoch_end(trainer):
            epoch = trainer.epoch + 1
            t = trainer.tloss
            tloss = 0.0 if t is None else float(t.mean() if hasattr(t, "mean") else t)
            m = trainer.metrics or {}
            val_m: dict[str, float] = {
                "mAP50":     round(m.get("metrics/mAP50(B)", 0.0), 4),
                "mAP50_95":  round(m.get("metrics/mAP50-95(B)", 0.0), 4),
                "precision": round(m.get("metrics/precision(B)", 0.0), 4),
                "recall":    round(m.get("metrics/recall(B)", 0.0), 4),
            }
            history["train_loss"].append(tloss)
            history["val_metrics"].append(val_m)
            self._last_metrics = val_m
            self.reporter.update(epoch, p.epochs, {"train_loss": tloss, **val_m})
            try:
                import mlflow
                mlflow.log_metrics({"train_loss": tloss, **val_m}, step=epoch)
            except Exception:
                pass
            logger.info("Epoch [%d/%d] loss=%.4f val=%s", epoch, p.epochs, tloss, val_m)

        self._ulm.add_callback("on_fit_epoch_end", _on_fit_epoch_end)

        # 5. Train
        self._ulm.train(
            data=str(data_yaml),
            epochs=p.epochs,
            imgsz=p.img_size,
            batch=p.batch_size,
            lr0=p.learning_rate,
            lrf=p.lr_final,
            momentum=p.momentum,
            weight_decay=p.weight_decay,
            warmup_epochs=p.warmup_epochs,
            mosaic=p.mosaic if p.augment else 0.0,
            dropout=p.dropout,
            patience=p.patience,
            iou=p.iou_threshold,
            device=str(self.device),
            workers=0,          # Celery daemon cannot spawn child processes
            project=str(self.params.run_dir.parent),
            name=self.params.run_dir.name,
            exist_ok=True,
            verbose=False,
        )

        # 6. Finalize
        best_path = str(self._ulm.trainer.best)
        self._save_metadata(best_path)
        final = history["val_metrics"][-1] if history["val_metrics"] else {}
        self.reporter.complete(metrics=final, checkpoint_local_path=best_path)
        return history

    # ── Dataset helpers ──────────────────────────────────────────────────────

    def _capture_split_paths(self, role: str) -> list[tuple[Path, Optional[Path]]]:
        """Intercept (image_dir, annotation_file) pairs from DataContext without building DataLoaders."""
        captured: list[tuple[Path, Optional[Path]]] = []

        def _factory(image_dir: Path, annotation_file: Optional[Path]) -> Dataset:
            captured.append((image_dir, annotation_file))
            return _OneSampleDataset()

        self.data.get_loader(role, _factory, batch_size=1, num_workers=0, pin_memory=False)
        return captured

    def _build_dataset(
        self,
        workspace: Path,
        train_paths: list[tuple[Path, Optional[Path]]],
        val_paths:   list[tuple[Path, Optional[Path]]],
    ) -> Path:
        """Write YOLO txt labels and data.yaml into workspace."""
        import yaml

        self._populate_split(workspace / "train", train_paths)
        if val_paths:
            self._populate_split(workspace / "val", val_paths)

        cfg: dict = {
            "path":  str(workspace),
            "train": "train/images",
            # ultralytics requires val; fall back to train split when no val dataset provided
            "val":   "val/images" if val_paths else "train/images",
            "nc":    self.params.num_classes,
            "names": self.params.classes,
        }

        yaml_path = workspace / "data.yaml"
        yaml_path.parent.mkdir(parents=True, exist_ok=True)
        with open(yaml_path, "w") as f:
            yaml.safe_dump(cfg, f, allow_unicode=True)

        logger.info("data.yaml written → %s", yaml_path)
        return yaml_path

    def _populate_split(
        self,
        split_dir: Path,
        paths: list[tuple[Path, Optional[Path]]],
    ) -> None:
        """
        For each dataset version: symlink images into split_dir/images/ds_{i}/
        and convert COCO JSON → YOLO txt into split_dir/labels/ds_{i}/.
        """
        for i, (image_dir, annotation_file) in enumerate(paths):
            img_out = split_dir / "images" / f"ds_{i}"
            lbl_out = split_dir / "labels" / f"ds_{i}"
            img_out.mkdir(parents=True, exist_ok=True)
            lbl_out.mkdir(parents=True, exist_ok=True)

            for img_path in sorted(image_dir.glob("*")):
                if img_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
                    dst = img_out / img_path.name
                    if not dst.exists():
                        try:
                            dst.symlink_to(img_path)
                        except (OSError, NotImplementedError):
                            shutil.copy2(img_path, dst)

            if annotation_file and annotation_file.exists():
                self._coco_to_yolo_labels(annotation_file, lbl_out)
                logger.info("Converted COCO → YOLO labels: %s → %s", annotation_file, lbl_out)

    def _coco_to_yolo_labels(self, annotation_file: Path, labels_dir: Path) -> None:
        """Convert COCO JSON bbox annotations → per-image YOLO txt files."""
        with open(annotation_file) as f:
            coco = _json.load(f)

        name_to_idx = {name: i for i, name in enumerate(self.params.classes)}
        cat_to_cls: dict[int, int] = {}
        for cat in coco.get("categories", []):
            idx = name_to_idx.get(cat["name"])
            if idx is not None:
                cat_to_cls[cat["id"]] = idx

        ann_by_image: dict[int, list] = {}
        for ann in coco.get("annotations", []):
            ann_by_image.setdefault(ann["image_id"], []).append(ann)

        for img_info in coco.get("images", []):
            stem       = Path(img_info["file_name"]).stem
            label_path = labels_dir / f"{stem}.txt"
            if label_path.exists():
                continue

            iw = img_info.get("width") or 1
            ih = img_info.get("height") or 1

            lines: list[str] = []
            for ann in ann_by_image.get(img_info["id"], []):
                cls_idx = cat_to_cls.get(ann.get("category_id", -1))
                if cls_idx is None:
                    continue
                x, y, bw, bh = ann["bbox"]
                if bw <= 0 or bh <= 0:
                    continue
                cx = (x + bw / 2) / iw
                cy = (y + bh / 2) / ih
                nw = bw / iw
                nh = bh / ih
                lines.append(f"{cls_idx} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

            label_path.write_text("\n".join(lines))

    # ── Abstract method implementations (not called — fit() overrides loop) ───

    def load_dataset(self) -> tuple[DataLoader, Optional[DataLoader]]:
        raise NotImplementedError("YoloTrainer uses Ultralytics training loop")

    def load_model(self) -> nn.Module:
        raise NotImplementedError

    def configure_optimizer(self) -> tuple[torch.optim.Optimizer, Any]:
        raise NotImplementedError

    def train_step(self, batch: Any) -> float:
        raise NotImplementedError

    def evaluate(self) -> dict[str, float]:
        return self._last_metrics

    def save_checkpoint(self) -> str:
        if self._ulm is not None and hasattr(self._ulm, "trainer"):
            return str(self._ulm.trainer.best)
        raise RuntimeError("No Ultralytics model trained yet")

    def load_checkpoint(self, weights_path: str) -> None:
        from ultralytics import YOLO
        self._ulm = YOLO(weights_path)

    def infer(self, source: Any, params: YoloInferParams) -> list[dict]:
        from ultralytics import YOLO
        if self._ulm is None:
            self._ulm = YOLO(params.weights_path)
        results = self._ulm.predict(
            source,
            imgsz=params.img_size,
            conf=params.confidence,
            iou=params.iou_threshold,
            max_det=params.max_det,
            augment=params.augment,
            half=params.half,
            device=str(self.device),
            verbose=False,
        )
        output = []
        for r in results:
            boxes = r.boxes
            output.append({
                "boxes":       boxes.xyxy.tolist(),
                "scores":      boxes.conf.tolist(),
                "class_ids":   boxes.cls.int().tolist(),
                "class_names": [self.params.classes[int(c)] for c in boxes.cls],
            })
        return output

    def evaluate_dataset(self, image_dir: Path, annotation_file: Optional[Path]) -> dict[str, float]:
        if self._ulm is None:
            logger.warning("evaluate_dataset called before model is loaded")
            return {}
        if annotation_file is None or not annotation_file.exists():
            return {}
        workspace = self.params.run_dir / "eval_tmp"
        data_yaml = self._build_dataset(workspace, [(image_dir, annotation_file)], [])
        metrics = self._ulm.val(data=str(data_yaml), split="train", verbose=False, workers=0)
        m = metrics.results_dict
        return {
            "mAP50":     round(m.get("metrics/mAP50(B)", 0.0), 4),
            "mAP50_95":  round(m.get("metrics/mAP50-95(B)", 0.0), 4),
            "precision": round(m.get("metrics/precision(B)", 0.0), 4),
            "recall":    round(m.get("metrics/recall(B)", 0.0), 4),
        }
