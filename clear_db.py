import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    client = AsyncIOMotorClient('mongodb://localhost:27017/')
    db = client['auris']
    await db.hard_cases.delete_many({})
    await db.pseudo_labels.delete_many({})
    await db.training_frames.delete_many({})
    print('Cleared')
    client.close()

if __name__ == '__main__':
    asyncio.run(run())
