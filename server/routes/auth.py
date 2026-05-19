from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_store_auth

router = APIRouter()


class LoginRequest(BaseModel):
    store_id: str
    password: str


@router.post("/api/login")
async def login(body: LoginRequest):
    store = await get_store_auth(body.store_id.strip(), body.password)
    if not store:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "store_id": store["store_id"],
        "store_name": store.get("store_name", store["store_id"]),
    }
