"""
GTA-style factory floor map protocol.
Stores the factory layout as a JSON canvas:
- Rooms/walls as polygons
- Cameras pinned with position + FOV cone
- Zones drawn as named rectangles on the same canvas
- Everything in real metres from a fixed origin (main entrance = 0,0)

This is the single source of truth for spatial awareness.
The model uses camera position + zone boundaries for smart counting.
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from db import db, get_store_auth, get_store_by_api_key, ADMIN_KEY

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
    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key and admin_key == ADMIN_KEY:
        return {"store_id": request.query_params.get("store_id", "")}
    raise HTTPException(status_code=401, detail="Unauthorized")


# ── Models ────────────────────────────────────────────────────────────────────

class Point(BaseModel):
    x: float  # metres from origin
    y: float  # metres from origin

class Wall(BaseModel):
    id: str
    points: List[Point]  # polygon — 4 points for rect, N for irregular
    label: Optional[str] = None
    kind: str = "wall"   # wall | door | window | machine | obstacle

class CameraPlacement(BaseModel):
    camera_id: str
    name: Optional[str] = None
    x: float           # metres from origin
    y: float           # metres from origin
    height_m: float = 3.0          # mounting height
    heading_deg: float = 0.0       # 0=north/up, 90=east, 180=south, 270=west
    fov_deg: float = 80.0          # horizontal field of view
    rtsp_url: Optional[str] = None
    notes: Optional[str] = None

class Zone(BaseModel):
    zone_id: str
    label: str
    zone_type: str = "WORK_STATION"  # WORK_STATION | ENTRANCE | AISLE | STORAGE
    x1: float   # top-left metres
    y1: float
    x2: float   # bottom-right metres
    y2: float
    expected_headcount: int = 1
    worker_category: str = "operator"
    active: bool = True
    camera_ids: List[str] = []  # which cameras cover this zone

class FloorMapSave(BaseModel):
    store_id: str
    floor_id: str = "floor_0"
    width_m: float          # real factory width in metres
    height_m: float         # real factory height in metres
    origin_label: str = "Main Entrance"
    walls: List[Wall] = []
    cameras: List[CameraPlacement] = []
    zones: List[Zone] = []
    background_image_b64: Optional[str] = None  # optional photo/blueprint overlay


# ── Save entire floor map (single source of truth) ───────────────────────────

@router.post("/api/floormap/save")
async def save_floormap(request: Request, body: FloorMapSave):
    """
    Saves the complete factory floor map in one shot.
    Called by the HQ portal GTA canvas when user clicks Save.
    Overwrites previous map — canvas is the source of truth.
    """
    await _auth(request)
    
    now = datetime.now(timezone.utc).isoformat()
    
    # 1. Save floor map geometry
    await db._db.floormaps.update_one(
        {"store_id": body.store_id, "floor_id": body.floor_id},
        {"$set": {
            "store_id": body.store_id,
            "floor_id": body.floor_id,
            "width_m": body.width_m,
            "height_m": body.height_m,
            "origin_label": body.origin_label,
            "walls": [w.model_dump() for w in body.walls],
            "background_image_b64": body.background_image_b64,
            "updated_at": now,
        }},
        upsert=True
    )
    
    # 2. Upsert cameras — each camera knows its exact position
    for cam in body.cameras:
        await db.cameras.update_one(
            {"store_id": body.store_id, "camera_id": cam.camera_id},
            {"$set": {
                "store_id": body.store_id,
                "camera_id": cam.camera_id,
                "name": cam.name or cam.camera_id,
                "floor_id": body.floor_id,
                "x_m": cam.x,
                "y_m": cam.y,
                "height_m": cam.height_m,
                "heading_deg": cam.heading_deg,
                "fov_deg": cam.fov_deg,
                "rtsp_url": cam.rtsp_url,
                "notes": cam.notes,
                "updated_at": now,
            }},
            upsert=True
        )
    
    # 3. Upsert zones — replaces old ZoneLabelCanvas approach
    # First delete zones not in new map for this floor
    new_zone_ids = [z.zone_id for z in body.zones]
    await db._db.zone_config.delete_many({
        "store_id": body.store_id,
        "floor_id": body.floor_id,
        "zone_id": {"$nin": new_zone_ids}
    })
    
    for zone in body.zones:
        await db._db.zone_config.update_one(
            {"store_id": body.store_id, "zone_id": zone.zone_id},
            {"$set": {
                "store_id": body.store_id,
                "zone_id": zone.zone_id,
                "zone_label": zone.label,
                "label": zone.label,
                "zone_type": zone.zone_type,
                "floor_id": body.floor_id,
                # Normalised bbox [0-1] calculated from real metres
                "bbox": [
                    zone.x1 / body.width_m,
                    zone.y1 / body.height_m,
                    zone.x2 / body.width_m,
                    zone.y2 / body.height_m,
                ],
                # Also store real metres for spatial intelligence
                "bbox_m": [zone.x1, zone.y1, zone.x2, zone.y2],
                "expected_headcount": zone.expected_headcount,
                "worker_category": zone.worker_category,
                "camera_ids": zone.camera_ids,
                "active": zone.active,
                "updated_at": now,
            }},
            upsert=True
        )
    
    return {
        "status": "saved",
        "cameras": len(body.cameras),
        "zones": len(body.zones),
        "walls": len(body.walls),
        "floor_id": body.floor_id,
    }


# ── Load floor map ────────────────────────────────────────────────────────────

@router.get("/api/floormap/{store_id}")
async def get_floormap(request: Request, store_id: str, 
                        floor_id: str = "floor_0"):
    """
    Returns the complete floor map for the GTA canvas to render.
    Also returns cameras and zones so canvas rehydrates fully.
    """
    await _auth(request)
    
    floormap = await db._db.floormaps.find_one(
        {"store_id": store_id, "floor_id": floor_id}
    )
    if not floormap:
        return {
            "exists": False,
            "store_id": store_id,
            "floor_id": floor_id,
            "width_m": 30.0,
            "height_m": 20.0,
            "walls": [], "cameras": [], "zones": []
        }
    
    # Load cameras
    cameras = []
    async for cam in db.cameras.find(
        {"store_id": store_id, "floor_id": floor_id}
    ):
        cam["_id"] = str(cam["_id"])
        cameras.append(cam)
    
    # Load zones
    zones = []
    async for z in db._db.zone_config.find(
        {"store_id": store_id, "floor_id": floor_id}
    ):
        z["_id"] = str(z["_id"])
        zones.append(z)
    
    floormap["_id"] = str(floormap["_id"])
    floormap["cameras"] = cameras
    floormap["zones"] = zones
    floormap["exists"] = True
    
    return floormap


# ── Camera spatial awareness for inference ───────────────────────────────────

@router.get("/api/floormap/camera-context/{store_id}/{camera_id}")
async def get_camera_context(request: Request, store_id: str, 
                               camera_id: str):
    """
    Returns everything the inference layer needs to know about 
    a camera's physical context:
    - Where it is on the floor
    - What zones are in its field of view
    - What the expected headcounts are per zone
    
    Called by frames.py to enrich detections with spatial meaning.
    """
    await _auth(request)
    
    cam = await db.cameras.find_one(
        {"store_id": store_id, "camera_id": camera_id}
    )
    if not cam:
        return {"camera_id": camera_id, "zones_in_view": [], "positioned": False}
    
    floor_id = cam.get("floor_id", "floor_0")
    
    # Find zones that list this camera_id in their camera_ids array
    zones_in_view = []
    async for z in db._db.zone_config.find({
        "store_id": store_id,
        "camera_ids": camera_id,
        "active": True
    }):
        zones_in_view.append({
            "zone_id": z["zone_id"],
            "zone_label": z.get("zone_label", z["zone_id"]),
            "zone_type": z.get("zone_type", "WORK_STATION"),
            "bbox": z.get("bbox", []),
            "bbox_m": z.get("bbox_m", []),
            "expected_headcount": z.get("expected_headcount", 1),
            "worker_category": z.get("worker_category", "operator"),
        })
    
    return {
        "camera_id": camera_id,
        "store_id": store_id,
        "floor_id": floor_id,
        "position": {
            "x_m": cam.get("x_m", 0),
            "y_m": cam.get("y_m", 0),
            "height_m": cam.get("height_m", 3.0),
            "heading_deg": cam.get("heading_deg", 0),
            "fov_deg": cam.get("fov_deg", 80),
        },
        "zones_in_view": zones_in_view,
        "positioned": True,
    }
