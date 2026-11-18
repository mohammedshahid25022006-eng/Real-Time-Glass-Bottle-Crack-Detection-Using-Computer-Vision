import io
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def export_csv(inspections: list[dict]) -> bytes:
    df = pd.DataFrame(inspections)
    return df.to_csv(index=False).encode("utf-8")


def export_excel(inspections: list[dict]) -> bytes:
    buf = io.BytesIO()
    df = pd.DataFrame(inspections)
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Inspections")
    return buf.getvalue()


def export_pdf(inspections: list[dict], processed_dir: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(44, 800, "Glass Bottle Crack Detection — Inspection Report")
    c.setFont("Helvetica", 10)
    y = 770
    for item in inspections[:15]:
        c.drawString(
            44,
            y,
            f"{item['id']} | {item['classification']} | Score: {item['heuristic_score']}/100 | {item['processing_time_ms']} ms",
        )
        img_path = os.path.join(processed_dir, item.get("processed_image_path", ""))
        if os.path.exists(img_path):
            c.drawImage(img_path, 400, y - 40, width=90, height=64)
        y -= 76
        if y < 90:
            c.showPage()
            y = 780
    c.save()
    return buf.getvalue()
