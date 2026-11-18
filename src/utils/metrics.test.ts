import test from 'node:test';
import assert from 'node:assert/strict';
import { computeValidationMetrics, evaluateOutcome } from './metrics';
import { ValidationRow } from '../types/inspection';

test('evaluateOutcome computes TP, TN, FP, FN accurately', () => {
  assert.equal(evaluateOutcome('Normal', 'NORMAL'), 'TN');
  assert.equal(evaluateOutcome('Normal', 'SUSPECTED CRACK'), 'FP');
  assert.equal(evaluateOutcome('Crack', 'SUSPECTED CRACK'), 'TP');
  assert.equal(evaluateOutcome('Broken', 'MANUAL INSPECTION REQUIRED'), 'TP');
  assert.equal(evaluateOutcome('Crack', 'NORMAL'), 'FN');
});

test('computeValidationMetrics derives accuracy, precision, recall, F1, and FPS', () => {
  const rows: ValidationRow[] = [
    {
      datasetId: '1',
      filename: 'n1.png',
      groundTruth: 'Normal',
      expectedPositive: false,
      predictedClassification: 'NORMAL',
      predictedPositive: false,
      outcome: 'TN',
      heuristicScore: 8,
      defectCount: 0,
      processingTimeMs: 20,
      processedImageUrl: '',
    },
    {
      datasetId: '2',
      filename: 'c1.png',
      groundTruth: 'Crack',
      expectedPositive: true,
      predictedClassification: 'SUSPECTED CRACK',
      predictedPositive: true,
      outcome: 'TP',
      heuristicScore: 82,
      defectCount: 1,
      processingTimeMs: 30,
      processedImageUrl: '',
    },
  ];
  const m = computeValidationMetrics(rows);
  assert.equal(m.tp, 1);
  assert.equal(m.tn, 1);
  assert.equal(m.fp, 0);
  assert.equal(m.fn, 0);
  assert.equal(m.accuracy, 100);
  assert.equal(m.precision, 100);
  assert.equal(m.recall, 100);
  assert.equal(m.f1Score, 100);
  assert.equal(m.avgProcessingTimeMs, 25);
  assert.equal(m.estimatedFps, 40);
});
