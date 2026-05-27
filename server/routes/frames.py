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
from pymongo.errors import ServerSelectionTimeoutError

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
db_timeout_count = 0

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
        MODEL = YOLO("yolov8s.onnx", task="detect")
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


def blur_faces(frame, detections):
    for det in detections:
        x1, y1, x2, y2 = det['bbox_abs']
        # Blur the top 30% of each person bounding box (face area)
        face_h = int((y2 - y1) * 0.35)
        face_region = frame[int(y1):int(y1)+face_h, int(x1):int(x2)]
        if face_region.size > 0:
            blurred = cv2.GaussianBlur(face_region, (99, 99), 30)
            frame[int(y1):int(y1)+face_h, int(x1):int(x2)] = blurred
    return frame


def run_inference_and_tracking(payload: FramePayload) -> Tuple[List, List, bool, Optional[np.ndarray]]:
    """Returns (deepsort_detections, crop_meta for training, fire_detected, blurred_full_img)."""
    if not MODEL:
        logger.warning("YOLO model not loaded — skipping inference")
        return [], [], False, None

    deepsort_detections = []
    crop_meta = []
    fire_detected = False
    blurred_img = None
    W_orig, H_orig = payload.frame_resolution

    if payload.full_frame_b64:
        try:
            img_data = base64.b64decode(payload.full_frame_b64)
            np_arr = np.frombuffer(img_data, np.uint8)
            full_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if full_img is not None:
                fh, fw = full_img.shape[:2]
                
                # 1. Run YOLOv8 on full frame: conf=0.10, iou=0.45, classes=[0] (person)
                results = MODEL(full_img, conf=0.10, iou=0.45, classes=[0], verbose=False)
                
                yolo_dets = []
                for r in results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0])
                        
                        abs_x = max(0, min(int(x1), fw - 1))
                        abs_y = max(0, min(int(y1), fh - 1))
                        abs_w = max(1, int(x2 - x1))
                        abs_h = max(1, int(y2 - y1))
                        if abs_x + abs_w > fw:
                            abs_w = fw - abs_x
                        if abs_y + abs_h > fh:
                            abs_h = fh - abs_y
                            
                        yolo_dets.append({
                            'bbox_abs': [abs_x, abs_y, abs_x + abs_w, abs_y + abs_h],
                            'bbox_wh': [abs_x, abs_y, abs_w, abs_h],
                            'conf': conf
                        })
                
                # 2. Draw/blur faces BEFORE storing or training
                full_img = blur_faces(full_img, yolo_dets)
                blurred_img = full_img
                
                # 3. Form DeepSort detections & extract person crops from the already blurred full_img
                for det in yolo_dets:
                    conf = det['conf']
                    abs_x, abs_y, abs_w, abs_h = det['bbox_wh']
                    
                    deepsort_detections.append(([abs_x, abs_y, abs_w, abs_h], conf, "person"))
                    
                    # For training / hard cases / pseudo labels: save full frame crops not tiny motion blobs
                    if (0.10 <= conf < 0.40) or conf > 0.85:
                        crop_img = blurred_img[abs_y:abs_y+abs_h, abs_x:abs_x+abs_w]
                        if crop_img.size > 0:
                            _, crop_buf = cv2.imencode('.jpg', crop_img, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                            crop_b64 = base64.b64encode(crop_buf).decode('utf-8')
                            
                            norm_bbox = [abs_x / fw, abs_y / fh, abs_w / fw, abs_h / fh]
                            crop_meta.append({
                                "jpeg_b64": crop_b64,
                                "bbox": norm_bbox,
                                "max_conf": conf,
                            })
                
                # Run Fire model on full frame if loaded
                if FIRE_MODEL:
                    for r in FIRE_MODEL(full_img, conf=0.5, verbose=False):
                        if len(r.boxes) > 0:
                            fire_detected = True
                            
        except Exception as e:
            logger.warning("Full frame inference error: %s", e)

    return deepsort_detections, crop_meta, fire_detected, blurred_img


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

        if not payload.full_frame_b64:
            return

        loop = asyncio.get_event_loop()
        ds_detections, crop_meta, fire_detected, blurred_img = await loop.run_in_executor(
            None, run_inference_and_tracking, payload
        )

        if fire_detected:
            await dispatch_fire_alert(s_id, c_id, payload.timestamp)

        for meta in crop_meta:
            conf = meta["max_conf"]
            # Only save hard cases where YOLO found SOMETHING but was uncertain (0.10–0.40)
            if 0.10 <= conf < 0.40:
                await save_hard_case(s_id, c_id, meta["jpeg_b64"], conf, payload.frame_id)
            elif conf > 0.85:
                await save_pseudo_label(s_id, c_id, meta["jpeg_b64"], meta["bbox"], conf)

        active_tracks = []
        tracker = get_tracker(s_id, c_id)
        if tracker and ds_detections:
            W_orig, H_orig = payload.frame_resolution
            dummy = np.zeros((H_orig, W_orig, 3), dtype=np.uint8)
            for track in tracker.update_tracks(ds_detections, frame=blurred_img if blurred_img is not None else dummy):
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

        # Get factory config to check privacy_mode
        factory_config = await db._db.factory_config.find_one({"store_id": s_id})
        privacy_mode = False
        if factory_config:
            privacy_mode = factory_config.get("privacy_mode", False)
        else:
            store_name = (store_config or {}).get("store_name", s_id)
            if "hospital" in s_id.lower() or "hospital" in store_name.lower() or "hosp" in s_id.lower() or "hosp" in store_name.lower():
                privacy_mode = True

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
            f"people_now={people_now} detected"
        )
        if people_now > max_capacity:
            await dispatch_overcrowding_alert(s_id, people_now, max_capacity)

        if people_now >= 5 and payload.frame_id % 30 == 0 and blurred_img is not None:
            try:
                _, tbuf = cv2.imencode('.jpg', blurred_img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                tb64 = base64.b64encode(tbuf).decode('utf-8')
                await db._db.training_frames.insert_one({
                    "store_id": s_id,
                    "camera_id": c_id,
                    "frame_id": payload.frame_id,
                    "timestamp": payload.timestamp,
                    "image_b64": tb64,
                    "people_count": people_now,
                    "detections": final_detections,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                logger.info(f"Saved training frame for {s_id}/{c_id} (people: {people_now})")
            except Exception as e:
                logger.warning(f"Failed to save training frame: {e}")

        # Store latest snapshot for live view
        s_id_low = s_id.lower()
        c_id_low = c_id.lower()
        frame_key = f"{s_id_low}_{c_id_low}"
        frame_key_full = f"{s_id_low}_{c_id_low}_full"
        frame_key_crop = f"{s_id_low}_{c_id_low}_crop"

        if not privacy_mode and blurred_img is not None:
            try:
                frame = blurred_img.copy()
                fh, fw = frame.shape[:2]
                # Draw green boxes for each detection
                for det in final_detections:
                    bn = det.get("bbox_normalised", [])
                    if len(bn) == 4:
                        x1 = int(bn[0] * fw)
                        y1 = int(bn[1] * fh)
                        x2 = int(bn[2] * fw)
                        y2 = int(bn[3] * fh)
                    else:
                        x1, y1, x2, y2 = det.get('bbox_abs', [0, 0, 50, 50])
                    cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                # Draw people count
                cv2.putText(frame, f'{people_now} people', (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_b64 = base64.b64encode(buf).decode()
                
                snapshot_data = {
                    'frame_b64': frame_b64,
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'people_now': people_now,
                    'camera_id': c_id_low,
                    'store_id': s_id_low
                }
                latest_frames[frame_key] = snapshot_data
                latest_frames[frame_key_full] = snapshot_data
                logger.info(f"Stored full frame snapshot for {frame_key}, people={people_now}")
            except Exception as snap_err:
                logger.warning(f"Snapshot annotation error: {snap_err}")
        elif privacy_mode:
            # Store only people_now count, no frame base64
            snapshot_data = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'people_now': people_now,
                'camera_id': c_id_low,
                'store_id': s_id_low
            }
            latest_frames[frame_key] = snapshot_data
            latest_frames[frame_key_full] = snapshot_data
            logger.info(f"Privacy Mode: Stored snapshot count for {frame_key}, people={people_now}")

        for tid in list(track_positions[s_id][c_id].keys()):
            if tid not in current_ids:
                track_positions[s_id][c_id].pop(tid, None)
                track_y_positions[s_id][c_id].pop(tid, None)
                zone_entry_times[s_id][c_id].pop(tid, None)

        # Always guarantee latest_frames is not empty for this camera
        key = f"{s_id}_{c_id}".lower()
        if key not in latest_frames:
            if not privacy_mode:
                placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
                cv2.putText(placeholder, f'{s_id}/{c_id}', (50, 180), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                _, buf = cv2.imencode('.jpg', placeholder)
                latest_frames[key] = {
                    'frame_b64': base64.b64encode(buf).decode(),
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'people_now': people_now,
                    'camera_id': c_id.lower(),
                    'store_id': s_id.lower()
                }
            else:
                latest_frames[key] = {
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'people_now': people_now,
                    'camera_id': c_id.lower(),
                    'store_id': s_id.lower()
                }

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
        try:
            await db.blobs.insert_one(blob_doc)
        except (asyncio.TimeoutError, ServerSelectionTimeoutError) as e:
            logger.error(f"Database timeout inserting blob for store_id={s_id}, camera_id={c_id}, frame_id={payload.frame_id}: {e}")
            global db_timeout_count
            db_timeout_count += 1
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


async def get_live_snapshot_impl(request: Request, store_id: str, camera_id: str):
    """Internal helper to return the latest annotated frame or fallback crop for a camera."""
    logger.info(f"Snapshot requested for {store_id}/{camera_id}, keys available: {list(latest_frames.keys())}")
    from db import ADMIN_KEY
    from routes.admin import decode_jwt, JWT_SECRET
    
    # 1. Prefer Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        
    is_valid = False
    if token:
        payload = decode_jwt(token, JWT_SECRET)
        if payload and payload.get("role") == "admin":
            is_valid = True
            
    if not is_valid:
        # 2. Fallback to X-Admin-Key header
        admin_key = request.headers.get("X-Admin-Key", "")
        # 3. Fallback to ?key= query parameter
        if not admin_key:
            admin_key = request.query_params.get("key", "")
            
        expected_key = ADMIN_KEY or "dcd62cb40e5fa0870d73c79fbd521d05"
        if expected_key and admin_key == expected_key:
            is_valid = True
            
    if not is_valid:
        raise HTTPException(status_code=403, detail="Invalid admin session token or key")

    # Check privacy mode
    factory_config = await db._db.factory_config.find_one({"store_id": store_id})
    privacy_mode = False
    if factory_config:
        privacy_mode = factory_config.get("privacy_mode", False)
    else:
        if "hospital" in store_id.lower() or "hosp" in store_id.lower():
            privacy_mode = True
            
    if privacy_mode:
        raise HTTPException(status_code=403, detail="Stream viewer disabled for this client due to privacy mode")

    store_id_low = store_id.lower()
    camera_id_low = camera_id.lower()

    key_full = f"{store_id_low}_{camera_id_low}_full"
    key_crop = f"{store_id_low}_{camera_id_low}_crop"
    key_std = f"{store_id_low}_{camera_id_low}"

    # Priority 1: Try exact case-sensitive lookup on lowercase keys
    snapshot = latest_frames.get(key_full) or latest_frames.get(key_crop) or latest_frames.get(key_std)

    # Priority 2: Case-insensitive fallback
    if not snapshot:
        for suffix in ["_full", "_crop", ""]:
            target_key = f"{store_id_low}_{camera_id_low}{suffix}"
            for k, v in latest_frames.items():
                if k.lower() == target_key.lower():
                    snapshot = v
                    break
            if snapshot:
                break

    if not snapshot:
        # If no frame yet: return {"status": "waiting", "message": "No frames yet"} with 200 not 404
        return {"status": "waiting", "message": "No frames yet"}

    return {
        "frame_b64": snapshot["frame_b64"],
        "timestamp": snapshot["timestamp"],
        "people_now": snapshot["people_now"],
        "camera_id": camera_id_low,
        "store_id": store_id_low,
    }


@router.get("/api/live/snapshot")
async def get_live_snapshot(request: Request, store_id: str, camera_id: str):
    """Returns the latest annotated frame/crop for a given camera via query parameters."""
    return await get_live_snapshot_impl(request, store_id, camera_id)


@router.get("/api/live/snapshot/{store_id}/{camera_id}")
async def get_live_snapshot_path(request: Request, store_id: str, camera_id: str):
    """Returns the latest annotated frame/crop for a given camera via path parameters."""
    return await get_live_snapshot_impl(request, store_id, camera_id)


@router.get("/api/live/cameras")
async def get_live_cameras(request: Request, key: Optional[str] = None):
    """Returns a list of all configured stores and cameras, including active in-memory cameras."""
    from db import ADMIN_KEY
    expected_key = ADMIN_KEY or "dcd62cb40e5fa0870d73c79fbd521d05"
    admin_key = key or request.query_params.get("key", "") or request.headers.get("X-Admin-Key", "")
    if not admin_key or admin_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid admin session token or key")

    # Fetch all stores from database
    stores_cursor = db.stores.find({}, {"store_id": 1, "store_name": 1})
    stores = {}
    async for s in stores_cursor:
        sid = s["store_id"]
        stores[sid] = {
            "store_name": s.get("store_name", sid),
            "cameras": []
        }
    
    # Fetch all cameras from database
    cameras_cursor = db.cameras.find({}, {"store_id": 1, "camera_id": 1, "name": 1})
    async for c in cameras_cursor:
        sid = c["store_id"]
        if sid in stores:
            stores[sid]["cameras"].append({
                "camera_id": c["camera_id"],
                "name": c.get("name", c["camera_id"])
            })
            
    # Include dynamic cameras found in latest_frames
    for k in list(latest_frames.keys()):
        # Exclude suffix entries to avoid duplicate items
        if k.endswith("_full") or k.endswith("_crop"):
            continue
        parts = k.split("_")
        if len(parts) >= 2:
            s_id = parts[0]
            c_id = "_".join(parts[1:])
            if s_id not in stores:
                stores[s_id] = {"store_name": s_id, "cameras": []}
            if not any(cam["camera_id"] == c_id for cam in stores[s_id]["cameras"]):
                stores[s_id]["cameras"].append({
                    "camera_id": c_id,
                    "name": c_id
                })

    return {"stores": stores}


@router.get("/api/live/stream/{store_id}/{camera_id}")
async def get_live_stream(request: Request, store_id: str, camera_id: str, key: Optional[str] = None, frames_limit: Optional[int] = None):
    """Serves a real-time MJPEG (multipart/x-mixed-replace) stream of annotated frames."""
    from db import ADMIN_KEY
    expected_key = ADMIN_KEY or "dcd62cb40e5fa0870d73c79fbd521d05"
    admin_key = key or request.query_params.get("key", "") or request.headers.get("X-Admin-Key", "")
    if not admin_key or admin_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid admin session token or key")

    # Check privacy mode
    factory_config = await db._db.factory_config.find_one({"store_id": store_id})
    privacy_mode = False
    if factory_config:
        privacy_mode = factory_config.get("privacy_mode", False)
    else:
        if "hospital" in store_id.lower() or "hosp" in store_id.lower():
            privacy_mode = True
            
    if privacy_mode:
        raise HTTPException(status_code=403, detail="Stream viewer disabled for this client due to privacy mode")

    store_id_low = store_id.lower()
    camera_id_low = camera_id.lower()

    key_full = f"{store_id_low}_{camera_id_low}_full"
    key_crop = f"{store_id_low}_{camera_id_low}_crop"
    key_std = f"{store_id_low}_{camera_id_low}"

    async def mjpeg_generator():
        logger.info(f"Started MJPEG stream for {store_id}/{camera_id}")
        frames_sent = 0
        try:
            while True:
                # 1. Retrieve latest frame from latest_frames cache with suffix priority fallback
                snapshot = latest_frames.get(key_full) or latest_frames.get(key_crop) or latest_frames.get(key_std)

                # Fallback to case-insensitive key matching
                if not snapshot:
                    for suffix in ["_full", "_crop", ""]:
                        target_key = f"{store_id_low}_{camera_id_low}{suffix}"
                        for k, v in latest_frames.items():
                            if k.lower() == target_key.lower():
                                snapshot = v
                                break
                        if snapshot:
                            break

                frame_bytes = None
                if snapshot and "frame_b64" in snapshot:
                    try:
                        # Decode the stored frame
                        img_data = base64.b64decode(snapshot["frame_b64"])
                        np_arr = np.frombuffer(img_data, np.uint8)
                        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                        if frame is not None:
                            # 2. Add timestamp overlay
                            frame_time_str = snapshot.get("timestamp", "N/A")
                            try:
                                dt = datetime.fromisoformat(frame_time_str.replace("Z", "+00:00"))
                                formatted_time = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
                            except Exception:
                                formatted_time = frame_time_str

                            current_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + " UTC (Server)"
                            overlay_text = f"Frame: {formatted_time} | Live: {current_time}"

                            fh, fw = frame.shape[:2]
                            font = cv2.FONT_HERSHEY_SIMPLEX
                            font_scale = 0.5
                            thickness = 1
                            
                            (text_w, text_h), baseline = cv2.getTextSize(overlay_text, font, font_scale, thickness)
                            x_offset = 10
                            y_offset = fh - 15

                            # Draw highly legible semi-transparent background box for timestamp
                            cv2.rectangle(frame, (x_offset - 5, y_offset - text_h - 5), (x_offset + text_w + 5, y_offset + 5), (0, 0, 0), -1)
                            cv2.putText(frame, overlay_text, (x_offset, y_offset), font, font_scale, (0, 255, 0), thickness, cv2.LINE_AA)

                            # Re-encode to JPEG
                            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                            frame_bytes = buf.tobytes()
                    except Exception as snap_err:
                        logger.warning(f"Error decoding frame for stream {store_id}/{camera_id}: {snap_err}")

                if frame_bytes is None:
                    # 3. Serve a black placeholder with "No signal" text if no frame is stored
                    placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(placeholder, "NO SIGNAL", (180, 220), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3, cv2.LINE_AA)
                    cv2.putText(placeholder, f"Camera: {store_id}/{camera_id}", (80, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2, cv2.LINE_AA)
                    
                    current_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + " UTC"
                    cv2.putText(placeholder, current_time, (80, 320), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 150, 150), 1, cv2.LINE_AA)
                    
                    _, buf = cv2.imencode('.jpg', placeholder, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    frame_bytes = buf.tobytes()

                # Yield in standard multipart/x-mixed-replace format
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n'
                       b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n' +
                       frame_bytes + b'\r\n')

                frames_sent += 1
                if frames_limit is not None and frames_sent >= frames_limit:
                    logger.info(f"Reached frames limit ({frames_limit}). Exiting stream.")
                    break

                # Sleep 500ms between frames
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            logger.info(f"MJPEG stream client disconnected for {store_id}/{camera_id}")
        except GeneratorExit:
            logger.info(f"MJPEG stream generator exited for {store_id}/{camera_id}")
        except Exception as e:
            logger.error(f"Error in MJPEG stream loop for {store_id}/{camera_id}: {e}", exc_info=True)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")
