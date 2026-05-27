"""
AURIS Cloud Server — FastAPI entrypoint (Phase 2).
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import db, ensure_indexes
from routes import (
    auth,
    admin,
    frames,
    calibration,
    cameras,
    alerts,
    training,
    report,
)
from routes.onboarding import router as onboarding_router
from routes.factory import router as factory_router
from routes.floormap import router as floormap_router
from routes.report_pdf import router as report_pdf_router
from routes.alerts import dispatch_camera_offline_alert
from services.auto_calibrator_job import run_auto_calibrator_loop

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("AurisCloud")

OFFLINE_THRESHOLD_SEC = int(os.getenv("CAMERA_OFFLINE_SEC", "120"))
AUTO_CALIB_INTERVAL_SEC = int(os.getenv("AUTO_CALIB_INTERVAL_SEC", "3600"))


async def check_offline_cameras():
    """Alert when edge heartbeats go stale."""
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=OFFLINE_THRESHOLD_SEC)).isoformat()
    async for hb in db.edge_heartbeats.find({}):
        last = hb.get("last_seen", "")
        if last and last < cutoff:
            await dispatch_camera_offline_alert(hb["store_id"], hb["camera_id"])


async def offline_camera_loop():
    while True:
        try:
            await check_offline_cameras()
        except Exception as e:
            logger.error("Offline camera check failed: %s", e)
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    logger.info("Cosmos indexes ensured")

    tasks = [
        asyncio.create_task(offline_camera_loop()),
        asyncio.create_task(run_auto_calibrator_loop(AUTO_CALIB_INTERVAL_SEC)),
        asyncio.create_task(frames.run_priority_queue_worker()),
    ]

    yield

    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="AURIS Cloud API", version="2.0.0", lifespan=lifespan)

# Define explicit allowed origins to solve W3C CORS preflight requirements when allow_credentials=True
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:8081",
    "http://localhost:19006",
    "https://hq.skymlabs.com",
    "https://auris.skymlabs.com",
    "https://www.auris.skymlabs.com",
]

env_origins = os.getenv("CORS_ORIGINS")
if env_origins:
    origins.extend(env_origins.split(","))

origins = list(set([o.strip() for o in origins if o.strip()]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin.router, prefix="/api")
app.include_router(frames.router)
app.include_router(calibration.router)
app.include_router(cameras.router)
app.include_router(alerts.router)
app.include_router(training.router)
app.include_router(report.router)
app.include_router(onboarding_router)
app.include_router(factory_router)
app.include_router(floormap_router)
app.include_router(report_pdf_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auris-server", "phase": 2, "db_timeout_count": frames.db_timeout_count}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)

