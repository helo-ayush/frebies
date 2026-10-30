/**
 * Browser-only image pipeline shared by the image studios.
 *
 * Everything here runs on the device: files are decoded with an object URL
 * (or WASM/decoder for HEIC), drawn onto a canvas, transformed, and encoded
 * again with canvas.toBlob, custom encoders (BMP, ICO, TIFF, PDF, SVG, TGA, GIF, EPS),
 * and JSZip for batch archiving. Nothing is uploaded to any server.
 */

export type EncodeFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "svg"
  | "tiff"
  | "bmp"
  | "ico"
  | "tga"
  | "gif"
  | "eps";

export type FormatCategory = "web" | "pro";

export type Rect = { x: number; y: number; width: number; height: number };

export type Size = { width: number; height: number };

/** Normalized anchor inside the destination: 0 = start, 0.5 = centre, 1 = end. */
export type Anchor = { x: number; y: number };

export type FitMode = "cover" | "contain" | "stretch";

export const FORMAT_MIME: Record<EncodeFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tga: "image/x-tga",
  gif: "image/gif",
  eps: "application/postscript",
};

export const FORMAT_EXTENSION: Record<EncodeFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  svg: "svg",
  tiff: "tiff",
  bmp: "bmp",
  ico: "ico",
  tga: "tga",
  gif: "gif",
  eps: "eps",
};

export const FORMAT_LABEL: Record<EncodeFormat, string> = {
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  svg: "SVG",
  tiff: "TIFF",
  bmp: "BMP",
  ico: "ICO",
  tga: "TGA",
  gif: "GIF",
  eps: "EPS",
};

export const FORMAT_INFO: Record<
  EncodeFormat,
  {
    label: string;
    fullName: string;
    ext: string;
    hint: string;
    category: FormatCategory;
    lossy: boolean;
    supportsLosslessToggle: boolean;
    supportsTransparency: boolean;
    description: string;
  }
> = {
  jpeg: {
    label: "JPG",
    fullName: "JPEG Image",
    ext: "jpg",
    hint: "Universal",
    category: "web",
    lossy: true,
    supportsLosslessToggle: false,
    supportsTransparency: false,
    description: "Best for photos and general web sharing. Maximum cross-device compatibility.",
  },
  png: {
    label: "PNG",
    fullName: "Portable Network Graphics",
    ext: "png",
    hint: "Lossless",
    category: "web",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: true,
    description: "Lossless bitmap preserving sharp text, graphics, logos and full alpha transparency.",
  },
  webp: {
    label: "WebP",
    fullName: "WebP Image",
    ext: "webp",
    hint: "Modern web",
    category: "web",
    lossy: true,
    supportsLosslessToggle: true,
    supportsTransparency: true,
    description: "Google's modern web format. 30% smaller than JPG with transparency and lossless modes.",
  },
  avif: {
    label: "AVIF",
    fullName: "AV1 Image File",
    ext: "avif",
    hint: "Ultra small",
    category: "web",
    lossy: true,
    supportsLosslessToggle: true,
    supportsTransparency: true,
    description: "Next-generation AV1-based compression. Up to 50% smaller than JPG with high dynamic range.",
  },
  svg: {
    label: "SVG",
    fullName: "Scalable Vector Graphics",
    ext: "svg",
    hint: "Vector wrap",
    category: "web",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: true,
    description: "Vector XML container wrapping image in responsive viewBox for web pipelines.",
  },
  tiff: {
    label: "TIFF",
    fullName: "Tagged Image File Format",
    ext: "tiff",
    hint: "Print / Raw",
    category: "pro",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: true,
    description: "Uncompressed 24/32-bit baseline raster standard for printing, publishing & archival.",
  },
  bmp: {
    label: "BMP",
    fullName: "Windows Bitmap",
    ext: "bmp",
    hint: "Bitmap",
    category: "pro",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: false,
    description: "Standard uncompressed Windows bitmap raster with pure RGB pixel accuracy.",
  },
  ico: {
    label: "ICO",
    fullName: "Windows Icon / Favicon",
    ext: "ico",
    hint: "Favicon",
    category: "pro",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: true,
    description: "Icon format for website favicons and desktop icons (16px, 32px, 48px, 64px, 128px, 256px).",
  },
  tga: {
    label: "TGA",
    fullName: "Truevision Targa",
    ext: "tga",
    hint: "Game & 3D",
    category: "pro",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: true,
    description: "Uncompressed 32-bit RGBA texture format widely used in 3D rendering and game engines.",
  },
  gif: {
    label: "GIF",
    fullName: "Graphics Interchange Format",
    ext: "gif",
    hint: "Web graphic",
    category: "web",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: false,
    description: "Universal 8-bit palette web image standard (GIF89a) with 256 indexed colors.",
  },
  eps: {
    label: "EPS",
    fullName: "Encapsulated PostScript",
    ext: "eps",
    hint: "PostScript",
    category: "pro",
    lossy: false,
    supportsLosslessToggle: false,
    supportsTransparency: false,
    description: "Encapsulated PostScript Level 3 layout container for Adobe Illustrator, InDesign and print.",
  },
};

export const ALL_ENCODE_FORMATS: EncodeFormat[] = [
  "jpeg",
  "png",
  "webp",
  "avif",
  "svg",
  "tiff",
  "bmp",
  "ico",
  "tga",
  "gif",
  "eps",
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundSize(value: number): number {
  return Math.max(1, Math.round(value));
}

export function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

export function rotatedSize(width: number, height: number, rotation: number): Size {
  const angle = normalizeRotation(rotation);
  return angle === 90 || angle === 270
    ? { width: height, height: width }
    : { width, height };
}

/** Keep an aspect ratio, never exceed `max` on the longest edge, and never upscale above original dimensions. */
export function fitWithin(width: number, height: number, max: number): Size {
  if (!width || !height || !Number.isFinite(max) || max <= 0) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(width, height);
  const targetMax = Math.min(longest, Math.max(1, max));
  if (longest <= targetMax) return { width: roundSize(width), height: roundSize(height) };
  const factor = targetMax / longest;
  return {
    width: Math.min(roundSize(width), Math.max(1, roundSize(width * factor))),
    height: Math.min(roundSize(height), Math.max(1, roundSize(height * factor))),
  };
}

/* ------------------------------------------------------------------ *
 * Format support
 * ------------------------------------------------------------------ */

let supportCache: Partial<Record<EncodeFormat, boolean>> | null = null;

function detectSupport(): Partial<Record<EncodeFormat, boolean>> {
  const result: Partial<Record<EncodeFormat, boolean>> = {};
  if (typeof document === "undefined") return result;

  // Custom client-side encoders work reliably in 100% of browsers
  result["svg"] = true;
  result["tiff"] = true;
  result["bmp"] = true;
  result["ico"] = true;
  result["tga"] = true;
  result["gif"] = true;
  result["eps"] = true;
  result["png"] = true;
  result["jpeg"] = true;

  // Browser canvas support check for modern formats
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const browserCheck: EncodeFormat[] = ["webp", "avif"];
  browserCheck.forEach((format) => {
    const mime = FORMAT_MIME[format];
    try {
      result[format] = canvas.toDataURL(mime).startsWith(`data:${mime}`);
    } catch {
      result[format] = false;
    }
  });
  return result;
}

/** True when this browser can encode the format. */
export function supportsFormat(format: EncodeFormat): boolean {
  if (typeof document === "undefined") return false;
  if (!supportCache) supportCache = detectSupport();
  return supportCache[format] ?? false;
}

export function supportedFormats(): EncodeFormat[] {
  const available = ALL_ENCODE_FORMATS.filter(supportsFormat);
  return available.length > 0 ? available : ["jpeg", "png", "webp", "svg", "bmp"];
}

/* ------------------------------------------------------------------ *
 * Decoding and drawing
 * ------------------------------------------------------------------ */

function loadBlobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be read. Try a JPG, PNG, WebP or SVG file."));
    };
    image.src = url;
  });
}

/**
 * Decode any file into an HTMLImageElement:
 * - HEIC / HEIF handled dynamically via heic2any
 * - SVG handled with viewBox fallback sizing
 * - Standard JPG, PNG, WebP, AVIF, GIF, BMP, ICO loaded directly
 */
export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const lowerName = file.name.toLowerCase();
  const isHeic =
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif") ||
    file.type.includes("heic") ||
    file.type.includes("heif");

  if (isHeic && typeof window !== "undefined") {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/png" });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      return await loadBlobToImage(blob);
    } catch (err) {
      throw new Error(
        `Failed to decode HEIC file: ${err instanceof Error ? err.message : "unsupported format"}.`,
      );
    }
  }

  const isSvg = lowerName.endsWith(".svg") || file.type.includes("svg");
  if (isSvg) {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (svg) {
        const hasWidth = svg.hasAttribute("width") && !svg.getAttribute("width")?.includes("%");
        const hasHeight = svg.hasAttribute("height") && !svg.getAttribute("height")?.includes("%");
        if (!hasWidth || !hasHeight) {
          const viewBox = svg.getAttribute("viewBox");
          if (viewBox) {
            const parts = viewBox.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              svg.setAttribute("width", parts[2].toString());
              svg.setAttribute("height", parts[3].toString());
            }
          } else {
            svg.setAttribute("width", "1024");
            svg.setAttribute("height", "1024");
          }
          const serializer = new XMLSerializer();
          const newSvgText = serializer.serializeToString(doc);
          const modifiedBlob = new Blob([newSvgText], { type: "image/svg+xml" });
          return await loadBlobToImage(modifiedBlob);
        }
      }
    } catch {
      // Fall through to standard loading
    }
  }

  // Client-side TGA decoder for uploaded TGA textures
  const isTga = lowerName.endsWith(".tga") || file.type.includes("tga");
  if (isTga) {
    try {
      const buffer = await file.arrayBuffer();
      const imgData = decodeTgaToImageData(buffer);
      if (imgData) {
        const canvas = createCanvas(imgData.width, imgData.height);
        const ctx = context2d(canvas);
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to render decoded TGA image."));
          img.src = dataUrl;
        });
        return img;
      }
    } catch {
      // Fall through
    }
  }

  // Client-side baseline TIFF decoder for uploaded TIFF images
  const isTiff = lowerName.endsWith(".tif") || lowerName.endsWith(".tiff") || file.type.includes("tiff");
  if (isTiff) {
    try {
      const buffer = await file.arrayBuffer();
      const imgData = decodeTiffToImageData(buffer);
      if (imgData) {
        const canvas = createCanvas(imgData.width, imgData.height);
        const ctx = context2d(canvas);
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to render decoded TIFF image."));
          img.src = dataUrl;
        });
        return img;
      }
    } catch {
      // Fall through
    }
  }

  return loadBlobToImage(file);
}

/** Decodes raw TGA buffer into ImageData for browser display. */
export function decodeTgaToImageData(buffer: ArrayBuffer): ImageData | null {
  try {
    const view = new DataView(buffer);
    if (buffer.byteLength < 18) return null;
    const idLen = view.getUint8(0);
    const colorMapType = view.getUint8(1);
    const imageType = view.getUint8(2);
    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const bpp = view.getUint8(16);
    const descriptor = view.getUint8(17);
    const topDown = (descriptor & 0x20) !== 0;

    if (width <= 0 || height <= 0 || (bpp !== 32 && bpp !== 24 && bpp !== 8)) return null;

    const imgData = new ImageData(width, height);
    const data = imgData.data;
    let offset = 18 + idLen;
    if (colorMapType === 1) {
      const colorMapLen = view.getUint16(5, true);
      const colorMapBpp = view.getUint8(7);
      offset += colorMapLen * Math.ceil(colorMapBpp / 8);
    }

    const bytesPerPixel = Math.floor(bpp / 8);
    const totalPixels = width * height;
    let pixelIndex = 0;

    if (imageType === 2 || imageType === 3) {
      while (pixelIndex < totalPixels && offset < buffer.byteLength) {
        let r = 0, g = 0, b = 0, a = 255;
        if (bpp === 32) {
          b = view.getUint8(offset);
          g = view.getUint8(offset + 1);
          r = view.getUint8(offset + 2);
          a = view.getUint8(offset + 3);
        } else if (bpp === 24) {
          b = view.getUint8(offset);
          g = view.getUint8(offset + 1);
          r = view.getUint8(offset + 2);
        } else if (bpp === 8) {
          const v = view.getUint8(offset);
          r = v; g = v; b = v;
        }
        offset += bytesPerPixel;
        const row = topDown ? Math.floor(pixelIndex / width) : height - 1 - Math.floor(pixelIndex / width);
        const col = pixelIndex % width;
        const dstIdx = (row * width + col) * 4;
        data[dstIdx] = r;
        data[dstIdx + 1] = g;
        data[dstIdx + 2] = b;
        data[dstIdx + 3] = a;
        pixelIndex++;
      }
    } else if (imageType === 10 || imageType === 11) {
      while (pixelIndex < totalPixels && offset < buffer.byteLength) {
        const packetHeader = view.getUint8(offset++);
        const count = (packetHeader & 0x7f) + 1;
        const isRle = (packetHeader & 0x80) !== 0;

        if (isRle) {
          let r = 0, g = 0, b = 0, a = 255;
          if (bpp === 32) {
            b = view.getUint8(offset);
            g = view.getUint8(offset + 1);
            r = view.getUint8(offset + 2);
            a = view.getUint8(offset + 3);
          } else if (bpp === 24) {
            b = view.getUint8(offset);
            g = view.getUint8(offset + 1);
            r = view.getUint8(offset + 2);
          } else if (bpp === 8) {
            const v = view.getUint8(offset);
            r = v; g = v; b = v;
          }
          offset += bytesPerPixel;
          for (let i = 0; i < count && pixelIndex < totalPixels; i++) {
            const row = topDown ? Math.floor(pixelIndex / width) : height - 1 - Math.floor(pixelIndex / width);
            const col = pixelIndex % width;
            const dstIdx = (row * width + col) * 4;
            data[dstIdx] = r;
            data[dstIdx + 1] = g;
            data[dstIdx + 2] = b;
            data[dstIdx + 3] = a;
            pixelIndex++;
          }
        } else {
          for (let i = 0; i < count && pixelIndex < totalPixels; i++) {
            let r = 0, g = 0, b = 0, a = 255;
            if (bpp === 32) {
              b = view.getUint8(offset);
              g = view.getUint8(offset + 1);
              r = view.getUint8(offset + 2);
              a = view.getUint8(offset + 3);
            } else if (bpp === 24) {
              b = view.getUint8(offset);
              g = view.getUint8(offset + 1);
              r = view.getUint8(offset + 2);
            } else if (bpp === 8) {
              const v = view.getUint8(offset);
              r = v; g = v; b = v;
            }
            offset += bytesPerPixel;
            const row = topDown ? Math.floor(pixelIndex / width) : height - 1 - Math.floor(pixelIndex / width);
            const col = pixelIndex % width;
            const dstIdx = (row * width + col) * 4;
            data[dstIdx] = r;
            data[dstIdx + 1] = g;
            data[dstIdx + 2] = b;
            data[dstIdx + 3] = a;
            pixelIndex++;
          }
        }
      }
    }
    return imgData;
  } catch {
    return null;
  }
}

/** Decodes baseline uncompressed TIFF buffer into ImageData for browser display. */
export function decodeTiffToImageData(buffer: ArrayBuffer): ImageData | null {
  try {
    if (buffer.byteLength < 8) return null;
    const view = new DataView(buffer);
    const magic = view.getUint16(0, false);
    const isLE = magic === 0x4949; // "II"
    const isBE = magic === 0x4d4d; // "MM"
    if (!isLE && !isBE) return null;

    const version = view.getUint16(2, isLE);
    if (version !== 42) return null;

    const ifdOffset = view.getUint32(4, isLE);
    if (ifdOffset >= buffer.byteLength) return null;
    const numEntries = view.getUint16(ifdOffset, isLE);

    let width = 0;
    let height = 0;
    let samplesPerPixel = 3;
    let stripOffset = 0;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > buffer.byteLength) break;
      const tag = view.getUint16(entryOffset, isLE);
      const type = view.getUint16(entryOffset + 2, isLE);
      const valOffset = entryOffset + 8;

      if (tag === 256) width = (type === 3) ? view.getUint16(valOffset, isLE) : view.getUint32(valOffset, isLE);
      if (tag === 257) height = (type === 3) ? view.getUint16(valOffset, isLE) : view.getUint32(valOffset, isLE);
      if (tag === 277) samplesPerPixel = (type === 3) ? view.getUint16(valOffset, isLE) : 3;
      if (tag === 273) stripOffset = (type === 3) ? view.getUint16(valOffset, isLE) : view.getUint32(valOffset, isLE);
    }

    if (width > 0 && height > 0 && stripOffset > 0 && stripOffset < buffer.byteLength) {
      const imgData = new ImageData(width, height);
      const data = imgData.data;
      let srcIdx = stripOffset;
      const total = width * height;
      for (let p = 0; p < total && srcIdx < buffer.byteLength; p++) {
        const r = view.getUint8(srcIdx);
        const g = view.getUint8(srcIdx + 1);
        const b = view.getUint8(srcIdx + 2);
        const a = samplesPerPixel >= 4 ? view.getUint8(srcIdx + 3) : 255;
        srcIdx += samplesPerPixel;
        const dstIdx = p * 4;
        data[dstIdx] = r;
        data[dstIdx + 1] = g;
        data[dstIdx + 2] = b;
        data[dstIdx + 3] = a;
      }
      return imgData;
    }
  } catch {
    return null;
  }
  return null;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot draw images on a canvas.");
  return context;
}

/** Apply EXIF-aware rotation and flips to any canvas source. */
export function transformCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  options: { rotation?: number; flipX?: boolean; flipY?: boolean } = {},
): HTMLCanvasElement {
  const angle = normalizeRotation(options.rotation ?? 0);
  const target = rotatedSize(width, height, angle);
  const canvas = createCanvas(target.width, target.height);
  const context = context2d(canvas);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();

  return canvas;
}

export function transformImage(
  image: HTMLImageElement,
  options: { rotation?: number; flipX?: boolean; flipY?: boolean } = {},
): HTMLCanvasElement {
  return transformCanvas(
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    options,
  );
}

/**
 * The largest rectangle of `ratio` inside `width × height`, divided by `zoom`,
 * centred on (`centerX`, `centerY`) and clamped so it never leaves the image.
 */
export function cropRect({
  width,
  height,
  ratio,
  zoom = 1,
  centerX = 0.5,
  centerY = 0.5,
}: {
  width: number;
  height: number;
  ratio: number | null;
  zoom?: number;
  centerX?: number;
  centerY?: number;
}): Rect {
  if (!width || !height) return { x: 0, y: 0, width: 0, height: 0 };

  const effectiveRatio = ratio && ratio > 0 ? ratio : width / height;
  const baseWidth = Math.min(width, height * effectiveRatio);
  const baseHeight = baseWidth / effectiveRatio;
  const scale = clamp(zoom, 1, 8);
  const cropWidth = Math.max(1, baseWidth / scale);
  const cropHeight = Math.max(1, baseHeight / scale);

  const halfX = cropWidth / 2;
  const halfY = cropHeight / 2;
  const centerPx = clamp(centerX, 0, 1) * width;
  const centerPy = clamp(centerY, 0, 1) * height;
  const left = clamp(centerPx, halfX, width - halfX);
  const top = clamp(centerPy, halfY, height - halfY);

  return {
    x: Math.round(left - halfX),
    y: Math.round(top - halfY),
    width: Math.max(1, Math.round(cropWidth)),
    height: Math.max(1, Math.round(cropHeight)),
  };
}

/** Clamp a normalized crop centre so the crop rectangle stays inside the image. */
export function clampCropCenter({
  width,
  height,
  ratio,
  zoom,
  centerX,
  centerY,
}: {
  width: number;
  height: number;
  ratio: number | null;
  zoom: number;
  centerX: number;
  centerY: number;
}): { x: number; y: number } {
  const rect = cropRect({ width, height, ratio, zoom, centerX, centerY });
  return {
    x: width ? clamp((rect.x + rect.width / 2) / width, 0, 1) : 0.5,
    y: height ? clamp((rect.y + rect.height / 2) / height, 0, 1) : 0.5,
  };
}

function sharpen(context: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  if (amount <= 0 || width < 3 || height < 3) return;
  let data: ImageData;
  try {
    data = context.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const source = new Uint8ClampedArray(data.data);
  const target = data.data;
  const strength = clamp(amount, 0, 1);
  const centre = 1 + 4 * strength;
  const side = -strength;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const i = index + channel;
        const value =
          source[i] * centre +
          (source[i - 4] + source[i + 4] + source[i - width * 4] + source[i + width * 4]) *
            side;
        target[i] = value;
      }
    }
  }
  context.putImageData(data, 0, 0);
}

function applyGrayscale(context: CanvasRenderingContext2D, width: number, height: number) {
  let data: ImageData;
  try {
    data = context.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const target = data.data;
  for (let i = 0; i < target.length; i += 4) {
    const gray = 0.2126 * target[i] + 0.7152 * target[i + 1] + 0.0722 * target[i + 2];
    target[i] = gray;
    target[i + 1] = gray;
    target[i + 2] = gray;
  }
  context.putImageData(data, 0, 0);
}

/**
 * Draw `sourceRect` of a decoded canvas into an exact output size, honouring
 * cover / contain / stretch, background colour, sharpening, and grayscale.
 */
export function drawRegion(
  source: CanvasImageSource,
  sourceRect: Rect,
  output: Size,
  options: {
    fit?: FitMode;
    background?: string | null;
    anchor?: Anchor;
    sharpen?: number;
    grayscale?: boolean;
  } = {},
): HTMLCanvasElement {
  const width = roundSize(output.width);
  const height = roundSize(output.height);
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  }

  const fit = options.fit ?? "stretch";
  const anchor = options.anchor ?? { x: 0.5, y: 0.5 };
  const sourceWidth = Math.max(1, sourceRect.width);
  const sourceHeight = Math.max(1, sourceRect.height);

  let drawWidth = width;
  let drawHeight = height;
  let drawX = 0;
  let drawY = 0;

  if (fit !== "stretch") {
    const scale =
      fit === "cover"
        ? Math.max(width / sourceWidth, height / sourceHeight)
        : Math.min(width / sourceWidth, height / sourceHeight);
    drawWidth = sourceWidth * scale;
    drawHeight = sourceHeight * scale;
    drawX = (width - drawWidth) * anchor.x;
    drawY = (height - drawHeight) * anchor.y;
  }

  context.drawImage(
    source,
    sourceRect.x,
    sourceRect.y,
    sourceWidth,
    sourceHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );

  if (options.grayscale) applyGrayscale(context, width, height);
  if (options.sharpen) sharpen(context, width, height, options.sharpen);

  return canvas;
}

/* ------------------------------------------------------------------ *
 * Custom Encoders: BMP, ICO, TIFF, PDF, SVG, TGA, GIF, EPS
 * ------------------------------------------------------------------ */

/** Encodes a canvas as an uncompressed 24-bit Windows Bitmap (BMP). */
export function canvasToBmpBlob(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const context = context2d(canvas);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  view.setUint16(0, 0x424d, false); // 'BM'
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, 54, true);

  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true); // uncompressed
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  const bytes = new Uint8Array(buffer);
  let offset = 54;
  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = offset;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      bytes[offset] = data[idx + 2]; // B
      bytes[offset + 1] = data[idx + 1]; // G
      bytes[offset + 2] = data[idx]; // R
      offset += 3;
    }
    while ((offset - rowStart) % 4 !== 0) {
      bytes[offset++] = 0;
    }
  }

  return new Blob([buffer], { type: "image/bmp" });
}

/** Creates a square canvas containing the aspect-fitted source image on transparent background. */
export function createIcoCanvas(
  canvas: HTMLCanvasElement,
  size = 256,
  backgroundColor?: string | null,
): HTMLCanvasElement {
  const iconDim = Math.min(256, Math.max(16, roundSize(size)));
  const iconCanvas = createCanvas(iconDim, iconDim);
  const context = context2d(iconCanvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, iconDim, iconDim);
  }

  const sW = canvas.width;
  const sH = canvas.height;
  const scale = Math.min(iconDim / sW, iconDim / sH);
  const dW = sW * scale;
  const dH = sH * scale;
  const dX = (iconDim - dW) / 2;
  const dY = (iconDim - dH) / 2;
  context.drawImage(canvas, dX, dY, dW, dH);
  return iconCanvas;
}

/** Encodes a canvas as an ICO icon file with custom square dimension. */
export async function canvasToIcoBlob(
  canvas: HTMLCanvasElement,
  size = 256,
  backgroundColor?: string | null,
): Promise<Blob> {
  const iconDim = Math.min(256, Math.max(16, roundSize(size)));
  const iconCanvas = createIcoCanvas(canvas, iconDim, backgroundColor);

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    iconCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("ICO frame encoding failed"))),
      "image/png",
    );
  });
  const pngBuffer = await pngBlob.arrayBuffer();
  const pngBytes = new Uint8Array(pngBuffer);

  const headerSize = 22;
  const totalSize = headerSize + pngBytes.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // ICO
  view.setUint16(4, 1, true); // 1 image

  view.setUint8(6, iconDim === 256 ? 0 : iconDim);
  view.setUint8(7, iconDim === 256 ? 0 : iconDim);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, headerSize, true);

  const bytes = new Uint8Array(buffer);
  bytes.set(pngBytes, headerSize);

  return new Blob([buffer], { type: "image/x-icon" });
}

/** Encodes a canvas as an uncompressed baseline TIFF 6.0 file. */
export function canvasToTiffBlob(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const context = context2d(canvas);
  const imgData = context.getImageData(0, 0, width, height);
  const data = imgData.data;

  const numTags = 12;
  const headerSize = 8;
  const ifdSize = 2 + numTags * 12 + 4;
  const extraSize = 8 + 8 + 8; // BitsPerSample [8,8,8], XRes, YRes
  const pixelOffset = headerSize + ifdSize + extraSize;
  const pixelBytes = width * height * 3;
  const totalSize = pixelOffset + pixelBytes;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header: 'II' (Little Endian)
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, headerSize, true);

  let offset = headerSize;
  view.setUint16(offset, numTags, true);
  offset += 2;

  function writeTag(tag: number, type: number, count: number, val: number) {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, val, true);
    offset += 12;
  }

  const bpsOffset = headerSize + ifdSize;
  const xresOffset = bpsOffset + 8;
  const yresOffset = xresOffset + 8;

  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 3, bpsOffset); // BitsPerSample
  writeTag(259, 3, 1, 1); // Compression: none
  writeTag(262, 3, 1, 2); // Photometric: RGB
  writeTag(273, 4, 1, pixelOffset); // StripOffsets
  writeTag(277, 3, 1, 3); // SamplesPerPixel
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, pixelBytes); // StripByteCounts
  writeTag(282, 5, 1, xresOffset); // XResolution
  writeTag(283, 5, 1, yresOffset); // YResolution
  writeTag(296, 3, 1, 2); // ResolutionUnit: inch

  view.setUint32(offset, 0, true); // Next IFD = 0
  offset += 4;

  // BitsPerSample values [8, 8, 8]
  view.setUint16(bpsOffset, 8, true);
  view.setUint16(bpsOffset + 2, 8, true);
  view.setUint16(bpsOffset + 4, 8, true);

  // XResolution: 72/1
  view.setUint32(xresOffset, 72, true);
  view.setUint32(xresOffset + 4, 1, true);

  // YResolution: 72/1
  view.setUint32(yresOffset, 72, true);
  view.setUint32(yresOffset + 4, 1, true);

  // RGB Pixel Data
  let pOff = pixelOffset;
  for (let i = 0; i < data.length; i += 4) {
    bytes[pOff++] = data[i]; // R
    bytes[pOff++] = data[i + 1]; // G
    bytes[pOff++] = data[i + 2]; // B
  }

  return new Blob([buffer], { type: "image/tiff" });
}

/** Encodes a canvas into a single-page standalone PDF document. */
export async function canvasToPdfBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  const width = canvas.width;
  const height = canvas.height;
  const jpegBlob = await canvasToBlob(canvas, "jpeg", quality);
  const jpegBuffer = await jpegBlob.arrayBuffer();
  const jpegBytes = new Uint8Array(jpegBuffer);

  const enc = new TextEncoder();
  const header = enc.encode("%PDF-1.4\n");
  const obj1 = enc.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const obj2 = enc.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  const obj3 = enc.encode(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  const obj4Head = enc.encode(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  const obj4Foot = enc.encode("\nendstream\nendobj\n");
  const contentStr = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  const obj5 = enc.encode(`5 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}endstream\nendobj\n`);

  let offset = header.length;
  const offset1 = offset; offset += obj1.length;
  const offset2 = offset; offset += obj2.length;
  const offset3 = offset; offset += obj3.length;
  const offset4 = offset; offset += obj4Head.length + jpegBytes.length + obj4Foot.length;
  const offset5 = offset; offset += obj5.length;
  const xrefOffset = offset;

  const pad10 = (n: number) => n.toString().padStart(10, "0");
  const xref = enc.encode(
    `xref\n0 6\n0000000000 65535 f \n${pad10(offset1)} 00000 n \n${pad10(offset2)} 00000 n \n${pad10(offset3)} 00000 n \n${pad10(offset4)} 00000 n \n${pad10(offset5)} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new Blob([header, obj1, obj2, obj3, obj4Head, jpegBytes, obj4Foot, obj5, xref], {
    type: "application/pdf",
  });
}

/** Wraps a canvas into a scalable vector SVG container. */
export function canvasToSvgBlob(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const dataUrl = canvas.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>Converted Image</title>
  <image width="${width}" height="${height}" href="${dataUrl}" />
</svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

/** Encodes a canvas into a 32-bit Truevision Targa (TGA) file. */
export function canvasToTgaBlob(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const context = context2d(canvas);
  const imgData = context.getImageData(0, 0, width, height);
  const data = imgData.data;

  const headerSize = 18;
  const pixelSize = width * height * 4;
  const buffer = new ArrayBuffer(headerSize + pixelSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, 0); // No ID
  view.setUint8(1, 0); // No color map
  view.setUint8(2, 2); // Uncompressed true-color
  view.setUint16(12, width, true);
  view.setUint16(14, height, true);
  view.setUint8(16, 32); // 32 bits BGRA
  view.setUint8(17, 0x28); // Top-to-bottom + 8-bit alpha

  let offset = headerSize;
  for (let i = 0; i < data.length; i += 4) {
    bytes[offset++] = data[i + 2]; // B
    bytes[offset++] = data[i + 1]; // G
    bytes[offset++] = data[i];     // R
    bytes[offset++] = data[i + 3]; // A
  }

  return new Blob([buffer], { type: "image/x-tga" });
}

/** Encodes a canvas into an Encapsulated PostScript (EPS) level 3 file. */
export function canvasToEpsBlob(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const context = context2d(canvas);
  const imgData = context.getImageData(0, 0, width, height);
  const data = imgData.data;

  const parts: string[] = [
    `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${width} ${height}\n%%Pages: 1\n%%Title: Converted Image\n%%Creator: frebies\n%%EndComments\n`,
    `/picstr ${width * 3} string def\ngsave\n0 0 translate\n${width} ${height} scale\n`,
    `${width} ${height} 8 [${width} 0 0 -${height} 0 ${height}] {currentfile picstr readhexstring pop} false 3 colorimage\ngrestore\n`,
  ];

  let hex = "";
  for (let i = 0; i < data.length; i += 4) {
    hex += data[i].toString(16).padStart(2, "0") +
           data[i + 1].toString(16).padStart(2, "0") +
           data[i + 2].toString(16).padStart(2, "0");
    if ((i / 4) % 30 === 29) hex += "\n";
  }
  parts.push(hex + "\n%%EOF\n");

  return new Blob(parts, { type: "application/postscript" });
}

/** Encodes a canvas into a quantized 256-color static GIF (GIF89a). */
export function canvasToGifBlob(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const context = context2d(canvas);
  const imgData = context.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 6x6x6 color cube (216 colors) + 40 grayscale levels = 256 colors
  const palette: number[][] = [];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i / 39) * 255);
    palette.push([v, v, v]);
  }

  const indexedPixels = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const rIdx = Math.min(5, Math.max(0, Math.round(data[i] / 51)));
    const gIdx = Math.min(5, Math.max(0, Math.round(data[i + 1] / 51)));
    const bIdx = Math.min(5, Math.max(0, Math.round(data[i + 2] / 51)));
    indexedPixels[p] = rIdx * 36 + gIdx * 6 + bIdx;
  }

  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const outBytes: number[] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // 'GIF89a'
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    0xf7, 0x00, 0x00, // 256 colors
  ];

  for (let i = 0; i < 256; i++) {
    const col = palette[i] ?? [0, 0, 0];
    outBytes.push(col[0], col[1], col[2]);
  }

  outBytes.push(0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00);
  outBytes.push(0x2c, 0x00, 0x00, 0x00, 0x00);
  outBytes.push(width & 0xff, (width >> 8) & 0xff);
  outBytes.push(height & 0xff, (height >> 8) & 0xff);
  outBytes.push(0x00, minCodeSize);

  let curCodeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const dict = new Map<string, number>();

  let accum = 0;
  let accumBits = 0;
  const subBlock: number[] = [];

  function writeBits(code: number, numBits: number) {
    accum |= code << accumBits;
    accumBits += numBits;
    while (accumBits >= 8) {
      subBlock.push(accum & 0xff);
      accum >>= 8;
      accumBits -= 8;
      if (subBlock.length === 254) {
        outBytes.push(subBlock.length, ...subBlock);
        subBlock.length = 0;
      }
    }
  }

  function flushBits() {
    if (accumBits > 0) {
      subBlock.push(accum & 0xff);
      accum = 0;
      accumBits = 0;
    }
    if (subBlock.length > 0) {
      outBytes.push(subBlock.length, ...subBlock);
      subBlock.length = 0;
    }
  }

  writeBits(clearCode, curCodeSize);

  let prefix = "";
  for (let i = 0; i < indexedPixels.length; i++) {
    const k = indexedPixels[i].toString();
    const pk = prefix === "" ? k : prefix + "," + k;
    if (dict.has(pk)) {
      prefix = pk;
    } else {
      const code = prefix === "" ? indexedPixels[i] : (prefix.includes(",") ? dict.get(prefix)! : Number(prefix));
      writeBits(code, curCodeSize);
      if (nextCode < 4096) {
        dict.set(pk, nextCode++);
        if (nextCode > (1 << curCodeSize) && curCodeSize < 12) {
          curCodeSize++;
        }
      } else {
        writeBits(clearCode, curCodeSize);
        dict.clear();
        curCodeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      }
      prefix = k;
    }
  }

  if (prefix !== "") {
    const code = prefix.includes(",") ? dict.get(prefix)! : Number(prefix);
    writeBits(code, curCodeSize);
  }

  writeBits(eoiCode, curCodeSize);
  flushBits();

  outBytes.push(0x00, 0x3b); // Terminator + Trailer

  return new Blob([new Uint8Array(outBytes)], { type: "image/gif" });
}

/* ------------------------------------------------------------------ *
 * Unified Canvas to Blob
 * ------------------------------------------------------------------ */

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: EncodeFormat,
  quality = 0.92,
  options: {
    lossless?: boolean;
    icoSize?: number;
    backgroundColor?: string | null;
  } = {},
): Promise<Blob> {
  const targetQuality = options.lossless ? 1.0 : clamp(quality, 0.05, 1);

  if (format === "bmp") return canvasToBmpBlob(canvas);
  if (format === "ico") return canvasToIcoBlob(canvas, options.icoSize ?? 256, options.backgroundColor);
  if (format === "tiff") return canvasToTiffBlob(canvas);
  if (format === "svg") return canvasToSvgBlob(canvas);
  if (format === "tga") return canvasToTgaBlob(canvas);
  if (format === "eps") return canvasToEpsBlob(canvas);
  if (format === "gif") return canvasToGifBlob(canvas);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`This browser could not encode the image to ${FORMAT_LABEL[format]}.`));
        },
        FORMAT_MIME[format],
        targetQuality,
      );
    } catch {
      reject(new Error(`This browser could not encode the image to ${FORMAT_LABEL[format]}.`));
    }
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Downloads multiple files bundled into a single ZIP archive using JSZip.
 * Avoids browser popup blockers and multiple-download warnings.
 */
export async function downloadAllAsZip(
  files: { blob: Blob; name: string }[],
  zipFilename = "frebies-converted.zip",
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const nameCounts: Record<string, number> = {};

  for (const item of files) {
    let name = item.name;
    if (nameCounts[name] !== undefined) {
      nameCounts[name] += 1;
      const dot = name.lastIndexOf(".");
      name = dot > 0
        ? `${name.slice(0, dot)}-${nameCounts[item.name]}${name.slice(dot)}`
        : `${name}-${nameCounts[item.name]}`;
    } else {
      nameCounts[name] = 0;
    }
    zip.file(name, item.blob);
  }

  const content = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  downloadBlob(content, zipFilename);
}

export function outputFilename(
  input: string,
  format: EncodeFormat,
  suffix = "",
): string {
  const base = input.replace(/\.[^./\\]+$/, "").trim() || "image";
  const safe = base.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").slice(0, 90);
  return `${safe}${suffix}.${FORMAT_EXTENSION[format]}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}
