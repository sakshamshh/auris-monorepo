"""Legacy blob endpoint for older edge builds."""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

from db import get_store_by_api_key, db

router = APIRouter()


class LegacyBlobPayload(BaseModel):
    store_id: str
    camera_id: str
    timestamp: str
    people_count: int = 0


@router.post("/api/blobs")
async def receive_blob(request: Request, payload: LegacyBlobPayload):
    api_key = request.headers.get("X-API-Key", "")
    store = await get_store_by_api_key(api_key)
    if not store:
        raise HTTPException(status_code=401, detail="Unauthorized")
    await db.blobs.insert_one({
        "store_id": payload.store_id,
        "camera_id": payload.camera_id,
        "timestamp": payload.timestamp,
        "people_now": payload.people_count,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "legacy": True,
    })
    return {"status": "ok"}
