"""
Camera pinning & factory-level management endpoints.
Handles: camera registration on floor map, per-factory floor listing,
multi-floor schematic stitching offsets.
"""

from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from db import db, get_store_auth, get_store_by_api_key

router = APIRouter()


async def _auth(request: Request):
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


# ── Camera Pin Model ──────────────────────────────────────────────────────────

class CameraPin(BaseModel):
    camera_id: str
    name: Optional[str] = None
    floor_id: str = "floor_0"
    # Position on the floor map in metres from origin
    x_m: float = 0.0
    y_m: float = 0.0
    # Compass heading the camera faces (0=north/up, 90=east, etc.)
    heading_deg: float = 0.0
    # Field of view in degrees
    fov_deg: float = 80.0
    rtsp_url: Optional[str] = None
    notes: Optional[str] = None


class FloorStitchOffset(BaseModel):
    """When a factory has multiple room scans, define where each sits in global space."""
    floor_id: str
    offset_x_m: float = 0.0
    offset_y_m: float = 0.0
    label: Optional[str] = None


# ── Camera Pin Endpoints ──────────────────────────────────────────────────────

@router.post("/api/cameras/pin")
async def pin_camera(request: Request, body: CameraPin):
    """Place or update a camera's physical position on a floor map."""
    store = await _auth(request)
    sid = store["store_id"]
    doc = {
        "store_id": sid,
        "camera_id": body.camera_id,
        "name": body.name or body.camera_id,
        "floor_id": body.floor_id,
        "x_m": body.x_m,
        "y_m": body.y_m,
        "heading_deg": body.heading_deg,
        "fov_deg": body.fov_deg,
        "rtsp_url": body.rtsp_url,
        "notes": body.notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cameras.update_one(
        {"store_id": sid, "camera_id": body.camera_id},
        {"$set": doc},
        upsert=True,
    )
    return {"status": "pinned", "camera": doc}


@router.get("/api/cameras/list")
async def list_cameras(request: Request, floor_id: Optional[str] = None):
    """List all cameras for this store, optionally filtered by floor."""
    store = await _auth(request)
    sid = store["store_id"]
    query = {"store_id": sid}
    if floor_id:
        query["floor_id"] = floor_id
    cameras = []
    async for cam in db.cameras.find(query, {"_id": 0}):
        cameras.append(cam)
    return {"cameras": cameras}


@router.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str, request: Request):
    store = await _auth(request)
    result = await db.cameras.delete_one({"store_id": store["store_id"], "camera_id": camera_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"status": "deleted", "camera_id": camera_id}


# ── Floor Stitching Endpoints ─────────────────────────────────────────────────

@router.post("/api/floors/stitch-offset")
async def set_stitch_offset(request: Request, body: FloorStitchOffset):
    """
    Define where a floor scan sits in the global factory coordinate space.
    e.g. Room B starts at (12.5m, 0m) from the main entrance.
    """
    store = await _auth(request)
    sid = store["store_id"]
    await db.floors.update_one(
        {"store_id": sid, "floor_id": body.floor_id},
        {"$set": {
            "stitch_offset": {"x_m": body.offset_x_m, "y_m": body.offset_y_m},
            "label": body.label,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=False,
    )
    return {"status": "ok", "floor_id": body.floor_id, "offset": {"x_m": body.offset_x_m, "y_m": body.offset_y_m}}


@router.get("/api/floors/stitched")
async def get_stitched_map(request: Request):
    """
    Return all floors with their offsets so the dashboard can render
    a unified multi-room stitched map in one SVG coordinate space.
    """
    store = await _auth(request)
    sid = store["store_id"]
    floors = []
    async for f in db.floors.find({"store_id": sid}, {"_id": 0}):
        floors.append(f)
    # Compute global bounding box
    max_x = max((f.get("stitch_offset", {}).get("x_m", 0) + f.get("bounds_m", {}).get("width", 0) for f in floors), default=50)
    max_y = max((f.get("stitch_offset", {}).get("y_m", 0) + f.get("bounds_m", {}).get("height", 0) for f in floors), default=50)
    return {
        "floors": floors,
        "global_bounds_m": {"width": round(max_x, 2), "height": round(max_y, 2)},
    }


# ── Factory CRUD ──────────────────────────────────────────────────────────────

@router.get("/api/factories")
async def list_factories(request: Request):
    """List all stores/factories accessible via admin key."""
    # Admin-level: uses X-Admin-Key from db
    from db import ADMIN_KEY
    if request.headers.get("X-Admin-Key", "") != ADMIN_KEY or not ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key required")
    factories = []
    async for s in db.stores.find({}, {"_id": 0, "password_hash": 0}):
        factories.append(s)
    return {"factories": factories}
