"""
WhatsApp alerts via Twilio + alert history, Telegram Daily brief cron, and logs.
"""

import os
import sys
import time
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import db, get_store_auth, ADMIN_KEY

logger = logging.getLogger("AurisCloud.Alerts")
router = APIRouter()

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")


@router.get("/api/whatsapp/logs")
async def get_whatsapp_logs(request: Request, store_id: str = None):
    key = request.headers.get("X-Admin-Key", "")
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    
    query = {}
    if store_id:
        query["store_id"] = store_id
        
    logs = []
    cursor = db._db.whatsapp_log.find(query).sort("sent_at", -1).limit(100)
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        logs.append(doc)
    return {"logs": logs}


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


@router.get("/api/edge/heartbeats")
async def get_edge_heartbeats(request: Request):
    from routes.admin import require_admin_token
    try:
        require_admin_token(request)
    except HTTPException:
        if request.headers.get("X-Admin-Key", "") != (ADMIN_KEY or "PandatThelka"):
            raise HTTPException(status_code=403, detail="Invalid admin key")
            
    devices = []
    # Fetch all devices seen in last 24h
    one_day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    cursor = db.edge_heartbeats.find({"last_seen": {"$gte": one_day_ago}}).sort("last_seen", -1)
    async for doc in cursor:
        doc.pop("_id", None)
        # Calculate active status (offline if not seen in 5 mins)
        last_seen = datetime.fromisoformat(doc["last_seen"])
        if datetime.now(timezone.utc) - last_seen > timedelta(minutes=5):
            doc["status"] = "offline"
        else:
            doc["status"] = "active"
        doc["last_heartbeat"] = doc["last_seen"]
        devices.append(doc)
        
    return {"devices": devices}


# Setup logging for standalone runs
EXPLICIT_ENV_PATH = "/home/retailiq-key/auris-server/.env"
if os.path.exists(EXPLICIT_ENV_PATH):
    logger.info("Loading environment variables from explicit path: %s", EXPLICIT_ENV_PATH)
    load_dotenv(EXPLICIT_ENV_PATH)
else:
    load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017"
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGODB_DB") or "auris"
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")


async def process_factory_brief(db, factory: dict, httpx_client: httpx.AsyncClient, now_utc: datetime):
    """Processes a daily brief for a single live factory config."""
    store_id = factory.get("store_id")
    factory_name = factory.get("factory_name") or store_id
    if not store_id:
        logger.warning("Found factory document missing store_id, skipping.")
        return

    logger.info("Processing daily brief for factory: %s (%s)", factory_name, store_id)

    # A. Calculate "today" in IST (UTC +05:30)
    now_ist = now_utc + timedelta(hours=5, minutes=30)
    today_ist = now_ist.date()

    # IST day bounds converted back to UTC
    start_utc = datetime(today_ist.year, today_ist.month, today_ist.day, 0, 0, 0, tzinfo=timezone.utc) - timedelta(hours=5, minutes=30)
    end_utc = start_utc + timedelta(days=1)

    logger.info("[%s] IST Today: %s | UTC range: %s to %s", store_id, today_ist, start_utc.isoformat(), end_utc.isoformat())

    # B. Duplicate Guard Check
    duplicate_query = {
        "store_id": store_id,
        "message_type": "daily_brief",
        "sent_at": {
            "$gte": start_utc.isoformat(),
            "$lt": end_utc.isoformat()
        }
    }
    existing_brief = await db.whatsapp_log.find_one(duplicate_query)
    if existing_brief:
        logger.info("[%s] Daily brief already sent today (%s). Skipping.", store_id, existing_brief.get("sent_at"))
        return

    # C. Get today's dead time cost and dead hours
    dead_cost = 0.0
    dead_minutes = 0.0

    zone_agg_cursor = db.zone_hour_agg.find({
        "store_id": store_id,
        "hour_bucket": {
            "$gte": start_utc,
            "$lt": end_utc
        }
    })

    async for doc in zone_agg_cursor:
        dead_cost += doc.get("idle_cost_inr") or doc.get("dead_cost_inr") or 0.0
        dead_minutes += doc.get("idle_minutes") or 0.0

    dead_hours = dead_minutes / 60.0

    # D. Get today's bottleneck events
    event_count = await db.zone_hour_agg.count_documents({
        "store_id": store_id,
        "bottleneck_flag": True,
        "hour_bucket": {
            "$gte": start_utc,
            "$lt": end_utc
        }
    })

    # E. Get top active pattern
    top_pattern = await db.pattern_flags.find_one(
        {"store_id": store_id, "active": True},
        sort=[("monthly_cost_inr", -1)]
    )

    if top_pattern:
        zone_label = top_pattern.get("zone_label") or top_pattern.get("zone_id") or "Unknown"
        hour_label = top_pattern.get("hour_label") or "Unknown Hour"
        monthly_cost = int(round(top_pattern.get("monthly_cost_inr") or 0))
        pattern_text = f"{zone_label} — {hour_label} — ₹{monthly_cost:,}/month"
    else:
        pattern_text = "Building... check back Day 7"

    # F. Build message
    today_date_str = today_ist.strftime("%d %b %Y")
    formatted_dead_cost = int(round(dead_cost))

    message = f"""📊 *Auris Daily Brief — {factory_name}*
📅 {today_date_str}

⏱ Dead Time Today: {dead_hours:.1f} hrs | ₹{formatted_dead_cost:,}
🚨 Bottleneck Events: {event_count} today
📉 Top Pattern: {pattern_text}

Full dashboard: https://auris.skymlabs.com"""

    logger.info("[%s] Formatted Message:\n%s", store_id, message)

    # G. Send via Telegram Bot API
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("[%s] Telegram configuration missing from environment. Cannot send.", store_id)
        await db.whatsapp_log.insert_one({
            "store_id": store_id,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "message_type": "daily_brief",
            "to_number": str(TELEGRAM_CHAT_ID) if TELEGRAM_CHAT_ID else "unknown",
            "twilio_sid": "",
            "status": "failed",
            "message_preview": message[:200],
            "ttl": int(time.time()) + 2_592_000
        })
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }

    telegram_message_id = ""
    status = "failed"

    try:
        response = await httpx_client.post(url, json=payload, timeout=10.0)
        resp_data = response.json()
        if response.status_code == 200 and resp_data.get("ok"):
            telegram_message_id = str(resp_data.get("result", {}).get("message_id", ""))
            status = "delivered"
            logger.info("[%s] Telegram brief successfully sent. Message ID: %s", store_id, telegram_message_id)
        else:
            logger.error("[%s] Telegram API failed. Status: %d. Response: %s", store_id, response.status_code, resp_data)
    except Exception as e:
        logger.error("[%s] Network error sending Telegram message: %s", store_id, e)

    # H. Log to whatsapp_log collection
    try:
        await db.whatsapp_log.insert_one({
            "store_id": store_id,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "message_type": "daily_brief",
            "to_number": str(TELEGRAM_CHAT_ID),
            "twilio_sid": telegram_message_id,
            "status": status,
            "message_preview": message[:200],
            "ttl": int(time.time()) + 2_592_000
        })
        logger.info("[%s] Logged status '%s' to whatsapp_log.", store_id, status)
    except Exception as e:
        logger.error("[%s] Failed to write to whatsapp_log collection: %s", store_id, e)


async def main():
    """Main entrypoint for standalone run."""
    logger.info("Starting Auris Telegram Daily Brief Run")
    client = None
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
        now_utc = datetime.now(timezone.utc)

        factories_cursor = db.factory_config.find({"status": "live"})
        factories = []
        async for f in factories_cursor:
            factories.append(f)

        logger.info("Found %d active (live) factories.", len(factories))

        if not factories:
            logger.info("No active factories to process. Exiting.")
            return

        async with httpx.AsyncClient() as httpx_client:
            for factory in factories:
                store_id = factory.get("store_id")
                try:
                    await process_factory_brief(db, factory, httpx_client, now_utc)
                except Exception as fact_err:
                    logger.error("Error processing daily brief for store %s: %s", store_id, fact_err, exc_info=True)
                    continue
    except Exception as err:
        logger.critical("Critical failure in Telegram Daily Brief aggregator: %s", err, exc_info=True)
    finally:
        if client:
            client.close()
            logger.info("Database connection closed.")
    logger.info("Finished Auris Telegram Daily Brief Run")


if __name__ == "__main__":
    asyncio.run(main())
