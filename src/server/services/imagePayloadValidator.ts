const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION_PX = 12_000;
const MAX_PIXELS = 48_000_000;

export interface ImageValidationResult {
  ok: true;
  normalizedMimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
}

export interface ImageValidationFailure {
  ok: false;
  statusCode: 400 | 413;
  error: string;
}

function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return null;
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function readJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 8 >= buf.length) return null;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= buf.length) break;
    const segmentLen = buf.readUInt16BE(offset + 2);
    if (segmentLen < 2) break;
    offset += 2 + segmentLen;
  }
  return null;
}

function isWebpSignature(buf: Buffer): boolean {
  return (
    buf.length >= 16 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  );
}

function readWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (!isWebpSignature(buf) || buf.length < 30) return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buf.length >= 30) {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  if (chunk === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

export function validateImagePayload(
  imageBase64: string,
  mimeType?: string
): ImageValidationResult | ImageValidationFailure {
  const cleanMime = (mimeType || 'image/jpeg').trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(cleanMime)) {
    return {
      ok: false,
      statusCode: 400,
      error: `Unsupported image MIME type "${cleanMime}". Allowed: JPEG, PNG, WebP.`,
    };
  }

  const stripped = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
  if (!stripped || stripped.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(stripped)) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Invalid base64 image encoding.',
    };
  }

  const approxBytes = Math.ceil((stripped.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      statusCode: 413,
      error: 'Payload exceeds maximum 8MB size limit.',
    };
  }

  const buf = Buffer.from(stripped, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      statusCode: 413,
      error: 'Payload exceeds maximum 8MB size limit.',
    };
  }

  const pngDims = readPngDimensions(buf);
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = isWebpSignature(buf);

  if (!pngDims && !isJpeg && !isWebp) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Decoded image bytes do not match a valid JPEG, PNG, or WebP file.',
    };
  }

  const dims = pngDims ?? (isJpeg ? readJpegDimensions(buf) : readWebpDimensions(buf));
  if (dims) {
    if (
      dims.width <= 0 ||
      dims.height <= 0 ||
      dims.width > MAX_DIMENSION_PX ||
      dims.height > MAX_DIMENSION_PX ||
      dims.width * dims.height > MAX_PIXELS
    ) {
      return {
        ok: false,
        statusCode: 400,
        error: `Image dimensions (${dims.width}×${dims.height}) exceed safe processing limits.`,
      };
    }
  }

  const normalizedMimeType = pngDims
    ? 'image/png'
    : isWebp
      ? 'image/webp'
      : 'image/jpeg';

  return {
    ok: true,
    normalizedMimeType,
    byteLength: buf.length,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}
