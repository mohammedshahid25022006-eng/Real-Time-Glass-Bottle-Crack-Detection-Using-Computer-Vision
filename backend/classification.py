import cv2
import numpy as np


def classify_and_annotate(
    original_bgr: np.ndarray,
    roi: tuple[int, int, int, int],
    accepted: list[dict],
    rejected: list[dict],
    config: dict,
) -> tuple[str, int, np.ndarray]:
    """
    Step 10: Rule-based classification (NORMAL, SUSPECTED CRACK, MANUAL INSPECTION REQUIRED)
    and red bounding-box rendering over suspected defect regions.
    """
    min_area = int(config.get("minContourArea", 48))
    min_len = float(config.get("minCrackLength", 26))
    crack_thresh = int(config.get("crackScoreThreshold", 55))
    manual_thresh = int(config.get("manualScoreThreshold", 28))

    if accepted:
        max_score = accepted[0]["heuristicScore"]
        total_area = sum(r["area"] for r in accepted)
        overall_score = min(
            100,
            int(round(max_score + min(18, (len(accepted) - 1) * 7) + min(10, total_area / 120.0))),
        )
    else:
        borderline = [
            int(round(r["heuristicScore"] * 0.65))
            for r in rejected
            if r["edgeDensity"] >= 0.03
            and r["area"] >= min_area * 0.55
            and r["length"] >= min_len * 0.65
        ]
        overall_score = min(100, max(borderline) if borderline else 0)

    if accepted and overall_score >= crack_thresh:
        classification = "SUSPECTED CRACK"
    elif accepted or overall_score >= manual_thresh:
        classification = "MANUAL INSPECTION REQUIRED"
    else:
        classification = "NORMAL"

    annotated = original_bgr.copy()
    rx, ry, rw, rh = roi
    cv2.rectangle(annotated, (rx, ry), (rx + rw, ry + rh), (233, 165, 14), 1)

    box_color = (38, 38, 220) if classification == "SUSPECTED CRACK" else (6, 119, 217)
    for reg in accepted:
        x, y, w, h = reg["x"], reg["y"], reg["width"], reg["height"]
        cv2.rectangle(annotated, (x, y), (x + w, y + h), box_color, 3)

    if classification == "MANUAL INSPECTION REQUIRED" and not accepted and rejected:
        top_cand = max(rejected, key=lambda r: r["heuristicScore"])
        cv2.rectangle(
            annotated,
            (top_cand["x"], top_cand["y"]),
            (top_cand["x"] + top_cand["width"], top_cand["y"] + top_cand["height"]),
            (6, 119, 217),
            2,
        )

    return classification, overall_score, annotated
