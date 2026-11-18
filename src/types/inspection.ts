export type ClassificationLabel =
  | 'NORMAL'
  | 'SUSPECTED CRACK'
  | 'MANUAL INSPECTION REQUIRED';

export type ReviewStatus =
  | 'PENDING'
  | 'CONFIRMED DEFECT'
  | 'MARKED NORMAL'
  | 'REINSPECTION REQUESTED';

export type DatasetClass = 'Normal' | 'Crack' | 'Broken';

export type LightingCondition =
  | 'Medium red lighting'
  | 'High-intensity cozy lighting'
  | 'Medium-intensity cozy lighting'
  | 'High-intensity warm lighting'
  | 'Medium-intensity warm lighting'
  | 'High-intensity normal lighting'
  | 'Medium-intensity normal lighting';

export const LIGHTING_CONDITIONS: LightingCondition[] = [
  'Medium red lighting',
  'High-intensity cozy lighting',
  'Medium-intensity cozy lighting',
  'High-intensity warm lighting',
  'Medium-intensity warm lighting',
  'High-intensity normal lighting',
  'Medium-intensity normal lighting',
];

export interface CVCalibrationConfig {
  gaussianKernel: number;       // odd: 3, 5, 7, 9, 11
  thresholdValue: number;       // 0..255
  cannyLow: number;             // 10..200
  cannyHigh: number;            // 30..300
  morphKernel: number;          // odd: 3, 5, 7, 9
  minContourArea: number;       // px^2
  minCrackLength: number;       // px
  contrastAlpha: number;        // 0.5..3.0
  minAspectRatio: number;       // elongation threshold (e.g., 1.8)
  edgeDensityThreshold: number; // 0..1
  manualScoreThreshold: number; // heuristic score >= this => MANUAL INSPECTION REQUIRED
  crackScoreThreshold: number;  // heuristic score >= this => SUSPECTED CRACK
}

export const DEFAULT_CV_CONFIG: CVCalibrationConfig = {
  gaussianKernel: 5,
  thresholdValue: 135,
  cannyLow: 42,
  cannyHigh: 118,
  morphKernel: 3,
  minContourArea: 48,
  minCrackLength: 26,
  contrastAlpha: 1.45,
  minAspectRatio: 1.7,
  edgeDensityThreshold: 0.08,
  manualScoreThreshold: 28,
  crackScoreThreshold: 55,
};

export interface DefectRegion {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  aspectRatio: number;
  length: number;
  widthPx: number;
  edgeDensity: number;
  solidity: number;
  shapeCharacteristics: string;
  regionLocation: string;
  heuristicScore: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface PipelineStepPreview {
  step: number;
  title: string;
  description: string;
  imageDataUrl: string;
  stats: string;
}

export interface InspectionResult {
  id: string;
  createdAt: string;
  source: 'camera' | 'upload' | 'calibration' | 'dataset';
  classification: ClassificationLabel;
  reviewStatus: ReviewStatus;
  reviewNotes: string;
  reviewedAt: string | null;
  heuristicScore: number;
  defectCount: number;
  processingTimeMs: number;
  imageWidth: number;
  imageHeight: number;
  originalImageUrl: string;
  processedImageUrl: string;
  lightingCondition: LightingCondition;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  regions: DefectRegion[];
  rejectedCandidates: DefectRegion[];
  bottleRoi: { x: number; y: number; width: number; height: number };
  pipelineSteps?: PipelineStepPreview[];
}

export interface DashboardStatistics {
  totalInspected: number;
  normalCount: number;
  defectiveCount: number;
  manualReviewRequiredCount: number;
  pendingManualReviews: number;
  detectionRate: number;
  avgProcessingTimeMs: number;
  dailyStats: Array<{
    date: string;
    normal: number;
    defective: number;
    manual: number;
    total: number;
  }>;
  defectTrend: Array<{
    label: string;
    defectRate: number;
    avgLatencyMs: number;
  }>;
  recentInspections: InspectionResult[];
}

export interface DatasetItem {
  id: string;
  filename: string;
  label: DatasetClass;
  lightingCondition: LightingCondition;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  glassType: string;
  notes: string;
  imageUrl: string;
  createdAt: string;
  isReferenceSample: boolean;
}

export interface ValidationRow {
  datasetId: string;
  filename: string;
  groundTruth: DatasetClass;
  expectedPositive: boolean;
  predictedClassification: ClassificationLabel;
  predictedPositive: boolean;
  outcome: 'TP' | 'TN' | 'FP' | 'FN';
  heuristicScore: number;
  defectCount: number;
  processingTimeMs: number;
  processedImageUrl: string;
}

export interface ValidationMetrics {
  totalSamples: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  avgProcessingTimeMs: number;
  estimatedFps: number;
  rows: ValidationRow[];
}

export interface AppSettings {
  audioAlertEnabled: boolean;
  cameraDistanceCm: number;
  diffuserDistanceCm: number;
  defaultLightingCondition: LightingCondition;
  frameIntervalMs: number;
  pythonBackendUrl: string;
}
