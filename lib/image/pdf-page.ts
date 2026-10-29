import { createCanvas, context2d, drawRegion } from "./encode";
import { PDF_PAGE_POINTS } from "./pdf";

export type PdfPageSizeId = keyof typeof PDF_PAGE_POINTS;
export type PdfOrientation = "auto" | "portrait" | "landscape";
export type PdfPageFit = "contain" | "cover" | "stretch";

export const PDF_TARGET_DPI = 150;
export const PDF_MAX_PIXELS = 2400;

/** Page box in points for one image, honouring fixed sizes and auto orientation. */
export function pagePoints({
  pageSize,
  orientation,
  imageWidth,
  imageHeight,
}: {
  pageSize: PdfPageSizeId | "fit";
  orientation: PdfOrientation;
  imageWidth: number;
  imageHeight: number;
}): { widthPt: number; heightPt: number } {
  if (pageSize === "fit") {
    // 96 px per inch mapped to 72 pt per inch.
    return {
      widthPt: Math.max(1, imageWidth * 0.75),
      heightPt: Math.max(1, imageHeight * 0.75),
    };
  }

  const base = PDF_PAGE_POINTS[pageSize];
  const landscape =
    orientation === "landscape" ||
    (orientation === "auto" && imageWidth > imageHeight);

  return landscape
    ? { widthPt: base.height, heightPt: base.width }
    : { widthPt: base.width, heightPt: base.height };
}

/**
 * Render one PDF page (background, margin box, fit, page number) to a canvas
 * that will be JPEG-encoded and embedded in the document.
 */
export function renderPdfPage(
  image: HTMLImageElement,
  options: {
    /** Page pixel size. */
    width: number;
    height: number;
    marginPercent: number;
    fit: PdfPageFit;
    background: string;
    pageNumber?: string;
    textColor?: string;
  },
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);

  context.fillStyle = options.background;
  context.fillRect(0, 0, width, height);

  const insetX = (width * options.marginPercent) / 100;
  const insetY = (height * options.marginPercent) / 100;
  const areaWidth = Math.max(1, Math.round(width - insetX * 2));
  const areaHeight = Math.max(1, Math.round(height - insetY * 2));

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  const fitted = drawRegion(
    image,
    { x: 0, y: 0, width: imageWidth, height: imageHeight },
    { width: areaWidth, height: areaHeight },
    { fit: options.fit === "cover" ? "cover" : options.fit === "stretch" ? "stretch" : "contain" },
  );

  context.drawImage(fitted, Math.round(insetX), Math.round(insetY));

  if (options.pageNumber) {
    const fontSize = Math.max(9, Math.round(height * 0.012));
    context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    context.fillStyle = options.textColor ?? "#8b8578";
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillText(
      options.pageNumber,
      width - Math.max(insetX * 0.5, 8),
      height - Math.max(insetY * 0.4, 8),
    );
  }

  return canvas;
}

/** Page canvas size at print resolution, capped so exports stay responsive. */
export function pagePixelSize(widthPt: number, heightPt: number): {
  width: number;
  height: number;
} {
  const scale = PDF_TARGET_DPI / 72;
  const scaleDown = Math.min(1, PDF_MAX_PIXELS / Math.max(widthPt * scale, heightPt * scale));
  return {
    width: Math.max(1, Math.round(widthPt * scale * scaleDown)),
    height: Math.max(1, Math.round(heightPt * scale * scaleDown)),
  };
}
