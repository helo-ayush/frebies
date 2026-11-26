import { sameMargin } from "./engine/margins";
import type { Box } from "./engine/matrix";
import { pageBox, shownSize, type Margin, type Page } from "./model";
import type { EditorStore } from "./store";

/** What is done to whole pages. */

/** Pages of the same file (or all the new ones) that are set up the same way. */
export function pagesLike(store: EditorStore, page: Page): string[] {
  return store.doc.pages
    .filter(
      (item) =>
        item.source === page.source &&
        sameMargin(item.margin, page.margin) &&
        Math.abs(item.w - page.w) < 1 &&
        Math.abs(item.h - page.h) < 1,
    )
    .map((item) => item.id);
}

export type Reach = "page" | "file" | "all";

/** The pages a setting goes to: this one (or the picked ones), those of its file, or every page. */
export function pagesFor(store: EditorStore, reach: Reach): string[] {
  const { marked } = store.view;
  const here = store.here;
  if (!here) return [];
  if (reach === "all") return store.doc.pages.map((page) => page.id);
  if (reach === "file") return store.doc.pages.filter((page) => page.source === here.source).map((page) => page.id);
  return marked.length > 1 ? [...marked] : [here.id];
}

/** Several files are open together: their pages may be set up differently. */
export function filesOpen(store: EditorStore): number {
  return new Set(store.doc.pages.map((page) => page.source)).size;
}

export function setMargin(store: EditorStore, margin: Margin | null, reach: Reach) {
  store.patchPages(pagesFor(store, reach), () => ({ margin: margin ? { ...margin } : null }));
}

/** Margins as every page's file came with them. */
export async function fileMargins(store: EditorStore, reach: Reach) {
  const ids = pagesFor(store, reach);
  const found = new Map<string, Margin | null>();
  for (const id of ids) {
    const page = store.page(id);
    if (page) found.set(id, await store.fileMargin(page));
  }
  store.patchPages(ids, (page) => ({ margin: found.get(page.id) ?? null }));
}

/** Keeps a part of the page. The same part of every page when asked. */
export function cropPages(store: EditorStore, box: Box, from: Page, reach: Reach) {
  const whole = pageBox(from);
  const part = {
    x: (box.x - whole.x) / whole.w,
    y: (box.y - whole.y) / whole.h,
    w: box.w / whole.w,
    h: box.h / whole.h,
  };
  store.patchPages(pagesFor(store, reach), (page) => {
    const own = pageBox(page);
    const next = { x: own.x + part.x * own.w, y: own.y + part.y * own.h, w: part.w * own.w, h: part.h * own.h };
    const all =
      Math.abs(next.x) < 0.5 &&
      Math.abs(next.y) < 0.5 &&
      Math.abs(next.w - page.w) < 0.5 &&
      Math.abs(next.h - page.h) < 0.5;
    return {
      box: all ? undefined : next,
      margin: page.margin ? shrunk(page.margin, next.x - own.x, next.y - own.y, own, next) : page.margin,
    };
  });
}

/** The words stay where they are, so the margin around them gets smaller. */
function shrunk(margin: Margin, dx: number, dy: number, own: Box, next: Box): Margin {
  const right = own.w - margin.right - dx;
  const bottom = own.h - margin.bottom - dy;
  return {
    left: Math.max(0, margin.left - dx),
    top: Math.max(0, margin.top - dy),
    right: Math.max(0, next.w - right),
    bottom: Math.max(0, next.h - bottom),
  };
}

export const uncropPages = (store: EditorStore, reach: Reach) =>
  store.patchPages(pagesFor(store, reach), () => ({ box: undefined }));

/** Another paper size. What is on the pages keeps its size and stays in the middle. */
export function resizePages(store: EditorStore, size: { w: number; h: number }, reach: Reach) {
  store.patchPages(pagesFor(store, reach), (page) => {
    const turned = page.rotate % 180 !== 0;
    const w = turned ? size.h : size.w;
    const h = turned ? size.w : size.h;
    if (page.source === null && !page.box) return { w, h, view: [1, 0, 0, -1, 0, h] as Page["view"] };
    const own = pageBox(page);
    const x = own.x + (own.w - w) / 2;
    const y = h >= own.h ? own.y + (own.h - h) / 2 : own.y;
    const all = Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(w - page.w) < 0.5 && Math.abs(h - page.h) < 0.5;
    return { box: all ? undefined : { x, y, w, h } };
  });
}

export const sizeLabel = (page: Page) => {
  const size = shownSize(page);
  return `${Math.round(size.w)} × ${Math.round(size.h)}`;
};
