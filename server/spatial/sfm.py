"""Lightweight SfM fallback for auto calibration (retail / zero-click)."""

import logging
from typing import Any, Dict, List, Optional
import base64
import cv2
import numpy as np

logger = logging.getLogger("AurisCloud.SfM")


def run_sfm_calibration(
    frames: List[Dict[str, Any]],
    origin_qr_payload: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Estimate relative camera poses from calibration frames.
    Returns {camera_id: {homography, confidence}} — simplified planar fit.
    """
    by_camera: Dict[str, List[np.ndarray]] = {}
    for doc in frames:
        cam = doc.get("camera_id", "unknown")
        b64 = doc.get("full_frame_b64")
        if not b64:
            continue
        try:
            raw = base64.b64decode(b64)
            img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if img is not None:
                by_camera.setdefault(cam, []).append(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
        except Exception as e:
            logger.warning("SfM skip frame: %s", e)

    orb = cv2.ORB_create(500)
    results: Dict[str, Any] = {}

    ref_cam = next(iter(by_camera.keys()), None)
    if not ref_cam or len(by_camera[ref_cam]) < 2:
        return {"status": "insufficient_frames", "cameras": {}}

    ref_kp, ref_desc = orb.detectAndCompute(by_camera[ref_cam][0], None)
    if ref_desc is None:
        return {"status": "no_features", "cameras": {}}

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    for cam_id, images in by_camera.items():
        if cam_id == ref_cam:
            results[cam_id] = {
                "homography": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                "confidence": 0.9,
                "method": "sfm_reference",
            }
            continue

        best_H = None
        best_matches = 0
        for img in images[:5]:
            kp, desc = orb.detectAndCompute(img, None)
            if desc is None:
                continue
            matches = bf.match(ref_desc, desc)
            matches = sorted(matches, key=lambda x: x.distance)[:50]
            if len(matches) < 8:
                continue

            src_pts = np.float32([ref_kp[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
            H, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            if H is not None and len(matches) > best_matches:
                best_H = H
                best_matches = len(matches)

        if best_H is not None:
            # Normalize to 0-1 image coords → rough metre plane (scale from QR if present)
            h, w = images[0].shape[:2]
            scale = np.array([[1 / w, 0, 0], [0, 1 / h, 0], [0, 0, 1]])
            H_norm = best_H @ scale
            results[cam_id] = {
                "homography": H_norm.tolist(),
                "confidence": min(0.92, 0.5 + best_matches / 100.0),
                "method": "sfm",
            }

    return {
        "status": "ok" if results else "failed",
        "cameras": results,
        "origin_qr": origin_qr_payload,
    }
