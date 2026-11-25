"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ObjectArt, placeCss } from "./Art";
import { Frame } from "./Frame";
import { TextView } from "./TextView";
import { dragKey, lineBox, startMove, straighten, toPage, track } from "./interact";
import { bounds, corners, objectBounds, placement, type Box, type Point } from "./engine/matrix";
import { strokePath, toSvg } from "./engine/shapes";
import type { Block } from "./engine/extract";
import {
  mixes,
  shownSize,
  uid,
  type EditObject,
  type FieldObject,
  type InkObject,
  type LinkObject,
  type MarkObject,
  type Page,
  type ShapeKind,
  type ShapeObject,
  type Tool,
} from "./model";
import { SYMBOLS, useEditor, type EditorStore, type PageField, type PageLink, type PagePicture } from "./store";
import type { RenderQueue } from "@/components/tool/viewer/render-queue";

const CURSORS: Partial<Record<Tool, string>> = {
  text: "text",
  pen: "crosshair",
  marker: "crosshair",
  highlight: "text",
  underline: "text",
  strike: "text",
};

const DRAWN = new Set<Tool>([
  "rect",
  "ellipse",
  "line",
  "arrow",
  "whiteout",
  "check",
  "cross",
  "dot",
  "link",
  "field-text",
  "field-multiline",
  "field-check",
  "field-list",
]);

/** The page's own drawing, without what was taken off it. */
function Backdrop({
  store,
  page,
  zoom,
  queue,
  onKey,
}: {
  store: EditorStore;
  page: Page;
  zoom: number;
  queue: RenderQueue;
  onKey: (key: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = useEditor(store, (s) => s.backdropKey(page));
  const [sharp, setSharp] = useState(zoom);
  const drawn = useRef("");
  const report = useRef(onKey);
  report.current = onKey;

  useEffect(() => {
    const timer = setTimeout(() => setSharp(zoom), 140);
    return () => clearTimeout(timer);
  }, [zoom]);

  useEffect(() => {
    let off = false;
    let stop: (() => void) | null = null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(sharp * ratio, 5000 / Math.max(page.w, page.h), Math.sqrt(15e6 / (page.w * page.h)));
    const wanted = `${key}@${scale.toFixed(3)}`;
    if (drawn.current === wanted) return;
    void queue(async () => {
      if (off) return;
      const item = await store.backdrop(page).catch(() => null);
      const canvas = ref.current;
      if (off || !canvas) return;
      if (item) {
        const viewport = item.page.getViewport({ scale });
        const bench = document.createElement("canvas");
        bench.width = Math.max(1, Math.round(viewport.width));
        bench.height = Math.max(1, Math.round(viewport.height));
        // 2: form fields are drawn by the editor, so they can be filled in.
        const task = item.page.render({ canvas: bench, viewport, annotationMode: 2 });
        stop = () => task.cancel();
        try {
          await task.promise;
        } catch {
          return;
        }
        if (off || !ref.current) return;
        canvas.width = bench.width;
        canvas.height = bench.height;
        canvas.getContext("2d")?.drawImage(bench, 0, 0);
        store.canvases.set(page.id, { canvas, scale });
      } else {
        canvas.width = canvas.width || 1;
      }
      drawn.current = wanted;
      report.current(key);
    });
    return () => {
      off = true;
      stop?.();
    };
  }, [store, page, key, sharp, queue]);

  useEffect(
    () => () => {
      store.canvases.delete(page.id);
    },
    [store, page.id],
  );

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 block"
      style={{ width: page.w, height: page.h }}
    />
  );
}

export const boxStyle = (block: Block): CSSProperties => ({
  left: 0,
  top: 0,
  width: block.w,
  height: block.h,
  transformOrigin: "0 0",
  transform: `translate(${block.x}px, ${block.y}px) rotate(${block.angle}deg)`,
});

const coverOf = (store: EditorStore, page: Page, block: Block) =>
  store.sample(
    page.id,
    bounds(corners(placement(block.x, block.y, block.angle), { x: 0, y: 0, w: block.w, h: block.h })),
  );

/** One object on the page: how it looks, and what a press on it does. */
const ObjectView = memo(function ObjectView({
  store,
  page,
  id,
  stale,
}: {
  store: EditorStore;
  page: Page;
  id: string;
  stale: boolean;
}) {
  const object = useEditor(store, (s) => s.doc.objects[id] as EditObject | undefined);
  const editing = useEditor(store, (s) => s.view.editing === id);
  const selected = useEditor(store, (s) => s.view.selection.includes(id));
  const tool = useEditor(store, (s) => s.view.tool);
  useEditor(store, (s) => object?.type === "mark" && s.view.editing !== null);
  if (!object) return null;

  const busy = store.view.editing !== null;
  const reachable =
    (tool === "select" && !(object.type === "mark" && busy)) ||
    (tool === "text" && object.type === "text") ||
    (tool === "link" && object.type === "link");

  const press = (event: ReactPointerEvent) => {
    if (event.button !== 0 || !reachable) return;
    if (editing) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    const { selection } = store.view;
    if (event.pointerType === "touch" && !selected) {
      // A finger may be scrolling: wait and see.
      const from = { x: event.clientX, y: event.clientY };
      track(
        event,
        () => undefined,
        (next, cancelled) => {
          if (cancelled || Math.hypot(next.clientX - from.x, next.clientY - from.y) > 10) return;
          store.caret = from;
          store.select([id], store.doc.objects[id]?.type === "text" ? id : null);
        },
      );
      return;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    event.preventDefault();
    if (event.shiftKey) {
      store.select(selected ? selection.filter((item) => item !== id) : [...selection, id]);
      return;
    }
    const ids = selected ? selection : [id];
    if (!selected) store.select([id]);
    const spot = { x: event.clientX, y: event.clientY };
    startMove(store, page, ids, event, (moved) => {
      if (moved) return;
      const now = store.doc.objects[id];
      if (now?.type === "text") {
        store.caret = spot;
        store.select([id], id);
      } else if (selected && selection.length > 1) store.select([id]);
      else if (selected && now?.type === "mark") {
        // Pressed again: reach for the words under the mark.
        const under = document
          .elementsFromPoint(spot.x, spot.y)
          .find((node) => node instanceof HTMLElement && (node.dataset.block || node.dataset.kind === "text"));
        if (!(under instanceof HTMLElement)) return;
        if (under.dataset.object) {
          store.caret = spot;
          store.select([under.dataset.object], under.dataset.object);
        } else if (under.dataset.block) {
          const key = under.dataset.block;
          const block = store.block(page, key);
          if (!block) return;
          void store.openBlock(page.id, key, coverOf(store, page, block)).then((opened) => {
            if (!opened) return;
            store.caret = spot;
            store.select([opened], opened);
          });
        }
      }
    });
  };

  const common = {
    onPointerDown: press,
    "data-object": id,
    "data-kind": object.type,
  };
  const cover = object.type === "text" && stale && object.block ? (page.covers[object.block] ?? null) : null;

  if (object.type === "link") {
    return (
      <div
        {...common}
        style={{ ...placeCss(object), width: object.w, height: object.h }}
        className={`border border-dashed border-accent-deep bg-accent/10 ${reachable ? "pointer-events-auto cursor-move" : ""}`}
      />
    );
  }
  const thin = object.type === "shape" && (object.kind === "line" || object.kind === "arrow");
  return (
    <div
      {...common}
      style={placeCss(object)}
      className={`${reachable && !thin && object.type !== "ink" ? "pointer-events-auto" : "pointer-events-none"} ${selected ? "touch-none" : ""} ${
        editing
          ? ""
          : `cursor-move ${reachable && !selected && !thin && object.type !== "ink" ? "hover:shadow-[0_0_0_calc(1.5px/var(--z))_#f2552c]" : ""}`
      }`}
    >
      {object.type === "text" ? (
        <TextView store={store} object={object} editing={editing} cover={cover} />
      ) : (
        <ObjectArt object={object} store={store} />
      )}
      {(thin || object.type === "ink") && reachable ? (
        <svg
          width={Math.max(1, object.w)}
          height={Math.max(1, object.h)}
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          aria-hidden
        >
          <path
            d={
              object.type === "ink"
                ? toSvg(object.strokes.flatMap((stroke) => strokePath(stroke, object.w, object.h)))
                : `M0 ${object.flip ? object.h : 0}L${object.w} ${object.flip ? 0 : object.h}`
            }
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(object.width, 14 / store.view.zoom)}
            className="pointer-events-auto cursor-move"
          />
        </svg>
      ) : null}
    </div>
  );
});

/** A fillable field of the file. */
function Field({ store, page, field }: { store: EditorStore; page: Page; field: PageField }) {
  const key = `${page.source}:${field.name}`;
  const value = useEditor(store, (s) => s.doc.values[key]) ?? field.value;
  const tool = useEditor(store, (s) => s.view.tool);
  const set = (next: string | boolean) => store.setValue(page.source as string, field.name, next);
  const style: CSSProperties = { left: field.box.x, top: field.box.y, width: field.box.w, height: field.box.h };
  const size =
    field.size > 0 ? field.size : Math.max(6, Math.min(field.kind === "multiline" ? 11 : 14, field.box.h * 0.62));
  const look = `pointer-events-auto absolute m-0 rounded-none border border-[#8fb3c9] bg-[#e4f1f8]/90 p-0 text-ink outline-none focus:border-ink focus:bg-white ${
    tool === "select" ? "" : "!pointer-events-none"
  }`;
  const common = { "aria-label": field.name, disabled: field.readOnly, title: field.name };
  if (field.kind === "check") {
    return (
      <input
        type="checkbox"
        {...common}
        checked={Boolean(value)}
        onChange={(event) => set(event.target.checked)}
        className={`${look} accent-[#1d1c1f]`}
        style={style}
      />
    );
  }
  if (field.kind === "radio") {
    return (
      <input
        type="radio"
        {...common}
        name={`${page.id}-${field.name}`}
        checked={value === field.option}
        onChange={() => set(field.option ?? "")}
        className={`${look} accent-[#1d1c1f]`}
        style={style}
      />
    );
  }
  if (field.kind === "list") {
    return (
      <select
        {...common}
        value={String(value)}
        onChange={(event) => set(event.target.value)}
        className={`${look} px-0.5`}
        style={{ ...style, fontSize: size }}
      >
        {!field.options.includes(String(value)) ? <option value={String(value)}>{String(value)}</option> : null}
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "multiline") {
    return (
      <textarea
        {...common}
        value={String(value)}
        onChange={(event) => set(event.target.value)}
        className={`${look} resize-none px-1 py-0.5 leading-[1.2]`}
        style={{ ...style, fontSize: size }}
      />
    );
  }
  return (
    <input
      type="text"
      {...common}
      value={String(value)}
      onChange={(event) => set(event.target.value)}
      className={`${look} px-1`}
      style={{ ...style, fontSize: size }}
    />
  );
}

type Draft =
  | { kind: "box"; a: Point; b: Point }
  | { kind: "line"; a: Point; b: Point }
  | { kind: "ink"; points: number[] }
  | { kind: "marks"; rects: Box[] };

/** The page itself: its drawing, what can be picked up, and everything put on it. */
const PageBody = memo(function PageBody({
  store,
  page,
  zoom,
  queue,
}: {
  store: EditorStore;
  page: Page;
  zoom: number;
  queue: RenderQueue;
}) {
  const [drawnKey, setDrawnKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pictures, setPictures] = useState<PagePicture[]>([]);
  const [notes, setNotes] = useState<{ links: PageLink[]; fields: PageField[] }>({ links: [], fields: [] });
  const tool = useEditor(store, (s) => s.view.tool);
  const selection = useEditor(store, (s) => s.view.selection);
  const editing = useEditor(store, (s) => s.view.editing);
  const text = useEditor(store, (s) => s.readyText(page));
  const key = useEditor(store, (s) => s.backdropKey(page));
  const guides = useEditor(store, (s) => (s.view.guides?.page === page.id ? s.view.guides : null));
  const hit = useEditor(store, (s) => {
    const { find } = s.view;
    const item = find.open ? find.hits[find.at] : undefined;
    return item?.page === page.id ? item : null;
  });
  // What can be picked up on this page is worked out once it comes near.
  const { source, index } = page;
  useEffect(() => {
    if (source === null) return;
    let off = false;
    void store.textOf(source, index).catch(() => undefined);
    void store.picturesOf(page).then((list) => !off && setPictures(list));
    void store.notesOf(page).then((list) => !off && setNotes(list));
    return () => {
      off = true;
    };
  }, [source, index, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const stale = drawnKey !== null && drawnKey !== key;
  const at = (event: { clientX: number; clientY: number }) => toPage(store, page, event.clientX, event.clientY);

  // ------------------------------------------------------------ the file's own text and pictures

  const pressBlock = (event: ReactPointerEvent, block: Block) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const start = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    const shift = event.shiftKey;
    const cover = coverOf(store, page, block);
    const key = dragKey();
    let opening: Promise<string | null> | null = null;
    let last = start;
    let released = false;
    const before = store.view.selection;
    track(
      event,
      (next) => {
        last = { clientX: next.clientX, clientY: next.clientY, pointerId: next.pointerId };
        if (
          opening ||
          next.pointerType === "touch" ||
          Math.hypot(next.clientX - start.clientX, next.clientY - start.clientY) < 4
        )
          return;
        opening = store.openBlock(page.id, block.key, cover, true);
        void opening.then((id) => {
          if (!id) return;
          store.select([id]);
          const moved = toPage(store, page, last.clientX, last.clientY);
          const from = toPage(store, page, start.clientX, start.clientY);
          store.patchMany([id], (object) => ({ x: object.x + moved.x - from.x, y: object.y + moved.y - from.y }), key);
          if (!released) startMove(store, page, [id], last, undefined, key);
        });
      },
      (_, cancelled) => {
        released = true;
        if (opening || cancelled) return;
        void store.openBlock(page.id, block.key, cover).then((id) => {
          if (!id) return;
          if (shift) {
            store.select([...before, id]);
            return;
          }
          store.caret = { x: start.clientX, y: start.clientY };
          if (store.view.tool === "text") store.setView({ tool: "select" });
          store.select([id], id);
        });
      },
    );
  };

  const pressPicture = (event: ReactPointerEvent, picture: PagePicture) => {
    if (event.button !== 0) return;
    // A picture as large as the page is a scan: it stays put unless it is asked for.
    if (picture.whole) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    let last = start;
    let released = false;
    const key = dragKey();
    let opening: Promise<string | null> | null = null;
    const open = () => (opening ??= store.openPicture(page.id, picture, key));
    track(
      event,
      (next) => {
        last = { clientX: next.clientX, clientY: next.clientY, pointerId: next.pointerId };
        if (
          opening ||
          next.pointerType === "touch" ||
          Math.hypot(next.clientX - start.clientX, next.clientY - start.clientY) < 4
        )
          return;
        void open().then((id) => {
          if (!id) return;
          store.select([id]);
          const moved = toPage(store, page, last.clientX, last.clientY);
          const from = toPage(store, page, start.clientX, start.clientY);
          store.patchMany([id], (object) => ({ x: object.x + moved.x - from.x, y: object.y + moved.y - from.y }), key);
          if (!released) startMove(store, page, [id], last, undefined, key);
        });
      },
      (_, cancelled) => {
        released = true;
        if (opening || cancelled) return;
        void open().then((id) => {
          if (id) store.select([id]);
        });
      },
    );
  };

  // ------------------------------------------------------------ drawing new things

  const place = (kind: Tool, a: Point, b: Point, click: boolean) => {
    const { prefs } = store.view;
    let box: Box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    const base = { angle: 0, opacity: 1 };
    if (kind === "link") {
      if (click) return;
      const link: LinkObject = { id: uid("l"), type: "link", ...box, ...base, url: "" };
      store.add(page.id, link);
      store.setView({ tool: "select" });
      return;
    }
    if (kind.startsWith("field-")) {
      const type = kind.slice(6) as FieldObject["kind"];
      if (click) {
        const wh = type === "check" ? { w: 16, h: 16 } : type === "multiline" ? { w: 220, h: 80 } : { w: 180, h: 24 };
        box = { x: a.x, y: a.y - wh.h / 2, ...wh };
      }
      const names = { text: "Text", multiline: "Notes", check: "Checkbox", list: "List" };
      const taken = Object.values(store.doc.objects).filter((object) => object.type === "field").length;
      const field: FieldObject = {
        id: uid("f"),
        type: "field",
        kind: type,
        ...box,
        ...base,
        name: `${names[type]} ${taken + 1}`,
        options: ["Option 1", "Option 2"],
      };
      store.add(page.id, field);
      store.setView({ tool: "select" });
      return;
    }
    const shape = kind as ShapeKind;
    if (shape === "line" || shape === "arrow") {
      const line = lineBox(a, click ? { x: a.x + 110, y: a.y } : b);
      const object: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind: shape,
        ...line,
        ...base,
        stroke: prefs.shape.stroke ?? "#1d1c1f",
        fill: null,
        width: prefs.shape.width,
        dash: prefs.shape.dash,
      };
      store.add(page.id, object);
      store.setView({ tool: "select" });
      return;
    }
    if (SYMBOLS.has(shape)) {
      const side = shape === "dot" ? 9 : 16;
      if (click || box.w < 5 || box.h < 5) box = { x: a.x - side / 2, y: a.y - side / 2, w: side, h: side };
      const object: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind: shape,
        ...box,
        ...base,
        stroke: prefs.symbol,
        fill: null,
        width: Math.max(1, Math.min(box.w, box.h) * 0.12),
        dash: false,
      };
      // The tool stays, so a form can be ticked through.
      store.add(page.id, object, false);
      return;
    }
    if (click) box = { x: a.x - 60, y: a.y - 40, w: 120, h: 80 };
    if (shape === "whiteout") {
      const object: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind: "whiteout",
        ...box,
        ...base,
        stroke: null,
        fill: prefs.white ?? store.sample(page.id, box),
        width: 0,
        dash: false,
      };
      store.add(page.id, object, false);
      return;
    }
    const object: ShapeObject = { id: uid("g"), type: "shape", kind: shape, ...box, ...base, ...prefs.shape };
    store.add(page.id, object);
    store.setView({ tool: "select" });
  };

  const addInk = (points: number[], marker: boolean) => {
    if (points.length < 2) return;
    const list: Point[] = [];
    for (let i = 0; i < points.length; i += 2) list.push({ x: points[i], y: points[i + 1] });
    const box = bounds(list);
    const w = Math.max(0.5, box.w);
    const h = Math.max(0.5, box.h);
    const look = marker ? store.view.prefs.marker : store.view.prefs.pen;
    const ink: InkObject = {
      id: uid("k"),
      type: "ink",
      x: box.x,
      y: box.y,
      w,
      h,
      angle: 0,
      opacity: marker ? 0.55 : 1,
      strokes: [list.flatMap((p) => [(p.x - box.x) / w, (p.y - box.y) / h])],
      stroke: look.color,
      width: look.width,
      marker,
    };
    store.add(page.id, ink, false);
  };

  const addMarks = (rects: Box[], kind: MarkObject["kind"]) => {
    if (rects.length === 0) return;
    const x0 = Math.min(...rects.map((rect) => rect.x));
    const y0 = Math.min(...rects.map((rect) => rect.y));
    const x1 = Math.max(...rects.map((rect) => rect.x + rect.w));
    const y1 = Math.max(...rects.map((rect) => rect.y + rect.h));
    const mark: MarkObject = {
      id: uid("m"),
      type: "mark",
      kind,
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      angle: 0,
      opacity: kind === "highlight" ? 0.75 : 1,
      color: store.view.prefs.mark[kind],
      rects: rects.map((rect) => [rect.x - x0, rect.y - y0, rect.w, rect.h]),
    };
    store.add(page.id, mark, false);
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const a = at(event);
    if (tool === "select") {
      if (!event.shiftKey) store.select([]);
      if (event.pointerType === "touch") return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      let drawn = false;
      const first = { x: event.clientX, y: event.clientY };
      track(
        event,
        (next) => {
          if (!drawn && Math.hypot(next.clientX - first.x, next.clientY - first.y) < 5) return;
          drawn = true;
          setDraft({ kind: "box", a, b: at(next) });
        },
        (next) => {
          setDraft(null);
          if (!drawn) return;
          const b = at(next);
          const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
          const now = store.page(page.id);
          const inside = (now?.objects ?? []).filter((id) => {
            const object = store.doc.objects[id];
            if (!object) return false;
            const o = objectBounds(object);
            return o.x >= box.x && o.y >= box.y && o.x + o.w <= box.x + box.w && o.y + o.h <= box.y + box.h;
          });
          const own = (store.readyText(page)?.blocks ?? []).filter((block) => {
            if (now?.cuts[block.key]) return false;
            const o = bounds(corners(placement(block.x, block.y, block.angle), { x: 0, y: 0, w: block.w, h: block.h }));
            return o.x >= box.x && o.y >= box.y && o.x + o.w <= box.x + box.w && o.y + o.h <= box.y + box.h;
          });
          if (own.length === 0) {
            if (inside.length > 0) store.select(inside);
            return;
          }
          void Promise.all(own.map((block) => store.openBlock(page.id, block.key, coverOf(store, page, block)))).then(
            (opened) => {
              store.select([...inside, ...opened.filter((id): id is string => id !== null)]);
            },
          );
        },
      );
      return;
    }
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (tool === "text") {
      if (store.view.editing) {
        store.select([]);
        return;
      }
      store.addText(page.id, a.x, a.y);
      return;
    }
    if (tool === "pen" || tool === "marker") {
      const points = [a.x, a.y];
      setDraft({ kind: "ink", points: [...points] });
      track(
        event,
        (next) => {
          for (const part of next.getCoalescedEvents?.() ?? [next]) {
            let p = at(part);
            if (next.shiftKey) p = straighten(a, p);
            const n = points.length;
            if (next.shiftKey) points.splice(2, n, p.x, p.y);
            else if (Math.hypot(p.x - points[n - 2], p.y - points[n - 1]) > 0.7 / zoom) points.push(p.x, p.y);
          }
          setDraft({ kind: "ink", points: [...points] });
        },
        (_, cancelled) => {
          setDraft(null);
          if (!cancelled) addInk(points, tool === "marker");
        },
      );
      return;
    }
    if (tool === "highlight" || tool === "underline" || tool === "strike") {
      let rects: Box[] = [];
      track(
        event,
        (next) => {
          rects = markRects(text?.blocks ?? [], page, store, a, at(next));
          setDraft({ kind: "marks", rects });
        },
        () => {
          setDraft(null);
          addMarks(rects, tool);
        },
      );
      return;
    }
    if (DRAWN.has(tool)) {
      let b = a;
      const line = tool === "line" || tool === "arrow";
      track(
        event,
        (next) => {
          b = at(next);
          if (next.shiftKey) {
            if (line) b = straighten(a, b);
            else {
              const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
              b = { x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side };
            }
          }
          setDraft(line ? { kind: "line", a, b } : { kind: "box", a, b });
        },
        (_, cancelled) => {
          setDraft(null);
          if (!cancelled) place(tool, a, b, Math.hypot(b.x - a.x, b.y - a.y) < 4);
        },
      );
    }
  };

  const turned =
    page.rotate === 90
      ? `translate(${page.h * zoom}px, 0) rotate(90deg) `
      : page.rotate === 180
        ? `translate(${page.w * zoom}px, ${page.h * zoom}px) rotate(180deg) `
        : page.rotate === 270
          ? `translate(0, ${page.w * zoom}px) rotate(270deg) `
          : "";
  const touchable = tool === "select" || tool === "text";
  const blocks = (text?.blocks ?? []).filter((block) => !page.cuts[block.key]);
  const { prefs } = store.view;
  const mine = selection.filter((id) => page.objects.includes(id));

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: tool === "select" ? undefined : "none" }}
      onPointerDown={onPointerDown}
    >
      <div
        className="absolute left-0 top-0"
        style={
          {
            width: page.w,
            height: page.h,
            transformOrigin: "0 0",
            transform: `${turned}scale(${zoom})`,
            cursor: CURSORS[tool] ?? (tool === "select" ? "default" : "crosshair"),
            "--z": zoom,
          } as CSSProperties
        }
      >
        <Backdrop store={store} page={page} zoom={zoom} queue={queue} onKey={setDrawnKey} />

        {/* What the file itself holds, ready to be picked up */}
        {touchable ? (
          <div className="absolute inset-0">
            {pictures
              .filter((picture) => !page.imageCuts.includes(picture.index) && tool === "select")
              .map((picture) => (
                <div
                  key={picture.index}
                  data-picture={picture.index}
                  onPointerDown={(event) => pressPicture(event, picture)}
                  onDoubleClick={() => {
                    if (picture.whole) void store.openPicture(page.id, picture).then((id) => id && store.select([id]));
                  }}
                  title={picture.whole ? "Double-click to select this picture" : undefined}
                  className={`absolute left-0 top-0 ${picture.whole ? "" : "cursor-move hover:shadow-[0_0_0_calc(2px/var(--z))_#f2552c]"}`}
                  style={{
                    width: picture.w,
                    height: picture.h,
                    transformOrigin: "0 0",
                    transform: `translate(${picture.x}px, ${picture.y}px) rotate(${picture.angle}deg)`,
                  }}
                />
              ))}
            {blocks.map((block) => (
              <div
                key={block.key}
                data-block={block.key}
                onPointerDown={(event) => pressBlock(event, block)}
                className="absolute cursor-text hover:bg-accent/[0.07] hover:shadow-[0_0_0_calc(1.5px/var(--z))_#f2552c]"
                style={boxStyle(block)}
              />
            ))}
          </div>
        ) : null}

        {tool === "link"
          ? notes.links
              .filter((link) => !page.linkCuts.includes(link.place))
              .map((link) => (
                <div
                  key={link.place}
                  title={link.url || "A link inside the document"}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    store.openLink(page.id, link);
                    store.setView({ tool: "select" });
                  }}
                  className="absolute cursor-pointer border border-dashed border-accent-deep bg-accent/10"
                  style={{ left: link.box.x, top: link.box.y, width: link.box.w, height: link.box.h }}
                />
              ))
          : null}

        <div className="pointer-events-none absolute inset-0">
          {/* Answers are typed into the page: a press in one is not a press on the page. */}
          <div onPointerDown={(event) => event.stopPropagation()} onFocus={() => store.select([])}>
            {notes.fields.map((field, i) => (
              <Field key={`${field.name}${i}`} store={store} page={page} field={field} />
            ))}
          </div>
          {page.objects
            .filter((id) => !mixes(store.doc.objects[id]))
            .map((id) => (
              <ObjectView key={id} store={store} page={page} id={id} stale={stale} />
            ))}
        </div>

        {/* Highlights mix with what is under them */}
        <div className="pointer-events-none absolute inset-0" style={{ mixBlendMode: "multiply" }}>
          {page.objects
            .filter((id) => mixes(store.doc.objects[id]))
            .map((id) => (
              <ObjectView key={id} store={store} page={page} id={id} stale={stale} />
            ))}
          {draft?.kind === "marks" && tool === "highlight"
            ? draft.rects.map((rect, i) => (
                <span
                  key={i}
                  className="absolute"
                  style={{
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    background: prefs.mark.highlight,
                    opacity: 0.75,
                  }}
                />
              ))
            : null}
          {draft?.kind === "ink" && tool === "marker" ? (
            <InkDraft points={draft.points} color={prefs.marker.color} width={prefs.marker.width} opacity={0.55} />
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-0">
          {draft ? <DraftView draft={draft} tool={tool} store={store} pageId={page.id} /> : null}
          {hit ? (
            <span
              className="absolute bg-accent/15"
              style={{
                left: hit.box.x - 2,
                top: hit.box.y - 1,
                width: hit.box.w + 4,
                height: hit.box.h + 2,
                boxShadow: "0 0 0 calc(2px / var(--z)) #f2552c",
              }}
            />
          ) : null}
          {guides && guides.x !== null ? (
            <span
              className="absolute bg-accent"
              style={{ left: guides.x, top: 0, width: "calc(1px / var(--z))", height: page.h }}
            />
          ) : null}
          {guides && guides.y !== null ? (
            <span
              className="absolute bg-accent"
              style={{ top: guides.y, left: 0, height: "calc(1px / var(--z))", width: page.w }}
            />
          ) : null}
          {mine.map((id) => (
            <Frame key={id} store={store} page={page} id={id} alone={selection.length === 1} editing={editing === id} />
          ))}
        </div>
      </div>
    </div>
  );
});

/** Room for a page. The page itself is only there while it is near the screen. */
export const PageView = memo(function PageView({
  store,
  page,
  number,
  zoom,
  queue,
  near,
}: {
  store: EditorStore;
  page: Page;
  number: number;
  zoom: number;
  queue: RenderQueue;
  near: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const size = shownSize(page);
  useLayoutEffect(() => {
    const node = sheet.current;
    if (!node) return;
    store.sheets.set(page.id, node);
    return () => {
      if (store.sheets.get(page.id) === node) store.sheets.delete(page.id);
    };
  }, [store, page.id]);
  return (
    <div
      ref={sheet}
      data-page={page.id}
      aria-label={`Page ${number}`}
      className="relative shrink-0 bg-white shadow-[0_0_0_1px_rgba(24,24,27,0.2)]"
      style={{ width: size.w * zoom, height: size.h * zoom }}
    >
      {near ? <PageBody store={store} page={page} zoom={zoom} queue={queue} /> : null}
    </div>
  );
});

function InkDraft({
  points,
  color,
  width,
  opacity = 1,
}: {
  points: number[];
  color: string;
  width: number;
  opacity?: number;
}) {
  return (
    <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible" aria-hidden style={{ opacity }}>
      <path
        d={toSvg(strokePath(points, 1, 1))}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DraftView({ draft, tool, store, pageId }: { draft: Draft; tool: Tool; store: EditorStore; pageId: string }) {
  const { prefs } = store.view;
  if (draft.kind === "ink")
    return tool === "pen" ? <InkDraft points={draft.points} color={prefs.pen.color} width={prefs.pen.width} /> : null;
  if (draft.kind === "marks") {
    if (tool === "highlight") return null;
    return (
      <>
        {draft.rects.map((rect, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: rect.x,
              top: rect.y + rect.h * (tool === "underline" ? 0.93 : 0.54),
              width: rect.w,
              height: Math.max(0.6, rect.h * 0.06),
              background: tool === "underline" ? prefs.mark.underline : prefs.mark.strike,
            }}
          />
        ))}
      </>
    );
  }
  if (draft.kind === "line") {
    return (
      <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible" aria-hidden>
        <path
          d={`M${draft.a.x} ${draft.a.y}L${draft.b.x} ${draft.b.y}`}
          stroke={prefs.shape.stroke ?? "#1d1c1f"}
          strokeWidth={prefs.shape.width}
          strokeDasharray={prefs.shape.dash ? `${prefs.shape.width * 3} ${prefs.shape.width * 2}` : undefined}
        />
      </svg>
    );
  }
  const box = {
    left: Math.min(draft.a.x, draft.b.x),
    top: Math.min(draft.a.y, draft.b.y),
    width: Math.abs(draft.a.x - draft.b.x),
    height: Math.abs(draft.a.y - draft.b.y),
  };
  if (tool === "rect" || tool === "ellipse") {
    return (
      <span
        className="absolute"
        style={{
          ...box,
          borderRadius: tool === "ellipse" ? "50%" : 0,
          background: prefs.shape.fill ?? undefined,
          outline: prefs.shape.stroke
            ? `${prefs.shape.width}px ${prefs.shape.dash ? "dashed" : "solid"} ${prefs.shape.stroke}`
            : undefined,
          outlineOffset: -prefs.shape.width / 2,
        }}
      />
    );
  }
  if (tool === "whiteout")
    return (
      <span
        className="absolute"
        style={{
          ...box,
          background: prefs.white ?? store.sample(pageId, { x: box.left, y: box.top, w: box.width, h: box.height }),
          boxShadow: "0 0 0 calc(1px / var(--z)) #a5a4a2",
        }}
      />
    );
  return (
    <span
      className="absolute border-accent bg-accent/10"
      style={{ ...box, borderStyle: "dashed", borderWidth: "calc(1.5px / var(--z))" }}
    />
  );
}

/** The lines of text between two points, as boxes to mark. */
function markRects(blocks: readonly Block[], page: Page, store: EditorStore, a: Point, b: Point): Box[] {
  type Line = { x0: number; x1: number; y: number; size: number; stops: number[] };
  const lines: Line[] = [];
  for (const block of blocks) {
    if (block.angle !== 0 || page.cuts[block.key]) continue;
    lines.push(...block.rows);
  }
  // Text typed or changed here can be marked too.
  for (const id of page.objects) {
    const object = store.doc.objects[id];
    if (object?.type !== "text" || object.angle !== 0) continue;
    const rows = Math.max(1, Math.round(object.h / object.leading));
    for (let i = 0; i < rows; i += 1) {
      const size = object.runs[0]?.style.size ?? 12;
      lines.push({
        x0: object.x,
        x1: object.x + object.w,
        y: object.y + (i + 0.5) * object.leading + size * 0.32,
        size,
        stops: [],
      });
    }
  }
  const middle = (line: Line) => line.y - line.size * 0.32;
  const nearest = (p: Point) => {
    let best: Line | null = null;
    let score = Infinity;
    for (const line of lines) {
      const dx = Math.max(0, line.x0 - p.x, p.x - line.x1);
      const dy = Math.max(0, Math.abs(p.y - middle(line)) - line.size * 0.6);
      const d = dx * 0.6 + dy * 2;
      if (d < score) {
        score = d;
        best = line;
      }
    }
    return score < 60 ? best : null;
  };
  let from = nearest(a);
  let to = nearest(b);
  if (!from || !to) {
    const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    return box.w > 3 && box.h > 3 ? [box] : [];
  }
  let start = a;
  let end = b;
  const same = from === to || Math.abs(from.y - to.y) < 1;
  if ((!same && from.y > to.y) || (same && a.x > b.x)) {
    [from, to] = [to, from];
    [start, end] = [end, start];
  }
  const snapTo = (line: Line, x: number) => {
    if (line.stops.length === 0) return Math.min(Math.max(x, line.x0), line.x1);
    return line.stops.reduce((best, stop) => (Math.abs(stop - x) < Math.abs(best - x) ? stop : best), line.stops[0]);
  };
  const rect = (line: Line, x0: number, x1: number): Box => ({
    x: x0,
    y: line.y - line.size * 0.86,
    w: x1 - x0,
    h: line.size * 1.12,
  });
  if (same) {
    const x0 = snapTo(from, start.x);
    const x1 = snapTo(to, end.x);
    return x1 - x0 > 0.5 ? [rect(from, x0, x1)] : [];
  }
  const span = { x0: Math.min(from.x0, to.x0), x1: Math.max(from.x1, to.x1) };
  const out: Box[] = [];
  for (const line of lines) {
    if (line.y < from.y - 1 || line.y > to.y + 1) continue;
    if (line !== from && line !== to && Math.min(line.x1, span.x1) - Math.max(line.x0, span.x0) < line.size) continue;
    const x0 = line === from ? snapTo(line, start.x) : line.x0;
    const x1 = line === to ? snapTo(line, end.x) : line.x1;
    if (line !== from && line !== to && (Math.abs(line.y - from.y) < 1 || Math.abs(line.y - to.y) < 1)) continue;
    if (x1 - x0 > 0.5) out.push(rect(line, x0, x1));
  }
  return out;
}
