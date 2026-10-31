export type NumberFormat = "plain" | "page" | "page-of";
export type NumberPosition = "bottom-center" | "bottom-right" | "top-center";

export type MergeSettings = {
  filename: string;
  pageNumbers: boolean;
  numberFormat: NumberFormat;
  numberPosition: NumberPosition;
  numberStart: number;
  numberSize: number;
  blankPages: boolean;
  bookmarks: boolean;
  keepMetadata: boolean;
  optimize: boolean;
  title: string;
  author: string;
  subject: string;
};

export const DEFAULT_MERGE_SETTINGS: MergeSettings = {
  filename: "",
  pageNumbers: false,
  numberFormat: "plain",
  numberPosition: "bottom-center",
  numberStart: 1,
  numberSize: 10,
  blankPages: false,
  bookmarks: true,
  keepMetadata: true,
  optimize: true,
  title: "",
  author: "",
  subject: "",
};

export type PdfInfo = {
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
};

export type MergeSignatureSource = {
  id: string;
  pages: number[];
  rotation: number;
};

export const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; sample: string }[] = [
  { value: "plain", label: "1, 2, 3", sample: "1" },
  { value: "page", label: "Page 1", sample: "Page 1" },
  { value: "page-of", label: "1 / 12", sample: "1 / 12" },
];

export const NUMBER_POSITION_OPTIONS: { value: NumberPosition; label: string }[] = [
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-center", label: "Top center" },
];

export function normalizeRotation(angle: number): number {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

/** Keeps the download name safe across Windows, macOS and Linux. */
export function outputFileName(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${cleaned || fallback || "documents-merged"}.pdf`;
}

export function mergeSignature(settings: MergeSettings, sources: MergeSignatureSource[]): string {
  return JSON.stringify({
    s: [
      settings.filename,
      settings.pageNumbers,
      settings.numberFormat,
      settings.numberPosition,
      settings.numberStart,
      settings.numberSize,
      settings.blankPages,
      settings.bookmarks,
      settings.keepMetadata,
      settings.optimize,
      settings.title,
      settings.author,
      settings.subject,
    ],
    d: sources.map((source) => [source.id, source.pages.join(","), source.rotation]),
  });
}
