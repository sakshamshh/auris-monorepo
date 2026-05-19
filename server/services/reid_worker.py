"""
Re-ID worker: optional OSNet embeddings, cosine match → global_track_id.
"""

import asyncio
import base64
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from db import db

logger = logging.getLogger("AurisCloud.ReID")

REID_ENABLED = os.getenv("REID_ENABLED", "false").lower() == "true"
SIM_THRESHOLD = float(os.getenv("REID_SIMILARITY_THRESHOLD", "0.7"))
BATCH_SIZE = int(os.getenv("REID_BATCH_SIZE", "20"))

_osnet_model = None
_osnet_extract = None


def _load_osnet():
    global _osnet_model, _osnet_extract
    if _osnet_model is not None:
        return True
    try:
        import torch
        from torchreid.reid.models import build_model
        from torchreid.reid.utils import FeatureExtractor

        model = build_model(name="osnet_x1_0", num_classes=1, pretrained=True)
        model.eval()
        _osnet_model = model
        _osnet_extract = FeatureExtractor(
            model_name="osnet_x1_0",
            model_path="",
            device="cuda" if torch.cuda.is_available() else "cpu",
        )
        logger.info("OSNet loaded for Re-ID")
        return True
    except Exception as e:
        logger.warning("OSNet unavailable, using colour histogram fallback: %s", e)
        return False


def _embed_crop(jpeg_b64: Optional[str], bbox: List[float]) -> Optional[np.ndarray]:
    if jpeg_b64:
        raw = base64.b64decode(jpeg_b64)
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is not None and _osnet_extract is not None:
            try:
                feats = _osnet_extract([img])
                vec = feats[0] if hasattr(feats, "__getitem__") else feats
                arr = np.asarray(vec, dtype=np.float32).flatten()
                norm = np.linalg.norm(arr)
                return arr / norm if norm > 1e-6 else arr
            except Exception as e:
                logger.debug("OSNet embed failed: %s", e)

    if jpeg_b64:
        raw = base64.b64decode(jpeg_b64)
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            small = cv2.resize(img, (32, 64))
            hist = cv2.calcHist([small], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
            arr = hist.flatten().astype(np.float32)
            norm = np.linalg.norm(arr)
            return arr / norm if norm > 1e-6 else arr
    return None


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


async def _find_global_match(store_id: str, embedding: np.ndarray) -> Optional[str]:
    best_id = None
    best_sim = SIM_THRESHOLD
    async for doc in db.person_embeddings.find({"store_id": store_id}).limit(500):
        stored = doc.get("embedding")
        if not stored:
            continue
        sim = _cosine(embedding, np.array(stored, dtype=np.float32))
        if sim > best_sim:
            best_sim = sim
            best_id = doc.get("global_track_id")
    return best_id


async def process_reid_item(item: dict) -> None:
    store_id = item["store_id"]
    track_id = item["track_id"]
    embedding = _embed_crop(item.get("jpeg_b64"), item.get("bbox", []))

    global_id = f"{store_id}_{track_id}"
    if embedding is not None:
        match = await _find_global_match(store_id, embedding)
        if match:
            global_id = match
        else:
            await db.person_embeddings.insert_one({
                "store_id": store_id,
                "global_track_id": global_id,
                "embedding": embedding.tolist(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    await db.spatial_positions.update_one(
        {"store_id": store_id, "track_id": track_id},
        {"$set": {"global_track_id": global_id}},
    )
    await db.reid_queue.update_one(
        {"_id": item["_id"]},
        {"$set": {"status": "done", "global_track_id": global_id}},
    )


async def run_reid_worker_loop():
    if not REID_ENABLED:
        return

    _load_osnet()

    while True:
        try:
            pending = []
            async for doc in db.reid_queue.find({"status": "pending"}).limit(BATCH_SIZE):
                pending.append(doc)
            for item in pending:
                try:
                    await process_reid_item(item)
                except Exception as e:
                    logger.error("ReID item %s failed: %s", item.get("_id"), e)
                    await db.reid_queue.update_one(
                        {"_id": item["_id"]},
                        {"$set": {"status": "error", "error": str(e)}},
                    )
        except Exception as e:
            logger.error("ReID worker loop error: %s", e)
        await asyncio.sleep(2)
