import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    load_dotenv("/home/retailiq-key/auris-server/.env")
    mongo_uri = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017"
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.getenv("DB_NAME") or os.getenv("MONGODB_DB") or "auris"
    db = client[db_name]
    await db.drop_collection("hard_cases")
    await db.drop_collection("pseudo_labels")
    await db.drop_collection("training_frames")
    print('Cleared collections by dropping them!')
    client.close()

if __name__ == '__main__':
    asyncio.run(run())
