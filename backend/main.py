import base64
import json
import os
import time
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from classification import classify_and_annotate
from database import get_config, get_conn, init_db, save_config
from detection import detect_edges_and_contours
from feature_extraction import extract_defect_features
from preprocessing import preprocess_image
from report_generator import export_csv, export_excel, export_pdf
from segmentation import segment_and_morphology

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
PROCESSED_DIR = os.path.join(BASE_DIR, "processed_images")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

init_db()

app = FastAPI(title="GlassGuard CV — FastAPI OpenCV Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _decode_base64_image(data_url: str) -> np.ndarray:
    encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
    arr = np.frombuffer(base64.b64decode(encoded), dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Unable to decode image bytes")
    return img


def _encode_png_data_url(bgr_or_gray: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", bgr_or_gray)
    if not ok:
        raise ValueError("Failed to encode PNG")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _run_full_pipeline(bgr: np.ndarray, cfg: dict):
    t0 = time.perf_counter()
    prep = preprocess_image(
        bgr,
        gaussian_kernel=int(cfg["gaussianKernel"]),
        contrast_alpha=float(cfg["contrastAlpha"]),
    )
    seg = segment_and_morphology(
        prep["blurred"],
        prep["enhanced"],
        threshold_value=int(cfg["thresholdValue"]),
        morph_kernel=int(cfg["morphKernel"]),
    )
    det = detect_edges_and_contours(
        prep["enhanced"],
        seg["morph_mask"],
        seg["roi"],
        canny_low=int(cfg["cannyLow"]),
        canny_high=int(cfg["cannyHigh"]),
    )
    accepted, rejected = extract_defect_features(
        det["contours"],
        det["combined"],
        det["roi_edges"],
        seg["roi"],
        cfg,
    )
    classification, score, annotated = classify_and_annotate(
        prep["original"],
        seg["roi"],
        accepted,
        rejected,
        cfg,
    )
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return {
        "classification": classification,
        "heuristicScore": score,
        "defectCount": len(accepted),
        "processingTimeMs": elapsed_ms,
        "imageWidth": int(prep["original"].shape[1]),
        "imageHeight": int(prep["original"].shape[0]),
        "bottleRoi": {
            "x": seg["roi"][0],
            "y": seg["roi"][1],
            "width": seg["roi"][2],
            "height": seg["roi"][3],
        },
        "regions": accepted,
        "rejectedCandidates": rejected,
        "original": prep["original"],
        "annotated": annotated,
    }


@app.post("/api/inspect/image")
async def inspect_image(
    image: UploadFile = File(...),
    lightingCondition: str = Form("High-intensity normal lighting"),
    cameraDistanceCm: float = Form(25.0),
    diffuserDistanceCm: float = Form(18.0),
):
    raw_bytes = await image.read()
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    cfg = get_config()
    out = _run_full_pipeline(bgr, cfg)
    with get_conn() as conn:
        cnt = conn.execute("SELECT COUNT(*) FROM inspections").fetchone()[0]
        insp_id = f"INSP-{1001 + cnt}"
        orig_name = f"{insp_id}_orig.png"
        proc_name = f"{insp_id}_proc.png"
        cv2.imwrite(os.path.join(UPLOADS_DIR, orig_name), out["original"])
        cv2.imwrite(os.path.join(PROCESSED_DIR, proc_name), out["annotated"])
        now_iso = datetime.now(timezone.utc).isoformat()
        review_status = "MARKED NORMAL" if out["classification"] == "NORMAL" else "PENDING"
        conn.execute(
            """
            INSERT INTO inspections (
                id, created_at, source, classification, review_status, review_notes, reviewed_at,
                heuristic_score, defect_count, processing_time_ms, image_width, image_height,
                original_image_path, processed_image_path, lighting_condition, camera_distance_cm,
                diffuser_distance_cm, regions_json, rejected_json, bottle_roi_json
            ) VALUES (?, ?, 'upload', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                insp_id,
                now_iso,
                out["classification"],
                review_status,
                now_iso if review_status != "PENDING" else None,
                out["heuristicScore"],
                out["defectCount"],
                out["processingTimeMs"],
                out["imageWidth"],
                out["imageHeight"],
                orig_name,
                proc_name,
                lightingCondition,
                cameraDistanceCm,
                diffuserDistanceCm,
                json.dumps(out["regions"]),
                json.dumps(out["rejectedCandidates"]),
                json.dumps(out["bottleRoi"]),
            ),
        )
    return {
        "id": insp_id,
        "classification": out["classification"],
        "heuristicScore": out["heuristicScore"],
        "defectCount": out["defectCount"],
        "processingTimeMs": out["processingTimeMs"],
        "regions": out["regions"],
        "processedImageDataUrl": _encode_png_data_url(out["annotated"]),
    }


@app.post("/api/inspect/frame")
@app.post("/api/camera/process")
async def inspect_frame(payload: dict):
    data_url = payload.get("frameDataUrl") or payload.get("imageDataUrl")
    if not data_url:
        raise HTTPException(status_code=400, detail="Missing frameDataUrl")
    bgr = _decode_base64_image(data_url)
    out = _run_full_pipeline(bgr, get_config())
    return {
        "classification": out["classification"],
        "heuristicScore": out["heuristicScore"],
        "defectCount": out["defectCount"],
        "processingTimeMs": out["processingTimeMs"],
        "imageWidth": out["imageWidth"],
        "imageHeight": out["imageHeight"],
        "bottleRoi": out["bottleRoi"],
        "regions": out["regions"],
        "rejectedCandidates": out["rejectedCandidates"],
        "processedImageDataUrl": _encode_png_data_url(out["annotated"]),
    }


@app.get("/api/config")
def api_get_config():
    return get_config()


@app.post("/api/config")
def api_save_config(payload: dict):
    return save_config(payload)


@app.get("/api/inspection/history")
def api_history():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM inspections ORDER BY created_at DESC").fetchall()
        return {"items": [dict(r) for r in rows]}


@app.get("/api/reports/csv")
def api_csv():
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM inspections ORDER BY created_at DESC").fetchall()]
    return Response(content=export_csv(rows), media_type="text/csv")


@app.get("/api/reports/excel")
def api_excel():
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM inspections ORDER BY created_at DESC").fetchall()]
    return Response(
        content=export_excel(rows),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/reports/pdf")
def api_pdf():
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM inspections ORDER BY created_at DESC").fetchall()]
    return Response(content=export_pdf(rows, PROCESSED_DIR), media_type="application/pdf")
