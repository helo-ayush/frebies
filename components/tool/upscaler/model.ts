import type { StorageProviderKind } from "@/lib/storage/generation-store";

export type UpscaleFactor = 2 | 4;
export type UpscaleFormat = "png" | "jpg" | "webp";
export type UpscaleTier = "free" | "pro";
export type UpscaleEngineModel =
  | "ultrasharp_v2_lite"
  | "ultrasharp_v2"
  | "omnisr"
  | "hat"
  | "realesrgan"
  | "ultrasharp"
  | "seedvr2_3b";
export type UpscaleContentProfile = "natural" | "portrait" | "illustration" | "product" | "cinema";
export type UpscaleTargetPreset = "exact" | "1080p" | "2k" | "4k";
/** Backwards-compatible alias kept for any existing imports. */
export type UpscaleModel = "photo" | "illustration" | "product";

export type UpscaleSettings = {
  tier: UpscaleTier;
  engineModel: UpscaleEngineModel;
  profile: UpscaleContentProfile;
  factor: UpscaleFactor;
  targetPreset: UpscaleTargetPreset;
  face: boolean;
  denoise: number;
  sharpen: number;
  colorFix: boolean;
  format: UpscaleFormat;
  quality: number;
  transparency: boolean;
  backgroundColor: string;
  metadata: boolean;
};

export const UPSCALE_COST = 2;

export const DEFAULT_UPSCALE_SETTINGS: UpscaleSettings = {
  tier: "free",
  engineModel: "ultrasharp_v2_lite",
  profile: "natural",
  factor: 4,
  targetPreset: "exact",
  face: true,
  denoise: 20,
  sharpen: 25,
  colorFix: true,
  format: "png",
  quality: 95,
  transparency: true,
  backgroundColor: "#ffffff",
  metadata: true,
};

export type UpscaleModelDescriptor = {
  id: UpscaleEngineModel;
  label: string;
  shortLabel: string;
  precision: string;
  badge: string;
  hint: string;
  recommendedProfile: UpscaleContentProfile;
};

export const FREE_UPSCALE_MODELS: UpscaleModelDescriptor[] = [
  {
    id: "ultrasharp_v2_lite",
    label: "4x-UltraSharpV2 Lite",
    shortLabel: "UltraSharpV2 Lite",
    precision: "FP16",
    badge: "Default · Fast",
    hint: "Quantized FP16 super-resolution tuned for crisp textures, fast turnaround, and natural skin/surfaces.",
    recommendedProfile: "natural",
  },
  {
    id: "ultrasharp_v2",
    label: "4x-UltraSharpV2",
    shortLabel: "UltraSharpV2",
    precision: "FP16",
    badge: "Detailed",
    hint: "Full-capacity RRDB photography upscaler for landscapes, portraits, and DSLR restoration.",
    recommendedProfile: "natural",
  },
  {
    id: "omnisr",
    label: "OmniSR X4",
    shortLabel: "OmniSR",
    precision: "FP16",
    badge: "Anime / UI",
    hint: "Keeps flat colors, vector illustrations, UI screenshots, and anime line art razor sharp.",
    recommendedProfile: "illustration",
  },
  {
    id: "hat",
    label: "HAT Transformer",
    shortLabel: "HAT",
    precision: "FP16",
    badge: "Text / Edges",
    hint: "Hybrid attention transformer preserving tiny product labels, typography, and hard geometric edges.",
    recommendedProfile: "product",
  },
  {
    id: "realesrgan",
    label: "Real-ESRGAN x4+",
    shortLabel: "Real-ESRGAN",
    precision: "FP16",
    badge: "Heavy Denoise",
    hint: "Recovers heavily compressed social media JPEGs, old photos, and noisy scans.",
    recommendedProfile: "natural",
  },
  {
    id: "ultrasharp",
    label: "4x-UltraSharp Classic",
    shortLabel: "UltraSharp",
    precision: "FP16",
    badge: "Classic",
    hint: "Original UltraSharp backbone with balanced micro-contrast for general graphics.",
    recommendedProfile: "product",
  },
];

export const PRO_UPSCALE_MODEL: UpscaleModelDescriptor = {
  id: "seedvr2_3b",
  label: "SeedVR2-3B Diffusion",
  shortLabel: "SeedVR2-3B FP8",
  precision: "FP8 + FP16 VAE",
  badge: "Pro · 3B DiT",
  hint: "ByteDance one-step 3B diffusion transformer + FP16 VAE on NVIDIA L20 for photorealistic faces, textures, and film grain synthesis.",
  recommendedProfile: "portrait",
};

export const ALL_UPSCALE_MODELS: UpscaleModelDescriptor[] = [
  ...FREE_UPSCALE_MODELS,
  PRO_UPSCALE_MODEL,
];

export const UPSCALE_PROFILES: {
  value: UpscaleContentProfile;
  label: string;
  hint: string;
  denoise: number;
  sharpen: number;
}[] = [
  {
    value: "natural",
    label: "Natural photo",
    hint: "Balanced clarity for everyday photography and scenic textures.",
    denoise: 20,
    sharpen: 25,
  },
  {
    value: "portrait",
    label: "Portrait & face",
    hint: "Refines skin tone, eyelashes, and hair strands without oversharpening.",
    denoise: 25,
    sharpen: 18,
  },
  {
    value: "illustration",
    label: "Illustration",
    hint: "Preserves flat colors, crisp ink lines, and digital art gradients.",
    denoise: 12,
    sharpen: 32,
  },
  {
    value: "product",
    label: "Product & text",
    hint: "Sharpens labels, typography, and hard edges for ecommerce catalogues.",
    denoise: 10,
    sharpen: 40,
  },
  {
    value: "cinema",
    label: "Cinema frame",
    hint: "Generative texture recovery for stills, video thumbnails, and low-res frames.",
    denoise: 30,
    sharpen: 20,
  },
];

export const UPSCALE_TARGET_PRESETS: {
  value: UpscaleTargetPreset;
  label: string;
  hint: string;
}[] = [
  { value: "exact", label: "Exact scale", hint: "Full 2× or 4× source multiplier" },
  { value: "1080p", label: "1080p HD", hint: "Fit long edge up to 1920px" },
  { value: "2k", label: "2K QHD", hint: "Fit long edge up to 2560px" },
  { value: "4k", label: "4K UHD", hint: "Fit long edge up to 3840px" },
];

export const UPSCALE_ENHANCE_PRESETS: {
  id: string;
  label: string;
  denoise: number;
  sharpen: number;
  colorFix: boolean;
  face: boolean;
}[] = [
  { id: "balanced", label: "Balanced", denoise: 20, sharpen: 25, colorFix: true, face: true },
  { id: "crisp", label: "Crisp photo", denoise: 12, sharpen: 48, colorFix: true, face: true },
  { id: "clean", label: "Clean denoise", denoise: 55, sharpen: 20, colorFix: true, face: false },
  { id: "raw", label: "Raw model", denoise: 0, sharpen: 0, colorFix: true, face: false },
];

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
  { value: "png", label: "PNG", hint: "Lossless archival quality with full alpha transparency." },
  { value: "jpg", label: "JPG", hint: "Compact universal file; transparency fills with backdrop color." },
  { value: "webp", label: "WebP", hint: "Modern small files with lossless or high-quality alpha support." },
];

export type SampleUpscalePreset = {
  id: string;
  label: string;
  subtitle: string;
  fileName: string;
  suggestedTier: UpscaleTier;
  suggestedModel: UpscaleEngineModel;
  suggestedProfile: UpscaleContentProfile;
  width: number;
  height: number;
};

export const SAMPLE_UPSCALE_IMAGES: SampleUpscalePreset[] = [
  {
    id: "portrait-photo",
    label: "Golden Portrait",
    subtitle: "Soft 320×240 photo · Test SeedVR2-3B FP8",
    fileName: "sample-portrait.jpg",
    suggestedTier: "pro",
    suggestedModel: "seedvr2_3b",
    suggestedProfile: "portrait",
    width: 320,
    height: 240,
  },
  {
    id: "vector-poster",
    label: "Editorial Poster",
    subtitle: "256×256 vector typography · Test OmniSR / HAT",
    fileName: "sample-editorial-poster.png",
    suggestedTier: "free",
    suggestedModel: "omnisr",
    suggestedProfile: "illustration",
    width: 256,
    height: 256,
  },
  {
    id: "product-bottle",
    label: "Product Bottle",
    subtitle: "280×240 label & glass · Test UltraSharpV2 Lite",
    fileName: "sample-product-shot.png",
    suggestedTier: "free",
    suggestedModel: "ultrasharp_v2_lite",
    suggestedProfile: "product",
    width: 280,
    height: 240,
  },
];

export type UpscaleJobStatus =
  | "queued"
  | "waiting_for_server"
  | "upscaling"
  | "post_processing"
  | "completed"
  | "failed";

export type UpscaleJobSnapshot = {
  id: string;
  ownerId: string;
  status: UpscaleJobStatus;
  progress: number;
  stageLabel: string;
  elapsedMs: number;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  ttlMs: number;
  storageProvider: StorageProviderKind | null;
  sourceFileName: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  factor: UpscaleFactor;
  targetPreset: UpscaleTargetPreset;
  tier: UpscaleTier;
  engineModel: UpscaleEngineModel;
  modelLabel: string;
  precision: string;
  profile: UpscaleContentProfile;
  format: UpscaleFormat;
  quality: number;
  denoise: number;
  sharpen: number;
  face: boolean;
  colorFix: boolean;
  timeTakenMs: number | null;
  byteLength: number | null;
  fileName: string;
  outputUrl: string | null;
  downloadUrl: string | null;
  sourceUrl: string | null;
  error: string | null;
};

export function getUpscaleModelMeta(id: UpscaleEngineModel): UpscaleModelDescriptor {
  return ALL_UPSCALE_MODELS.find((m) => m.id === id) ?? FREE_UPSCALE_MODELS[0];
}

export function upscaleCredits(tier: UpscaleTier, factor: UpscaleFactor): number {
  if (tier === "pro") return factor === 4 ? 4 : 3;
  return factor === 4 ? 2 : 1;
}

export function upscaleTarget(
  width: number,
  height: number,
  factor: number,
  targetPreset: UpscaleTargetPreset = "exact",
) {
  if (!width || !height) return { width: 0, height: 0 };
  if (targetPreset !== "exact") {
    const maxEdgeMap: Record<Exclude<UpscaleTargetPreset, "exact">, number> = {
      "1080p": 1920,
      "2k": 2560,
      "4k": 3840,
    };
    const maxEdge = maxEdgeMap[targetPreset];
    const longEdge = Math.max(width, height);
    const ratio = maxEdge / longEdge;
    return {
      width: Math.max(2, Math.round((width * ratio) / 2) * 2),
      height: Math.max(2, Math.round((height * ratio) / 2) * 2),
    };
  }
  return {
    width: Math.round(width * factor),
    height: Math.round(height * factor),
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function formatElapsedClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
