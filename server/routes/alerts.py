"""
WhatsApp alerts via Twilio + alert history.
"""

import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import db, get_store_auth

logger = logging.getLogger("AurisCloud.Alerts")
router = APIRouter()

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")


async def send_whatsapp(to_phone: str, message: str) -> bool:
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, to_phone]):
        logger.warning("Twilio not configured; alert logged only: %s", message[:80])
        return False
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        to = to_phone if to_phone.startswith("whatsapp:") else f"whatsapp:{to_phone}"
        client.messages.create(body=message, from_=TWILIO_FROM, to=to)
        return True
    except Exception as e:
        logger.error("Twilio send failed: %s", e)
        return False


async def log_alert(store_id: str, alert_type: str, message: str, camera_id: str = None, sent: bool = False):
    await db.alerts.insert_one({
        "store_id": store_id,
        "type": alert_type,
        "message": message,
        "camera_id": camera_id,
        "sent": sent,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def dispatch_fire_alert(store_id: str, camera_id: str, timestamp: str):
    store = await db.stores.find_one({"store_id": store_id})
    phone = (store or {}).get("alert_phone")
    msg = f"AURIS FIRE ALERT: Fire detected at {store_id} camera {camera_id} at {timestamp}"
    sent = await send_whatsapp(phone, msg) if phone else False
    await log_alert(store_id, "fire", msg, camera_id, sent)


async def dispatch_overcrowding_alert(store_id: str, count: int, max_cap: int):
    store = await db.stores.find_one({"store_id": store_id})
    phone = (store or {}).get("alert_phone")
    msg = f"AURIS: Overcrowding at {store_id}. {count}/{max_cap} people."
    sent = await send_whatsapp(phone, msg) if phone else False
    await log_alert(store_id, "overcrowding", msg, sent=sent)


async def dispatch_camera_offline_alert(store_id: str, camera_id: str):
    store = await db.stores.find_one({"store_id": store_id})
    phone = (store or {}).get("alert_phone")
    msg = f"AURIS: Camera offline — {store_id}/{camera_id}"
    sent = await send_whatsapp(phone, msg) if phone else False
    await log_alert(store_id, "camera_offline", msg, camera_id, sent)


@router.get("/api/alerts/history")
async def alert_history(request: Request, limit: int = 50):
    store_id = request.headers.get("X-Store-ID", "")
    password = request.headers.get("X-Password", "")
    store = await get_store_auth(store_id, password)
    if not store:
        raise HTTPException(status_code=401, detail="Unauthorized")

    alerts = []
    cursor = db.alerts.find({"store_id": store_id}).sort("created_at", -1).limit(limit)
    async for a in cursor:
        a["_id"] = str(a["_id"])
        alerts.append(a)
    return {"alerts": alerts}


class HeartbeatPayload(BaseModel):
    store_id: str
    camera_id: str
    fps: float = 0
    queue_depth: int = 0


@router.post("/api/edge/heartbeat")
async def edge_heartbeat(body: HeartbeatPayload):
    key = f"{body.store_id}_{body.camera_id}"
    await db.edge_heartbeats.update_one(
        {"camera_key": key},
        {"$set": {
            "camera_key": key,
            "store_id": body.store_id,
            "camera_id": body.camera_id,
            "fps": body.fps,
            "queue_depth": body.queue_depth,
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"status": "ok"}
