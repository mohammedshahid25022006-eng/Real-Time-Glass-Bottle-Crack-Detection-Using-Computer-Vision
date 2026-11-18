import cv2
import numpy as np


def detect_edges_and_contours(
    enhanced: np.ndarray,
    morph_mask: np.ndarray,
    roi: tuple[int, int, int, int],
    canny_low: int = 42,
    canny_high: int = 118,
) -> dict:
    """
    Steps 7-8: Canny edge detection and interior bottle ROI contour extraction.
    """
    h, w = enhanced.shape
    edges = cv2.Canny(enhanced, canny_low, canny_high)

    rx, ry, rw, rh = roi
    inset_x = max(12, int(round(rw * 0.12)))
    inset_y_top = max(14, int(round(rh * 0.145)))
    inset_y_bot = max(10, int(round(rh * 0.08)))

    ix0 = max(4, rx + inset_x)
    ix1 = min(w - 5, rx + rw - inset_x)
    iy0 = max(4, ry + inset_y_top)
    iy1 = min(h - 5, ry + rh - inset_y_bot)

    roi_mask = np.zeros((h, w), dtype=np.uint8)
    roi_mask[iy0 : iy1 + 1, ix0 : ix1 + 1] = 255

    roi_edges = cv2.bitwise_and(edges, roi_mask)
    combined = cv2.bitwise_or(cv2.bitwise_and(morph_mask, roi_mask), roi_edges)
    grouped = cv2.dilate(combined, np.ones((3, 3), dtype=np.uint8), iterations=1)

    contours, _ = cv2.findContours(grouped, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    return {
        "canny_edges": edges,
        "roi_edges": roi_edges,
        "combined": combined,
        "contours": contours,
        "inner_roi": (ix0, iy0, ix1, iy1),
    }
