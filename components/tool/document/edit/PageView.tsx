"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Parts } from "./Art";
import { Backdrop, DecorLayer } from "./Backdrop";
import { CropArea } from "./CropArea";
import { Field } from "./Fields";
import { Frame, HoverMove, ManyFrame } from "./Frame";
import { ObjectView } from "./ObjectView";
import { Rulers } from "./Rulers";
import {
  GRID,
  doublePress,
  dragKey,
  lineBox,
  objectsIn,
  shownCss,
  startGridPick,
  startMove,
  straighten,
  toPage,
  track,
} from "./interact";
import { cellSpot, markRects, ruledCell } from "./marking";
import { bounds, type Box, type Point } from "./engine/matrix";
import { shapeDef } from "./engine/shape-kinds";
import { shapeParts, strokePath, toSvg } from "./engine/shapes";
import type { Block } from "./engine/extract";
import { distanceTo, isPanel, type Unit } from "./engine/vectors";
import {
  marginBox,
  mixes,
  pageBox,
  shownSize,
  uid,
  type FieldObject,
  type InkObject,
  type LinkObject,
  type MarkObject,
  type NoteObject,
  type Page,
  type PathObject,
  type ShapeKind,
  type ShapeObject,
  type Tool,
} from "./model";
import {
  SYMBOLS,
  blockBox,
  leadingOf,
  pictureBox,
  useEditor,
  type EditorStore,
  type PageField,
  type PageLink,
  type PagePicture,
} from "./store";
import type { RenderQueue } from "@/components/tool/viewer/render-queue";

const CURSORS: Partial<Record<Tool, string>> = {
  text: "text",
  pen: "crosshair",
  marker: "crosshair",
  highlight: "text",
  underline: "text",
  strike: "text",
  squiggle: "text",
};

const MARKING = new Set<Tool>(["highlight", "underline", "strike", "squiggle"]);

const boxStyle = (block: Block): CSSProperties => ({
  left: 0,
  top: 0,
  width: block.w,
  height: block.h,
  transformOrigin: "0 0",
  transform: `translate(${block.x}px, ${block.y}px) rotate(${block.angle}deg)`,
});

const coverOf = (store: EditorStore, page: Page, block: Block) => store.sample(page.id, blockBox(block));

const boxOf = (a: Point, b: Point): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});

const within = (inner: Box, outer: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

type Draft =
  | { kind: "box"; a: Point; b: Point }
  | { kind: "line"; a: Point; b: Point }
  | { kind: "ink"; points: number[] }
  | { kind: "marks"; rects: Box[] }
  | { kind: "poly"; points: Point[]; at: Point };

/** The page itself: its drawing, what can be picked up, and everything put on it. */
const PageBody = memo(function PageBody({
  store,
  page,
  index,
  count,
  zoom,
  queue,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  zoom: number;
  queue: RenderQueue;
}) {
  const [drawnKey, setDrawnKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hover, setHover] = useState<Unit | null>(null);
  const [pictures, setPictures] = useState<PagePicture[]>([]);
  const [notes, setNotes] = useState<{ links: PageLink[]; fields: PageField[] }>({ links: [], fields: [] });
  const tool = useEditor(store, (s) => s.view.tool);
  const selection = useEditor(store, (s) => s.view.selection);
  const editing = useEditor(store, (s) => s.view.editing);
  const text = useEditor(store, (s) => s.readyText(page));
  const key = useEditor(store, (s) => s.backdropKey(page));
  const guides = useEditor(store, (s) => (s.view.guides?.page === page.id ? s.view.guides : null));
  const find = useEditor(store, (s) => s.view.find);
  const cropArea = useEditor(store, (s) => (s.view.cropArea?.page === page.id ? s.view.cropArea.box : null));
  const showMargins = useEditor(store, (s) => s.view.prefs.margins);
  const showGrid = useEditor(store, (s) => s.view.prefs.grid);
  // What can be picked up on this page is worked out once it comes near.
  const { source } = page;
  const sourceIndex = page.index;
  useEffect(() => {
    if (source === null) return;
    let off = false;
    void store.textOf(source, sourceIndex).catch(() => undefined);
    void store.picturesOf(page).then((list) => !off && setPictures(list));
    void store.notesOf(page).then((list) => !off && setNotes(list));
    return () => {
      off = true;
    };
  }, [source, sourceIndex, store]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tool !== "select") setHover(null);
    if (tool !== "polygon") setDraft(null);
  }, [tool]);

  const stale = drawnKey !== null && drawnKey !== key;
  const at = (event: { clientX: number; clientY: number }) => toPage(store, page, event.clientX, event.clientY);

  // ------------------------------------------------------------ lines and shapes of the file

  const gone = useMemo(() => new Set(page.pathCuts), [page.pathCuts]);
  /** What a point of the page is on: lines within reach first, then what is filled there. */
  const unitAt = (p: Point, reach: number, linesOnly = false): Unit | null => {
    const units = store.unitsOn(page);
    let best: Unit | null = null;
    let close = reach;
    let filled: Unit | null = null;
    for (const unit of units) {
      const { box } = unit;
      if (
        p.x < box.x - reach - 3 ||
        p.y < box.y - reach - 3 ||
        p.x > box.x + box.w + reach + 3 ||
        p.y > box.y + box.h + reach + 3
      )
        continue;
      if (unit.ops.some((op) => gone.has(op)) || unit.paths.some((path) => path.pattern)) continue;
      const solid = !unit.line && unit.paths.some((path) => path.fill);
      const d = distanceTo(unit, p);
      if (solid) {
        // The one painted last is on top.
        if (d === 0 && !linesOnly) filled = unit;
      } else if (d <= close) {
        close = d;
        best = unit;
      }
    }
    return best ?? filled;
  };
  /** A line right under the pointer although a text block lies over it. */
  const lineOver = (event: { clientX: number; clientY: number }, block: Block | null): Unit | null => {
    const p = at(event);
    const unit = unitAt(p, 2.2 / zoom, true);
    if (!unit || !block || block.angle !== 0) return unit;
    const onWords = block.rows.some(
      (row) => p.y > row.y - row.size * 0.78 && p.y < row.y + row.size * 0.18 && p.x > row.x0 - 1 && p.x < row.x1 + 1,
    );
    return onWords ? null : unit;
  };

  const openUnit = (unit: Unit): { ids: string[]; done: Promise<string[]> } => {
    const had = new Set(store.page(page.id)?.objects ?? []);
    const done = store.openUnitsWithWords(page.id, [unit]);
    const ids = (store.page(page.id)?.objects ?? []).filter(
      (id) => !had.has(id) && store.doc.objects[id]?.ops?.some((op) => unit.ops.includes(op)),
    );
    return { ids, done };
  };

  const pressUnit = (event: ReactPointerEvent, unit: Unit) => {
    event.preventDefault();
    event.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const start = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    const add = event.shiftKey || event.ctrlKey || event.metaKey;
    const before = store.view.selection;
    const touch = event.pointerType === "touch";
    const keyOf = dragKey();
    setHover(null);
    let opened: string[] | null = null;
    let last = start;
    track(
      event,
      (next) => {
        last = { clientX: next.clientX, clientY: next.clientY, pointerId: next.pointerId };
        if (opened || touch || add || Math.hypot(next.clientX - start.clientX, next.clientY - start.clientY) < 4)
          return;
        opened = openUnit(unit).ids;
        if (opened.length === 0) return;
        store.select(opened);
        const moved = toPage(store, page, last.clientX, last.clientY);
        const from = toPage(store, page, start.clientX, start.clientY);
        store.patchMany(
          opened,
          (object) => ({ x: object.x + moved.x - from.x, y: object.y + moved.y - from.y }),
          keyOf,
        );
        startMove(store, page, opened, last, undefined, keyOf);
      },
      (next, cancelled) => {
        if (opened || cancelled) return;
        if (touch && Math.hypot(next.clientX - start.clientX, next.clientY - start.clientY) > 10) return;
        const { ids } = openUnit(unit);
        if (ids.length === 0) return;
        store.press = { time: performance.now(), x: start.clientX, y: start.clientY, fresh: ids[0] };
        store.select(add ? [...before, ...ids] : ids);
      },
    );
  };

  // ------------------------------------------------------------ the file's own text and pictures

  const pressBlock = (event: ReactPointerEvent, block: Block) => {
    if (event.button !== 0) return;
    // The key shown over a text moves it, whatever lies under it.
    const grip = event.target instanceof HTMLElement && event.target.closest("[data-grip]") !== null;
    const twice = doublePress(store.press, event);
    if (tool === "select" && !grip) {
      const unit = lineOver(event, block);
      if (unit) {
        pressUnit(event, unit);
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const start = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    const add = event.shiftKey || event.ctrlKey || event.metaKey;
    const cover = coverOf(store, page, block);
    const before = store.view.selection;
    /** A press that did not move: the words are picked, and typed in when pressed twice. */
    const picked = () =>
      void store.openBlock(page.id, block.key, cover).then((id) => {
        if (!id) return;
        if (add) {
          store.select([...before, id]);
          return;
        }
        if (twice || store.view.tool === "text") {
          store.caret = { x: start.clientX, y: start.clientY };
          if (store.view.tool === "text") store.setView({ tool: "select" });
          store.select([id], id);
          return;
        }
        store.press = { time: performance.now(), x: start.clientX, y: start.clientY, fresh: id };
        store.select([id]);
      });
    // Words inside a table drawn in the file: dragging picks cells, pressing twice types in one.
    if (tool === "select" && !grip && !add) {
      const box = blockBox(block);
      const grid = store.gridAt(page, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
      if (grid) {
        store.press = twice ? null : { time: performance.now(), x: event.clientX, y: event.clientY, fresh: null };
        startGridPick(store, page, event, grid, twice, picked);
        return;
      }
    }
    const keyOf = dragKey();
    let opening: Promise<string | null> | null = null;
    let last = start;
    let released = false;
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
          store.patchMany(
            [id],
            (object) => ({ x: object.x + moved.x - from.x, y: object.y + moved.y - from.y }),
            keyOf,
          );
          if (!released) startMove(store, page, [id], last, undefined, keyOf);
        });
      },
      (next, cancelled) => {
        released = true;
        if (opening || cancelled) return;
        if (next.pointerType === "touch" && Math.hypot(next.clientX - start.clientX, next.clientY - start.clientY) > 10)
          return;
        picked();
      },
    );
  };

  const pressPicture = (event: ReactPointerEvent, picture: PagePicture) => {
    if (event.button !== 0) return;
    // A picture as large as the page is a scan: it stays put unless it is asked for.
    if (picture.whole) return;
    const unit = lineOver(event, null);
    if (unit) {
      pressUnit(event, unit);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const start = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    let last = start;
    let released = false;
    const keyOf = dragKey();
    let opening: Promise<string | null> | null = null;
    const open = () => (opening ??= store.openPicture(page.id, picture));
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
          store.patchMany(
            [id],
            (object) => ({ x: object.x + moved.x - from.x, y: object.y + moved.y - from.y }),
            keyOf,
          );
          if (!released) startMove(store, page, [id], last, undefined, keyOf);
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
    let box = boxOf(a, b);
    const base = { angle: 0, opacity: 1 };
    if (kind === "link") {
      if (click) return;
      const link: LinkObject = { id: uid("l"), type: "link", ...box, ...base, url: "" };
      store.add(page.id, link);
      store.setView({ tool: "select" });
      return;
    }
    if (kind === "note") {
      const note: NoteObject = {
        id: uid("n"),
        type: "note",
        x: a.x - 10,
        y: a.y - 10,
        w: 20,
        h: 20,
        ...base,
        text: "",
        color: prefs.note,
        author: prefs.author,
        date: new Date().toISOString(),
      };
      store.add(page.id, note);
      store.setView({ tool: "select" });
      return;
    }
    if (kind === "crop") {
      if (!click && box.w > 12 && box.h > 12) store.setView({ cropArea: { page: page.id, box } });
      return;
    }
    if (kind.startsWith("field-")) {
      const type = kind.slice(6) as FieldObject["kind"];
      if (click) {
        const wh =
          type === "check" || type === "radio"
            ? { w: 16, h: 16 }
            : type === "multiline"
              ? { w: 220, h: 80 }
              : type === "sign"
                ? { w: 180, h: 46 }
                : { w: 180, h: 24 };
        box = { x: a.x, y: a.y - wh.h / 2, ...wh };
      }
      const names: Record<FieldObject["kind"], string> = {
        text: "Text",
        multiline: "Notes",
        check: "Checkbox",
        list: "List",
        radio: "Choice",
        sign: "Signature",
      };
      const fields = Object.values(store.doc.objects).filter(
        (object): object is FieldObject => object.type === "field",
      );
      const same = fields.filter((object) => object.kind === type);
      const last = same[same.length - 1];
      const field: FieldObject = {
        id: uid("f"),
        type: "field",
        kind: type,
        ...box,
        ...base,
        // Radio buttons one after the other belong together until they are told otherwise.
        name: type === "radio" && last ? last.name : `${names[type]} ${fields.length + 1}`,
        value:
          type === "radio" ? `Option ${same.filter((object) => object.name === last?.name).length + 1}` : undefined,
        options: ["Option 1", "Option 2"],
      };
      store.add(page.id, field);
      if (type !== "radio" && type !== "check") store.setView({ tool: "select" });
      return;
    }
    if (kind === "line" || kind === "arrow") {
      const line = lineBox(a, click ? { x: a.x + 110, y: a.y } : b);
      const object: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind,
        ...line,
        ...base,
        stroke: prefs.line.stroke,
        fill: null,
        width: prefs.line.width,
        dash: prefs.line.dash,
        start: prefs.line.start,
        end: kind === "arrow" && prefs.line.end === "none" ? "arrow" : prefs.line.end,
      };
      store.add(page.id, object);
      store.setView({ tool: "select" });
      return;
    }
    if (SYMBOLS.has(kind)) {
      const side = kind === "dot" ? 9 : 16;
      if (click || box.w < 5 || box.h < 5) box = { x: a.x - side / 2, y: a.y - side / 2, w: side, h: side };
      const object: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind,
        ...box,
        ...base,
        stroke: prefs.symbol,
        fill: null,
        width: Math.max(1, Math.min(box.w, box.h) * 0.12),
        dash: "solid",
      };
      // The tool stays, so a form can be ticked through.
      store.add(page.id, object, false);
      return;
    }
    if (kind === "whiteout" || kind === "redact") {
      if (click) {
        // A click takes the whole line of words under it.
        const block = (text?.blocks ?? []).find(
          (item) =>
            !page.cuts[item.key] &&
            item.angle === 0 &&
            a.x >= item.x &&
            a.x <= item.x + item.w &&
            a.y >= item.y &&
            a.y <= item.y + item.h,
        );
        const row = block?.rows.find((item) => a.y > item.y - item.size && a.y < item.y + item.size * 0.4);
        box = row
          ? { x: row.x0 - 1, y: row.y - row.size * 0.86, w: row.x1 - row.x0 + 2, h: row.size * 1.14 }
          : { x: a.x - 60, y: a.y - 12, w: 120, h: 24 };
      }
      const object: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind,
        ...box,
        ...base,
        stroke: null,
        fill: kind === "redact" ? "#000000" : (prefs.white ?? store.sample(page.id, box)),
        width: 0,
        dash: "solid",
      };
      store.add(page.id, object, false);
      return;
    }
    const shape: ShapeKind = kind.slice("shape:".length);
    const ratio = shapeDef(shape)?.ratio ?? 1.4;
    if (click) {
      const w = ratio >= 1 ? 120 : 120 * ratio;
      const h = w / ratio;
      box = { x: a.x - w / 2, y: a.y - h / 2, w, h };
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

  const finishPoly = (points: Point[], close: boolean) => {
    setDraft(null);
    if (points.length < 2) return;
    const box = bounds(points);
    const w = Math.max(0.5, box.w);
    const h = Math.max(0.5, box.h);
    const { prefs } = store.view;
    const object: PathObject = {
      id: uid("v"),
      type: "path",
      x: box.x,
      y: box.y,
      w,
      h,
      angle: 0,
      opacity: 1,
      path: [
        ...points.map((p, i): PathObject["path"][number] => [
          i === 0 ? "M" : "L",
          (p.x - box.x) / w,
          (p.y - box.y) / h,
        ]),
        ...(close && points.length > 2 ? ([["Z"]] as PathObject["path"]) : []),
      ],
      stroke: prefs.shape.stroke ?? "#1d1c1f",
      fill: close ? prefs.shape.fill : null,
      width: prefs.shape.width || 1,
      dash: [],
      cap: 1,
      join: 1,
    };
    store.add(page.id, object);
    store.setView({ tool: "select" });
  };

  // A many-sided form is closed with Enter, and left with Escape.
  const poly = draft?.kind === "poly" ? draft.points : null;
  useEffect(() => {
    if (!poly) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Enter") finishPoly(poly, false);
      else setDraft(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [poly]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ pressing the page

  /** Typing starts where the page was pressed twice: in the cell of a drawn table, or on open paper. */
  const startTyping = (p: Point) => {
    const cell = text ? ruledCell(text, page, p) : null;
    if (cell) {
      const size = store.view.prefs.text.size;
      const leading = leadingOf(store.freshStyle());
      const spot = cellSpot(cell, size, leading);
      store.addTextIn(page.id, spot.box, spot.y);
    } else store.addText(page.id, p.x, p.y);
  };

  const pressedTwice = (p: Point, reach: number) => {
    const unit = unitAt(p, reach);
    if (!unit) {
      startTyping(p);
      return;
    }
    void store.openDrawing(page.id, unit).then((ids) => {
      if (ids.length > 0) store.select(ids);
    });
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const a = at(event);
    const touch = event.pointerType === "touch";
    if (tool === "select") {
      const reach = (touch ? 10 : 4) / zoom;
      const double = doublePress(store.press, event);
      const many = event.shiftKey || event.ctrlKey || event.metaKey;
      // Inside a table drawn in the file, as in Word: drag over cells to pick them, press twice to type.
      const grid = many ? null : store.gridAt(page, a, 3 / zoom);
      if (grid) {
        if (!touch) event.preventDefault();
        store.press = double ? null : { time: performance.now(), x: event.clientX, y: event.clientY, fresh: null };
        startGridPick(store, page, event, grid, double, () => store.select([]));
        return;
      }
      const unit = double ? null : unitAt(a, reach);
      if (unit && !isPanel(unit, page)) {
        pressUnit(event, unit);
        return;
      }
      const spot = { x: event.clientX, y: event.clientY };
      const typing = store.view.editing !== null;
      store.press = double ? null : { time: performance.now(), ...spot, fresh: null };
      const kept = event.shiftKey || event.ctrlKey || event.metaKey ? store.view.selection : [];
      if (kept.length === 0) store.select([]);
      if (touch) {
        track(
          event,
          () => undefined,
          (next, cancelled) => {
            if (!cancelled && double && Math.hypot(next.clientX - spot.x, next.clientY - spot.y) < 12)
              pressedTwice(a, reach);
          },
        );
        return;
      }
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      let drawn = false;
      track(
        event,
        (next) => {
          if (!drawn && Math.hypot(next.clientX - spot.x, next.clientY - spot.y) < 5) return;
          drawn = true;
          setDraft({ kind: "box", a, b: at(next) });
        },
        (next) => {
          setDraft(null);
          if (!drawn) {
            if (double && !typing) pressedTwice(a, reach);
            return;
          }
          pickInside(boxOf(a, at(next)), kept);
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
      startTyping(a);
      return;
    }
    if (tool === "polygon") {
      const points = draft?.kind === "poly" ? draft.points : [];
      const first = points[0];
      const near = first && points.length > 2 && Math.hypot(a.x - first.x, a.y - first.y) < 9 / zoom;
      const double = points.length > 1 && doublePress(store.press, event);
      store.press = { time: performance.now(), x: event.clientX, y: event.clientY, fresh: null };
      if (near || double) {
        finishPoly(points, Boolean(near));
        return;
      }
      const last = points[points.length - 1];
      const next = event.shiftKey && last ? straighten(last, a) : a;
      setDraft({ kind: "poly", points: [...points, next], at: next });
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
    if (tool === "highlight" || tool === "underline" || tool === "strike" || tool === "squiggle") {
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
  };

  /** Everything that lies wholly inside a box dragged over the page. */
  const pickInside = (box: Box, kept: readonly string[]) => {
    const now = store.page(page.id);
    if (!now) return;
    const inside = [...new Set([...kept, ...objectsIn(store, now, box)])];
    const blocks = (store.readyText(page)?.blocks ?? []).filter(
      (block) => !now.cuts[block.key] && within(blockBox(block), box),
    );
    const cuts = new Set(now.pathCuts);
    const units = store
      .unitsOn(page)
      .filter(
        (unit) =>
          !unit.ops.some((op) => cuts.has(op)) && !unit.paths.some((path) => path.pattern) && within(unit.box, box),
      );
    const images = pictures.filter(
      (picture) => !picture.whole && !now.imageCuts.includes(picture.index) && within(pictureBox(picture), box),
    );
    if (blocks.length + units.length + images.length === 0) {
      store.select(inside);
      return;
    }
    if (units.length > 600) {
      store.say("That is too much to pick at once. Drag over a smaller part.");
      return;
    }
    void (async () => {
      const opened = [...inside];
      for (const picture of images) {
        const id = await store.openPicture(page.id, picture, true);
        if (id) opened.push(id);
      }
      opened.push(...store.openUnits(page.id, units, false));
      for (const block of blocks) {
        const id = await store.openBlock(
          page.id,
          block.key,
          coverOf(store, page, block),
          units.length + images.length > 0,
        );
        if (id) opened.push(id);
      }
      store.select(opened);
    })();
  };

  // ------------------------------------------------------------ what the pointer is over

  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const onPointerMove = (event: ReactPointerEvent) => {
    if (draft?.kind === "poly") {
      const p = at(event);
      const last = draft.points[draft.points.length - 1];
      setDraft({ ...draft, at: event.shiftKey && last ? straighten(last, p) : p });
      return;
    }
    if (tool !== "select" || event.pointerType === "touch" || event.buttons !== 0) {
      if (hover) setHover(null);
      return;
    }
    const { clientX, clientY } = event;
    const target = event.target as HTMLElement;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (target.closest?.("[data-object], [data-handle], input, textarea, select")) {
        setHover(null);
        return;
      }
      const blockKey = target.closest?.<HTMLElement>("[data-block]")?.dataset.block;
      const block = blockKey ? store.block(page, blockKey) : null;
      const spot = { clientX, clientY };
      let unit: Unit | null;
      if (block || target.closest?.("[data-picture]:not([data-whole])")) unit = lineOver(spot, block);
      else {
        unit = unitAt(at(spot), 4 / zoom);
        if (unit && isPanel(unit, page)) unit = null;
      }
      setHover(unit);
    });
  };

  const onContextMenu = (event: ReactMouseEvent) => {
    const target = event.target as HTMLElement;
    // Words being typed keep the browser's own menu, with its spelling.
    if (target.closest("[contenteditable], input, textarea, select")) return;
    event.preventDefault();
    if (tool !== "select") return;
    const p = at(event);
    const open = () => store.setView({ menu: { x: event.clientX, y: event.clientY, page: page.id, at: p } });
    const id = target.closest<HTMLElement>("[data-object]")?.dataset.object;
    if (id) {
      if (!store.view.selection.includes(id)) store.select(store.withGroups([id]));
      open();
      return;
    }
    const key = target.closest<HTMLElement>("[data-block]")?.dataset.block;
    const block = key ? store.block(page, key) : null;
    const unit = block ? lineOver(event, block) : unitAt(p, 4 / zoom);
    if (unit && !isPanel(unit, page)) {
      const { ids } = openUnit(unit);
      store.select(ids);
      open();
      return;
    }
    if (block) {
      void store.openBlock(page.id, block.key, coverOf(store, page, block)).then((made) => {
        if (made) store.select([made]);
        open();
      });
      return;
    }
    const picture = pictures.find(
      (item) => String(item.index) === target.closest<HTMLElement>("[data-picture]")?.dataset.picture,
    );
    if (picture && !picture.whole) {
      void store.openPicture(page.id, picture).then((made) => {
        if (made) store.select([made]);
        open();
      });
      return;
    }
    store.select([]);
    open();
  };

  const touchable = tool === "select" || tool === "text";
  const blocks = (text?.blocks ?? []).filter((block) => !page.cuts[block.key]);
  const { prefs } = store.view;
  const mine = selection.filter((id) => page.objects.includes(id));
  const box = pageBox(page);
  const clip: CSSProperties = page.box
    ? {
        clipPath: `inset(${box.y}px ${page.w - box.x - box.w}px ${page.h - box.y - box.h}px ${box.x}px)`,
      }
    : {};
  const inner = page.margin ? marginBox(page) : null;
  const hits = find.open ? find.hits.filter((hit) => hit.page === page.id) : [];
  const current = find.open ? find.hits[find.at] : undefined;
  const px = (value: number) => `calc(${value}px / var(--z))`;

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: tool === "select" ? "manipulation" : "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        cancelAnimationFrame(frame.current);
        setHover(null);
      }}
      onContextMenu={onContextMenu}
    >
      <div
        className="absolute left-0 top-0"
        style={
          {
            width: page.w,
            height: page.h,
            transformOrigin: "0 0",
            transform: shownCss(page, zoom),
            cursor: CURSORS[tool] ?? (tool === "select" ? (hover ? "move" : "default") : "crosshair"),
            "--z": zoom,
          } as CSSProperties
        }
      >
        <div className="absolute inset-0" style={clip}>
          <Backdrop store={store} page={page} zoom={zoom} queue={queue} onKey={setDrawnKey} />

          {showGrid ? (
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                backgroundImage:
                  "linear-gradient(to right, rgba(29,28,31,0.13) 1px, transparent 1px), linear-gradient(to bottom, rgba(29,28,31,0.13) 1px, transparent 1px)",
                backgroundSize: `${GRID}px ${GRID}px`,
                backgroundPosition: `${-box.x % GRID}px ${-box.y % GRID}px`,
              }}
            />
          ) : null}
          {showMargins && inner ? (
            <span
              aria-hidden
              data-margin-guide
              className="pointer-events-none absolute"
              style={{
                left: inner.x,
                top: inner.y,
                width: inner.w,
                height: inner.h,
                outline: `${px(1)} dashed rgba(28,111,179,0.4)`,
              }}
            />
          ) : null}

          {/* What the file itself holds, ready to be picked up */}
          {touchable ? (
            <div className="absolute inset-0">
              {pictures
                .filter((picture) => !page.imageCuts.includes(picture.index) && tool === "select")
                .map((picture) => (
                  <div
                    key={picture.index}
                    data-picture={picture.index}
                    data-whole={picture.whole || undefined}
                    onPointerDown={(event) => pressPicture(event, picture)}
                    className={`absolute left-0 top-0 ${picture.whole ? "" : `cursor-move ${hover ? "" : "hover:shadow-[0_0_0_calc(2px/var(--z))_#f2552c]"}`}`}
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
                  className={`group/move absolute cursor-move ${hover ? "" : "hover:bg-accent/[0.07] hover:shadow-[0_0_0_calc(1.5px/var(--z))_#f2552c]"}`}
                  style={boxStyle(block)}
                >
                  {tool === "select" && !hover ? <HoverMove /> : null}
                </div>
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
            {hits.map((hit, i) =>
              hit.spots.map((spot, k) => (
                <span
                  key={`${i}-${k}`}
                  data-hit={hit === current ? "current" : "other"}
                  className="absolute left-0 top-0"
                  style={{
                    width: spot.w,
                    height: spot.h,
                    transformOrigin: "0 0",
                    transform: `translate(${spot.x}px, ${spot.y}px) rotate(${spot.angle}deg)`,
                    background: hit === current ? "rgba(242,85,44,0.55)" : "rgba(255,210,63,0.6)",
                  }}
                />
              )),
            )}
          </div>
          <DecorLayer store={store} page={page} index={index} count={count} />
        </div>

        <div className="pointer-events-none absolute inset-0">
          {hover && !gone.has(hover.ops[0]) ? <UnitOutline unit={hover} /> : null}
          {draft ? <DraftView draft={draft} tool={tool} store={store} pageId={page.id} /> : null}
          {current?.page === page.id
            ? current.spots.map((spot, k) => (
                <span
                  key={k}
                  className="absolute left-0 top-0"
                  style={{
                    width: spot.w,
                    height: spot.h,
                    transformOrigin: "0 0",
                    transform: `translate(${spot.x}px, ${spot.y}px) rotate(${spot.angle}deg)`,
                    boxShadow: `0 0 0 ${px(2)} #f2552c`,
                  }}
                />
              ))
            : null}
          {guides && guides.x !== null ? (
            <span className="absolute bg-accent" style={{ left: guides.x, top: box.y, width: px(1), height: box.h }} />
          ) : null}
          {guides && guides.y !== null ? (
            <span className="absolute bg-accent" style={{ top: guides.y, left: box.x, height: px(1), width: box.w }} />
          ) : null}
          {mine.map((id) => (
            <Frame key={id} store={store} page={page} id={id} alone={selection.length === 1} editing={editing === id} />
          ))}
          {mine.length > 1 && mine.length === selection.length ? (
            <ManyFrame store={store} page={page} ids={mine} />
          ) : null}
          {cropArea ? <CropArea store={store} page={page} box={cropArea} /> : null}
        </div>
      </div>
    </div>
  );
});

/** A line or shape of the file the pointer is over. */
function UnitOutline({ unit }: { unit: Unit }) {
  if (unit.line) {
    const { x0, y0, x1, y1, width } = unit.line;
    return (
      <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible" aria-hidden>
        <path
          data-unit-hover
          d={`M${x0} ${y0}L${x1} ${y1}`}
          stroke="#f2552c"
          fill="none"
          style={{ strokeWidth: `max(${width}px, calc(2.5px / var(--z)))` }}
        />
      </svg>
    );
  }
  return (
    <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible" aria-hidden>
      {unit.paths.map((path) => (
        <path
          key={path.op}
          data-unit-hover
          d={toSvg(path.path)}
          stroke="#f2552c"
          fill={path.fill ? "rgba(242,85,44,0.10)" : "none"}
          style={{ strokeWidth: `calc(2px / var(--z))` }}
        />
      ))}
    </svg>
  );
}

/** Room for a page. The page itself is only there while it is near the screen. */
export const PageView = memo(function PageView({
  store,
  page,
  index,
  count,
  zoom,
  queue,
  near,
}: {
  store: EditorStore;
  page: Page;
  index: number;
  count: number;
  zoom: number;
  queue: RenderQueue;
  near: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const size = shownSize(page);
  const rulers = useEditor(store, (s) => s.view.prefs.rulers);
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
      aria-label={`Page ${index + 1}`}
      className="relative shrink-0 shadow-[0_0_0_1px_rgba(24,24,27,0.2)]"
      style={{ width: size.w * zoom, height: size.h * zoom, background: page.paper ?? "#ffffff" }}
    >
      {near ? <PageBody store={store} page={page} index={index} count={count} zoom={zoom} queue={queue} /> : null}
      {near && rulers ? <Rulers store={store} page={page} zoom={zoom} /> : null}
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
    if (!MARKING.has(tool) || tool === "highlight") return null;
    const kind = tool as "underline" | "strike" | "squiggle";
    return (
      <>
        {draft.rects.map((rect, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: rect.x,
              top: rect.y + rect.h * (kind === "strike" ? 0.54 : 0.93),
              width: rect.w,
              height: Math.max(0.6, rect.h * 0.06),
              background: prefs.mark[kind],
            }}
          />
        ))}
      </>
    );
  }
  if (draft.kind === "poly") {
    const [first, ...rest] = draft.points;
    return (
      <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible" aria-hidden>
        <path
          d={`M${first.x} ${first.y}${rest.map((p) => `L${p.x} ${p.y}`).join("")}L${draft.at.x} ${draft.at.y}`}
          fill="none"
          stroke={prefs.shape.stroke ?? "#1d1c1f"}
          strokeWidth={prefs.shape.width || 1}
          strokeLinejoin="round"
        />
        {draft.points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            fill="#ffffff"
            stroke="#1d1c1f"
            style={{ r: "calc(4px / var(--z))", strokeWidth: "calc(1.5px / var(--z))" }}
          />
        ))}
      </svg>
    );
  }
  if (draft.kind === "line") {
    return (
      <svg width="1" height="1" className="absolute left-0 top-0 overflow-visible" aria-hidden>
        <path
          d={`M${draft.a.x} ${draft.a.y}L${draft.b.x} ${draft.b.y}`}
          stroke={prefs.line.stroke}
          strokeWidth={prefs.line.width}
          strokeDasharray={prefs.line.dash === "solid" ? undefined : `${prefs.line.width * 3} ${prefs.line.width * 2}`}
        />
      </svg>
    );
  }
  const own = boxOf(draft.a, draft.b);
  const box = { left: own.x, top: own.y, width: own.w, height: own.h };
  if (tool.startsWith("shape:")) {
    const shape: ShapeObject = {
      id: "draft",
      type: "shape",
      kind: tool.slice("shape:".length),
      ...own,
      angle: 0,
      opacity: 1,
      ...prefs.shape,
    };
    return (
      <span className="absolute block" style={box}>
        <Parts parts={shapeParts(shape)} w={own.w} h={own.h} />
      </span>
    );
  }
  if (tool === "whiteout" || tool === "redact")
    return (
      <span
        className="absolute"
        style={{
          ...box,
          background: tool === "redact" ? "#000000" : (prefs.white ?? store.sample(pageId, own)),
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
