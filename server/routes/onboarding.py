"""
FastAPI Routes for Factory Onboarding and Configuration.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

# Setup logging
logger = logging.getLogger("AurisCloud.onboarding")

router = APIRouter()

# Handle potential difference in get_db naming on test runners defensively
try:
    from db import get_db
except ImportError:
    from db import get_database as get_db


def _get_raw_db():
    """Defensively extract raw motor database from different get_db signatures."""
    conn = get_db()
    if hasattr(conn, "_db"):
        return conn._db
    return conn


def _calculate_shift_duration_hours(shift: Dict[str, Any]) -> float:
    """Helper to calculate shift duration in hours (handles overnight shifts correctly)."""
    try:
        start_str = shift.get("startTime", "")
        end_str = shift.get("endTime", "")
        if not start_str or not end_str:
            return 8.0  # Fallback to standard 8-hour shift
            
        start_h, start_m = map(int, start_str.split(":"))
        end_h, end_m = map(int, end_str.split(":"))
        
        start_mins = start_h * 60 + start_m
        end_mins = end_h * 60 + end_m
        
        # Calculate duration in minutes (handles overnight shift automatically via modulo)
        diff_mins = (end_mins - start_mins) % 1440
        if diff_mins == 0 and start_str != end_str:
            diff_mins = 1440  # 24-hour shift
            
        duration = diff_mins / 60.0
        return duration if duration > 0 else 8.0
    except Exception as e:
        logger.error("Failed to parse shift times for shift %s: %s", shift, e)
        return 8.0


def require_admin_key(request: Request):
    """Verifies standard Admin API Key header and returns 401 on failure."""
    key = request.headers.get("X-Admin-Key", "")
    if key != "auris2026adminkey":
        logger.warning("Admin authorization failed: invalid X-Admin-Key")
        raise HTTPException(status_code=401, detail="Unauthorized")


# --- PYDANTIC SCHEMAS ---

class ShiftModel(BaseModel):
    model_config = ConfigDict(extra="allow")
    label: str
    startTime: str
    endTime: str
    days: Dict[str, bool]


class OnboardRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    store_id: str
    factory_name: str
    city: str
    numShifts: int
    shifts: List[ShiftModel]
    totalHeadcount: int
    operatorWage: int
    supervisorWage: int
    contractorWage: int
    whatsAppNumber: str


class ZoneConfigRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    store_id: str
    zone_id: str


class PatchConfigRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    store_id: str
    status: str


class CameraConfigModel(BaseModel):
    model_config = ConfigDict(extra="allow")
    camera_id: str
    rtsp_url: str
    label: str
    fps: int = 2


class CamerasUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    store_id: str
    cameras: List[CameraConfigModel]


# --- ROUTE HANDLERS ---

@router.post("/api/factory/onboard")
async def onboard_factory(request: Request, body: OnboardRequest):
    """
    Onboard a factory configuration.
    Computes hourly wages and saves configuration details.
    """
    require_admin_key(request)
    
    # Calculate average shift duration in hours
    shifts_list = [s.model_dump() for s in body.shifts]
    shift_durations = []
    for shift in shifts_list:
        start_h, start_m = map(int, shift['startTime'].split(':'))
        end_h, end_m = map(int, shift['endTime'].split(':'))
        start_mins = start_h * 60 + start_m
        end_mins = end_h * 60 + end_m
        if end_mins <= start_mins:  # overnight shift
            end_mins += 24 * 60
        duration_hours = (end_mins - start_mins) / 60
        shift_durations.append(duration_hours)
    
    avg_shift_hours = sum(shift_durations) / len(shift_durations) if shift_durations else 8.0
    if avg_shift_hours == 0:
        avg_shift_hours = 8.0
        
    operator_hourly = body.operatorWage / avg_shift_hours
    supervisor_hourly = body.supervisorWage / avg_shift_hours
    contractor_hourly = body.contractorWage / avg_shift_hours
    
    # Build worker_categories list
    worker_categories = [
        {
            "category": "Operator",
            "daily_wage_inr": body.operatorWage,
            "hourly_wage_inr": round(body.operatorWage / avg_shift_hours, 2),
            "minute_wage_inr": round(body.operatorWage / avg_shift_hours / 60, 4)
        },
        {
            "category": "Supervisor", 
            "daily_wage_inr": body.supervisorWage,
            "hourly_wage_inr": round(body.supervisorWage / avg_shift_hours, 2),
            "minute_wage_inr": round(body.supervisorWage / avg_shift_hours / 60, 4)
        },
        {
            "category": "Contractor",
            "daily_wage_inr": body.contractorWage,
            "hourly_wage_inr": round(body.contractorWage / avg_shift_hours, 2),
            "minute_wage_inr": round(body.contractorWage / avg_shift_hours / 60, 4)
        }
    ]
    
    raw_db = _get_raw_db()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    trial_start = now_iso
    trial_end = (now + timedelta(days=30)).isoformat()
    
    update_doc = {
        "$set": {
            "store_id": body.store_id,
            "factory_name": body.factory_name,
            "location": body.city,
            "city": body.city,
            "status": "pending",
            "trial_start": trial_start,
            "trial_end": trial_end,
            "numShifts": body.numShifts,
            "shifts": shifts_list,
            "totalHeadcount": body.totalHeadcount,
            "operatorWage": body.operatorWage,
            "supervisorWage": body.supervisorWage,
            "contractorWage": body.contractorWage,
            "whatsapp_number": body.whatsAppNumber,
            "whatsAppNumber": body.whatsAppNumber,
            "cameras": [],
            # Computed values
            "operator_hourly_wage": operator_hourly,
            "supervisor_hourly_wage": supervisor_hourly,
            "contractor_hourly_wage": contractor_hourly,
            "operatorHourlyWage": operator_hourly,
            "supervisorHourlyWage": supervisor_hourly,
            "contractorHourlyWage": contractor_hourly,
            "worker_categories": worker_categories,
            "updated_at": now_iso,
        },
        "$setOnInsert": {
            "created_at": now_iso,
        }
    }
    
    await raw_db.factory_config.update_one(
        {"store_id": body.store_id},
        update_doc,
        upsert=True
    )
    
    logger.info("Successfully onboarded/updated factory for store_id %s", body.store_id)
    return {"success": True, "store_id": body.store_id}


@router.post("/api/factory/cameras/update")
async def update_factory_cameras(request: Request, body: CamerasUpdateRequest):
    """
    Update camera configurations for a factory in factory_config.
    Requires admin key.
    """
    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key != "auris2026adminkey":
        logger.warning("Admin authorization failed for camera update")
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    raw_db = _get_raw_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    cameras_list = [c.model_dump() for c in body.cameras]
    
    await raw_db.factory_config.update_one(
        {"store_id": body.store_id},
        {
            "$set": {
                "cameras": cameras_list,
                "updated_at": now_iso
            },
            "$setOnInsert": {
                "created_at": now_iso,
                "status": "pending",
                "shifts": [],
                "worker_categories": []
            }
        },
        upsert=True
    )
    
    for cam in body.cameras:
        await raw_db.cameras.update_one(
            {"store_id": body.store_id, "camera_id": cam.camera_id},
            {
                "$set": {
                    "name": cam.label,
                    "rtsp_url": cam.rtsp_url,
                    "label": cam.label,
                    "updated_at": now_iso
                }
            },
            upsert=True
        )
        
    logger.info("Successfully updated factory cameras for store %s: %s", body.store_id, cameras_list)
    return {"success": True, "store_id": body.store_id}



@router.get("/api/factory/config")
async def get_factory_config(request: Request):
    """
    Get factory configuration for a store.
    Requires store credentials authentication.
    """
    store_id = request.headers.get("X-Store-ID", "").strip()
    password = request.headers.get("X-Password", "")
    
    if not store_id:
        logger.warning("GET config request missing X-Store-ID header")
        raise HTTPException(status_code=401, detail="Missing X-Store-ID header")
        
    raw_db = _get_raw_db()
    
    # 1. Verify store exists in stores collection
    store = await raw_db.stores.find_one({"store_id": store_id})
    if not store:
        logger.warning("Store ID %s not found in stores collection", store_id)
        raise HTTPException(status_code=404, detail="Store not found")
        
    # 2. Verify password
    if not password:
        logger.warning("GET config request for store %s missing X-Password header", store_id)
        raise HTTPException(status_code=401, detail="Missing X-Password header")
        
    from db import verify_password
    if not verify_password(password, store.get("password_hash", "")):
        logger.warning("GET config authorization failed: invalid password for store %s", store_id)
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    # 3. Retrieve factory_config document
    config = await raw_db.factory_config.find_one({"store_id": store_id})
    if not config:
        logger.warning("Factory config not found for store %s", store_id)
        raise HTTPException(status_code=404, detail="Factory config not found")
        
    # Convert MongoDB _id for JSON serialization
    if "_id" in config:
        config["_id"] = str(config["_id"])
        
    logger.info("Successfully retrieved factory config for store %s", store_id)
    return config


@router.get("/api/factory/configs")
async def list_factory_configs(request: Request):
    """
    List all factory configurations.
    Requires admin key.
    """
    require_admin_key(request)
    raw_db = _get_raw_db()
    cursor = raw_db.factory_config.find({})
    configs = []
    async for c in cursor:
        if "_id" in c:
            c["_id"] = str(c["_id"])
        configs.append(c)
    return {"configs": configs}


@router.get("/api/factory/zones")
async def get_zones(request: Request, store_id: str):
    """
    Get all zone configurations for a store.
    """
    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key != "auris2026adminkey":
        header_store_id = request.headers.get("X-Store-ID", "").strip()
        password = request.headers.get("X-Password", "")
        
        if not header_store_id or header_store_id != store_id:
            logger.warning("GET zones unauthorized: store_id mismatch or missing")
            raise HTTPException(status_code=401, detail="Unauthorized")
            
        raw_db = _get_raw_db()
        store = await raw_db.stores.find_one({"store_id": store_id})
        if not store:
            logger.warning("Store ID %s not found in stores collection", store_id)
            raise HTTPException(status_code=404, detail="Store not found")
            
        if not password:
            raise HTTPException(status_code=401, detail="Missing X-Password header")
            
        from db import verify_password
        if not verify_password(password, store.get("password_hash", "")):
            logger.warning("GET zones auth failed: invalid password for store %s", store_id)
            raise HTTPException(status_code=401, detail="Invalid credentials")
            
    raw_db = _get_raw_db()
    cursor = raw_db.zone_config.find({"store_id": store_id})
    zones = []
    async for z in cursor:
        if "_id" in z:
            z["_id"] = str(z["_id"])
        zones.append(z)
        
    logger.info("Successfully retrieved zones for store %s", store_id)
    return {"zones": zones}


@router.post("/api/factory/zones")
async def upsert_zone(request: Request, body: ZoneConfigRequest):
    """
    Upsert zone configuration document.
    """
    require_admin_key(request)
    
    raw_db = _get_raw_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    zone_data = body.model_dump()
    zone_data.pop("_id", None)  # Prevent ObjectId collision
    zone_data["updated_at"] = now_iso
    
    await raw_db.zone_config.update_one(
        {"store_id": body.store_id, "zone_id": body.zone_id},
        {
            "$set": zone_data,
            "$setOnInsert": {"created_at": now_iso}
        },
        upsert=True
    )
    
    logger.info("Successfully configured/updated zone %s for store %s", body.zone_id, body.store_id)
    return {"success": True, "zone_id": body.zone_id}


@router.patch("/api/factory/config")
async def patch_factory_config(request: Request, body: PatchConfigRequest):
    """
    Patch factory status and configure trial duration if changed to live.
    """
    require_admin_key(request)
    
    raw_db = _get_raw_db()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    update_fields = {
        "status": body.status,
        "updated_at": now_iso
    }
    
    if body.status == "live":
        trial_start = now_iso
        trial_end = (now + timedelta(days=30)).isoformat()
        update_fields["trial_start"] = trial_start
        update_fields["trial_end"] = trial_end
        
    result = await raw_db.factory_config.update_one(
        {"store_id": body.store_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        logger.warning("Failed to patch status for store %s: factory config not found", body.store_id)
        raise HTTPException(status_code=404, detail="Store config not found")
        
    logger.info("Successfully patched factory config status to '%s' for store %s", body.status, body.store_id)
    return {"success": True, "status": body.status}

