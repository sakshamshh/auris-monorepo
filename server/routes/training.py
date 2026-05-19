"""
Self-training: hard cases, pseudo labels, admin review.
"""

import os
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import db, ADMIN_KEY, COLLECTION_CAPS

router = APIRouter()


def require_admin(request: Request):
    if request.headers.get("X-Admin-Key", "") != ADMIN_KEY or not ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


class ReviewAction(BaseModel):
    case_id: str
    action: str  # approve | reject


async def _cap_collection(name: str):
    cap = COLLECTION_CAPS.get(name, 50_000)
    col = getattr(db, name)
    count = await col.count_documents({})
    if count >= cap:
        oldest = await col.find_one({}, sort=[("created_at", 1)])
        if oldest:
            await col.delete_one({"_id": oldest["_id"]})


async def save_hard_case(store_id: str, camera_id: str, crop_b64: str, confidence: float, frame_id: int):
    await _cap_collection("hard_cases")
    await db.hard_cases.insert_one({
        "store_id": store_id,
        "camera_id": camera_id,
        "crop_b64": crop_b64,
        "confidence": confidence,
        "frame_id": frame_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def save_pseudo_label(store_id: str, camera_id: str, crop_b64: str, bbox, confidence: float):
    await _cap_collection("pseudo_labels")
    await db.pseudo_labels.insert_one({
        "store_id": store_id,
        "camera_id": camera_id,
        "crop_b64": crop_b64,
        "bbox": bbox,
        "confidence": confidence,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@router.get("/api/training/hard-cases")
async def list_hard_cases(request: Request, store_id: Optional[str] = None, status: str = "pending", limit: int = 50):
    require_admin(request)
    q = {"status": status}
    if store_id:
        q["store_id"] = store_id
    cases = []
    async for c in db.hard_cases.find(q).sort("created_at", -1).limit(limit):
        c["_id"] = str(c["_id"])
        cases.append(c)
    return {"cases": cases}


@router.post("/api/training/review")
async def review_case(request: Request, body: ReviewAction):
    require_admin(request)
    from bson import ObjectId
    try:
        oid = ObjectId(body.case_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid case_id")

    status = "approved" if body.action == "approve" else "rejected"
    result = await db.hard_cases.update_one(
        {"_id": oid},
        {"$set": {"status": status, "reviewed_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"status": status}


@router.post("/api/training/export-yolo")
async def export_yolo_dataset(request: Request, store_id: Optional[str] = None):
    """Stub: builds manifest for monthly GCP training job."""
    require_admin(request)
    q = {"status": "approved"}
    if store_id:
        q["store_id"] = store_id
    approved = await db.hard_cases.count_documents(q)
    pseudo = await db.pseudo_labels.count_documents({})
    return {
        "status": "ready",
        "approved_hard_cases": approved,
        "pseudo_labels": pseudo,
        "message": "Run training job on GCP GPU; deploy yolov8m-auris-v2.pt to server",
    }


@router.get("/api/training/stats")
async def training_stats(request: Request):
    require_admin(request)
    return {
        "hard_cases": await db.hard_cases.count_documents({}),
        "hard_cases_pending": await db.hard_cases.count_documents({"status": "pending"}),
        "pseudo_labels": await db.pseudo_labels.count_documents({}),
    }
