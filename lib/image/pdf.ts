/**
 * A very small PDF writer that embeds one JPEG per page.
 *
 * Each page is a single DCTDecode image stretched to the page box, so the
 * caller controls layout (margins, fit, background, page numbers) by rendering
 * the page on a canvas before it is encoded.
 */

export type PdfImagePage = {
  /** Raw JPEG bytes for the page. */
  jpeg: Uint8Array;
  /** Intrinsic pixel size of the image, recorded in the PDF dictionary. */
  pixelWidth: number;
  pixelHeight: number;
  /** Page box in PostScript points (72 pt = 1 inch). */
  widthPt: number;
  heightPt: number;
};

const encoder = new TextEncoder();

function pdfString(value: string): string {
  return value.replace(/[\\()]/g, (match) => `\\${match}`);
}

export function formatPoints(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/**
 * Assemble a PDF 1.4 document. Pure: no DOM, no Blob, so it can be tested in
 * Node and reused outside the browser.
 */
export function buildPdfBytes(
  pages: PdfImagePage[],
  options: { title?: string; creator?: string } = {},
): Uint8Array {
  if (pages.length === 0) throw new Error("A PDF needs at least one page.");

  const chunks: Uint8Array[] = [];
  let length = 0;

  const push = (value: string) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };

  const offsets: number[] = [];

  const CATALOG = 1;
  const PAGES = 2;
  const INFO = 3;
  const firstPage = 4;

  const pageObjectId = (index: number) => firstPage + index * 3;
  const contentObjectId = (index: number) => pageObjectId(index) + 1;
  const imageObjectId = (index: number) => pageObjectId(index) + 2;
  const objectCount = 3 + pages.length * 3;

  const beginObject = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };
  const endObject = () => push("endobj\n");

  push("%PDF-1.4\n");
  push("%frebies image to PDF\n");

  beginObject(CATALOG);
  push(`<< /Type /Catalog /Pages ${PAGES} 0 R >>\n`);
  endObject();

  beginObject(PAGES);
  const kids = pages.map((_, index) => `${pageObjectId(index)} 0 R`).join(" ");
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\n`);
  endObject();

  beginObject(INFO);
  push(
    `<< /Producer (${pdfString(options.creator ?? "frebies")}) /Creator (${pdfString(
      options.creator ?? "frebies",
    )})`,
  );
  if (options.title) push(` /Title (${pdfString(options.title)})`);
  push(" >>\n");
  endObject();

  pages.forEach((page, index) => {
    const width = formatPoints(page.widthPt);
    const height = formatPoints(page.heightPt);
    const pageId = pageObjectId(index);
    const contentId = contentObjectId(index);
    const imageId = imageObjectId(index);

    beginObject(pageId);
    push(
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
        `/Contents ${contentId} 0 R >>\n`,
    );
    endObject();

    const stream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
    beginObject(contentId);
    push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\n`);
    endObject();

    beginObject(imageId);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${Math.max(
        1,
        Math.round(page.pixelWidth),
      )} /Height ${Math.max(1, Math.round(page.pixelHeight))} ` +
        "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode " +
        `/Length ${page.jpeg.length} >>\nstream\n`,
    );
    pushBytes(page.jpeg);
    push("\nendstream\n");
    endObject();
  });

  const xrefOffset = length;
  push(`xref\n0 ${objectCount + 1}\n`);
  push("0000000000 65535 f\r\n");
  for (let id = 1; id <= objectCount; id += 1) {
    const offset = offsets[id] ?? 0;
    push(`${offset.toString().padStart(10, "0")} 00000 n\r\n`);
  }
  push(
    `trailer\n<< /Size ${objectCount + 1} /Root ${CATALOG} 0 R /Info ${INFO} 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`,
  );

  const output = new Uint8Array(length);
  let cursor = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });
  return output;
}

export function buildPdf(
  pages: PdfImagePage[],
  options: { title?: string; creator?: string } = {},
): Blob {
  return new Blob([buildPdfBytes(pages, options)], { type: "application/pdf" });
}

/** Page boxes in points. */
export const PDF_PAGE_POINTS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  a5: { width: 419.53, height: 595.28 },
  legal: { width: 612, height: 1008 },
} as const;
