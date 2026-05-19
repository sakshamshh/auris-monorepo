import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from db import db, get_store_auth

router = APIRouter()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


@router.get("/api/report")
async def daily_report(request: Request):
    store_id = request.headers.get("X-Store-ID", "")
    password = request.headers.get("X-Password", "")
    store = await get_store_auth(store_id, password)
    if not store:
        raise HTTPException(status_code=401, detail="Unauthorized")

    sid = store["store_id"]
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"store_id": sid, "timestamp": {"$gte": today_start.isoformat()}}},
        {"$group": {
            "_id": "$camera_id",
            "entries": {"$sum": {"$size": {"$ifNull": ["$crossings", []]}}},
            "peak_people": {"$max": "$people_now"},
        }},
    ]
    cam_stats = []
    async for row in db.blobs.aggregate(pipeline):
        cam_stats.append(row)

    zones = []
    async for z in db.heatmap_cells.find({"store_id": sid}).sort("count", -1).limit(5):
        zones.append(f"grid ({z.get('gx')},{z.get('gy')}): {z.get('count', 0)} hits")

    spatial_ctx = f"Spatial heat peaks: {', '.join(zones) if zones else 'No spatial data yet'}"

    if not GROQ_API_KEY:
        return {
            "report": f"Daily summary for {store.get('store_name', sid)}. {spatial_ctx}",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "ai": False,
        }

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        ai_inst = store.get("ai_instructions", "")
        prompt = f"""Write a concise retail/factory daily report for store {sid}.
Camera stats: {cam_stats}
{spatial_ctx}
{f'Additional custom instructions: {ai_inst}' if ai_inst else 'Include footfall insights, peak hours, and spatial zone recommendations.'}
3 short paragraphs."""

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
        )
        text = completion.choices[0].message.content
    except Exception as e:
        text = f"Report generation failed: {e}. {spatial_ctx}"

    return {
        "report": text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ai": True,
    }
