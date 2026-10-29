import {
  canvasToBlob,
  context2d,
  createCanvas,
  drawRegion,
  fitWithin,
  loadImageFile,
  type EncodeFormat,
} from "./encode";

export type CompressGoal = "quality" | "target" | "percent";

export type CompressRequest = {
  goal: CompressGoal;
  /** 1–100. Used directly by the quality goal, and as the ceiling otherwise. */
  quality: number;
  /** Absolute byte target for the target goal. */
  targetBytes: number;
  /** 1–95: how much of the original size to remove. */
  percent: number;
  format: EncodeFormat;
  /** Longest-edge limit, or null to keep the source size. */
  maxEdge: number | null;
  /** Return the original file when re-encoding makes it bigger. */
  keepOriginalIfLarger: boolean;
  sharpen?: number;
};

export type CompressOutcome = {
  blob: Blob;
  width: number;
  height: number;
  /** Quality actually used for the final encode. */
  quality: number;
  bytes: number;
  originalBytes: number;
  keptOriginal: boolean;
  format: EncodeFormat;
};

const QUALITY_FLOOR = 20;
const QUALITY_CEILING = 96;

function scaleCanvas(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function isLossy(format: EncodeFormat): boolean {
  return format !== "png";
}

async function encodeAt(canvas: HTMLCanvasElement, format: EncodeFormat, quality: number) {
  return canvasToBlob(canvas, format, quality / 100);
}

/**
 * Encode a canvas at the highest quality that fits `targetBytes`.
 * Returns the smallest result when even the floor overshoots.
 */
async function encodeWithin(
  canvas: HTMLCanvasElement,
  format: EncodeFormat,
  targetBytes: number,
): Promise<{ blob: Blob; quality: number }> {
  if (!isLossy(format)) {
    const blob = await encodeAt(canvas, format, 100);
    return { blob, quality: 100 };
  }

  let low = QUALITY_FLOOR;
  let high = QUALITY_CEILING;
  let best: { blob: Blob; quality: number } | null = null;

  while (low <= high) {
    const quality = Math.round((low + high) / 2);
    const blob = await encodeAt(canvas, format, quality);
    if (blob.size <= targetBytes) {
      if (!best || blob.size > best.blob.size) best = { blob, quality };
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  if (best) return best;

  const fallback = await encodeAt(canvas, format, QUALITY_FLOOR);
  return { blob: fallback, quality: QUALITY_FLOOR };
}

/**
 * Compress one file entirely on the device. The browser encoder is the source
 * of truth: for size targets, quality is searched and, when that is not
 * enough, the image is downscaled until it fits.
 */
export async function compressFile(
  file: File,
  request: CompressRequest,
): Promise<CompressOutcome> {
  const image = await loadImageFile(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  const limit = request.maxEdge
    ? fitWithin(naturalWidth, naturalHeight, request.maxEdge)
    : { width: naturalWidth, height: naturalHeight };

  let canvas = drawRegion(
    image,
    { x: 0, y: 0, width: naturalWidth, height: naturalHeight },
    { width: limit.width, height: limit.height },
    { fit: "stretch", sharpen: request.sharpen ? 0.45 : 0 },
  );

  const targetBytes =
    request.goal === "target"
      ? Math.max(1024, request.targetBytes)
      : request.goal === "percent"
        ? Math.max(
            1024,
            Math.round(file.size * (1 - Math.min(95, Math.max(0, request.percent)) / 100)),
          )
        : 0;

  let quality = Math.min(100, Math.max(1, Math.round(request.quality)));
  let blob: Blob;

  if (targetBytes > 0) {
    const fitted = await encodeWithin(canvas, request.format, targetBytes);
    blob = fitted.blob;
    quality = fitted.quality;

    let attempts = 0;
    while (blob.size > targetBytes && attempts < 4) {
      attempts += 1;
      const factor = Math.min(0.92, Math.max(0.35, Math.sqrt(targetBytes / blob.size) * 0.98));
      const nextWidth = Math.max(32, Math.round(canvas.width * factor));
      const nextHeight = Math.max(32, Math.round(canvas.height * factor));
      if (nextWidth === canvas.width && nextHeight === canvas.height) break;
      canvas = scaleCanvas(canvas, nextWidth, nextHeight);
      const next = await encodeWithin(canvas, request.format, targetBytes);
      blob = next.blob;
      quality = next.quality;
    }
  } else {
    blob = await encodeAt(canvas, request.format, quality);
  }

  if (request.keepOriginalIfLarger && blob.size >= file.size) {
    return {
      blob: file,
      width: naturalWidth,
      height: naturalHeight,
      quality: 100,
      bytes: file.size,
      originalBytes: file.size,
      keptOriginal: true,
      format: request.format,
    };
  }

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    quality,
    bytes: blob.size,
    originalBytes: file.size,
    keptOriginal: false,
    format: request.format,
  };
}
