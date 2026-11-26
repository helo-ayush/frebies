import type { PDFPageProxy, PageViewport, RenderTask } from "pdfjs-dist";

/** Draws a page on nothing: what it does not paint stays see-through. */
export function renderClear(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  options: { annotationMode?: number } = {},
): RenderTask {
  // Given only a canvas, pdf.js asks for one that cannot be seen through.
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) throw new Error("This browser cannot draw.");
  return page.render({ canvas: null, canvasContext, viewport, background: "rgba(0,0,0,0)", ...options });
}
