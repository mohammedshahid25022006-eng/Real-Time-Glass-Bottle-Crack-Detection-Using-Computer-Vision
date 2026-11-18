import {
  ClassificationLabel,
  CVCalibrationConfig,
  DEFAULT_CV_CONFIG,
  DefectRegion,
} from '../types/inspection';

export interface RawImageData {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, length = width * height * 4
}

export interface PipelineStepBuffer {
  step: number;
  title: string;
  description: string;
  stats: string;
  rgba: Uint8Array;
}

export interface CVPipelineOutput {
  classification: ClassificationLabel;
  heuristicScore: number;
  defectCount: number;
  processingTimeMs: number;
  imageWidth: number;
  imageHeight: number;
  bottleRoi: { x: number; y: number; width: number; height: number };
  regions: DefectRegion[];
  rejectedCandidates: DefectRegion[];
  processedRgba: Uint8Array;
  steps?: PipelineStepBuffer[];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function grayToRgba(gray: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < gray.length; i++) {
    const g = gray[i];
    const idx = i * 4;
    out[idx] = g;
    out[idx + 1] = g;
    out[idx + 2] = g;
    out[idx + 3] = 255;
  }
  return out;
}

function binaryToRgba(
  mask: Uint8Array,
  width: number,
  height: number,
  fg: [number, number, number] = [255, 255, 255],
  bg: [number, number, number] = [10, 18, 32]
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    const idx = i * 4;
    if (mask[i] > 0) {
      out[idx] = fg[0];
      out[idx + 1] = fg[1];
      out[idx + 2] = fg[2];
    } else {
      out[idx] = bg[0];
      out[idx + 1] = bg[1];
      out[idx + 2] = bg[2];
    }
    out[idx + 3] = 255;
  }
  return out;
}

/**
 * Downsample RGBA image proportionally so max(width, height) <= maxDim.
 */
export function resizeRgbaIfNeeded(
  input: RawImageData,
  maxDim = 560
): RawImageData {
  const { width, height, data } = input;
  if (width <= maxDim && height <= maxDim) {
    return input;
  }
  const scale = maxDim / Math.max(width, height);
  const newW = Math.max(32, Math.round(width * scale));
  const newH = Math.max(32, Math.round(height * scale));
  const out = new Uint8Array(newW * newH * 4);

  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * newW + x) * 4;
      out[dstIdx] = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = 255;
    }
  }
  return { width: newW, height: newH, data: out };
}

/**
 * Step 2: Grayscale Conversion (ITU-R BT.601)
 */
export function toGrayscale(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]
    );
  }
  return gray;
}

/**
 * Step 3: Gaussian Blur (separable 1D kernel)
 */
export function gaussianBlur(
  gray: Uint8Array,
  width: number,
  height: number,
  kernelSize: number
): Uint8Array {
  const k = Math.max(3, kernelSize % 2 === 1 ? kernelSize : kernelSize + 1);
  const radius = (k - 1) >> 1;
  const sigma = Math.max(0.8, 0.3 * ((k - 1) * 0.5 - 1) + 0.8);
  const kernel = new Float32Array(k);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < k; i++) kernel[i] /= sum;

  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        const sx = x + i < 0 ? 0 : x + i >= width ? width - 1 : x + i;
        acc += gray[rowOffset + sx] * kernel[i + radius];
      }
      temp[rowOffset + x] = acc;
    }
  }

  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        const sy = y + i < 0 ? 0 : y + i >= height ? height - 1 : y + i;
        acc += temp[sy * width + x] * kernel[i + radius];
      }
      out[y * width + x] = clampByte(Math.round(acc));
    }
  }
  return out;
}

/**
 * Step 4: Contrast Enhancement (Alpha stretch + local contrast normalization / CLAHE-style tile equalization)
 */
export function enhanceContrast(
  gray: Uint8Array,
  width: number,
  height: number,
  alpha: number
): Uint8Array {
  // Compute image mean for centered contrast stretch
  let total = 0;
  for (let i = 0; i < gray.length; i++) total += gray[i];
  const mean = total / Math.max(1, gray.length);

  // First pass: linear contrast scaling around mean
  const stretched = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    stretched[i] = clampByte(Math.round((gray[i] - mean) * alpha + 128 + (mean - 128) * 0.65));
  }

  // Second pass: 6x6 tile CLAHE-like clipped histogram equalization blended 45%
  const tilesX = 6;
  const tilesY = 6;
  const tileW = Math.max(1, Math.ceil(width / tilesX));
  const tileH = Math.max(1, Math.ceil(height / tilesY));
  const luts: Uint8Array[][] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    const row: Uint8Array[] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Uint32Array(256);
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(width, x0 + tileW);
      const y1 = Math.min(height, y0 + tileH);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[stretched[y * width + x]]++;
          count++;
        }
      }
      const clipLimit = Math.max(1, Math.floor((count / 256) * 2.5));
      let excess = 0;
      for (let b = 0; b < 256; b++) {
        if (hist[b] > clipLimit) {
          excess += hist[b] - clipLimit;
          hist[b] = clipLimit;
        }
      }
      const redist = Math.floor(excess / 256);
      for (let b = 0; b < 256; b++) hist[b] += redist;

      const lut = new Uint8Array(256);
      let cdf = 0;
      const denom = Math.max(1, count);
      for (let b = 0; b < 256; b++) {
        cdf += hist[b];
        lut[b] = clampByte(Math.round((cdf * 255) / denom));
      }
      row.push(lut);
    }
    luts.push(row);
  }

  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    const ty = Math.min(tilesY - 1, Math.floor(y / tileH));
    for (let x = 0; x < width; x++) {
      const tx = Math.min(tilesX - 1, Math.floor(x / tileW));
      const v = stretched[y * width + x];
      const eq = luts[ty][tx][v];
      out[y * width + x] = clampByte(Math.round(0.6 * v + 0.4 * eq));
    }
  }
  return out;
}

/**
 * Step 5A: Segment the Glass Bottle ROI under diffuse backlighting.
 * Estimates corner background brightness and finds the central bottle silhouette.
 */
export function segmentBottleRoi(
  gray: Uint8Array,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  // Estimate background intensity from corner patches
  const patchW = Math.max(6, Math.floor(width * 0.08));
  const patchH = Math.max(6, Math.floor(height * 0.08));
  let bgSum = 0;
  let bgCount = 0;
  const corners = [
    [0, 0],
    [width - patchW, 0],
    [0, height - patchH],
    [width - patchW, height - patchH],
  ];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + patchH; y++) {
      for (let x = cx; x < cx + patchW; x++) {
        bgSum += gray[y * width + x];
        bgCount++;
      }
    }
  }
  const bgMean = bgSum / Math.max(1, bgCount);

  // Measure horizontal deviation from background across central rows
  const colScore = new Float32Array(width);
  const yStart = Math.floor(height * 0.12);
  const yEnd = Math.floor(height * 0.88);
  for (let x = 1; x < width - 1; x++) {
    let diffAcc = 0;
    for (let y = yStart; y < yEnd; y++) {
      const idx = y * width + x;
      const bgDiff = Math.abs(gray[idx] - bgMean);
      const grad = Math.abs(gray[idx + 1] - gray[idx - 1]);
      diffAcc += bgDiff * 0.6 + grad * 1.4;
    }
    colScore[x] = diffAcc / Math.max(1, yEnd - yStart);
  }

  let maxCol = 0;
  for (let x = 0; x < width; x++) {
    if (colScore[x] > maxCol) maxCol = colScore[x];
  }
  const colThresh = Math.max(6, maxCol * 0.24);
  let left = Math.floor(width * 0.18);
  let right = Math.floor(width * 0.82);
  for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.45); x++) {
    if (colScore[x] > colThresh) {
      left = x;
      break;
    }
  }
  for (let x = Math.floor(width * 0.95); x > Math.floor(width * 0.55); x--) {
    if (colScore[x] > colThresh) {
      right = x;
      break;
    }
  }

  // Ensure sensible bounds if background is uniform
  if (right - left < width * 0.2) {
    left = Math.floor(width * 0.22);
    right = Math.floor(width * 0.78);
  }

  const rowScore = new Float32Array(height);
  for (let y = 1; y < height - 1; y++) {
    let diffAcc = 0;
    for (let x = left; x <= right; x++) {
      const idx = y * width + x;
      const bgDiff = Math.abs(gray[idx] - bgMean);
      const grad = Math.abs(gray[(y + 1) * width + x] - gray[(y - 1) * width + x]);
      diffAcc += bgDiff * 0.6 + grad * 1.4;
    }
    rowScore[y] = diffAcc / Math.max(1, right - left + 1);
  }
  let maxRow = 0;
  for (let y = 0; y < height; y++) {
    if (rowScore[y] > maxRow) maxRow = rowScore[y];
  }
  const rowThresh = Math.max(5, maxRow * 0.22);
  let top = Math.floor(height * 0.08);
  let bottom = Math.floor(height * 0.92);
  for (let y = Math.floor(height * 0.04); y < Math.floor(height * 0.4); y++) {
    if (rowScore[y] > rowThresh) {
      top = y;
      break;
    }
  }
  for (let y = Math.floor(height * 0.96); y > Math.floor(height * 0.6); y--) {
    if (rowScore[y] > rowThresh) {
      bottom = y;
      break;
    }
  }
  if (bottom - top < height * 0.3) {
    top = Math.floor(height * 0.1);
    bottom = Math.floor(height * 0.9);
  }

  return {
    x: left,
    y: top,
    width: Math.max(20, right - left + 1),
    height: Math.max(20, bottom - top + 1),
  };
}

/**
 * Step 5B: Adaptive + Global Thresholding (detects dark crack valleys against local neighborhood)
 */
export function adaptiveThresholdMask(
  enhanced: Uint8Array,
  width: number,
  height: number,
  thresholdValue: number
): Uint8Array {
  // Integral image for fast 15x15 local neighborhood mean
  const integral = new Int32Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += enhanced[(y - 1) * width + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }

  const r = 9; // 19x19 local window
  // Bias C modulated by thresholdValue (135 is neutral C=12)
  const C = Math.max(5, Math.round(12 + (135 - thresholdValue) * 0.16));
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const localMean = sum / area;
      const val = enhanced[y * width + x];

      // Under diffuse backlighting, cracks appear as sharp local dark discontinuities
      if (val < localMean - C && val < thresholdValue + 55) {
        mask[y * width + x] = 255;
      }
    }
  }
  return mask;
}

/**
 * Step 6: Morphological Operations (Closing to bridge crack gaps, Opening to suppress speckle noise)
 */
function dilateOrErode(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  isDilate: boolean
): Uint8Array {
  const dst = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      let hit = isDilate ? 0 : 255;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx++) {
          const v = src[row + xx];
          if (isDilate && v > 0) {
            hit = 255;
            break;
          }
          if (!isDilate && v === 0) {
            hit = 0;
            break;
          }
        }
        if ((isDilate && hit === 255) || (!isDilate && hit === 0)) break;
      }
      dst[y * width + x] = hit;
    }
  }
  return dst;
}

export function morphologicalProcess(
  mask: Uint8Array,
  width: number,
  height: number,
  kernelSize: number
): Uint8Array {
  const radius = Math.max(1, Math.floor((kernelSize - 1) / 2));
  // Closing: dilate -> erode (connects broken segments along a hairline crack)
  const dilated = dilateOrErode(mask, width, height, radius, true);
  const closed = dilateOrErode(dilated, width, height, radius, false);
  // Light opening (radius 1) if kernel >= 5 to eliminate isolated 1px dots
  if (kernelSize >= 5) {
    const eroded = dilateOrErode(closed, width, height, 1, false);
    return dilateOrErode(eroded, width, height, 1, true);
  }
  return closed;
}

/**
 * Step 7: Canny Edge Detection (Sobel -> Non-Maximum Suppression -> Double Threshold -> Hysteresis)
 */
export function cannyEdgeDetection(
  enhanced: Uint8Array,
  width: number,
  height: number,
  lowThresh: number,
  highThresh: number
): Uint8Array {
  const mag = new Float32Array(width * height);
  const dir = new Uint8Array(width * height); // 0:0deg, 1:45deg, 2:90deg, 3:135deg

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const p00 = enhanced[(y - 1) * width + (x - 1)];
      const p01 = enhanced[(y - 1) * width + x];
      const p02 = enhanced[(y - 1) * width + (x + 1)];
      const p10 = enhanced[y * width + (x - 1)];
      const p12 = enhanced[y * width + (x + 1)];
      const p20 = enhanced[(y + 1) * width + (x - 1)];
      const p21 = enhanced[(y + 1) * width + x];
      const p22 = enhanced[(y + 1) * width + (x + 1)];

      const gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;
      const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
      mag[idx] = Math.hypot(gx, gy) * 0.72;

      let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      if (angle < 22.5 || angle >= 157.5) dir[idx] = 0;
      else if (angle < 67.5) dir[idx] = 1;
      else if (angle < 112.5) dir[idx] = 2;
      else dir[idx] = 3;
    }
  }

  // Non-Maximum Suppression + Double Threshold
  const low = Math.min(lowThresh, highThresh - 5);
  const high = Math.max(low + 5, highThresh);
  const state = new Uint8Array(width * height); // 0=none, 1=weak, 2=strong
  const queue: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const m = mag[idx];
      if (m < low) continue;

      let m1 = 0;
      let m2 = 0;
      const d = dir[idx];
      if (d === 0) {
        m1 = mag[idx - 1];
        m2 = mag[idx + 1];
      } else if (d === 1) {
        m1 = mag[(y - 1) * width + (x + 1)];
        m2 = mag[(y + 1) * width + (x - 1)];
      } else if (d === 2) {
        m1 = mag[(y - 1) * width + x];
        m2 = mag[(y + 1) * width + x];
      } else {
        m1 = mag[(y - 1) * width + (x - 1)];
        m2 = mag[(y + 1) * width + (x + 1)];
      }

      if (m >= m1 && m >= m2) {
        if (m >= high) {
          state[idx] = 2;
          queue.push(idx);
        } else {
          state[idx] = 1;
        }
      }
    }
  }

  // Hysteresis 8-connected BFS
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy <= 0 || yy >= height - 1) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx;
        if (xx <= 0 || xx >= width - 1) continue;
        const nIdx = yy * width + xx;
        if (state[nIdx] === 1) {
          state[nIdx] = 2;
          queue.push(nIdx);
        }
      }
    }
  }

  const edges = new Uint8Array(width * height);
  for (let i = 0; i < edges.length; i++) {
    edges[i] = state[i] === 2 ? 255 : 0;
  }
  return edges;
}

function describeLocation(
  cx: number,
  cy: number,
  roi: { x: number; y: number; width: number; height: number }
): string {
  const relX = (cx - roi.x) / Math.max(1, roi.width);
  const relY = (cy - roi.y) / Math.max(1, roi.height);
  const vZone =
    relY < 0.28 ? 'Upper Shoulder / Neck' : relY < 0.68 ? 'Mid Body Wall' : 'Lower Base Wall';
  const hZone = relX < 0.36 ? 'Left' : relX > 0.64 ? 'Right' : 'Center';
  return `${vZone} (${hZone})`;
}

/**
 * Steps 8, 9, 10: Contour Analysis, Defect Feature Extraction, False-Positive Filtering,
 * Rule-Based Classification & Bounding Box Annotation.
 */
export function runGlassCrackPipeline(
  input: RawImageData,
  config: CVCalibrationConfig = DEFAULT_CV_CONFIG,
  includeSteps = false
): CVPipelineOutput {
  const t0 = performance.now();
  const resized = resizeRgbaIfNeeded(input, 560);
  const { width, height, data } = resized;

  // Step 2: Grayscale
  const gray = toGrayscale(data, width, height);

  // Step 3: Gaussian Blur
  const blurred = gaussianBlur(gray, width, height, config.gaussianKernel);

  // Step 4: Contrast Enhancement
  const enhanced = enhanceContrast(blurred, width, height, config.contrastAlpha);

  // Step 5: Bottle ROI + Adaptive Thresholding
  const bottleRoi = segmentBottleRoi(blurred, width, height);
  const threshMask = adaptiveThresholdMask(enhanced, width, height, config.thresholdValue);

  // Step 6: Morphological Operations
  const morphMask = morphologicalProcess(threshMask, width, height, config.morphKernel);

  // Step 7: Canny Edge Detection
  const cannyEdges = cannyEdgeDetection(
    enhanced,
    width,
    height,
    config.cannyLow,
    config.cannyHigh
  );

  // Build interior bottle inspection mask:
  // Exclude outer glass wall vertical silhouette edges (left/right 9% of bottle width)
  // and top/bottom cap/base rim bands (top 8%, bottom 7% of bottle height),
  // so intact bottle outlines never trigger false positives.
  const insetX = Math.max(12, Math.round(bottleRoi.width * 0.12));
  const insetYTop = Math.max(14, Math.round(bottleRoi.height * 0.145));
  const insetYBot = Math.max(10, Math.round(bottleRoi.height * 0.08));
  const innerX0 = Math.max(4, bottleRoi.x + insetX);
  const innerX1 = Math.min(width - 5, bottleRoi.x + bottleRoi.width - insetX);
  const innerY0 = Math.max(4, bottleRoi.y + insetYTop);
  const innerY1 = Math.min(height - 5, bottleRoi.y + bottleRoi.height - insetYBot);

  // Combine morphological defect blobs with interior Canny edges inside the inspection ROI
  const combinedDefectMap = new Uint8Array(width * height);
  const roiEdgeMap = new Uint8Array(width * height);
  for (let y = innerY0; y <= innerY1; y++) {
    const row = y * width;
    for (let x = innerX0; x <= innerX1; x++) {
      const idx = row + x;
      if (cannyEdges[idx] > 0) roiEdgeMap[idx] = 255;
      if (morphMask[idx] > 0 || cannyEdges[idx] > 0) {
        combinedDefectMap[idx] = 255;
      }
    }
  }

  // Dilate slightly by 1px for contour grouping of closely parallel crack edges
  const groupedMap = dilateOrErode(combinedDefectMap, width, height, 1, true);

  // Step 8: Connected Component / Contour Analysis
  const visited = new Uint8Array(width * height);
  const acceptedRegions: DefectRegion[] = [];
  const rejectedCandidates: DefectRegion[] = [];
  const contourOverlay = new Uint8Array(width * height * 4);
  contourOverlay.set(data);

  let nextId = 1;
  const stack: number[] = [];

  for (let y = innerY0; y <= innerY1; y++) {
    for (let x = innerX0; x <= innerX1; x++) {
      const startIdx = y * width + x;
      if (groupedMap[startIdx] === 0 || visited[startIdx]) continue;

      visited[startIdx] = 1;
      stack.length = 0;
      stack.push(startIdx);

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let rawArea = 0;
      let edgeHits = 0;
      let morphHits = 0;
      let sumX = 0;
      let sumY = 0;
      const pixels: number[] = [];

      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cx = cur % width;
        const cy = (cur / width) | 0;
        pixels.push(cur);

        if (combinedDefectMap[cur] > 0) rawArea++;
        if (roiEdgeMap[cur] > 0) edgeHits++;
        if (morphMask[cur] > 0) morphHits++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        sumX += cx;
        sumY += cy;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < innerY0 || ny > innerY1) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < innerX0 || nx > innerX1) continue;
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && groupedMap[nIdx] > 0) {
              visited[nIdx] = 1;
              stack.push(nIdx);
            }
          }
        }
      }

      if (rawArea < 6) continue; // Skip microscopic 1-5px noise before logging

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const bboxArea = Math.max(1, bw * bh);
      const majorLen = Math.hypot(bw, bh);
      const minorWidth = Math.max(1, Math.min(bw, bh));
      const aspectRatio = Number((Math.max(bw, bh) / minorWidth).toFixed(2));
      const edgeDensity = Number((edgeHits / bboxArea).toFixed(3));
      const solidity = Number((rawArea / bboxArea).toFixed(3));
      const thicknessEstimate = Number((rawArea / Math.max(1, majorLen)).toFixed(2));

      const centroidX = sumX / pixels.length;
      const centroidY = sumY / pixels.length;
      const regionLocation = describeLocation(centroidX, centroidY, bottleRoi);

      // Shape classification
      let shapeCharacteristics = 'Irregular Fracture';
      if (aspectRatio >= 2.2 && thicknessEstimate <= 10) {
        shapeCharacteristics = 'Elongated Hairline Crack';
      } else if (rawArea > config.minContourArea * 4 && edgeHits > 35) {
        shapeCharacteristics = 'Branching / Shattered Fracture';
      } else if (solidity > 0.68 && aspectRatio < 1.35) {
        shapeCharacteristics = 'Compact Blob / Droplet';
      }

      // Compute per-region Heuristic Score (0..100)
      const lenScore = Math.min(35, (majorLen / Math.max(1, config.minCrackLength)) * 20);
      const areaScore = Math.min(25, (rawArea / Math.max(1, config.minContourArea)) * 14);
      const elongScore = Math.min(20, aspectRatio * 6.5);
      const continuityScore = Math.min(
        20,
        (edgeHits >= 12 ? 12 : edgeHits > 0 ? 4 : 0) + (morphHits > 0 ? 8 : 0)
      );
      const regionScore = Math.min(
        100,
        Math.round(lenScore + areaScore + elongScore + continuityScore)
      );

      // Step 9: False-Positive Filtering Rules
      // A true crack requires sharp Canny edge corroboration (not just smooth wall shading).
      let rejectionReason: string | undefined;
      if (rawArea < config.minContourArea) {
        rejectionReason = `Area ${rawArea}px² < min ${config.minContourArea}px²`;
      } else if (majorLen < config.minCrackLength) {
        rejectionReason = `Length ${majorLen.toFixed(1)}px < min ${config.minCrackLength}px`;
      } else if (edgeHits < 10 || (edgeDensity < config.edgeDensityThreshold && edgeHits < 24)) {
        rejectionReason = `Low Canny edge density (${edgeDensity}, ${edgeHits} edge px) — smooth shading/wall refraction`;
      } else if (
        solidity > 0.72 &&
        aspectRatio < Math.min(1.4, config.minAspectRatio * 0.75) &&
        rawArea < config.minContourArea * 3.5
      ) {
        rejectionReason = `Compact circular shape (AR ${aspectRatio}) — likely water droplet or dust`;
      }

      const candidate: DefectRegion = {
        id: nextId++,
        x: Math.max(0, minX - 4),
        y: Math.max(0, minY - 4),
        width: Math.min(width - Math.max(0, minX - 4), bw + 8),
        height: Math.min(height - Math.max(0, minY - 4), bh + 8),
        area: rawArea,
        aspectRatio,
        length: Number(majorLen.toFixed(1)),
        widthPx: thicknessEstimate,
        edgeDensity,
        solidity,
        shapeCharacteristics,
        regionLocation,
        heuristicScore: regionScore,
        accepted: !rejectionReason,
        rejectionReason,
      };

      if (!rejectionReason) {
        acceptedRegions.push(candidate);
        // Highlight accepted contour pixels in contourOverlay (cyan/red)
        for (const pIdx of pixels) {
          const o = pIdx * 4;
          contourOverlay[o] = 220;
          contourOverlay[o + 1] = 38;
          contourOverlay[o + 2] = 38;
        }
      } else {
        rejectedCandidates.push(candidate);
        for (const pIdx of pixels) {
          const o = pIdx * 4;
          contourOverlay[o] = 56;
          contourOverlay[o + 1] = 189;
          contourOverlay[o + 2] = 248;
        }
      }
    }
  }

  // Sort accepted regions by heuristicScore descending
  acceptedRegions.sort((a, b) => b.heuristicScore - a.heuristicScore);

  // Step 10: Overall Rule-Based Classification
  const maxRegionScore =
    acceptedRegions.length > 0 ? acceptedRegions[0].heuristicScore : 0;
  const totalCrackArea = acceptedRegions.reduce((acc, r) => acc + r.area, 0);
  const borderlineScore =
    acceptedRegions.length === 0 && rejectedCandidates.length > 0
      ? Math.max(
          0,
          ...rejectedCandidates
            .filter(
              (r) =>
                r.edgeDensity >= 0.03 &&
                r.area >= config.minContourArea * 0.55 &&
                r.length >= config.minCrackLength * 0.65
            )
            .map((r) => Math.round(r.heuristicScore * 0.65))
        )
      : 0;

  const overallHeuristicScore = Math.min(
    100,
    Math.round(
      acceptedRegions.length > 0
        ? Math.min(100, maxRegionScore + Math.min(18, (acceptedRegions.length - 1) * 7) + Math.min(10, totalCrackArea / 120))
        : borderlineScore
    )
  );

  let classification: ClassificationLabel = 'NORMAL';
  if (
    acceptedRegions.length > 0 &&
    overallHeuristicScore >= config.crackScoreThreshold
  ) {
    classification = 'SUSPECTED CRACK';
  } else if (
    acceptedRegions.length > 0 ||
    overallHeuristicScore >= config.manualScoreThreshold
  ) {
    classification = 'MANUAL INSPECTION REQUIRED';
  }

  // Draw annotated output RGBA image
  const processedRgba = new Uint8Array(data);
  // Draw subtle bottle ROI dashed/thin blue guide frame
  drawRect(
    processedRgba,
    width,
    height,
    bottleRoi.x,
    bottleRoi.y,
    bottleRoi.width,
    bottleRoi.height,
    [14, 165, 233],
    1
  );

  const boxColor: [number, number, number] =
    classification === 'SUSPECTED CRACK'
      ? [220, 38, 38] // Red #DC2626
      : [217, 119, 6]; // Orange #D97706

  for (const reg of acceptedRegions) {
    // Draw crisp 3px bounding box + corner brackets
    drawRect(processedRgba, width, height, reg.x, reg.y, reg.width, reg.height, boxColor, 3);
    // Tint detected edge pixels subtly inside the bounding box
    for (let yy = reg.y; yy < Math.min(height, reg.y + reg.height); yy++) {
      for (let xx = reg.x; xx < Math.min(width, reg.x + reg.width); xx++) {
        const idx = yy * width + xx;
        if (roiEdgeMap[idx] > 0) {
          const p = idx * 4;
          processedRgba[p] = 239;
          processedRgba[p + 1] = 45;
          processedRgba[p + 2] = 45;
        }
      }
    }
  }

  // If Manual Inspection Required with 0 accepted regions but borderline candidate, draw orange box on top candidate
  if (
    classification === 'MANUAL INSPECTION REQUIRED' &&
    acceptedRegions.length === 0 &&
    rejectedCandidates.length > 0
  ) {
    const topBorderline = [...rejectedCandidates].sort(
      (a, b) => b.heuristicScore - a.heuristicScore
    )[0];
    if (topBorderline) {
      drawRect(
        processedRgba,
        width,
        height,
        topBorderline.x,
        topBorderline.y,
        topBorderline.width,
        topBorderline.height,
        [217, 119, 6],
        2
      );
    }
  }

  const processingTimeMs = Number((performance.now() - t0).toFixed(2));

  let steps: PipelineStepBuffer[] | undefined;
  if (includeSteps) {
    const roiVisual = new Uint8Array(data);
    drawRect(
      roiVisual,
      width,
      height,
      bottleRoi.x,
      bottleRoi.y,
      bottleRoi.width,
      bottleRoi.height,
      [37, 99, 235],
      2
    );
    drawRect(
      roiVisual,
      width,
      height,
      innerX0,
      innerY0,
      innerX1 - innerX0,
      innerY1 - innerY0,
      [16, 185, 129],
      1
    );

    const edgeCount = roiEdgeMap.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
    const morphCount = morphMask.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);

    steps = [
      {
        step: 1,
        title: 'Original Image',
        description: 'Captured input frame resized to inspection resolution.',
        stats: `${width} × ${height} px`,
        rgba: new Uint8Array(data),
      },
      {
        step: 2,
        title: 'Grayscale Conversion',
        description: 'Luminance extraction (0.299R + 0.587G + 0.114B) to simplify intensity analysis.',
        stats: `8-bit single channel`,
        rgba: grayToRgba(gray, width, height),
      },
      {
        step: 3,
        title: 'Noise Reduction (Gaussian Blur)',
        description: 'Separable 2D Gaussian smoothing suppressing sensor grain and micro-dust.',
        stats: `Kernel: ${config.gaussianKernel}×${config.gaussianKernel}`,
        rgba: grayToRgba(blurred, width, height),
      },
      {
        step: 4,
        title: 'Contrast Enhancement (CLAHE + Stretch)',
        description: 'Local tile histogram equalization and contrast scaling to amplify hairline cracks.',
        stats: `Alpha: ${config.contrastAlpha.toFixed(2)}×`,
        rgba: grayToRgba(enhanced, width, height),
      },
      {
        step: 5,
        title: 'Segmentation & Thresholding',
        description: 'Adaptive local thresholding combined with bottle ROI boundary isolation.',
        stats: `Threshold bias: ${config.thresholdValue} · ROI ${bottleRoi.width}×${bottleRoi.height}`,
        rgba: binaryToRgba(threshMask, width, height, [248, 250, 252], [15, 23, 42]),
      },
      {
        step: 6,
        title: 'Morphological Processing',
        description: 'Morphological closing bridges crack discontinuities; opening suppresses speckles.',
        stats: `Kernel: ${config.morphKernel}×${config.morphKernel} · ${morphCount} fg px`,
        rgba: binaryToRgba(morphMask, width, height, [56, 189, 248], [15, 23, 42]),
      },
      {
        step: 7,
        title: 'Canny Edge Detection',
        description: 'Sobel gradients, Non-Maximum Suppression, and hysteresis edge tracking.',
        stats: `Thresholds: ${config.cannyLow} / ${config.cannyHigh} · ${edgeCount} edge px`,
        rgba: binaryToRgba(cannyEdges, width, height, [255, 255, 255], [9, 13, 22]),
      },
      {
        step: 8,
        title: 'Contour Analysis',
        description: '8-connected component tracing inside bottle interior (red = accepted, cyan = filtered).',
        stats: `${acceptedRegions.length + rejectedCandidates.length} contours traced`,
        rgba: contourOverlay,
      },
      {
        step: 9,
        title: 'Feature Extraction & ROI Filter',
        description: 'Extracts area, aspect ratio, length, thickness, and edge density inside inspection ROI.',
        stats: `${acceptedRegions.length} accepted · ${rejectedCandidates.length} false-positives filtered`,
        rgba: roiVisual,
      },
      {
        step: 10,
        title: 'Rule-Based Classification',
        description: 'Multi-feature heuristic scoring classifies bottle and renders red bounding boxes.',
        stats: `${classification} · Heuristic Score ${overallHeuristicScore}/100`,
        rgba: new Uint8Array(processedRgba),
      },
    ];
  }

  return {
    classification,
    heuristicScore: overallHeuristicScore,
    defectCount: acceptedRegions.length,
    processingTimeMs,
    imageWidth: width,
    imageHeight: height,
    bottleRoi,
    regions: acceptedRegions,
    rejectedCandidates: rejectedCandidates.slice(0, 12),
    processedRgba,
    steps,
  };
}

function drawRect(
  rgba: Uint8Array,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
  thickness: number
) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(imgW - 1, Math.round(x + w));
  const y1 = Math.min(imgH - 1, Math.round(y + h));

  for (let t = 0; t < thickness; t++) {
    // Top & bottom horizontal bars
    for (let xx = x0; xx <= x1; xx++) {
      if (y0 + t < imgH) setPixel(rgba, imgW, xx, y0 + t, color);
      if (y1 - t >= 0) setPixel(rgba, imgW, xx, y1 - t, color);
    }
    // Left & right vertical bars
    for (let yy = y0; yy <= y1; yy++) {
      if (x0 + t < imgW) setPixel(rgba, imgW, x0 + t, yy, color);
      if (x1 - t >= 0) setPixel(rgba, imgW, x1 - t, yy, color);
    }
  }
}

function setPixel(
  rgba: Uint8Array,
  imgW: number,
  x: number,
  y: number,
  color: [number, number, number]
) {
  const idx = (y * imgW + x) * 4;
  rgba[idx] = color[0];
  rgba[idx + 1] = color[1];
  rgba[idx + 2] = color[2];
  rgba[idx + 3] = 255;
}
