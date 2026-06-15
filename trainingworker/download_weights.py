"""
Pre-download YOLOv8 weights into YOLO_WEIGHTS_DIR during Docker build.
Run once at build time so the container works without internet at runtime.
"""
import os
import sys
from pathlib import Path

weights_dir = Path(os.environ.get("YOLO_WEIGHTS_DIR", "/opt/yolo_weights"))
weights_dir.mkdir(parents=True, exist_ok=True)

try:
    from ultralytics.utils import SETTINGS
    SETTINGS["weights_dir"] = str(weights_dir)
except Exception as e:
    print(f"SETTINGS override failed (non-fatal): {e}", file=sys.stderr)

from ultralytics import YOLO

for size in ["n", "s", "m", "l", "x"]:
    name = f"yolov8{size}.pt"
    try:
        YOLO(name)
        print(f"OK  {name}")
    except Exception as e:
        print(f"SKIP {name}: {e}", file=sys.stderr)
