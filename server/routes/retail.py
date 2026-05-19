"""
FastAPI Routes for Retail Operations and Footfall Analytics.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

# Setup logging
logger = logging.getLogger("AurisCloud.retail")

router = APIRouter()

# Import get_db defensively
try:
    from db import get_db
except ImportError:
    from db import get_database as get_db

from db import get_store_auth, db
from utils.groq_client import get_narrative


async def _auth_store(request: Request) -> Dict[str, Any]:
    """
    Authenticates requests using X-Store-ID and X-Password headers.
    Returns the store document or raises 401/404 HTTP exceptions.
    """
    store_id = request.headers.get("X-Store-ID", "").strip()
    password = request.headers.get("X-Password", "")

    if not store_id:
        logger.warning("Request missing X-Store-ID header")
        raise HTTPException(status_code=401, detail="Missing X-Store-ID header")

    if not password:
        logger.warning("Request for store %s missing X-Password header", store_id)
        raise HTTPException(status_code=401, detail="Missing X-Password header")

    store = await get_store_auth(store_id, password)
    if not store:
        logger.warning("Auth failure for store %s: invalid credentials", store_id)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return store


def format_hour(h: int) -> str:
    """Formats 24-hour integer to AM/PM range string, e.g. 14 -> '2:00 PM – 3:00 PM'."""
    start_ampm = "AM" if h < 12 else "PM"
    end_ampm = "AM" if (h + 1) % 24 < 12 else "PM"
    
    start_hour = h % 12
    if start_hour == 0:
        start_hour = 12
        
    end_hour = (h + 1) % 12
    if end_hour == 0:
        end_hour = 12
        
    return f"{start_hour}:00 {start_ampm} – {end_hour}:00 {end_ampm}"


@router.get("/api/retail/footfall")
async def get_footfall(request: Request):
    """
    Query blobs where store_id matches + timestamp >= today_start (IST) + timestamp < today_end
    Aggregate by hour:
      hour_in = sum of counts.in per hour bucket
      hour_out = sum of counts.out per hour bucket
      hour_now = max of people_now per hour bucket
    """
    store = await _auth_store(request)
    store_id = store["store_id"]

    # IST start/end calculations
    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(timezone.utc).astimezone(ist)
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    today_start_iso = today_start.isoformat()
    today_end_iso = today_end.isoformat()

    pipeline = [
        {
            "$match": {
                "store_id": store_id,
                "timestamp": {
                    "$gte": today_start_iso,
                    "$lt": today_end_iso
                }
            }
        },
        {
            "$group": {
                "_id": {
                    "hour": {
                        "$hour": {
                            "$dateFromString": {
                                "dateString": "$timestamp"
                            }
                        }
                    }
                },
                "hour_in": {"$sum": "$counts.in"},
                "hour_out": {"$sum": "$counts.out"},
                "hour_now": {"$max": "$people_now"}
            }
        },
        {"$sort": {"_id.hour": 1}}
    ]

    # Pre-populate all 24 hours of the day
    hours_dict = {h: {"hour": h, "in": 0, "out": 0, "now": 0} for h in range(24)}

    try:
        async for row in db.blobs.aggregate(pipeline):
            h = row["_id"].get("hour")
            if h is not None and 0 <= h < 24:
                hours_dict[h]["in"] = int(row.get("hour_in") or 0)
                hours_dict[h]["out"] = int(row.get("hour_out") or 0)
                hours_dict[h]["now"] = int(row.get("hour_now") or 0)
    except Exception as e:
        logger.error("Failed aggregating footfall hourly data: %s", e)

    by_hour = [hours_dict[h] for h in sorted(hours_dict.keys())]
    today_total = sum(item["in"] for item in by_hour)

    # Determine peak hour
    peak_h = 0
    max_in = -1
    for item in by_hour:
        if item["in"] > max_in:
            max_in = item["in"]
            peak_h = item["hour"]

    peak_hour = format_hour(peak_h)
    avg_dwell_minutes = 14.5  # placeholder total_time_in_store estimate

    return {
        "today_total": today_total,
        "peak_hour": peak_hour,
        "avg_dwell_minutes": avg_dwell_minutes,
        "by_hour": by_hour
    }


@router.get("/api/retail/footfall/history")
async def get_history(request: Request):
    """
    Query blobs where store_id + timestamp >= 30 days ago
    Aggregate by date (IST):
      daily_total = sum of counts.in per day
    """
    store = await _auth_store(request)
    store_id = store["store_id"]

    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(timezone.utc).astimezone(ist)
    thirty_days_ago = now_ist - timedelta(days=30)
    thirty_days_ago_iso = thirty_days_ago.isoformat()

    pipeline = [
        {
            "$match": {
                "store_id": store_id,
                "timestamp": {"$gte": thirty_days_ago_iso}
            }
        },
        {
            "$group": {
                "_id": {
                    "$substr": ["$timestamp", 0, 10]  # Extracts YYYY-MM-DD
                },
                "daily_total": {"$sum": "$counts.in"}
            }
        },
        {"$sort": {"_id": 1}}
    ]

    daily = []
    total_30_days = 0
    best_day = {"date": "N/A", "count": 0}
    worst_day = {"date": "N/A", "count": 999999}

    try:
        async for row in db.blobs.aggregate(pipeline):
            dt_str = row["_id"]
            val = int(row.get("daily_total") or 0)
            daily.append({"date": dt_str, "visitors": val})
            total_30_days += val

            if val > best_day["count"]:
                best_day = {"date": dt_str, "count": val}
            if val < worst_day["count"]:
                worst_day = {"date": dt_str, "count": val}
    except Exception as e:
        logger.error("Failed aggregating footfall history data: %s", e)

    if worst_day["count"] == 999999:
        worst_day = {"date": "N/A", "count": 0}

    return {
        "total_30_days": total_30_days,
        "best_day": best_day,
        "worst_day": worst_day,
        "daily": daily
    }


@router.get("/api/retail/report")
async def get_report(request: Request):
    """
    Fetch last 7 days footfall summary and generate a retail narrative report.
    """
    store = await _auth_store(request)
    store_id = store["store_id"]

    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(timezone.utc).astimezone(ist)
    seven_days_ago = now_ist - timedelta(days=7)
    seven_days_ago_iso = seven_days_ago.isoformat()

    pipeline = [
        {
            "$match": {
                "store_id": store_id,
                "timestamp": {"$gte": seven_days_ago_iso}
            }
        },
        {
            "$group": {
                "_id": {
                    "$substr": ["$timestamp", 0, 10]
                },
                "daily_total": {"$sum": "$counts.in"}
            }
        },
        {"$sort": {"_id": 1}}
    ]

    summary_lines = []
    try:
        async for row in db.blobs.aggregate(pipeline):
            summary_lines.append(f"Date: {row['_id']}, Visitors: {row['daily_total']}")
    except Exception as e:
        logger.error("Failed fetching last 7 days summary for retail report: %s", e)

    summary_str = "\n".join(summary_lines)
    if not summary_str:
        summary_str = "No visitor footfall data recorded for the last 7 days."

    system_prompt = "You are a retail analytics assistant. Be specific, use numbers, max 4 sentences per section."
    user_prompt = (
        f"Here is the 7-day footfall summary for the store ID {store_id}:\n{summary_str}\n\n"
        "Please generate a structured, highly informative retail report identifying recent trends, peak days, "
        "and suggestions for improvement. Keep it concise."
    )

    try:
        narrative = await get_narrative(system_prompt, user_prompt)
    except Exception as e:
        logger.error("Failed calling Groq client for retail report: %s", e)
        narrative = ""

    if not narrative:
        narrative = "Not enough data yet. First report arrives on Day 7."

    return {
        "narrative": narrative,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
