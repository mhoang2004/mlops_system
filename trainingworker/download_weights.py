"""
Pre-download YOLOv8 weights and fonts into the image at build time.

- Fonts  → /opt/yolo_weights/.ult/  (= YOLO_CONFIG_DIR = USER_CONFIG_DIR)
- Weights → /opt/yolo_weights/

Uses urllib.request (Python stdlib) for fonts to bypass ultralytics' curl wrapper.
Uses attempt_download_asset(full_path) for weights so it downloads directly there.
"""
import sys
import urllib.request
from pathlib import Path

from ultralytics.utils.downloads import attempt_download_asset

WEIGHTS_DIR = Path("/opt/yolo_weights")
FONT_DIR = Path("/opt/yolo_weights/.ult")  # matches YOLO_CONFIG_DIR env
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
FONT_DIR.mkdir(parents=True, exist_ok=True)

# ── Fonts (urllib, not curl) ───────────────────────────────────────────────────
for font in ["Arial.ttf", "Arial.Unicode.ttf"]:
    dst = FONT_DIR / font
    if dst.exists():
        print(f"EXISTS  {font}", flush=True)
        continue
    try:
        urllib.request.urlretrieve(f"https://ultralytics.com/assets/{font}", dst)
        print(f"OK      {font}  ({dst.stat().st_size:,} bytes)", flush=True)
    except Exception as e:
        print(f"WARN    {font}: {e}", file=sys.stderr)

# ── Model weights ──────────────────────────────────────────────────────────────
# Pass full path → attempt_download_asset skips WEIGHTS_DIR redirect and writes directly here.
failed = []
for size in ["n", "s", "m", "l", "x"]:
    name = f"yolov8{size}.pt"
    dst = WEIGHTS_DIR / name
    try:
        attempt_download_asset(str(dst))
        sz = dst.stat().st_size if dst.exists() else 0
        if sz > 1_000_000:
            print(f"OK      {name}  ({sz:,} bytes)", flush=True)
        else:
            print(f"FAIL    {name}: too small or missing ({sz} bytes)", file=sys.stderr)
            failed.append(name)
    except Exception as e:
        print(f"FAIL    {name}: {e}", file=sys.stderr)
        failed.append(name)

if failed:
    print(f"ERROR: weight download failed for {failed}", file=sys.stderr)
    sys.exit(1)
