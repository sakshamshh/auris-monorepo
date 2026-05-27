"""
Cosmos DB (MongoDB API) connection and helpers.
"""

import os
import secrets
import bcrypt
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "mongodb://localhost:27017"
MONGODB_DB = os.getenv("MONGODB_DB") or os.getenv("DB_NAME") or "auris"
ADMIN_KEY = os.getenv("ADMIN_KEY", "")

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


class Database:
    """Namespace for collection accessors."""

    def __init__(self, database: AsyncIOMotorDatabase):
        self._db = database

    @property
    def stores(self):
        return self._db.stores

    @property
    def blobs(self):
        return self._db.blobs

    @property
    def calibration_frames(self):
        return self._db.calibration_frames

    @property
    def floors(self):
        return self._db.floors

    @property
    def mapping_scans(self):
        return self._db.mapping_scans

    @property
    def cameras(self):
        return self._db.cameras

    @property
    def ground_control_points(self):
        return self._db.ground_control_points

    @property
    def spatial_positions(self):
        return self._db.spatial_positions

    @property
    def heatmap_cells(self):
        return self._db.heatmap_cells

    @property
    def alerts(self):
        return self._db.alerts

    @property
    def hard_cases(self):
        return self._db.hard_cases

    @property
    def pseudo_labels(self):
        return self._db.pseudo_labels

    @property
    def person_embeddings(self):
        return self._db.person_embeddings

    @property
    def edge_heartbeats(self):
        return self._db.edge_heartbeats


    @property
    def audit_log(self):
        return self._db.audit_log

    @property
    def training_frames(self):
        return self._db.training_frames


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGODB_URI)
    return _client


def get_database() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_client()[MONGODB_DB]
    return _db


def get_db() -> AsyncIOMotorDatabase:
    """Helper to retrieve the raw motor database."""
    return get_database()


db = Database(get_database())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def generate_api_key() -> str:
    return f"sk_{secrets.token_urlsafe(32)}"


async def get_store_by_api_key(api_key: str) -> Optional[Dict[str, Any]]:
    return await db.stores.find_one({"api_key": api_key})


async def get_store_auth(store_id: str, password: str) -> Optional[Dict[str, Any]]:
    store = await db.stores.find_one({"store_id": store_id})
    if not store:
        return None
    if not verify_password(password, store.get("password_hash", "")):
        return None
    return store


async def ensure_indexes():
    """Create indexes for Phase 2 collections with Cosmos DB resilience."""
    import logging
    logger = logging.getLogger("AurisCloud.db")
    
    indexes = [
        ("stores", ["store_id"], {"unique": True}),
        ("stores", ["api_key"], {"unique": True, "sparse": True}),
        ("blobs", [("store_id", 1), ("timestamp", -1)], {}),
        ("blobs", [("store_id", 1), ("camera_id", 1)], {}),
        ("calibration_frames", [("store_id", 1), ("camera_id", 1), ("created_at", -1)], {}),
        ("floors", [("store_id", 1), ("floor_id", 1)], {"unique": True}),
        ("mapping_scans", [("store_id", 1), ("floor_id", 1), ("created_at", -1)], {}),
        ("cameras", [("store_id", 1), ("camera_id", 1)], {"unique": True}),
        ("ground_control_points", [("store_id", 1), ("camera_id", 1)], {}),
        ("spatial_positions", [("store_id", 1), ("floor_id", 1)], {"expireAfterSeconds": 300}),
        ("heatmap_cells", [("store_id", 1), ("floor_id", 1), ("date", 1)], {}),
        ("alerts", [("store_id", 1), ("created_at", -1)], {}),
        ("hard_cases", [("store_id", 1), ("status", 1)], {}),
        ("pseudo_labels", [("store_id", 1)], {}),
        ("training_frames", [("store_id", 1), ("camera_id", 1)], {}),
        ("edge_heartbeats", ["camera_key"], {"unique": True}),
        ("floormaps", [("store_id", 1), ("floor_id", 1)], {"unique": True}),
        ("audit_log", ["timestamp"], {"expireAfterSeconds": 90 * 24 * 60 * 60}),
    ]
    
    for coll_name, keys, kwargs in indexes:
        try:
            coll = getattr(db, coll_name)
            # Standardize single key indexes
            if len(keys) == 1 and isinstance(keys[0], str):
                await coll.create_index(keys[0], **kwargs)
            else:
                await coll.create_index(keys, **kwargs)
            logger.info("Created index on %s: %s %s", coll_name, keys, kwargs)
        except Exception as e:
            logger.warning("Could not create index on %s: %s (error: %s)", coll_name, keys, e)



COLLECTION_CAPS = {
    "hard_cases": 10_000,
    "pseudo_labels": 50_000,
    "training_frames": 5_000,
    "floormaps": 1_000,
}
