"""
Post-48h auto-calibration: derive entrance line and hotzones in metres.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from db import db

logger = logging.getLogger("AurisCloud.AutoCalibrator")


class AutoCalibrator:
    """Analyzes tracking paths to deduce entrance line and hotzones."""

    def find_entrance_line(self, blob_paths: List[List[Tuple[float, float]]]) -> Optional[float]:
        terminal_y = []
        for path in blob_paths:
            if len(path) > 1:
                terminal_y.append(path[0][1])
                terminal_y.append(path[-1][1])
        if not terminal_y:
            return None
        hist, edges = np.histogram(terminal_y, bins=20)
        peak = int(np.argmax(hist))
        return float((edges[peak] + edges[peak + 1]) / 2.0)

    def find_hotzones(
        self,
        blob_paths: List[List[Tuple[float, float]]],
        bounds_w: float,
        bounds_h: float,
        grid_m: float = 2.0,
    ) -> List[Dict[str, Any]]:
        if not blob_paths:
            return []

        grid_w = int(bounds_w / grid_m) + 1
        grid_h = int(bounds_h / grid_m) + 1
        heatmap = np.zeros((grid_h, grid_w))

        for path in blob_paths:
            for x, y in path:
                gx = min(int(x / grid_m), grid_w - 1)
                gy = min(int(y / grid_m), grid_h - 1)
                if gx >= 0 and gy >= 0:
                    heatmap[gy, gx] += 1

        if not np.any(heatmap > 0):
            return []

        threshold = float(np.percentile(heatmap[heatmap > 0], 90))
        zones = []
        idx = 0
        for gy in range(grid_h):
            for gx in range(grid_w):
                if heatmap[gy, gx] >= threshold:
                    x1, y1 = gx * grid_m, gy * grid_m
                    zones.append({
                        f"hotzone_{idx}": [
                            round(x1 / bounds_w, 4),
                            round(y1 / bounds_h, 4),
                            round(min((x1 + grid_m) / bounds_w, 1.0), 4),
                            round(min((y1 + grid_m) / bounds_h, 4), 4),
                        ]
                    })
                    idx += 1
        return zones


def _paths_from_blobs(blobs: List[dict], use_metres: bool) -> List[List[Tuple[float, float]]]:
    """Group detections by track_id into paths."""
    tracks: Dict[int, List[Tuple[float, float]]] = {}
    for blob in blobs:
        for det in blob.get("detections", []):
            tid = det.get("track_id")
            if tid is None:
                continue
            if use_metres and det.get("position_m"):
                x, y = det["position_m"]["x"], det["position_m"]["y"]
            else:
                bb = det.get("bbox_normalised", [0.5, 0.5, 0.5, 0.5])
                x = (bb[0] + bb[2]) / 2.0
                y = (bb[1] + bb[3]) / 2.0
            tracks.setdefault(tid, []).append((x, y))
    return list(tracks.values())


async def run_auto_calibrator_for_store(store: dict) -> bool:
    sid = store["store_id"]
    if store.get("spatial_status") in ("calibrated", "auto_calibrated"):
        return False

    created = store.get("created_at")
    if not created:
        return False
    try:
        start = datetime.fromisoformat(created.replace("Z", "+00:00"))
    except ValueError:
        return False
    if datetime.now(timezone.utc) - start < timedelta(hours=48):
        return False

    frame_count = await db.calibration_frames.count_documents({"store_id": sid})
    if frame_count < 10:
        logger.info("Store %s: insufficient calibration frames (%s)", sid, frame_count)
        return False

    since = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    blobs = []
    async for b in db.blobs.find(
        {"store_id": sid, "received_at": {"$gte": since}},
        {"detections": 1},
    ).limit(5000):
        blobs.append(b)

    if len(blobs) < 20:
        return False

    floor = await db.floors.find_one({"store_id": sid}) or {}
    bounds = floor.get("bounds_m", {"width": 50, "height": 50})
    bw, bh = float(bounds.get("width", 50)), float(bounds.get("height", 50))

    has_homography = await db.cameras.count_documents(
        {"store_id": sid, "homography": {"$exists": True}}
    ) > 0

    cal = AutoCalibrator()
    paths = _paths_from_blobs(blobs, use_metres=has_homography)
    if not paths:
        return False

    if has_homography:
        metre_paths = paths
        entrance_y_norm = cal.find_entrance_line(metre_paths)
        counting_line_y = (entrance_y_norm / bh) if entrance_y_norm is not None else 0.5
        zone_items = cal.find_hotzones(metre_paths, bw, bh)
    else:
        entrance_y_norm = cal.find_entrance_line(paths)
        counting_line_y = entrance_y_norm if entrance_y_norm is not None else 0.5
        zone_items = cal.find_hotzones(paths, 1.0, 1.0, grid_m=0.05)

    zone_config = store.get("zone_config") or {}
    for item in zone_items:
        zone_config.update(item)

    await db.stores.update_one(
        {"store_id": sid},
        {"$set": {
            "zone_config": zone_config,
            "counting_line_y": round(counting_line_y, 4),
            "spatial_status": "auto_calibrated",
            "auto_calibrated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    logger.info(
        "Auto-calibrated store %s: entrance_y=%.3f, zones=%d",
        sid,
        counting_line_y,
        len(zone_config),
    )
    return True


async def run_auto_calibrator_loop(interval_sec: int = 3600):
    """Periodic job: run auto-calibration for eligible stores."""
    while True:
        try:
            async for store in db.stores.find({}):
                try:
                    await run_auto_calibrator_for_store(store)
                except Exception as e:
                    logger.error("Auto-calib failed for %s: %s", store.get("store_id"), e)
        except Exception as e:
            logger.error("Auto-calibrator loop error: %s", e)
        await asyncio.sleep(interval_sec)
