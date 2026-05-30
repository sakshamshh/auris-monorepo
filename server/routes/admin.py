import os
import hmac
import hashlib
import base64
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, HTMLResponse
from pydantic import BaseModel

from db import db, hash_password, generate_api_key, ADMIN_KEY, get_store_by_api_key

import logging
router = APIRouter()
logger = logging.getLogger("AurisCloud.Admin")

JWT_SECRET = os.getenv("JWT_SECRET") or "default_fallback_jwt_secret_value_for_auris_production"

# In-memory dictionary for admin login attempts: {ip: [timestamps]}
admin_attempts = defaultdict(list)

# --- PURE PYTHON JWT UTILITIES ---
def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)

def encode_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64url_encode(json.dumps(header).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload).encode('utf-8'))
    
    signature_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(secret.encode('utf-8'), signature_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

def decode_jwt(token: str, secret: str) -> Optional[dict]:
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, signature_b64 = parts
        
        signature_input = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_signature = hmac.new(secret.encode('utf-8'), signature_input, hashlib.sha256).digest()
        expected_signature_b64 = base64url_encode(expected_signature)
        
        if not hmac.compare_digest(signature_b64.encode('utf-8'), expected_signature_b64.encode('utf-8')):
            return None
            
        payload = json.loads(base64url_decode(payload_b64).decode('utf-8'))
        if "exp" in payload and time.time() > payload["exp"]:
            return None
            
        return payload
    except Exception:
        return None

# --- REQUEST PAYLOADS ---
class AdminSessionRequest(BaseModel):
    store_id: str
    password: str

class VerifyAdminRequest(BaseModel):
    admin_key: str

# --- AUTHENTICATION ROUTE & VERIFIERS ---
@router.post("/admin/session")
async def admin_session(request: Request, body: AdminSessionRequest):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    
    # Inline cleanup of attempts older than 15 minutes (900 seconds)
    for k, v in list(admin_attempts.items()):
        valid_v = [t for t in v if now - t < 900]
        if valid_v:
            admin_attempts[k] = valid_v
        else:
            admin_attempts.pop(k, None)
            
    # Check rate limit
    if len(admin_attempts[ip]) >= 3:
        raise HTTPException(
            status_code=429, 
            detail="Too Many Requests: Max 3 failed admin login attempts per 15 minutes."
        )
        
    expected_key = ADMIN_KEY
    if body.store_id.strip() != "admin" or body.password != expected_key:
        admin_attempts[ip].append(now)
        # Log failed admin action to audit logs
        await db._db.audit_log.insert_one({
            "action": "admin_login_failed",
            "store_id": "admin",
            "timestamp": datetime.now(timezone.utc),
            "ip": ip
        })
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
        
    # Valid, sign short-lived JWT token (8 hours)
    payload = {
        "store_id": "admin",
        "role": "admin",
        "exp": time.time() + 8 * 3600
    }
    token = encode_jwt(payload, JWT_SECRET)
    
    # Log successful admin action to audit logs
    await db._db.audit_log.insert_one({
        "action": "admin_login_success",
        "store_id": "admin",
        "timestamp": datetime.now(timezone.utc),
        "ip": ip
    })
    
    return {"token": token}

@router.post("/admin/verify")
async def verify_admin(body: VerifyAdminRequest):
    # Keep verify_admin for legacy support (if any test cases require it)
    expected_key = ADMIN_KEY
    if body.admin_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")
    
    payload = {
        "store_id": "admin",
        "role": "admin",
        "exp": time.time() + 8 * 3600
    }
    token = encode_jwt(payload, JWT_SECRET)
    return {"token": token}

def require_admin_token(request: Request):
    # 1. Prefer Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        
    if token:
        payload = decode_jwt(token, JWT_SECRET)
        if payload and payload.get("role") == "admin":
            return
            
    # 2. Fallback to X-Admin-Key for deploy.ps1 test suite only
    key = request.headers.get("X-Admin-Key", "")
    expected_key = ADMIN_KEY
    if expected_key and key == expected_key:
        return
        
    raise HTTPException(status_code=403, detail="Invalid admin session token or key")

def require_admin(request: Request):
    require_admin_token(request)


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

async def _verify_edge_download_auth(request: Request):
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key missing")
    store = await get_store_by_api_key(api_key)
    if not store:
        raise HTTPException(status_code=401, detail="Invalid API Key")

@router.get("/edge/download/edge_worker", response_class=PlainTextResponse)
async def download_edge_worker(request: Request):
    await _verify_edge_download_auth(request)
    path = "/home/retailiq-key/auris-server/edge/src/edge_worker.py"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

@router.get("/edge/download/provision", response_class=PlainTextResponse)
async def download_provision(request: Request):
    await _verify_edge_download_auth(request)
    path = "/home/retailiq-key/auris-server/edge/src/provision.py"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

@router.get("/edge/download/requirements", response_class=PlainTextResponse)
async def download_requirements(request: Request):
    await _verify_edge_download_auth(request)
    path1 = "/home/retailiq-key/auris-server/edge/src/requirements.txt"
    path2 = "/home/retailiq-key/auris-server/edge/requirements.txt"
    
    path = path1 if os.path.exists(path1) else path2
    if not os.path.exists(path):
        # Fallback to absolute path from prompt implied location
        path = "/home/retailiq-key/auris-server/edge/src/requirements.txt"

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

class UpdatePersonaRequest(BaseModel):
    instructions: str


class UpdatePasswordRequest(BaseModel):
    password: str


class CreateStoreRequest(BaseModel):
    store_id: str
    store_name: str
    password: Optional[str] = "auris123"
    plan: Optional[str] = "FACTORY"
    total_headcount: Optional[int] = 10
    shift_start: Optional[str] = "09:00"
    shift_end: Optional[str] = "18:00"
    wage_per_day: Optional[int] = 500


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
            "onboarded": s.get("onboarded", False),
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
        "max_capacity": body.total_headcount,
        "plan": body.plan,
        "total_headcount": body.total_headcount,
        "shift_start": body.shift_start,
        "shift_end": body.shift_end,
        "wage_per_day": body.wage_per_day,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stores.insert_one(doc)
    
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "create_store",
        "store_id": sid,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
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
    
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "delete_store",
        "store_id": store_id,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
    return {"status": "deleted", "store_id": store_id}


@router.get("/admin/stores/{store_id}")
async def get_store_details(request: Request, store_id: str):
    require_admin(request)
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
        
    prefill = None
    try:
        config = await db._db.factory_config.find_one({"store_id": store_id})
        if config and "prefill" in config:
            prefill = dict(config["prefill"])
            from utils.crypto import decrypt_string
            if "dvr_password" in prefill:
                prefill["dvr_password"] = decrypt_string(prefill["dvr_password"])
            if "wifi_password" in prefill:
                prefill["wifi_password"] = decrypt_string(prefill["wifi_password"])
    except Exception:
        pass

    return {
        "store_id": store["store_id"],
        "store_name": store.get("store_name", store["store_id"]),
        "api_key": store.get("api_key", ""),
        "spatial_status": store.get("spatial_status", "pending"),
        "created_at": store.get("created_at"),
        "ai_instructions": store.get("ai_instructions", ""),
        "invite_code": store.get("invite_code"),
        "invite_expiry": store.get("invite_expiry"),
        "onboarded": store.get("onboarded", False),
        "prefill": prefill
    }


@router.delete("/admin/stores/{store_id}")
async def delete_store(request: Request, store_id: str):
    require_admin(request)
    # Delete from stores collection
    res_stores = await db.stores.delete_one({"store_id": store_id})
    if res_stores.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
        
    # Delete from factory_config collection
    await db._db.factory_config.delete_one({"store_id": store_id})
    
    # Delete from zone_config collection
    await db._db.zone_config.delete_one({"store_id": store_id})
    
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "delete_store",
        "store_id": store_id,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
    return {"success": True}


@router.patch("/admin/stores/{store_id}")
async def update_store_password(request: Request, store_id: str, body: UpdatePasswordRequest):
    require_admin(request)
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"password_hash": hash_password(body.password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
        
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "reset_password",
        "store_id": store_id,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
    return {"status": "password updated", "store_id": store_id}


@router.post("/admin/stores/{store_id}")
async def reset_store_password(request: Request, store_id: str, body: UpdatePasswordRequest):
    require_admin(request)
    result = await db.stores.update_one(
        {"store_id": store_id},
        {"$set": {"password_hash": hash_password(body.password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
        
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "reset_password",
        "store_id": store_id,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
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
        
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "update_persona",
        "store_id": store_id,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
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
        
    # Audit log
    await db._db.audit_log.insert_one({
        "action": "update_config",
        "store_id": store_id,
        "timestamp": datetime.now(timezone.utc),
        "ip": request.client.host if request.client else "unknown"
    })
    
    return {"status": "updated", "store_id": store_id}


class GenerateInviteRequest(BaseModel):
    store_id: str


class CompleteSignupRequest(BaseModel):
    contact_name: str
    phone: str
    email: Optional[str] = ""
    worker_count: str
    shift_start: str
    shift_end: str
    working_days: List[str]
    camera_brand: str
    camera_count: int
    dvr_password: str
    wifi_ssid: str
    wifi_password: str
    client_password: str


@router.post("/admin/invite")
async def generate_invite(request: Request, body: GenerateInviteRequest):
    require_admin(request)
    store = await db.stores.find_one({"store_id": body.store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    import secrets
    invite_code = f"invite_{secrets.token_urlsafe(16)}"
    expiry = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.stores.update_one(
        {"store_id": body.store_id},
        {"$set": {"invite_code": invite_code, "invite_expiry": expiry.isoformat()}}
    )
    
    signup_url = f"https://auris.skymlabs.com/signup/{invite_code}"
    return {"invite_code": invite_code, "signup_url": signup_url}


@router.get("/signup/{invite_code}")
async def validate_invite(invite_code: str):
    store = await db.stores.find_one({"invite_code": invite_code})
    if not store:
        logger.info(f"Invite code lookup: {invite_code}, found: None, expires: None")
        return {"valid": False}
        
    expiry_str = store.get("invite_expiry")
    logger.info(f"Invite code lookup: {invite_code}, found: {store.get('store_id')}, expires: {expiry_str}")
    if not expiry_str:
        # if no expiry set, treat as valid (fallback)
        return {
            "store_id": store["store_id"],
            "store_name": store.get("store_name", store["store_id"]),
            "valid": True
        }
        
    try:
        expiry = datetime.fromisoformat(expiry_str)
        # Ensure comparison is timezone-aware
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expiry:
            return {"valid": False}
    except Exception:
        # Fallback to valid if parsing fails
        return {
            "store_id": store["store_id"],
            "store_name": store.get("store_name", store["store_id"]),
            "valid": True
        }
        
    return {
        "store_id": store["store_id"],
        "store_name": store.get("store_name", store["store_id"]),
        "valid": True
    }


@router.post("/signup/{invite_code}/complete")
async def complete_signup(invite_code: str, body: CompleteSignupRequest):
    store = await db.stores.find_one({"invite_code": invite_code})
    if not store:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
        
    expiry_str = store.get("invite_expiry")
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expiry:
                raise HTTPException(status_code=400, detail="Invite link expired")
        except HTTPException:
            raise
        except Exception:
            pass # fallback to valid
            
    store_id = store["store_id"]
    
    from utils.crypto import encrypt_string
    enc_dvr_pwd = encrypt_string(body.dvr_password)
    enc_wifi_pwd = encrypt_string(body.wifi_password)
    
    password_hash = hash_password(body.client_password)
    
    await db.stores.update_one(
        {"store_id": store_id},
        {
            "$set": {
                "contact_name": body.contact_name,
                "phone": body.phone,
                "email": body.email,
                "password_hash": password_hash,
                "onboarded": True
            },
            "$unset": {
                "invite_code": "",
                "invite_expiry": ""
            }
        }
    )
    
    prefill_data = {
        "contact_name": body.contact_name,
        "phone": body.phone,
        "email": body.email,
        "worker_count": body.worker_count,
        "shift_start": body.shift_start,
        "shift_end": body.shift_end,
        "working_days": body.working_days,
        "camera_brand": body.camera_brand,
        "camera_count": body.camera_count,
        "dvr_password": enc_dvr_pwd,
        "wifi_ssid": body.wifi_ssid,
        "wifi_password": enc_wifi_pwd
    }
    
    await db._db.factory_config.update_one(
        {"store_id": store_id},
        {
            "$set": {
                "prefill": prefill_data,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    logger.info(f"Saving prefill for store {store_id}: dvr_password={'***' if body.dvr_password else 'None'}")
    
    return {"success": True, "message": "Signup completed successfully"}


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AURIS Live Visualizer</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-main: #090d16;
            --bg-card: rgba(17, 24, 39, 0.7);
            --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-green: #10b981;
            --accent-green-glow: rgba(16, 185, 129, 0.2);
            --accent-red: #ef4444;
            --accent-blue: #3b82f6;
            --sidebar-width: 320px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background: var(--bg-main);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            overflow-x: hidden;
            background-image: 
                radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.05) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.05) 0px, transparent 50%);
        }

        .sidebar {
            width: var(--sidebar-width);
            background: rgba(10, 15, 30, 0.8);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-right: 1px solid var(--border-color);
            padding: 2rem;
            display: flex;
            flex-direction: column;
            gap: 2rem;
            height: 100vh;
            position: fixed;
            left: 0;
            top: 0;
            z-index: 10;
        }

        .logo-container {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
        }

        .logo-dot {
            width: 12px;
            height: 12px;
            background: var(--accent-green);
            border-radius: 50%;
            box-shadow: 0 0 12px var(--accent-green);
            animation: pulse 2s infinite;
        }

        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.25rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            background: linear-gradient(to right, #ffffff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        label {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-secondary);
        }

        .input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        input, select {
            width: 100%;
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 0.75rem 1rem;
            color: var(--text-primary);
            font-family: inherit;
            font-size: 0.875rem;
            outline: none;
            transition: all 0.3s ease;
        }

        input:focus, select:focus {
            border-color: var(--accent-green);
            box-shadow: 0 0 8px var(--accent-green-glow);
        }

        select {
            appearance: none;
            cursor: pointer;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 1rem center;
            background-size: 1rem;
            padding-right: 2.5rem;
        }

        button.btn-primary {
            background: var(--accent-green);
            color: #050505;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            padding: 0.75rem 1rem;
            cursor: pointer;
            font-size: 0.875rem;
            transition: all 0.2s ease;
        }

        button.btn-primary:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--accent-green-glow);
        }

        .key-toggle {
            position: absolute;
            right: 0.75rem;
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 0.75rem;
            padding: 0.25rem;
        }

        .main-content {
            margin-left: var(--sidebar-width);
            flex: 1;
            padding: 2.5rem;
            display: flex;
            flex-direction: column;
            gap: 2rem;
            min-height: 100vh;
        }

        .header-status {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1rem 1.5rem;
            backdrop-filter: blur(8px);
        }

        .status-pill {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(16, 185, 129, 0.1);
            color: var(--accent-green);
            padding: 0.35rem 0.75rem;
            border-radius: 100px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status-pill.offline {
            background: rgba(239, 68, 68, 0.1);
            color: var(--accent-red);
            border-color: rgba(239, 68, 68, 0.2);
        }

        .status-pill.offline .logo-dot {
            background: var(--accent-red);
            box-shadow: 0 0 12px var(--accent-red);
        }

        .viewport-wrapper {
            flex: 1;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7);
            min-height: 480px;
        }

        .stream-img {
            max-width: 100%;
            max-height: 70vh;
            border-radius: 8px;
            object-fit: contain;
            display: none;
        }

        .viewport-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            color: var(--text-secondary);
            text-align: center;
            padding: 2rem;
        }

        .viewport-placeholder svg {
            width: 48px;
            height: 48px;
            stroke: var(--text-secondary);
            animation: float 3s ease-in-out infinite;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1.5rem;
        }

        .metric-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            backdrop-filter: blur(8px);
            transition: transform 0.3s ease, border-color 0.3s ease;
        }

        .metric-card:hover {
            transform: translateY(-2px);
            border-color: rgba(255, 255, 255, 0.15);
        }

        .metric-title {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .metric-value {
            font-family: 'Outfit', sans-serif;
            font-size: 2.25rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .metric-value.green {
            color: var(--accent-green);
            text-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
        }

        .metric-sub {
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(4, 6, 10, 0.9);
            backdrop-filter: blur(20px);
            z-index: 100;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .modal-overlay.active {
            opacity: 1;
            pointer-events: all;
        }

        .modal-card {
            background: rgba(17, 24, 39, 0.95);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            width: 100%;
            max-width: 400px;
            padding: 2.5rem;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            transform: scale(0.95);
            transition: transform 0.3s ease;
        }

        .modal-overlay.active .modal-card {
            transform: scale(1);
        }

        .modal-title {
            font-family: 'Outfit', sans-serif;
            font-size: 1.5rem;
            font-weight: 700;
            text-align: center;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.6; }
        }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
        }

        .loading-spinner {
            border: 3px solid rgba(255, 255, 255, 0.05);
            border-top: 3px solid var(--accent-green);
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
            display: none;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @media(max-width: 768px) {
            body {
                flex-direction: column;
            }
            .sidebar {
                width: 100%;
                height: auto;
                position: relative;
                border-right: none;
                border-bottom: 1px solid var(--border-color);
                padding: 1.5rem;
            }
            .main-content {
                margin-left: 0;
                padding: 1.5rem;
            }
        }
    </style>
</head>
<body>

    <div id="auth-modal" class="modal-overlay">
        <div class="modal-card">
            <h2 class="modal-title">Authorize Live Access</h2>
            <p style="color: var(--text-secondary); text-align: center; font-size: 0.875rem; margin-top: -0.5rem;">
                Please enter the ADMIN_KEY to visualize detection streams.
            </p>
            <div class="control-group">
                <label for="modal-key">Admin Passkey</label>
                <input type="password" id="modal-key" placeholder="Enter ADMIN_KEY">
            </div>
            <button id="auth-submit-btn" class="btn-primary">Authenticate</button>
        </div>
    </div>

    <div class="sidebar">
        <div class="logo-container">
            <div class="logo-dot"></div>
            <h1>AURIS Visualizer</h1>
        </div>

        <div class="control-group">
            <label for="admin-key">Admin Passkey</label>
            <div class="input-wrapper">
                <input type="password" id="admin-key" placeholder="Saved in browser">
                <button class="key-toggle" id="key-toggle-btn">SHOW</button>
            </div>
        </div>

        <div class="control-group">
            <label for="store-select">Select Store</label>
            <select id="store-select" disabled>
                <option value="">-- Select Store --</option>
            </select>
        </div>

        <div class="control-group">
            <label for="camera-select">Select Camera</label>
            <select id="camera-select" disabled>
                <option value="">-- Select Camera --</option>
            </select>
        </div>

        <div style="flex-grow: 1;"></div>

        <div style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.4; border-top: 1px solid var(--border-color); padding-top: 1rem;">
            Designed for live scenario training analysis. Memory-bound zero DB writes, zero overhead.
        </div>
    </div>

    <div class="main-content">
        <div class="header-status">
            <div>
                <h2 style="font-family: 'Outfit'; font-size: 1.25rem;">Live Feed Window</h2>
                <p id="active-target-text" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">No active camera stream selected.</p>
            </div>
            <div id="stream-status" class="status-pill offline">
                <div class="logo-dot"></div>
                <span id="status-text">OFFLINE</span>
            </div>
        </div>

        <div class="viewport-wrapper" id="viewport">
            <div class="viewport-placeholder" id="placeholder-box">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin='round' stroke-width='1.5' d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' />
                </svg>
                <h3 style="color: var(--text-primary);">Awaiting Live Stream Connection</h3>
                <p style="font-size: 0.85rem; max-width: 320px;">Select a store and camera in the controls panel to mount the live real-time MJPEG feed.</p>
            </div>
            <div class="loading-spinner" id="spinner"></div>
            <img id="stream-img" class="stream-img" alt="Live stream feed">
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <span class="metric-title">Occupancy (People)</span>
                <span class="metric-value green" id="metric-people">0</span>
                <span class="metric-sub" id="metric-people-sub">No frames evaluated yet</span>
            </div>
            <div class="metric-card">
                <span class="metric-title">Latest frame captured</span>
                <span class="metric-value" id="metric-frame-time" style="font-size: 1.25rem; font-weight: 500; height: 2.25rem; display: flex; align-items: center;">N/A</span>
                <span class="metric-sub" id="metric-frame-sub">Active capture synchronization</span>
            </div>
        </div>
    </div>

    <script>
        const authModal = document.getElementById('auth-modal');
        const modalKeyInput = document.getElementById('modal-key');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const adminKeyInput = document.getElementById('admin-key');
        const keyToggleBtn = document.getElementById('key-toggle-btn');
        
        const storeSelect = document.getElementById('store-select');
        const cameraSelect = document.getElementById('camera-select');
        
        const activeTargetText = document.getElementById('active-target-text');
        const streamStatus = document.getElementById('stream-status');
        const statusText = document.getElementById('status-text');
        
        const placeholderBox = document.getElementById('placeholder-box');
        const spinner = document.getElementById('spinner');
        const streamImg = document.getElementById('stream-img');
        
        const metricPeople = document.getElementById('metric-people');
        const metricPeopleSub = document.getElementById('metric-people-sub');
        const metricFrameTime = document.getElementById('metric-frame-time');

        let cameraData = {};
        let pollingInterval = null;

        let adminKey = getUrlParameter('key') || localStorage.getItem('auris_admin_key');

        if (adminKey) {
            adminKeyInput.value = adminKey;
            modalKeyInput.value = adminKey;
            initializeVisualizer();
        } else {
            showAuthModal();
        }

        function showAuthModal() {
            authModal.classList.add('active');
        }

        function hideAuthModal() {
            authModal.classList.remove('active');
        }

        authSubmitBtn.addEventListener('click', () => {
            const enteredKey = modalKeyInput.value.trim();
            if (enteredKey) {
                adminKey = enteredKey;
                adminKeyInput.value = adminKey;
                localStorage.setItem('auris_admin_key', adminKey);
                hideAuthModal();
                initializeVisualizer();
            }
        });

        modalKeyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                authSubmitBtn.click();
            }
        });

        adminKeyInput.addEventListener('change', () => {
            adminKey = adminKeyInput.value.trim();
            if (adminKey) {
                localStorage.setItem('auris_admin_key', adminKey);
                initializeVisualizer();
            }
        });

        keyToggleBtn.addEventListener('click', () => {
            if (adminKeyInput.type === 'password') {
                adminKeyInput.type = 'text';
                modalKeyInput.type = 'text';
                keyToggleBtn.textContent = 'HIDE';
            } else {
                adminKeyInput.type = 'password';
                modalKeyInput.type = 'password';
                keyToggleBtn.textContent = 'SHOW';
            }
        });

        async function initializeVisualizer() {
            if (!adminKey) return;
            
            try {
                const response = await fetch(`/api/live/cameras?key=${encodeURIComponent(adminKey)}`);
                if (response.status === 403) {
                    localStorage.removeItem('auris_admin_key');
                    alert('Invalid ADMIN_KEY. Please try again.');
                    showAuthModal();
                    return;
                }
                
                if (!response.ok) {
                    throw new Error('Failed to fetch configured cameras.');
                }
                
                const data = await response.json();
                cameraData = data.stores || {};
                
                populateStoreDropdown();
            } catch (err) {
                console.error(err);
                alert('Connection error: ' + err.message);
            }
        }

        function populateStoreDropdown() {
            storeSelect.innerHTML = '<option value="">-- Select Store --</option>';
            cameraSelect.innerHTML = '<option value="">-- Select Camera --</option>';
            cameraSelect.disabled = true;
            
            const storeIds = Object.keys(cameraData);
            if (storeIds.length === 0) {
                storeSelect.innerHTML = '<option value="">No Active Stores</option>';
                storeSelect.disabled = true;
                return;
            }
            
            storeIds.forEach(sid => {
                const opt = document.createElement('option');
                opt.value = sid;
                opt.textContent = cameraData[sid].store_name || sid;
                storeSelect.appendChild(opt);
            });
            
            storeSelect.disabled = false;
        }

        storeSelect.addEventListener('change', () => {
            const sid = storeSelect.value;
            cameraSelect.innerHTML = '<option value="">-- Select Camera --</option>';
            cameraSelect.disabled = true;
            
            stopLiveStream();
            
            if (!sid || !cameraData[sid]) return;
            
            const cameras = cameraData[sid].cameras || [];
            if (cameras.length === 0) {
                cameraSelect.innerHTML = '<option value="">No Cameras Available</option>';
                return;
            }
            
            cameras.forEach(cam => {
                const opt = document.createElement('option');
                opt.value = cam.camera_id;
                opt.textContent = cam.name || cam.camera_id;
                cameraSelect.appendChild(opt);
            });
            
            cameraSelect.disabled = false;
        });

        cameraSelect.addEventListener('change', () => {
            const sid = storeSelect.value;
            const cid = cameraSelect.value;
            
            if (sid && cid) {
                startLiveStream(sid, cid);
            } else {
                stopLiveStream();
            }
        });

        function startLiveStream(storeId, cameraId) {
            stopLiveStream();
            
            activeTargetText.textContent = `Streaming from Store: ${storeId} | Camera: ${cameraId}`;
            
            spinner.style.display = 'block';
            placeholderBox.style.display = 'none';
            streamImg.style.display = 'none';
            
            const streamUrl = `/api/live/stream/${encodeURIComponent(storeId)}/${encodeURIComponent(cameraId)}?key=${encodeURIComponent(adminKey)}`;
            
            streamImg.onload = () => {
                spinner.style.display = 'none';
                streamImg.style.display = 'block';
                
                streamStatus.className = 'status-pill';
                statusText.textContent = 'LIVE';
            };
            
            streamImg.onerror = () => {
                spinner.style.display = 'none';
                placeholderBox.style.display = 'flex';
                streamImg.style.display = 'none';
                
                streamStatus.className = 'status-pill offline';
                statusText.textContent = 'NO SIGNAL';
            };
            
            streamImg.src = streamUrl;
            
            pollMetadata(storeId, cameraId);
            pollingInterval = setInterval(() => pollMetadata(storeId, cameraId), 1000);
        }

        function stopLiveStream() {
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            streamImg.src = '';
            streamImg.style.display = 'none';
            placeholderBox.style.display = 'flex';
            spinner.style.display = 'none';
            
            streamStatus.className = 'status-pill offline';
            statusText.textContent = 'OFFLINE';
            
            activeTargetText.textContent = 'No active camera stream selected.';
            metricPeople.textContent = '0';
            metricPeopleSub.textContent = 'No active stream running';
            metricFrameTime.textContent = 'N/A';
        }

        async function pollMetadata(storeId, cameraId) {
            if (!adminKey) return;
            
            try {
                const response = await fetch(`/api/live/snapshot/${encodeURIComponent(storeId)}/${encodeURIComponent(cameraId)}?key=${encodeURIComponent(adminKey)}`);
                if (!response.ok) return;
                
                const meta = await response.json();
                if (meta.status === 'waiting') {
                    metricPeople.textContent = '0';
                    metricPeopleSub.textContent = 'Frame signal waiting...';
                    metricFrameTime.textContent = 'No Signal';
                    return;
                }
                
                const count = meta.people_now !== undefined ? meta.people_now : 0;
                metricPeople.textContent = count;
                metricPeopleSub.textContent = `Visualizing ${count} dynamic target detections`;
                
                if (meta.timestamp) {
                    const d = new Date(meta.timestamp);
                    metricFrameTime.textContent = d.toLocaleTimeString();
                    
                    const secondsDiff = Math.round((new Date() - d) / 1000);
                    if (secondsDiff > 5) {
                        metricFrameTime.style.color = '#ef4444';
                        document.getElementById('metric-frame-sub').textContent = `Stale signal: ${secondsDiff}s delay`;
                    } else {
                        metricFrameTime.style.color = '';
                        document.getElementById('metric-frame-sub').textContent = 'Signal active and synchronized';
                    }
                }
            } catch (e) {
                console.error('Error polling metadata:', e);
            }
        }

        function getUrlParameter(name) {
            name = name.replace(/[\\[]/, '\\\\[').replace(/[\\]]/, '\\\\]');
            const regex = new RegExp('[\\\\?&]' + name + '=([^&#]*)');
            const results = regex.exec(location.search);
            return results === null ? '' : decodeURIComponent(results[1].replace(/\\+/g, ' '));
        }
    </script>
</body>
</html>
"""


@router.get("/stream-viewer", response_class=HTMLResponse)
async def get_stream_viewer(request: Request, key: Optional[str] = None):
    """Serves the live video visualizer and analytics viewer dashboard."""
    return HTMLResponse(content=HTML_TEMPLATE)


@router.get("/edge/download/edge_worker", response_class=PlainTextResponse)
async def download_edge_worker():
    """Serves the contents of the edge_worker.py file."""
    base_dir = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(os.path.join(base_dir, "..", "..", "edge", "src", "edge_worker.py")),
        os.path.abspath(os.path.join(base_dir, "..", "edge", "src", "edge_worker.py")),
        "/home/retailiq-key/auris-server/edge/src/edge_worker.py",
    ]
    for path in candidates:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return PlainTextResponse(content=f.read(), media_type="text/plain")
    raise HTTPException(status_code=404, detail="edge_worker.py not found on server")


@router.get("/edge/download/provision", response_class=PlainTextResponse)
async def download_provision():
    """Serves the contents of the provision.py file."""
    base_dir = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(os.path.join(base_dir, "..", "..", "edge", "provision.py")),
        os.path.abspath(os.path.join(base_dir, "..", "edge", "provision.py")),
        "/home/retailiq-key/auris-server/edge/provision.py",
    ]
    for path in candidates:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return PlainTextResponse(content=f.read(), media_type="text/plain")
    raise HTTPException(status_code=404, detail="provision.py not found on server")


@router.get("/edge/download/requirements", response_class=PlainTextResponse)
async def download_requirements():
    """Serves the contents of the requirements.txt file."""
    base_dir = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(os.path.join(base_dir, "..", "..", "edge", "requirements.txt")),
        os.path.abspath(os.path.join(base_dir, "..", "edge", "requirements.txt")),
        "/home/retailiq-key/auris-server/edge/requirements.txt",
    ]
    for path in candidates:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return PlainTextResponse(content=f.read(), media_type="text/plain")
    raise HTTPException(status_code=404, detail="requirements.txt not found on server")




