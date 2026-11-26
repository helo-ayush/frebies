import { pdfFont } from "./engine/fonts";
import { plainText, uid, type Mark } from "./model";
import type { EditorStore } from "./store";

/** Bookmarks: those the files came with, and those made from headings. */

/** Places of the files' own bookmarks, as places among the pages that are here now. */
export async function readMarks(store: EditorStore): Promise<Mark[]> {
  const { readBookmarks } = await import("./engine/outline");
  const out: { order: number; mark: Mark }[] = [];
  for (const source of store.sources.values()) {
    const list = await readBookmarks(source.pdf).catch(() => []);
    for (const item of list) {
      const order = store.doc.pages.findIndex((page) => page.source === source.id && page.index === item.page);
      if (order < 0) continue;
      out.push({
        order,
        mark: { id: uid("m"), title: item.title, page: store.doc.pages[order].id, y: item.y, level: item.level },
      });
    }
  }
  // Files keep their own order; they come in the order their first page has.
  return out.map((item) => item.mark);
}

/** Lines in larger or bolder letters than the rest, as bookmarks. */
export async function makeMarks(store: EditorStore): Promise<Mark[]> {
  type Line = { page: string; y: number; size: number; bold: boolean; text: string };
  const lines: Line[] = [];
  const weight = new Map<number, number>();
  const round = (size: number) => Math.round(size * 2) / 2;
  for (const page of store.doc.pages) {
    if (page.source !== null) {
      const text = await store.textOf(page.source, page.index).catch(() => null);
      for (const block of text?.blocks ?? []) {
        if (page.cuts[block.key] || block.angle !== 0) continue;
        const size = round(block.size);
        weight.set(size, (weight.get(size) ?? 0) + block.text.length);
        const bold = block.lines.every((line) =>
          line.runs.every((run) => run.style.bold || /bold|black|heavy/i.test(pdfFont(run.style.font)?.name ?? "")),
        );
        if (block.lines.length <= 2) lines.push({ page: page.id, y: block.y, size, bold, text: block.text });
      }
    }
    for (const id of page.objects) {
      const object = store.doc.objects[id];
      if (object?.type !== "text" || object.angle !== 0) continue;
      const text = plainText(object.runs);
      const first = object.runs[0].style;
      const size = round(first.size);
      weight.set(size, (weight.get(size) ?? 0) + text.length);
      // The first line of a text may be its heading.
      const [head] = text.split("\n");
      const whole = text.indexOf("\n") < 0;
      if (whole || object.runs[0].text.startsWith(head))
        lines.push({ page: page.id, y: object.y, size, bold: first.bold, text: head });
    }
  }
  if (weight.size === 0) return [];
  const body = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const heads = lines.filter(({ text, size, bold }) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 2 || clean.length > 110 || !/\p{L}/u.test(clean)) return false;
    if (/[.;,]$/.test(clean) && size <= body * 1.15) return false;
    return size >= body * 1.13 || (bold && size >= body * 0.98 && clean.length < 70 && !clean.endsWith(":"));
  });
  // The same words on many pages are a running head.
  const seen = new Map<string, number>();
  for (const line of heads) seen.set(line.text, (seen.get(line.text) ?? 0) + 1);
  const kept = heads.filter((line) => (seen.get(line.text) ?? 0) < 3);
  const sizes = [...new Set(kept.map((line) => line.size))].sort((a, b) => b - a).slice(0, 4);
  return kept.slice(0, 400).map((line) => ({
    id: uid("m"),
    title: line.text.replace(/\s+/g, " ").trim().slice(0, 120),
    page: line.page,
    y: line.y,
    level: Math.min(3, Math.max(0, sizes.indexOf(line.size) < 0 ? sizes.length : sizes.indexOf(line.size))),
  }));
}
