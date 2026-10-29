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
 *
 * Crop mode mirrors the studio: the crop rectangle is taken from the source,
 * then rotation and flips are applied to the cropped result (which is why the
 * output dimensions swap for a quarter turn).
 */
export function renderResize(
  image: HTMLImageElement,
  file: File,
  settings: ResizeSettings,
): ResizeRender {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const format = resolveEncodeFormat(settings, file);

  if (settings.mode === "crop") {
    const crop =
      settings.crop ??
      cropForRatio(
        width && height ? width / height : 1,
        cropRatioValue(settings.cropRatio),
      );
    const rect = cropPixels(crop, width || 1, height || 1);
    const cropped = drawRegion(
      image,
      rect,
      { width: rect.width, height: rect.height },
      { fit: "stretch" },
    );
    const canvas = transformCanvas(cropped, cropped.width, cropped.height, {
      rotation: settings.rotation,
      flipX: settings.flipX,
      flipY: settings.flipY,
    });
    return { canvas, format };
  }

  const transformed = transformImage(image, {
    rotation: settings.rotation,
    flipX: settings.flipX,
    flipY: settings.flipY,
  });
  const output = computeResizeOutput(settings, width, height);
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
      background: fit === "contain" ? backgroundValue(settings) : null,
      anchor: { x: 0.5, y: 0.5 },
      sharpen: settings.sharpen ? 0.55 : 0,
    },
  );

  return { canvas, format };
}
