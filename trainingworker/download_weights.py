"""
Pre-download YOLOv8 weights into YOLO_WEIGHTS_DIR during Docker build.

Key: YOLO_CONFIG_DIR must be set before ANY ultralytics import so that the
module-level WEIGHTS_DIR constant is initialised with the right path.
"""
import os
import shutil
import sys
from pathlib import Path

weights_dir = Path(os.environ.get("YOLO_WEIGHTS_DIR", "/opt/yolo_weights"))
weights_dir.mkdir(parents=True, exist_ok=True)

# Redirect ultralytics config + weights cache into our directory.
# WEIGHTS_DIR = YOLO_CONFIG_DIR / "weights" — set BEFORE any ultralytics import.
os.environ["YOLO_CONFIG_DIR"] = str(weights_dir / ".ult")

from ultralytics import YOLO  # noqa: E402  (import after env set)
from ultralytics.utils import WEIGHTS_DIR  # noqa: E402

print(f"ultralytics WEIGHTS_DIR: {WEIGHTS_DIR}", flush=True)

for size in ["n", "s", "m", "l", "x"]:
    name = f"yolov8{size}.pt"
    dst = weights_dir / name
    if dst.exists() and dst.stat().st_size > 1_000_000:
        print(f"EXISTS  {name}", flush=True)
        continue
    try:
        YOLO(name)  # downloads to WEIGHTS_DIR
        src = WEIGHTS_DIR / name
        if src.exists():
            shutil.copy2(src, dst)
            print(f"OK      {name}  ({dst.stat().st_size:,} bytes)", flush=True)
        else:
            print(f"WARN    {name}: not found at {src}", file=sys.stderr)
    except Exception as e:
        print(f"SKIP    {name}: {e}", file=sys.stderr)
