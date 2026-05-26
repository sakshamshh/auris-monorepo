import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import logging

from db import get_store_auth, db

router = APIRouter()

logger = logging.getLogger("AurisCloud.auth")

# In-memory dictionary to store failed login attempts: {ip: [timestamps]}
login_attempts = defaultdict(list)

class LoginRequest(BaseModel):
    store_id: str
    password: str


class ResetRequest(BaseModel):
    store_id: str


@router.post("/api/login")
async def login(request: Request, body: LoginRequest):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    
    # Clean up old entries (older than 5 minutes / 300 seconds)
    for k, v in list(login_attempts.items()):
        valid_v = [t for t in v if now - t < 300]
        if valid_v:
            login_attempts[k] = valid_v
        else:
            login_attempts.pop(k, None)
            
    # Check rate limit
    if len(login_attempts[ip]) >= 5:
        raise HTTPException(
            status_code=429, 
            detail="Too Many Requests: Max 5 failed attempts per 5 minutes. Please try again later."
        )
        
    store = await get_store_auth(body.store_id.strip(), body.password)
    if not store:
        # Record failed attempt
        login_attempts[ip].append(now)
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    return {
        "store_id": store["store_id"],
        "store_name": store.get("store_name", store["store_id"]),
        "plan": store.get("plan", "retail"),
        "created_at": store.get("created_at"),
    }


@router.post("/api/auth/reset-request")
async def reset_request(body: ResetRequest):
    store = await db.stores.find_one({"store_id": body.store_id.strip()})
    if not store:
        return {"success": False, "message": "Store not found"}
    logger.info(f"PASSWORD RESET REQUESTED: store_id={body.store_id.strip()}")
    return {"success": True, "message": "Reset requested"}
