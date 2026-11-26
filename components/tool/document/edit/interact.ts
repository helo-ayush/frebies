import type { EditObject, ImageObject, Page, Para, ShapeObject, TableObject, TextObject } from "./model";
import { isLine, marginBox, pageBox, shownMatrix, shownSize, tidyParas } from "./model";
import { apply, bounds, invert, objectBounds, objectCorners, placement, type Box, type Point } from "./engine/matrix";
import { adjOf, shapeDef } from "./engine/shape-kinds";
import { endsOf } from "./engine/shapes";
import { dragCol, dragRow, layTable, ownerOf, scaleTable, wholeArea } from "./engine/table";
import type { EditorStore, Grid } from "./store";

/** Pointer work shared by the page, the objects on it and their handles. */

type Press = { clientX: number; clientY: number; pointerId: number };

let dragCount = 0;
export const dragKey = () => `drag:${(dragCount += 1)}`;

/** From the page as it is stored to the page as it is shown, for CSS. */
export const shownCss = (page: Page, zoom: number) =>
  `matrix(${shownMatrix(page)
    .map((value) => value * zoom)
    .join(",")})`;

/** A point of the window, on the page as it is stored. */
export function toPage(store: EditorStore, page: Page, clientX: number, clientY: number): Point {
  const sheet = store.sheets.get(page.id);
  if (!sheet) return { x: 0, y: 0 };
  const rect = sheet.getBoundingClientRect();
  const z = rect.width / shownSize(page).w || 1;
  return apply(invert(shownMatrix(page)), (clientX - rect.left) / z, (clientY - rect.top) / z);
}

/** Follows the pointer until it is let go. */
export function track(
  event: { pointerId: number },
  move: (event: PointerEvent) => void,
  up: (event: PointerEvent, cancelled: boolean) => void,
) {
  const id = event.pointerId;
  const onMove = (next: PointerEvent) => {
    if (next.pointerId === id) move(next);
  };
  const stop = (next: PointerEvent, cancelled: boolean) => {
    if (next.pointerId !== id) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    up(next, cancelled);
  };
  const onUp = (next: PointerEvent) => stop(next, false);
  const onCancel = (next: PointerEvent) => stop(next, true);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

/** Two presses at the same place, close together. Works for a finger as well as a mouse. */
export function doublePress(
  last: { time: number; x: number; y: number } | null,
  event: { clientX: number; clientY: number; pointerType: string },
) {
  if (!last || performance.now() - last.time > 420) return false;
  return Math.hypot(event.clientX - last.x, event.clientY - last.y) < (event.pointerType === "touch" ? 26 : 6);
}

function pageUnder(store: EditorStore, x: number, y: number): Page | null {
  for (const page of store.doc.pages) {
    const rect = store.sheets.get(page.id)?.getBoundingClientRect();
    if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return page;
  }
  return null;
}

/** Points between two lines of the grid. */
export const GRID = 14.173;

/** Lines up with the page, its margins and its neighbours. */
function snap(store: EditorStore, page: Page, ids: ReadonlySet<string>, box: Box, reach: number) {
  const { prefs } = store.view;
  if (prefs.grid) {
    const at = (value: number) => Math.round(value / GRID) * GRID;
    return { dx: at(box.x) - box.x, dy: at(box.y) - box.y, x: null, y: null };
  }
  const whole = pageBox(page);
  const xs = [whole.x, whole.x + whole.w / 2, whole.x + whole.w];
  const ys = [whole.y, whole.y + whole.h / 2, whole.y + whole.h];
  if (page.margin) {
    const inner = marginBox(page);
    xs.push(inner.x, inner.x + inner.w);
    ys.push(inner.y, inner.y + inner.h);
  }
  for (const id of page.objects) {
    if (ids.has(id)) continue;
    const object = store.doc.objects[id];
    if (!object) continue;
    const other = objectBounds(object);
    xs.push(other.x, other.x + other.w / 2, other.x + other.w);
    ys.push(other.y, other.y + other.h / 2, other.y + other.h);
  }
  // Where the page's own paragraphs begin.
  const blocks = store.readyText(page)?.blocks ?? [];
  if (blocks.length < 160) for (const block of blocks) if (block.angle === 0 && !page.cuts[block.key]) xs.push(block.x);
  const best = (lines: number[], edges: number[]) => {
    let shift = 0;
    let line: number | null = null;
    let close = reach;
    for (const target of lines) {
      for (const edge of edges) {
        const gap = Math.abs(target - edge);
        if (gap < close) {
          close = gap;
          shift = target - edge;
          line = target;
        }
      }
    }
    return { shift, line };
  };
  const x = best(xs, [box.x, box.x + box.w / 2, box.x + box.w]);
  const y = best(ys, [box.y, box.y + box.h / 2, box.y + box.h]);
  return { dx: x.shift, dy: y.shift, x: x.line, y: y.line };
}

export function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  };
}

/** Drags objects, on to another page if they are let go there. With Alt, a copy of them. */
export function startMove(
  store: EditorStore,
  page: Page,
  picked: readonly string[],
  start: Press & { altKey?: boolean },
  done?: (moved: boolean) => void,
  key = dragKey(),
) {
  let ids = picked.filter((id) => store.doc.objects[id] && !store.doc.objects[id].lock);
  if (ids.length === 0) {
    track(
      start,
      () => undefined,
      () => done?.(false),
    );
    return;
  }
  const origin = toPage(store, page, start.clientX, start.clientY);
  let before = new Map(ids.map((id) => [id, store.doc.objects[id]]));
  let set = new Set(ids);
  const group = unionOf([...before.values()].map((object) => objectBounds(object)));
  let moved = false;
  track(
    start,
    (event) => {
      if (!moved && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < 3) return;
      if (!moved && event.altKey) {
        // A copy is dragged away; the original stays.
        store.paste(
          page.id,
          ids.map((id) => store.doc.objects[id]),
          0,
        );
        ids = [...store.view.selection];
        before = new Map(ids.map((id) => [id, store.doc.objects[id]]));
        set = new Set(ids);
      }
      moved = true;
      const now = toPage(store, page, event.clientX, event.clientY);
      let dx = now.x - origin.x;
      let dy = now.y - origin.y;
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (group && !event.ctrlKey && !event.metaKey) {
        const lined = snap(store, page, set, { ...group, x: group.x + dx, y: group.y + dy }, 4 / store.view.zoom);
        dx += lined.dx;
        dy += lined.dy;
        store.setView({
          guides: lined.x !== null || lined.y !== null ? { page: page.id, x: lined.x, y: lined.y } : null,
        });
      }
      store.patchMany(
        ids,
        (object) => ({ x: (before.get(object.id)?.x ?? 0) + dx, y: (before.get(object.id)?.y ?? 0) + dy }),
        key,
      );
    },
    (event) => {
      store.setView({ guides: null });
      if (moved) {
        const target = pageUnder(store, event.clientX, event.clientY);
        if (target && target.id !== page.id) {
          const here = toPage(store, page, event.clientX, event.clientY);
          const there = toPage(store, target, event.clientX, event.clientY);
          store.moveToPage(ids, target.id, { x: there.x - here.x, y: there.y - here.y }, key);
        }
      }
      done?.(moved);
    },
  );
}

export type Handle = { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };

/** Text `k` times as large, everything about it. */
export function scaledText(object: TextObject, k: number): Partial<TextObject> {
  const by = (value: number | undefined) => (value === undefined ? undefined : value * k);
  return {
    leading: object.leading * k,
    max: by(object.max),
    paras: object.paras
      ? tidyParas(
          object.paras.map((para): Para => ({
            ...para,
            left: by(para.left),
            right: by(para.right),
            first: by(para.first),
            before: by(para.before),
            after: by(para.after),
            leading: by(para.leading),
            list: para.list ? { ...para.list, gap: para.list.gap * k } : undefined,
          })),
        )
      : undefined,
    runs: object.runs.map((run) => ({
      ...run,
      style: {
        ...run.style,
        size: Math.round(run.style.size * k * 100) / 100,
        tracking: run.style.tracking * k,
        rise: run.style.rise * k,
      },
    })),
  };
}

const whileDragging = (
  store: EditorStore,
  start: Press,
  move: (event: PointerEvent) => void,
  up?: (event: PointerEvent) => void,
) => {
  store.dragging = true;
  track(start, move, (event) => {
    up?.(event);
    // The size the words take follows in the next frame.
    requestAnimationFrame(() => {
      store.dragging = false;
    });
  });
};

export function startResize(store: EditorStore, page: Page, id: string, handle: Handle, start: Press) {
  const before = store.doc.objects[id];
  if (!before || before.lock) return;
  const key = dragKey();
  const place = placement(before.x, before.y, before.angle);
  const back = invert(place);
  const grip = toPage(store, page, start.clientX, start.clientY);
  const local0 = apply(back, grip.x, grip.y);
  const slip = { x: local0.x - handle.x * before.w, y: local0.y - handle.y * before.h };
  const corner = handle.x !== 0.5 && handle.y !== 0.5;

  whileDragging(store, start, (event) => {
    const p = toPage(store, page, event.clientX, event.clientY);
    const raw = apply(back, p.x, p.y);
    const local = { x: raw.x - slip.x, y: raw.y - slip.y };
    const min = before.type === "text" ? 8 : before.type === "table" ? 30 : 2;
    let left = 0;
    let top = 0;
    let right = before.w;
    let bottom = before.h;
    if (handle.x === 0) left = Math.min(local.x, right - min);
    if (handle.x === 1) right = Math.max(local.x, min);
    if (handle.y === 0) top = Math.min(local.y, bottom - min);
    if (handle.y === 1) bottom = Math.max(local.y, min);

    const free =
      before.type === "shape" ||
      before.type === "link" ||
      before.type === "field" ||
      before.type === "path" ||
      before.type === "table";
    if (corner && before.w > 0 && before.h > 0 && (free ? event.shiftKey : !event.shiftKey)) {
      const scale = Math.max(0.02, Math.max((right - left) / before.w, (bottom - top) / before.h));
      if (handle.x === 0) left = before.w - before.w * scale;
      else right = before.w * scale;
      if (handle.y === 0) top = before.h - before.h * scale;
      else bottom = before.h * scale;
    }
    if (event.altKey && free) {
      // About the middle.
      if (handle.x === 0) right = before.w - left;
      else if (handle.x === 1) left = before.w - right;
      if (handle.y === 0) bottom = before.h - top;
      else if (handle.y === 1) top = before.h - bottom;
    }
    const at = apply(place, left, top);
    const w = right - left;
    const h = bottom - top;
    if (before.type === "text") {
      if (!corner) {
        store.patch<TextObject>(id, { x: at.x, y: at.y, w, wrap: true, max: undefined }, key);
        return;
      }
      const k = w / Math.max(1, before.w);
      store.patch<TextObject>(
        id,
        { x: at.x, y: at.y, w: before.wrap ? w : before.w, h, ...scaledText(before, k) },
        key,
      );
      return;
    }
    if (before.type === "table") {
      store.patch<TableObject>(id, { x: at.x, y: at.y, ...scaleTable(before, w / before.w, h / before.h) }, key);
      return;
    }
    store.patch<EditObject>(id, { x: at.x, y: at.y, w, h } as Partial<EditObject>, key);
  });
}

/** Several things larger or smaller together. */
export function startResizeMany(store: EditorStore, page: Page, ids: readonly string[], handle: Handle, start: Press) {
  const before = ids
    .map((id) => store.doc.objects[id])
    .filter((object): object is EditObject => Boolean(object && !object.lock));
  const box = unionOf(before.map((object) => objectBounds(object)));
  if (!box || before.length === 0 || box.w < 0.5 || box.h < 0.5) return;
  const key = dragKey();
  const corner = handle.x !== 0.5 && handle.y !== 0.5;
  const turned = before.some((object) => object.angle % 90 !== 0 || object.type === "text" || object.type === "image");
  whileDragging(store, start, (event) => {
    const p = toPage(store, page, event.clientX, event.clientY);
    let x0 = box.x;
    let y0 = box.y;
    let x1 = box.x + box.w;
    let y1 = box.y + box.h;
    if (handle.x === 0) x0 = Math.min(p.x, x1 - 4);
    if (handle.x === 1) x1 = Math.max(p.x, x0 + 4);
    if (handle.y === 0) y0 = Math.min(p.y, y1 - 4);
    if (handle.y === 1) y1 = Math.max(p.y, y0 + 4);
    let kx = (x1 - x0) / box.w;
    let ky = (y1 - y0) / box.h;
    if (corner && (turned || !event.shiftKey)) {
      const k = Math.max(kx, ky);
      kx = k;
      ky = k;
      if (handle.x === 0) x0 = x1 - box.w * k;
      if (handle.y === 0) y0 = y1 - box.h * k;
    }
    const to = (px: number, py: number) => ({ x: x0 + (px - box.x) * kx, y: y0 + (py - box.y) * ky });
    store.commit(
      (doc) =>
        before.reduce((next, object) => {
          const at = to(object.x, object.y);
          const sideways = Math.abs(Math.round(object.angle / 90)) % 2 === 1;
          const own = { w: object.w * (sideways ? ky : kx), h: object.h * (sideways ? kx : ky) };
          if (object.type === "text") {
            const k = corner ? kx : 1;
            return store.patched<TextObject>(next, object.id, {
              ...scaledText(object, k),
              x: at.x,
              y: at.y,
              w: object.w * (corner ? k : kx),
              wrap: object.wrap || !corner,
            });
          }
          if (object.type === "table")
            return store.patched<TableObject>(next, object.id, { x: at.x, y: at.y, ...scaleTable(object, kx, ky) });
          if (object.type === "mark")
            return store.patched<EditObject>(next, object.id, {
              ...at,
              ...own,
              rects: object.rects.map(([x, y, w, h]) => [x * kx, y * ky, w * kx, h * ky]),
            } as Partial<EditObject>);
          if (object.type === "note") return store.patched<EditObject>(next, object.id, at);
          return store.patched<EditObject>(next, object.id, { ...at, ...own } as Partial<EditObject>);
        }, doc),
      key,
    );
  });
}

/** Where the whole picture lies, measured from the corner of the part that shows. */
export function wholePicture(object: ImageObject): Box {
  const crop = object.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const w = object.w / crop.w;
  const h = object.h / crop.h;
  const x = object.flipX ? 1 - crop.x - crop.w : crop.x;
  const y = object.flipY ? 1 - crop.y - crop.h : crop.y;
  return { x: -x * w, y: -y * h, w, h };
}

export function startCrop(store: EditorStore, page: Page, id: string, handle: Handle, start: Press) {
  const before = store.doc.objects[id];
  if (before?.type !== "image") return;
  const key = dragKey();
  const place = placement(before.x, before.y, before.angle);
  const back = invert(place);
  const whole = wholePicture(before);
  const grip = toPage(store, page, start.clientX, start.clientY);
  const first = apply(back, grip.x, grip.y);
  track(
    start,
    (event) => {
      const p = toPage(store, page, event.clientX, event.clientY);
      const now = apply(back, p.x, p.y);
      const dx = now.x - first.x;
      const dy = now.y - first.y;
      let left = 0;
      let top = 0;
      let right = before.w;
      let bottom = before.h;
      const min = Math.min(8, before.w, before.h);
      if (handle.x === 0) left = Math.max(whole.x, Math.min(dx, right - min));
      if (handle.x === 1) right = Math.min(whole.x + whole.w, Math.max(before.w + dx, min));
      if (handle.y === 0) top = Math.max(whole.y, Math.min(dy, bottom - min));
      if (handle.y === 1) bottom = Math.min(whole.y + whole.h, Math.max(before.h + dy, min));
      const at = apply(place, left, top);
      const cw = (right - left) / whole.w;
      const ch = (bottom - top) / whole.h;
      const cx = (left - whole.x) / whole.w;
      const cy = (top - whole.y) / whole.h;
      const full = cw > 0.999 && ch > 0.999;
      store.patch<ImageObject>(
        id,
        {
          x: at.x,
          y: at.y,
          w: right - left,
          h: bottom - top,
          crop: full
            ? undefined
            : { x: before.flipX ? 1 - cx - cw : cx, y: before.flipY ? 1 - cy - ch : cy, w: cw, h: ch },
        },
        key,
      );
    },
    () => undefined,
  );
}

export function startTurn(store: EditorStore, page: Page, id: string, start: Press) {
  const before = store.doc.objects[id];
  if (!before || before.lock) return;
  const key = dragKey();
  const middle = apply(placement(before.x, before.y, before.angle), before.w / 2, before.h / 2);
  const from = toPage(store, page, start.clientX, start.clientY);
  const first = Math.atan2(from.y - middle.y, from.x - middle.x);
  track(
    start,
    (event) => {
      const p = toPage(store, page, event.clientX, event.clientY);
      let angle = before.angle + ((Math.atan2(p.y - middle.y, p.x - middle.x) - first) * 180) / Math.PI;
      angle = ((((angle + 180) % 360) + 360) % 360) - 180;
      const step = event.shiftKey ? 15 : 90;
      const near = Math.round(angle / step) * step;
      if (event.shiftKey || Math.abs(angle - near) < 3) angle = near;
      store.rotateObject(id, Math.round(angle * 10) / 10, key);
    },
    () => undefined,
  );
}

/** The two ends of a line, start first, on the page. */
export function lineEnds(shape: ShapeObject): [Point, Point] {
  const place = placement(shape.x, shape.y, shape.angle);
  const [a, b] = endsOf(shape);
  return [apply(place, a.x, a.y), apply(place, b.x, b.y)];
}

export function lineBox(a: Point, b: Point): Pick<ShapeObject, "x" | "y" | "w" | "h" | "flip" | "back"> {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    flip: (b.x - a.x) * (b.y - a.y) < 0,
    back: b.x < a.x || (b.x === a.x && b.y < a.y),
  };
}

/** Straight up, across or diagonal while Shift is held. */
export function straighten(a: Point, b: Point): Point {
  const angle = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + Math.cos(angle) * length, y: a.y + Math.sin(angle) * length };
}

export function startEnd(store: EditorStore, page: Page, id: string, which: 0 | 1, start: Press) {
  const before = store.doc.objects[id];
  if (!isLine(before) || before.lock) return;
  const key = dragKey();
  const ends = lineEnds(before);
  const other = ends[1 - which];
  track(
    start,
    (event) => {
      let p = toPage(store, page, event.clientX, event.clientY);
      if (event.shiftKey) p = straighten(other, p);
      else if (!event.ctrlKey && !event.metaKey) {
        // Nearly level or upright is meant to be.
        const reach = 4 / store.view.zoom;
        if (Math.abs(p.y - other.y) < reach) p = { x: p.x, y: other.y };
        else if (Math.abs(p.x - other.x) < reach) p = { x: other.x, y: p.y };
      }
      const next: [Point, Point] = which === 0 ? [p, ends[1]] : [ends[0], p];
      store.patch<ShapeObject>(id, { ...lineBox(next[0], next[1]), angle: 0 }, key);
    },
    () => undefined,
  );
}

/** Handles that sit in the same place are dragged together: a bubble's tail has one for across and one for down. */
export function adjustPoints(shape: ShapeObject): { at: Point; which: number[] }[] {
  const def = shapeDef(shape.kind);
  if (!def) return [];
  const adj = adjOf(def, shape.adj);
  const out: { at: Point; which: number[] }[] = [];
  def.adjust.forEach((item, i) => {
    const p = item.handle(Math.max(0.01, shape.w), Math.max(0.01, shape.h), adj);
    const at = { x: shape.flipX ? shape.w - p.x : p.x, y: shape.flipY ? shape.h - p.y : p.y };
    const same = out.find((other) => Math.hypot(other.at.x - at.x, other.at.y - at.y) < 0.01);
    if (same) same.which.push(i);
    else out.push({ at, which: [i] });
  });
  return out;
}

export function startAdjust(store: EditorStore, page: Page, id: string, which: readonly number[], start: Press) {
  const before = store.doc.objects[id];
  if (before?.type !== "shape" || before.lock) return;
  const def = shapeDef(before.kind);
  if (!def) return;
  const key = dragKey();
  const back = invert(placement(before.x, before.y, before.angle));
  track(
    start,
    (event) => {
      const now = store.doc.objects[id];
      if (now?.type !== "shape") return;
      const p = toPage(store, page, event.clientX, event.clientY);
      const raw = apply(back, p.x, p.y);
      const at = { x: before.flipX ? before.w - raw.x : raw.x, y: before.flipY ? before.h - raw.y : raw.y };
      const adj = [...adjOf(def, now.adj)];
      for (const i of which) {
        const item = def.adjust[i];
        adj[i] = Math.min(
          item.max,
          Math.max(item.min, item.drag(Math.max(0.01, before.w), Math.max(0.01, before.h), adj, at)),
        );
      }
      store.patch<ShapeObject>(id, { adj }, key);
    },
    () => undefined,
  );
}

// ---------------------------------------------------------------- tables

/** Drags the line right of a column. With Shift, the columns after it keep their width. */
export function startCol(store: EditorStore, page: Page, id: string, col: number, start: Press) {
  const before = store.doc.objects[id];
  if (before?.type !== "table" || before.lock) return;
  const key = dragKey();
  const back = invert(placement(before.x, before.y, before.angle));
  const grip = toPage(store, page, start.clientX, start.clientY);
  const from = apply(back, grip.x, grip.y).x;
  whileDragging(store, start, (event) => {
    const p = toPage(store, page, event.clientX, event.clientY);
    store.patch<TableObject>(id, dragCol(before, col, apply(back, p.x, p.y).x - from, event.shiftKey), key);
  });
}

export function startRow(store: EditorStore, page: Page, id: string, row: number, start: Press) {
  const before = store.doc.objects[id];
  if (before?.type !== "table" || before.lock) return;
  const key = dragKey();
  const lay = layTable(before);
  const h = lay.ys[row + 1] - lay.ys[row];
  const back = invert(placement(before.x, before.y, before.angle));
  const grip = toPage(store, page, start.clientX, start.clientY);
  const from = apply(back, grip.x, grip.y).y;
  whileDragging(store, start, (event) => {
    const p = toPage(store, page, event.clientX, event.clientY);
    store.patch<TableObject>(id, dragRow(before, row, h + apply(back, p.x, p.y).y - from), key);
  });
}

// ---------------------------------------------------------------- what is inside a box

/** Objects that lie wholly inside a box of the page, groups as a whole. */
export function objectsIn(store: EditorStore, page: Page, box: Box): string[] {
  const inside = (object: EditObject) => {
    const own = bounds(objectCorners(object));
    return own.x >= box.x && own.y >= box.y && own.x + own.w <= box.x + box.w && own.y + own.h <= box.y + box.h;
  };
  const found = page.objects.filter((id) => {
    const object = store.doc.objects[id];
    return object && !object.lock && inside(object);
  });
  return store.withGroups(found);
}

/** The cell of a table under a point of the page. */
export function cellIn(table: TableObject, p: Point): { r: number; c: number } {
  const lay = layTable(table);
  const local = apply(invert(placement(table.x, table.y, table.angle)), p.x, p.y);
  const find = (stops: number[], value: number) => {
    const at = stops.findIndex((stop, i) => i > 0 && value < stop);
    return Math.max(0, Math.min(stops.length - 2, at < 0 ? stops.length - 2 : at - 1));
  };
  return ownerOf(table, find(lay.ys, local.y), find(lay.xs, local.x));
}

/**
 * A press inside a table drawn in the PDF. A drag turns it into a table and picks the cells it passes;
 * a press meant for typing turns it into a table with the caret in that cell. Anything else is `click`.
 */
export function startGridPick(
  store: EditorStore,
  page: Page,
  event: { clientX: number; clientY: number; pointerId: number; pointerType: string },
  grid: Grid,
  edit: boolean,
  click: () => void,
) {
  const start = { x: event.clientX, y: event.clientY };
  const a = toPage(store, page, event.clientX, event.clientY);
  let last = a;
  let made: Promise<string | null> | null = null;
  const open = () => (made ??= store.openGrid(page.id, grid));
  const pick = (id: string | null) => {
    const table = id ? store.doc.objects[id] : null;
    if (!id || table?.type !== "table") return;
    const from = cellIn(table, a);
    const to = cellIn(table, last);
    store.pickCells(id, wholeArea(table, { r0: from.r, c0: from.c, r1: to.r, c1: to.c }));
  };
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  track(
    event,
    (next) => {
      last = toPage(store, page, next.clientX, next.clientY);
      const far = Math.hypot(next.clientX - start.x, next.clientY - start.y) >= 5;
      // A finger dragging is scrolling the page.
      if (!made && (next.pointerType === "touch" || !far)) return;
      document.getSelection()?.removeAllRanges();
      void open().then(pick);
    },
    (next, cancelled) => {
      if (cancelled || made) return;
      if (event.pointerType === "touch" && Math.hypot(next.clientX - start.x, next.clientY - start.y) > 10) return;
      if (!edit) {
        click();
        return;
      }
      void open().then((id) => {
        const table = id ? store.doc.objects[id] : null;
        if (!id || table?.type !== "table") return;
        store.caret = { x: start.x, y: start.y };
        store.select([id], id, cellIn(table, a));
      });
    },
  );
}
