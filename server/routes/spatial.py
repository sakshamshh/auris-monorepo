"""
Spatial APIs: floors, SVG map, live positions, heatmap.
"""

from datetime import datetime, timezone
from typing import Optional

from html import escape

from fastapi import APIRouter, HTTPException, Request, Response

from db import db, get_store_auth

router = APIRouter()


async def _auth(request: Request):
    store_id = request.headers.get("X-Store-ID", "")
    password = request.headers.get("X-Password", "")
    store = await get_store_auth(store_id, password)
    if not store:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return store


@router.get("/api/spatial/floors")
async def list_floors(request: Request):
    store = await _auth(request)
    sid = store["store_id"]
    floors = []
    async for f in db.floors.find({"store_id": sid}):
        floors.append({
            "floor_id": f.get("floor_id"),
            "origin_label": f.get("origin_label", "Main entrance"),
            "bounds_m": f.get("bounds_m", {"width": 50, "height": 50}),
        })
    if not floors:
        floors = [{"floor_id": "floor_0", "origin_label": "Default", "bounds_m": {"width": 50, "height": 50}}]
    return {"floors": floors}


@router.get("/api/spatial/map.svg")
async def floor_map_svg(request: Request, floor_id: str = "floor_0"):
    store = await _auth(request)
    sid = store["store_id"]
    floor = await db.floors.find_one({"store_id": sid, "floor_id": floor_id})
    bounds = (floor or {}).get("bounds_m", {"width": 50, "height": 50})
    w, h = bounds.get("width", 50), bounds.get("height", 50)

    geometry = (floor or {}).get("geometry", {})
    boundary = geometry.get("boundary", [])
    walls = geometry.get("walls", [])
    openings = geometry.get("openings", [])
    obstacles = geometry.get("obstacles", [])

    floor_shapes = ""
    if boundary:
        points = " ".join(f'{p.get("x_m", 0):.2f},{p.get("y_m", 0):.2f}' for p in boundary)
        floor_shapes += f'<polygon points="{points}" fill="#ffffff" stroke="#1d1d1f" stroke-width="0.12"/>'
    else:
        floor_shapes += f'<rect width="{w}" height="{h}" fill="#ffffff" stroke="#1d1d1f" stroke-width="0.12"/>'

    for wall in walls:
        s, e = wall.get("start", {}), wall.get("end", {})
        floor_shapes += f'<line x1="{s.get("x_m", 0):.2f}" y1="{s.get("y_m", 0):.2f}" x2="{e.get("x_m", 0):.2f}" y2="{e.get("y_m", 0):.2f}" stroke="#1d1d1f" stroke-width="0.18" stroke-linecap="round"/>'

    for opening in openings:
        s, e = opening.get("start", {}), opening.get("end", {})
        label = escape(opening.get("label") or opening.get("kind") or "opening")
        floor_shapes += f'<line x1="{s.get("x_m", 0):.2f}" y1="{s.get("y_m", 0):.2f}" x2="{e.get("x_m", 0):.2f}" y2="{e.get("y_m", 0):.2f}" stroke="#0a84ff" stroke-width="0.24" stroke-linecap="round"/><text x="{s.get("x_m", 0):.2f}" y="{s.get("y_m", 0) - 0.25:.2f}" font-size="0.45" fill="#0a84ff">{label}</text>'

    for obstacle in obstacles:
        if len(obstacle) >= 3:
            points = " ".join(f'{p.get("x_m", 0):.2f},{p.get("y_m", 0):.2f}' for p in obstacle)
            floor_shapes += f'<polygon points="{points}" fill="rgba(255,69,58,0.12)" stroke="#ff453a" stroke-width="0.08"/>'

    zones = store.get("zone_config", {})
    zone_paths = ""
    for name, bbox in zones.items():
        x1, y1, x2, y2 = bbox
        zx1, zy1 = x1 * w, y1 * h
        zw, zh = (x2 - x1) * w, (y2 - y1) * h
        zone_paths += f'<rect x="{zx1:.1f}" y="{zy1:.1f}" width="{zw:.1f}" height="{zh:.1f}" fill="rgba(166,139,91,0.15)" stroke="#A68B5B" stroke-width="0.2"/><text x="{zx1+0.5:.1f}" y="{zy1+1:.1f}" font-size="1.2" fill="#666">{name}</text>'

    cameras_svg = ""
    async for cam in db.cameras.find({"store_id": sid, "floor_id": floor_id}):
        cameras_svg += f'<circle cx="2" cy="2" r="0.8" fill="#1D1D1F" opacity="0.5"/><text x="2.5" y="2.5" font-size="1">{cam.get("camera_id","")[:8]}</text>'

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="100%" height="100%">
  <rect width="{w}" height="{h}" fill="#F5F5F7" stroke="#ddd"/>
  {floor_shapes}
  <text x="0.5" y="1.0" font-size="0.7" fill="#A68B5B">Floor: {escape(floor_id)}</text>
  {zone_paths}
  {cameras_svg}
</svg>'''
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/api/spatial/live")
async def spatial_live(request: Request, floor_id: str = "floor_0"):
    store = await _auth(request)
    sid = store["store_id"]
    positions = []
    async for p in db.spatial_positions.find({"store_id": sid, "floor_id": floor_id}):
        positions.append({
            "track_id": p.get("track_id"),
            "x_m": p.get("x_m"),
            "y_m": p.get("y_m"),
            "camera_id": p.get("camera_id"),
            "global_track_id": p.get("global_track_id"),
        })
    return {"floor_id": floor_id, "positions": positions, "updated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/api/spatial/heatmap")
async def spatial_heatmap(request: Request, floor_id: str = "floor_0", date: Optional[str] = None):
    store = await _auth(request)
    sid = store["store_id"]
    day = date or datetime.now(timezone.utc).date().isoformat()
    cells = []
    async for c in db.heatmap_cells.find({"store_id": sid, "floor_id": floor_id, "date": day}):
        cells.append({
            "gx": c.get("gx"),
            "gy": c.get("gy"),
            "count": c.get("count", 0),
        })
    return {"date": day, "floor_id": floor_id, "cells": cells}
