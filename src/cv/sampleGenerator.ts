import { LightingCondition } from '../types/inspection';
import { RawImageData } from './pipeline';

export type BottleSampleVariant =
  | 'normal'
  | 'crack_diagonal'
  | 'crack_vertical'
  | 'broken_radiating'
  | 'dust_noise'
  | 'borderline_scratch';

function lightingTint(condition: LightingCondition): {
  bgRgb: [number, number, number];
  noiseAmp: number;
} {
  switch (condition) {
    case 'Medium red lighting':
      return { bgRgb: [232, 138, 134], noiseAmp: 4 };
    case 'High-intensity cozy lighting':
      return { bgRgb: [252, 232, 200], noiseAmp: 2 };
    case 'Medium-intensity cozy lighting':
      return { bgRgb: [222, 198, 166], noiseAmp: 4 };
    case 'High-intensity warm lighting':
      return { bgRgb: [254, 240, 210], noiseAmp: 2 };
    case 'Medium-intensity warm lighting':
      return { bgRgb: [228, 208, 178], noiseAmp: 4 };
    case 'High-intensity normal lighting':
      return { bgRgb: [248, 251, 255], noiseAmp: 2 };
    case 'Medium-intensity normal lighting':
    default:
      return { bgRgb: [216, 224, 234], noiseAmp: 3 };
  }
}

function deterministicNoise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Generates a realistic 480x360 backlit glass bottle/jar RGBA image matching the
 * experimental setup (diffuse LED backlight panel + central clear glass jar).
 */
export function generateBacklitBottleSample(
  variant: BottleSampleVariant,
  lighting: LightingCondition = 'High-intensity normal lighting',
  seed = 1
): RawImageData {
  const width = 480;
  const height = 360;
  const data = new Uint8Array(width * height * 4);
  const { bgRgb, noiseAmp } = lightingTint(lighting);

  const cx = width * 0.5;
  const bodyHalfW = 78;
  const topY = 46;
  const shoulderY = 92;
  const bottomY = 314;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Smooth diffuse LED backlight falloff toward edges
      const dxBg = (x - cx) / (width * 0.65);
      const dyBg = (y - height * 0.5) / (height * 0.65);
      const vignette = Math.max(0.76, 1 - 0.16 * (dxBg * dxBg + dyBg * dyBg));

      let r = bgRgb[0] * vignette;
      let g = bgRgb[1] * vignette;
      let b = bgRgb[2] * vignette;

      // Determine bottle profile half-width at current Y
      let halfW = 0;
      if (y >= topY && y <= bottomY) {
        if (y < shoulderY) {
          const t = (y - topY) / (shoulderY - topY);
          const neckW = 46;
          halfW = neckW + (bodyHalfW - neckW) * Math.sin((t * Math.PI) / 2);
        } else {
          halfW = bodyHalfW;
        }
      }

      const distFromCenter = Math.abs(x - cx);
      if (halfW > 0 && distFromCenter <= halfW) {
        const normX = distFromCenter / halfW;
        // Glass refraction darkening near left/right wall thickness + subtle vertical highlight
        const wallAtten =
          normX > 0.87
            ? 0.42 + (1 - normX) * 2.1
            : normX > 0.78
            ? 0.86
            : 0.94 - 0.03 * Math.cos(normX * Math.PI);

        // Top rim & base thickness bands
        const rimAtten =
          y < topY + 11 || y > bottomY - 12 ? 0.58 : 1.0;

        r *= wallAtten * rimAtten;
        g *= wallAtten * rimAtten;
        b *= wallAtten * rimAtten;

        // Subtle glass green-blue tint
        g = Math.min(255, g * 1.015);
        b = Math.min(255, b * 1.02);
      }

      const n = deterministicNoise(x, y, seed) * noiseAmp;
      const idx = (y * width + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(r + n)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g + n)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b + n)));
      data[idx + 3] = 255;
    }
  }

  // Helper to etch dark high-contrast crack line with jagged organic jitter
  const drawCrackSegment = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    darkness: number,
    jitterSeed: number
  ) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps);
      const jx = Math.sin(t * 21 + jitterSeed) * 2.4;
      const jy = Math.cos(t * 17 + jitterSeed) * 1.6;
      const px = Math.round(x0 + (x1 - x0) * t + jx);
      const py = Math.round(y0 + (y1 - y0) * t + jy);
      const rad = Math.ceil(thickness);
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx < 1 || xx >= width - 1 || yy < 1 || yy >= height - 1) continue;
          const d = Math.hypot(dx, dy);
          if (d <= thickness + 0.35) {
            const factor = Math.max(0.12, 1 - darkness * (1 - d / (thickness + 1.1)));
            const idx = (yy * width + xx) * 4;
            data[idx] = Math.round(data[idx] * factor);
            data[idx + 1] = Math.round(data[idx + 1] * factor);
            data[idx + 2] = Math.round(data[idx + 2] * factor);
          }
        }
      }
    }
  };

  if (variant === 'crack_diagonal') {
    drawCrackSegment(cx - 34, 155, cx + 38, 242, 1.4, 0.78, seed);
    drawCrackSegment(cx + 4, 198, cx + 26, 212, 1.0, 0.65, seed + 2);
  } else if (variant === 'crack_vertical') {
    drawCrackSegment(cx - 16, 122, cx - 28, 255, 1.5, 0.8, seed + 3);
  } else if (variant === 'broken_radiating') {
    const hubX = cx + 12;
    const hubY = 175;
    drawCrackSegment(hubX, hubY, cx - 44, 118, 1.7, 0.84, seed + 1);
    drawCrackSegment(hubX, hubY, cx + 48, 134, 1.6, 0.82, seed + 2);
    drawCrackSegment(hubX, hubY, cx - 36, 258, 1.8, 0.85, seed + 3);
    drawCrackSegment(hubX, hubY, cx + 42, 266, 1.5, 0.8, seed + 4);
    drawCrackSegment(cx - 22, 206, cx + 32, 192, 1.3, 0.74, seed + 5);
  } else if (variant === 'dust_noise') {
    // Tiny isolated 2px specks well below minContourArea
    const specks = [
      [cx - 20, 140],
      [cx + 18, 195],
      [cx - 8, 245],
    ];
    for (const [sx, sy] of specks) {
      drawCrackSegment(sx, sy, sx + 2, sy + 2, 0.8, 0.65, seed);
    }
  } else if (variant === 'borderline_scratch') {
    // Short subtle low-contrast scuff (~19px) to test MANUAL INSPECTION REQUIRED
    drawCrackSegment(cx - 10, 185, cx + 10, 203, 1.0, 0.42, seed + 8);
  }

  return { width, height, data };
}
