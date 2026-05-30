"""
Auris Edge Worker
Production-grade edge device application for Skym Labs.
Performs motion detection (MOG2), full frame extraction, and cloud synchronization
for the Auris AI computer vision platform.

Runs 24/7 on Intel N100 mini PCs.
"""

import os
import time
import json
import base64
import sqlite3
import threading
import logging
import queue
from logging.handlers import TimedRotatingFileHandler
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Tuple, Any, Optional

import cv2
import numpy as np
import requests
from dotenv import load_dotenv, set_key

# --- Configuration Paths ---
# Defaults to /opt/auris/ but handles Windows local dev gracefully
BASE_DIR = "/opt/auris" if os.name != "nt" else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")
DB_PATH = os.path.join(BASE_DIR, "data", "frame_buffer.db")
LOG_DIR = os.path.join(BASE_DIR, "logs")
LOG_PATH = os.path.join(LOG_DIR, "edge.log")

# Ensure directories exist
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# Set up logging
logger = logging.getLogger("AurisEdge")
logger.setLevel(logging.INFO)
formatter = logging.Formatter('[%(asctime)s] [%(levelname)s] [%(threadName)s] %(message)s')

# Console Handler
ch = logging.StreamHandler()
ch.setFormatter(formatter)
logger.addHandler(ch)

# File Handler (Daily rotation, keep 7 days)
fh = TimedRotatingFileHandler(LOG_PATH, when="midnight", interval=1, backupCount=7)
fh.setFormatter(formatter)
logger.addHandler(fh)

logger.info(f"Loading .env from: {ENV_PATH}")

# Load environment variables
load_dotenv(ENV_PATH)

# Force OpenCV to use TCP for RTSP stream capture to prevent packet loss and H264 decoding/bytestream errors
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

CLOUD_ENDPOINT = os.getenv("CLOUD_ENDPOINT", "https://auris.skymlabs.com/api/frames")
CLOUD_API_KEY = os.getenv("CLOUD_API_KEY", "")
STORE_ID = os.getenv("STORE_ID", "default_store")
CALIBRATION_START_STR = os.getenv("CALIBRATION_START", datetime.now(timezone.utc).isoformat())

logger.info(f"API Key loaded: {'YES' if CLOUD_API_KEY else 'NO - CHECK .env FILE'}")

# Motion detection configuration
MOTION_THRESHOLD = 16
MIN_CONTOUR_AREA = 300

_calibration_cache = None
_calibration_checked = None

def is_calibration_mode() -> bool:
    """
    Checks if the device should be in CALIBRATION mode.
    Calibration mode lasts for exactly 48 hours from CALIBRATION_START.
    """
    global _calibration_cache, _calibration_checked
    now = datetime.now(timezone.utc)
    
    # Re-check only every 60 seconds
    if _calibration_checked and (now - _calibration_checked).total_seconds() < 60:
        return _calibration_cache
        
    _calibration_checked = now
    
    mode = os.getenv("CALIBRATION_MODE", "true").lower() == "true"
    if not mode:
        _calibration_cache = False
        return False
        
    try:
        # Try parsing ISO 8601
        try:
            start_time = datetime.fromisoformat(CALIBRATION_START_STR.replace('Z', '+00:00'))
        except ValueError:
            # Fallback for simpler formats if needed
            start_time = datetime.now(timezone.utc)
            
        if now - start_time > timedelta(hours=48):
            logger.info("48-hour calibration period ended. Switching to NORMAL mode.")
            os.environ["CALIBRATION_MODE"] = "false"
            # Update the .env file permanently
            try:
                set_key(ENV_PATH, "CALIBRATION_MODE", "false")
            except Exception as e:
                logger.error(f"Failed to update .env: {e}")
            _calibration_cache = False
            return False
            
        _calibration_cache = True
        return True
    except Exception as e:
        logger.error(f"Error parsing CALIBRATION_START: {e}. Defaulting to calibration mode.")
        _calibration_cache = True
        return True


class FrameUploader:
    """
    Handles buffering and uploading of blobs to the Cloud API.
    Provides offline SQLite buffering and automatic retry.
    """
    def __init__(self, endpoint: str, api_key: str, store_id: str):
        self.endpoint = endpoint
        self.api_key = api_key
        self.store_id = store_id
        self.queue = queue.Queue(maxsize=300)
        self._upload_semaphore = threading.Semaphore(2)
        self._buffer_size = 0
        self.server_pressure = 0.0
        
        self._init_db()
        
        # Start background threads
        threading.Thread(target=self._upload_loop, name="Uploader-Main", daemon=True).start()
        threading.Thread(target=self._retry_loop, name="Uploader-Retry", daemon=True).start()

    def _init_db(self):
        """Initializes the SQLite buffer database."""
        try:
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS frame_buffer (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        payload TEXT NOT NULL, 
                        created TEXT NOT NULL
                    )
                """)
                count = conn.execute("SELECT COUNT(*) FROM frame_buffer").fetchone()[0]
                self._buffer_size = count
        except Exception as e:
            logger.error(f"Failed to initialize SQLite buffer: {e}")

    def get_buffer_size(self):
        return self._buffer_size

    def enqueue(self, payload: Dict[str, Any]):
        """Adds a payload to the upload queue."""
        try:
            self.queue.put_nowait(payload)
        except __import__('queue').Full:
            # Drop frame instead of buffering — buffering during high load 
            # causes unbounded disk growth. Log and move on.
            logger.debug("Queue full — dropping frame (server processing too slow)")

    def _post(self, payload: Dict[str, Any]) -> bool:
        """Attempts to POST the payload to the cloud API."""
        try:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["X-API-Key"] = self.api_key
            if payload.get("calibration_mode", False):
                headers["X-Calibration"] = "true"
            
            prio = payload.get("priority", 3)
            headers["X-Priority"] = str(prio)
                
            with self._upload_semaphore:
                resp = requests.post(self.endpoint, json=payload, headers=headers, timeout=10)
            
            if resp.status_code in (200, 201, 202):
                try:
                    data = resp.json()
                    if data.get("status") == "dropped":
                        self.server_pressure = min(self.server_pressure + 0.15, 1.0)
                        logger.warning(f"Server overloaded (dropped reason: {data.get('reason')}). Adaptive backoff pressure increased to {self.server_pressure:.2f}")
                    else:
                        self.server_pressure = max(self.server_pressure - 0.02, 0.0)
                except Exception:
                    self.server_pressure = max(self.server_pressure - 0.02, 0.0)
                return True
            else:
                self.server_pressure = min(self.server_pressure + 0.25, 1.0)
                logger.warning(f"Server returned HTTP error {resp.status_code}. Backoff pressure increased to {self.server_pressure:.2f}")
                return False
        except requests.exceptions.RequestException as e:
            logger.debug(f"HTTP Post failed: {e}")
            self.server_pressure = min(self.server_pressure + 0.25, 1.0)
            return False

    def _buffer(self, payload: Dict[str, Any]):
        """Saves a failed payload to the SQLite buffer. Drops oldest if full (>5000)."""
        try:
            with sqlite3.connect(DB_PATH) as conn:
                # Enforce max buffer size of 5000
                if self._buffer_size >= 5000:
                    logger.warning("Buffer full! Dropping oldest frame.")
                    conn.execute("DELETE FROM frame_buffer WHERE id = (SELECT MIN(id) FROM frame_buffer)")
                    self._buffer_size -= 1
                
                conn.execute(
                    "INSERT INTO frame_buffer (payload, created) VALUES (?, ?)", 
                    (json.dumps(payload), datetime.now(timezone.utc).isoformat())
                )
                self._buffer_size += 1
        except Exception as e:
            logger.error(f"Failed to buffer payload: {e}")

    def _upload_loop(self):
        """Continuously processes the live queue."""
        logger.info("Live upload loop started.")
        while True:
            try:
                payload = self.queue.get()
                if not self._post(payload):
                    self._buffer(payload)
            except Exception as e:
                logger.error(f"Error in upload loop: {e}")
                time.sleep(1)

    def _retry_loop(self):
        """Continuously retries buffered payloads in batches."""
        logger.info("Buffer retry loop started.")
        while True:
            time.sleep(15) # Retry every 15 seconds
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    rows = conn.execute(
                        "SELECT id, payload FROM frame_buffer ORDER BY id ASC LIMIT 10"
                    ).fetchall()
                
                if not rows:
                    continue
                    
                logger.info(f"Retrying {len(rows)} buffered frames...")
                success_ids = []
                
                for row_id, payload_str in rows:
                    payload = json.loads(payload_str)
                    if self._post(payload):
                        success_ids.append(row_id)
                
                if success_ids:
                    with sqlite3.connect(DB_PATH) as conn:
                        placeholders = ",".join("?" for _ in success_ids)
                        conn.execute(f"DELETE FROM frame_buffer WHERE id IN ({placeholders})", success_ids)
                    self._buffer_size -= len(success_ids)
                    logger.info(f"Successfully recovered {len(success_ids)} frames from buffer.")
                    
            except Exception as e:
                logger.error(f"Error in retry loop: {e}")


class CameraWorker(threading.Thread):
    """
    Handles RTSP connection, MOG2 background subtraction, and full-frame payload generation for a single camera.
    """
    def __init__(self, name: str, url: Any, target_fps: int, store_id: str, uploader: FrameUploader):
        super().__init__(name=name)
        self.url = url
        self.target_fps = target_fps
        self.store_id = store_id
        self.uploader = uploader
        
        self.cap = None
        self.running = False
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=1000, varThreshold=25, detectShadows=False)
        self.frame_count = 0
        self.consecutive_failures = 0

    def get_effective_fps(self) -> float:
        queue_size = self.uploader.queue.qsize()
        max_size = self.uploader.queue.maxsize
        ratio = queue_size / max_size
        
        # Merge local buffer queue pressure and cloud server dropped frame pressure
        pressure = max(ratio, self.uploader.server_pressure)
        
        if pressure > 0.8:
            return 0.5
        elif pressure > 0.5:
            return 1.0
        elif pressure > 0.2:
            return min(self.target_fps, 2.0)
        else:
            return self.target_fps

    def calculate_priority(self, motion_pixel_count: int, calibration_mode: bool) -> int:
        """Deduce priority scale (1: Critical, 2: High, 3: Normal, 4: Low)"""
        if calibration_mode:
            return 1
            
        is_entrance = "entrance" in self.name.lower() or "cam1" in self.name.lower()
        has_dense_motion = motion_pixel_count > 5000
        
        if is_entrance and has_dense_motion:
            return 1
        elif is_entrance or has_dense_motion:
            return 2
        else:
            return 3

    def connect(self):
        """Establishes connection to the RTSP stream."""
        if self.cap:
            self.cap.release()
        logger.info(f"Connecting to stream: {self.url}")
        
        # Use FFMPEG backend explicitly for robust RTSP handling
        if isinstance(self.url, str) and self.url.startswith("rtsp"):
            self.cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        else:
            # On Windows, MSMF backend is notoriously buggy for webcams. Use DirectShow.
            if os.name == 'nt' and isinstance(self.url, int):
                self.cap = cv2.VideoCapture(self.url, cv2.CAP_DSHOW)
            else:
                self.cap = cv2.VideoCapture(self.url)
            
        if not self.cap.isOpened():
            logger.error(f"Failed to open stream {self.url}")
            return False
        return True

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()

    def run(self):
        self.running = True
        logger.info(f"Started camera worker for {self.name}")
        
        while self.running:
            try:
                if not self.cap or not self.cap.isOpened():
                    if not self.connect():
                        time.sleep(2)
                        continue

                calibration_mode = is_calibration_mode()
                
                # Adjust FPS based on mode
                effective_fps = 2 if calibration_mode else self.get_effective_fps()
                frame_delay = 1.0 / effective_fps
                
                start_time = time.time()
                ret, frame = self.cap.read()
                
                if not ret:
                    self.consecutive_failures += 1
                    logger.warning(f"Failed to read frame from {self.name} ({self.consecutive_failures}/5)")
                    if self.consecutive_failures >= 5:
                        logger.error(f"Reconnecting stream {self.name} due to 5 failures")
                        self.connect()
                        self.consecutive_failures = 0
                    time.sleep(1)
                    continue
                    
                self.consecutive_failures = 0
                self.frame_count += 1
                
                if self.frame_count % 50 == 0:
                    # Log stats every 50 frames using the fast cached counter
                    buf_size = self.uploader.get_buffer_size()
                    logger.info(f"[{self.name}] Processed {self.frame_count} frames. Buffer size: {buf_size}")

                H, W = frame.shape[:2]
                if W > 1280:
                    scale = 1280.0 / W
                    new_w, new_h = 1280, int(H * scale)
                    frame = cv2.resize(frame, (new_w, new_h))
                    H, W = new_h, new_w
                
                # Frame denoising before MOG2
                frame = cv2.bilateralFilter(frame, d=5, sigmaColor=35, sigmaSpace=35)
                
                # Apply Background Subtraction
                mask = self.bg_subtractor.apply(frame)
                camera_id = self.name
                motion_pixel_count = cv2.countNonZero(mask)
                logger.info(f"[{camera_id}] Motion pixels: {motion_pixel_count} threshold: {MOTION_THRESHOLD}")
                
                # Smoke/noise filter — only send frames with solid contours
                if not calibration_mode:
                    contours, _ = cv2.findContours(
                        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                    )
                    has_solid_motion = False
                    for cnt in contours:
                        area = cv2.contourArea(cnt)
                        if area < 500:
                            continue
                        hull = cv2.convexHull(cnt)
                        hull_area = cv2.contourArea(hull)
                        if hull_area == 0:
                            continue
                        solidity = area / hull_area
                        if solidity > 0.55:  # solid shape = person not smoke
                            has_solid_motion = True
                            break
                    if not has_solid_motion:
                        continue  # skip this frame — only smoke/noise detected
                
                # Still detect motion with MOG2 — if no motion, skip sending
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                has_motion = any(cv2.contourArea(c) >= MIN_CONTOUR_AREA for c in contours)
                
                if has_motion or calibration_mode:
                    # Every frame: compress full frame to JPEG at 80% quality
                    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 80]
                    success, ff_enc = cv2.imencode('.jpg', frame, encode_param)
                    if success:
                        full_frame_b64 = base64.b64encode(ff_enc).decode('utf-8')
                        payload = {
                            "store_id": self.store_id,
                            "camera_id": self.name,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "frame_id": self.frame_count,
                            "frame_resolution": [W, H],
                            "calibration_mode": calibration_mode,
                            "crops": [], # always empty
                            "full_frame_b64": full_frame_b64,
                            "motion_pixels": int(motion_pixel_count),
                            "priority": self.calculate_priority(motion_pixel_count, calibration_mode)
                        }
                        if self.uploader.server_pressure > 0.8 and not calibration_mode:
                            logger.info(f"[{camera_id}] Dropping frame {self.frame_count} locally due to server pressure ({self.uploader.server_pressure:.2f})")
                        else:
                            self.uploader.enqueue(payload)
                            logger.info(f"[{camera_id}] Sent motion full-frame (frame_id: {self.frame_count}, pixels: {motion_pixel_count})")
                
                # Control frame rate by sleeping remainder of the target delay
                elapsed = time.time() - start_time
                sleep_time = frame_delay - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

            except Exception as e:
                logger.error(f"Unexpected error in camera worker {self.name}: {e}")
                time.sleep(2)


def _heartbeat_loop(store_id: str, cameras: List[str]):
    """POST /api/edge/heartbeat every 60s for each camera."""
    base = CLOUD_ENDPOINT.rsplit("/api/", 1)[0]
    url = f"{base}/api/edge/heartbeat"
    headers = {"Content-Type": "application/json"}
    if CLOUD_API_KEY:
        headers["X-API-Key"] = CLOUD_API_KEY

    while True:
        try:
            for cam_id in cameras:
                payload = {
                    "store_id": store_id,
                    "camera_id": cam_id,
                    "fps": 0,
                    "queue_depth": 0,
                }
                requests.post(url, json=payload, headers=headers, timeout=5)

                # Fetch spatial context from floor map
                try:
                    ctx_url = f"{base}/api/floormap/camera-context/{store_id}/{cam_id}"
                    ctx_resp = requests.get(ctx_url, headers=headers, timeout=5)
                    if ctx_resp.status_code == 200:
                        ctx = ctx_resp.json()
                        if ctx.get("positioned"):
                            logger.info(
                                f"[{cam_id}] Spatial context: position=({ctx['position']['x_m']}m,"
                                f"{ctx['position']['y_m']}m) height={ctx['position']['height_m']}m "
                                f"zones={[z['zone_label'] for z in ctx['zones_in_view']]}"
                            )
                except Exception:
                    pass  # non-critical

        except Exception as e:
            logger.debug("Heartbeat failed: %s", e)
        time.sleep(60)


def fetch_server_config(endpoint: str, api_key: str) -> Optional[List[Dict[str, Any]]]:
    """
    Fetches the camera configuration from the server with retries.
    Retries 3 times with 5s delay on failure (4 total attempts).
    Returns the cameras list if successful, otherwise None.
    """
    base_url = endpoint.rsplit("/api/", 1)[0]
    config_url = f"{base_url}/api/edge/config"
    headers = {"X-API-Key": api_key}
    
    logger.info(f"Attempting to fetch camera config from server: {config_url}")
    
    for attempt in range(1, 5):
        try:
            resp = requests.get(config_url, headers=headers, timeout=10)
            if resp.status_code == 200:
                config_data = resp.json()
                cameras = config_data.get("cameras", [])
                logger.info("Successfully fetched camera config from server.")
                return cameras
            else:
                logger.warning(f"Server returned status code {resp.status_code} on attempt {attempt}/4")
        except Exception as e:
            logger.warning(f"Error fetching server config on attempt {attempt}/4: {e}")
            
        if attempt < 4:
            logger.info("Retrying in 5 seconds...")
            time.sleep(5)
            
    logger.error("Failed to fetch camera config from server after retries.")
    return None


def main():
    logger.info("Initializing Auris Edge Service...")
    
    # Initialize the Uploader (handles HTTP and SQLite buffering)
    uploader = FrameUploader(endpoint=CLOUD_ENDPOINT, api_key=CLOUD_API_KEY, store_id=STORE_ID)
    
    # Load cameras config
    cameras_list = None
    if CLOUD_API_KEY:
        cameras_list = fetch_server_config(CLOUD_ENDPOINT, CLOUD_API_KEY)
        
    cameras_dict = {}
    if not cameras_list:
        # Check .env for CAM_x_URL first
        i = 1
        env_cameras = {}
        while True:
            url = os.getenv(f"CAM_{i}_URL")
            if not url:
                break
            env_cameras[f"cam{i}"] = {"url": url, "fps": 2}
            i += 1
            
        if env_cameras:
            logger.info(f"Loaded {len(env_cameras)} cameras from .env variables")
            cameras_dict = env_cameras
        else:
            logger.info("No server config or .env cameras found, using local config.py")
            try:
                import sys
                src_path = os.path.join(BASE_DIR, "src")
                if src_path not in sys.path:
                    sys.path.append(src_path)
                from config import CAMERAS
                cameras_dict = CAMERAS
            except ImportError:
                logger.warning("Could not load local config.py. Defaulting to video simulation.")
                cameras_dict = {
                    "cam1": {"url": "videos/vid1.mp4", "fps": 2},
                }
    else:
        logger.info(f"Loaded {len(cameras_list)} cameras from server config")
        for cam in cameras_list:
            cam_name = cam.get("camera_id")
            url = cam.get("rtsp_url")
            fps = cam.get("fps", 2)
            if cam_name and url:
                cameras_dict[cam_name] = {"url": url, "fps": fps}
                
    if not cameras_dict:
        logger.warning("No cameras configured from server or local config. Defaulting to video simulation.")
        cameras_dict = {
            "cam1": {"url": "videos/vid1.mp4", "fps": 2},
        }
        
    workers = []
    camera_names = []

    for cam_name, cam_cfg in cameras_dict.items():
        url = cam_cfg.get("url", 0)
        fps = cam_cfg.get("fps", 2)
        camera_names.append(cam_name)
        
        worker = CameraWorker(
            name=cam_name, 
            url=url, 
            target_fps=fps, 
            store_id=STORE_ID, 
            uploader=uploader
        )
        workers.append(worker)
        worker.start()

    if camera_names:
        threading.Thread(
            target=_heartbeat_loop,
            args=(STORE_ID, camera_names),
            name="Heartbeat",
            daemon=True,
        ).start()
        logger.info("Edge heartbeat thread started for %s", camera_names)
        
    try:
        # Keep main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down Edge Service...")
        for w in workers:
            w.stop()
        for w in workers:
            w.join()


if __name__ == "__main__":
    main()
