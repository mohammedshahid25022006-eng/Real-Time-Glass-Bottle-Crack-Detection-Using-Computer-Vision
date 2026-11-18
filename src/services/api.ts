import {
  AppSettings,
  CVCalibrationConfig,
  DashboardStatistics,
  DatasetClass,
  DatasetItem,
  InspectionResult,
  LightingCondition,
  PipelineStepPreview,
  ReviewStatus,
  ValidationMetrics,
} from '../types/inspection';

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDashboardStats(): Promise<DashboardStatistics> {
  const res = await fetch('/api/dashboard/statistics');
  return handleJson<DashboardStatistics>(res);
}

export async function fetchHistory(filters?: {
  classification?: string;
  reviewStatus?: string;
  date?: string;
  search?: string;
}): Promise<InspectionResult[]> {
  const params = new URLSearchParams();
  if (filters?.classification && filters.classification !== 'ALL') {
    params.set('classification', filters.classification);
  }
  if (filters?.reviewStatus && filters.reviewStatus !== 'ALL') {
    params.set('reviewStatus', filters.reviewStatus);
  }
  if (filters?.date) params.set('date', filters.date);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();
  const res = await fetch(`/api/inspection/history${qs ? `?${qs}` : ''}`);
  const data = await handleJson<{ items: InspectionResult[] }>(res);
  return data.items;
}

export async function fetchInspectionById(id: string): Promise<InspectionResult> {
  const res = await fetch(`/api/inspection/${encodeURIComponent(id)}`);
  return handleJson<InspectionResult>(res);
}

export async function submitManualReview(
  id: string,
  reviewStatus: ReviewStatus,
  reviewNotes: string
): Promise<InspectionResult> {
  const res = await fetch('/api/inspection/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, reviewStatus, reviewNotes }),
  });
  return handleJson<InspectionResult>(res);
}

export async function inspectImageFile(params: {
  file?: File;
  datasetId?: string;
  imageDataUrl?: string;
  lightingCondition: LightingCondition;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  includeSteps?: boolean;
}): Promise<InspectionResult> {
  const form = new FormData();
  if (params.file) form.append('image', params.file);
  if (params.datasetId) form.append('datasetId', params.datasetId);
  if (params.imageDataUrl) form.append('imageDataUrl', params.imageDataUrl);
  form.append('lightingCondition', params.lightingCondition);
  form.append('cameraDistanceCm', String(params.cameraDistanceCm));
  form.append('diffuserDistanceCm', String(params.diffuserDistanceCm));
  form.append('includeSteps', String(Boolean(params.includeSteps)));

  const res = await fetch('/api/inspect/image', {
    method: 'POST',
    body: form,
  });
  return handleJson<InspectionResult>(res);
}

export interface LiveFrameResponse {
  classification: InspectionResult['classification'];
  heuristicScore: number;
  defectCount: number;
  processingTimeMs: number;
  imageWidth: number;
  imageHeight: number;
  bottleRoi: InspectionResult['bottleRoi'];
  regions: InspectionResult['regions'];
  rejectedCandidates: InspectionResult['rejectedCandidates'];
  processedImageDataUrl: string;
  savedInspection: InspectionResult | null;
}

export async function inspectLiveFrame(params: {
  frameDataUrl: string;
  save?: boolean;
  lightingCondition?: LightingCondition;
  cameraDistanceCm?: number;
  diffuserDistanceCm?: number;
}): Promise<LiveFrameResponse> {
  const res = await fetch('/api/inspect/frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleJson<LiveFrameResponse>(res);
}

export interface PipelinePreviewResponse {
  classification: InspectionResult['classification'];
  heuristicScore: number;
  defectCount: number;
  processingTimeMs: number;
  imageWidth: number;
  imageHeight: number;
  bottleRoi: InspectionResult['bottleRoi'];
  regions: InspectionResult['regions'];
  rejectedCandidates: InspectionResult['rejectedCandidates'];
  originalImageDataUrl: string;
  processedImageDataUrl: string;
  pipelineSteps?: PipelineStepPreview[];
}

export async function previewPipeline(params: {
  datasetId?: string;
  imageDataUrl?: string;
  config?: Partial<CVCalibrationConfig>;
  includeSteps?: boolean;
}): Promise<PipelinePreviewResponse> {
  const res = await fetch('/api/pipeline/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleJson<PipelinePreviewResponse>(res);
}

export async function fetchConfig(): Promise<CVCalibrationConfig> {
  const res = await fetch('/api/config');
  return handleJson<CVCalibrationConfig>(res);
}

export async function saveConfig(cfg: CVCalibrationConfig): Promise<CVCalibrationConfig> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  return handleJson<CVCalibrationConfig>(res);
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch('/api/settings');
  return handleJson<AppSettings>(res);
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return handleJson<AppSettings>(res);
}

export async function fetchDataset(label?: string): Promise<DatasetItem[]> {
  const qs = label && label !== 'ALL' ? `?label=${encodeURIComponent(label)}` : '';
  const res = await fetch(`/api/dataset${qs}`);
  const data = await handleJson<{ items: DatasetItem[] }>(res);
  return data.items;
}

export async function uploadDatasetItem(params: {
  file: File;
  label: DatasetClass;
  lightingCondition: LightingCondition;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  glassType: string;
  notes: string;
}): Promise<DatasetItem[]> {
  const form = new FormData();
  form.append('image', params.file);
  form.append('label', params.label);
  form.append('lightingCondition', params.lightingCondition);
  form.append('cameraDistanceCm', String(params.cameraDistanceCm));
  form.append('diffuserDistanceCm', String(params.diffuserDistanceCm));
  form.append('glassType', params.glassType);
  form.append('notes', params.notes);
  const res = await fetch('/api/dataset', { method: 'POST', body: form });
  const data = await handleJson<{ items: DatasetItem[] }>(res);
  return data.items;
}

export async function deleteDatasetItem(id: string): Promise<DatasetItem[]> {
  const res = await fetch(`/api/dataset/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await handleJson<{ items: DatasetItem[] }>(res);
  return data.items;
}

export async function runValidationBenchmark(
  config?: Partial<CVCalibrationConfig>
): Promise<ValidationMetrics> {
  const res = await fetch('/api/testing/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  return handleJson<ValidationMetrics>(res);
}
