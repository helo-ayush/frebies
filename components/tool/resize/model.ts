import {
  clampCropCenter,
  cropRect,
  rotatedSize,
  supportsFormat,
  type EncodeFormat,
  type Rect,
  type Size,
} from "@/lib/image/encode";

export type ResizeMode = "dimensions" | "percent" | "crop";
export type FitMode = "fill" | "fit" | "stretch";
export type CropRatioId = "free" | "1:1" | "4:5" | "16:9" | "3:2" | "9:16";
export type FocusId =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type ResizeFormat = "auto" | "jpg" | "png" | "webp" | "avif";
export type Background = "white" | "black" | "transparent";

export type ResizeSettings = {
  mode: ResizeMode;
  width: string;
  height: string;
  linked: boolean;
  percent: number;
  cropRatio: CropRatioId;
  focus: FocusId;
  /** Extra zoom inside the crop frame: 1 fills the frame, 3 picks a third. */
  cropZoom: number;
  /** Normalized centre of the crop inside the rotated source. */
  cropCenterX: number;
  cropCenterY: number;
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
  focus: "center",
  cropZoom: 1,
  cropCenterX: 0.5,
  cropCenterY: 0.5,
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
  { id: "free", label: "Free", hint: "Original", ratio: null },
  { id: "1:1", label: "1:1", hint: "Square", ratio: 1 },
  { id: "4:5", label: "4:5", hint: "Portrait", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", hint: "Wide", ratio: 16 / 9 },
  { id: "3:2", label: "3:2", hint: "Photo", ratio: 3 / 2 },
  { id: "9:16", label: "9:16", hint: "Story", ratio: 9 / 16 },
];

export const CROP_ZOOM_MIN = 1;
export const CROP_ZOOM_MAX = 3;

export const FOCUS_POINTS: {
  id: FocusId;
  label: string;
  position: string;
  x: number;
  y: number;
}[] = [
  { id: "top-left", label: "Top left", position: "0% 0%", x: 0, y: 0 },
  { id: "top-center", label: "Top center", position: "50% 0%", x: 0.5, y: 0 },
  { id: "top-right", label: "Top right", position: "100% 0%", x: 1, y: 0 },
  { id: "center-left", label: "Center left", position: "0% 50%", x: 0, y: 0.5 },
  { id: "center", label: "Center", position: "50% 50%", x: 0.5, y: 0.5 },
  { id: "center-right", label: "Center right", position: "100% 50%", x: 1, y: 0.5 },
  { id: "bottom-left", label: "Bottom left", position: "0% 100%", x: 0, y: 1 },
  { id: "bottom-center", label: "Bottom center", position: "50% 100%", x: 0.5, y: 1 },
  { id: "bottom-right", label: "Bottom right", position: "100% 100%", x: 1, y: 1 },
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

export function focusAnchor(focus: FocusId): { x: number; y: number } {
  const point = FOCUS_POINTS.find((entry) => entry.id === focus) ?? FOCUS_POINTS[4];
  return { x: point.x, y: point.y };
}

/** The crop rectangle for the current ratio, zoom and pan, in source pixels. */
export function cropFor(
  settings: ResizeSettings,
  width: number,
  height: number,
): Rect {
  return cropRect({
    width,
    height,
    ratio: cropRatioValue(settings.cropRatio),
    zoom: settings.cropZoom,
    centerX: settings.cropCenterX,
    centerY: settings.cropCenterY,
  });
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

export function resolveEncodeFormat(settings: ResizeSettings, file: File): EncodeFormat {
  if (settings.format === "auto") {
    if (file.type === "image/jpeg") return "jpeg";
    if (file.type === "image/webp") return "webp";
    return "png";
  }
  const format = encodeFormatOf(settings.format);
  if (settings.format === "avif" && !supportsFormat("avif")) return "webp";
  return format;
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
  } else if (settings.mode === "percent") {
    const percent = settings.neverUpscale ? Math.min(100, settings.percent) : settings.percent;
    capped = percent !== settings.percent;
    width = Math.round((sourceWidth * percent) / 100);
    height = Math.round((sourceHeight * percent) / 100);
  } else {
    const crop = cropFor(settings, sourceWidth, sourceHeight);
    width = crop.width;
    height = crop.height;
  }

  const scale = sourceWidth ? Math.round((width / sourceWidth) * 100) : 100;
  const upscaling = Boolean(sourceWidth && (width > sourceWidth || height > sourceHeight));

  return { sourceWidth, sourceHeight, width, height, scale, upscaling, capped };
}

export type ResizePlan = {
  /** Size of the source after rotation. */
  source: Size;
  /** Crop inside the rotated source, when the crop mode is active. */
  crop: Rect | null;
  output: Size;
  fit: "cover" | "contain" | "stretch";
  background: string | null;
  anchor: { x: number; y: number };
  sharpen: number;
};

export function buildResizePlan(
  settings: ResizeSettings,
  imageWidth: number,
  imageHeight: number,
): ResizePlan {
  const source = rotatedSize(imageWidth, imageHeight, settings.rotation);
  const computed = computeResizeOutput(settings, imageWidth, imageHeight);
  const anchor = focusAnchor(settings.focus);

  if (settings.mode === "crop") {
    const crop = cropFor(settings, source.width, source.height);
    return {
      source,
      crop,
      output: { width: crop.width, height: crop.height },
      fit: "stretch",
      background: null,
      anchor,
      sharpen: settings.sharpen ? 0.4 : 0,
    };
  }

  const fit: ResizePlan["fit"] =
    settings.mode === "percent"
      ? "stretch"
      : settings.fit === "fill"
        ? "cover"
        : settings.fit === "fit"
          ? "contain"
          : "stretch";

  return {
    source,
    crop: null,
    output: { width: computed.width, height: computed.height },
    fit,
    background: fit === "contain" ? backgroundValue(settings) : null,
    anchor,
    sharpen: settings.sharpen ? 0.55 : 0,
  };
}

/** Keep the stored crop centre inside the frame after any zoom or ratio change. */
export function normalizeCropPan(
  settings: ResizeSettings,
  width: number,
  height: number,
): { x: number; y: number } {
  return clampCropCenter({
    width,
    height,
    ratio: cropRatioValue(settings.cropRatio),
    zoom: settings.cropZoom,
    centerX: settings.cropCenterX,
    centerY: settings.cropCenterY,
  });
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
