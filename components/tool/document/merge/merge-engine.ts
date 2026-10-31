import {
  EncryptedPDFError,
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { fileStem } from "../model";
import {
  normalizeRotation,
  type MergeSettings,
  type PdfInfo,
} from "./merge-model";

export type MergeSource = {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  /** Selected source pages, 1-based and in output order. */
  pages: number[];
  rotation: number;
  info: PdfInfo;
};

export type MergeOutcome = {
  bytes: Uint8Array;
  pageCount: number;
  bookmarks: number;
  blankPages: number;
};

export class MergeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeFileError";
  }
}

export class MergeCancelled extends Error {
  constructor() {
    super("Merge cancelled");
    this.name = "MergeCancelled";
  }
}

const A4 = { width: 595.28, height: 841.89 };
const PAGE_NUMBER_COLOR = rgb(0.31, 0.31, 0.33);

function yieldToUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function safeRead<T>(read: () => T | undefined): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

export async function readPdfInfo(bytes: ArrayBuffer): Promise<PdfInfo> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new MergeFileError(
        "This PDF is password-protected. Remove its password, then add the file again.",
      );
    }
    throw new MergeFileError(
      "This file could not be read as a PDF. It may be damaged or use an unsupported format.",
    );
  }

  if (document.isEncrypted) {
    throw new MergeFileError(
      "This PDF is password-protected. Remove its password, then add the file again.",
    );
  }

  const pageCount = document.getPageCount();
  if (pageCount < 1) {
    throw new MergeFileError("This PDF has no pages to merge.");
  }

  return {
    pageCount,
    title: safeRead(() => document.getTitle())?.trim() || undefined,
    author: safeRead(() => document.getAuthor())?.trim() || undefined,
    subject: safeRead(() => document.getSubject())?.trim() || undefined,
  };
}

function formatPageNumber(format: MergeSettings["numberFormat"], number: number, total: number) {
  if (format === "page") return `Page ${number}`;
  if (format === "page-of") return `${number} / ${total}`;
  return `${number}`;
}

/**
 * Maps a point measured from the bottom-left of the *displayed* page back to
 * the unrotated page space pdf-lib draws in. /Rotate turns pages clockwise.
 */
function displayToPage(u: number, v: number, width: number, height: number, angle: number) {
  switch (angle) {
    case 90:
      return { x: width - v, y: u };
    case 180:
      return { x: width - u, y: height - v };
    case 270:
      return { x: v, y: height - u };
    default:
      return { x: u, y: v };
  }
}

function drawPageNumber(
  page: PDFPage,
  angle: number,
  label: string,
  font: PDFFont,
  size: number,
  position: MergeSettings["numberPosition"],
) {
  const { width, height } = page.getSize();
  const sideways = angle === 90 || angle === 270;
  const displayWidth = sideways ? height : width;
  const displayHeight = sideways ? width : height;
  const margin = Math.max(18, Math.round(size * 2.2));
  const textWidth = font.widthOfTextAtSize(label, size);

  const u =
    position === "bottom-right"
      ? displayWidth - margin - textWidth
      : (displayWidth - textWidth) / 2;
  const v = position === "top-center" ? displayHeight - margin - size : margin;
  const { x, y } = displayToPage(u, v, width, height, angle);

  page.drawText(label, {
    x,
    y,
    size,
    font,
    color: PAGE_NUMBER_COLOR,
    rotate: degrees(angle),
  });
}

function addOutline(
  output: PDFDocument,
  entries: { title: string; page: PDFPage }[],
): number {
  if (entries.length === 0) return 0;

  const { context } = output;
  const outlineRef = context.nextRef();
  const itemRefs = entries.map(() => context.nextRef());
  const usedTitles = new Map<string, number>();

  entries.forEach((entry, index) => {
    const seen = usedTitles.get(entry.title) ?? 0;
    usedTitles.set(entry.title, seen + 1);
    const title = seen === 0 ? entry.title : `${entry.title} (${seen + 1})`;

    const dict = context.obj({
      Title: PDFHexString.fromText(title),
      Parent: outlineRef,
      Dest: [entry.page.ref, PDFName.of("Fit")],
    });
    if (index > 0) dict.set(PDFName.of("Prev"), itemRefs[index - 1]);
    if (index < entries.length - 1) dict.set(PDFName.of("Next"), itemRefs[index + 1]);
    context.assign(itemRefs[index], dict);
  });

  const outline = context.obj({
    Type: "Outlines",
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: entries.length,
  });
  context.assign(outlineRef, outline);
  output.catalog.set(PDFName.of("Outlines"), outlineRef);

  return entries.length;
}

export async function mergePdfs(
  sources: MergeSource[],
  settings: MergeSettings,
  onProgress?: (value: number, label: string) => void,
  shouldCancel?: () => boolean,
): Promise<MergeOutcome> {
  if (sources.length === 0) {
    throw new MergeFileError("Add at least one PDF before merging.");
  }

  const report = (value: number, label: string) => {
    onProgress?.(Math.min(1, Math.max(0, value)), label);
  };
  const check = () => {
    if (shouldCancel?.()) throw new MergeCancelled();
  };

  report(0.02, "Preparing the document…");

  const output = await PDFDocument.create();
  output.setCreator("frebies");
  output.setProducer("frebies · pdf-lib");
  output.setCreationDate(new Date());
  output.setModificationDate(new Date());

  const first = sources[0]?.info;
  const fallbackTitle =
    settings.filename.replace(/\.pdf$/i, "").trim() || "Merged document";
  const title =
    settings.title.trim() ||
    (settings.keepMetadata ? first?.title : undefined) ||
    fallbackTitle;
  const author = settings.author.trim() || (settings.keepMetadata ? first?.author : undefined);
  const subject = settings.subject.trim() || (settings.keepMetadata ? first?.subject : undefined);

  output.setTitle(title);
  if (author) output.setAuthor(author);
  if (subject) output.setSubject(subject);

  const added: { page: PDFPage; rotation: number; sourceId: string; blank: boolean }[] = [];
  let blankPages = 0;

  for (let index = 0; index < sources.length; index += 1) {
    check();
    const source = sources[index];
    report(0.04 + (index / sources.length) * 0.42, `Reading ${source.name}`);

    if (index > 0 && settings.blankPages) {
      const last = added[added.length - 1];
      let size: [number, number] = [A4.width, A4.height];
      if (last) {
        const dims = last.page.getSize();
        const sideways = last.rotation === 90 || last.rotation === 270;
        size = sideways
          ? [dims.height, dims.width]
          : [dims.width, dims.height];
      }
      const blank = output.addPage(size);
      added.push({ page: blank, rotation: 0, sourceId: source.id, blank: true });
      blankPages += 1;
    }

    let input: PDFDocument;
    try {
      input = await PDFDocument.load(source.bytes, { updateMetadata: false });
    } catch {
      throw new MergeFileError(`“${source.name}” could not be opened. Try adding it again.`);
    }

    const indices = source.pages
      .filter((page) => page >= 1 && page <= input.getPageCount())
      .map((page) => page - 1);
    if (indices.length === 0) {
      throw new MergeFileError(`No pages are selected in “${source.name}”.`);
    }

    let copied: PDFPage[];
    try {
      copied = await output.copyPages(input, indices);
    } catch {
      throw new MergeFileError(
        `Pages from “${source.name}” could not be copied. The file may use unsupported compression.`,
      );
    }

    for (const page of copied) {
      const base = normalizeRotation(page.getRotation().angle);
      const final = normalizeRotation(base + source.rotation);
      if (final !== base) page.setRotation(degrees(final));
      output.addPage(page);
      added.push({ page, rotation: final, sourceId: source.id, blank: false });
    }

    await yieldToUi();
  }

  check();

  const bookmarks = settings.bookmarks
    ? sources
        .map((source) => {
          const firstPage = added.find((entry) => entry.sourceId === source.id && !entry.blank);
          if (!firstPage) return null;
          const title =
            (settings.keepMetadata ? source.info.title : undefined) || fileStem(source.name);
          return { title: title.trim() || fileStem(source.name), page: firstPage.page };
        })
        .filter((entry): entry is { title: string; page: PDFPage } => entry !== null)
    : [];

  let bookmarkCount = 0;
  if (bookmarks.length > 0) {
    check();
    report(0.62, settings.blankPages ? "Adding bookmarks…" : "Building the outline…");
    try {
      bookmarkCount = addOutline(output, bookmarks);
    } catch {
      bookmarkCount = 0;
    }
    await yieldToUi();
  }

  if (settings.pageNumbers) {
    check();
    report(0.76, "Numbering pages…");
    const font = await output.embedFont(StandardFonts.Helvetica);
    const total = added.length;
    const size = Math.min(18, Math.max(7, Math.round(settings.numberSize)));
    const start = Number.isFinite(settings.numberStart)
      ? Math.max(0, Math.round(settings.numberStart))
      : 1;

    added.forEach((entry, index) => {
      const label = formatPageNumber(settings.numberFormat, start + index, total);
      drawPageNumber(entry.page, entry.rotation, label, font, size, settings.numberPosition);
    });
    await yieldToUi();
  }

  check();
  report(0.88, settings.optimize ? "Optimizing and writing the PDF…" : "Writing the PDF…");

  const bytes = await output.save({
    useObjectStreams: settings.optimize,
    addDefaultPage: false,
  });

  report(1, "Done");
  return { bytes, pageCount: added.length, bookmarks: bookmarkCount, blankPages };
}
