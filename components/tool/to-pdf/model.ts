export type PageSizeId = "a4" | "letter" | "a5" | "legal" | "fit";
export type PageOrientation = "auto" | "portrait" | "landscape";
export type MarginId = "none" | "small" | "medium" | "large";
export type PdfFit = "contain" | "cover" | "stretch";
export type PdfBackground = "white" | "cream" | "black";

export type PageNumberPosition = "bottom-center" | "bottom-right" | "bottom-left";

export type PdfSettings = {
  pageSize: PageSizeId;
  orientation: PageOrientation;
  margin: MarginId;
  fit: PdfFit;
  background: PdfBackground;
  quality: number;
  optimize: boolean;
  pageNumbers: boolean;
  pageNumberPosition: PageNumberPosition;
  grayscale: boolean;
  keepMetadata: boolean;
  filename: string;
};

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  pageSize: "a4",
  orientation: "auto",
  margin: "medium",
  fit: "contain",
  background: "white",
  quality: 85,
  optimize: true,
  pageNumbers: true,
  pageNumberPosition: "bottom-center",
  grayscale: false,
  keepMetadata: true,
  filename: "images",
};

export const PAGE_SIZES: {
  id: PageSizeId;
  label: string;
  detail: string;
  ratio: number | null;
}[] = [
  { id: "a4", label: "A4", detail: "210 × 297 mm", ratio: 210 / 297 },
  { id: "letter", label: "Letter", detail: "8.5 × 11 in", ratio: 8.5 / 11 },
  { id: "a5", label: "A5", detail: "148 × 210 mm", ratio: 148 / 210 },
  { id: "legal", label: "Legal", detail: "8.5 × 14 in", ratio: 8.5 / 14 },
  { id: "fit", label: "Fit image", detail: "Page matches image", ratio: null },
];

export const ORIENTATIONS: { id: PageOrientation; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
];

export const MARGINS: { id: MarginId; label: string; percent: number }[] = [
  { id: "none", label: "None", percent: 0 },
  { id: "small", label: "Small", percent: 4 },
  { id: "medium", label: "Medium", percent: 7 },
  { id: "large", label: "Large", percent: 11 },
];

export const PDF_FITS: { id: PdfFit; label: string; hint: string }[] = [
  { id: "contain", label: "Contain", hint: "Full image, possible margins." },
  { id: "cover", label: "Cover", hint: "Fill the page, crop the edges." },
  { id: "stretch", label: "Stretch", hint: "Fill exactly, may distort." },
];

export const PDF_BACKGROUNDS: { id: PdfBackground; label: string; value: string }[] = [
  { id: "white", label: "White", value: "#ffffff" },
  { id: "cream", label: "Cream", value: "#fbf8f1" },
  { id: "black", label: "Charcoal", value: "#151515" },
];

export function pageSizeMeta(id: PageSizeId) {
  return PAGE_SIZES.find((size) => size.id === id) ?? PAGE_SIZES[0];
}

export function marginMeta(id: MarginId) {
  return MARGINS.find((margin) => margin.id === id) ?? MARGINS[2];
}

export function backgroundValue(id: PdfBackground): string {
  return PDF_BACKGROUNDS.find((background) => background.id === id)?.value ?? "#ffffff";
}

export function pageAspect({
  settings,
  imageWidth,
  imageHeight,
}: {
  settings: PdfSettings;
  imageWidth?: number;
  imageHeight?: number;
}): number {
  const size = pageSizeMeta(settings.pageSize);
  const imageRatio =
    imageWidth && imageHeight ? imageWidth / imageHeight : 1 / 1.4142;

  if (size.ratio === null) return imageRatio;

  if (settings.orientation === "portrait") return size.ratio;
  if (settings.orientation === "landscape") return 1 / size.ratio;
  return imageRatio > 1 ? 1 / size.ratio : size.ratio;
}

export function orientationLabel(settings: PdfSettings, aspect: number): string {
  return aspect > 1 ? "Landscape" : "Portrait";
}

export function pageLabel(settings: PdfSettings, aspect: number): string {
  if (settings.pageSize === "fit") return "Custom page";
  return `${pageSizeMeta(settings.pageSize).label} · ${orientationLabel(settings, aspect)}`;
}

export function estimatePdfBytes(
  inputBytes: number,
  pageCount: number,
  quality: number,
  optimize: boolean,
): number {
  if (!pageCount) return 0;
  const reencode = optimize ? 0.34 + 0.54 * Math.pow(quality / 100, 1.8) : 0.92;
  const overhead = pageCount * 4200;
  return Math.max(16 * 1024, Math.round(inputBytes * reencode + overhead));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function pdfFilename(value: string): string {
  const trimmed = value.trim().replace(/\.pdf$/i, "");
  return `${trimmed || "images"}.pdf`;
}
