import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import db, hash_password, generate_api_key, ADMIN_KEY

router = APIRouter()


def require_admin(request: Request):
    key = request.headers.get("X-Admin-Key", "")
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


class UpdatePersonaRequest(BaseModel):
    instructions: str


class CreateStoreRequest(BaseModel):
    store_id: str
    store_name: str
    password: str


@router.get("/admin/stores")
async def list_stores(request: Request):
    require_admin(request)
    cursor = db.stores.find({}, {"password_hash": 0, "api_key": 0})
    stores = []
    async for s in cursor:
        stores.append({
            "store_id": s["store_id"],
            "store_name": s.get("store_name", s["store_id"]),
            "created_at": s.get("created_at"),
            "ai_instructions": s.get("ai_instructions", ""),
            "spatial_status": s.get("spatial_status", "pending"),
        })
    return {"stores": stores}


@router.post("/admin/stores")
async def create_store(request: Request, body: CreateStoreRequest):
    require_admin(request)
    sid = body.store_id.strip().lower().replace(" ", "_")
    existing = await db.stores.find_one({"store_id": sid})
    if existing:
        raise HTTPException(status_code=400, detail="Store already exists")

    api_key = generate_api_key()
    from datetime import datetime, timezone

    doc = {
        "store_id": sid,
        "store_name": body.store_name.strip(),
        "password_hash": hash_password(body.password),
        "api_key": api_key,
        "zone_config": {},
        "counting_line_y": 0.5,
        "floors": [],
        "spatial_status": "pending",
        "ai_instructions": "",
        "alert_phone": None,
        "max_capacity": 100,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stores.insert_one(doc)
    return {
        "store_id": sid,
        "store_name": doc["store_name"],
        "api_key": api_key,
        "message": "Store created",
    }


@router.delete("/admin/stores/{store_id}")
async def delete_store(request: Request, store_id: str):
    require_admin(request)
    result = await db.stores.delete_one({"store_id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    await db.blobs.delete_many({"store_id": store_id})
    await db.cameras.delete_many({"store_id": store_id})
    return {"status": "deleted", "store_id": store_id}


@router.post("/admin/stores/{store_id}/persona")
async def update_store_persona(request: Request, store_id: str, body: UpdatePersonaRequest):
    require_admin(request)
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"ai_instructions": body.instructions}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"status": "updated", "store_id": store_id, "instructions": body.instructions}


class UpdateConfigRequest(BaseModel):
    zone_config: Optional[dict] = None
    floors: Optional[list] = None
    camera_positions: Optional[dict] = None


@router.post("/admin/stores/{store_id}/config")
async def update_store_config(request: Request, store_id: str, body: UpdateConfigRequest):
    require_admin(request)
    update_data = {}
    if body.zone_config is not None:
        update_data["zone_config"] = body.zone_config
    if body.floors is not None:
        update_data["floors"] = body.floors
    if body.camera_positions is not None:
        update_data["camera_positions"] = body.camera_positions

    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"status": "updated", "store_id": store_id}

