import { ClassificationLabel, DatasetClass, ValidationRow } from '../types/inspection';

export interface ConfusionSummary {
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
}

export function isDefectiveGroundTruth(label: DatasetClass): boolean {
  return label === 'Crack' || label === 'Broken';
}

export function isPositivePrediction(classification: ClassificationLabel): boolean {
  return classification === 'SUSPECTED CRACK' || classification === 'MANUAL INSPECTION REQUIRED';
}

export function evaluateOutcome(
  groundTruth: DatasetClass,
  predicted: ClassificationLabel
): 'TP' | 'TN' | 'FP' | 'FN' {
  const expectedPositive = isDefectiveGroundTruth(groundTruth);
  const predictedPositive = isPositivePrediction(predicted);
  if (expectedPositive && predictedPositive) return 'TP';
  if (!expectedPositive && !predictedPositive) return 'TN';
  if (!expectedPositive && predictedPositive) return 'FP';
  return 'FN';
}

export function computeValidationMetrics(rows: ValidationRow[]): ConfusionSummary {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let totalTime = 0;

  for (const r of rows) {
    if (r.outcome === 'TP') tp++;
    else if (r.outcome === 'TN') tn++;
    else if (r.outcome === 'FP') fp++;
    else fn++;
    totalTime += r.processingTimeMs;
  }

  const totalSamples = rows.length;
  const accuracy = totalSamples > 0 ? (tp + tn) / totalSamples : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const avgProcessingTimeMs = totalSamples > 0 ? totalTime / totalSamples : 0;
  const estimatedFps = avgProcessingTimeMs > 0 ? 1000 / avgProcessingTimeMs : 0;

  return {
    totalSamples,
    tp,
    tn,
    fp,
    fn,
    accuracy: Number((accuracy * 100).toFixed(1)),
    precision: Number((precision * 100).toFixed(1)),
    recall: Number((recall * 100).toFixed(1)),
    f1Score: Number((f1Score * 100).toFixed(1)),
    avgProcessingTimeMs: Number(avgProcessingTimeMs.toFixed(2)),
    estimatedFps: Number(estimatedFps.toFixed(1)),
  };
}
