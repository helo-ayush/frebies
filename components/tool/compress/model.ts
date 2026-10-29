import { supportsFormat, type EncodeFormat } from "@/lib/image/encode";

export type CompressGoal = "quality" | "target" | "percent";
export type OutputFormat = "auto" | "jpg" | "png" | "webp" | "avif";
export type TargetUnit = "KB" | "MB";
export type ResizeOption = "original" | "2048" | "1600" | "1200" | "800";

export type CompressItem = {
  id: string;
  file: File;
  preview: string;
  width?: number;
  height?: number;
};

export type CompressSettings = {
  goal: CompressGoal;
  quality: number;
  targetValue: string;
  targetUnit: TargetUnit;
  percent: number;
  format: OutputFormat;
  resize: ResizeOption;
  keepSmaller: boolean;
  stripMetadata: boolean;
  progressive: boolean;
  sharpen: boolean;
  subsampling: string;
  colorProfile: string;
};

export const MAX_FILES = 10;
export const MIN_QUALITY = 20;
export const MAX_QUALITY = 100;

export const DEFAULT_SETTINGS: CompressSettings = {
  goal: "quality",
  quality: 72,
  targetValue: "200",
  targetUnit: "KB",
  percent: 60,
  format: "auto",
  resize: "original",
  keepSmaller: true,
  stripMetadata: true,
  progressive: true,
  sharpen: false,
  subsampling: "Auto",
  colorProfile: "Keep original",
};

export type CompressGoalOption = {
  value: CompressGoal;
  label: string;
  hint: string;
};

export const GOALS: CompressGoalOption[] = [
  { value: "quality", label: "Quality", hint: "Pick a quality level and let the encoder find the size." },
  { value: "target", label: "Target size", hint: "Set an exact final size and let quality adjust to fit." },
  { value: "percent", label: "Percent", hint: "Cut a fixed percentage from every image." },
];

export type FormatOption = {
  value: OutputFormat;
  label: string;
  hint: string;
  factor: number;
};

export const FORMATS: FormatOption[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "Picks the smallest modern format that keeps transparency.",
    factor: 0.8,
  },
  {
    value: "jpg",
    label: "JPG",
    hint: "Universal support. Flattens transparency onto white.",
    factor: 1,
  },
  {
    value: "png",
    label: "PNG",
    hint: "Lossless with transparency, but rarely shrinks photos.",
    factor: 1.9,
  },
  {
    value: "webp",
    label: "WebP",
    hint: "Small files with transparency, supported in every modern browser.",
    factor: 0.7,
  },
  {
    value: "avif",
    label: "AVIF",
    hint: "Usually the smallest output, with slower encoding.",
    factor: 0.52,
  },
];

export type ResizeOptionMeta = {
  value: ResizeOption;
  label: string;
  hint: string;
};

export const RESIZE_OPTIONS: ResizeOptionMeta[] = [
  { value: "original", label: "Original dimensions", hint: "Keeps the source width and height." },
  { value: "2048", label: "2048 px longest edge", hint: "Large screens and high-DPI layouts." },
  { value: "1600", label: "1600 px longest edge", hint: "A safe size for most web pages." },
  { value: "1200", label: "1200 px longest edge", hint: "Blog posts, email and social previews." },
  { value: "800", label: "800 px longest edge", hint: "Thumbnails and compact cards." },
];

export type CompressPreset = {
  id: "web" | "email" | "marketplace" | "max";
  label: string;
  detail: string;
  patch: Partial<CompressSettings>;
};

export const PRESETS: CompressPreset[] = [
  {
    id: "web",
    label: "Web page",
    detail: "72% · WebP",
    patch: { goal: "quality", quality: 72, format: "webp" },
  },
  {
    id: "email",
    label: "Email",
    detail: "≤ 200 KB",
    patch: { goal: "target", targetValue: "200", targetUnit: "KB" },
  },
  {
    id: "marketplace",
    label: "Marketplace",
    detail: "≤ 1 MB",
    patch: { goal: "target", targetValue: "1", targetUnit: "MB" },
  },
  {
    id: "max",
    label: "Max savings",
    detail: "−75% · WebP",
    patch: { goal: "percent", percent: 75, format: "webp" },
  },
];

export type QualityBand = {
  label: string;
  hint: string;
};

export function qualityBand(quality: number): QualityBand {
  if (quality <= 35) {
    return {
      label: "Smallest file",
      hint: "Heavy compression. Fine for thumbnails and quick previews.",
    };
  }
  if (quality <= 55) {
    return {
      label: "Compact",
      hint: "Noticeable softness. Good for email and chat attachments.",
    };
  }
  if (quality <= 78) {
    return {
      label: "Balanced",
      hint: "The usual choice for web pages and social posts.",
    };
  }
  if (quality <= 90) {
    return {
      label: "High detail",
      hint: "Keeps fine texture for screenshots and product photos.",
    };
  }
  return {
    label: "Near-lossless",
    hint: "Minimal saving. Use when detail matters more than size.",
  };
}

export function formatMeta(format: OutputFormat): FormatOption {
  return FORMATS.find((option) => option.value === format) ?? FORMATS[0];
}

/** The encoder format this browser will actually use for the chosen output. */
export function resolveOutputFormat(settings: CompressSettings, file: File): EncodeFormat {
  if (settings.format === "jpg") return "jpeg";
  if (settings.format === "png") return "png";
  if (settings.format === "webp") return "webp";
  if (settings.format === "avif") return supportsFormat("avif") ? "avif" : "webp";

  if (file.type === "image/webp") return "webp";
  if (file.type === "image/png") return supportsFormat("webp") ? "webp" : "png";
  return supportsFormat("webp") ? "webp" : "jpeg";
}

/** Longest-edge limit from the resize option, or null to keep the source size. */
export function maxEdgeOf(settings: CompressSettings): number | null {
  return settings.resize === "original" ? null : Number(settings.resize);
}

export function resizeMeta(resize: ResizeOption): ResizeOptionMeta {
  return RESIZE_OPTIONS.find((option) => option.value === resize) ?? RESIZE_OPTIONS[0];
}

export function targetBytes(settings: CompressSettings): number {
  const value = Number.parseFloat(settings.targetValue.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return 0;
  const multiplier = settings.targetUnit === "MB" ? 1024 * 1024 : 1024;
  return Math.round(value * multiplier);
}

function qualityFactor(quality: number): number {
  const clamped = Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, quality));
  return 0.08 + 0.92 * Math.pow(clamped / 100, 2.1);
}

function resizeFactor(resize: ResizeOption, longestEdge?: number): number {
  if (resize === "original" || !longestEdge) return 1;
  const limit = Number(resize);
  if (!Number.isFinite(limit) || limit <= 0 || longestEdge <= limit) return 1;
  const ratio = limit / longestEdge;
  return 0.15 + 0.85 * Math.pow(ratio, 1.6);
}

function clampToOriginal(value: number, original: number, keepSmaller: boolean): number {
  const rounded = Math.max(1024, Math.round(value));
  return keepSmaller ? Math.min(rounded, original) : rounded;
}

/**
 * Estimated output bytes for a single image. This is a deterministic estimate
 * for the interface preview; the real encoder will report exact sizes.
 */
export function estimateBytes(
  original: number,
  settings: CompressSettings,
  longestEdge?: number,
): number {
  if (original <= 0) return 0;

  let value: number;

  if (settings.goal === "target") {
    const target = targetBytes(settings);
    value = target > 0 ? target : original;
  } else if (settings.goal === "percent") {
    const reduction = Math.min(95, Math.max(0, settings.percent));
    value = original * (1 - reduction / 100);
  } else {
    value =
      original *
      qualityFactor(settings.quality) *
      formatMeta(settings.format).factor *
      resizeFactor(settings.resize, longestEdge);
  }

  return clampToOriginal(value, original, settings.keepSmaller);
}

export function estimateForItem(item: CompressItem, settings: CompressSettings): number {
  const longestEdge =
    item.width && item.height ? Math.max(item.width, item.height) : undefined;
  return estimateBytes(item.file.size, settings, longestEdge);
}

/** Best guess at the quality the encoder has to use to honour a size goal. */
export function impliedQuality(ratio: number, format: OutputFormat = "auto"): number {
  const factor = formatMeta(format).factor;
  const adjusted = ratio / factor;
  const raw = (adjusted - 0.08) / 0.92;
  const clamped = Math.min(1, Math.max(0, raw));
  const quality = Math.round(100 * Math.pow(clamped, 1 / 2.1));
  return Math.min(100, Math.max(5, quality));
}

export function reductionPercent(original: number, output: number): number {
  if (original <= 0) return 0;
  return Math.round((1 - output / original) * 100);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function targetLabel(settings: CompressSettings): string {
  const bytes = targetBytes(settings);
  return bytes > 0 ? formatBytes(bytes) : "—";
}

export function goalLabel(settings: CompressSettings): string {
  if (settings.goal === "target") {
    const bytes = targetBytes(settings);
    return bytes > 0 ? `≤ ${formatBytes(bytes)}` : "Set target size";
  }
  if (settings.goal === "percent") return `−${settings.percent}%`;
  return `${settings.quality}% quality`;
}
