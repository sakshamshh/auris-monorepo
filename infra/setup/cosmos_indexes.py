"""
This script creates all required MongoDB collections and indexes
for the Auris Factory Intelligence module on Cosmos DB.

Run once manually: python3 infra/setup/cosmos_indexes.py
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import pymongo

# Resolve paths and load .env
def init_env():
    # Try multiple standard locations for .env
    load_dotenv()  # CWD
    load_dotenv("server/.env")  # server subdir in CWD
    
    script_dir = Path(__file__).resolve().parent
    current = script_dir
    for _ in range(4):
        env_path = current / ".env"
        if env_path.exists():
            load_dotenv(env_path)
        server_env = current / "server" / ".env"
        if server_env.exists():
            load_dotenv(server_env)
        current = current.parent

init_env()

# MongoDB URI and Database Configuration
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017"
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGODB_DB") or "auris"

# Mask URI for safe printing
def mask_uri(uri):
    if not uri:
        return ""
    try:
        if "@" in uri:
            prefix, rest = uri.split("://", 1)
            credentials, host = rest.split("@", 1)
            if ":" in credentials:
                user, password = credentials.split(":", 1)
                return f"{prefix}://{user}:****@{host}"
            return f"{prefix}://****@{host}"
    except Exception:
        pass
    return uri

print(f"Connecting to MongoDB...")
print(f"URI: {mask_uri(MONGO_URI)}")
print(f"Database: {DB_NAME}")

# Collections and Indexes Configuration
# Rules to follow:
# - Unique indexes: use sparse=True
# - TTL indexes: use pymongo.ASCENDING with expireAfterSeconds=0
# - Do not use background=True
# - Wrap everything in try/except

COLLECTIONS_SPEC = {
    "factory_config": {
        "indexes": [
            {"keys": [("store_id", pymongo.ASCENDING)], "options": {}},
            {"keys": [("status", pymongo.ASCENDING)], "options": {}},
            {"keys": [("trial_end", pymongo.ASCENDING)], "options": {}},
        ]
    },
    "zone_config": {
        "indexes": [
            {"keys": [("store_id", pymongo.ASCENDING), ("zone_id", pymongo.ASCENDING)], "options": {"unique": True, "sparse": True}},
            {"keys": [("store_id", pymongo.ASCENDING), ("zone_type", pymongo.ASCENDING)], "options": {}},
            {"keys": [("store_id", pymongo.ASCENDING), ("shift_id", pymongo.ASCENDING)], "options": {}},
        ]
    },
    "zone_hour_agg": {
        "indexes": [
            {"keys": [("ttl", pymongo.ASCENDING)], "options": {"expireAfterSeconds": 0}},
            {"keys": [("store_id", pymongo.ASCENDING), ("zone_id", pymongo.ASCENDING), ("hour_bucket", pymongo.ASCENDING)], "options": {"unique": True, "sparse": True}},
            {"keys": [("store_id", pymongo.ASCENDING), ("hour_bucket", pymongo.ASCENDING)], "options": {}},
            {"keys": [("store_id", pymongo.ASCENDING), ("zone_id", pymongo.ASCENDING), ("day_of_week", pymongo.ASCENDING), ("hour_of_day", pymongo.ASCENDING)], "options": {}},
            {"keys": [("store_id", pymongo.ASCENDING), ("bottleneck_flag", pymongo.ASCENDING), ("hour_bucket", pymongo.ASCENDING)], "options": {}},
        ]
    },
    "pattern_flags": {
        "indexes": [
            {"keys": [("ttl", pymongo.ASCENDING)], "options": {"expireAfterSeconds": 0}},
            {"keys": [("store_id", pymongo.ASCENDING), ("zone_id", pymongo.ASCENDING), ("hour_slot", pymongo.ASCENDING)], "options": {"unique": True, "sparse": True}},
            {"keys": [("store_id", pymongo.ASCENDING), ("active", pymongo.ASCENDING), ("monthly_cost_inr", pymongo.ASCENDING)], "options": {}},
        ]
    },
    "bottleneck_cache": {
        "indexes": [
            {"keys": [("store_id", pymongo.ASCENDING)], "options": {"unique": True, "sparse": True}},
            {"keys": [("computed_at", pymongo.ASCENDING)], "options": {}},
        ]
    },
    "whatsapp_log": {
        "indexes": [
            {"keys": [("ttl", pymongo.ASCENDING)], "options": {"expireAfterSeconds": 0}},
            {"keys": [("store_id", pymongo.ASCENDING), ("sent_at", pymongo.ASCENDING), ("message_type", pymongo.ASCENDING)], "options": {}},
            {"keys": [("store_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)], "options": {}},
        ]
    }
}

def format_index_keys(keys):
    return "{ " + ", ".join(f"{k}: {v}" for k, v in keys) + " }"

def index_exists(existing_indexes, target_keys):
    target_list = [(k, v) for k, v in target_keys]
    for name, info in existing_indexes.items():
        existing_keys = info.get("key", [])
        existing_list = [(k, v) for k, v in existing_keys]
        if existing_list == target_list:
            return True
    return False

def setup_cosmos_db():
    try:
        client = pymongo.MongoClient(MONGO_URI)
        db = client[DB_NAME]
    except Exception as e:
        print(f"Error connecting to Cosmos DB / MongoDB: {e}")
        sys.exit(1)

    try:
        existing_collections = db.list_collection_names()
    except Exception as e:
        print(f"Error listing collections: {e}")
        existing_collections = []

    for coll_name, spec in COLLECTIONS_SPEC.items():
        try:
            # 1. Create or skip collection
            if coll_name in existing_collections:
                print(f"→ Already exists: {coll_name}")
                coll = db[coll_name]
            else:
                try:
                    db.create_collection(coll_name)
                    print(f"✓ Created collection: {coll_name}")
                except Exception as e:
                    if "already exists" in str(e).lower() or "code 48" in str(e):
                        print(f"→ Already exists: {coll_name}")
                    else:
                        print(f"Error creating collection {coll_name}: {e}")
                coll = db[coll_name]

            # 2. Get existing indexes
            try:
                existing_indexes = coll.index_information()
            except Exception as e:
                existing_indexes = {}

            # 3. Create or skip indexes
            for idx_spec in spec["indexes"]:
                keys = idx_spec["keys"]
                options = idx_spec["options"]
                formatted_keys = format_index_keys(keys)

                if index_exists(existing_indexes, keys):
                    print(f"→ Index exists: {formatted_keys}")
                else:
                    try:
                        coll.create_index(keys, **options)
                        print(f"✓ Index created: {formatted_keys}")
                    except Exception as e:
                        print(f"Error creating index {formatted_keys} on {coll_name}: {e}")

        except Exception as e:
            print(f"Skipping rest of operations for collection {coll_name} due to unexpected error: {e}")

    print("All done.")

if __name__ == "__main__":
    setup_cosmos_db()
