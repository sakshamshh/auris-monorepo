import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from db import db, hash_password, generate_api_key, ADMIN_KEY

router = APIRouter()


@router.get("/install.sh", response_class=PlainTextResponse)
async def get_install_script():
    """
    Returns the edge/setup.sh installation script as plain text.
    No authentication is required.
    """
    paths_to_try = [
        os.path.join(os.path.dirname(__file__), "..", "..", "edge", "setup.sh"),
        os.path.join(os.getcwd(), "edge", "setup.sh"),
        os.path.join(os.getcwd(), "..", "edge", "setup.sh"),
        "edge/setup.sh",
    ]
    
    for path in paths_to_try:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                return content
            except Exception:
                continue
                
    raise HTTPException(status_code=404, detail="Installation script not found on server")



def require_admin(request: Request):
    key = request.headers.get("X-Admin-Key", "")
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


class UpdatePersonaRequest(BaseModel):
    instructions: str


class UpdatePasswordRequest(BaseModel):
    password: str


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
        store_id = s["store_id"]
        
        # Count cameras configured for this store
        cameras_count = 0
        try:
            cameras_count = await db.cameras.count_documents({"store_id": store_id})
        except Exception:
            pass
            
        # Get the latest telemetry blob timestamp
        last_blob = None
        try:
            last_blob_doc = await db.blobs.find_one({"store_id": store_id}, sort=[("timestamp", -1)])
            if last_blob_doc:
                last_blob = last_blob_doc.get("timestamp")
        except Exception:
            pass

        stores.append({
            "store_id": store_id,
            "store_name": s.get("store_name", store_id),
            "created_at": s.get("created_at"),
            "ai_instructions": s.get("ai_instructions", ""),
            "spatial_status": s.get("spatial_status", "pending"),
            "cameras_count": cameras_count,
            "last_blob": last_blob,
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


@router.get("/admin/stores/{store_id}")
async def get_store_details(request: Request, store_id: str):
    require_admin(request)
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return {
        "store_id": store["store_id"],
        "store_name": store.get("store_name", store["store_id"]),
        "api_key": store.get("api_key", ""),
        "spatial_status": store.get("spatial_status", "pending"),
        "created_at": store.get("created_at"),
        "ai_instructions": store.get("ai_instructions", ""),
    }


@router.patch("/admin/stores/{store_id}")
async def update_store_password(request: Request, store_id: str, body: UpdatePasswordRequest):
    require_admin(request)
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"password_hash": hash_password(body.password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"status": "password updated", "store_id": store_id}


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

