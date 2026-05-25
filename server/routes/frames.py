"""
Frames router: YOLOv8m, DeepSort, zones, spatial metres, training hooks, calibration.
"""

import io
import os
import time
import base64
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any, Tuple
from collections import defaultdict

import cv2
import numpy as np
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from pydantic import BaseModel

from db import db, get_store_by_api_key
from spatial.homography import norm_to_metres
from routes.alerts import dispatch_fire_alert, dispatch_overcrowding_alert
from routes.training import save_hard_case, save_pseudo_label

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

try:
    from deep_sort_realtime.deepsort_tracker import DeepSort
except ImportError:
    DeepSort = None

logger = logging.getLogger("AurisCloud.Frames")
router = APIRouter()

MODEL = None
FIRE_MODEL = None
trackers: Dict[str, Any] = {}
_homography_cache: Dict[str, dict] = {}
REID_ENABLED = os.getenv("REID_ENABLED", "false").lower() == "true"

# Live snapshot store: {store_id_camera_id: {frame_b64, timestamp, people_now}}
latest_frames: Dict[str, dict] = {}


def get_tracker(store_id: str, camera_id: str):
    if not DeepSort:
        return None
    key = f"{store_id}_{camera_id}"
    if key not in trackers:
        trackers[key] = DeepSort(max_age=150)
    return trackers[key]


try:
    if YOLO:
        MODEL = YOLO("yolov8m.pt")
        try:
            FIRE_MODEL = YOLO("fire.pt")
        except Exception:
            FIRE_MODEL = None
except Exception as e:
    logger.error("Model load error: %s", e)


async def get_camera_homography(store_id: str, camera_id: str) -> Optional[dict]:
    key = f"{store_id}_{camera_id}"
    if key in _homography_cache:
        return _homography_cache[key]
    cam = await db.cameras.find_one({"store_id": store_id, "camera_id": camera_id})
    if cam and cam.get("homography"):
        _homography_cache[key] = cam
        return cam
    return None


async def update_heatmap(store_id: str, floor_id: str, x_m: float, y_m: float, grid: float = 1.0):
    gx, gy = int(x_m / grid), int(y_m / grid)
    day = datetime.now(timezone.utc).date().isoformat()
    await db.heatmap_cells.update_one(
        {"store_id": store_id, "floor_id": floor_id, "date": day, "gx": gx, "gy": gy},
        {"$inc": {"count": 1}},
        upsert=True,
    )


def nested_dict():
    return defaultdict(lambda: defaultdict(dict))


def int_dict():
    return defaultdict(lambda: defaultdict(int))


track_positions = nested_dict()
track_y_positions = nested_dict()
count_in = int_dict()
count_out = int_dict()
zone_entry_times = nested_dict()


class CropPayload(BaseModel):
    bbox: List[float]
    jpeg_b64: str
    area: int


class FramePayload(BaseModel):
    store_id: str
    camera_id: str
    timestamp: str
    frame_id: int
    frame_resolution: List[int]
    calibration_mode: bool
    crops: List[CropPayload]
    full_frame_b64: Optional[str] = None
    floor_id: Optional[str] = "floor_0"


def run_inference_and_tracking(payload: FramePayload) -> Tuple[List, List, bool]:
    """Returns (deepsort_detections, crop_meta for training, fire_detected)."""
    if not MODEL:
        logger.warning("YOLO model not loaded — skipping inference")
        return [], [], False

    deepsort_detections = []
    crop_meta = []
    fire_detected = False
    W_orig, H_orig = payload.frame_resolution

    for i, crop in enumerate(payload.crops):
        try:
            img_data = base64.b64decode(crop.jpeg_b64)
            np_arr = np.frombuffer(img_data, np.uint8)
            crop_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if crop_img is None:
                logger.warning(f"Crop {i}: failed to decode image")
                continue

            crop_h, crop_w = crop_img.shape[:2]

            # Skip crops that are too small for YOLO to process reliably
            if crop_w < 64 or crop_h < 64:
                logger.info(f"Crop {i}: skipping — too small ({crop_w}x{crop_h})")
                continue

            cx_norm, cy_norm, cw_norm, ch_norm = crop.bbox

            if FIRE_MODEL:
                for r in FIRE_MODEL(crop_img, conf=0.5, verbose=False):
                    if len(r.boxes) > 0:
                        fire_detected = True

            # --- DEBUG PHASE: lower conf=0.15, no class filter, detect ALL objects ---
            results = MODEL(crop_img, conf=0.15, verbose=False)
            max_conf = 0.0
            crop_detections = []
            for r in results:
                detected_classes = [MODEL.names[int(b.cls[0])] for b in r.boxes]
                logger.info(
                    f"Crop {i}: size=({crop_w}x{crop_h}), "
                    f"detections={len(r.boxes)}, classes={detected_classes}"
                )
                if len(r.boxes) == 0:
                    logger.info(f"Crop {i}: No detection in crop")
                for box in r.boxes:
                    cls_name = MODEL.names[int(box.cls[0])]
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    max_conf = max(max_conf, conf)

                    # Only feed person detections into DeepSort tracker
                    if cls_name == "person":
                        nx1, ny1 = x1 / crop_w, y1 / crop_h
                        nx2, ny2 = x2 / crop_w, y2 / crop_h
                        ff_nx1 = cx_norm + (nx1 * cw_norm)
                        ff_ny1 = cy_norm + (ny1 * ch_norm)
                        ff_nw = (nx2 - nx1) * cw_norm
                        ff_nh = (ny2 - ny1) * ch_norm
                        abs_x = max(0, min(int(ff_nx1 * W_orig), W_orig - 1))
                        abs_y = max(0, min(int(ff_ny1 * H_orig), H_orig - 1))
                        abs_w = max(1, int(ff_nw * W_orig))
                        abs_h = max(1, int(ff_nh * H_orig))
                        if abs_x + abs_w > W_orig:
                            abs_w = W_orig - abs_x
                        if abs_y + abs_h > H_orig:
                            abs_h = H_orig - abs_y
                        deepsort_detections.append(([abs_x, abs_y, abs_w, abs_h], conf, "person"))
                        crop_detections.append({"abs_bbox": [abs_x, abs_y, abs_w, abs_h], "conf": conf})

            crop_meta.append({
                "jpeg_b64": crop.jpeg_b64,
                "bbox": crop.bbox,
                "max_conf": max_conf,
                "detections": crop_detections,
            })
        except Exception as e:
            logger.warning("Crop error: %s", e)

    return deepsort_detections, crop_meta, fire_detected


# Module-level asyncio PriorityQueue, lock state, and parked buffers
inference_queue = asyncio.PriorityQueue(maxsize=500)
active_keys = set()
pending_by_key = defaultdict(asyncio.Queue)
NUM_WORKERS = int(os.getenv("QUEUE_WORKERS", "12"))

def get_total_queued_frames() -> int:
    total = inference_queue.qsize()
    for q in pending_by_key.values():
        total += q.qsize()
    return total



async def execute_frame_inference_and_tracking(payload: FramePayload, api_key: str):
    try:
        s_id = payload.store_id
        c_id = payload.camera_id
        floor_id = payload.floor_id or "floor_0"

        if not payload.crops and not (payload.calibration_mode and payload.full_frame_b64):
            return

        loop = asyncio.get_event_loop()
        ds_detections, crop_meta, fire_detected = await loop.run_in_executor(
            None, run_inference_and_tracking, payload
        )

        if fire_detected:
            await dispatch_fire_alert(s_id, c_id, payload.timestamp)

        for meta in crop_meta:
            conf = meta["max_conf"]
            # Only save hard cases where YOLO found SOMETHING but was uncertain (0.15–0.50)
            if 0.15 <= conf < 0.50:
                await save_hard_case(s_id, c_id, meta["jpeg_b64"], conf, payload.frame_id)
            elif conf > 0.85:
                await save_pseudo_label(s_id, c_id, meta["jpeg_b64"], meta["bbox"], conf)

        active_tracks = []
        tracker = get_tracker(s_id, c_id)
        if tracker and ds_detections:
            W_orig, H_orig = payload.frame_resolution
            dummy = np.zeros((H_orig, W_orig, 3), dtype=np.uint8)
            for track in tracker.update_tracks(ds_detections, frame=dummy):
                if not track.is_confirmed():
                    continue
                ltrb = track.to_ltrb()
                nx1, ny1 = float(ltrb[0]) / W_orig, float(ltrb[1]) / H_orig
                nx2, ny2 = float(ltrb[2]) / W_orig, float(ltrb[3]) / H_orig
                cx, cy = float(nx1 + nx2) / 2.0, float(ny1 + ny2) / 2.0
                active_tracks.append({
                    "track_id": track.track_id,
                    "centroid": (cx, cy),
                    "bbox_normalised": [nx1, ny1, nx2, ny2],
                    "confidence": 0.9,
                })

        store_config = await db.stores.find_one({"store_id": s_id})
        zone_config = (store_config or {}).get("zone_config", {})
        counting_line_y = (store_config or {}).get("counting_line_y", 0.5)
        max_capacity = (store_config or {}).get("max_capacity", 100)

        calib_saved = False
        if payload.calibration_mode and payload.full_frame_b64:
            calib_doc = {
                "store_id": s_id,
                "camera_id": c_id,
                "timestamp": payload.timestamp,
                "frame_id": payload.frame_id,
                "full_frame_b64": payload.full_frame_b64,
                "created_at": datetime.now(timezone.utc),
            }
            result = await db.calibration_frames.insert_one(calib_doc)
            calib_doc["_id"] = result.inserted_id
            calib_saved = True
            from routes.calibration import process_qr_on_calib_frame
            asyncio.create_task(process_qr_on_calib_frame(calib_doc))

        cam_cal = await get_camera_homography(s_id, c_id)
        H = cam_cal.get("homography") if cam_cal else None
        cam_floor = (cam_cal or {}).get("floor_id", floor_id)

        zone_events = []
        crossings = []
        final_detections = []
        now_ts = time.time()
        current_ids = set()

        for t in active_tracks:
            tid = t["track_id"]
            cx, cy = t["centroid"]
            current_ids.add(tid)

            position_m = None
            if H:
                xm, ym = norm_to_metres(H, cx, cy)
                position_m = {"x": round(xm, 2), "y": round(ym, 2)}
                await update_heatmap(s_id, cam_floor, xm, ym)
                await db.spatial_positions.update_one(
                    {"store_id": s_id, "track_id": tid},
                    {"$set": {
                        "store_id": s_id,
                        "track_id": tid,
                        "camera_id": c_id,
                        "floor_id": cam_floor,
                        "x_m": xm,
                        "y_m": ym,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                    upsert=True,
                )
                if REID_ENABLED:
                    crop_b64 = crop_meta[0]["jpeg_b64"] if crop_meta else None
                    await db.reid_queue.insert_one({
                        "store_id": s_id,
                        "camera_id": c_id,
                        "track_id": tid,
                        "bbox": t["bbox_normalised"],
                        "jpeg_b64": crop_b64,
                        "floor_id": cam_floor,
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })

            prev_y = track_y_positions[s_id][c_id].get(tid)
            if prev_y is not None and abs(cy - counting_line_y) > 0.08:
                if prev_y < counting_line_y <= cy:
                    count_in[s_id][c_id] += 1
                    crossings.append("entry")
                elif prev_y > counting_line_y >= cy:
                    count_out[s_id][c_id] += 1
                    crossings.append("exit")
            track_y_positions[s_id][c_id][tid] = cy

            current_zone = "unassigned"
            for z_name, z_bbox in zone_config.items():
                zx1, zy1, zx2, zy2 = z_bbox
                if zx1 <= cx <= zx2 and zy1 <= cy <= zy2:
                    current_zone = z_name
                    break

            prev_zone = track_positions[s_id][c_id].get(tid)
            if prev_zone != current_zone:
                if prev_zone and prev_zone != "unassigned":
                    dwell = now_ts - zone_entry_times[s_id][c_id].get(tid, now_ts)
                    zone_events.append({
                        "track_id": tid, "event": "exit", "zone": prev_zone,
                        "dwell_seconds": round(dwell, 2),
                    })
                track_positions[s_id][c_id][tid] = current_zone
                zone_entry_times[s_id][c_id][tid] = now_ts
                if current_zone != "unassigned":
                    zone_events.append({"track_id": tid, "event": "entry", "zone": current_zone})

            det = {
                "track_id": tid,
                "zone": current_zone,
                "confidence": t["confidence"],
                "bbox_normalised": t["bbox_normalised"],
            }
            if position_m:
                det["position_m"] = position_m
            final_detections.append(det)

        people_now = len(final_detections)
        logger.info(
            f"Frame {payload.frame_id} from {c_id}: "
            f"{len(payload.crops)} crops received, {people_now} people detected"
        )
        if people_now > max_capacity:
            await dispatch_overcrowding_alert(s_id, people_now, max_capacity)

        # Store latest snapshot for live view (draw bounding boxes if full frame available)
        if payload.full_frame_b64:
            try:
                frame_key = f"{s_id}_{c_id}"
                annotated_b64 = payload.full_frame_b64
                if final_detections:
                    ffd = base64.b64decode(payload.full_frame_b64)
                    ff_arr = np.frombuffer(ffd, np.uint8)
                    ff_img = cv2.imdecode(ff_arr, cv2.IMREAD_COLOR)
                    if ff_img is not None:
                        fh, fw = ff_img.shape[:2]
                        for det in final_detections:
                            bn = det.get("bbox_normalised", [])
                            if len(bn) == 4:
                                bx1 = int(bn[0] * fw)
                                by1 = int(bn[1] * fh)
                                bx2 = int(bn[2] * fw)
                                by2 = int(bn[3] * fh)
                                cv2.rectangle(ff_img, (bx1, by1), (bx2, by2), (0, 255, 80), 2)
                                label = f"Person #{det.get('track_id', '?')}"
                                cv2.putText(ff_img, label, (bx1, max(by1 - 6, 10)),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 80), 1)
                        _, buf = cv2.imencode(".jpg", ff_img, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        annotated_b64 = base64.b64encode(buf).decode("utf-8")
                latest_frames[frame_key] = {
                    "frame_b64": annotated_b64,
                    "timestamp": payload.timestamp,
                    "people_now": people_now,
                    "camera_id": c_id,
                    "store_id": s_id,
                }
            except Exception as snap_err:
                logger.warning(f"Snapshot annotation error: {snap_err}")

        for tid in list(track_positions[s_id][c_id].keys()):
            if tid not in current_ids:
                track_positions[s_id][c_id].pop(tid, None)
                track_y_positions[s_id][c_id].pop(tid, None)
                zone_entry_times[s_id][c_id].pop(tid, None)

        blob_doc = {
            "store_id": s_id,
            "camera_id": c_id,
            "timestamp": payload.timestamp,
            "frame_id": payload.frame_id,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "people_now": people_now,
            "counts": {
                "in": count_in[s_id][c_id],
                "out": count_out[s_id][c_id],
                "current": max(0, count_in[s_id][c_id] - count_out[s_id][c_id]),
            },
            "zone_events": zone_events,
            "crossings": crossings,
            "fire_detected": fire_detected,
            "detections": final_detections,
            "floor_id": cam_floor,
        }
        await db.blobs.insert_one(blob_doc)
        logger.info(f"Processed frame {payload.frame_id} for store {s_id} camera {c_id}. Occupancy: {people_now}")
    except Exception as e:
        logger.error(f"Error executing frame inference: {e}", exc_info=True)


worker_tasks: List[asyncio.Task] = []

async def run_single_worker(worker_id: int):
    logger.info(f"AURIS Queue Worker {worker_id} started")
    while True:
        try:
            prio, ts, payload, api_key = await inference_queue.get()
            key = f"{payload.store_id}_{payload.camera_id}"
            
            # Check if this camera stream is already being processed by another worker
            if key in active_keys:
                # Park this frame in the camera-specific queue to maintain strict chronological order
                await pending_by_key[key].put((prio, ts, payload, api_key))
                inference_queue.task_done()
                continue
            
            # Lock the stream
            active_keys.add(key)
            inference_queue.task_done()
            
            try:
                # 1. Process the main frame
                latency = time.time() - ts
                if latency > 1.5:
                    logger.warning(f"Queue congestion [Worker {worker_id}]: Frame spent {latency:.2f}s in queue.")
                await execute_frame_inference_and_tracking(payload, api_key)
                
                # 2. Flush any subsequently parked frames for this camera stream sequentially
                while not pending_by_key[key].empty():
                    p_prio, p_ts, p_payload, p_api_key = pending_by_key[key].get_nowait()
                    await execute_frame_inference_and_tracking(p_payload, p_api_key)
                    pending_by_key[key].task_done()
            finally:
                # Unlock the stream
                active_keys.remove(key)
                
        except asyncio.CancelledError:
            logger.info(f"Queue Worker {worker_id} shutting down.")
            break
        except Exception as e:
            logger.error(f"Queue Worker {worker_id} execution error: {e}")
            await asyncio.sleep(1)


async def run_priority_queue_worker():
    logger.info(f"AURIS Priority Queue background manager started with {NUM_WORKERS} workers.")
    global worker_tasks
    worker_tasks.clear()
    
    for i in range(NUM_WORKERS):
        t = asyncio.create_task(run_single_worker(i))
        worker_tasks.append(t)
        
    try:
        await asyncio.gather(*worker_tasks)
    except asyncio.CancelledError:
        logger.info("AURIS Priority Queue manager cancelled. Cancelling all workers...")
        for t in worker_tasks:
            t.cancel()
        await asyncio.gather(*worker_tasks, return_exceptions=True)
        logger.info("All AURIS Queue workers shut down successfully.")


@router.post("/api/frames")
async def process_frame(request: Request, payload: FramePayload):
    try:
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            raise HTTPException(status_code=401, detail="Missing X-API-Key")

        store = await get_store_by_api_key(api_key)
        if not store or store.get("store_id") != payload.store_id:
            raise HTTPException(status_code=401, detail="Invalid API Key")

        # Smart Dropping thresholds & backoff signals
        qsize = get_total_queued_frames()
        prio = int(request.headers.get("X-Priority", "3"))  # Default NORMAL (3)

        if qsize >= 475 and prio >= 2:
            logger.warning(f"CRITICAL PRESSURE: Dropping Frame (Prio {prio}) from {payload.store_id} / {payload.camera_id}")
            return {"status": "dropped", "reason": "queue_critical"}

        if qsize >= 400 and prio >= 3:
            logger.warning(f"HIGH PRESSURE: Dropping Frame (Prio {prio}) from {payload.store_id} / {payload.camera_id}")
            return {"status": "dropped", "reason": "queue_full"}

        # Put in the Priority Queue (sorts by prio, then timestamp to avoid comparing payloads)
        await inference_queue.put((prio, time.time(), payload, api_key))

        return {
            "status": "ok",
            "store_id": payload.store_id,
            "camera_id": payload.camera_id,
            "frame_id": payload.frame_id,
            "queued": True
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Frame submit error: %s", e)
        return {"status": "error", "message": str(e)}


@router.get("/api/live/snapshot")
async def get_live_snapshot(request: Request, store_id: str, camera_id: str):
    """Returns the latest annotated frame for a given camera. Auth: X-Admin-Key."""
    from db import ADMIN_KEY
    admin_key = request.headers.get("X-Admin-Key", "")
    if not ADMIN_KEY or admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")

    frame_key = f"{store_id}_{camera_id}"
    snapshot = latest_frames.get(frame_key)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No snapshot available yet for this camera")

    return {
        "frame_b64": snapshot["frame_b64"],
        "timestamp": snapshot["timestamp"],
        "people_now": snapshot["people_now"],
        "camera_id": camera_id,
        "store_id": store_id,
    }
