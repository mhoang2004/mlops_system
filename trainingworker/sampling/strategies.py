"""
Sampling strategies for multi-dataset training.

Given N Dataset objects (one per dataset version) and their weights,
build a (combined_dataset, sampler) pair ready for DataLoader.

  CONCAT      — ConcatDataset, uniform shuffle (weights ignored).
  WEIGHTED    — ConcatDataset + WeightedRandomSampler (honours weights).
  ROUND_ROBIN — Alternates batches across datasets; runs until the largest is exhausted.
"""
from __future__ import annotations

import itertools
from typing import Iterator

import torch
from torch.utils.data import ConcatDataset, Dataset, Sampler, WeightedRandomSampler


# ── Public factory ────────────────────────────────────────────────────────────

def build_sampler(
    datasets: list[Dataset],
    weights: list[float],
    strategy: str,
    *,
    replacement: bool = True,
) -> tuple[Dataset, Sampler | None]:
    """
    Parameters
    ----------
    datasets   : list of Dataset objects (one per dataset version)
    weights    : sampling weight per dataset (same length as datasets)
    strategy   : "CONCAT" | "WEIGHTED" | "ROUND_ROBIN"
    replacement: used only by WEIGHTED (WeightedRandomSampler default = True)

    Returns
    -------
    (combined_dataset, sampler)
      - sampler is None for CONCAT (DataLoader will shuffle internally)
      - sampler is WeightedRandomSampler for WEIGHTED
      - sampler is RoundRobinSampler for ROUND_ROBIN
    """
    if len(datasets) == 1:
        return datasets[0], None

    if strategy == "CONCAT":
        return ConcatDataset(datasets), None

    if strategy == "WEIGHTED":
        return _build_weighted(datasets, weights, replacement=replacement)

    if strategy == "ROUND_ROBIN":
        return _build_round_robin(datasets)

    raise ValueError(f"Unknown sampling strategy: {strategy!r}")


# ── Strategy implementations ──────────────────────────────────────────────────

def _build_weighted(
    datasets: list[Dataset],
    weights: list[float],
    *,
    replacement: bool,
) -> tuple[ConcatDataset, WeightedRandomSampler]:
    """
    Assign per-sample weights proportional to the dataset-level weight
    divided by dataset size, so each dataset contributes `weight` fraction
    of samples regardless of its raw size.
    """
    combined = ConcatDataset(datasets)
    total_w  = sum(weights)

    sample_weights: list[float] = []
    for ds, w in zip(datasets, weights):
        per_sample = (w / total_w) / max(len(ds), 1)   # type: ignore[arg-type]
        sample_weights.extend([per_sample] * len(ds))   # type: ignore[arg-type]

    sampler = WeightedRandomSampler(
        weights=torch.tensor(sample_weights, dtype=torch.float64),
        num_samples=len(combined),
        replacement=replacement,
    )
    return combined, sampler


def _build_round_robin(datasets: list[Dataset]) -> tuple[ConcatDataset, "RoundRobinSampler"]:
    combined = ConcatDataset(datasets)
    sampler  = RoundRobinSampler(datasets)
    return combined, sampler


class RoundRobinSampler(Sampler):
    """
    Yields indices by alternating across datasets in round-robin order.
    Continues until the *largest* dataset has been exhausted (shorter
    datasets cycle from the beginning if needed).
    """

    def __init__(self, datasets: list[Dataset]) -> None:
        super().__init__()
        self.datasets = datasets
        # Cumulative start index for each dataset in the ConcatDataset
        self._offsets: list[int] = []
        offset = 0
        for ds in datasets:
            self._offsets.append(offset)
            offset += len(ds)   # type: ignore[arg-type]
        self._total = offset

    def __len__(self) -> int:
        return self._total

    def __iter__(self) -> Iterator[int]:
        # Build per-dataset index cycles
        cycles = [
            itertools.cycle(torch.randperm(len(ds)).tolist())   # type: ignore[arg-type]
            for ds in self.datasets
        ]
        max_len = max(len(ds) for ds in self.datasets)   # type: ignore[arg-type]

        for _ in range(max_len):
            for ds_idx, cycle in enumerate(cycles):
                local_idx = next(cycle)
                yield self._offsets[ds_idx] + local_idx
