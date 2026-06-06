"""
DataContext — hides MinIO, annotation files, and sampling from AI Engineers.

What an engineer sees:
    loader = self.data.get_loader("TRAIN", my_dataset_factory, batch_size=16)
    val    = self.data.get_loader("VALIDATION", my_dataset_factory, batch_size=32)
    classes = self.data.classes

What DataContext does internally:
    1. Download images (parallel) for every dataset version in the split.
    2. Download annotation file (if present) for each version.
    3. Build Dataset objects using the engineer-supplied factory.
    4. Apply sampling strategy and return a DataLoader.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from torch.utils.data import DataLoader, Dataset

from storage.minio_io import MinioIO
from sampling.strategies import build_sampler

logger = logging.getLogger(__name__)


@dataclass
class SplitInfo:
    """Resolved paths for one role (TRAIN / VALIDATION / TEST)."""
    role:               str
    image_dirs:         list[Path]          # one dir per dataset version
    annotation_files:   list[Optional[Path]] # None if no annotation for that version
    sampling_weights:   list[float]
    has_annotations:    list[bool]


# Factory type: receives (image_dir, annotation_file) → Dataset
DatasetFactory = Callable[[Path, Optional[Path]], Dataset]


class DataContext:
    """
    Injected into BaseTrainer as ``self.data``.
    AI Engineers use only the public methods below.
    """

    def __init__(
        self,
        payload: dict,
        experiment_dir: Path,
        minio: MinioIO,
    ) -> None:
        self._payload       = payload
        self._exp_dir       = experiment_dir
        self._minio         = minio
        self._classes: list[str] = payload.get("classes", [])
        self._strategy: str      = payload.get("sampling_strategy", "CONCAT")

        # Populated after download_all()
        self._splits: dict[str, SplitInfo] = {}

    # ── Public API (used by AI Engineers) ────────────────────────────────────

    @property
    def classes(self) -> list[str]:
        return self._classes

    @property
    def num_classes(self) -> int:
        return len(self._classes)

    def has_split(self, role: str) -> bool:
        """True if at least one dataset with this role was provided."""
        return role in self._splits and bool(self._splits[role].image_dirs)

    def get_loader(
        self,
        role: str,
        dataset_factory: DatasetFactory,
        *,
        batch_size: int,
        shuffle: Optional[bool] = None,
        num_workers: int = 4,
        collate_fn: Optional[Callable] = None,
        pin_memory: bool = True,
    ) -> Optional[DataLoader]:
        """
        Build and return a DataLoader for the requested split.

        Parameters
        ----------
        role            : "TRAIN" | "VALIDATION" | "TEST"
        dataset_factory : callable(image_dir, annotation_file) → Dataset
                          Called once per dataset version in the split.
        batch_size      : batch size for the DataLoader
        shuffle         : None = auto (True for TRAIN, False otherwise)
        num_workers     : DataLoader workers
        collate_fn      : optional custom collate
        pin_memory      : pin CUDA memory

        Returns
        -------
        DataLoader, or None if no data exists for this role.
        """
        if not self.has_split(role):
            logger.info("No '%s' split — returning None", role)
            return None

        split   = self._splits[role]
        datasets: list[Dataset] = []

        for img_dir, ann_file, has_ann in zip(
            split.image_dirs, split.annotation_files, split.has_annotations
        ):
            if not has_ann:
                logger.warning(
                    "Split '%s' — dataset at %s has no annotations, skipping.", role, img_dir
                )
                continue
            ds = dataset_factory(img_dir, ann_file)
            datasets.append(ds)

        if not datasets:
            logger.warning("Split '%s' has no usable datasets after filtering.", role)
            return None

        # Apply sampling strategy (only for TRAIN with multiple datasets)
        if role == "TRAIN" and len(datasets) > 1:
            combined, sampler = build_sampler(
                datasets,
                split.sampling_weights[: len(datasets)],
                self._strategy,
            )
        else:
            from torch.utils.data import ConcatDataset
            combined = ConcatDataset(datasets) if len(datasets) > 1 else datasets[0]
            sampler  = None

        auto_shuffle = (role == "TRAIN") if shuffle is None else shuffle

        return DataLoader(
            combined,
            batch_size=batch_size,
            shuffle=(auto_shuffle and sampler is None),
            sampler=sampler,
            num_workers=num_workers,
            pin_memory=pin_memory,
            collate_fn=collate_fn,
            drop_last=(role == "TRAIN"),
        )

    # ── Infrastructure methods (called by Celery task, not by engineers) ──────

    def download_all(self) -> None:
        """
        Download images + annotation files for ALL splits.
        Called once before training starts.
        """
        raw: dict[str, list[dict]] = self._payload.get("datasets", {})

        for role, entries in raw.items():
            if not entries:
                continue

            image_dirs:       list[Path]           = []
            annotation_files: list[Optional[Path]] = []
            weights:          list[float]           = []
            has_anns:         list[bool]            = []

            for entry in entries:
                dv_id       = entry["dataset_version_id"]
                split_dir   = self._exp_dir / role / f"dv_{dv_id}"
                img_dir     = split_dir / "images"
                ann_path    = split_dir / "annotation.json"

                logger.info("[%s] Downloading dataset version %d …", role, dv_id)

                # Images
                downloaded = self._minio.download_prefix(
                    entry["images_prefix"], img_dir
                )
                if not downloaded:
                    logger.warning("[%s] dv_%d: no images downloaded", role, dv_id)

                # Annotation file
                ann_file: Optional[Path] = None
                if entry.get("has_annotations"):
                    try:
                        self._minio.download_file(entry["annotations_key"], ann_path)
                        ann_file = ann_path
                    except Exception as exc:
                        logger.warning(
                            "[%s] dv_%d: annotation download failed (%s)", role, dv_id, exc
                        )

                image_dirs.append(img_dir)
                annotation_files.append(ann_file)
                weights.append(float(entry.get("sampling_weight", 1.0)))
                has_anns.append(ann_file is not None)

            self._splits[role] = SplitInfo(
                role=role,
                image_dirs=image_dirs,
                annotation_files=annotation_files,
                sampling_weights=weights,
                has_annotations=has_anns,
            )
            logger.info("[%s] Ready: %d dataset version(s)", role, len(image_dirs))
