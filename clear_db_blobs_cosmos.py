import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    load_dotenv("/home/retailiq-key/auris-server/.env")
    mongo_uri = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017"
    print("Connecting to:", mongo_uri)
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv("DB_NAME") or os.getenv("MONGODB_DB") or "auris"
    db = client[db_name]
    
    collections_to_drop = [
        "blobs",
        "calibration_frames",
        "hard_cases",
        "pseudo_labels",
        "training_frames"
    ]
    
    for coll in collections_to_drop:
        print(f"Dropping collection: {coll}...")
        await db.drop_collection(coll)
        print(f"Collection {coll} dropped!")
        
    print('Successfully cleared all large collections to free up Cosmos DB partition limit!')
    client.close()

if __name__ == '__main__':
    asyncio.run(run())
