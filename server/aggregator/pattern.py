"""
Daily Workstation Dip Aggregator: pattern.py
Identifies high-frequency recurrence patterns of workstation waste and idle times.
Executed daily (e.g., via systemd timer).
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
logger = logging.getLogger("AurisAggregator.pattern")

# Database Connection Settings
MONGO_URI = (
    os.getenv('MONGODB_URI') or
    os.getenv('COSMOS_CONNECTION_STRING') or 
    os.getenv('MONGO_URI') or 
    'mongodb://localhost:27017'
)
DB_NAME = os.getenv('DB_NAME', 'auris')


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


def _format_hour_label(hour: int) -> str:
    """Formats an hour slot (0-23) to a human-readable 12-hour AM/PM interval label."""
    start_hour = hour
    end_hour = (hour + 1) % 24
    
    def to_ampm(h):
        if h == 0:
            return "12:00 AM"
        elif h == 12:
            return "12:00 PM"
        elif h < 12:
            return f"{h}:00 AM"
        else:
            return f"{h - 12}:00 PM"
            
    return f"{to_ampm(start_hour)} - {to_ampm(end_hour)}"


async def deactivate_pattern(db, store_id: str, zone_id: str, hour_slot: int):
    """Deactivates an existing pattern flag in the database without creating a new one."""
    await db.pattern_flags.update_one(
        {"store_id": store_id, "zone_id": zone_id, "hour_slot": hour_slot},
        {"$set": {"active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=False
    )


async def process_zone_hour_pattern(db, factory: dict, zone: dict, hour_slot: int, now: datetime):
    """Processes recurring occupancy dip patterns for a specific zone & hour slot."""
    store_id = factory.get("store_id")
    zone_id = zone.get("zone_id")
    zone_label = zone.get("zone_label") or zone.get("label") or zone_id
    
    thirty_days_ago = now - timedelta(days=30)
    
    # 1. Pull last 30 days of zone_hour_agg for this store_id + zone_id + hour_of_day == hour_slot
    query = {
        "store_id": store_id,
        "zone_id": zone_id,
        "hour_of_day": hour_slot,
        "hour_bucket": {"$gte": thirty_days_ago}
    }
    
    cursor = db.zone_hour_agg.find(query)
    docs = []
    async for doc in cursor:
        docs.append(doc)
        
    # 2. If fewer than 7 documents: skip
    if len(docs) < 7:
        await deactivate_pattern(db, store_id, zone_id, hour_slot)
        return
        
    # 3. baseline = mean of occupancy_ratio across all documents
    occupancy_ratios = [float(doc.get("occupancy_ratio") or 0.0) for doc in docs]
    baseline = sum(occupancy_ratios) / len(occupancy_ratios)
    
    # 4. dip_days = documents where occupancy_ratio < baseline * 0.60
    dip_days = [doc for doc in docs if float(doc.get("occupancy_ratio") or 0.0) < baseline * 0.60]
    
    # 5. If len(dip_days) < 5: skip
    if len(dip_days) < 5:
        await deactivate_pattern(db, store_id, zone_id, hour_slot)
        return
        
    # 6. Calculate recurrence metrics
    recurrence_count = len(dip_days)
    analysis_days = len(docs)
    confidence = recurrence_count / analysis_days
    
    # confidence threshold: < 0.30: skip
    if confidence < 0.30:
        await deactivate_pattern(db, store_id, zone_id, hour_slot)
        return
        
    avg_occupancy_pct = sum(float(doc.get("occupancy_ratio") or 0.0) for doc in dip_days) / len(dip_days)
    
    non_dip_docs = [doc for doc in docs if float(doc.get("occupancy_ratio") or 0.0) >= baseline * 0.60]
    baseline_occupancy = sum(float(doc.get("occupancy_ratio") or 0.0) for doc in non_dip_docs) / len(non_dip_docs) if non_dip_docs else 0.0
    
    expected_headcount = zone.get("expected_headcount") or 1
    try:
        expected_headcount = float(expected_headcount)
    except Exception:
        expected_headcount = 1.0
        
    lost_hours_list = []
    for doc in dip_days:
        idle_mins = float(doc.get("idle_minutes") or 0.0)
        lost_hours = (idle_mins / 60.0) * expected_headcount
        lost_hours_list.append(lost_hours)
    avg_lost_hours = sum(lost_hours_list) / len(lost_hours_list) if lost_hours_list else 0.0
    
    worker_category = zone.get("worker_category") or ""
    hourly_wage = _get_hourly_wage(factory, worker_category)
    
    monthly_cost_inr = avg_lost_hours * hourly_wage * recurrence_count
    
    dip_dates = []
    for d in dip_days:
        hb = d.get("hour_bucket")
        if isinstance(hb, datetime):
            dip_dates.append(hb)
        elif isinstance(hb, str):
            try:
                dt = datetime.fromisoformat(hb.replace("Z", "+00:00"))
                dip_dates.append(dt)
            except Exception:
                pass
                
    if dip_dates:
        first_seen = min(dip_dates)
        last_seen = max(dip_dates)
    else:
        first_seen = now
        last_seen = now
        
    active = True if last_seen >= now - timedelta(days=7) else False
    hour_label = _format_hour_label(hour_slot)
    ttl = int(now.timestamp()) + 7_776_000
    
    # 7. Upsert into pattern_flags
    await db.pattern_flags.update_one(
        {
            "store_id": store_id,
            "zone_id": zone_id,
            "hour_slot": hour_slot
        },
        {
            "$set": {
                "store_id": store_id,
                "zone_id": zone_id,
                "hour_slot": hour_slot,
                "zone_label": zone_label,
                "recurrence_count": recurrence_count,
                "analysis_days": analysis_days,
                "confidence": confidence,
                "avg_occupancy_pct": avg_occupancy_pct,
                "baseline_occupancy": baseline_occupancy,
                "avg_lost_hours": avg_lost_hours,
                "hourly_wage": hourly_wage,
                "monthly_cost_inr": monthly_cost_inr,
                "first_seen": first_seen,
                "last_seen": last_seen,
                "active": active,
                "hour_label": hour_label,
                "ttl": ttl,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    # Log: "Pattern store=X zone=Y hour=Z cost=W" for every pattern written
    logger.info("Pattern store=%s zone=%s hour=%d cost=%.2f", store_id, zone_id, hour_slot, monthly_cost_inr)


async def main():
    """Main execution loop for daily workstation dip aggregator."""
    logger.info("Starting workstation dip aggregator run")
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
            if not store_id:
                logger.warning("Skipping factory document missing store_id")
                continue
                
            # Get active work station zones for this store
            zones = await db.zone_config.find({
                "store_id": store_id,
                "active": True,
                "zone_type": "WORK_STATION"
            }).to_list(None)
            
            if not zones:
                zones = [{
                    'zone_id': 'default_floor',
                    'zone_name': 'Factory Floor'
                }]
                
            for zone in zones:
                zone_id = zone.get("zone_id")
                if not zone_id:
                    logger.warning("Skipping active zone config missing zone_id for store %s", store_id)
                    continue
                    
                # Process each hour slot 0-23
                try:
                    for hour_slot in range(24):
                        await process_zone_hour_pattern(db, factory, zone, hour_slot, now)
                    logger.info("Successfully processed store_id=%s zone_id=%s patterns", store_id, zone_id)
                except Exception as zone_err:
                    logger.error("Error processing patterns for store_id=%s zone_id=%s: %s", store_id, zone_id, zone_err, exc_info=True)
                    continue
                    
    except Exception as run_err:
        logger.critical("Critical error in workstation dip aggregator: %s", run_err, exc_info=True)
    finally:
        if client:
            client.close()
            logger.info("Database connection closed")
    logger.info("Finished workstation dip aggregator run")


if __name__ == "__main__":
    asyncio.run(main())
