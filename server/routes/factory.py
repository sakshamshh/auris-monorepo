"""
FastAPI Routes for Factory Operations and Efficiency Analytics (Phase 2).
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query

# Setup logging
logger = logging.getLogger("AurisCloud.factory")

router = APIRouter()

# Import get_db defensively
try:
    from db import get_db
except ImportError:
    from db import get_database as get_db

from db import get_store_auth, get_store_by_api_key
from utils.groq_client import get_narrative


def _get_raw_db():
    """Defensively extract raw motor database from get_db."""
    conn = get_db()
    if hasattr(conn, "_db"):
        return conn._db
    return conn


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


def parse_iso_datetime(val: Optional[str], default: datetime) -> datetime:
    """
    Parses ISO strings (supporting timezone offsets/UTC 'Z' and date-only strings)
    returning a timezone-aware datetime in UTC.
    """
    if not val:
        return default
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        try:
            dt = datetime.strptime(val, "%Y-%m-%d")
            return dt.replace(tzinfo=timezone.utc)
        except Exception:
            logger.warning("Failed parsing date string '%s', using default: %s", val, default)
            return default


def parse_computed_at(val: Any) -> Optional[datetime]:
    """Parses computed_at timestamp defensively returning a timezone-aware datetime."""
    if not val:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    try:
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


# --- ROUTES ---

@router.get("/api/factory/deadtime")
async def get_deadtime(
    request: Request,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    shift_id: Optional[str] = Query(None)
):
    """
    Aggregates workstation dead time and unproductive hours.
    Performs executive summary, worst workstation search, and Groq narrative generation.
    """
    store = await _auth_store(request)
    store_id = store["store_id"]

    raw_db = _get_raw_db()

    # 1. Single bulk fetch of zone config mapping for lookups
    zone_configs = {}
    async for z in raw_db.zone_config.find({"store_id": store_id}):
        z_id = z.get("zone_id")
        if z_id:
            zone_configs[z_id] = z

    # 2. Date parsing and boundary logic
    now = datetime.now(timezone.utc)
    from_date_dt = parse_iso_datetime(from_date, now - timedelta(days=30))
    to_date_dt = parse_iso_datetime(to_date, now)

    # Calculate hours in date range
    hours_in_range = (to_date_dt - from_date_dt).total_seconds() / 3600.0
    if hours_in_range < 0:
        hours_in_range = 0.0

    # 3. Query zone_hour_agg
    query = {
        "store_id": store_id,
        "hour_bucket": {"$gte": from_date_dt, "$lte": to_date_dt}
    }
    if shift_id:
        query["$or"] = [
            {"shift_id": shift_id},
            {"shift": shift_id}
        ]

    by_zone_data = {}
    idle_minutes_by_date = {}

    cursor = raw_db.zone_hour_agg.find(query)
    async for doc in cursor:
        zone_id = doc.get("zone_id")
        if not zone_id:
            continue

        # Filter only workstation zones from bulk configuration
        zone_info = zone_configs.get(zone_id)
        if not zone_info or zone_info.get("zone_type") != "WORK_STATION":
            continue

        idle_min = float(doc.get("idle_minutes") or 0.0)
        prod_min = float(doc.get("productive_minutes") or 0.0)
        cost = float(doc.get("idle_cost_inr") or doc.get("dead_cost_inr") or 0.0)

        # In-memory aggregation by zone
        if zone_id not in by_zone_data:
            by_zone_data[zone_id] = {
                "zone_id": zone_id,
                "zone_label": zone_info.get("zone_label") or zone_info.get("label") or zone_id,
                "idle_minutes": 0.0,
                "productive_minutes": 0.0,
                "dead_cost_inr": 0.0
            }
        by_zone_data[zone_id]["idle_minutes"] += idle_min
        by_zone_data[zone_id]["productive_minutes"] += prod_min
        by_zone_data[zone_id]["dead_cost_inr"] += cost

        # Worst day grouping by date
        bucket_date = doc.get("hour_bucket")
        if isinstance(bucket_date, datetime):
            date_str = bucket_date.date().isoformat()
        elif isinstance(bucket_date, str):
            date_str = bucket_date.split("T")[0]
        else:
            date_str = "unknown"

        idle_minutes_by_date[date_str] = idle_minutes_by_date.get(date_str, 0.0) + idle_min

    # Build by_zone return array
    by_zone = []
    for zone_id, zdata in by_zone_data.items():
        by_zone.append({
            "zone_id": zone_id,
            "zone_label": zdata["zone_label"],
            "dead_hours": zdata["idle_minutes"] / 60.0,
            "dead_cost_inr": zdata["dead_cost_inr"],
            "productive_hours": zdata["productive_minutes"] / 60.0
        })

    # Summary calculations
    productive_hours_total = sum(z["productive_hours"] for z in by_zone)
    dead_hours_total = sum(z["dead_hours"] for z in by_zone)
    dead_cost_inr_total = sum(z["dead_cost_inr"] for z in by_zone)

    # expected_hours_total = sum(expected_headcount * 1) * hours_in_range
    active_workstations = [
        z for z in zone_configs.values()
        if z.get("zone_type") == "WORK_STATION" and z.get("active") is True
    ]
    expected_headcount_sum = sum(float(z.get("expected_headcount") or 1.0) for z in active_workstations)
    expected_hours_total = expected_headcount_sum * hours_in_range

    # Find worst zone and worst day
    worst_zone = ""
    if by_zone:
        worst_z = max(by_zone, key=lambda x: x["dead_cost_inr"])
        worst_zone = worst_z["zone_label"]

    worst_day = ""
    if idle_minutes_by_date:
        worst_day = max(idle_minutes_by_date, key=idle_minutes_by_date.get)

    # Call Groq for Narrative
    narrative = ""
    if by_zone:
        system_prompt = (
            "You are an expert manufacturing efficiency analyst at AURIS, a spatial intelligence system. "
            "Analyze the provided dead time data and provide a concise, professional executive narrative "
            "highlighting insights, inefficiencies, and actionable recommendations. Keep it under 200 tokens."
        )
        user_prompt = f"""
        Analyze the factory dead time data for the period {from_date_dt.date().isoformat()} to {to_date_dt.date().isoformat()}.
        
        Summary Metrics:
        - Expected Hours Total: {expected_hours_total:.2f} hrs
        - Productive Hours Total: {productive_hours_total:.2f} hrs
        - Dead Hours Total: {dead_hours_total:.2f} hrs
        - Dead Cost (INR): {dead_cost_inr_total:.2f}
        
        Worst Performing Zone: {worst_zone or "N/A"}
        Worst Day (Highest Idle Time): {worst_day or "N/A"}
        
        Zone breakdown:
        """
        for z in by_zone:
            user_prompt += f"\n- Zone {z['zone_label']} ({z['zone_id']}): Dead Hours: {z['dead_hours']:.2f}, Dead Cost: INR {z['dead_cost_inr']:.2f}, Productive Hours: {z['productive_hours']:.2f}"

        try:
            narrative = await get_narrative(system_prompt, user_prompt)
        except Exception as e:
            logger.error("Failed to generate dead time narrative: %s", e)
            narrative = ""

    return {
        "period": {
            "from": from_date_dt.isoformat(),
            "to": to_date_dt.isoformat()
        },
        "summary": {
            "expected_hours_total": expected_hours_total,
            "productive_hours_total": productive_hours_total,
            "dead_hours_total": dead_hours_total,
            "dead_cost_inr": dead_cost_inr_total
        },
        "by_zone": by_zone,
        "worst_zone": worst_zone,
        "worst_day": worst_day,
        "narrative": narrative
    }


@router.get("/api/factory/bottleneck")
async def get_bottlenecks(request: Request):
    """
    Fetches the precomputed workstation bottlenecks from the bottleneck cache.
    Returns 24-hour validity cache warning or the full data list + LLM narrative.
    """
    store = await _auth_store(request)
    store_id = store["store_id"]

    raw_db = _get_raw_db()

    # 1. Single bulk fetch of zone config mapping for lookups
    zone_configs = {}
    async for z in raw_db.zone_config.find({"store_id": store_id}):
        z_id = z.get("zone_id")
        if z_id:
            zone_configs[z_id] = z

    # 2. Read bottleneck cache document
    cache_doc = await raw_db.bottleneck_cache.find_one({"store_id": store_id})
    if not cache_doc:
        return {"cached": False, "message": "Cache building. Check back tomorrow."}

    computed_at = cache_doc.get("computed_at")
    computed_at_dt = parse_computed_at(computed_at)

    # Verify computed timestamp is within 25 hours limit
    if not computed_at_dt or computed_at_dt < (datetime.now(timezone.utc) - timedelta(hours=25)):
        return {"cached": False, "message": "Cache building. Check back tomorrow."}

    # 3. Enrich ranked stations with zone labels from single config lookup
    raw_stations = cache_doc.get("ranked_stations", [])
    ranked_stations = []

    for station in raw_stations:
        zone_id = station.get("zone_id")
        zone_info = zone_configs.get(zone_id)
        zone_label = zone_info.get("zone_label") or zone_info.get("label") or station.get("zone_label") or zone_id

        ranked_stations.append({
            "zone_id": zone_id,
            "zone_label": zone_label,
            "event_count": station.get("event_count", 0),
            "avg_duration_minutes": station.get("avg_duration_minutes", 0.0),
            "total_cascade_idle_hours": station.get("total_cascade_idle_hours", 0.0),
            "total_cost_inr": station.get("total_cost_inr", 0.0),
            "projected_gain_pct": station.get("projected_gain_pct", 0.0),
            "cascade_zones": station.get("cascade_zones", [])
        })

    # Call Groq for Narrative
    narrative = ""
    if ranked_stations:
        system_prompt = (
            "You are an expert manufacturing process optimizer at AURIS. Analyze the provided station bottleneck "
            "data and describe the bottleneck cascades, cost impact, and how addressing them would improve factory throughput."
        )
        user_prompt = f"""
        Analyze the factory workstation bottleneck cache data.
        
        Period: {cache_doc.get("period", {}).get("from", "N/A")} to {cache_doc.get("period", {}).get("to", "N/A")}
        
        Ranked bottleneck stations:
        """
        for s in ranked_stations:
            user_prompt += f"\n- Station {s['zone_label']} ({s['zone_id']}): Events: {s['event_count']}, Avg Duration: {s['avg_duration_minutes']:.1f} mins, Cascade Idle: {s['total_cascade_idle_hours']:.1f} hrs, Total Cost: INR {s['total_cost_inr']:.2f}, Projected Gain: {s['projected_gain_pct']:.1f}%, Cascade Zones: {s['cascade_zones']}"

        try:
            narrative = await get_narrative(system_prompt, user_prompt)
        except Exception as e:
            logger.error("Failed to generate bottleneck narrative: %s", e)
            narrative = ""

    return {
        "period": cache_doc.get("period", {"from": "", "to": ""}),
        "ranked_stations": ranked_stations,
        "narrative": narrative
    }


@router.get("/api/factory/patterns")
async def get_patterns(request: Request):
    """
    Identifies high-frequency recurrence patterns of workstation waste and idle times.
    Sorts active recurrence patterns by monthly financial cost.
    """
    store = await _auth_store(request)
    store_id = store["store_id"]

    raw_db = _get_raw_db()

    # 1. Single bulk fetch of zone config mapping for lookups
    zone_configs = {}
    async for z in raw_db.zone_config.find({"store_id": store_id}):
        z_id = z.get("zone_id")
        if z_id:
            zone_configs[z_id] = z

    # 2. Query active patterns and sort by cost descending
    cursor = raw_db.pattern_flags.find({"store_id": store_id, "active": True}).sort("monthly_cost_inr", -1)

    serialized_patterns = []
    async for p in cursor:
        zone_id = p.get("zone_id")
        zone_info = zone_configs.get(zone_id)
        zone_label = zone_info.get("zone_label") or zone_info.get("label") or p.get("zone_label") or zone_id

        serialized_patterns.append({
            "zone_id": zone_id,
            "zone_label": zone_label,
            "hour_slot": p.get("hour_slot"),
            "hour_label": p.get("hour_label"),
            "recurrence_count": p.get("recurrence_count"),
            "avg_lost_hours": p.get("avg_lost_hours"),
            "monthly_cost_inr": p.get("monthly_cost_inr"),
            "confidence": p.get("confidence")
        })

    # Call Groq for Narrative
    narrative = ""
    if serialized_patterns:
        system_prompt = (
            "You are an expert operations research scientist at AURIS. Analyze the repetitive cost patterns "
            "and recurrence flags. Provide a concise narrative of the most prominent, high-cost recurring patterns, "
            "their confidence, and optimization recommendations."
        )
        user_prompt = f"""
        Analyze the recurring factory waste patterns.
        
        Active patterns identified:
        """
        for p in serialized_patterns:
            user_prompt += f"\n- Zone {p['zone_label']} ({p['zone_id']}): Hour Slot: {p['hour_slot']} ({p['hour_label']}), Recurrence: {p['recurrence_count']} times, Avg Lost Hours: {p['avg_lost_hours']:.1f} hrs, Monthly Cost: INR {p['monthly_cost_inr']:.2f}, Confidence: {p['confidence']:.1f}%"

        try:
            narrative = await get_narrative(system_prompt, user_prompt)
        except Exception as e:
            logger.error("Failed to generate pattern narrative: %s", e)
            narrative = ""

    return {
        "patterns": serialized_patterns,
        "narrative": narrative
    }


@router.get("/api/edge/config")
async def get_edge_config(request: Request):
    """
    Get or auto-create edge device configuration for a factory by API key.
    Does not throw 404 for valid API key.
    """
    api_key = request.headers.get("X-API-Key", "").strip()
    if not api_key:
        logger.warning("GET edge config request missing X-API-Key header")
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
        
    store = await get_store_by_api_key(api_key)
    if not store:
        logger.warning("GET edge config request has invalid API key: %s", api_key)
        raise HTTPException(status_code=401, detail="Invalid API key")
        
    store_id = store["store_id"]
    raw_db = _get_raw_db()
    
    # Retrieve factory_config document
    config = await raw_db.factory_config.find_one({"store_id": store_id})
    
    store_name = store.get("store_name", store_id)
    is_hosp = "hospital" in store_id.lower() or "hospital" in store_name.lower() or "hosp" in store_id.lower() or "hosp" in store_name.lower()

    if not config:
        logger.info("Factory config not found for store %s, auto-creating minimal", store_id)
        now_iso = datetime.now(timezone.utc).isoformat()
        config = {
            "store_id": store_id,
            "factory_name": store_name,
            "location": store.get("city", "Chennai"),
            "city": store.get("city", "Chennai"),
            "status": "pending",
            "trial_start": now_iso,
            "trial_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "shifts": [],
            "worker_categories": [],
            "cameras": [],
            "whatsapp_number": "",
            "whatsAppNumber": "",
            "privacy_mode": is_hosp,
            "created_at": now_iso,
            "updated_at": now_iso
        }
        await raw_db.factory_config.insert_one(config)
    else:
        if "privacy_mode" not in config:
            config["privacy_mode"] = is_hosp
            await raw_db.factory_config.update_one(
                {"store_id": store_id},
                {"$set": {"privacy_mode": is_hosp}}
            )
        
    # Convert MongoDB _id for JSON serialization
    if "_id" in config:
        config["_id"] = str(config["_id"])
        
    # Standardize/ensure cameras key is always a list
    if "cameras" not in config or config["cameras"] is None:
        config["cameras"] = []
        
    num_cameras = len(config["cameras"])
    ts = datetime.now(timezone.utc).isoformat()
    logger.info("Successfully retrieved/created edge config for store_id: %s. Cameras count: %d. Timestamp: %s", store_id, num_cameras, ts)
    return config

