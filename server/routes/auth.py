import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import logging

from db import get_store_auth, db
from services.notifications import send_access_request_email, send_access_request_whatsapp

router = APIRouter()

logger = logging.getLogger("AurisCloud.auth")

# In-memory dictionaries to store requests: {ip: [timestamps]}
login_attempts = defaultdict(list)
support_requests = defaultdict(list)

class LoginRequest(BaseModel):
    store_id: str
    password: str

class ResetRequest(BaseModel):
    store_id: str

class RequestAccessRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., max_length=2000)
    store_id: str = Field("", max_length=50) # Optional store_id for context


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
async def reset_request(request: Request, body: ResetRequest):
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Rate limit support requests
    for k, v in list(support_requests.items()):
        valid_v = [t for t in v if now - t < 3600] # 1 hour
        if valid_v:
            support_requests[k] = valid_v
        else:
            support_requests.pop(k, None)
            
    if len(support_requests[ip]) >= 3:
        raise HTTPException(
            status_code=429, 
            detail="Too Many Requests: Max 3 support requests per hour."
        )

    store = await db.stores.find_one({"store_id": body.store_id.strip()})
    if not store:
        return {"success": False, "message": "Store not found"}
        
    logger.info(f"PASSWORD RESET REQUESTED: store_id={body.store_id.strip()}")
    support_requests[ip].append(now)
    
    # Fire off notifications asynchronously (without blocking response)
    message = "User requested a password reset for this store."
    send_access_request_email("Reset Request", message, body.store_id.strip())
    send_access_request_whatsapp("Reset Request", message, body.store_id.strip())
    
    return {"success": True, "message": "Reset requested"}

@router.post("/api/auth/request-access")
async def request_access(request: Request, body: RequestAccessRequest):
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Rate limit support requests
    for k, v in list(support_requests.items()):
        valid_v = [t for t in v if now - t < 3600] # 1 hour
        if valid_v:
            support_requests[k] = valid_v
        else:
            support_requests.pop(k, None)
            
    if len(support_requests[ip]) >= 3:
        raise HTTPException(
            status_code=429, 
            detail="Too Many Requests: Max 3 support requests per hour."
        )

    logger.info(f"ACCESS REQUESTED: name={body.name}, store_id={body.store_id}")
    support_requests[ip].append(now)
    
    # Send notifications
    email_sent = send_access_request_email(body.name, body.message, body.store_id)
    wa_sent = send_access_request_whatsapp(body.name, body.message, body.store_id)
    
    if not email_sent and not wa_sent:
        logger.warning("Both email and whatsapp notifications failed.")
    
    return {"success": True, "message": "Access requested"}
