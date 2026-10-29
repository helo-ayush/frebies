import { supportsFormat, type EncodeFormat } from "@/lib/image/encode";

export type ResizeMode = "dimensions" | "percent" | "crop";
export type FitMode = "fill" | "fit" | "stretch";
export type CropRatioId = "free" | "1:1" | "4:5" | "16:9" | "3:2" | "9:16";
export type ResizeFormat = "auto" | "jpg" | "png" | "webp" | "avif";
export type Background = "white" | "black" | "transparent";

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResizeSettings = {
  mode: ResizeMode;
  width: string;
  height: string;
  linked: boolean;
  percent: number;
  cropRatio: CropRatioId;
  crop: CropRect | null;
  fit: FitMode;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  format: ResizeFormat;
  quality: number;
  background: Background;
  neverUpscale: boolean;
  removeMetadata: boolean;
  sharpen: boolean;
  progressive: boolean;
};

export const DEFAULT_RESIZE_SETTINGS: ResizeSettings = {
  mode: "dimensions",
  width: "1200",
  height: "800",
  linked: true,
  percent: 75,
  cropRatio: "4:5",
  crop: null,
  fit: "fill",
  rotation: 0,
  flipX: false,
  flipY: false,
  format: "auto",
  quality: 88,
  background: "white",
  neverUpscale: true,
  removeMetadata: true,
  sharpen: false,
  progressive: true,
};

export const RESIZE_MODES: { value: ResizeMode; label: string }[] = [
  { value: "dimensions", label: "Dimensions" },
  { value: "percent", label: "Percentage" },
  { value: "crop", label: "Crop" },
];

export const DIMENSION_PRESETS = [
  { label: "HD", detail: "1920 × 1080", width: 1920, height: 1080 },
  { label: "2K", detail: "2560 × 1440", width: 2560, height: 1440 },
  { label: "Square", detail: "1080 × 1080", width: 1080, height: 1080 },
  { label: "Portrait", detail: "1080 × 1350", width: 1080, height: 1350 },
  { label: "Story", detail: "1080 × 1920", width: 1080, height: 1920 },
];

export const CROP_RATIOS: {
  id: CropRatioId;
  label: string;
  hint: string;
  ratio: number | null;
}[] = [
  { id: "free", label: "Free", hint: "Any size", ratio: null },
  { id: "1:1", label: "1:1", hint: "Square", ratio: 1 },
  { id: "4:5", label: "4:5", hint: "Portrait", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", hint: "Wide", ratio: 16 / 9 },
  { id: "3:2", label: "3:2", hint: "Photo", ratio: 3 / 2 },
  { id: "9:16", label: "9:16", hint: "Story", ratio: 9 / 16 },
];

export const RESIZE_FORMATS: {
  value: ResizeFormat;
  label: string;
  hint: string;
  factor: number;
  lossy: boolean;
}[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "Keeps the source format where it makes sense.",
    factor: 0.9,
    lossy: true,
  },
  {
    value: "jpg",
    label: "JPG",
    hint: "Universal, no transparency.",
    factor: 1,
    lossy: true,
  },
  {
    value: "png",
    label: "PNG",
    hint: "Lossless with transparency.",
    factor: 2.1,
    lossy: false,
  },
  {
    value: "webp",
    label: "WebP",
    hint: "Small, modern, transparent.",
    factor: 0.72,
    lossy: true,
  },
  {
    value: "avif",
    label: "AVIF",
    hint: "Smallest file, slowest encode.",
    factor: 0.55,
    lossy: true,
  },
];

export function parseDimension(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function cropRatioValue(id: CropRatioId): number | null {
  return CROP_RATIOS.find((entry) => entry.id === id)?.ratio ?? null;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** A centered crop that matches a ratio, covering 82% of the image by default. */
export function cropForRatio(
  imageAspect: number,
  ratio: number | null,
  coverage = 0.82,
): CropRect {
  if (!ratio || !imageAspect || !Number.isFinite(imageAspect)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const normRatio = ratio / imageAspect;
  let width = coverage;
  let height = coverage / normRatio;
  if (height > coverage) {
    height = coverage;
    width = height * normRatio;
  }
  if (width > 1) {
    width = 1;
    height = width / normRatio;
  }
  if (height > 1) {
    height = 1;
    width = height * normRatio;
  }
  const clampedWidth = Math.min(1, width);
  const clampedHeight = Math.min(1, height);
  return {
    x: (1 - clampedWidth) / 2,
    y: (1 - clampedHeight) / 2,
    width: clampedWidth,
    height: clampedHeight,
  };
}

/** Re-shape an existing crop around its center when the ratio changes. */
export function reshapeCrop(
  crop: CropRect,
  ratio: number | null,
  imageAspect: number,
): CropRect {
  if (!ratio || !imageAspect || !Number.isFinite(imageAspect)) return crop;
  const normRatio = ratio / imageAspect;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let width = crop.width;
  let height = width / normRatio;

  if (crop.width / crop.height > normRatio) {
    height = crop.height;
    width = height * normRatio;
  }
  if (width > 1) {
    width = 1;
    height = width / normRatio;
  }
  if (height > 1) {
    height = 1;
    width = height * normRatio;
  }

  return {
    x: Math.min(1 - width, Math.max(0, centerX - width / 2)),
    y: Math.min(1 - height, Math.max(0, centerY - height / 2)),
    width,
    height,
  };
}

export function cropPixels(
  crop: CropRect,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(crop.x * sourceWidth),
    y: Math.round(crop.y * sourceHeight),
    width: Math.max(1, Math.round(crop.width * sourceWidth)),
    height: Math.max(1, Math.round(crop.height * sourceHeight)),
  };
}

export function computeResizeOutput(
  settings: ResizeSettings,
  originalWidth: number,
  originalHeight: number,
): {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  scale: number;
  upscaling: boolean;
  capped: boolean;
} {
  const rotated = settings.rotation === 90 || settings.rotation === 270;

  if (settings.mode === "crop") {
    const ratio = cropRatioValue(settings.cropRatio);
    const crop =
      settings.crop ??
      cropForRatio(
        originalWidth && originalHeight ? originalWidth / originalHeight : 1,
        ratio,
      );
    const pixels = cropPixels(crop, originalWidth, originalHeight);
    const width = rotated ? pixels.height : pixels.width;
    const height = rotated ? pixels.width : pixels.height;
    const scale = originalWidth
      ? Math.round((pixels.width / originalWidth) * 100)
      : 100;
    return {
      sourceWidth: originalWidth,
      sourceHeight: originalHeight,
      width,
      height,
      scale,
      upscaling: false,
      capped: false,
    };
  }

  const sourceWidth = rotated ? originalHeight : originalWidth;
  const sourceHeight = rotated ? originalWidth : originalHeight;
  let width = 0;
  let height = 0;
  let capped = false;

  if (settings.mode === "dimensions") {
    width = parseDimension(settings.width);
    height = parseDimension(settings.height);
    if (settings.neverUpscale && sourceWidth && sourceHeight) {
      const factor = Math.min(
        1,
        sourceWidth / Math.max(1, width),
        sourceHeight / Math.max(1, height),
      );
      if (factor < 1) {
        capped = true;
        width = Math.round(width * factor);
        height = Math.round(height * factor);
      }
    }
  } else {
    const percent = settings.neverUpscale ? Math.min(100, settings.percent) : settings.percent;
    capped = percent !== settings.percent;
    width = Math.round((sourceWidth * percent) / 100);
    height = Math.round((sourceHeight * percent) / 100);
  }

  const scale = sourceWidth ? Math.round((width / sourceWidth) * 100) : 100;
  const upscaling = Boolean(sourceWidth && (width > sourceWidth || height > sourceHeight));

  return { sourceWidth, sourceHeight, width, height, scale, upscaling, capped };
}

export function isLossyFormat(format: ResizeFormat): boolean {
  return RESIZE_FORMATS.find((entry) => entry.value === format)?.lossy ?? true;
}

export function estimateResizeBytes({
  originalBytes,
  sourcePixels,
  outputPixels,
  format,
  quality,
}: {
  originalBytes: number;
  sourcePixels: number;
  outputPixels: number;
  format: ResizeFormat;
  quality: number;
}): number {
  if (!originalBytes || !sourcePixels || !outputPixels) return 0;
  const formatFactor =
    RESIZE_FORMATS.find((entry) => entry.value === format)?.factor ?? 0.9;
  const lossy = isLossyFormat(format);
  const qualityFactor = lossy ? 0.42 + 0.58 * (quality / 100) : 1;
  const pixels = outputPixels / sourcePixels;
  return Math.max(1024, Math.round(originalBytes * pixels * formatFactor * qualityFactor));
}

export function formatLabel(value: ResizeFormat): string {
  return RESIZE_FORMATS.find((entry) => entry.value === value)?.label ?? "Auto";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function ratioLabel(width: number, height: number): string {
  if (!width || !height) return "—";
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  if (w > 24 || h > 24) return `${(width / height).toFixed(2)}:1`;
  return `${w}:${h}`;
}

export function backgroundValue(settings: ResizeSettings): string | null {
  if (settings.background === "white") return "#ffffff";
  if (settings.background === "black") return "#111111";
  return null;
}

export function encodeFormatOf(format: ResizeFormat): EncodeFormat {
  if (format === "jpg") return "jpeg";
  if (format === "webp") return "webp";
  if (format === "avif") return "avif";
  return "png";
}

/** The encoder this browser will actually use for the chosen output. */
export function resolveEncodeFormat(settings: ResizeSettings, file: File): EncodeFormat {
  if (settings.format === "auto") {
    if (file.type === "image/jpeg") return "jpeg";
    if (file.type === "image/webp") return "webp";
    return "png";
  }
  const format = encodeFormatOf(settings.format);
  if (format === "avif" && !supportsFormat("avif")) return "webp";
  return format;
}
