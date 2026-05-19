"""
iPhone LiDAR / RoomPlan mapping ingest.

The phone or laptop-side converter sends metric room geometry here. AURIS stores
it as the canonical 2D floor plan used by calibration, live dots, and heatmaps.
"""

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from db import db, get_store_auth, get_store_by_api_key

router = APIRouter()


async def _auth(request: Request) -> Dict[str, Any]:
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


class MapPoint(BaseModel):
    x_m: float
    y_m: float
    label: Optional[str] = None


class MapSegment(BaseModel):
    start: MapPoint
    end: MapPoint
    label: Optional[str] = None
    kind: str = "wall"


class FloorPlanUpload(BaseModel):
    floor_id: str = "floor_0"
    name: Optional[str] = None
    source: str = "iphone_lidar"
    scan_id: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    boundary: List[MapPoint] = Field(default_factory=list)
    walls: List[MapSegment] = Field(default_factory=list)
    openings: List[MapSegment] = Field(default_factory=list)
    obstacles: List[List[MapPoint]] = Field(default_factory=list)
    raw_roomplan: Optional[Dict[str, Any]] = None


def _point_key(point: MapPoint) -> str:
    return f"{point.x_m:.2f}:{point.y_m:.2f}"


def _distance(a: MapPoint, b: MapPoint) -> float:
    return math.hypot(a.x_m - b.x_m, a.y_m - b.y_m)


def _polygon_area(points: List[MapPoint]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    for i, point in enumerate(points):
        other = points[(i + 1) % len(points)]
        area += point.x_m * other.y_m - other.x_m * point.y_m
    return abs(area) / 2


def _convex_hull(points: List[MapPoint]) -> List[MapPoint]:
    unique = {(round(p.x_m, 3), round(p.y_m, 3)): p for p in points}
    ordered = sorted(unique.values(), key=lambda p: (p.x_m, p.y_m))
    if len(ordered) <= 3:
        return ordered

    def cross(o: MapPoint, a: MapPoint, b: MapPoint) -> float:
        return (a.x_m - o.x_m) * (b.y_m - o.y_m) - (a.y_m - o.y_m) * (b.x_m - o.x_m)

    lower: List[MapPoint] = []
    for point in ordered:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: List[MapPoint] = []
    for point in reversed(ordered):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def _bounds(points: List[MapPoint]) -> Dict[str, float]:
    if not points:
        return {"min_x": 0, "min_y": 0, "width": 10, "height": 10}
    min_x = min(p.x_m for p in points)
    min_y = min(p.y_m for p in points)
    max_x = max(p.x_m for p in points)
    max_y = max(p.y_m for p in points)
    return {
        "min_x": round(min_x, 3),
        "min_y": round(min_y, 3),
        "width": round(max(max_x - min_x, 0.1), 3),
        "height": round(max(max_y - min_y, 0.1), 3),
    }


def _normalize_points(points: List[MapPoint], min_x: float, min_y: float) -> List[Dict[str, Any]]:
    return [
        {"x_m": round(point.x_m - min_x, 3), "y_m": round(point.y_m - min_y, 3), "label": point.label}
        for point in points
    ]


def _normalize_segment(segment: MapSegment, min_x: float, min_y: float) -> Dict[str, Any]:
    return {
        "start": {"x_m": round(segment.start.x_m - min_x, 3), "y_m": round(segment.start.y_m - min_y, 3)},
        "end": {"x_m": round(segment.end.x_m - min_x, 3), "y_m": round(segment.end.y_m - min_y, 3)},
        "label": segment.label,
        "kind": segment.kind,
    }


def _quality(body: FloorPlanUpload, boundary: List[MapPoint]) -> Dict[str, Any]:
    wall_endpoints = [_point_key(w.start) for w in body.walls] + [_point_key(w.end) for w in body.walls]
    endpoint_counts = {key: wall_endpoints.count(key) for key in set(wall_endpoints)}
    dangling = [key for key, count in endpoint_counts.items() if count == 1]
    perimeter = sum(_distance(boundary[i], boundary[(i + 1) % len(boundary)]) for i in range(len(boundary))) if len(boundary) > 2 else 0
    area = _polygon_area(boundary)
    closed_loop = len(boundary) >= 4 and area >= 1 and len(dangling) <= max(2, len(body.openings) * 2)
    return {
        "closed_loop": closed_loop,
        "wall_count": len(body.walls),
        "opening_count": len(body.openings),
        "boundary_points": len(boundary),
        "area_sq_m": round(area, 3),
        "perimeter_m": round(perimeter, 3),
        "confidence": body.confidence,
        "warnings": [] if closed_loop else ["Scan boundary is not confidently closed; rescan corners or review manually."],
    }


def _build_floor_doc(store_id: str, body: FloorPlanUpload) -> Dict[str, Any]:
    if not body.boundary and not body.walls:
        raise HTTPException(status_code=400, detail="Provide a boundary polygon or wall segments")

    source_points = list(body.boundary)
    for wall in body.walls:
        source_points.extend([wall.start, wall.end])

    boundary = body.boundary or _convex_hull(source_points)
    if len(boundary) < 3:
        raise HTTPException(status_code=400, detail="Need at least three non-collinear room points")

    bounds = _bounds(boundary)
    min_x, min_y = bounds["min_x"], bounds["min_y"]
    quality = _quality(body, boundary)

    geometry = {
        "boundary": _normalize_points(boundary, min_x, min_y),
        "walls": [_normalize_segment(wall, min_x, min_y) for wall in body.walls],
        "openings": [_normalize_segment(opening, min_x, min_y) for opening in body.openings],
        "obstacles": [_normalize_points(poly, min_x, min_y) for poly in body.obstacles],
        "origin_m": {"x_m": min_x, "y_m": min_y},
    }

    return {
        "store_id": store_id,
        "floor_id": body.floor_id,
        "name": body.name or body.floor_id,
        "origin_label": "iPhone LiDAR scan origin",
        "bounds_m": {"width": bounds["width"], "height": bounds["height"]},
        "geometry": geometry,
        "map_source": body.source,
        "scan_id": body.scan_id,
        "scan_quality": quality,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/api/mapping/floorplan")
async def upload_floorplan(request: Request, body: FloorPlanUpload):
    store = await _auth(request)
    store_id = store["store_id"]
    floor_doc = _build_floor_doc(store_id, body)

    await db.floors.update_one(
        {"store_id": store_id, "floor_id": body.floor_id},
        {"$set": floor_doc},
        upsert=True,
    )

    scan_doc = {
        **floor_doc,
        "raw_roomplan": body.raw_roomplan,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.mapping_scans.insert_one(scan_doc)
    await db.stores.update_one(
        {"store_id": store_id},
        {"$addToSet": {"floors": body.floor_id}, "$set": {"latest_map_floor_id": body.floor_id}},
    )
    return {"status": "saved", "floorplan": floor_doc}


@router.get("/api/mapping/floorplan")
async def get_floorplan(request: Request, floor_id: str = "floor_0"):
    store = await _auth(request)
    doc = await db.floors.find_one({"store_id": store["store_id"], "floor_id": floor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No floor plan uploaded yet")
    return {"floorplan": doc}
