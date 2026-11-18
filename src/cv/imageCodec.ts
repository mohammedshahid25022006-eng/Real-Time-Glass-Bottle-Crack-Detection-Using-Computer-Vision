import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { RawImageData } from './pipeline';

/**
 * Decode PNG, JPEG/JPG, or BMP (24-bit/32-bit uncompressed) buffer into RawImageData.
 */
export function decodeImageBuffer(buffer: Buffer, mimeOrName = ''): RawImageData {
  const hint = mimeOrName.toLowerCase();

  // Check PNG magic bytes: 89 50 4E 47
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const parsed = PNG.sync.read(buffer);
    return {
      width: parsed.width,
      height: parsed.height,
      data: new Uint8Array(parsed.data),
    };
  }

  // Check JPEG magic bytes: FF D8
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8Array(decoded.data),
    };
  }

  // Check BMP magic bytes: 42 4D ('BM')
  if (
    (buffer.length > 54 && buffer[0] === 0x42 && buffer[1] === 0x4d) ||
    hint.endsWith('.bmp')
  ) {
    return decodeBmp(buffer);
  }

  // Fallback attempt PNG then JPEG
  try {
    const parsed = PNG.sync.read(buffer);
    return {
      width: parsed.width,
      height: parsed.height,
      data: new Uint8Array(parsed.data),
    };
  } catch {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8Array(decoded.data),
    };
  }
}

function decodeBmp(buffer: Buffer): RawImageData {
  if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
    throw new Error('Invalid BMP file header');
  }
  const dataOffset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const bpp = buffer.readUInt16LE(28);
  if (bpp !== 24 && bpp !== 32) {
    throw new Error(`Unsupported BMP bit depth: ${bpp}. Please use 24-bit or 32-bit BMP.`);
  }
  const bytesPerPixel = bpp / 8;
  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    const rowStart = dataOffset + srcY * rowStride;
    for (let x = 0; x < width; x++) {
      const srcIdx = rowStart + x * bytesPerPixel;
      const dstIdx = (y * width + x) * 4;
      rgba[dstIdx] = buffer[srcIdx + 2];     // R
      rgba[dstIdx + 1] = buffer[srcIdx + 1]; // G
      rgba[dstIdx + 2] = buffer[srcIdx];     // B
      rgba[dstIdx + 3] = bpp === 32 ? buffer[srcIdx + 3] : 255;
    }
  }
  return { width, height, data: rgba };
}

export function encodePngBuffer(img: RawImageData): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

export function encodePngDataUrl(img: RawImageData): string {
  return `data:image/png;base64,${encodePngBuffer(img).toString('base64')}`;
}

export function decodeDataUrl(dataUrl: string): RawImageData {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL');
  }
  const buf = Buffer.from(match[2], 'base64');
  return decodeImageBuffer(buf, match[1]);
}
