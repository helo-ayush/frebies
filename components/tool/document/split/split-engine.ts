import { EncryptedPDFError, PDFDocument } from "pdf-lib";

export type SplitOutput = {
  name: string;
  bytes: Uint8Array;
  /** 1-based source pages, in output order. */
  pages: number[];
};

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function safe<T>(read: () => T | undefined): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Splits a PDF into one document per page group, entirely in the browser.
 * Pages are copied, not re-rendered, so text, links and image quality survive.
 */
export async function splitPdf(
  bytes: ArrayBuffer,
  groups: { name: string; pages: number[] }[],
  options: { keepMetadata: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<SplitOutput[]> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new SplitError("This PDF is password-protected. Remove the password, then try again.");
    }
    throw new SplitError("This file could not be read as a PDF. It may be damaged.");
  }

  const total = source.getPageCount();
  const outputs: SplitOutput[] = [];

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const indices = group.pages.filter((page) => page >= 1 && page <= total).map((page) => page - 1);
    if (indices.length === 0) continue;

    const target = await PDFDocument.create();
    const copied = await target.copyPages(source, indices);
    copied.forEach((page) => target.addPage(page));

    if (options.keepMetadata) {
      const title = safe(() => source.getTitle());
      const author = safe(() => source.getAuthor());
      const subject = safe(() => source.getSubject());
      const keywords = safe(() => source.getKeywords());
      const created = safe(() => source.getCreationDate());
      if (title) target.setTitle(title);
      if (author) target.setAuthor(author);
      if (subject) target.setSubject(subject);
      if (keywords) target.setKeywords([keywords]);
      if (created) target.setCreationDate(created);
    }
    target.setProducer("frebies");

    outputs.push({
      name: group.name,
      bytes: await target.save({ useObjectStreams: true }),
      pages: indices.map((value) => value + 1),
    });

    onProgress?.(index + 1, groups.length);
    await yieldToUi();
  }

  if (outputs.length === 0) throw new SplitError("Pick at least one page to split out.");
  return outputs;
}
