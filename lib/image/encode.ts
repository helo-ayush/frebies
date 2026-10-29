/**
 * Browser-only image pipeline shared by the image studios.
 *
 * Everything here runs on the device: files are decoded with an object URL,
 * drawn onto a canvas, transformed, and encoded again with `canvas.toBlob`.
 * Nothing is uploaded, and no third-party dependency is involved.
 */

export type EncodeFormat = "png" | "jpeg" | "webp" | "avif";

export type Rect = { x: number; y: number; width: number; height: number };

export type Size = { width: number; height: number };

/** Normalized anchor inside the destination: 0 = start, 0.5 = centre, 1 = end. */
export type Anchor = { x: number; y: number };

export type FitMode = "cover" | "contain" | "stretch";

export const FORMAT_MIME: Record<EncodeFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

export const FORMAT_EXTENSION: Record<EncodeFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  avif: "avif",
};

export const FORMAT_LABEL: Record<EncodeFormat, string> = {
  png: "PNG",
  jpeg: "JPG",
  webp: "WebP",
  avif: "AVIF",
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundSize(value: number): number {
  return Math.max(1, Math.round(value));
}

export function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

export function rotatedSize(width: number, height: number, rotation: number): Size {
  const angle = normalizeRotation(rotation);
  return angle === 90 || angle === 270
    ? { width: height, height: width }
    : { width, height };
}

/** Keep an aspect ratio but never exceed `max` on the longest edge. */
export function fitWithin(width: number, height: number, max: number): Size {
  if (!width || !height || !Number.isFinite(max) || max <= 0) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(width, height);
  if (longest <= max) return { width: roundSize(width), height: roundSize(height) };
  const factor = max / longest;
  return { width: roundSize(width * factor), height: roundSize(height * factor) };
}

/* ------------------------------------------------------------------ *
 * Format support
 * ------------------------------------------------------------------ */

let supportCache: Partial<Record<EncodeFormat, boolean>> | null = null;

function detectSupport(): Partial<Record<EncodeFormat, boolean>> {
  const result: Partial<Record<EncodeFormat, boolean>> = {};
  if (typeof document === "undefined") return result;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  (Object.keys(FORMAT_MIME) as EncodeFormat[]).forEach((format) => {
    const mime = FORMAT_MIME[format];
    try {
      result[format] = canvas.toDataURL(mime).startsWith(`data:${mime}`);
    } catch {
      result[format] = false;
    }
  });
  return result;
}

/** True when this browser can actually encode the format with a canvas. */
export function supportsFormat(format: EncodeFormat): boolean {
  if (typeof document === "undefined") return false;
  if (!supportCache) supportCache = detectSupport();
  return supportCache[format] ?? false;
}

export function supportedFormats(): EncodeFormat[] {
  const all: EncodeFormat[] = ["png", "jpeg", "webp", "avif"];
  const available = all.filter(supportsFormat);
  return available.length > 0 ? available : ["png", "jpeg", "webp"];
}

/* ------------------------------------------------------------------ *
 * Decoding and drawing
 * ------------------------------------------------------------------ */

/** Decode a file into an image element. The object URL is released once decoded. */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be read. Try a JPG, PNG or WebP file."));
    };
    image.src = url;
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw images on a canvas.");
  return context;
}

/** Apply EXIF-aware rotation and flips to any canvas source. */
export function transformCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  options: { rotation?: number; flipX?: boolean; flipY?: boolean } = {},
): HTMLCanvasElement {
  const angle = normalizeRotation(options.rotation ?? 0);
  const target = rotatedSize(width, height, angle);
  const canvas = createCanvas(target.width, target.height);
  const context = context2d(canvas);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();

  return canvas;
}

export function transformImage(
  image: HTMLImageElement,
  options: { rotation?: number; flipX?: boolean; flipY?: boolean } = {},
): HTMLCanvasElement {
  return transformCanvas(
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    options,
  );
}

/**
 * The largest rectangle of `ratio` inside `width × height`, divided by `zoom`,
 * centred on (`centerX`, `centerY`) and clamped so it never leaves the image.
 */
export function cropRect({
  width,
  height,
  ratio,
  zoom = 1,
  centerX = 0.5,
  centerY = 0.5,
}: {
  width: number;
  height: number;
  ratio: number | null;
  zoom?: number;
  centerX?: number;
  centerY?: number;
}): Rect {
  if (!width || !height) return { x: 0, y: 0, width: 0, height: 0 };

  const effectiveRatio = ratio && ratio > 0 ? ratio : width / height;
  const baseWidth = Math.min(width, height * effectiveRatio);
  const baseHeight = baseWidth / effectiveRatio;
  const scale = clamp(zoom, 1, 8);
  const cropWidth = Math.max(1, baseWidth / scale);
  const cropHeight = Math.max(1, baseHeight / scale);

  const halfX = cropWidth / 2;
  const halfY = cropHeight / 2;
  const centerPx = clamp(centerX, 0, 1) * width;
  const centerPy = clamp(centerY, 0, 1) * height;
  const left = clamp(centerPx, halfX, width - halfX);
  const top = clamp(centerPy, halfY, height - halfY);

  return {
    x: Math.round(left - halfX),
    y: Math.round(top - halfY),
    width: Math.max(1, Math.round(cropWidth)),
    height: Math.max(1, Math.round(cropHeight)),
  };
}

/** Clamp a normalized crop centre so the crop rectangle stays inside the image. */
export function clampCropCenter({
  width,
  height,
  ratio,
  zoom,
  centerX,
  centerY,
}: {
  width: number;
  height: number;
  ratio: number | null;
  zoom: number;
  centerX: number;
  centerY: number;
}): { x: number; y: number } {
  const rect = cropRect({ width, height, ratio, zoom, centerX, centerY });
  return {
    x: width ? clamp((rect.x + rect.width / 2) / width, 0, 1) : 0.5,
    y: height ? clamp((rect.y + rect.height / 2) / height, 0, 1) : 0.5,
  };
}

function sharpen(context: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0 || width < 3 || height < 3) return;
  let data: ImageData;
  try {
    data = context.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const source = new Uint8ClampedArray(data.data);
  const target = data.data;
  const strength = clamp(amount, 0, 1);
  const centre = 1 + 4 * strength;
  const side = -strength;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const i = index + channel;
        const value =
          source[i] * centre +
          (source[i - 4] + source[i + 4] + source[i - width * 4] + source[i + width * 4]) *
            side;
        target[i] = value;
      }
    }
  }
  context.putImageData(data, 0, 0);
}

/**
 * Draw `sourceRect` of a decoded canvas into an exact output size, honouring
 * cover / contain / stretch, a background colour, and optional sharpening.
 */
export function drawRegion(
  source: CanvasImageSource,
  sourceRect: Rect,
  output: Size,
  options: {
    fit?: FitMode;
    background?: string | null;
    anchor?: Anchor;
    sharpen?: number;
  } = {},
): HTMLCanvasElement {
  const width = roundSize(output.width);
  const height = roundSize(output.height);
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }

  const fit = options.fit ?? "stretch";
  const anchor = options.anchor ?? { x: 0.5, y: 0.5 };
  const sourceWidth = Math.max(1, sourceRect.width);
  const sourceHeight = Math.max(1, sourceRect.height);

  let drawWidth = width;
  let drawHeight = height;
  let drawX = 0;
  let drawY = 0;

  if (fit !== "stretch") {
    const scale =
      fit === "cover"
        ? Math.max(width / sourceWidth, height / sourceHeight)
        : Math.min(width / sourceWidth, height / sourceHeight);
    drawWidth = sourceWidth * scale;
    drawHeight = sourceHeight * scale;
    drawX = (width - drawWidth) * anchor.x;
    drawY = (height - drawHeight) * anchor.y;
  }

  context.drawImage(
    source,
    sourceRect.x,
    sourceRect.y,
    sourceWidth,
    sourceHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );

  if (options.sharpen) sharpen(context, width, height, options.sharpen);

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: EncodeFormat,
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("This browser could not encode the image."));
        },
        FORMAT_MIME[format],
        clamp(quality, 0.05, 1),
      );
    } catch {
      reject(new Error("This browser could not encode the image."));
    }
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function outputFilename(
  input: string,
  format: EncodeFormat,
  suffix = "",
): string {
  const base = input.replace(/\.[^./\\]+$/, "").trim() || "image";
  const safe = base.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").slice(0, 90);
  return `${safe}${suffix}.${FORMAT_EXTENSION[format]}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}
