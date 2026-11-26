import type { Page } from "../model";
import type { EditorStore, Format, SaveOptions } from "../store";
import { messageOf } from "../store";

/** The edited document as any kind of file. */

export type Saved = { blob: Blob; name: string };

const TYPES: Record<Format, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  html: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  txt: "text/plain;charset=utf-8",
};

export async function saveAs(
  store: EditorStore,
  choice: { format: Format; pages: number[] | null; dpi?: number; options?: SaveOptions },
): Promise<Saved> {
  const { format } = choice;
  const pages = choice.pages
    ? choice.pages.map((i) => store.doc.pages[i]).filter((page): page is Page => Boolean(page))
    : store.doc.pages;
  const name = store.name.trim() || "document";
  const some = choice.pages !== null && pages.length < store.doc.pages.length;
  const base = some ? `${name}-pages` : name;

  if (format === "pdf") {
    const bytes = await store.save({
      ...choice.options,
      pages: choice.pages ? pages.map((page) => page.id) : undefined,
    });
    return {
      blob: new Blob([bytes as BlobPart], { type: TYPES.pdf }),
      name: some ? `${base}.pdf` : `${name}-edited.pdf`,
    };
  }

  store.select([]);
  const label = "Saving your file";
  const progress = (done: number, total: number) =>
    store.setView({ busy: { label, progress: done / Math.max(1, total) } });
  store.setView({ busy: { label, progress: 0 }, error: null });
  try {
    const made = await other();
    store.setView({ busy: null, dirty: some ? store.view.dirty : false, saved: store.view.saved + 1 });
    return made;
  } catch (error) {
    store.setView({ busy: null, error: messageOf(error, "That file could not be made.") });
    throw error;
  }

  async function other(): Promise<Saved> {
    if (format === "png" || format === "jpg" || format === "webp") return pictures();
    if (format === "pptx") {
      const [{ gatherFixed }, { writePptx }] = await Promise.all([import("./gather"), import("./pptx-out")]);
      const bytes = await writePptx(await gatherFixed(store, pages, progress));
      return { blob: new Blob([bytes as BlobPart], { type: TYPES.pptx }), name: `${base}.pptx` };
    }
    if (format === "xlsx") {
      const [{ gatherSheets }, { writeXlsx }] = await Promise.all([import("./gather"), import("./xlsx-out")]);
      const bytes = await writeXlsx(await gatherSheets(store, pages, progress));
      return { blob: new Blob([bytes as BlobPart], { type: TYPES.xlsx }), name: `${base}.xlsx` };
    }
    const { gatherFlow } = await import("./gather");
    const doc = await gatherFlow(store, pages, progress);
    switch (format) {
      case "docx": {
        const { writeDocx } = await import("./docx-out");
        return { blob: new Blob([(await writeDocx(doc)) as BlobPart], { type: TYPES.docx }), name: `${base}.docx` };
      }
      case "odt": {
        const { writeOdt } = await import("./odt-out");
        return { blob: new Blob([(await writeOdt(doc)) as BlobPart], { type: TYPES.odt }), name: `${base}.odt` };
      }
      case "rtf": {
        const { writeRtf } = await import("./rtf-out");
        return { blob: new Blob([(await writeRtf(doc)) as BlobPart], { type: TYPES.rtf }), name: `${base}.rtf` };
      }
      case "html": {
        const { writeHtml } = await import("./text-out");
        return { blob: new Blob([await writeHtml(doc)], { type: TYPES.html }), name: `${base}.html` };
      }
      case "md": {
        const { writeMarkdown } = await import("./text-out");
        return { blob: new Blob([await writeMarkdown(doc)], { type: TYPES.md }), name: `${base}.md` };
      }
      default: {
        const { writeText } = await import("./text-out");
        return { blob: new Blob([await writeText(doc)], { type: TYPES.txt }), name: `${base}.txt` };
      }
    }
  }

  /** Every page as a picture; several of them in a zip. */
  async function pictures(): Promise<Saved> {
    const bytes = await store.save({ pages: pages.map((page) => page.id), quiet: true });
    store.setView({ busy: { label, progress: 0.1 } });
    const pdf = await store.openPdf(bytes);
    const files: { name: string; blob: Blob }[] = [];
    const type = TYPES[format];
    const scale = (choice.dpi ?? 150) / 72;
    const digits = String(pdf.numPages).length;
    try {
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const proxy = await pdf.getPage(i);
        const size = proxy.getViewport({ scale: 1 });
        // Browsers stop at some point: huge pages get as sharp as they can.
        const fit = Math.min(
          scale,
          8000 / Math.max(size.width, size.height),
          Math.sqrt(60e6 / (size.width * size.height)),
        );
        const viewport = proxy.getViewport({ scale: fit });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        await proxy.render({ canvas, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
        canvas.width = 0;
        if (!blob) throw new Error("A page could not be turned into a picture.");
        files.push({ name: `${base}-${String(i).padStart(digits, "0")}.${format}`, blob });
        progress(0.1 * pdf.numPages + i * 0.9, pdf.numPages);
      }
    } finally {
      void pdf.destroy();
    }
    if (files.length === 1) return { blob: files[0].blob, name: `${base}.${format}` };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const file of files) zip.file(file.name, file.blob);
    return { blob: await zip.generateAsync({ type: "blob" }), name: `${base}-${format}.zip` };
  }
}

/** Opens the print window of the browser with the finished file. */
export async function printDocument(store: EditorStore) {
  const bytes = await store.save({ quiet: true });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
  });
  document.querySelectorAll("iframe[data-print]").forEach((old) => old.remove());
  frame.dataset.print = "";
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        // Some browsers show PDFs outside the page: there it can be printed.
        window.open(url, "_blank", "noopener");
      }
    }, 300);
  };
  frame.src = url;
  document.body.append(frame);
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}
