# AURIS Cloud Server (Phase 2)

FastAPI backend for the AURIS platform: frame ingest, spatial calibration, analytics, alerts, and training hooks.

## Features

- **Frame pipeline**: YOLOv8m + DeepSort, zone counting, fire detection, metre positions via homography
- **Calibration**: LDM ground control points, QR scale hints, optional SfM auto-run
- **Spatial API**: SVG floor maps, live positions, heatmaps
- **Alerts**: Twilio WhatsApp (fire, overcrowding, camera offline)
- **Training**: Hard cases and pseudo-labels with admin review
- **Re-ID** (optional): OSNet embeddings when `REID_ENABLED=true`

## Quick start (local)

```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit MONGODB_URI, ADMIN_KEY, etc.
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Environment

See `.env.example` for all variables. Never commit `.env`.

## VM deploy

```bash
# On your machine — sync to VM
scp -r . retailiq-key@<vm-ip>:/home/retailiq-key/auris-server/

# On VM
cd /home/retailiq-key/auris-server
chmod +x deploy.sh
./deploy.sh
```

Ensure `auris.service` runs `uvicorn main:app` from this directory.

## API overview

| Endpoint | Auth |
|----------|------|
| `POST /api/login` | Body: store_id, password |
| `GET /api/today`, `/live`, `/hourly`, `/zones` | X-Store-ID, X-Password |
| `POST /api/frames` | X-API-Key |
| `GET /api/spatial/*` | X-Store-ID, X-Password |
| `GET /api/calibration/*` | X-Store-ID or X-API-Key |
| `GET /admin/stores` | X-Admin-Key |

## Edge devices

Point `CLOUD_ENDPOINT` to `https://<host>/api/frames` and set `CLOUD_API_KEY` from admin store creation.

Heartbeat: `POST /api/edge/heartbeat` every 60s from edge worker.
