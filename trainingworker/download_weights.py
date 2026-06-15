"""
Pre-download YOLOv8 weights into /opt/yolo_weights during Docker build.

Key: pass the FULL destination path to attempt_download_asset.
When the path contains a directory separator, ultralytics downloads directly
to that path instead of redirecting to its internal WEIGHTS_DIR.
"""
import sys
from pathlib import Path

from ultralytics.utils.downloads import attempt_download_asset

DEST = Path("/opt/yolo_weights")
DEST.mkdir(parents=True, exist_ok=True)

failed = []
for size in ["n", "s", "m", "l", "x"]:
    name = f"yolov8{size}.pt"
    dst = DEST / name
    try:
        attempt_download_asset(str(dst))  # full path → no WEIGHTS_DIR redirect
        sz = dst.stat().st_size if dst.exists() else 0
        if sz > 1_000_000:
            print(f"OK    {name}  ({sz:,} bytes)", flush=True)
        else:
            print(f"FAIL  {name}: too small or missing ({sz} bytes)", file=sys.stderr)
            failed.append(name)
    except Exception as e:
        print(f"FAIL  {name}: {e}", file=sys.stderr)
        failed.append(name)

if failed:
    print(f"ERROR: weight download failed for {failed}", file=sys.stderr)
    sys.exit(1)  # fail the Docker build so the problem is visible
