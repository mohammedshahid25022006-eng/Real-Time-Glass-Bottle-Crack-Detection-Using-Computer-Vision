import cv2
import numpy as np


def segment_bottle_roi(blurred: np.ndarray) -> tuple[int, int, int, int]:
    """
    Estimates uniform diffuse backlight intensity from image corners and locates the central glass bottle ROI.
    """
    h, w = blurred.shape
    pw = max(6, int(w * 0.08))
    ph = max(6, int(h * 0.08))
    corners = [
        blurred[0:ph, 0:pw],
        blurred[0:ph, w - pw : w],
        blurred[h - ph : h, 0:pw],
        blurred[h - ph : h, w - pw : w],
    ]
    bg_mean = float(np.mean([np.mean(c) for c in corners]))

    y0, y1 = int(h * 0.12), int(h * 0.88)
    region = blurred[y0:y1, :].astype(np.float32)
    grad_x = np.abs(np.diff(region, axis=1, prepend=region[:, :1]))
    col_score = np.mean(np.abs(region - bg_mean) * 0.6 + grad_x * 1.4, axis=0)
    col_thresh = max(6.0, float(np.max(col_score)) * 0.24)

    left = int(w * 0.18)
    right = int(w * 0.82)
    for x in range(int(w * 0.05), int(w * 0.45)):
        if col_score[x] > col_thresh:
            left = x
            break
    for x in range(int(w * 0.95), int(w * 0.55), -1):
        if col_score[x] > col_thresh:
            right = x
            break
    if right - left < int(w * 0.2):
        left, right = int(w * 0.22), int(w * 0.78)

    band = blurred[:, left : right + 1].astype(np.float32)
    grad_y = np.abs(np.diff(band, axis=0, prepend=band[:1, :]))
    row_score = np.mean(np.abs(band - bg_mean) * 0.6 + grad_y * 1.4, axis=1)
    row_thresh = max(5.0, float(np.max(row_score)) * 0.22)

    top = int(h * 0.08)
    bottom = int(h * 0.92)
    for y in range(int(h * 0.04), int(h * 0.40)):
        if row_score[y] > row_thresh:
            top = y
            break
    for y in range(int(h * 0.96), int(h * 0.60), -1):
        if row_score[y] > row_thresh:
            bottom = y
            break
    if bottom - top < int(h * 0.3):
        top, bottom = int(h * 0.10), int(h * 0.90)

    return left, top, max(20, right - left + 1), max(20, bottom - top + 1)


def segment_and_morphology(
    blurred: np.ndarray,
    enhanced: np.ndarray,
    threshold_value: int = 135,
    morph_kernel: int = 3,
) -> dict:
    """
    Steps 5-6: Bottle ROI segmentation, adaptive thresholding, and morphological closing/opening.
    """
    roi = segment_bottle_roi(blurred)
    c_bias = max(5, int(round(12 + (135 - threshold_value) * 0.16)))
    adaptive = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,
        19,
        c_bias,
    )
    _, global_mask = cv2.threshold(enhanced, min(250, threshold_value + 55), 255, cv2.THRESH_BINARY_INV)
    thresh_mask = cv2.bitwise_and(adaptive, global_mask)

    k = max(3, morph_kernel if morph_kernel % 2 == 1 else morph_kernel + 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    morph_mask = cv2.morphologyEx(thresh_mask, cv2.MORPH_CLOSE, kernel)
    if k >= 5:
        open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        morph_mask = cv2.morphologyEx(morph_mask, cv2.MORPH_OPEN, open_kernel)

    return {
        "roi": roi,
        "thresh_mask": thresh_mask,
        "morph_mask": morph_mask,
    }
