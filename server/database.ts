import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AppSettings,
  CVCalibrationConfig,
  DashboardStatistics,
  DatasetClass,
  DatasetItem,
  DEFAULT_CV_CONFIG,
  InspectionResult,
  LightingCondition,
  ReviewStatus,
} from '../src/types/inspection.ts';
import { encodePngBuffer } from '../src/cv/imageCodec.ts';
import { runGlassCrackPipeline } from '../src/cv/pipeline.ts';
import { BottleSampleVariant, generateBacklitBottleSample } from '../src/cv/sampleGenerator.ts';

const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
export const PROCESSED_DIR = path.join(ROOT_DIR, 'processed_images');
export const DATASET_DIR = path.join(ROOT_DIR, 'dataset');
export const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

for (const dir of [DATA_DIR, UPLOADS_DIR, PROCESSED_DIR, DATASET_DIR, REPORTS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'inspections.db');
export const db = new DatabaseSync(DB_PATH);

export const DEFAULT_SETTINGS: AppSettings = {
  audioAlertEnabled: true,
  cameraDistanceCm: 25,
  diffuserDistanceCm: 18,
  defaultLightingCondition: 'High-intensity normal lighting',
  frameIntervalMs: 280,
  pythonBackendUrl: '',
};

export function initDatabase() {
  db.exec(`
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
    );

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dataset (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      label TEXT NOT NULL,
      lighting_condition TEXT NOT NULL,
      camera_distance_cm REAL NOT NULL,
      diffuser_distance_cm REAL NOT NULL,
      glass_type TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_reference_sample INTEGER NOT NULL DEFAULT 0
    );
  `);

  const cfgRow = db.prepare('SELECT id FROM config WHERE id = 1').get();
  if (!cfgRow) {
    db.prepare('INSERT INTO config (id, config_json, updated_at) VALUES (1, ?, ?)').run(
      JSON.stringify(DEFAULT_CV_CONFIG),
      new Date().toISOString()
    );
  }

  const setRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!setRow) {
    db.prepare('INSERT INTO settings (id, settings_json, updated_at) VALUES (1, ?, ?)').run(
      JSON.stringify(DEFAULT_SETTINGS),
      new Date().toISOString()
    );
  }

  seedReferenceDatasetAndInitialInspections();
}

function seedReferenceDatasetAndInitialInspections() {
  const dsCount = db.prepare('SELECT COUNT(*) as cnt FROM dataset').get() as { cnt: number };
  if (dsCount.cnt > 0) return;

  const specs: Array<{
    id: string;
    filename: string;
    variant: BottleSampleVariant;
    label: DatasetClass;
    lighting: LightingCondition;
    cameraDistanceCm: number;
    glassType: string;
    notes: string;
    seed: number;
  }> = [
    {
      id: 'ds-ref-01',
      filename: 'jar_normal_high_normal.png',
      variant: 'normal',
      label: 'Normal',
      lighting: 'High-intensity normal lighting',
      cameraDistanceCm: 25,
      glassType: 'Clear Glass Jar',
      notes: 'Clean reference jar under 25 cm camera distance, 18 cm bottle-to-diffuser.',
      seed: 11,
    },
    {
      id: 'ds-ref-02',
      filename: 'jar_normal_medium_warm.png',
      variant: 'normal',
      label: 'Normal',
      lighting: 'Medium-intensity warm lighting',
      cameraDistanceCm: 40,
      glassType: 'Clear Glass Jar',
      notes: 'Clean reference jar under 40 cm camera distance and medium warm diffuser.',
      seed: 12,
    },
    {
      id: 'ds-ref-03',
      filename: 'jar_normal_dust_filter.png',
      variant: 'dust_noise',
      label: 'Normal',
      lighting: 'Medium-intensity normal lighting',
      cameraDistanceCm: 25,
      glassType: 'Clear Glass Jar',
      notes: 'Normal jar with minor surface dust specks to validate false-positive filtering.',
      seed: 13,
    },
    {
      id: 'ds-ref-04',
      filename: 'jar_crack_diag_cozy.png',
      variant: 'crack_diagonal',
      label: 'Crack',
      lighting: 'High-intensity cozy lighting',
      cameraDistanceCm: 25,
      glassType: 'Marked Glass Jar',
      notes: 'Diagonal hairline wall crack captured at 25 cm distance.',
      seed: 21,
    },
    {
      id: 'ds-ref-05',
      filename: 'jar_crack_vert_warm.png',
      variant: 'crack_vertical',
      label: 'Crack',
      lighting: 'High-intensity warm lighting',
      cameraDistanceCm: 40,
      glassType: 'Marked Glass Jar',
      notes: 'Longitudinal body wall crack captured at 40 cm camera distance.',
      seed: 22,
    },
    {
      id: 'ds-ref-06',
      filename: 'jar_crack_med_cozy.png',
      variant: 'crack_diagonal',
      label: 'Crack',
      lighting: 'Medium-intensity cozy lighting',
      cameraDistanceCm: 25,
      glassType: 'Marked Glass Jar',
      notes: 'Diagonal crack under medium-intensity cozy backlight.',
      seed: 23,
    },
    {
      id: 'ds-ref-07',
      filename: 'jar_broken_red.png',
      variant: 'broken_radiating',
      label: 'Broken',
      lighting: 'Medium red lighting',
      cameraDistanceCm: 25,
      glassType: 'Broken Glass Jar',
      notes: 'Radiating multi-branch fracture captured under medium red lighting.',
      seed: 31,
    },
    {
      id: 'ds-ref-08',
      filename: 'jar_broken_normal.png',
      variant: 'broken_radiating',
      label: 'Broken',
      lighting: 'High-intensity normal lighting',
      cameraDistanceCm: 40,
      glassType: 'Broken Glass Jar',
      notes: 'Severe shattered glass jar under high-intensity normal backlighting.',
      seed: 32,
    },
  ];

  const insertDs = db.prepare(`
    INSERT INTO dataset (
      id, filename, label, lighting_condition, camera_distance_cm, diffuser_distance_cm,
      glass_type, notes, image_path, created_at, is_reference_sample
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const now = Date.now();
  const sampleBuffers: Array<{ spec: (typeof specs)[number]; png: Buffer }> = [];

  specs.forEach((spec, idx) => {
    const raw = generateBacklitBottleSample(spec.variant, spec.lighting, spec.seed);
    const png = encodePngBuffer(raw);
    const filePath = path.join(DATASET_DIR, spec.filename);
    fs.writeFileSync(filePath, png);
    insertDs.run(
      spec.id,
      spec.filename,
      spec.label,
      spec.lighting,
      spec.cameraDistanceCm,
      18,
      spec.glassType,
      spec.notes,
      spec.filename,
      new Date(now - (specs.length - idx) * 3600_000).toISOString()
    );
    sampleBuffers.push({ spec, png });
  });

  // Also run the REAL CV pipeline on 4 initial reference inspections so Dashboard & History start with real CV data
  const inspCount = db.prepare('SELECT COUNT(*) as cnt FROM inspections').get() as { cnt: number };
  if (inspCount.cnt === 0) {
    const cfg = getConfig();
    const initialPicks = [0, 3, 1, 6]; // Normal, Crack, Normal, Broken
    initialPicks.forEach((pickIdx, i) => {
      const { spec } = sampleBuffers[pickIdx];
      const raw = generateBacklitBottleSample(spec.variant, spec.lighting, spec.seed);
      const result = runGlassCrackPipeline(raw, cfg, false);
      const id = `INSP-${String(1001 + i)}`;
      const origName = `${id}_orig.png`;
      const procName = `${id}_proc.png`;
      fs.writeFileSync(path.join(UPLOADS_DIR, origName), encodePngBuffer(raw));
      fs.writeFileSync(
        path.join(PROCESSED_DIR, procName),
        encodePngBuffer({
          width: result.imageWidth,
          height: result.imageHeight,
          data: result.processedRgba,
        })
      );

      const createdAt = new Date(now - (4 - i) * 1800_000).toISOString();
      const reviewStatus: ReviewStatus =
        result.classification === 'NORMAL'
          ? 'MARKED NORMAL'
          : i === 1
          ? 'CONFIRMED DEFECT'
          : 'PENDING';

      saveInspectionRecord({
        id,
        createdAt,
        source: 'upload',
        classification: result.classification,
        reviewStatus,
        reviewNotes:
          reviewStatus === 'CONFIRMED DEFECT'
            ? 'Verified hairline crack against backlit diffuser.'
            : '',
        reviewedAt: reviewStatus === 'PENDING' ? null : createdAt,
        heuristicScore: result.heuristicScore,
        defectCount: result.defectCount,
        processingTimeMs: result.processingTimeMs,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        originalImagePath: origName,
        processedImagePath: procName,
        lightingCondition: spec.lighting,
        cameraDistanceCm: spec.cameraDistanceCm,
        diffuserDistanceCm: 18,
        regions: result.regions,
        rejectedCandidates: result.rejectedCandidates,
        bottleRoi: result.bottleRoi,
      });
    });
  }
}

export function getConfig(): CVCalibrationConfig {
  const row = db.prepare('SELECT config_json FROM config WHERE id = 1').get() as
    | { config_json: string }
    | undefined;
  if (!row) return DEFAULT_CV_CONFIG;
  return { ...DEFAULT_CV_CONFIG, ...JSON.parse(row.config_json) };
}

export function saveConfig(cfg: CVCalibrationConfig): CVCalibrationConfig {
  db.prepare('UPDATE config SET config_json = ?, updated_at = ? WHERE id = 1').run(
    JSON.stringify(cfg),
    new Date().toISOString()
  );
  return cfg;
}

export function getSettings(): AppSettings {
  const row = db.prepare('SELECT settings_json FROM settings WHERE id = 1').get() as
    | { settings_json: string }
    | undefined;
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings_json) };
}

export function saveSettings(settings: AppSettings): AppSettings {
  db.prepare('UPDATE settings SET settings_json = ?, updated_at = ? WHERE id = 1').run(
    JSON.stringify(settings),
    new Date().toISOString()
  );
  return settings;
}

export function saveInspectionRecord(rec: {
  id: string;
  createdAt: string;
  source: InspectionResult['source'];
  classification: InspectionResult['classification'];
  reviewStatus: ReviewStatus;
  reviewNotes: string;
  reviewedAt: string | null;
  heuristicScore: number;
  defectCount: number;
  processingTimeMs: number;
  imageWidth: number;
  imageHeight: number;
  originalImagePath: string;
  processedImagePath: string;
  lightingCondition: LightingCondition;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  regions: InspectionResult['regions'];
  rejectedCandidates: InspectionResult['rejectedCandidates'];
  bottleRoi: InspectionResult['bottleRoi'];
}) {
  db.prepare(`
    INSERT INTO inspections (
      id, created_at, source, classification, review_status, review_notes, reviewed_at,
      heuristic_score, defect_count, processing_time_ms, image_width, image_height,
      original_image_path, processed_image_path, lighting_condition, camera_distance_cm,
      diffuser_distance_cm, regions_json, rejected_json, bottle_roi_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rec.id,
    rec.createdAt,
    rec.source,
    rec.classification,
    rec.reviewStatus,
    rec.reviewNotes,
    rec.reviewedAt,
    rec.heuristicScore,
    rec.defectCount,
    rec.processingTimeMs,
    rec.imageWidth,
    rec.imageHeight,
    rec.originalImagePath,
    rec.processedImagePath,
    rec.lightingCondition,
    rec.cameraDistanceCm,
    rec.diffuserDistanceCm,
    JSON.stringify(rec.regions),
    JSON.stringify(rec.rejectedCandidates),
    JSON.stringify(rec.bottleRoi)
  );
}

function mapInspectionRow(row: Record<string, unknown>): InspectionResult {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    source: row.source as InspectionResult['source'],
    classification: row.classification as InspectionResult['classification'],
    reviewStatus: row.review_status as ReviewStatus,
    reviewNotes: String(row.review_notes || ''),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    heuristicScore: Number(row.heuristic_score),
    defectCount: Number(row.defect_count),
    processingTimeMs: Number(row.processing_time_ms),
    imageWidth: Number(row.image_width),
    imageHeight: Number(row.image_height),
    originalImageUrl: `/media/uploads/${String(row.original_image_path)}`,
    processedImageUrl: `/media/processed/${String(row.processed_image_path)}`,
    lightingCondition: row.lighting_condition as LightingCondition,
    cameraDistanceCm: Number(row.camera_distance_cm),
    diffuserDistanceCm: Number(row.diffuser_distance_cm),
    regions: JSON.parse(String(row.regions_json)),
    rejectedCandidates: JSON.parse(String(row.rejected_json)),
    bottleRoi: JSON.parse(String(row.bottle_roi_json)),
  };
}

export function listInspections(filters?: {
  classification?: string;
  reviewStatus?: string;
  date?: string;
  search?: string;
}): InspectionResult[] {
  const rows = db
    .prepare('SELECT * FROM inspections ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;

  let items = rows.map(mapInspectionRow);
  if (filters?.classification && filters.classification !== 'ALL') {
    items = items.filter((i) => i.classification === filters.classification);
  }
  if (filters?.reviewStatus && filters.reviewStatus !== 'ALL') {
    items = items.filter((i) => i.reviewStatus === filters.reviewStatus);
  }
  if (filters?.date) {
    items = items.filter((i) => i.createdAt.slice(0, 10) === filters.date);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.id.toLowerCase().includes(q) ||
        i.classification.toLowerCase().includes(q) ||
        i.lightingCondition.toLowerCase().includes(q)
    );
  }
  return items;
}

export function getInspectionById(id: string): InspectionResult | null {
  const row = db.prepare('SELECT * FROM inspections WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapInspectionRow(row) : null;
}

export function updateInspectionReview(
  id: string,
  reviewStatus: ReviewStatus,
  reviewNotes: string
): InspectionResult | null {
  const existing = getInspectionById(id);
  if (!existing) return null;

  let nextClassification = existing.classification;
  if (reviewStatus === 'CONFIRMED DEFECT') {
    nextClassification = 'SUSPECTED CRACK';
  } else if (reviewStatus === 'MARKED NORMAL') {
    nextClassification = 'NORMAL';
  } else if (reviewStatus === 'REINSPECTION REQUESTED') {
    nextClassification = 'MANUAL INSPECTION REQUIRED';
  }

  db.prepare(
    'UPDATE inspections SET review_status = ?, review_notes = ?, reviewed_at = ?, classification = ? WHERE id = ?'
  ).run(reviewStatus, reviewNotes, new Date().toISOString(), nextClassification, id);

  return getInspectionById(id);
}

export function computeDashboardStats(): DashboardStatistics {
  const all = listInspections();
  const totalInspected = all.length;
  const normalCount = all.filter((i) => i.classification === 'NORMAL').length;
  const defectiveCount = all.filter((i) => i.classification === 'SUSPECTED CRACK').length;
  const manualReviewRequiredCount = all.filter(
    (i) => i.classification === 'MANUAL INSPECTION REQUIRED'
  ).length;
  const pendingManualReviews = all.filter((i) => i.reviewStatus === 'PENDING').length;
  const detectionRate =
    totalInspected > 0
      ? Number(((defectiveCount / totalInspected) * 100).toFixed(1))
      : 0;
  const avgProcessingTimeMs =
    totalInspected > 0
      ? Number(
          (
            all.reduce((acc, i) => acc + i.processingTimeMs, 0) / totalInspected
          ).toFixed(1)
        )
      : 0;

  // Group by YYYY-MM-DD
  const byDate = new Map<
    string,
    { date: string; normal: number; defective: number; manual: number; total: number }
  >();
  for (const item of [...all].reverse()) {
    const d = item.createdAt.slice(0, 10);
    const cur = byDate.get(d) || { date: d, normal: 0, defective: 0, manual: 0, total: 0 };
    if (item.classification === 'NORMAL') cur.normal++;
    else if (item.classification === 'SUSPECTED CRACK') cur.defective++;
    else cur.manual++;
    cur.total++;
    byDate.set(d, cur);
  }

  // Chronological trend points (up to last 12 inspections)
  const chron = [...all].reverse().slice(-12);
  let cumTotal = 0;
  let cumDefect = 0;
  const defectTrend = chron.map((item) => {
    cumTotal++;
    if (item.classification === 'SUSPECTED CRACK') cumDefect++;
    return {
      label: item.id,
      defectRate: Number(((cumDefect / cumTotal) * 100).toFixed(1)),
      avgLatencyMs: item.processingTimeMs,
    };
  });

  return {
    totalInspected,
    normalCount,
    defectiveCount,
    manualReviewRequiredCount,
    pendingManualReviews,
    detectionRate,
    avgProcessingTimeMs,
    dailyStats: Array.from(byDate.values()),
    defectTrend,
    recentInspections: all.slice(0, 8),
  };
}

export function listDatasetItems(labelFilter?: string): DatasetItem[] {
  const rows = db
    .prepare('SELECT * FROM dataset ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;
  let items: DatasetItem[] = rows.map((r) => ({
    id: String(r.id),
    filename: String(r.filename),
    label: r.label as DatasetClass,
    lightingCondition: r.lighting_condition as LightingCondition,
    cameraDistanceCm: Number(r.camera_distance_cm),
    diffuserDistanceCm: Number(r.diffuser_distance_cm),
    glassType: String(r.glass_type),
    notes: String(r.notes || ''),
    imageUrl: `/media/dataset/${String(r.image_path)}`,
    createdAt: String(r.created_at),
    isReferenceSample: Boolean(r.is_reference_sample),
  }));
  if (labelFilter && labelFilter !== 'ALL') {
    items = items.filter((i) => i.label === labelFilter);
  }
  return items;
}

export function addDatasetItem(item: {
  id: string;
  filename: string;
  label: DatasetClass;
  lightingCondition: LightingCondition;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  glassType: string;
  notes: string;
  imagePath: string;
}) {
  db.prepare(`
    INSERT INTO dataset (
      id, filename, label, lighting_condition, camera_distance_cm, diffuser_distance_cm,
      glass_type, notes, image_path, created_at, is_reference_sample
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    item.id,
    item.filename,
    item.label,
    item.lightingCondition,
    item.cameraDistanceCm,
    item.diffuserDistanceCm,
    item.glassType,
    item.notes,
    item.imagePath,
    new Date().toISOString()
  );
}

export function deleteDatasetItem(id: string) {
  const row = db.prepare('SELECT image_path FROM dataset WHERE id = ?').get(id) as
    | { image_path: string }
    | undefined;
  if (row) {
    const full = path.join(DATASET_DIR, row.image_path);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    db.prepare('DELETE FROM dataset WHERE id = ?').run(id);
  }
}

export function getNextInspectionId(): string {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM inspections').get() as { cnt: number };
  return `INSP-${String(1001 + row.cnt)}`;
}
