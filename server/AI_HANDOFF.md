# 🚀 AURIS AI — Comprehensive Project Handoff

Welcome! This document provides a exhaustive, production-ready handoff for the **AURIS Computer Vision Platform**. It details the system architecture, product requirements (PRD), recent architectural upgrades, server migration configurations, and the exact roadmap of future tasks.

---

## 📂 1. System Architecture & Codebase Layout

AURIS is structured as a modern monorepo separating edge processing, cloud ingestion/analytics, and frontend clients.

### Key Subdirectories
- **`/edge`**: Source code running on physical edge devices (Intel N100 mini PCs).
  - `edge/src/edge_worker.py`: Core camera streaming, MOG2 motion detection, frame compression, and cloud-push loop.
  - `edge/provision.py`: Local provisioning script for onboarding edge cameras.
- **`/server`**: FastAPI backend server coordinating state, ingestion, and dashboard APIs.
  - `server/routes/frames.py`: Dynamic image ingestion pipeline (YOLOv8, face blurring, DeepSort, and stream caches).
  - `server/routes/factory.py`: Configuration templates and factory state endpoints.
  - `server/routes/admin.py`: Admin tools, visualization, and edge asset downloads.
  - `server/db.py`: Database client establishing connections to Microsoft Azure Cosmos DB (MongoDB API compatible).
- **`/dashboard`**: Static web assets for operations.
  - `dashboard/auris-hq`: Operations panel for administrative tasks (`hq.skymlabs.com`).
  - `dashboard`: General client analytics portal (`auris.skymlabs.com`).

---

## 🛠️ 2. Core Functional Requirements (PRD & PMP)

The AURIS pipeline has recently undergone three critical structural transformations:

### A. Full-Frame Inference Migration
- **Edge Side**: Deleted crop-merging and localized crop extraction (`extract_crops` and `merge_overlapping_crops` removed). The edge device now compresses the **full frame to JPEG at 60% quality** on every single frame where MOG2 motion is detected, enqueuing it as `full_frame_b64`.
- **Server Side**: `run_inference_and_tracking` in `server/routes/frames.py` decodes the full frame and executes YOLOv8 exactly **once** (`conf=0.25, classes=[0]`) rather than on multiple sub-crops. This simplifies edge processing and guarantees higher tracking consistency.

### B. OpenCV Face Blurring
- **Helper Logic**: Created `blur_faces` utilizing OpenCV's Gaussian Blur:
  ```python
  def blur_faces(frame, detections):
      for det in detections:
          x1, y1, x2, y2 = det['bbox_abs']
          face_h = int((y2 - y1) * 0.35)  # Targets the top 35% of the bounding box
          face_region = frame[int(y1):int(y1)+face_h, int(x1):int(x2)]
          if face_region.size > 0:
              blurred = cv2.GaussianBlur(face_region, (99, 99), 30)
              frame[int(y1):int(y1)+face_h, int(x1):int(x2)] = blurred
      return frame
  ```
- **Security Order**: Face blurring is applied *immediately* after YOLO detection on the full image. All downstream tracking (DeepSort) and training crop generation (pseudo labels / hard cases) extract from the *already blurred* image, ensuring no unanonymized faces are stored in active storage collections.

### C. Client Privacy Mode (`privacy_mode`)
- **Default Resolution**: Automatically infers `privacy_mode = True` for any store whose ID or name contains `"hospital"` or `"hosp"`, otherwise defaulting to `False` (factories/retail).
- **Anonymized Telemetry**: If `privacy_mode` is enabled for the client:
  - The server skips storing base64 frame images in the in-memory cache `latest_frames`. Only telemetry counts (`people_now`) and metadata are recorded.
  - The live MJPEG stream and JPEG snapshot endpoints (`/api/live/stream` and `/api/live/snapshot`) return a strict `403 Forbidden` response.

---

## 🌐 3. Server Configuration & Migration

We successfully completed a full server migration to a new production instance:

| Parameter | Details |
| --- | --- |
| **New Server IP** | `34.93.29.235` (GCP Static IP, location: `asia-south1-b`) |
| **Old Server IP** | `34.93.131.100` |
| **SSH Command** | `ssh -i ~/.ssh/id_rsa saksham@34.93.29.235` |
| **SSL Domain** | `auris.skymlabs.com` / `hq.skymlabs.com` (issued via Certbot) |
| **Backend Service** | `systemd` service: `auris.service` (runs Uvicorn on port `8000`) |
| **Web Server** | Nginx binding ports `80` and `443` (redirecting port 80 to HTTPS) |

### Key Migration Actions Completed
1. **Certbot Renewal Integration**: The Let's Encrypt certificates are active. Nginx was fully restarted to clear old certificate bindings in memory.
2. **Nginx Webroot Permissions**: Applied secure read/execute permissions and `www-data` ownership to all static portals:
   ```bash
   sudo chmod -R 755 /var/www/auris-hq /var/www/auris
   sudo chown -R www-data:www-data /var/www/auris-hq /var/www/auris
   ```
3. **DNS Propagation Validation**: Direct authoritative DNS checks (`dns1.registrar-servers.com`) and Google DNS (`8.8.8.8`) verified that both domains are correctly propagating to `34.93.29.235`.
4. **URL Responses**: Tested from the public internet; both portals return the correct React index HTML:
   - `hq.skymlabs.com` ➡️ Vite Dashboard
   - `auris.skymlabs.com` ➡️ Expo client app

---

## ⚡ 4. Deployment Pipeline & Assets

### Automated Deployment (`deploy.ps1`)
The central deployment pipeline resides in `deploy.ps1`. It has been updated to target the new server and performs:
1. **Verification Checks**: Executes `infra/setup/test.py` first. If any test fails, deployment aborts.
2. **Backend Sync & Asset Distribution**:
   - Copies `/server` routes, aggregator logic, `main.py`, and `db.py` to `/home/retailiq-key/auris-server/`.
   - Automatically distributes edge worker assets (`edge_worker.py`, `provision.py`, `requirements.txt`) to `/home/retailiq-key/auris-server/edge/src` on the server.
   - Restarts `auris.service` on the remote server.
3. **Web Portals Compilation & Sync**:
   - Builds Vite static assets and pushes to `/var/www/auris-hq/` on the server.
   - Bundles Expo static assets and pushes to `/var/www/auris/` on the server.
   - Aligns folder permissions and ownership.

---

## 📋 5. Operational Tasks & Next Steps

When resuming or directing the next agent, verify the following priorities:

1. **Verify Edge Worker Self-Update Feed**:
   Confirm that edge devices downloading scripts receive them successfully:
   ```bash
   curl -sSL https://auris.skymlabs.com/api/edge/download/edge_worker -o /opt/auris/edge_worker.py
   ```
   This should return the exact Python source code from `/edge/src/edge_worker.py` rather than a 404/405 error, resolving the edge worker startup crash.

2. **Monitor Ingestion Telemetry**:
   Ensure `server/routes/frames.py` handles full-frame payload ingestion from edge workers, performs face blurring, and correctly updates Cosmos DB without any database timeouts or memory spikes.

3. **Domain Local Resolver Refresh**:
   If some clients still experience connection hangs, remind them to flush their local resolver cache (`ipconfig /flushdns`) or use Google/Cloudflare DNS, as global propagation is confirmed successful.
