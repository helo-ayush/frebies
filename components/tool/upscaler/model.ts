export type UpscaleFactor = 2 | 4;
export type UpscaleModel = "photo" | "illustration" | "product";
export type UpscaleFormat = "png" | "jpg" | "webp";

export type UpscaleSettings = {
  factor: UpscaleFactor;
  model: UpscaleModel;
  face: boolean;
  denoise: boolean;
  sharpen: boolean;
  format: UpscaleFormat;
  transparency: boolean;
  metadata: boolean;
};

export const UPSCALE_COST = 2;

export const DEFAULT_UPSCALE_SETTINGS: UpscaleSettings = {
  factor: 4,
  model: "photo",
  face: true,
  denoise: true,
  sharpen: true,
  format: "png",
  transparency: true,
  metadata: true,
};

export const UPSCALE_MODELS: {
  value: UpscaleModel;
  label: string;
  hint: string;
}[] = [
  {
    value: "photo",
    label: "Photo",
    hint: "Balanced detail for portraits, landscapes and everyday photography.",
  },
  {
    value: "illustration",
    label: "Illustration",
    hint: "Keeps flat colours and clean lines crisp instead of adding texture.",
  },
  {
    value: "product",
    label: "Product",
    hint: "Preserves labels, edges and packaging text for catalogue shots.",
  },
];

export const UPSCALE_FORMATS: {
  value: UpscaleFormat;
  label: string;
  hint: string;
}[] = [
  { value: "png", label: "PNG", hint: "Lossless and transparent. Best for final results." },
  { value: "jpg", label: "JPG", hint: "Smaller, universal, but cannot keep transparency." },
  { value: "webp", label: "WebP", hint: "Small files with transparency support." },
];

export function upscaleTarget(width: number, height: number, factor: number) {
  return {
    width: width ? Math.round(width * factor) : 0,
    height: height ? Math.round(height * factor) : 0,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}
