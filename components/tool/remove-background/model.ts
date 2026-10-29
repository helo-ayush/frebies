export type SubjectType = "auto" | "person" | "product" | "graphic";
export type RemoverBackground = "transparent" | "white" | "black" | "color";
export type RemoverFormat = "png" | "webp" | "jpg";

export type RemoverSettings = {
  subject: SubjectType;
  feather: number;
  fineDetail: boolean;
  cropToSubject: boolean;
  background: RemoverBackground;
  color: string;
  shadow: boolean;
  shadowSoftness: number;
  format: RemoverFormat;
  metadata: boolean;
};

export const REMOVER_COST = 1;

export const DEFAULT_REMOVER_SETTINGS: RemoverSettings = {
  subject: "auto",
  feather: 2,
  fineDetail: true,
  cropToSubject: false,
  background: "transparent",
  color: "#f4f0e8",
  shadow: true,
  shadowSoftness: 28,
  format: "png",
  metadata: true,
};

export const SUBJECT_TYPES: { value: SubjectType; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "Detects people, products and graphics automatically.",
  },
  {
    value: "person",
    label: "Person",
    hint: "Tuned for hair, shoulders and soft edges around people.",
  },
  {
    value: "product",
    label: "Product",
    hint: "Keeps hard packaging edges, labels and reflections clean.",
  },
  {
    value: "graphic",
    label: "Graphic",
    hint: "Best for logos, icons and flat illustration on a solid background.",
  },
];

export const REMOVER_BACKGROUNDS: {
  value: RemoverBackground;
  label: string;
  hint: string;
}[] = [
  { value: "transparent", label: "Transparent", hint: "PNG with alpha" },
  { value: "white", label: "White", hint: "Clean studio fill" },
  { value: "black", label: "Black", hint: "High contrast" },
  { value: "color", label: "Custom", hint: "Pick any colour" },
];

export const REMOVER_FORMATS: { value: RemoverFormat; label: string; hint: string }[] = [
  {
    value: "png",
    label: "PNG",
    hint: "Lossless and transparent. The best default for cut-outs.",
  },
  {
    value: "webp",
    label: "WebP",
    hint: "Smaller files with transparency for the web.",
  },
  {
    value: "jpg",
    label: "JPG",
    hint: "No transparency — the chosen background is filled in.",
  },
];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}
