import {
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Bookmarks: the outline a viewer shows beside the pages. */

export type Bookmark = {
  title: string;
  /** Page from 0. */
  page: number;
  /** From the top of the page as shown, or null for the whole page. */
  y: number | null;
  level: number;
};

type Item = { title: string; dest: string | unknown[] | null; items: Item[] };
type PageRef = Parameters<PDFDocumentProxy["getPageIndex"]>[0];

const round = (value: number) => Math.round(value * 100) / 100;
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

async function placeOf(pdf: PDFDocumentProxy, dest: Item["dest"]): Promise<{ page: number; y: number | null } | null> {
  const found: unknown = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(found)) return null;
  const [target, kind, ...args] = found as [unknown, { name?: string } | undefined, ...unknown[]];
  const page =
    typeof target === "object" && target !== null ? await pdf.getPageIndex(target as PageRef) : number(target);
  if (page === null || !Number.isInteger(page) || page < 0 || page >= pdf.numPages) return null;

  // Where it points in the page's own space. Nulls mean "as it is".
  let left: number | null = null;
  let top: number | null = null;
  switch (kind?.name) {
    case "XYZ":
      left = number(args[0]);
      top = number(args[1]);
      break;
    case "FitH":
    case "FitBH":
      top = number(args[0]);
      break;
    case "FitV":
    case "FitBV":
      left = number(args[0]);
      break;
    case "FitR":
      left = number(args[0]);
      top = number(args[3]);
      break;
    default:
      break;
  }
  const viewport = (await pdf.getPage(page + 1)).getViewport({ scale: 1 });
  // On a page that lies on its side, what runs across the page is up and down for the reader.
  const decides = viewport.rotation % 180 === 0 ? top : left;
  if (decides === null) return { page, y: null };
  const [, y] = viewport.convertToViewportPoint(left ?? 0, top ?? 0) as [number, number];
  return { page, y: round(Math.max(0, Math.min(viewport.height, y))) };
}

export async function readBookmarks(pdf: PDFDocumentProxy): Promise<Bookmark[]> {
  const out: Bookmark[] = [];
  const walk = async (items: readonly Item[], level: number) => {
    for (const item of items) {
      let place: { page: number; y: number | null } | null = null;
      try {
        place = await placeOf(pdf, item.dest);
      } catch {
        // It leads nowhere.
      }
      const title = item.title.replace(/[\r\n\t\f\v\0]+/g, " ");
      if (place) out.push({ title, ...place, level });
      // What is under a bookmark that is skipped moves up into its place.
      await walk(item.items, place ? level + 1 : level);
    }
  };
  await walk(((await pdf.getOutline()) as Item[] | null) ?? [], 0);
  return out;
}

// ---------------------------------------------------------------- writing

const N = (name: string) => PDFName.of(name);

/** The part of the page a viewer shows, as pdf.js works it out. */
function viewBox(page: PDFPage): [number, number, number, number] {
  const edges = (box: { x: number; y: number; width: number; height: number }): [number, number, number, number] => [
    Math.min(box.x, box.x + box.width),
    Math.min(box.y, box.y + box.height),
    Math.max(box.x, box.x + box.width),
    Math.max(box.y, box.y + box.height),
  ];
  const media = edges(page.getMediaBox());
  const crop = edges(page.getCropBox());
  const x0 = Math.max(media[0], crop[0]);
  const y0 = Math.max(media[1], crop[1]);
  const x1 = Math.min(media[2], crop[2]);
  const y1 = Math.min(media[3], crop[3]);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : media;
}

function destination(page: PDFPage, y: number | null): PDFObject {
  const { context } = page.doc;
  const whole = context.obj([page.ref, "Fit"]);
  if (y === null || !Number.isFinite(y)) return whole;
  const unit = page.node.lookup(N("UserUnit"));
  const down = y / (unit instanceof PDFNumber && unit.asNumber() > 0 ? unit.asNumber() : 1);
  let box: [number, number, number, number];
  try {
    box = viewBox(page);
  } catch {
    // A box that is none.
    return whole;
  }
  const [x0, y0, x1, y1] = box;
  const turn = ((page.getRotation().angle % 360) + 360) % 360;
  let spot: [number | null, number] = [null, y1 - down];
  if (turn === 90) spot = [x0 + down, y0];
  else if (turn === 180) spot = [x1, y0 + down];
  else if (turn === 270) spot = [x1 - down, y1];
  return context.obj([page.ref, "XYZ", spot[0] === null ? null : round(spot[0]), round(spot[1]), null]);
}

/** Takes the old bookmarks out of the file, so their titles are not left behind in it. */
function forget(context: PDFContext, outlines: PDFObject | undefined) {
  const stack = [outlines];
  const seen = new Set<PDFObject>();
  while (stack.length > 0) {
    const object = stack.pop();
    const dict = object instanceof PDFRef ? context.lookup(object) : object;
    if (!object || !(dict instanceof PDFDict) || seen.has(dict)) continue;
    seen.add(dict);
    stack.push(dict.get(N("First")), dict.get(N("Next")));
    if (object instanceof PDFRef) context.delete(object);
  }
}

type Node = { ref: PDFRef; dict: PDFDict; level: number; children: Node[] };

/** With more than this they start closed: only the top level shows. */
const OPEN = 40;

/** Replaces the bookmarks of the document. */
export function writeBookmarks(
  doc: PDFDocument,
  list: readonly { title: string; page: PDFPage; y: number | null; level: number }[],
): void {
  const { context, catalog } = doc;
  forget(context, catalog.get(N("Outlines")));
  catalog.delete(N("Outlines"));
  if (list.length === 0) {
    if (catalog.lookup(N("PageMode")) === N("UseOutlines")) catalog.delete(N("PageMode"));
    return;
  }

  const make = (dict: PDFDict, level: number): Node => ({ ref: context.register(dict), dict, level, children: [] });
  const root = make(context.obj({ Type: "Outlines" }), -1);
  const path = [root];
  for (const { title, page, y, level } of list) {
    // The last one above it that is less deep. Levels may be left out.
    while (path.length > 1 && path[path.length - 1].level >= level) path.pop();
    const dict = context.obj({ Title: PDFHexString.fromText(title), Dest: destination(page, y) });
    const node = make(dict, level);
    path[path.length - 1].children.push(node);
    path.push(node);
  }

  const closed = list.length > OPEN;
  /** How many show below it once it is opened. */
  const link = (parent: Node): number => {
    const { children } = parent;
    let shown = 0;
    children.forEach((child, i) => {
      child.dict.set(N("Parent"), parent.ref);
      if (i > 0) child.dict.set(N("Prev"), children[i - 1].ref);
      if (i < children.length - 1) child.dict.set(N("Next"), children[i + 1].ref);
      const below = link(child);
      // Less than nothing says that it is closed.
      if (below > 0) child.dict.set(N("Count"), PDFNumber.of(closed ? -below : below));
      shown += closed ? 1 : 1 + below;
    });
    if (children.length > 0) {
      parent.dict.set(N("First"), children[0].ref);
      parent.dict.set(N("Last"), children[children.length - 1].ref);
    }
    return shown;
  };
  root.dict.set(N("Count"), PDFNumber.of(link(root)));
  catalog.set(N("Outlines"), root.ref);
  catalog.set(N("PageMode"), N("UseOutlines"));
}
