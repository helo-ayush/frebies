import type { EditObject, ImageObject, Page, ShapeObject, TextObject } from "./model";
import { shownSize } from "./model";
import { apply, invert, objectBounds, placement, type Box, type Point } from "./engine/matrix";
import type { EditorStore } from "./store";

/** Pointer work shared by the page, the objects on it and their handles. */

let dragCount = 0;
export const dragKey = () => `drag:${(dragCount += 1)}`;

/** A point of the window, on the page as it is stored. */
export function toPage(store: EditorStore, page: Page, clientX: number, clientY: number): Point {
  const sheet = store.sheets.get(page.id);
  if (!sheet) return { x: 0, y: 0 };
  const rect = sheet.getBoundingClientRect();
  const z = rect.width / shownSize(page).w || 1;
  const px = (clientX - rect.left) / z;
  const py = (clientY - rect.top) / z;
  switch (page.rotate) {
    case 90:
      return { x: py, y: page.h - px };
    case 180:
      return { x: page.w - px, y: page.h - py };
    case 270:
      return { x: page.w - py, y: px };
    default:
      return { x: px, y: py };
  }
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

function pageUnder(store: EditorStore, x: number, y: number): Page | null {
  for (const page of store.doc.pages) {
    const rect = store.sheets.get(page.id)?.getBoundingClientRect();
    if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return page;
  }
  return null;
}

/** Lines up with the page and with its neighbours. */
function snap(store: EditorStore, page: Page, ids: ReadonlySet<string>, box: Box, reach: number) {
  const xs = [0, page.w / 2, page.w];
  const ys = [0, page.h / 2, page.h];
  for (const id of page.objects) {
    if (ids.has(id)) continue;
    const object = store.doc.objects[id];
    if (!object) continue;
    const other = objectBounds(object);
    xs.push(other.x, other.x + other.w / 2, other.x + other.w);
    ys.push(other.y, other.y + other.h / 2, other.y + other.h);
  }
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

/** Drags objects, on to another page if they are let go there. */
export function startMove(
  store: EditorStore,
  page: Page,
  ids: string[],
  start: { clientX: number; clientY: number; pointerId: number },
  done?: (moved: boolean) => void,
  key = dragKey(),
) {
  const origin = toPage(store, page, start.clientX, start.clientY);
  const before = new Map(ids.map((id) => [id, store.doc.objects[id]]));
  if ([...before.values()].some((object) => !object)) return;
  const set = new Set(ids);
  let group: Box | null = null;
  for (const object of before.values()) {
    if (!object) continue;
    const box = objectBounds(object);
    group = group
      ? {
          x: Math.min(group.x, box.x),
          y: Math.min(group.y, box.y),
          w: Math.max(group.x + group.w, box.x + box.w) - Math.min(group.x, box.x),
          h: Math.max(group.y + group.h, box.y + box.h) - Math.min(group.y, box.y),
        }
      : box;
  }
  let moved = false;
  track(
    start,
    (event) => {
      if (!moved && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < 3) return;
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

export function startResize(
  store: EditorStore,
  page: Page,
  id: string,
  handle: Handle,
  start: { clientX: number; clientY: number; pointerId: number },
) {
  const before = store.doc.objects[id];
  if (!before) return;
  const key = dragKey();
  const place = placement(before.x, before.y, before.angle);
  const back = invert(place);
  const grip = toPage(store, page, start.clientX, start.clientY);
  const local0 = apply(back, grip.x, grip.y);
  const slip = { x: local0.x - handle.x * before.w, y: local0.y - handle.y * before.h };
  const corner = handle.x !== 0.5 && handle.y !== 0.5;

  track(
    start,
    (event) => {
      const p = toPage(store, page, event.clientX, event.clientY);
      const raw = apply(back, p.x, p.y);
      const local = { x: raw.x - slip.x, y: raw.y - slip.y };
      const min = before.type === "text" ? 8 : 3;
      let left = 0;
      let top = 0;
      let right = before.w;
      let bottom = before.h;
      if (handle.x === 0) left = Math.min(local.x, right - min);
      if (handle.x === 1) right = Math.max(local.x, min);
      if (handle.y === 0) top = Math.min(local.y, bottom - min);
      if (handle.y === 1) bottom = Math.max(local.y, min);

      const free = before.type === "shape" || before.type === "link" || before.type === "field";
      if (corner && before.w > 0 && before.h > 0 && (free ? event.shiftKey : !event.shiftKey)) {
        const scale = Math.max(0.02, Math.max((right - left) / before.w, (bottom - top) / before.h));
        if (handle.x === 0) left = before.w - before.w * scale;
        else right = before.w * scale;
        if (handle.y === 0) top = before.h - before.h * scale;
        else bottom = before.h * scale;
      }
      const at = apply(place, left, top);
      const w = right - left;
      const h = bottom - top;
      if (before.type === "text") {
        if (!corner) {
          store.patch<TextObject>(id, { x: at.x, y: at.y, w, wrap: true }, key);
          return;
        }
        const k = w / Math.max(1, before.w);
        store.patch<TextObject>(
          id,
          {
            x: at.x,
            y: at.y,
            w: before.wrap ? w : before.w,
            h,
            leading: before.leading * k,
            indent: before.indent ? before.indent * k : before.indent,
            hang: before.hang ? before.hang * k : before.hang,
            runs: before.runs.map((run) => ({
              ...run,
              style: {
                ...run.style,
                size: Math.round(run.style.size * k * 100) / 100,
                tracking: run.style.tracking * k,
                rise: run.style.rise * k,
              },
            })),
          },
          key,
        );
        return;
      }
      store.patch<EditObject>(id, { x: at.x, y: at.y, w, h } as Partial<EditObject>, key);
    },
    () => undefined,
  );
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

export function startCrop(
  store: EditorStore,
  page: Page,
  id: string,
  handle: Handle,
  start: { clientX: number; clientY: number; pointerId: number },
) {
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

export function startTurn(
  store: EditorStore,
  page: Page,
  id: string,
  start: { clientX: number; clientY: number; pointerId: number },
) {
  const before = store.doc.objects[id];
  if (!before) return;
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

/** The two ends of a line, start first. */
export function lineEnds(shape: ShapeObject): [Point, Point] {
  const a = { x: shape.x, y: shape.y + (shape.flip ? shape.h : 0) };
  const b = { x: shape.x + shape.w, y: shape.y + (shape.flip ? 0 : shape.h) };
  return shape.back ? [b, a] : [a, b];
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

export function startEnd(
  store: EditorStore,
  page: Page,
  id: string,
  which: 0 | 1,
  start: { clientX: number; clientY: number; pointerId: number },
) {
  const before = store.doc.objects[id];
  if (before?.type !== "shape") return;
  const key = dragKey();
  const ends = lineEnds(before);
  track(
    start,
    (event) => {
      let p = toPage(store, page, event.clientX, event.clientY);
      if (event.shiftKey) p = straighten(ends[1 - which], p);
      const next: [Point, Point] = which === 0 ? [p, ends[1]] : [ends[0], p];
      store.patch<ShapeObject>(id, lineBox(next[0], next[1]), key);
    },
    () => undefined,
  );
}
