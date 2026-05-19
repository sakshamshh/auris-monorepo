from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request

from db import db, get_store_auth

router = APIRouter()


async def _auth_store(request: Request):
    store_id = request.headers.get("X-Store-ID", "")
    password = request.headers.get("X-Password", "")
    if not store_id or not password:
        raise HTTPException(status_code=401, detail="Missing auth headers")
    store = await get_store_auth(store_id, password)
    if not store:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return store


def _today_range():
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


@router.get("/api/today")
async def api_today(request: Request):
    store = await _auth_store(request)
    sid = store["store_id"]
    start, end = _today_range()

    pipeline = [
        {"$match": {"store_id": sid, "timestamp": {"$gte": start.isoformat()}}},
        {"$group": {
            "_id": "$camera_id",
            "total_in": {"$max": "$counts.in"},
            "total_out": {"$max": "$counts.out"},
            "current": {"$last": "$counts.current"},
            "last_seen": {"$max": "$received_at"},
        }},
    ]
    cameras = []
    async for row in db.blobs.aggregate(pipeline):
        cameras.append({
            "_id": row["_id"],
            "total_in": row.get("total_in", 0),
            "total_out": row.get("total_out", 0),
            "current": row.get("current", 0),
            "last_seen": row.get("last_seen"),
        })

    return {"date": start.date().isoformat(), "cameras": cameras}


@router.get("/api/live")
async def api_live(request: Request):
    store = await _auth_store(request)
    sid = store["store_id"]
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

    pipeline = [
        {"$match": {"store_id": sid, "received_at": {"$gte": cutoff}}},
        {"$sort": {"received_at": -1}},
        {"$group": {
            "_id": "$camera_id",
            "total_in": {"$first": "$counts.in"},
            "total_out": {"$first": "$counts.out"},
            "current": {"$first": "$counts.current"},
            "last_seen": {"$first": "$received_at"},
            "people_now": {"$first": "$people_now"},
        }},
    ]
    cameras = []
    async for row in db.blobs.aggregate(pipeline):
        cameras.append({
            "_id": row["_id"],
            "total_in": row.get("total_in", 0),
            "total_out": row.get("total_out", 0),
            "current": row.get("current", 0),
            "last_seen": row.get("last_seen"),
            "people_now": row.get("people_now", 0),
        })
    return {"cameras": cameras}


@router.get("/api/hourly")
async def api_hourly(request: Request):
    store = await _auth_store(request)
    sid = store["store_id"]
    start, _ = _today_range()

    pipeline = [
        {"$match": {"store_id": sid, "timestamp": {"$gte": start.isoformat()}}},
        {"$unwind": "$crossings"},
        {"$match": {"crossings": "entry"}},
        {"$group": {
            "_id": {"hour": {"$hour": {"$dateFromString": {"dateString": "$timestamp"}}}},
            "entries": {"$sum": 1},
        }},
        {"$sort": {"_id.hour": 1}},
    ]
    hourly = []
    async for row in db.blobs.aggregate(pipeline):
        hourly.append({"_id": row["_id"], "entries": row["entries"]})
    return {"hourly": hourly}


@router.get("/api/zones")
async def api_zones(request: Request):
    store = await _auth_store(request)
    sid = store["store_id"]
    start, _ = _today_range()

    pipeline = [
        {"$match": {"store_id": sid, "timestamp": {"$gte": start.isoformat()}}},
        {"$unwind": "$zone_events"},
        {"$match": {"zone_events.event": "entry"}},
        {"$group": {
            "_id": "$zone_events.zone",
            "visits": {"$sum": 1},
        }},
        {"$sort": {"visits": -1}},
    ]
    zones = []
    async for row in db.blobs.aggregate(pipeline):
        zones.append({"zone": row["_id"], "visits": row["visits"]})
    return {"zones": zones}
