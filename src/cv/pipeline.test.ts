import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CV_CONFIG } from '../types/inspection';
import { runGlassCrackPipeline } from './pipeline';
import { generateBacklitBottleSample } from './sampleGenerator';

test('normal backlit glass jar classifies as NORMAL with 0 accepted defect regions', () => {
  const sample = generateBacklitBottleSample('normal', 'High-intensity normal lighting', 1);
  const res = runGlassCrackPipeline(sample, DEFAULT_CV_CONFIG, true);

  assert.equal(res.classification, 'NORMAL');
  assert.equal(res.defectCount, 0);
  assert.ok(res.heuristicScore < DEFAULT_CV_CONFIG.manualScoreThreshold);
  assert.equal(res.steps?.length, 10);
});

test('diagonal cracked glass jar classifies as SUSPECTED CRACK with red bounding box', () => {
  const sample = generateBacklitBottleSample(
    'crack_diagonal',
    'High-intensity cozy lighting',
    2
  );
  const res = runGlassCrackPipeline(sample, DEFAULT_CV_CONFIG, false);

  assert.equal(res.classification, 'SUSPECTED CRACK');
  assert.ok(res.defectCount >= 1);
  assert.ok(res.heuristicScore >= DEFAULT_CV_CONFIG.crackScoreThreshold);
  const box = res.regions[0];
  assert.ok(box.length >= DEFAULT_CV_CONFIG.minCrackLength);
  assert.ok(box.area >= DEFAULT_CV_CONFIG.minContourArea);
});

test('broken glass jar with radiating fractures detects multiple or large defect regions', () => {
  const sample = generateBacklitBottleSample('broken_radiating', 'Medium red lighting', 3);
  const res = runGlassCrackPipeline(sample, DEFAULT_CV_CONFIG, false);

  assert.equal(res.classification, 'SUSPECTED CRACK');
  assert.ok(res.defectCount >= 1);
  assert.ok(res.heuristicScore >= 65);
});

test('microscopic dust specks are filtered out as false positives and remain NORMAL', () => {
  const sample = generateBacklitBottleSample('dust_noise', 'Medium-intensity normal lighting', 4);
  const res = runGlassCrackPipeline(sample, DEFAULT_CV_CONFIG, false);

  assert.equal(res.classification, 'NORMAL');
  assert.equal(res.defectCount, 0);
});
