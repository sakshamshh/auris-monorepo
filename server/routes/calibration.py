"""
Calibration: LDM ground control, QR detection, SfM auto-run, homography solve.
"""

import base64
import io
import os
from datetime import datetime, timezone
from typing import List, Optional

import cv2
import numpy as np
import qrcode
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from db import db, get_store_auth, get_store_by_api_key
from spatial.homography import solve_homography, detect_qr_scale
from spatial.sfm import run_sfm_calibration

router = APIRouter()


async def _store_auth(request: Request):
    store_id = request.headers.get("X-Store-ID", "")
    password = request.headers.get("X-Password", "")
    if store_id and password:
        store = await get_store_auth(store_id, password)
        if store:
            return store
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        store = await get_store_by_api_key(api_key)
        if store:
            return store
    raise HTTPException(status_code=401, detail="Unauthorized")


class GCPPoint(BaseModel):
    px: float
    py: float
    x_m: float
    y_m: float
    label: Optional[str] = None


class GCPSaveRequest(BaseModel):
    store_id: str
    camera_id: str
    floor_id: str = "floor_0"
    points: List[GCPPoint]


@router.post("/api/calibration/gcp")
async def save_gcp(request: Request, body: GCPSaveRequest):
    await _store_auth(request)
    if len(body.points) < 4:
        raise HTTPException(status_code=400, detail="Need at least 4 points")

    doc = {
        "store_id": body.store_id,
        "camera_id": body.camera_id,
        "floor_id": body.floor_id,
        "points": [p.model_dump() for p in body.points],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ground_control_points.update_one(
        {"store_id": body.store_id, "camera_id": body.camera_id},
        {"$set": doc},
        upsert=True,
    )
    return {"status": "saved", "point_count": len(body.points)}


@router.get("/api/calibration/gcp")
async def get_gcp(request: Request, store_id: str, camera_id: str):
    await _store_auth(request)
    doc = await db.ground_control_points.find_one(
        {"store_id": store_id, "camera_id": camera_id}
    )
    cam = await db.cameras.find_one({"store_id": store_id, "camera_id": camera_id})
    return {
        "points": doc.get("points", []) if doc else [],
        "homography": cam.get("homography") if cam else None,
        "rmse_m": cam.get("rmse_m") if cam else None,
        "calibration_method": cam.get("calibration_method") if cam else None,
    }


@router.post("/api/calibration/solve")
async def solve_camera_homography(request: Request, store_id: str, camera_id: str, floor_id: str = "floor_0"):
    await _store_auth(request)
    doc = await db.ground_control_points.find_one(
        {"store_id": store_id, "camera_id": camera_id}
    )
    if not doc or len(doc.get("points", [])) < 4:
        raise HTTPException(status_code=400, detail="Save at least 4 GCPs first")

    H, rmse, err = solve_homography(doc["points"])
    if H is None:
        raise HTTPException(status_code=400, detail=err or "Solve failed")

    await db.cameras.update_one(
        {"store_id": store_id, "camera_id": camera_id},
        {"$set": {
            "store_id": store_id,
            "camera_id": camera_id,
            "floor_id": floor_id,
            "homography": H,
            "rmse_m": rmse,
            "calibration_method": "ldm",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"spatial_status": "calibrated"}, "$addToSet": {"floors": floor_id}},
    )
    return {"status": "ok", "rmse_m": rmse, "homography": H}


@router.get("/api/calibration/snapshot")
async def calibration_snapshot(request: Request, store_id: str, camera_id: str):
    await _store_auth(request)
    doc = await db.calibration_frames.find_one(
        {"store_id": store_id, "camera_id": camera_id},
        sort=[("created_at", -1)],
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No calibration frame")
    return {
        "full_frame_b64": doc.get("full_frame_b64"),
        "timestamp": doc.get("timestamp"),
        "frame_id": doc.get("frame_id"),
    }


@router.post("/api/calibration/homography")
async def manual_homography(request: Request, store_id: str, camera_id: str, floor_id: str = "floor_0", body: GCPSaveRequest = None):
    """Manual 4+ point homography (dashboard override)."""
    if body is None:
        raise HTTPException(status_code=400, detail="Body required")
    await save_gcp(request, body)
    return await solve_camera_homography(request, store_id, camera_id, floor_id)


@router.get("/api/calibration/qr/generate")
async def generate_qr(floor_id: str, store_id: str, size_cm: float = 29.7):
    payload = f'{{"store_id":"{store_id}","floor_id":"{floor_id}","qr_size_cm":{size_cm}}}'
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@router.get("/api/calibration/status")
async def calibration_status(request: Request, store_id: str):
    await _store_auth(request)
    total = await db.calibration_frames.count_documents({"store_id": store_id})
    with_qr = await db.calibration_frames.count_documents(
        {"store_id": store_id, "qr_detections.0": {"$exists": True}}
    )
    cameras = await db.cameras.count_documents({"store_id": store_id, "homography": {"$exists": True}})
    cam_total = len(await db.calibration_frames.distinct("camera_id", {"store_id": store_id}))
    return {
        "calibration_frames": total,
        "frames_with_qr": with_qr,
        "cameras_calibrated": cameras,
        "cameras_seen": cam_total,
        "pct_qr": round(100 * with_qr / max(total, 1), 1),
    }


@router.post("/api/calibration/run")
async def run_auto_calibration(request: Request, store_id: str):
    """Run SfM fallback after 48h calibration."""
    await _store_auth(request)
    cursor = db.calibration_frames.find({"store_id": store_id}).limit(200)
    frames = [doc async for doc in cursor]
    result = run_sfm_calibration(frames)

    for cam_id, data in result.get("cameras", {}).items():
        existing = await db.cameras.find_one({"store_id": store_id, "camera_id": cam_id})
        if existing and existing.get("calibration_method") == "ldm":
            continue
        await db.cameras.update_one(
            {"store_id": store_id, "camera_id": cam_id},
            {"$set": {
                "store_id": store_id,
                "camera_id": cam_id,
                "homography": data["homography"],
                "calibration_method": "sfm",
                "sfm_confidence": data.get("confidence"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )

    await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"spatial_status": "auto_calibrated"}},
    )
    return result


async def process_qr_on_calib_frame(doc: dict):
    """Called from frames ingest — detect QR and store scale."""
    b64 = doc.get("full_frame_b64")
    if not b64:
        return
    raw = base64.b64decode(b64)
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return
    qr = detect_qr_scale(img)
    if qr:
        await db.calibration_frames.update_one(
            {"_id": doc["_id"]},
            {"$set": {"qr_detections": [qr], "processed": True}},
        )
