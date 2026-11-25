"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

export type PageImageFormat = "JPG" | "PNG" | "WebP";

export type PageImage = {
  page: number;
  name: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

export type RenderOptions = {
  format: PageImageFormat;
  /** 1–100, ignored for PNG. */
  quality: number;
  dpi: number;
  /** CSS colour, or "transparent" (PNG / WebP only). */
  background: string;
  trimMargins: boolean;
  baseName: string;
};

const MIME: Record<PageImageFormat, string> = {
  JPG: "image/jpeg",
  PNG: "image/png",
  WebP: "image/webp",
};

const EXTENSION: Record<PageImageFormat, string> = { JPG: "jpg", PNG: "png", WebP: "webp" };

/** Browsers fail silently past roughly this many canvas pixels. */
const MAX_PIXELS = 32_000_000;

/** Output pixel size for a page of the given point size at a DPI. */
export function outputPixels(widthPt: number, heightPt: number, dpi: number) {
  let scale = dpi / 72;
  const pixels = widthPt * heightPt * scale * scale;
  if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
  return {
    width: Math.max(1, Math.round(widthPt * scale)),
    height: Math.max(1, Math.round(heightPt * scale)),
    scale,
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode this page."))),
      type,
      quality,
    );
  });
}

/** Crops uniform borders that match the top-left pixel, keeping a small margin. */
function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const [r0, g0, b0, a0] = [data[0], data[1], data[2], data[3]];
  const differs = (offset: number) =>
    Math.abs(data[offset] - r0) > 10 ||
    Math.abs(data[offset + 1] - g0) > 10 ||
    Math.abs(data[offset + 2] - b0) > 10 ||
    Math.abs(data[offset + 3] - a0) > 10;

  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  // Sample every other pixel: plenty for finding a content box, and 4x faster.
  for (let y = 0; y < height; y += 2) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 2) {
      if (!differs(row + x * 4)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return canvas;

  const pad = Math.round(Math.min(width, height) * 0.02);
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  const w = Math.min(width, right + pad + 1) - x;
  const h = Math.min(height, bottom + pad + 1) - y;
  if (w >= width && h >= height) return canvas;

  const cropped = document.createElement("canvas");
  cropped.width = w;
  cropped.height = h;
  cropped.getContext("2d")?.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return cropped;
}

/** Renders the chosen pages to image files, one at a time, in the browser. */
export async function renderPagesToImages(
  pdf: PDFDocumentProxy,
  pages: number[],
  options: RenderOptions,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<PageImage[]> {
  const results: PageImage[] = [];
  const transparent = options.background === "transparent" && options.format !== "JPG";
  const background = transparent ? "rgba(0,0,0,0)" : options.background === "transparent" ? "#ffffff" : options.background;
  const digits = String(pdf.numPages).length;

  for (let index = 0; index < pages.length; index += 1) {
    if (isCancelled?.()) break;
    const pageNumber = pages[index];
    const page = await pdf.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const { scale } = outputPixels(base.width, base.height, options.dpi);
      const viewport = page.getViewport({ scale });

      let canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvas, viewport, background }).promise;

      if (options.trimMargins) canvas = trimCanvas(canvas);

      const blob = await toBlob(
        canvas,
        MIME[options.format],
        options.format === "PNG" ? undefined : options.quality / 100,
      );
      results.push({
        page: pageNumber,
        name: `${options.baseName}-${String(pageNumber).padStart(digits, "0")}.${EXTENSION[options.format]}`,
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
      });
      // Release the bitmap memory before the next page.
      canvas.width = 0;
      canvas.height = 0;
    } finally {
      page.cleanup();
    }
    onProgress?.(index + 1, pages.length);
  }

  return results;
}
