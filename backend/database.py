import json
import os
import sqlite3
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "inspections.db")

DEFAULT_CONFIG = {
    "gaussianKernel": 5,
    "thresholdValue": 135,
    "cannyLow": 42,
    "cannyHigh": 118,
    "morphKernel": 3,
    "minContourArea": 48,
    "minCrackLength": 26,
    "contrastAlpha": 1.45,
    "minAspectRatio": 1.7,
    "edgeDensityThreshold": 0.08,
    "manualScoreThreshold": 28,
    "crackScoreThreshold": 55,
}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inspections (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL,
                classification TEXT NOT NULL,
                review_status TEXT NOT NULL,
                review_notes TEXT NOT NULL DEFAULT '',
                reviewed_at TEXT,
                heuristic_score INTEGER NOT NULL,
                defect_count INTEGER NOT NULL,
                processing_time_ms REAL NOT NULL,
                image_width INTEGER NOT NULL,
                image_height INTEGER NOT NULL,
                original_image_path TEXT NOT NULL,
                processed_image_path TEXT NOT NULL,
                lighting_condition TEXT NOT NULL,
                camera_distance_cm REAL NOT NULL,
                diffuser_distance_cm REAL NOT NULL,
                regions_json TEXT NOT NULL,
                rejected_json TEXT NOT NULL,
                bottle_roi_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                config_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        row = conn.execute("SELECT id FROM config WHERE id = 1").fetchone()
        if not row:
            conn.execute(
                "INSERT INTO config (id, config_json, updated_at) VALUES (1, ?, ?)",
                (json.dumps(DEFAULT_CONFIG), datetime.now(timezone.utc).isoformat()),
            )


def get_config() -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT config_json FROM config WHERE id = 1").fetchone()
        if not row:
            return dict(DEFAULT_CONFIG)
        return {**DEFAULT_CONFIG, **json.loads(row["config_json"])}


def save_config(cfg: dict) -> dict:
    merged = {**DEFAULT_CONFIG, **cfg}
    with get_conn() as conn:
        conn.execute(
            "UPDATE config SET config_json = ?, updated_at = ? WHERE id = 1",
            (json.dumps(merged), datetime.now(timezone.utc).isoformat()),
        )
    return merged
