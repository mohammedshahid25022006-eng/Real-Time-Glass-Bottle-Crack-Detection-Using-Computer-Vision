import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  addDatasetItem,
  computeDashboardStats,
  DATASET_DIR,
  deleteDatasetItem,
  getConfig,
  getInspectionById,
  getNextInspectionId,
  getSettings,
  initDatabase,
  listDatasetItems,
  listInspections,
  PROCESSED_DIR,
  saveConfig,
  saveInspectionRecord,
  saveSettings,
  updateInspectionReview,
  UPLOADS_DIR,
} from './server/database.ts';
import {
  generateCsvReport,
  generateExcelReportBuffer,
  generatePdfReportBuffer,
} from './server/reports.ts';
import {
  decodeDataUrl,
  decodeImageBuffer,
  encodePngBuffer,
  encodePngDataUrl,
} from './src/cv/imageCodec.ts';
import { RawImageData, runGlassCrackPipeline } from './src/cv/pipeline.ts';
import {
  AppSettings,
  CVCalibrationConfig,
  DatasetClass,
  DEFAULT_CV_CONFIG,
  InspectionResult,
  LightingCondition,
  ReviewStatus,
  ValidationRow,
} from './src/types/inspection.ts';
import {
  computeValidationMetrics,
  evaluateOutcome,
  isDefectiveGroundTruth,
  isPositivePrediction,
} from './src/utils/metrics.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static media routes for stored original, processed, and dataset images
app.use('/media/uploads', express.static(UPLOADS_DIR));
app.use('/media/processed', express.static(PROCESSED_DIR));
app.use('/media/dataset', express.static(DATASET_DIR));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function resolveRawImageFromRequest(
  file?: Express.Multer.File,
  imageDataUrl?: string,
  datasetId?: string
): RawImageData {
  if (file) {
    return decodeImageBuffer(file.buffer, file.originalname);
  }
  if (imageDataUrl) {
    return decodeDataUrl(imageDataUrl);
  }
  if (datasetId) {
    const items = listDatasetItems();
    const match = items.find((d) => d.id === datasetId);
    if (!match) throw new Error(`Dataset sample ${datasetId} not found`);
    const filename = match.imageUrl.split('/').pop()!;
    const buf = fs.readFileSync(path.join(DATASET_DIR, filename));
    return decodeImageBuffer(buf, filename);
  }
  throw new Error('No image file, imageDataUrl, or datasetId provided');
}

// 1. Upload / Analyze Static Image & Save to SQLite
app.post('/api/inspect/image', upload.single('image'), (req, res) => {
  try {
    const raw = resolveRawImageFromRequest(
      req.file,
      req.body?.imageDataUrl,
      req.body?.datasetId
    );
    const cfg = getConfig();
    const includeSteps = req.body?.includeSteps === 'true' || req.body?.includeSteps === true;
    const lightingCondition = (req.body?.lightingCondition ||
      getSettings().defaultLightingCondition) as LightingCondition;
    const cameraDistanceCm = Number(req.body?.cameraDistanceCm || getSettings().cameraDistanceCm);
    const diffuserDistanceCm = Number(
      req.body?.diffuserDistanceCm || getSettings().diffuserDistanceCm
    );
    const source = (req.body?.source || 'upload') as InspectionResult['source'];

    const output = runGlassCrackPipeline(raw, cfg, includeSteps);
    const id = getNextInspectionId();
    const origName = `${id}_orig.png`;
    const procName = `${id}_proc.png`;

    fs.writeFileSync(path.join(UPLOADS_DIR, origName), encodePngBuffer(raw));
    fs.writeFileSync(
      path.join(PROCESSED_DIR, procName),
      encodePngBuffer({
        width: output.imageWidth,
        height: output.imageHeight,
        data: output.processedRgba,
      })
    );

    const createdAt = new Date().toISOString();
    const reviewStatus: ReviewStatus =
      output.classification === 'NORMAL' ? 'MARKED NORMAL' : 'PENDING';

    saveInspectionRecord({
      id,
      createdAt,
      source,
      classification: output.classification,
      reviewStatus,
      reviewNotes: '',
      reviewedAt: reviewStatus === 'PENDING' ? null : createdAt,
      heuristicScore: output.heuristicScore,
      defectCount: output.defectCount,
      processingTimeMs: output.processingTimeMs,
      imageWidth: output.imageWidth,
      imageHeight: output.imageHeight,
      originalImagePath: origName,
      processedImagePath: procName,
      lightingCondition,
      cameraDistanceCm,
      diffuserDistanceCm,
      regions: output.regions,
      rejectedCandidates: output.rejectedCandidates,
      bottleRoi: output.bottleRoi,
    });

    const saved = getInspectionById(id)!;
    if (output.steps) {
      saved.pipelineSteps = output.steps.map((s) => ({
        step: s.step,
        title: s.title,
        description: s.description,
        stats: s.stats,
        imageDataUrl: encodePngDataUrl({
          width: output.imageWidth,
          height: output.imageHeight,
          data: s.rgba,
        }),
      }));
    }

    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Image inspection failed' });
  }
});

// 2. Live Camera Frame Processing (and /api/camera/process alias)
function handleFrameInspection(req: express.Request, res: express.Response) {
  try {
    const frameDataUrl = req.body?.frameDataUrl || req.body?.imageDataUrl;
    if (!frameDataUrl) {
      res.status(400).json({ error: 'Missing frameDataUrl' });
      return;
    }
    const raw = decodeDataUrl(frameDataUrl);
    const cfg = getConfig();
    const output = runGlassCrackPipeline(raw, cfg, false);

    const processedImageDataUrl = encodePngDataUrl({
      width: output.imageWidth,
      height: output.imageHeight,
      data: output.processedRgba,
    });

    let savedInspection: InspectionResult | null = null;
    if (req.body?.save === true) {
      const id = getNextInspectionId();
      const origName = `${id}_orig.png`;
      const procName = `${id}_proc.png`;
      fs.writeFileSync(path.join(UPLOADS_DIR, origName), encodePngBuffer(raw));
      fs.writeFileSync(
        path.join(PROCESSED_DIR, procName),
        encodePngBuffer({
          width: output.imageWidth,
          height: output.imageHeight,
          data: output.processedRgba,
        })
      );
      const settings = getSettings();
      const createdAt = new Date().toISOString();
      const reviewStatus: ReviewStatus =
        output.classification === 'NORMAL' ? 'MARKED NORMAL' : 'PENDING';
      saveInspectionRecord({
        id,
        createdAt,
        source: 'camera',
        classification: output.classification,
        reviewStatus,
        reviewNotes: '',
        reviewedAt: reviewStatus === 'PENDING' ? null : createdAt,
        heuristicScore: output.heuristicScore,
        defectCount: output.defectCount,
        processingTimeMs: output.processingTimeMs,
        imageWidth: output.imageWidth,
        imageHeight: output.imageHeight,
        originalImagePath: origName,
        processedImagePath: procName,
        lightingCondition: (req.body?.lightingCondition ||
          settings.defaultLightingCondition) as LightingCondition,
        cameraDistanceCm: Number(req.body?.cameraDistanceCm || settings.cameraDistanceCm),
        diffuserDistanceCm: Number(req.body?.diffuserDistanceCm || settings.diffuserDistanceCm),
        regions: output.regions,
        rejectedCandidates: output.rejectedCandidates,
        bottleRoi: output.bottleRoi,
      });
      savedInspection = getInspectionById(id);
    }

    res.json({
      classification: output.classification,
      heuristicScore: output.heuristicScore,
      defectCount: output.defectCount,
      processingTimeMs: output.processingTimeMs,
      imageWidth: output.imageWidth,
      imageHeight: output.imageHeight,
      bottleRoi: output.bottleRoi,
      regions: output.regions,
      rejectedCandidates: output.rejectedCandidates,
      processedImageDataUrl,
      savedInspection,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Frame processing failed' });
  }
}

app.post('/api/inspect/frame', handleFrameInspection);
app.post('/api/camera/process', handleFrameInspection);

// 3. Interactive Pipeline Preview (for 10-Step Agent & Live Calibration Sliders)
app.post('/api/pipeline/preview', upload.single('image'), (req, res) => {
  try {
    const raw = resolveRawImageFromRequest(
      req.file,
      req.body?.imageDataUrl,
      req.body?.datasetId
    );
    const baseCfg = getConfig();
    const overrideCfg: CVCalibrationConfig = {
      ...baseCfg,
      ...(req.body?.config || {}),
    };
    const includeSteps = req.body?.includeSteps !== false;
    const output = runGlassCrackPipeline(raw, overrideCfg, includeSteps);

    const processedImageDataUrl = encodePngDataUrl({
      width: output.imageWidth,
      height: output.imageHeight,
      data: output.processedRgba,
    });

    const originalImageDataUrl = encodePngDataUrl(raw);

    res.json({
      classification: output.classification,
      heuristicScore: output.heuristicScore,
      defectCount: output.defectCount,
      processingTimeMs: output.processingTimeMs,
      imageWidth: output.imageWidth,
      imageHeight: output.imageHeight,
      bottleRoi: output.bottleRoi,
      regions: output.regions,
      rejectedCandidates: output.rejectedCandidates,
      originalImageDataUrl,
      processedImageDataUrl,
      pipelineSteps: output.steps?.map((s) => ({
        step: s.step,
        title: s.title,
        description: s.description,
        stats: s.stats,
        imageDataUrl: encodePngDataUrl({
          width: output.imageWidth,
          height: output.imageHeight,
          data: s.rgba,
        }),
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Preview failed' });
  }
});

// 4. Inspection History & Single Record & Manual Review
app.get('/api/inspection/history', (req, res) => {
  const items = listInspections({
    classification: req.query.classification ? String(req.query.classification) : undefined,
    reviewStatus: req.query.reviewStatus ? String(req.query.reviewStatus) : undefined,
    date: req.query.date ? String(req.query.date) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json({ items });
});

app.get('/api/inspection/:id', (req, res) => {
  const item = getInspectionById(req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Inspection record not found' });
    return;
  }
  res.json(item);
});

app.post('/api/inspection/review', (req, res) => {
  const { id, reviewStatus, reviewNotes } = req.body || {};
  const allowed: ReviewStatus[] = [
    'PENDING',
    'CONFIRMED DEFECT',
    'MARKED NORMAL',
    'REINSPECTION REQUESTED',
  ];
  if (!id || !allowed.includes(reviewStatus)) {
    res.status(400).json({ error: 'Valid id and reviewStatus are required' });
    return;
  }
  const updated = updateInspectionReview(String(id), reviewStatus, String(reviewNotes || ''));
  if (!updated) {
    res.status(404).json({ error: 'Inspection record not found' });
    return;
  }
  res.json(updated);
});

// 5. Dashboard Statistics
app.get('/api/dashboard/statistics', (_req, res) => {
  res.json(computeDashboardStats());
});

// 6. Calibration Config & App Settings
app.get('/api/config', (_req, res) => {
  res.json(getConfig());
});

app.post('/api/config', (req, res) => {
  const next: CVCalibrationConfig = {
    ...DEFAULT_CV_CONFIG,
    ...getConfig(),
    ...(req.body || {}),
  };
  res.json(saveConfig(next));
});

app.get('/api/settings', (_req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
  const next: AppSettings = {
    ...getSettings(),
    ...(req.body || {}),
  };
  res.json(saveSettings(next));
});

// 7. Dataset Management
app.get('/api/dataset', (req, res) => {
  const label = req.query.label ? String(req.query.label) : undefined;
  res.json({ items: listDatasetItems(label) });
});

app.post('/api/dataset', upload.single('image'), (req, res) => {
  try {
    const raw = resolveRawImageFromRequest(req.file, req.body?.imageDataUrl);
    const id = `ds-${Date.now()}`;
    const label = (req.body?.label || 'Normal') as DatasetClass;
    const lightingCondition = (req.body?.lightingCondition ||
      'High-intensity normal lighting') as LightingCondition;
    const cameraDistanceCm = Number(req.body?.cameraDistanceCm || 25);
    const diffuserDistanceCm = Number(req.body?.diffuserDistanceCm || 18);
    const glassType = String(req.body?.glassType || 'Clear Glass Jar');
    const notes = String(req.body?.notes || '');
    const origFilename = req.file?.originalname || `${label.toLowerCase()}_${id}.png`;
    const diskFilename = `${id}.png`;

    fs.writeFileSync(path.join(DATASET_DIR, diskFilename), encodePngBuffer(raw));

    addDatasetItem({
      id,
      filename: origFilename,
      label,
      lightingCondition,
      cameraDistanceCm,
      diffuserDistanceCm,
      glassType,
      notes,
      imagePath: diskFilename,
    });

    res.json({ items: listDatasetItems() });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Dataset upload failed' });
  }
});

app.delete('/api/dataset/:id', (req, res) => {
  deleteDatasetItem(req.params.id);
  res.json({ items: listDatasetItems() });
});

app.get('/api/dataset/export', (_req, res) => {
  const items = listDatasetItems();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="glass_dataset_metadata.json"');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), count: items.length, items }, null, 2));
});

// 8. Testing & Validation Benchmark across Labelled Dataset
app.post('/api/testing/evaluate', (req, res) => {
  try {
    const items = listDatasetItems();
    const cfg: CVCalibrationConfig = {
      ...getConfig(),
      ...(req.body?.config || {}),
    };

    const rows: ValidationRow[] = items.map((item) => {
      const fileName = item.imageUrl.split('/').pop()!;
      const buf = fs.readFileSync(path.join(DATASET_DIR, fileName));
      const raw = decodeImageBuffer(buf, fileName);
      const output = runGlassCrackPipeline(raw, cfg, false);

      return {
        datasetId: item.id,
        filename: item.filename,
        groundTruth: item.label,
        expectedPositive: isDefectiveGroundTruth(item.label),
        predictedClassification: output.classification,
        predictedPositive: isPositivePrediction(output.classification),
        outcome: evaluateOutcome(item.label, output.classification),
        heuristicScore: output.heuristicScore,
        defectCount: output.defectCount,
        processingTimeMs: output.processingTimeMs,
        processedImageUrl: encodePngDataUrl({
          width: output.imageWidth,
          height: output.imageHeight,
          data: output.processedRgba,
        }),
      };
    });

    const summary = computeValidationMetrics(rows);
    res.json({ ...summary, rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Validation run failed' });
  }
});

// 9. Report Downloads (PDF, CSV, Excel)
app.get('/api/reports/csv', (_req, res) => {
  const inspections = listInspections();
  const csv = generateCsvReport(inspections);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="glass_inspection_report.csv"');
  res.send(csv);
});

app.get('/api/reports/excel', (_req, res) => {
  const inspections = listInspections();
  const stats = computeDashboardStats();
  const buf = generateExcelReportBuffer(inspections, stats);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="glass_inspection_report.xlsx"');
  res.send(buf);
});

app.get('/api/reports/pdf', async (_req, res) => {
  try {
    const inspections = listInspections();
    const stats = computeDashboardStats();
    const buf = await generatePdfReportBuffer(inspections, stats);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="glass_inspection_report.pdf"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'PDF generation failed' });
  }
});

// Mount Vite dev middleware or serve static production build
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GlassGuard CV server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
