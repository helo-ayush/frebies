import {
  drawRegion,
  transformCanvas,
  transformImage,
  type EncodeFormat,
} from "@/lib/image/encode";
import {
  backgroundValue,
  computeResizeOutput,
  cropForRatio,
  cropPixels,
  cropRatioValue,
  resolveEncodeFormat,
  type ResizeSettings,
} from "./model";

export type ResizeRender = { canvas: HTMLCanvasElement; format: EncodeFormat };

/**
 * Build the final resize/crop result on a canvas, entirely on the device.
 * Transforms rotation & flip first, so crop operates directly on the oriented image.
 */
export function renderResize(
  image: HTMLImageElement,
  file: File,
  settings: ResizeSettings,
): ResizeRender {
  const format = resolveEncodeFormat(settings, file);

  // Apply rotation and flips to source image first
  const transformed = transformImage(image, {
    rotation: settings.rotation,
    flipX: settings.flipX,
    flipY: settings.flipY,
  });

  const tWidth = transformed.width;
  const tHeight = transformed.height;

  if (settings.mode === "crop") {
    const crop =
      settings.crop ??
      cropForRatio(
        tWidth && tHeight ? tWidth / tHeight : 1,
        cropRatioValue(settings.cropRatio),
      );
    const rect = cropPixels(crop, tWidth || 1, tHeight || 1);
    const canvas = drawRegion(
      transformed,
      rect,
      { width: rect.width, height: rect.height },
      { fit: "stretch", sharpen: settings.sharpen ? 0.45 : 0, grayscale: Boolean(settings.grayscale) },
    );
    return { canvas, format };
  }

  const output = computeResizeOutput(
    settings,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
  );
  if (!output.width || !output.height) {
    throw new Error("Set a width and height first, then try again.");
  }

  const fit =
    settings.mode === "percent"
      ? "stretch"
      : settings.fit === "fill"
        ? "cover"
        : settings.fit === "fit"
          ? "contain"
          : "stretch";

  const canvas = drawRegion(
    transformed,
    { x: 0, y: 0, width: transformed.width, height: transformed.height },
    { width: output.width, height: output.height },
    {
      fit,
      background:
        fit === "contain" || format === "jpeg"
          ? backgroundValue(settings) || (format === "jpeg" ? "#ffffff" : null)
          : null,
      anchor: { x: 0.5, y: 0.5 },
      sharpen: settings.sharpen ? 0.45 : 0,
      grayscale: Boolean(settings.grayscale),
    },
  );

  return { canvas, format };
}
