import math
import cv2
import numpy as np


def _describe_location(cx: float, cy: float, roi: tuple[int, int, int, int]) -> str:
    rx, ry, rw, rh = roi
    rel_x = (cx - rx) / max(1.0, float(rw))
    rel_y = (cy - ry) / max(1.0, float(rh))
    v_zone = (
        "Upper Shoulder / Neck"
        if rel_y < 0.28
        else "Mid Body Wall"
        if rel_y < 0.68
        else "Lower Base Wall"
    )
    h_zone = "Left" if rel_x < 0.36 else "Right" if rel_x > 0.64 else "Center"
    return f"{v_zone} ({h_zone})"


def extract_defect_features(
    contours,
    combined_mask: np.ndarray,
    roi_edges: np.ndarray,
    roi: tuple[int, int, int, int],
    config: dict,
) -> tuple[list[dict], list[dict]]:
    """
    Step 9: Extracts geometric and edge-density features and filters out false positives.
    """
    h, w = combined_mask.shape
    min_area = int(config.get("minContourArea", 48))
    min_len = float(config.get("minCrackLength", 26))
    edge_thresh = float(config.get("edgeDensityThreshold", 0.08))
    min_ar = float(config.get("minAspectRatio", 1.7))

    accepted = []
    rejected = []
    next_id = 1

    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        patch_comb = combined_mask[y : y + bh, x : x + bw]
        patch_edge = roi_edges[y : y + bh, x : x + bw]

        raw_area = int(np.count_nonzero(patch_comb))
        if raw_area < 6:
            continue

        edge_hits = int(np.count_nonzero(patch_edge))
        bbox_area = max(1, bw * bh)
        major_len = math.hypot(bw, bh)
        minor_w = max(1, min(bw, bh))
        aspect_ratio = round(max(bw, bh) / minor_w, 2)
        edge_density = round(edge_hits / bbox_area, 3)
        solidity = round(raw_area / bbox_area, 3)
        thickness = round(raw_area / max(1.0, major_len), 2)

        cx = x + bw / 2.0
        cy = y + bh / 2.0
        location = _describe_location(cx, cy, roi)

        if aspect_ratio >= 2.2 and thickness <= 10:
            shape = "Elongated Hairline Crack"
        elif raw_area > min_area * 4 and edge_hits > 35:
            shape = "Branching / Shattered Fracture"
        elif solidity > 0.68 and aspect_ratio < 1.35:
            shape = "Compact Blob / Droplet"
        else:
            shape = "Irregular Fracture"

        len_score = min(35.0, (major_len / max(1.0, min_len)) * 20.0)
        area_score = min(25.0, (raw_area / max(1.0, float(min_area))) * 14.0)
        elong_score = min(20.0, aspect_ratio * 6.5)
        cont_score = min(20.0, (12.0 if edge_hits >= 12 else 4.0 if edge_hits > 0 else 0.0) + 8.0)
        region_score = min(100, int(round(len_score + area_score + elong_score + cont_score)))

        reason = None
        if raw_area < min_area:
            reason = f"Area {raw_area}px² < min {min_area}px²"
        elif major_len < min_len:
            reason = f"Length {major_len:.1f}px < min {min_len}px"
        elif edge_hits < 10 or (edge_density < edge_thresh and edge_hits < 24):
            reason = f"Low Canny edge density ({edge_density}, {edge_hits} edge px)"
        elif solidity > 0.72 and aspect_ratio < min(1.4, min_ar * 0.75) and raw_area < min_area * 3.5:
            reason = f"Compact circular shape (AR {aspect_ratio})"

        item = {
            "id": next_id,
            "x": max(0, x - 4),
            "y": max(0, y - 4),
            "width": min(w - max(0, x - 4), bw + 8),
            "height": min(h - max(0, y - 4), bh + 8),
            "area": raw_area,
            "aspectRatio": aspect_ratio,
            "length": round(major_len, 1),
            "widthPx": thickness,
            "edgeDensity": edge_density,
            "solidity": solidity,
            "shapeCharacteristics": shape,
            "regionLocation": location,
            "heuristicScore": region_score,
            "accepted": reason is None,
            "rejectionReason": reason,
        }
        next_id += 1

        if reason is None:
            accepted.append(item)
        else:
            rejected.append(item)

    accepted.sort(key=lambda r: r["heuristicScore"], reverse=True)
    return accepted, rejected[:12]
