/** Any picture the browser can open, as the PNG or JPEG a PDF can hold. */

export type ReadImage = { bytes: Uint8Array; mime: "image/png" | "image/jpeg"; w: number; h: number };

/** The turn a camera noted in a JPEG. PDFs ignore it, so it has to be applied. */
function jpegTurn(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 < view.byteLength) {
    const marker = view.getUint16(at);
    const size = view.getUint16(at + 2);
    if (marker === 0xffe1 && at + 14 < view.byteLength && view.getUint32(at + 4) === 0x45786966) {
      const tiff = at + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count && ifd + 14 + i * 12 <= view.byteLength; i += 1) {
        if (view.getUint16(ifd + 2 + i * 12, little) === 0x0112) return view.getUint16(ifd + 10 + i * 12, little);
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1;
    at += 2 + size;
  }
  return 1;
}

async function decode(file: Blob): Promise<{ draw: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { draw: bitmap, w: bitmap.width, h: bitmap.height, done: () => bitmap.close() };
  } catch {
    // HEIC, TIFF and the like, through the image tools' own readers.
    const { loadImageFile } = await import("@/lib/image/encode");
    let image: HTMLImageElement;
    try {
      image = await loadImageFile(file instanceof File ? file : new File([file], "picture", { type: file.type }));
    } catch {
      throw new Error("That picture could not be opened. Try a JPG or PNG.");
    }
    return { draw: image, w: image.naturalWidth || 800, h: image.naturalHeight || 600, done: () => undefined };
  }
}

export async function readImage(file: Blob): Promise<ReadImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const picture = await decode(file);
  try {
    let turn = 1;
    if (jpeg) {
      try {
        turn = jpegTurn(bytes);
      } catch {
        turn = 1;
      }
    }
    const large = Math.max(picture.w, picture.h) > 6000;
    if ((png || (jpeg && turn === 1)) && !large)
      return { bytes, mime: png ? "image/png" : "image/jpeg", w: picture.w, h: picture.h };
    const scale = Math.min(1, 6000 / Math.max(picture.w, picture.h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(picture.w * scale));
    canvas.height = Math.max(1, Math.round(picture.h * scale));
    canvas.getContext("2d")?.drawImage(picture.draw, 0, 0, canvas.width, canvas.height);
    const mime = jpeg ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.93));
    if (!blob) throw new Error("That picture could not be opened. Try a JPG or PNG.");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime, w: canvas.width, h: canvas.height };
  } finally {
    picture.done();
  }
}
