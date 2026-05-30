"""
Standalone Daily Aggregator Script: bottleneck.py
Computes workstation bottlenecks, costs, and projected gains for active factories.
Executed daily (e.g., via systemd at 01:00 UTC).
"""

import os
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/home/retailiq-key/auris-server/.env')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("AurisAggregator.bottleneck")

# Database Connection Settings
MONGO_URI = (
    os.getenv('MONGODB_URI') or
    os.getenv('COSMOS_CONNECTION_STRING') or 
    os.getenv('MONGO_URI') or 
    'mongodb://localhost:27017'
)
DB_NAME = os.getenv('DB_NAME', 'auris')


def _calculate_shift_duration_hours(shift: dict) -> float:
    """Helper to calculate shift duration in hours (handles overnight shifts correctly)."""
    try:
        start_str = shift.get("startTime") or shift.get("start_time") or ""
        end_str = shift.get("endTime") or shift.get("end_time") or ""
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


def _get_hourly_wage(factory: dict, worker_category: str) -> float:
    """Matches worker_category against factory_config to find the hourly wage."""
    if not worker_category:
        return 0.0
        
    worker_cat = worker_category.strip().lower()
    hourly_wage = 0.0
    
    # Standard keys computed during onboarding
    if "operator" in worker_cat:
        hourly_wage = factory.get("operator_hourly_wage") or factory.get("operatorHourlyWage") or 0.0
    elif "supervisor" in worker_cat:
        hourly_wage = factory.get("supervisor_hourly_wage") or factory.get("supervisorHourlyWage") or 0.0
    elif "contractor" in worker_cat:
        hourly_wage = factory.get("contractor_hourly_wage") or factory.get("contractorHourlyWage") or 0.0
        
    # Fallback to general worker_categories list or dict structure if present
    worker_categories = factory.get("worker_categories")
    if worker_categories:
        if isinstance(worker_categories, dict):
            for key, val in worker_categories.items():
                if key.lower().strip() == worker_cat or key.lower().strip() in worker_cat or worker_cat in key.lower().strip():
                    if isinstance(val, (int, float)):
                        hourly_wage = float(val)
                        break
                    elif isinstance(val, dict):
                        hourly_wage = float(val.get("hourly_wage") or val.get("hourlyWage") or val.get("wage") or 0.0)
                        break
        elif isinstance(worker_categories, list):
            for cat_item in worker_categories:
                if isinstance(cat_item, dict):
                    cat_name = str(cat_item.get("name") or cat_item.get("category") or "").strip().lower()
                    if cat_name == worker_cat or cat_name in worker_cat or worker_cat in cat_name:
                        hourly_wage = float(cat_item.get("hourly_wage") or cat_item.get("hourlyWage") or cat_item.get("wage") or cat_item.get("operatorWage") or 0.0)
                        break
                        
    return hourly_wage


def _calculate_total_shift_hours(factory: dict, now: datetime) -> float:
    """Calculates sum of shift durations * working days in last 30 days."""
    shifts = factory.get("shifts") or []
    if not shifts:
        # Fallback to standard 8-hour shift and 30 calendar working days
        return 8.0 * 30.0
        
    # 1. Sum of shift durations
    sum_durations = sum(_calculate_shift_duration_hours(s) for s in shifts)
    if sum_durations <= 0:
        sum_durations = 8.0
        
    # 2. Count working calendar days in the last 30 days
    # Weekday mapping to match frontend's Mon, Tue, etc.
    # Frontend keys: Mon, Tue, Wed, Thu, Fri, Sat, Sun
    weekday_map = {
        0: "Mon",
        1: "Tue",
        2: "Wed",
        3: "Thu",
        4: "Fri",
        5: "Sat",
        6: "Sun"
    }
    
    # Find which weekdays are active across any of the shifts
    active_weekdays = set()
    for s in shifts:
        days_dict = s.get("days") or {}
        for day_key, is_active in days_dict.items():
            if is_active:
                # Normalize key to first 3 chars capitalized (e.g. "Mon")
                norm_key = day_key.strip().capitalize()[:3]
                active_weekdays.add(norm_key)
                
    if not active_weekdays:
        # Default to all 30 calendar working days if no days are specified
        working_days = 30
    else:
        working_days = 0
        for i in range(30):
            day_dt = now - timedelta(days=i)
            day_name = weekday_map[day_dt.weekday()]
            if day_name in active_weekdays:
                working_days += 1
                
    if working_days == 0:
        working_days = 30
        
    total_hours = sum_durations * working_days
    return total_hours if total_hours > 0 else 8.0 * 30.0


async def process_factory_bottlenecks(db, factory: dict, now: datetime):
    """Processes daily bottleneck aggregation for a single factory config."""
    store_id = factory.get("store_id")
    if not store_id:
        logger.warning("Skipping factory document missing store_id")
        return
        
    logger.info("Processing bottleneck aggregation for store_id=%s", store_id)
    
    # 1. Pull last 30 days of zone_hour_agg where bottleneck_flag is True
    thirty_days_ago = now - timedelta(days=30)
    query = {
        "store_id": store_id,
        "bottleneck_flag": True,
        "hour_bucket": {"$gte": thirty_days_ago}
    }
    
    cursor = db.zone_hour_agg.find(query)
    events = []
    async for doc in cursor:
        events.append(doc)
        
    logger.info("Found %d bottleneck events in last 30 days for store_id=%s", len(events), store_id)
    
    # If no bottleneck events found for a factory — write empty ranked_stations []
    if not events:
        await db.bottleneck_cache.update_one(
            {"store_id": store_id},
            {
                "$set": {
                    "store_id": store_id,
                    "computed_at": now,
                    "period_from": thirty_days_ago,
                    "period_to": now,
                    "period": {
                        "from": thirty_days_ago.isoformat(),
                        "to": now.isoformat()
                    },
                    "ranked_stations": [],
                    "total_cost_inr": 0.0,
                    "updated_at": now.isoformat()
                }
            },
            upsert=True
        )
        logger.info("Saved empty bottleneck cache for store_id=%s", store_id)
        return
        
    # Group events by zone_id
    from collections import defaultdict, Counter
    zone_events = defaultdict(list)
    for doc in events:
        zone_id = doc.get("zone_id")
        if zone_id:
            zone_events[zone_id].append(doc)
            
    # Calculate shift capacity hours
    total_shift_hours_in_period = _calculate_total_shift_hours(factory, now)
    logger.info("Total shift capacity hours for store_id=%s: %.2f", store_id, total_shift_hours_in_period)
    
    stations = []
    
    for zone_id, zone_docs in zone_events.items():
        event_count = len(zone_docs)
        
        # Mean of queue_duration_mins
        durations = [float(d.get("queue_duration_mins") or 0.0) for d in zone_docs]
        avg_duration_minutes = sum(durations) / len(durations) if durations else 0.0
        
        # Sum of cascade_idle_hours
        cascade_idle_hours = [float(d.get("cascade_idle_hours") or 0.0) for d in zone_docs]
        total_cascade_idle_hours = sum(cascade_idle_hours)
        
        # Unique list of all zone_ids from cascade_zones arrays
        cascade_zones_set = set()
        for d in zone_docs:
            cz = d.get("cascade_zones")
            if isinstance(cz, list):
                for cz_id in cz:
                    if cz_id:
                        cascade_zones_set.add(str(cz_id))
        cascade_zones = list(cascade_zones_set)
        
        # worst_day = date with most bottleneck events
        date_counter = Counter()
        for d in zone_docs:
            hb = d.get("hour_bucket")
            if isinstance(hb, datetime):
                date_str = hb.date().isoformat()
            elif isinstance(hb, str):
                date_str = hb.split("T")[0]
            else:
                date_str = "unknown"
            date_counter[date_str] += 1
            
        worst_day = date_counter.most_common(1)[0][0] if date_counter else ""
        
        # Query zone_config to retrieve worker_category
        zone_config = await db.zone_config.find_one({"store_id": store_id, "zone_id": zone_id})
        worker_category = zone_config.get("worker_category") if zone_config else ""
        
        # Match against factory config worker_categories to find hourly wage
        hourly_wage = _get_hourly_wage(factory, worker_category)
        
        # total_cost_inr = total_cascade_idle_hours * hourly_wage
        total_cost_inr = total_cascade_idle_hours * hourly_wage
        
        zone_label = zone_config.get("zone_label") or zone_config.get("label") or zone_id if zone_config else zone_id
        if zone_id == "default_floor":
            zone_label = "Factory Floor"
            
        stations.append({
            "zone_id": zone_id,
            "zone_label": zone_label,
            "event_count": event_count,
            "avg_duration_minutes": avg_duration_minutes,
            "total_cascade_idle_hours": total_cascade_idle_hours,
            "total_cost_inr": total_cost_inr,
            "cascade_zones": cascade_zones,
            "worst_day": worst_day,
            "projected_gain_pct": 0.0  # Default value, updated for the top station below
        })
        
    # Rank stations by total_cost_inr descending
    ranked_stations = sorted(stations, key=lambda x: x["total_cost_inr"], reverse=True)
    
    # Calculate projected_gain_pct for the top station only
    if ranked_stations:
        top_station = ranked_stations[0]
        top_cascade_idle_hours = top_station["total_cascade_idle_hours"]
        if total_shift_hours_in_period > 0:
            gain_pct = round((top_cascade_idle_hours / total_shift_hours_in_period) * 100)
            projected_gain_pct = float(min(gain_pct, 35))
        else:
            projected_gain_pct = 0.0
        top_station["projected_gain_pct"] = projected_gain_pct
        
    # Sum total_cost_inr across all stations
    total_factory_cost_inr = sum(s["total_cost_inr"] for s in ranked_stations)
    
    # Upsert results into bottleneck_cache
    await db.bottleneck_cache.update_one(
        {"store_id": store_id},
        {
            "$set": {
                "store_id": store_id,
                "computed_at": now,
                "period_from": thirty_days_ago,
                "period_to": now,
                "period": {
                    "from": thirty_days_ago.isoformat(),
                    "to": now.isoformat()
                },
                "ranked_stations": ranked_stations,
                "total_cost_inr": total_factory_cost_inr,
                "updated_at": now.isoformat()
            }
        },
        upsert=True
    )
    
    logger.info("Successfully updated bottleneck cache for store_id=%s with %d stations", store_id, len(ranked_stations))


async def main():
    """Main execution loop for bottleneck aggregator."""
    logger.info("Starting bottleneck aggregator run")
    client = None
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
        
        now = datetime.now(timezone.utc)
        
        # Get all active stores where plan=factory and status=live
        stores_cursor = db.stores.find({"plan": "factory", "status": "live"})
        factories = []
        async for s in stores_cursor:
            store_id = s.get("store_id")
            if not store_id:
                continue
            factory = await db.factory_config.find_one({"store_id": store_id})
            if not factory:
                # Use store doc as fallback
                factory = s
            factories.append(factory)
            
        logger.info("Found %d active (live) factories to process", len(factories))
        
        for factory in factories:
            store_id = factory.get("store_id")
            try:
                await process_factory_bottlenecks(db, factory, now)
                logger.info("Processed factory store_id=%s successfully", store_id)
            except Exception as factory_err:
                logger.error("Error processing factory store_id=%s: %s", store_id, factory_err, exc_info=True)
                continue
                
    except Exception as run_err:
        logger.critical("Critical error in bottleneck aggregator: %s", run_err, exc_info=True)
    finally:
        if client:
            client.close()
            logger.info("Database connection closed")
    logger.info("Finished bottleneck aggregator run")


if __name__ == "__main__":
    asyncio.run(main())
