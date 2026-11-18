# Real-Time Glass Bottle Crack Detection Using Computer Vision

An industrial quality-inspection web application for detecting crack-like defects in transparent glass bottles and jars under **controlled diffuse backlighting** using **classical Computer Vision** (without LLMs or black-box guessing).

## Experimental Setup Reference
- **Camera-to-Bottle Distance**: ~25 cm to 40 cm (fixed tripod / mount)
- **Bottle-to-Diffuser Distance**: ~18 cm
- **Illumination Conditions Supported**:
  - Medium red lighting
  - High-intensity cozy lighting / Medium-intensity cozy lighting
  - High-intensity warm lighting / Medium-intensity warm lighting
  - High-intensity normal lighting / Medium-intensity normal lighting

## Architecture
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React, Recharts
- **Live Server & CV Runtime (`server.ts` + `src/cv/pipeline.ts`)**: Express + Node `node:sqlite` + full 10-step classical Computer Vision pipeline (Grayscale, Gaussian Blur, Contrast Enhancement + CLAHE, Bottle ROI Segmentation, Adaptive Thresholding, Morphological Closing/Opening, Canny Edge Detection, Contour Analysis, Feature Extraction, Rule-Based Classification)
- **Standalone Python OpenCV Service (`backend/`)**: Complete FastAPI + OpenCV + NumPy + Pandas + Matplotlib + ReportLab service implementing the exact same pipeline for dedicated Python deployments.

## Running Locally

### 1. Frontend & Integrated Node Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000` and grant browser webcam permission when prompted.

### 2. Optional Standalone Python FastAPI + OpenCV Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Disclaimer on Heuristic Scores & Scope
All defect classifications (`NORMAL`, `SUSPECTED CRACK`, `MANUAL INSPECTION REQUIRED`) and heuristic scores (`0–100`) are computed deterministically from geometric contour features (area, major length, aspect ratio, Canny edge density). They are **not** machine-learning probabilities. The system is scoped for controlled diffuse backlighting and clear glass bottles/jars.
