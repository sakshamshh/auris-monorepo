"""
Self-training: hard cases, pseudo labels, admin review.
"""

import os
import io
import zipfile
import base64
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
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
    try:
        async for c in db.hard_cases.find(q).sort("created_at", -1).limit(limit):
            c["_id"] = str(c["_id"])
            cases.append(c)
    except Exception:
        # Fallback if created_at index is missing or excluded in CosmosDB
        async for c in db.hard_cases.find(q).limit(limit):
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


@router.get("/api/training/export-yolo")
@router.post("/api/training/export-yolo")
async def export_yolo_dataset(request: Request, store_id: Optional[str] = None):
    require_admin(request)
    try:
        q = {}
        if store_id:
            q["store_id"] = store_id

        # Find the correct image field name by checking first document
        first_doc = await db.hard_cases.find_one(q)
        img_field = "crop_b64"  # Default fallback
        if first_doc:
            for possible_key in ["crop_b64", "jpeg_b64", "image_b64"]:
                if possible_key in first_doc:
                    img_field = possible_key
                    break

        # Fetch up to 500 hard cases
        cases = []
        async for c in db.hard_cases.find(q).limit(500):
            cases.append(c)

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for case in cases:
                case_id = str(case["_id"])
                image_b64 = case.get(img_field)
                if not image_b64:
                    continue
                
                # Decode base64
                if "," in image_b64:
                    image_b64 = image_b64.split(",")[1]
                image_data = base64.b64decode(image_b64)

                # Write JPEG image
                img_filename = f"images/case_{case_id}.jpg"
                zip_file.writestr(img_filename, image_data)

                # Write label
                label_filename = f"labels/case_{case_id}.txt"
                label_content = "0 0.5 0.5 1.0 1.0\n"
                zip_file.writestr(label_filename, label_content)

            # Write dataset.yaml
            yaml_content = (
                "path: ./\n"
                "train: images\n"
                "val: images\n\n"
                "nc: 1\n"
                "names:\n"
                "  0: person\n"
            )
            zip_file.writestr("dataset.yaml", yaml_content)

        zip_buffer.seek(0)
        return StreamingResponse(
            io.BytesIO(zip_buffer.getvalue()),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=yolo_dataset.zip"}
        )
    except Exception as e:
        import traceback
        err_msg = f"Export pipeline error: {str(e)}\n{traceback.format_exc()}"
        print(err_msg)
        raise HTTPException(status_code=500, detail=err_msg)



@router.get("/api/training/stats")
async def training_stats(request: Request):
    require_admin(request)
    return {
        "hard_cases": await db.hard_cases.count_documents({}),
        "hard_cases_pending": await db.hard_cases.count_documents({"status": "pending"}),
        "pseudo_labels": await db.pseudo_labels.count_documents({}),
    }
