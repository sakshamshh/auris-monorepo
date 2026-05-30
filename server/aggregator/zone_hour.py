"""
Standalone Aggregator Script: zone_hour.py
Aggregates worker occupancy and productivity statistics per zone every hour.
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
logger = logging.getLogger("AurisAggregator.zone_hour")

# Database Connection Settings
MONGO_URI = (
    os.getenv('MONGODB_URI') or
    os.getenv('COSMOS_CONNECTION_STRING') or 
    os.getenv('MONGO_URI') or 
    'mongodb://localhost:27017'
)
DB_NAME = os.getenv('DB_NAME', 'auris')


def _calculate_shift_duration_hours(shift: dict) -> float:
    """Calculates single shift duration in hours."""
    try:
        start_str = shift.get("startTime", "")
        end_str = shift.get("endTime", "")
        if not start_str or not end_str:
            return 8.0
            
        start_h, start_m = map(int, start_str.split(":"))
        end_h, end_m = map(int, end_str.split(":"))
        
        start_mins = start_h * 60 + start_m
        end_mins = end_h * 60 + end_m
        
        diff_mins = (end_mins - start_mins) % 1440
        if diff_mins == 0 and start_str != end_str:
            diff_mins = 1440
            
        duration = diff_mins / 60.0
        return duration if duration > 0 else 8.0
    except Exception as e:
        logger.error("Failed to parse shift times for shift %s: %s", shift, e)
        return 8.0


async def aggregate_zone_hour(db, factory: dict, zone: dict, hour_start: datetime, hour_end: datetime, active_zones_count: int):
    """Aggregates all blobs for a single zone over the given hour window."""
    store_id = factory["store_id"]
    zone_id = zone["zone_id"]
    
    hour_start_iso = hour_start.isoformat()
    hour_end_iso = hour_end.isoformat()
    
    # Extract camera assignments for this zone
    raw_cameras = zone.get("camera_ids") or zone.get("cameras") or []
    if isinstance(raw_cameras, str):
        camera_list = [c.strip() for c in raw_cameras.split(",") if c.strip()]
    elif isinstance(raw_cameras, list):
        camera_list = [str(c).strip() for c in raw_cameras if str(c).strip()]
    else:
        camera_list = []
        
    # 1. Pull all documents from blobs collection
    query = {
        "store_id": store_id,
        "$or": [
            {
                "timestamp": {
                    "$gte": hour_start_iso,
                    "$lt": hour_end_iso
                }
            },
            {
                "timestamp": {
                    "$gte": hour_start,
                    "$lt": hour_end
                }
            }
        ]
    }
    
    # Filter by cameras if they are configured for the zone, otherwise use all cameras for this store
    if camera_list:
        query["camera_id"] = {"$in": camera_list}
    
    blobs_cursor = db.blobs.find(query)
    
    # 2. Extract person count values defensively from the retrieved blobs
    person_counts = []
    
    async for doc in blobs_cursor:
        val = (doc.get('people_now') or doc.get('person_count') 
               or doc.get('count') or 0)
        person_counts.append(float(val))
            
    print(f"Fetched blobs count for store {store_id} zone {zone_id}: {len(person_counts)}")
            
    # 3. Perform calculations
    total_count = len(person_counts)
    
    # average and maximum person count
    if total_count > 0:
        people_present_avg = sum(person_counts) / total_count
        people_present_max = max(person_counts)
    else:
        people_present_avg = 0.0
        people_present_max = 0.0
        
    # Expected headcount and threshold
    expected_headcount = zone.get("expected_headcount")
    try:
        if expected_headcount is not None:
            expected_headcount = float(expected_headcount)
        else:
            expected_headcount = 0.0
    except Exception:
        expected_headcount = 0.0
        
    if not expected_headcount or expected_headcount <= 0.0:
        # Fallback to factory worker_count / number_of_zones
        raw_worker_count = None
        for key in ["worker_count", "totalHeadcount", "total_headcount"]:
            if factory.get(key) is not None:
                raw_worker_count = factory.get(key)
                break
        if raw_worker_count is None and "prefill" in factory:
            raw_worker_count = factory["prefill"].get("worker_count")
            
        import re
        parsed_worker_count = 0.0
        if raw_worker_count is not None:
            if isinstance(raw_worker_count, (int, float)):
                parsed_worker_count = float(raw_worker_count)
            else:
                digits = re.findall(r'\d+', str(raw_worker_count))
                if digits:
                    parsed_worker_count = float(digits[0])
                    
        num_zones = active_zones_count if active_zones_count > 0 else 1
        if parsed_worker_count > 0:
            expected_headcount = parsed_worker_count / num_zones
        else:
            expected_headcount = 1.0
        
    # Productive and Idle minutes
    if total_count == 0:
        productive_minutes = 0
    else:
        # Sum the proportional productivity per frame, capped at 1.0 per frame
        productive_ratio = sum(min(1.0, c / expected_headcount) for c in person_counts) / total_count
        productive_minutes = round(productive_ratio * 60)
        
    idle_minutes = 60 - productive_minutes
    
    # Extract matching worker hourly wage defensively from factory_config
    hourly_wage = 0.0
    worker_cat = (zone.get("worker_category") or "").strip().lower()
    
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
        matched_cat_wage = 0.0
        if isinstance(worker_categories, dict):
            for key, val in worker_categories.items():
                if key.lower().strip() == worker_cat or key.lower().strip() in worker_cat or worker_cat in key.lower().strip():
                    if isinstance(val, (int, float)):
                        matched_cat_wage = float(val)
                        break
                    elif isinstance(val, dict):
                        matched_cat_wage = float(val.get("hourly_wage") or val.get("hourlyWage") or val.get("hourly_wage_inr") or val.get("hourlyWageInr") or val.get("wage") or 0.0)
                        break
        elif isinstance(worker_categories, list):
            for cat_item in worker_categories:
                if isinstance(cat_item, dict):
                    cat_name = str(cat_item.get("name") or cat_item.get("category") or "").strip().lower()
                    if cat_name == worker_cat or cat_name in worker_cat or worker_cat in cat_name:
                        matched_cat_wage = float(cat_item.get("hourly_wage") or cat_item.get("hourlyWage") or cat_item.get("hourly_wage_inr") or cat_item.get("hourlyWageInr") or cat_item.get("wage") or cat_item.get("operatorWage") or 0.0)
                        break
        if matched_cat_wage > 0.0:
            hourly_wage = matched_cat_wage
                        
    # Fallback wage to 200.0 if not configured
    if not hourly_wage or hourly_wage <= 0.0:
        hourly_wage = 200.0

    # Calculate dead_hours and dead_cost_inr
    threshold_dead = expected_headcount * 0.70
    if total_count == 0:
        dead_hours = 0.0
        dead_minutes = 0.0
    else:
        below_threshold_count = sum(1 for c in person_counts if c < threshold_dead)
        dead_minutes = (below_threshold_count / total_count) * 60
        dead_hours = dead_minutes / 60.0
        
    dead_cost_inr = dead_hours * hourly_wage * expected_headcount
    print(f"Calculated dead_hours for store {store_id} zone {zone_id}: {dead_hours}, cost: {dead_cost_inr}")
    
    # Occupancy ratio (clipped to max 2.0)
    if expected_headcount > 0:
        occupancy_ratio = min(people_present_avg / expected_headcount, 2.0)
    else:
        occupancy_ratio = 0.0
        
    # Phase 2 bottleneck detection
    queue_count_max = 0
    queue_duration_mins = 0
    bottleneck_flag = dead_hours > 0.5
    
    # TTL and DateTime configurations
    hour_bucket = hour_start
    day_of_week = int(hour_bucket.weekday())  # 0 = Monday
    hour_of_day = int(hour_bucket.hour)
    ttl = int(hour_bucket.timestamp()) + 7_776_000  # 90 days TTL
    
    # 4. Upsert into zone_hour_agg
    await db.zone_hour_agg.update_one(
        {
            "store_id": store_id,
            "zone_id": zone_id,
            "hour_bucket": hour_bucket
        },
        {
            "$set": {
                "store_id": store_id,
                "zone_id": zone_id,
                "hour_bucket": hour_bucket,
                "hour_bucket_iso": hour_start_iso,
                "day_of_week": day_of_week,
                "hour_of_day": hour_of_day,
                "people_present_avg": people_present_avg,
                "people_present_max": people_present_max,
                "productive_minutes": productive_minutes,
                "idle_minutes": idle_minutes,
                "hourly_wage": hourly_wage,
                "idle_cost_inr": dead_cost_inr,
                "dead_hours": dead_hours,
                "dead_cost_inr": dead_cost_inr,
                "occupancy_ratio": occupancy_ratio,
                "queue_count_max": queue_count_max,
                "queue_duration_mins": queue_duration_mins,
                "bottleneck_flag": bottleneck_flag,
                "frame_count": total_count,
                "ttl": ttl,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    print(f"Saved to DB: {store_id}, {dead_hours}, {dead_cost_inr}")


async def main():
    """Main entrypoint for standalone aggregation run."""
    logger.info("Starting zone_hour aggregation run")
    client = None
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
        
        # Truncate current UTC time to the hour and use the previous hour bucket
        now_utc = datetime.now(timezone.utc)
        hour_start = now_utc.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
        hour_end = hour_start + timedelta(hours=1)
        
        hour_start_iso = hour_start.isoformat()
        hour_end_iso = hour_end.isoformat()
        
        logger.info("Aggregating for hour bucket: %s to %s", hour_start_iso, hour_end_iso)
        
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
            
        logger.info("Found %d active (live) factories", len(factories))
        
        for factory in factories:
            store_id = factory.get("store_id")
            print(f"Factory store_id: {store_id}")
            if not store_id:
                logger.warning("Found factory document missing store_id")
                continue
                
            # Get active work station zones for this store
            zones = await db.zone_config.find({
                "store_id": store_id,
                "active": True,
                "zone_type": "WORK_STATION"
            }).to_list(None)
            
            if not zones:
                # No zones configured — use all cameras as one default zone
                zones = [{
                    'zone_id': 'default_floor',
                    'zone_name': 'Factory Floor',
                    'camera_ids': [],  # empty = use all cameras
                    'expected_headcount': None  # will use factory worker_count fallback
                }]
            
            active_zones_count = len(zones)
            
            for zone in zones:
                zone_id = zone.get("zone_id")
                if not zone_id:
                    logger.warning("Found active zone config missing zone_id for store %s", store_id)
                    continue
                    
                try:
                    await aggregate_zone_hour(db, factory, zone, hour_start, hour_end, active_zones_count)
                    logger.info("Aggregated store_id=%s zone_id=%s hour=%s", store_id, zone_id, hour_start_iso)
                except Exception as zone_err:
                    logger.error("Error aggregating store_id=%s zone_id=%s: %s", store_id, zone_id, zone_err, exc_info=True)
                    continue
                    
    except Exception as run_err:
        logger.critical("Critical error in zone_hour aggregator: %s", run_err, exc_info=True)
    finally:
        if client:
            client.close()
            logger.info("Database client closed")
    logger.info("Finished zone_hour aggregation run")


if __name__ == "__main__":
    asyncio.run(main())
