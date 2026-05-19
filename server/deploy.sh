#!/usr/bin/env bash
# Deploy AURIS cloud server on Azure VM (run as retailiq-key).
set -euo pipefail

APP_DIR="${APP_DIR:-/home/retailiq-key/auris-server}"
SERVICE_NAME="${SERVICE_NAME:-auris}"


echo "==> Deploying to ${APP_DIR}"
cd "${APP_DIR}"

if [ -f "./venv/bin/python3" ]; then
  PYTHON="./venv/bin/python3"
else
  PYTHON="${PYTHON:-python3}"
fi


if [ ! -d .git ]; then
  echo "Warning: not a git repo — clone or rsync first"
fi

if [ ! -f .env ]; then
  echo "Copy .env.example to .env and fill secrets before first deploy"
  exit 1
fi

echo "==> Installing dependencies"
"${PYTHON}" -m pip install -r requirements.txt



echo "==> Syntax check"
"${PYTHON}" -m py_compile main.py db.py
for f in routes/*.py spatial/*.py services/*.py; do
  "${PYTHON}" -m py_compile "$f"
done

echo "==> Restarting systemd service"
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl status "${SERVICE_NAME}" --no-pager || true

echo "==> Health check"
sleep 5
curl -sf "http://127.0.0.1:${PORT:-8000}/health" && echo "" || echo "Health check failed — check journalctl -u ${SERVICE_NAME}"


echo "Deploy complete."
