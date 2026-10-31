"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfThumbnail = {
  dataUrl: string;
  width: number;
  height: number;
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function openPdfDocument(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    // pdf.js transfers the buffer it receives, so the caller keeps its own copy.
    data: new Uint8Array(bytes.slice(0)),
    isEvalSupported: false,
  });
  return task.promise;
}

export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number,
  rotation = 0,
): Promise<PdfThumbnail> {
  const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
  try {
    const angle = (((page.rotate + rotation) % 360) + 360) % 360;
    const base = page.getViewport({ scale: 1, rotation: angle });
    const ratio =
      typeof window === "undefined" ? 1 : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const scale = Math.max(0.05, Math.min(4, (maxWidth * ratio) / base.width));
    const viewport = page.getViewport({ scale, rotation: angle });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvas, viewport }).promise;

    return {
      dataUrl: canvas.toDataURL("image/webp", 0.82),
      width: Math.round(viewport.width / ratio),
      height: Math.round(viewport.height / ratio),
    };
  } finally {
    page.cleanup();
  }
}

export async function renderPdfThumbnail(
  bytes: ArrayBuffer,
  maxWidth: number,
  rotation = 0,
): Promise<PdfThumbnail> {
  const pdf = await openPdfDocument(bytes);
  try {
    return await renderPdfPage(pdf, 1, maxWidth, rotation);
  } finally {
    await pdf.destroy();
  }
}
