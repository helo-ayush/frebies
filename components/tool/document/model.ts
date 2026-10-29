/** Shared helpers for the document studios (all interface previews). */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function fileStem(name: string): string {
  return name.replace(/\.[^./\\]+$/, "").trim() || "document";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** "1, 2, 5–8" style summary for a set of page numbers. */
export function rangeLabel(pages: number[]): string {
  if (pages.length === 0) return "No pages";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = current;
    previous = current;
  }

  const label = parts.join(", ");
  return label.length > 46 ? `${label.slice(0, 43)}…` : label;
}

/**
 * Cheap page-count probe: the catalog `/Count` entry and uncompressed
 * `/Type /Page` objects. Compressed object streams fall back to 1 page, and the
 * studio labels the count as an estimate in that case.
 */
export function pdfPageCount(buffer: ArrayBuffer): number {
  try {
    const text = new TextDecoder("latin1").decode(new Uint8Array(buffer));
    const counts = [...text.matchAll(/\/Count\s+(\d+)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0 && value < 5000);
    if (counts.length > 0) return Math.max(...counts);

    const pageObjects = text.match(/\/Type\s*\/Page[^s]/g);
    if (pageObjects && pageObjects.length > 0) return Math.min(pageObjects.length, 5000);
  } catch {
    // Ignore unreadable metadata; the UI falls back to a single page.
  }
  return 1;
}

export function pagesOf(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => index + 1);
}

/** "1-3, 5" → [1, 2, 3, 5]; ignores anything outside the document. */
export function parseRanges(input: string, pageCount: number): number[] {
  const pages = new Set<number>();
  const tokens = input.split(/[,\s]+/).filter(Boolean);

  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const low = clamp(Math.min(from, to), 1, pageCount);
    const high = clamp(Math.max(from, to), 1, pageCount);
    for (let page = low; page <= high; page += 1) pages.add(page);
  }

  return [...pages].sort((a, b) => a - b);
}

export function evenPages(pageCount: number, every: number, which: "each" | "odd" | "even"): number[][] {
  const safeEvery = clamp(Math.round(every) || 1, 1, 100);
  if (which === "odd" || which === "even") {
    const wanted = pagesOf(pageCount).filter((page) => (which === "odd" ? page % 2 === 1 : page % 2 === 0));
    return wanted.map((page) => [page]);
  }
  const groups: number[][] = [];
  for (let page = 1; page <= pageCount; page += safeEvery) {
    groups.push(pagesOf(Math.min(safeEvery, pageCount - page + 1)).map((offset) => page + offset - 1));
  }
  return groups;
}
