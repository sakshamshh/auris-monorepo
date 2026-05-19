"""Pixel ↔ metre homography helpers for LDM ground control."""

from typing import List, Tuple, Optional
import numpy as np
import cv2


def solve_homography(
    points: List[dict],
    rmse_threshold: float = 0.5,
) -> Tuple[Optional[List[List[float]]], float, str]:
    """
    points: [{px, py, x_m, y_m}] with px,py normalized 0-1
    Returns (3x3 matrix as nested list, rmse_m, error_message)
    """
    if len(points) < 4:
        return None, 0.0, "At least 4 ground control points required"

    src = np.array([[p["px"], p["py"]] for p in points], dtype=np.float32)
    dst = np.array([[p["x_m"], p["y_m"]] for p in points], dtype=np.float32)

    if _are_collinear(src) or _are_collinear(dst):
        return None, 0.0, "Points are collinear; spread across the floor"

    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    if H is None:
        return None, 0.0, "Homography solve failed"

    rmse = _compute_rmse(H, src, dst)
    if rmse > rmse_threshold:
        return None, rmse, f"RMSE {rmse:.2f}m exceeds threshold {rmse_threshold}m"

    return H.tolist(), rmse, ""


def _are_collinear(pts: np.ndarray, tol: float = 1e-4) -> bool:
    if len(pts) < 3:
        return True
    v1 = pts[1] - pts[0]
    for i in range(2, len(pts)):
        v2 = pts[i] - pts[0]
        cross = abs(v1[0] * v2[1] - v1[1] * v2[0])
        if cross > tol:
            return False
    return True


def _compute_rmse(H: np.ndarray, src: np.ndarray, dst: np.ndarray) -> float:
    errs = []
    for i in range(len(src)):
        p = np.array([src[i, 0], src[i, 1], 1.0])
        mapped = H @ p
        mapped /= mapped[2]
        errs.append((mapped[0] - dst[i, 0]) ** 2 + (mapped[1] - dst[i, 1]) ** 2)
    return float(np.sqrt(np.mean(errs)))


def norm_to_metres(H: List[List[float]], cx: float, cy: float) -> Tuple[float, float]:
    """Convert normalized centroid to floor metres."""
    mat = np.array(H, dtype=np.float64)
    p = np.array([cx, cy, 1.0])
    out = mat @ p
    out /= out[2]
    return float(out[0]), float(out[1])


def detect_qr_scale(image_bgr: np.ndarray, qr_size_cm: float = 29.7) -> Optional[dict]:
    """Detect QR in frame; return corners and scale hint."""
    detector = cv2.QRCodeDetector()
    data, points, _ = detector.detectAndDecode(image_bgr)
    if points is None or len(points) == 0:
        return None

    pts = points[0].astype(np.float32)
    side_px = np.mean([
        np.linalg.norm(pts[0] - pts[1]),
        np.linalg.norm(pts[1] - pts[2]),
        np.linalg.norm(pts[2] - pts[3]),
        np.linalg.norm(pts[3] - pts[0]),
    ])
    scale_m_per_px = (qr_size_cm / 100.0) / max(side_px, 1e-6)
    return {
        "payload": data,
        "corners": pts.tolist(),
        "scale_m_per_px": scale_m_per_px,
    }
