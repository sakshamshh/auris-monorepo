"""
Standalone script to send daily Telegram briefs of factory operational metrics.
Callable as a standalone script: python3 routes/alerts.py
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

router = APIRouter()


@router.get("/api/whatsapp/logs")
async def get_whatsapp_logs(request: Request, store_id: str = None):
    from db import db, ADMIN_KEY
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

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("AurisAlerts.telegram_brief")

# 1. Load .env with explicit path as per rules
EXPLICIT_ENV_PATH = "/home/retailiq-key/auris-server/.env"
if os.path.exists(EXPLICIT_ENV_PATH):
    logger.info("Loading environment variables from explicit path: %s", EXPLICIT_ENV_PATH)
    load_dotenv(EXPLICIT_ENV_PATH)
else:
    logger.info("Explicit path %s not found. Falling back to default .env loading.", EXPLICIT_ENV_PATH)
    load_dotenv()

# 2. Get settings from environment
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
    # Check if a daily brief has been sent today (IST) for this store_id
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
    # Query zone_hour_agg for today's date, sum idle_cost_inr and idle_minutes
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
    # Query zone_hour_agg for today where bottleneck_flag == True, count events
    event_count = await db.zone_hour_agg.count_documents({
        "store_id": store_id,
        "bottleneck_flag": True,
        "hour_bucket": {
            "$gte": start_utc,
            "$lt": end_utc
        }
    })

    # E. Get top active pattern
    # Query pattern_flags where store_id matches, active == True
    # Sort by monthly_cost_inr descending, take first one
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
        # Log failure in database as per guidelines
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
        # Establish MongoDB connection
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]

        now_utc = datetime.now(timezone.utc)

        # Get all live factories (where status == "live")
        factories_cursor = db.factory_config.find({"status": "live"})
        factories = []
        async for f in factories_cursor:
            factories.append(f)

        logger.info("Found %d active (live) factories.", len(factories))

        if not factories:
            logger.info("No active factories to process. Exiting.")
            return

        # Instantiate HTTPX client
        async with httpx.AsyncClient() as httpx_client:
            for factory in factories:
                store_id = factory.get("store_id")
                try:
                    # Never crash on single factory error - wrap in try-except
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
