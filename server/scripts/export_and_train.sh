#!/bin/bash
# AURIS One-Command: Export training data + fine-tune YOLOv8s + hot-swap model
# Usage: ADMIN_KEY=your_key bash export_and_train.sh
set -e

ADMIN_KEY=${ADMIN_KEY:-"dcd62cb40e5fa0870d73c79fbd521d05"}
API_BASE=${API_BASE:-"https://auris.skymlabs.com"}
SERVER_DIR=${SERVER_DIR:-"/home/retailiq-key/auris-server"}
TRAIN_DIR="/tmp/auris_train_$(date +%Y%m%d_%H%M%S)"
RUN_NAME="auris_$(date +%Y%m%d)"

echo "=== AURIS Training Pipeline ==="
echo "API: $API_BASE"
echo "Output: $TRAIN_DIR"
mkdir -p "$TRAIN_DIR/full" "$TRAIN_DIR/hard" "$TRAIN_DIR/merged/images" "$TRAIN_DIR/merged/labels"

echo "[1/6] Exporting full-frame training data..."
curl -sf -o "$TRAIN_DIR/full.zip" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  "$API_BASE/api/training/export-yolo-full" \
  || { echo "WARN: full-frame export failed or empty — continuing"; }

echo "[2/6] Exporting hard cases..."
curl -sf -o "$TRAIN_DIR/hard.zip" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  "$API_BASE/api/training/export-yolo" \
  || { echo "WARN: hard case export failed or empty — continuing"; }

echo "[3/6] Unpacking and merging datasets..."
[ -f "$TRAIN_DIR/full.zip" ] && unzip -q -o "$TRAIN_DIR/full.zip" -d "$TRAIN_DIR/full/" || true
[ -f "$TRAIN_DIR/hard.zip" ] && unzip -q -o "$TRAIN_DIR/hard.zip" -d "$TRAIN_DIR/hard/" || true

# Merge images and labels
[ -d "$TRAIN_DIR/full/images" ] && cp "$TRAIN_DIR/full/images/"* "$TRAIN_DIR/merged/images/" 2>/dev/null || true
[ -d "$TRAIN_DIR/full/labels" ] && cp "$TRAIN_DIR/full/labels/"* "$TRAIN_DIR/merged/labels/" 2>/dev/null || true
[ -d "$TRAIN_DIR/hard/images" ] && cp "$TRAIN_DIR/hard/images/"* "$TRAIN_DIR/merged/images/" 2>/dev/null || true
[ -d "$TRAIN_DIR/hard/labels" ] && cp "$TRAIN_DIR/hard/labels/"* "$TRAIN_DIR/merged/labels/" 2>/dev/null || true

IMG_COUNT=$(ls "$TRAIN_DIR/merged/images" 2>/dev/null | wc -l)
echo "    Total images: $IMG_COUNT"

if [ "$IMG_COUNT" -lt 20 ]; then
  echo "ERROR: Not enough training images ($IMG_COUNT). Need at least 20. Collect more data first."
  exit 1
fi

# Write merged dataset.yaml
cat > "$TRAIN_DIR/merged/dataset.yaml" <<EOF
path: $TRAIN_DIR/merged
train: images
val: images

nc: 1
names:
  0: person
EOF

echo "[4/6] Starting YOLOv8s fine-tune (50 epochs)..."
yolo detect train \
  model=yolov8s.pt \
  data="$TRAIN_DIR/merged/dataset.yaml" \
  epochs=50 \
  imgsz=640 \
  batch=8 \
  project="$TRAIN_DIR/runs" \
  name="$RUN_NAME" \
  exist_ok=True \
  patience=15 \
  save=True \
  verbose=False

BEST_PT="$TRAIN_DIR/runs/$RUN_NAME/weights/best.pt"
if [ ! -f "$BEST_PT" ]; then
  echo "ERROR: Training failed — best.pt not found"
  exit 1
fi

echo "[5/6] Exporting to ONNX..."
python3 -c "
from ultralytics import YOLO
import shutil
m = YOLO('$BEST_PT')
m.export(format='onnx', imgsz=640, simplify=True)
best_onnx = '$BEST_PT'.replace('.pt', '.onnx')
# Backup old model
import os
old = '$SERVER_DIR/yolov8s.onnx'
if os.path.exists(old):
    shutil.copy(old, old + '.backup')
    print('Old model backed up.')
shutil.copy(best_onnx, old)
print('New model installed: ' + old)
"

echo "[6/6] Restarting auris service..."
sudo systemctl restart auris
sleep 3
sudo systemctl is-active auris && echo "Service: RUNNING" || echo "ERROR: Service failed to start"

echo ""
echo "=== Training complete ==="
echo "Images used:   $IMG_COUNT"
echo "Model updated: $SERVER_DIR/yolov8s.onnx"
echo "Backup saved:  $SERVER_DIR/yolov8s.onnx.backup"
echo "Run 'curl https://auris.skymlabs.com/health' to confirm."
