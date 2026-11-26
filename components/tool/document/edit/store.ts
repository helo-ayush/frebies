"use client";

import { useSyncExternalStore } from "react";
import type { PDFDocument as LibDocument } from "pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { forgetPdfFonts, pdfFont, registerLibrary, type PdfFont } from "./engine/fonts";
import { UNCUT, cutKey, cutsOf, hasCuts } from "./engine/cuts";
import { firstBaseline, readText as readPageText, type Block, type PageText } from "./engine/extract";
import { matchesIn, spotsInBlock, spotsInText, type FindHow, type Match, type Spot } from "./engine/find";
import { PAPERS, detectMargin, type Unit as Measure } from "./engine/margins";
import { localOf } from "./engine/paragraphs";
import { renderClear } from "./engine/render";
import { planRoom, type RoomItem } from "./engine/room";
import { layTable, setCell, type Area } from "./engine/table";
import { wordsBox } from "./engine/shape-text";
import { gridOf, stripeOf, touching, unitsOf, type Unit } from "./engine/vectors";
import {
  apply,
  bounds,
  corners,
  intersect,
  invert,
  mul,
  objectBounds,
  placement,
  turnAbout,
  type Box,
  type Matrix,
  type Point,
} from "./engine/matrix";
import type { PageTree } from "./engine/content";
import { flowLines, linesOf, measureBox, paraSize, type Laid } from "./engine/text-dom";
import {
  DEFAULT_STYLE,
  allParas,
  editBody,
  listMarks,
  marginBox,
  pageBox,
  pageOf,
  paraAt,
  paraOf,
  plainText,
  replaceText,
  shownSize,
  sliceRuns,
  tidyParas,
  tidyRuns,
  uid,
  type Asset,
  type BodyEdit,
  type Cell,
  type Dash,
  type DocState,
  type EditObject,
  type Head,
  type ImageObject,
  type LinkObject,
  type Margin,
  type Page,
  type Para,
  type PathObject,
  type ShapeKind,
  type ShapeObject,
  type Source,
  type Style,
  type TableObject,
  type TextBody,
  type TextObject,
  type Tool,
} from "./model";

export type Prefs = {
  text: Style;
  pen: { color: string; width: number };
  marker: { color: string; width: number };
  shape: { stroke: string | null; fill: string | null; width: number; dash: Dash };
  line: { stroke: string; width: number; dash: Dash; start: Head; end: Head };
  mark: { highlight: string; underline: string; strike: string; squiggle: string };
  /** What erasing leaves: a colour, or null for whatever is around it. */
  white: string | null;
  symbol: string;
  note: string;
  author: string;
  unit: Measure;
  /** "1. " becomes a list, "->" an arrow. */
  auto: boolean;
  spell: boolean;
  /** Text that grows moves what is below it. */
  room: boolean;
  margins: boolean;
  rulers: boolean;
  grid: boolean;
};

export type CellAt = { r: number; c: number };

export type View = {
  tool: Tool;
  selection: string[];
  editing: string | null;
  /** The cell being typed in, in a table. */
  cell: CellAt | null;
  /** Cells picked in a table. */
  area: Area | null;
  /** The picture being cropped. */
  crop: string | null;
  /** What would be left of a page, while that is being set. */
  cropArea: { page: string; box: Box } | null;
  /** Characters selected inside the text being edited. */
  range: { from: number; to: number } | null;
  /** Style for the next letters typed. */
  pending: Style | null;
  zoom: number;
  fit: "width" | "page" | null;
  /** The page most in view. */
  page: string | null;
  /** Pages picked in the rail. */
  marked: string[];
  prefs: Prefs;
  busy: { label: string; progress: number | null } | null;
  error: string | null;
  /** Said once, quietly. */
  note: { text: string; n: number } | null;
  opening: boolean;
  dirty: boolean;
  saved: number;
  find: { open: boolean; query: string; how: FindHow; hits: Hit[]; at: number; searching: boolean };
  guides: { page: string; x: number | null; y: number | null } | null;
  /** Scroll this into view once. */
  goTo: { page: string; box?: Box; n: number } | null;
  /** The look picked up by the format painter. */
  painter: { style: Style; para: Para | null } | null;
  /** The menu under the pointer. */
  menu: { x: number; y: number; page: string; at: Point } | null;
  /** The kind of file the download makes. */
  format: Format;
};

export type Format = "pdf" | "docx" | "odt" | "rtf" | "pptx" | "xlsx" | "png" | "jpg" | "webp" | "html" | "md" | "txt";

export type Hit = {
  page: string;
  block?: string;
  object?: string;
  cell?: CellAt;
  match: Match;
  /** Which of the matches in its text this is. */
  nth: number;
  spots: Spot[];
};

export type PagePicture = {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  flip: boolean;
  /** Part of the picture the page lets through. */
  crop: { x: number; y: number; w: number; h: number } | null;
  whole: boolean;
};

export type PageLink = { place: number; box: Box; url: string; dest: unknown };
export type PageField = {
  name: string;
  kind: "text" | "multiline" | "check" | "radio" | "list";
  box: Box;
  value: string | boolean;
  /** Radio buttons: the value this one stands for. */
  option?: string;
  options: string[];
  readOnly: boolean;
  size: number;
};

const EMPTY: DocState = { pages: [], objects: {}, values: {} };

const PREFS: Prefs = {
  text: DEFAULT_STYLE,
  pen: { color: "#1d1c1f", width: 2 },
  marker: { color: "#ffd23f", width: 14 },
  shape: { stroke: "#f2552c", fill: null, width: 2, dash: "solid" },
  line: { stroke: "#1d1c1f", width: 1.5, dash: "solid", start: "none", end: "none" },
  mark: { highlight: "#ffd23f", underline: "#f2552c", strike: "#d8431b", squiggle: "#d8431b" },
  white: null,
  symbol: "#1d1c1f",
  note: "#ffd23f",
  author: "",
  unit: "cm",
  auto: true,
  spell: false,
  room: true,
  margins: true,
  rulers: false,
  grid: false,
};

const VIEW: View = {
  tool: "select",
  selection: [],
  editing: null,
  cell: null,
  area: null,
  crop: null,
  cropArea: null,
  range: null,
  pending: null,
  zoom: 1,
  fit: "width",
  page: null,
  marked: [],
  prefs: PREFS,
  busy: null,
  error: null,
  note: null,
  opening: false,
  dirty: false,
  saved: 0,
  find: { open: false, query: "", how: { matchCase: false, whole: false }, hits: [], at: 0, searching: false },
  guides: null,
  goTo: null,
  painter: null,
  menu: null,
  format: "pdf",
};

const A4 = { w: PAPERS[0].w, h: PAPERS[0].h };
const HISTORY = 150;
const KEPT_TEXTS = 90;
const KEPT_PREFS = ["unit", "auto", "spell", "room", "margins", "rulers", "grid", "author"] as const;
const PREFS_KEY = "frebies:pdf-editor";

type Entry = { doc: DocState; key: string | null; time: number };
type Backdrop = { key: string; job: Promise<{ page: PDFPageProxy; pdf: PDFDocumentProxy | null } | null> };

export class EditError extends Error {}

export class EditorStore {
  doc: DocState = EMPTY;
  view: View = VIEW;
  sources = new Map<string, Source>();
  assets = new Map<string, Asset>();
  primary: string | null = null;
  name = "document";
  /** What kind of file was opened, and the kind it is best saved as. Null for a new document. */
  origin: Origin | null = null;

  /** Elements of the pages on screen, and what is drawn on them. */
  readonly sheets = new Map<string, HTMLElement>();
  readonly canvases = new Map<string, { canvas: HTMLCanvasElement; scale: number }>();
  /** What the pages scroll in. */
  scroller: HTMLElement | null = null;
  /** Where to put the caret when a text opens. */
  caret: { x: number; y: number } | null = null;
  /** The last press, to tell two in a row from one. `fresh`: what that press picked. */
  press: { time: number; x: number; y: number; fresh: string | null } | null = null;
  /** A handle is being dragged: sizes change because of that, not because of the words. */
  dragging = false;

  private past: Entry[] = [];
  private future: DocState[] = [];
  /** The document as it was before a block was merely opened. */
  private base: DocState | null = null;
  /** The document as undo or redo left it. */
  private jumped: DocState | null = null;
  private listeners = new Set<() => void>();
  private texts = new Map<string, Promise<PageText>>();
  private textNow = new Map<string, PageText>();
  private libs = new Map<string, Promise<LibDocument>>();
  private bare = new Map<
    string,
    Promise<{ doc: LibDocument; page: ReturnType<LibDocument["getPage"]>; tree: PageTree }>
  >();
  private backdrops = new Map<string, Backdrop>();
  private pictures = new Map<string, Promise<PagePicture[]>>();
  private picturesNow = new Map<string, PagePicture[]>();
  private units = new WeakMap<PageText, Unit[]>();
  private grids = new WeakMap<PageText, Grid[]>();
  private notes = new Map<string, Promise<{ links: PageLink[]; fields: PageField[] }>>();
  private clip: { objects: EditObject[]; page: string } | null = null;
  /** What was put on the clipboard with it, to know it again. */
  clipText = "";
  /** Words copied out of a text, with their looks. */
  words: { text: string; body: BodyEdit } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private counter = 0;
  private patchCanvas: HTMLCanvasElement | null = null;
  /** Texts that grew and have not made room yet, as they were before. */
  private growing = new Map<string, Box>();
  private roomJob: Promise<void> | null = null;
  /** What moves with the text being typed, and where it was before. */
  private room: { id: string; page: string; box: Box; base: Map<string, number>; at: number } | null = null;

  constructor() {
    try {
      const kept = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
      const prefs = { ...PREFS };
      for (const key of KEPT_PREFS) if (kept[key] !== undefined) Object.assign(prefs, { [key]: kept[key] });
      this.view = { ...VIEW, prefs };
    } catch {
      // Not in a browser yet, or storage is blocked.
    }
  }

  // -------------------------------------------------------------- reading

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  setView(patch: Partial<View>) {
    this.view = { ...this.view, ...patch };
    this.emit();
  }

  setPrefs(patch: Partial<Prefs>) {
    this.setView({ prefs: { ...this.view.prefs, ...patch } });
    if (KEPT_PREFS.some((key) => key in patch)) {
      try {
        const kept = Object.fromEntries(KEPT_PREFS.map((key) => [key, this.view.prefs[key]]));
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(kept));
      } catch {
        // Blocked storage: they last as long as the page.
      }
    }
  }

  say(text: string) {
    this.setView({ note: { text, n: ++this.counter } });
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  page(id: string): Page | null {
    return this.doc.pages.find((page) => page.id === id) ?? null;
  }

  /** The page the visitor is on. */
  get here(): Page | null {
    return this.page(this.view.page ?? "") ?? this.doc.pages[0] ?? null;
  }

  // -------------------------------------------------------------- changing

  /** One step of history. Steps with the same key close together become one. */
  commit(change: (doc: DocState) => DocState, key: string | null = null) {
    const before = this.base ?? this.doc;
    const next = change(this.doc);
    if (next === this.doc) return;
    const last = this.past[this.past.length - 1];
    const now = Date.now();
    // A drag is one step however long it takes.
    const merge = key !== null && last?.key === key && (key.startsWith("drag:") || now - last.time < 900) && !this.base;
    // Moved by hand: what made room before stays where it is now.
    if (key === "nudge" || key?.startsWith("drag:")) this.room = null;
    if (!merge) {
      this.past.push({ doc: before, key, time: now });
      if (this.past.length > HISTORY) this.past.shift();
    } else if (last) last.time = now;
    this.base = null;
    this.future = [];
    this.doc = next;
    this.view = { ...this.view, dirty: true };
    this.emit();
  }

  /** Part of the step before it: what a change brings along. */
  private follow(change: (doc: DocState) => DocState) {
    const next = change(this.doc);
    if (next === this.doc) return;
    const last = this.past[this.past.length - 1];
    if (last) last.time = Date.now();
    this.doc = next;
    this.emit();
  }

  /** A change that is not the visitor's: opening a block, measuring. */
  silent(change: (doc: DocState) => DocState, opening = false) {
    const next = change(this.doc);
    if (next === this.doc) return;
    if (opening) this.base ??= this.doc;
    this.doc = next;
    this.emit();
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push(this.doc);
    this.base = null;
    this.doc = entry.doc;
    this.afterJump();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ doc: this.doc, key: null, time: 0 });
    this.base = null;
    this.doc = next;
    this.afterJump();
  }

  private afterJump() {
    const has = (id: string) => Boolean(this.doc.objects[id]);
    const editing = this.view.editing && has(this.view.editing) ? this.view.editing : null;
    const body = editing ? this.bodyOf(editing, this.view.cell) : null;
    const length = body ? plainText(body.runs).length : 0;
    const range = this.view.range;
    this.room = null;
    this.growing.clear();
    this.jumped = this.doc;
    this.view = {
      ...this.view,
      dirty: true,
      selection: this.view.selection.filter(has),
      crop: null,
      editing: body ? editing : null,
      cell: body ? this.view.cell : null,
      area: null,
      range: body && range ? { from: Math.min(range.from, length), to: Math.min(range.to, length) } : null,
      pending: null,
      marked: this.view.marked.filter((id) => this.doc.pages.some((page) => page.id === id)),
    };
    if (!this.doc.pages.some((page) => page.id === this.view.page))
      this.view = { ...this.view, page: this.doc.pages[0]?.id ?? null };
    this.emit();
  }

  patch<T extends EditObject>(id: string, patch: Partial<T> | ((object: T) => Partial<T>), key: string | null = null) {
    this.commit((doc) => this.patched(doc, id, patch), key);
  }

  patched<T extends EditObject>(doc: DocState, id: string, patch: Partial<T> | ((object: T) => Partial<T>)): DocState {
    const object = doc.objects[id] as T | undefined;
    if (!object) return doc;
    const change = typeof patch === "function" ? patch(object) : patch;
    const next = { ...object, ...change, pristine: undefined } as T;
    // Moved somewhere else: there it may be as wide as that place allows.
    if (
      next.type === "text" &&
      object.type === "text" &&
      !next.wrap &&
      Math.abs(next.x - object.x) > 0.5 &&
      !("max" in change)
    ) {
      const page = pageOf(doc, id);
      if (page && next.angle === 0) (next as TextObject).max = roomRight(page, next.x);
    }
    const objects = { ...doc.objects, [id]: next };
    for (const mate of object.mates ?? [])
      if (objects[mate]?.pristine) objects[mate] = { ...objects[mate], pristine: undefined };
    return { ...doc, objects };
  }

  patchMany(ids: readonly string[], patch: (object: EditObject) => Partial<EditObject>, key: string | null = null) {
    this.commit(
      (doc) =>
        ids.reduce((next, id) => this.patched(next, id, patch as (object: EditObject) => Partial<EditObject>), doc),
      key,
    );
  }

  add(pageId: string, object: EditObject, select = true, key: string | null = null) {
    this.commit(
      (doc) => ({
        ...doc,
        objects: { ...doc.objects, [object.id]: object },
        pages: doc.pages.map((page) =>
          page.id === pageId ? { ...page, objects: [...page.objects, object.id] } : page,
        ),
      }),
      key,
    );
    if (select) this.select([object.id]);
  }

  // -------------------------------------------------------------- choosing

  /** Everything of the same groups. */
  withGroups(ids: readonly string[]): string[] {
    const groups = new Set(
      ids.map((id) => this.doc.objects[id]?.group).filter((group): group is string => Boolean(group)),
    );
    if (groups.size === 0) return [...ids];
    const out = new Set(ids);
    for (const object of Object.values(this.doc.objects))
      if (object.group && groups.has(object.group)) out.add(object.id);
    return [...out];
  }

  select(ids: string[], editing: string | null = null, cell: CellAt | null = null) {
    const keep = new Set(ids);
    if (editing) keep.add(editing);
    for (const id of [...keep]) for (const mate of this.doc.objects[id]?.mates ?? []) keep.add(mate);
    this.settle(keep);
    if (this.room && this.room.id !== editing) this.room = null;
    const now = this.view;
    const sameCell = now.cell?.r === cell?.r && now.cell?.c === cell?.c;
    if (
      now.editing === editing &&
      sameCell &&
      now.area === null &&
      now.selection.length === ids.length &&
      ids.every((id, i) => id === now.selection[i])
    )
      return;
    this.setView({ selection: ids, editing, cell, area: null, crop: null, range: null, pending: null });
  }

  /** Cells of a table, without a caret in any of them. */
  pickCells(id: string, area: Area | null) {
    this.setView({ selection: [id], editing: null, cell: null, area, range: null, pending: null });
  }

  setTool(tool: Tool) {
    if (tool !== "select") this.select([]);
    this.setView({ tool, painter: null, cropArea: null });
  }

  /** What was opened and left as it was goes back to being the page's own; empty text goes. */
  private settle(keep: ReadonlySet<string>) {
    const empty: string[] = [];
    for (const object of Object.values(this.doc.objects)) {
      if (object.type !== "text" || object.pristine || keep.has(object.id) || object.flow) continue;
      if (plainText(object.runs).trim() === "" && !object.fill) empty.push(object.id);
    }
    const left = withoutPristine(this.doc, keep);
    if (left !== this.doc) {
      this.doc = left;
      // Others may still be open: their "before" is this document without them.
      const open = Object.values(this.doc.objects).some((object) => object.pristine);
      this.base = open ? withoutPristine(this.doc) : null;
      this.emit();
    }
    if (empty.length > 0) this.silent((doc) => removeObjects(doc, new Set(empty)));
  }

  remove(ids: readonly string[]) {
    const free = ids.filter((id) => !this.doc.objects[id]?.lock);
    if (free.length === 0) return;
    this.commit((doc) =>
      removeObjects(
        free.reduce((next, id) => this.patched(next, id, {}), doc),
        new Set(free),
      ),
    );
    this.setView({ selection: [], editing: null, cell: null, area: null, crop: null, range: null });
  }

  order(ids: readonly string[], where: "front" | "back" | "up" | "down") {
    const set = new Set(ids);
    this.commit((doc) => ({
      ...doc,
      pages: doc.pages.map((page) => {
        const mine = page.objects.filter((id) => set.has(id));
        if (mine.length === 0) return page;
        const rest = page.objects.filter((id) => !set.has(id));
        if (where === "front") return { ...page, objects: [...rest, ...mine] };
        if (where === "back") return { ...page, objects: [...mine, ...rest] };
        const list = [...page.objects];
        const order = where === "up" ? [...mine].reverse() : mine;
        for (const id of order) {
          const at = list.indexOf(id);
          const to = where === "up" ? at + 1 : at - 1;
          if (to < 0 || to >= list.length || set.has(list[to])) continue;
          [list[at], list[to]] = [list[to], list[at]];
        }
        return { ...page, objects: list };
      }),
    }));
  }

  copy(ids: readonly string[]) {
    const objects = ids.map((id) => this.doc.objects[id]).filter((object): object is EditObject => Boolean(object));
    if (objects.length === 0) return;
    const page = pageOf(this.doc, objects[0].id);
    this.clip = { objects, page: page?.id ?? "" };
    const text = objects.map(wordsOf).filter(Boolean).join("\n");
    this.clipText = text || " ";
    void navigator.clipboard?.writeText(this.clipText).catch(() => undefined);
  }

  get hasClip() {
    return this.clip !== null;
  }

  paste(pageId: string | null, objects = this.clip?.objects ?? [], nudge = 12) {
    const page = (pageId && this.page(pageId)) || this.doc.pages[0];
    if (!page || objects.length === 0) return;
    const groups = new Map<string, string>();
    const box = pageBox(page);
    const made = objects.map((object): EditObject => {
      const copy = { ...object, id: uid("o"), x: object.x + nudge, y: object.y + nudge } as EditObject;
      if (copy.type === "text") {
        delete copy.block;
        delete copy.flow;
        delete copy.cont;
      }
      delete copy.pristine;
      delete copy.ops;
      delete copy.mates;
      if (copy.group) {
        if (!groups.has(copy.group)) groups.set(copy.group, uid("g"));
        copy.group = groups.get(copy.group);
      }
      copy.x = Math.min(Math.max(copy.x, box.x - copy.w + 20), box.x + box.w - 20);
      copy.y = Math.min(Math.max(copy.y, box.y - copy.h + 20), box.y + box.h - 20);
      return copy;
    });
    this.commit((doc) => ({
      ...doc,
      objects: { ...doc.objects, ...Object.fromEntries(made.map((object) => [object.id, object])) },
      pages: doc.pages.map((item) =>
        item.id === page.id ? { ...item, objects: [...item.objects, ...made.map((object) => object.id)] } : item,
      ),
    }));
    this.select(made.map((object) => object.id));
  }

  /** Words from elsewhere, as a text of their own. */
  pasteText(pageId: string, x: number, y: number, text: string) {
    const page = this.page(pageId);
    if (!page) return;
    const style = this.freshStyle();
    const leading = leadingOf(style);
    const long = text.length > 60 || text.includes("\n");
    const box = marginBox(page);
    const w = long ? Math.min(380, box.w) : 10;
    const left = long ? Math.min(Math.max(box.x, x - w / 2), box.x + box.w - w) : Math.max(box.x, x - 60);
    const object: TextObject = {
      id: uid("t"),
      type: "text",
      x: left,
      y,
      w,
      h: leading,
      angle: 0,
      opacity: 1,
      runs: [{ text, style }],
      align: "left",
      leading,
      wrap: long,
      max: long ? undefined : roomRight(page, left),
    };
    this.setView({ tool: "select" });
    this.add(page.id, object);
  }

  rename(name: string) {
    this.name = name;
    this.emit();
  }

  duplicate(ids: readonly string[]) {
    const objects = ids.map((id) => this.doc.objects[id]).filter((object): object is EditObject => Boolean(object));
    const page = objects[0] ? pageOf(this.doc, objects[0].id) : null;
    if (page) this.paste(page.id, objects);
  }

  /** Puts objects on another page. */
  moveToPage(ids: readonly string[], pageId: string, shift: { x: number; y: number }, key: string | null = null) {
    const set = new Set(ids);
    this.commit((doc) => {
      let next = doc;
      for (const id of ids)
        next = this.patched(next, id, (object) => ({ x: object.x + shift.x, y: object.y + shift.y }));
      return {
        ...next,
        pages: next.pages.map((page) => {
          const rest = page.objects.filter((id) => !set.has(id));
          if (page.id === pageId) return { ...page, objects: [...rest, ...ids] };
          return rest.length === page.objects.length ? page : { ...page, objects: rest };
        }),
      };
    }, key);
  }

  rotateObject(id: string, angle: number, key: string | null = null) {
    this.patch(id, (object) => turnAbout(object, angle), key);
  }

  // -------------------------------------------------------------- text

  bodyOf(id: string, cell: CellAt | null): TextBody | null {
    return bodyIn(this.doc.objects[id], cell);
  }

  /** Changes the words of a text box, a shape or a table cell. */
  setBody(id: string, cell: CellAt | null, patch: Partial<TextBody>, key: string | null = null) {
    this.commit((doc) => this.withBody(doc, id, cell, patch), key);
  }

  withBody(doc: DocState, id: string, cell: CellAt | null, patch: Partial<TextBody>): DocState {
    return this.patched<EditObject>(doc, id, (object) => {
      if (object.type === "text") return patch as Partial<TextObject>;
      if (object.type === "shape")
        return { text: { ...shapeText(object, this.freshStyle()), ...patch } } as Partial<ShapeObject>;
      if (object.type === "table" && cell) return setCell(object, cell.r, cell.c, patch as Partial<Cell>);
      return {};
    });
  }

  /** What typing made of a text, and where its caret is now. */
  type(id: string, cell: CellAt | null, next: BodyEdit & { from: number; to: number }, key: string | null) {
    this.view = { ...this.view, range: { from: next.from, to: next.to }, pending: null };
    this.commit((doc) => this.withBody(doc, id, cell, { runs: next.runs, paras: next.paras }), key);
  }

  /** The look of text that is about to be written. */
  freshStyle(): Style {
    return { ...this.view.prefs.text, tracking: 0, rise: 0, script: undefined, link: undefined, back: undefined };
  }

  /** Starts a text where it was asked for. It may run to the right margin before it wraps. */
  addText(pageId: string, x: number, y: number) {
    const page = this.page(pageId);
    const style = this.freshStyle();
    const leading = leadingOf(style);
    const box = page ? marginBox(page) : null;
    // Near the left margin means at it.
    const left = box && page?.margin && x < box.x + 14 && x > box.x - 60 ? box.x : x;
    const object: TextObject = {
      id: uid("t"),
      type: "text",
      x: left,
      y: y - leading / 2,
      w: 10,
      h: leading,
      angle: 0,
      opacity: 1,
      runs: [{ text: "", style }],
      align: "left",
      leading,
      wrap: false,
      max: page ? roomRight(page, left) : undefined,
    };
    this.add(pageId, object, false);
    this.setView({ tool: "select" });
    this.select([object.id], object.id);
    return object.id;
  }

  /** A text as wide as a box: for typing into the cell of a drawn table, for one. */
  addTextIn(pageId: string, box: Box, y: number) {
    const style = this.freshStyle();
    const leading = leadingOf(style);
    const object: TextObject = {
      id: uid("t"),
      type: "text",
      x: box.x,
      y: Math.max(box.y, Math.min(box.y + box.h - leading, y - leading / 2)),
      w: box.w,
      h: leading,
      angle: 0,
      opacity: 1,
      runs: [{ text: "", style }],
      align: "left",
      leading,
      wrap: true,
    };
    this.add(pageId, object, false);
    this.setView({ tool: "select" });
    this.select([object.id], object.id);
  }

  // -------------------------------------------------------------- sizes that follow the words

  /** The words asked for another size: the box takes it, and what is below makes room. */
  grow(id: string, w: number, h: number) {
    const object = this.doc.objects[id];
    if (object?.type !== "text" && object?.type !== "table") return;
    const before = { x: object.x, y: object.y, w: object.w, h: object.h };
    let change: Partial<EditObject> = { w, h };
    if (object.type === "text" && !object.wrap) {
      // Centred words grow to both sides, right-aligned ones to the left.
      const by = object.align === "center" ? (object.w - w) / 2 : object.align === "right" ? object.w - w : 0;
      if (by) {
        const at = apply(placement(object.x, object.y, object.angle), by, 0);
        change = { ...change, x: at.x, y: at.y } as Partial<EditObject>;
      }
    }
    this.silent((doc) => {
      const now = doc.objects[id];
      return now ? { ...doc, objects: { ...doc.objects, [id]: { ...now, ...change } as EditObject } } : doc;
    });
    if (Math.abs(h - before.h) >= 0.5) this.afterGrow(id, before);
  }

  /** Something grew because of what was typed in it: text goes on over the page, what is below moves. */
  afterGrow(id: string, before: Box) {
    const object = this.doc.objects[id];
    if (!object || this.dragging || object.angle !== 0 || this.doc === this.jumped) return;
    const entry = this.past[this.past.length - 1];
    if (this.base || !entry || Date.now() - entry.time > 1500) return;
    if (object.type === "text" && this.flowOver(id)) return;
    if (!this.view.prefs.room) return;
    if (!this.growing.has(id)) this.growing.set(id, before);
    // One after the other, from the top: what the first one moves has its own turn later.
    this.roomJob ??= Promise.resolve()
      .then(async () => {
        while (this.growing.size > 0) {
          const ids = [...this.growing.keys()].sort(
            (a, b) => (this.doc.objects[a]?.y ?? 0) - (this.doc.objects[b]?.y ?? 0),
          );
          const [next] = ids;
          const box = this.growing.get(next);
          this.growing.delete(next);
          if (box) await this.makeRoom(next, box);
        }
      })
      .finally(() => {
        this.roomJob = null;
      });
  }

  private async makeRoom(id: string, before: Box) {
    const object = this.doc.objects[id];
    const page = object ? pageOf(this.doc, id) : null;
    if (!object || !page) return;
    if (!this.room || this.room.id !== id) this.room = { id, page: page.id, box: before, base: new Map(), at: 0 };
    const room = this.room;
    const turnNo = ++room.at;
    const entry = this.past[this.past.length - 1];
    const still = () => this.room === room && room.at === turnNo && this.past[this.past.length - 1] === entry;

    const items: RoomItem[] = [];
    const skip = new Set([id, ...(object.mates ?? [])]);
    for (const other of page.objects) {
      const item = this.doc.objects[other];
      if (!item || skip.has(other) || item.lock || item.type === "mark" || item.type === "note") continue;
      const box = objectBounds(item);
      const base = room.base.get(other);
      // One that has yet to make room itself counts as it was.
      const waiting = this.growing.get(other);
      items.push({
        key: other,
        box: { ...box, y: base === undefined ? box.y : box.y + base - item.y, h: waiting ? waiting.h : box.h },
        rigid: item.group ?? null,
      });
    }
    const text = this.readyText(page);
    const blocks = (text?.blocks ?? []).filter((block) => !page.cuts[block.key]);
    for (const block of blocks) items.push({ key: `block:${block.key}`, box: blockBox(block), rigid: null });
    const pictures = (this.picturesNow.get(`${page.source}:${page.index}`) ?? []).filter(
      (picture) => !picture.whole && !page.imageCuts.includes(picture.index),
    );
    for (const picture of pictures)
      items.push({ key: `picture:${picture.index}`, box: pictureBox(picture), rigid: null });

    // Lines that touch are one drawing; words inside it go along.
    const units = this.unitsOn(page).filter((unit) => !unit.ops.some((op) => page.pathCuts.includes(op)));
    const bottom = object.y + room.box.h;
    const seen = new Set<Unit>();
    units.forEach((unit, index) => {
      if (seen.has(unit) || unit.paths.some((path) => path.pattern)) return;
      const whole = touching(units, unit, page);
      whole.forEach((part) => seen.add(part));
      const boxes = whole.map((part) => part.box);
      const frame = {
        x: Math.min(...boxes.map((box) => box.x)),
        y: Math.min(...boxes.map((box) => box.y)),
        x1: Math.max(...boxes.map((box) => box.x + box.w)),
        y1: Math.max(...boxes.map((box) => box.y + box.h)),
      };
      // Around the text that grows: its frame or its table. That stays.
      if (frame.y < bottom - 3) return;
      const name = `drawing:${index}`;
      for (const part of whole) items.push({ key: `unit:${part.key}`, box: part.box, rigid: name });
      for (const item of items) {
        if (item.rigid || item.key.startsWith("unit:")) continue;
        const cx = item.box.x + item.box.w / 2;
        const cy = item.box.y + item.box.h / 2;
        if (cx > frame.x && cx < frame.x1 && cy > frame.y && cy < frame.y1) item.rigid = name;
      }
    });

    const limit = marginBox(page);
    const foot = page.margin ? limit.y + limit.h : pageBox(page).y + pageBox(page).h * 0.94;
    const grown = { x: room.box.x, w: Math.max(room.box.w, object.w), before: bottom, now: object.y + object.h };
    const plan = planRoom(grown, items, foot);
    if (plan.size === 0 && room.base.size === 0) return;

    // What still belongs to the page has to be taken off it before it can move.
    const moved = new Map<string, number>();
    const opened: string[] = [];
    for (const [key, by] of plan) {
      const at = key.indexOf(":");
      if (at < 0 || this.doc.objects[key]) {
        moved.set(key, by);
        continue;
      }
      const kind = key.slice(0, at);
      const rest = key.slice(at + 1);
      let made: string[] = [];
      if (kind === "block") {
        const block = blocks.find((item) => item.key === rest);
        const one = block ? await this.openBlock(page.id, rest, this.sample(page.id, blockBox(block))) : null;
        if (one) made = [one];
      } else if (kind === "picture") {
        const picture = pictures.find((item) => String(item.index) === rest);
        const one = picture ? await this.openPicture(page.id, picture, true) : null;
        if (one) made = [one];
      } else if (kind === "unit") {
        const unit = units.find((item) => item.key === rest);
        if (unit) made = this.openUnits(page.id, [unit], false);
      }
      if (!still()) {
        this.settle(new Set([id, ...this.view.selection]));
        return;
      }
      for (const one of made) {
        moved.set(one, by);
        opened.push(one);
      }
    }
    if (!still()) return;
    this.base = null;
    this.follow((doc) => {
      const objects = { ...doc.objects };
      for (const key of [...moved.keys(), ...opened]) {
        const item = objects[key];
        if (item && !room.base.has(key)) room.base.set(key, item.y);
      }
      for (const [key, base] of room.base) {
        const item = objects[key];
        if (item) objects[key] = { ...item, y: base + (moved.get(key) ?? 0), pristine: undefined } as EditObject;
      }
      return { ...doc, objects };
    });
  }

  // -------------------------------------------------------------- text that goes on over pages

  /** The texts of a chain, in page order. */
  private chainOf(doc: DocState, flow: string): { page: Page; object: TextObject }[] {
    const out: { page: Page; object: TextObject }[] = [];
    for (const page of doc.pages)
      for (const id of page.objects) {
        const object = doc.objects[id];
        if (object?.type === "text" && object.flow === flow) out.push({ page, object });
      }
    return out;
  }

  /** How far down text may go on a page. */
  private footOf(page: Page): number {
    const box = marginBox(page);
    return page.margin ? box.y + box.h : box.y + box.h - 18;
  }

  /** Moves the lines that no longer fit on to the next page, and back again. True when it did. */
  private flowOver(id: string): boolean {
    const start = this.doc.objects[id];
    const home = start ? pageOf(this.doc, id) : null;
    if (start?.type !== "text" || !home) return false;
    if (!start.flow && (home.source !== null || (!start.wrap && start.max === undefined))) return false;
    const over = start.y + start.h > this.footOf(home) + 0.5;
    const chain = start.flow ? this.chainOf(this.doc, start.flow) : [{ page: home, object: start }];
    const from = chain.findIndex((item) => item.object.id === id);
    if (!over && (from < 0 || from === chain.length - 1)) return false;
    // Room was left: only worth it when a whole line of the next one fits.
    if (!over && start.y + start.h + chain[from + 1].object.leading > this.footOf(home) + 0.5) return false;

    // All the words from here on, as one text.
    const flow = start.flow ?? uid("f");
    let runs = start.runs;
    let paras = allParas(start);
    let caret: { from: number; to: number } | null = null;
    const { editing, range } = this.view;
    for (let i = from; i < chain.length; i += 1) {
      const { object } = chain[i];
      if (i > from) {
        const offset = plainText(runs).length + (object.cont ? 0 : 1);
        const own = allParas(object).map((para) =>
          para.list?.resume ? { ...para, list: { ...para.list, start: undefined, resume: undefined } } : para,
        );
        if (object.cont) {
          runs = [...runs, ...object.runs];
          paras = [...paras, ...own.slice(1)];
        } else {
          runs = [...runs, { text: "\n", style: object.runs[0].style }, ...object.runs];
          paras = [...paras, ...own];
        }
        if (editing === object.id && range) caret = { from: range.from + offset, to: range.to + offset };
      } else if (editing === object.id && range) caret = range;
    }
    let body: TextBody = { runs: tidyRuns(runs), paras: tidyParas(paras), align: start.align, leading: start.leading };

    type Frame = { id: string; page: string; x: number; y: number; w: number; foot: number; made: boolean };
    const frames: (Frame & { body: TextBody; cont: boolean; at: number; h: number })[] = [];
    const pagesMade: { after: string; page: Page }[] = [];
    const pages = [...this.doc.pages];
    const w = start.wrap ? start.w : (start.max ?? start.w);
    let cont = Boolean(start.cont);
    let at = 0;
    for (let i = from; frames.length < 400; i += 1) {
      let frame: Frame;
      const known = chain[i];
      if (known) {
        frame = {
          id: known.object.id,
          page: known.page.id,
          x: known.object.x,
          y: known.object.y,
          w: i === from ? w : known.object.w,
          foot: this.footOf(known.page),
          made: false,
        };
      } else {
        const last = frames[frames.length - 1];
        const index = pages.findIndex((page) => page.id === last.page);
        let next = pages[index + 1];
        if (!next || next.source !== null) {
          const model = pages[index];
          next = { ...blankPage(model.w, model.h), margin: model.margin, box: model.box, paper: model.paper };
          pages.splice(index + 1, 0, next);
          pagesMade.push({ after: last.page, page: next });
        }
        const box = marginBox(next);
        const top = next.margin ? box.y : box.y + Math.min(36, Math.max(18, start.y - pageBox(home).y));
        frame = { id: uid("t"), page: next.id, x: last.x, y: top, w: last.w, foot: this.footOf(next), made: true };
      }
      const laid: Laid = { ...body, wrap: true, w: frame.w };
      const lines = linesOf(laid);
      const room = frame.foot - frame.y;
      let count = lines.findIndex((line) => line.bottom > room + 0.5);
      if (count < 0) count = lines.length;
      // A page always takes at least one line, or this would never end.
      if (count === 0) count = 1;
      const split = count < lines.length ? lines[count] : null;
      if (!split) {
        frames.push({ ...frame, body, cont, at, h: measureBox(laid).h });
        break;
      }
      const inside = split.para === lines[count - 1].para;
      const cutAt = split.from;
      const head = cutBody(body, 0, inside ? cutAt : cutAt - 1, false);
      const tail = cutBody(body, cutAt, plainText(body.runs).length, inside);
      frames.push({ ...frame, body: head, cont, at, h: measureBox({ ...head, wrap: true, w: frame.w }).h });
      at += cutAt;
      body = tail;
      cont = inside;
    }

    const used = new Set(frames.map((frame) => frame.id));
    const gone = new Set(
      chain
        .slice(from)
        .map((item) => item.object.id)
        .filter((one) => !used.has(one)),
    );
    this.follow((doc) => {
      const objects = { ...doc.objects };
      for (const frame of frames) {
        const old = objects[frame.id] as TextObject | undefined;
        objects[frame.id] = {
          ...(old ?? { ...start, id: frame.id, block: undefined, pristine: undefined }),
          ...frame.body,
          x: frame.x,
          y: frame.y,
          w: frame.w,
          h: frame.h,
          wrap: true,
          max: undefined,
          flow,
          cont: frame.cont || undefined,
        } as TextObject;
      }
      for (const one of gone) delete objects[one];
      let list = doc.pages;
      for (const { after, page } of pagesMade) {
        const index = list.findIndex((item) => item.id === after);
        list = [...list.slice(0, index + 1), page, ...list.slice(index + 1)];
      }
      return {
        ...doc,
        objects,
        pages: list.map((page) => {
          const here = frames.filter((frame) => frame.made && frame.page === page.id).map((frame) => frame.id);
          const rest = page.objects.filter((one) => !gone.has(one));
          return here.length > 0 || rest.length !== page.objects.length
            ? { ...page, objects: [...here, ...rest] }
            : page;
        }),
      };
    });

    // The caret goes where its letter went.
    if (caret && editing) {
      const where = [...frames].reverse().find((frame) => caret.from >= frame.at) ?? frames[0];
      const length = plainText(where.body.runs).length;
      const inFrame = {
        from: Math.max(0, Math.min(length, caret.from - where.at)),
        to: Math.max(0, Math.min(length, caret.to - where.at)),
      };
      if (where.id !== editing) {
        this.setView({ selection: [where.id], editing: where.id, cell: null, range: inFrame, pending: null });
        this.show(where.page, { x: where.x, y: where.y, w: where.w, h: 20 });
      } else this.setView({ range: inFrame });
    }
    return true;
  }

  // -------------------------------------------------------------- the file's own text

  textOf = (source: string, index: number): Promise<PageText> => {
    const key = `${source}:${index}`;
    let job = this.texts.get(key);
    if (!job) {
      const file = this.sources.get(source);
      if (!file) return Promise.reject(new EditError("That file is gone."));
      job = file.pdf
        .getPage(index + 1)
        .then((page) => readPageText(page, source, index))
        .then((text) => {
          this.textNow.set(key, text);
          this.forgetTexts();
          this.emit();
          return text;
        });
      job.catch(() => this.texts.delete(key));
      this.texts.set(key, job);
    }
    return job;
  };

  /** Keeps the text of the last pages visited, and of those on screen. The rest is read again when needed. */
  private forgetTexts() {
    if (this.textNow.size <= KEPT_TEXTS) return;
    const shown = new Set(
      [...this.canvases.keys()].map((id) => this.page(id)).map((page) => (page ? `${page.source}:${page.index}` : "")),
    );
    for (const key of this.textNow.keys()) {
      if (this.textNow.size <= KEPT_TEXTS) return;
      if (shown.has(key)) continue;
      this.textNow.delete(key);
      this.texts.delete(key);
    }
  }

  readyText(page: Page): PageText | null {
    return page.source === null ? null : (this.textNow.get(`${page.source}:${page.index}`) ?? null);
  }

  block(page: Page, key: string): Block | null {
    return this.readyText(page)?.blocks.find((block) => block.key === key) ?? null;
  }

  /** The edges a block may grow to: its column, or the page's margins when nothing is beside it. */
  columnOf(block: Block, page: Page): { x0: number; x1: number } {
    const col = { ...block.col };
    if (block.angle === 0 && page.margin) {
      const box = marginBox(page);
      if (block.free.right) col.x1 = Math.max(col.x1, box.x + box.w);
      if (block.free.left) col.x0 = Math.min(col.x0, Math.max(box.x, col.x0 - 400));
    }
    return col;
  }

  /** A block of the file as a text of the editor, where it stands. */
  async blockObject(block: Block, page: Page): Promise<TextObject> {
    const hang = block.list?.gap ?? 0;
    const col = this.columnOf(block, page);
    const t = { cos: Math.cos((block.angle * Math.PI) / 180), sin: Math.sin((block.angle * Math.PI) / 180) };
    const left = localOf(block.x, block.y, t).x;
    const centred = block.lines.length === 1 && block.align !== "left";
    const room = (block.align === "left" || block.align === "justify" ? col.x1 - left : col.x1 - col.x0) - hang;
    const laid = await flowLines(
      block.lines.map((line) => ({ ...line, x: line.x - hang })),
      { w: block.w - hang, align: block.align, leading: block.leading, size: block.size, room },
    );
    let { paras } = laid;
    let { w, max } = laid;
    if (block.list) {
      const own = allParas({ runs: laid.runs, paras });
      paras = own.map((para, i): Para => {
        const next = { ...para, left: hang + (para.left ?? 0) };
        return i === 0 && block.list ? { ...next, list: { ...block.list, level: 0 } } : next;
      });
      w += hang;
      if (max !== undefined) max += hang;
    }
    const body = { runs: laid.runs, paras, align: block.align, leading: block.leading };
    const box = measureBox({ ...body, wrap: laid.wrap, w, max });
    if (!laid.wrap) w = box.w;
    const slack = w - block.w;
    const shift = block.align === "center" ? -slack / 2 : block.align === "right" ? -slack : 0;
    const at = apply(placement(block.x, block.y, block.angle), shift, 0);
    return {
      id: uid("t"),
      type: "text",
      x: at.x,
      y: at.y,
      w,
      h: box.h,
      angle: block.angle,
      opacity: block.alpha,
      ...body,
      wrap: laid.wrap,
      max: laid.wrap ? undefined : centred ? room : max,
      block: block.key,
      pristine: true,
    };
  }

  /** Takes a block off the page and makes it editable. Nothing is kept if it is left unchanged. */
  async openBlock(pageId: string, key: string, cover: string, front = false): Promise<string | null> {
    const page = this.page(pageId);
    const block = page && this.block(page, key);
    if (!page || !block || page.cuts[key]) return null;
    const object = await this.blockObject(block, page);
    if (!this.page(pageId) || this.page(pageId)?.cuts[key]) return null;
    this.silent((doc) => addCut(doc, pageId, key, block, cover, object, front), true);
    return object.id;
  }

  /** Several blocks as one text, in reading order: for paragraphs that were kept apart. */
  joinTexts(ids: readonly string[]) {
    const list = ids
      .map((id) => this.doc.objects[id])
      .filter((object): object is TextObject => object?.type === "text")
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (list.length < 2) return;
    const [first, ...rest] = list;
    const x = Math.min(...list.map((object) => object.x));
    const x1 = Math.max(...list.map((object) => object.x + object.w));
    const runs = [...first.runs];
    const paras: Para[] = allParas(first).map((para) => inset(para, first.x - x));
    for (let i = 0; i < rest.length; i += 1) {
      const object = rest[i];
      const above = list[i];
      runs.push({ text: "\n", style: object.runs[0].style });
      runs.push(...object.runs);
      const own = allParas(object).map((para) => inset(para, object.x - x));
      const gap = Math.max(0, object.y - (above.y + above.h));
      own[0] = {
        ...own[0],
        before: gap > 0.5 ? gap : undefined,
        leading: object.leading !== first.leading ? object.leading : own[0].leading,
      };
      for (let k = 1; k < own.length; k += 1)
        if (object.leading !== first.leading) own[k] = { ...own[k], leading: own[k].leading ?? object.leading };
      paras.push(...own);
    }
    this.commit((doc) => {
      const next = this.patched<TextObject>(doc, first.id, {
        x,
        w: x1 - x,
        wrap: true,
        max: undefined,
        runs: tidyRuns(runs),
        paras: tidyParas(paras),
      });
      return removeObjects(next, new Set(rest.map((object) => object.id)));
    });
    this.select([first.id]);
  }

  /** Every paragraph as a text of its own. */
  splitText(id: string) {
    const object = this.doc.objects[id];
    const page = object ? pageOf(this.doc, id) : null;
    if (object?.type !== "text" || !page) return;
    const text = plainText(object.runs);
    if (!text.includes("\n")) return;
    const laid: Laid = { ...object };
    const lines = linesOf(laid);
    const marks = listMarks(object);
    const made: TextObject[] = [];
    let from = 0;
    text.split("\n").forEach((part, i) => {
      const own = lines.filter((line) => line.para === i);
      const top = own[0]?.top ?? 0;
      const at = apply(placement(object.x, object.y, object.angle), 0, top);
      const para = paraOf(object, i);
      const number = para.list?.type === "number" && marks[i] ? listValue(marks, object, i) : undefined;
      made.push({
        ...object,
        id: i === 0 ? object.id : uid("t"),
        x: at.x,
        y: at.y,
        h: (own[own.length - 1]?.bottom ?? top) - top,
        runs: tidyRuns([
          ...sliceRuns(object.runs, from, from + part.length),
          { text: "", style: object.runs[0].style },
        ]),
        paras: tidyParas([
          {
            ...para,
            before: undefined,
            list: para.list ? { ...para.list, start: number ?? para.list.start } : undefined,
          },
        ]),
        leading: para.leading ?? object.leading,
        block: i === 0 ? object.block : undefined,
        flow: undefined,
        cont: undefined,
      });
      from += part.length + 1;
    });
    this.commit((doc) => {
      const objects = { ...doc.objects };
      for (const item of made) objects[item.id] = { ...item, pristine: undefined };
      return {
        ...doc,
        objects,
        pages: doc.pages.map((item) => {
          if (item.id !== page.id) return item;
          const at = item.objects.indexOf(id);
          return {
            ...item,
            objects: [...item.objects.slice(0, at), ...made.map((one) => one.id), ...item.objects.slice(at + 1)],
          };
        }),
      };
    });
    this.select(made.map((item) => item.id));
  }

  // -------------------------------------------------------------- the file's own lines and shapes

  /** What can be picked on a page, in painting order. */
  unitsOn(page: Page): Unit[] {
    const text = this.readyText(page);
    if (!text) return [];
    let units = this.units.get(text);
    if (!units) {
      units = text.paths.length > 4000 ? [] : unitsOf(text.paths, page);
      this.units.set(text, units);
    }
    return units;
  }

  /** Makes lines and shapes of the page movable. Nothing is kept if they are left unchanged. */
  openUnits(pageId: string, units: readonly Unit[], together = true): string[] {
    const page = this.page(pageId);
    if (!page) return [];
    const fresh = units.filter(
      (unit) => !unit.ops.some((op) => page.pathCuts.includes(op)) && !unit.paths.some((path) => path.pattern),
    );
    if (fresh.length === 0) return [];
    const group = together && fresh.length > 1 ? uid("g") : undefined;
    const made = fresh.map((unit) => ({ ...unitObject(unit), group }));
    this.silent(
      (doc) => ({
        ...doc,
        objects: { ...doc.objects, ...Object.fromEntries(made.map((object) => [object.id, object])) },
        pages: doc.pages.map((item) =>
          item.id === pageId
            ? {
                ...item,
                pathCuts: [...item.pathCuts, ...fresh.flatMap((unit) => unit.ops)],
                objects: [...made.map((object) => object.id), ...item.objects],
              }
            : item,
        ),
      }),
      true,
    );
    return made.map((object) => object.id);
  }

  /** The whole drawing a line or shape belongs to: every part of it, picked as one. */
  async openDrawing(pageId: string, unit: Unit): Promise<string[]> {
    const page = this.page(pageId);
    if (!page) return [];
    const parts = touching(this.unitsOn(page), unit, page);
    if (parts.length > 900) {
      this.say("This drawing has too many parts to be picked as a whole.");
      return this.openUnitsWithWords(pageId, [unit]);
    }
    const ops = new Set(parts.flatMap((part) => part.ops));
    await this.openUnitsWithWords(pageId, parts, false);
    const now = this.page(pageId);
    const ids = (now?.objects ?? []).filter((id) => {
      const object = this.doc.objects[id];
      return object && object.type !== "image" && object.pristine && object.ops?.some((op) => ops.has(op));
    });
    if (ids.length > 1) {
      const group = uid("g");
      this.silent((doc) => {
        const objects = { ...doc.objects };
        for (const id of ids) objects[id] = { ...objects[id], group };
        return { ...doc, objects };
      }, true);
    }
    return ids;
  }

  /** The lines and shapes a picked object was made from, with everything that touches them. */
  drawingOf(pageId: string, object: EditObject): Unit[] {
    const page = this.page(pageId);
    const units = page ? this.unitsOn(page) : [];
    const own = units.find((unit) => unit.ops.some((op) => object.ops?.includes(op)));
    return page && own && object.type !== "image" ? touching(units, own, page) : [];
  }

  /** Words on a filled shape come along with it, or the shape would hide them. */
  async openUnitsWithWords(pageId: string, units: readonly Unit[], together = true): Promise<string[]> {
    const page = this.page(pageId);
    if (!page) return [];
    const ids = this.openUnits(pageId, units, together);
    const filled = units.filter((unit) => !unit.line && unit.paths.some((path) => path.fill));
    if (filled.length === 0 || ids.length === 0) return ids;
    const mates: string[] = [];
    for (const block of this.readyText(page)?.blocks ?? []) {
      if (this.page(pageId)?.cuts[block.key]) continue;
      const box = blockBox(block);
      const on = filled.some((unit) => {
        const shared = intersect(box, unit.box);
        return shared.w * shared.h > box.w * box.h * 0.3;
      });
      if (!on) continue;
      const one = await this.openBlock(pageId, block.key, this.sample(pageId, box), true);
      if (one) mates.push(one);
    }
    if (mates.length > 0)
      this.silent((doc) => {
        const objects = { ...doc.objects };
        for (const id of ids) if (objects[id]) objects[id] = { ...objects[id], mates };
        return { ...doc, objects };
      });
    return ids;
  }

  /** A ruled table of the page with its words. Null when the lines are not a table. */
  async tableFrom(
    page: Page,
    units: readonly Unit[],
  ): Promise<{ table: TableObject; blocks: Block[]; ops: number[] } | null> {
    const text = this.readyText(page);
    const grid = gridOf(units);
    if (!text || !grid) return null;
    const { xs, ys, owner } = grid;
    const rows = ys.length - 1;
    const cols = xs.length - 1;
    const inside = (p: Point) => p.x > xs[0] && p.x < xs[cols] && p.y > ys[0] && p.y < ys[rows];
    const blocks = text.blocks.filter((block) => {
      const box = blockBox(block);
      return block.angle === 0 && !page.cuts[block.key] && inside({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    });
    const bodies = new Map<number, { block: Block; object: TextObject }[]>();
    for (const block of blocks) {
      const box = blockBox(block);
      const cx = box.x + Math.min(box.w / 2, 6);
      const cy = box.y + box.h / 2;
      const c = Math.max(
        0,
        xs.findIndex((x, i) => i < cols && cx >= x && cx < xs[i + 1]),
      );
      const r = Math.max(
        0,
        ys.findIndex((y, i) => i < rows && cy >= y && cy < ys[i + 1]),
      );
      const at = owner[r][c];
      const list = bodies.get(at) ?? [];
      list.push({ block, object: await this.blockObject(block, page) });
      bodies.set(at, list);
    }
    const lines = units.map((unit) => unit.line).filter((line) => line !== null);
    const common = lines[0];
    const pads = blocks.map((block) => {
      const x = xs.filter((value) => value <= block.x + 1).pop() ?? xs[0];
      return block.x - x;
    });
    const padX = Math.min(8, Math.max(1.5, pads.length > 0 ? Math.min(...pads) : 5));
    const tops = blocks.map((block) => {
      const y = ys.filter((value) => value <= block.y + 2).pop() ?? ys[0];
      return block.y - y;
    });
    const padY = Math.min(6, Math.max(0, tops.length > 0 ? Math.min(...tops) : 3));
    const style = this.freshStyle();
    const fills = text.paths.filter(
      (path) => path.fill && !path.stroke && path.box.w > 6 && path.box.h > 6 && !stripeOf(path),
    );
    const cells: Cell[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (__, c): Cell => {
        const at = r * cols + c;
        if (owner[r][c] !== at)
          return { runs: [{ text: "", style }], align: "left", leading: leadingOf(style), covered: true };
        let r1 = r;
        let c1 = c;
        while (r1 + 1 < rows && owner[r1 + 1][c] === at) r1 += 1;
        while (c1 + 1 < cols && owner[r][c1 + 1] === at) c1 += 1;
        const list = (bodies.get(at) ?? []).sort((a, b) => a.block.y - b.block.y || a.block.x - b.block.x);
        const body =
          list.length > 0
            ? joined(list.map((item) => item.object))
            : {
                runs: [{ text: "", style: nearStyle(bodies) ?? style }],
                align: "left" as const,
                leading: leadingOf(style),
              };
        const box = { x: xs[c], y: ys[r], w: xs[c1 + 1] - xs[c], h: ys[r1 + 1] - ys[r] };
        const fill = fills
          .filter((path) => {
            const shared = intersect(path.box, box);
            return shared.w * shared.h > box.w * box.h * 0.75 && path.box.w < box.w * 1.4 + cols * 400;
          })
          .pop();
        let valign: Cell["valign"];
        if (list.length > 0) {
          const top = list[0].block.y - box.y;
          const last = list[list.length - 1].block;
          const bottom = box.y + box.h - (last.y + last.h);
          if (top > padY + 6 && Math.abs(top - bottom) < 7) valign = "middle";
          else if (bottom < 4 && top > padY + 10) valign = "bottom";
        }
        return {
          ...body,
          fill: fill?.fill ?? undefined,
          valign,
          rows: r1 > r ? r1 - r + 1 : undefined,
          cols: c1 > c ? c1 - c + 1 : undefined,
        };
      }),
    );
    const table: TableObject = {
      id: uid("b"),
      type: "table",
      x: xs[0],
      y: ys[0],
      w: xs[cols] - xs[0],
      h: ys[rows] - ys[0],
      angle: 0,
      opacity: 1,
      cols: xs.slice(1).map((x, i) => x - xs[i]),
      rows: ys.slice(1).map((y, i) => y - ys[i]),
      cells,
      edge: common
        ? { color: common.color, width: common.width, dash: common.dash.length > 0 ? "dash" : "solid" }
        : null,
      pad: { x: padX, y: padY },
    };
    const lay = layTable(table);
    const cellFills = fills.filter((path) => {
      const shared = intersect(path.box, { x: xs[0], y: ys[0], w: table.w, h: table.h });
      return shared.w * shared.h > path.box.w * path.box.h * 0.9;
    });
    return {
      table: { ...table, w: lay.w, h: lay.h },
      blocks: [...bodies.values()].flatMap((list) => list.map((item) => item.block)),
      ops: [...new Set([...units.flatMap((unit) => unit.ops), ...cellFills.map((path) => path.op)])],
    };
  }

  /** The ruled tables drawn on a page: where each one is and the lines it is made of. */
  gridsOn(page: Page): Grid[] {
    const text = this.readyText(page);
    if (!text) return [];
    let grids = this.grids.get(text);
    if (!grids) {
      grids = [];
      const units = this.unitsOn(page);
      const seen = new Set<Unit>();
      for (const unit of units) {
        if (!unit.line || seen.has(unit)) continue;
        const parts = touching(units, unit, page);
        for (const part of parts) seen.add(part);
        if (parts.length < 4 || parts.length > 900) continue;
        const grid = gridOf(parts);
        if (!grid) continue;
        const { xs, ys } = grid;
        const box = { x: xs[0], y: ys[0], w: xs[xs.length - 1] - xs[0], h: ys[ys.length - 1] - ys[0] };
        const cells = (xs.length - 1) * (ys.length - 1);
        // A frame round a part of the page is not a table.
        if (cells < 2 || box.w * box.h > page.w * page.h * 0.6) continue;
        grids.push({ box, units: parts });
      }
      this.grids.set(text, grids);
    }
    return grids.filter((grid) => !grid.units.some((unit) => unit.ops.some((op) => page.pathCuts.includes(op))));
  }

  /** The ruled table of the page a point is inside, if any. The edge itself stays a line. */
  gridAt(page: Page, p: Point, edge = 0): Grid | null {
    return (
      this.gridsOn(page).find(
        ({ box }) =>
          p.x > box.x + edge && p.x < box.x + box.w - edge && p.y > box.y + edge && p.y < box.y + box.h - edge,
      ) ?? null
    );
  }

  /** Turns a ruled table of the page into a table. What was opened in it goes back first, so its words come along. */
  async openGrid(pageId: string, grid: Grid): Promise<string | null> {
    this.select([]);
    const id = await this.openTable(pageId, grid.units);
    if (!id) this.say("These lines do not make a table that can be read.");
    return id;
  }

  /** Makes a ruled table of the page one that can be changed like any table. */
  async openTable(pageId: string, units: readonly Unit[]): Promise<string | null> {
    const page = this.page(pageId);
    const made = page ? await this.tableFrom(page, units) : null;
    if (!made) return null;
    const { table, blocks, ops } = made;
    const open = this.view.selection.filter((id) => this.doc.objects[id]?.ops);
    this.commit((doc) => {
      // What was opened to get here goes: the table stands for it.
      const parts = new Set(open);
      for (const id of open)
        for (const mate of doc.objects[id]?.mates ?? []) if (doc.objects[mate]?.pristine) parts.add(mate);
      let next = removeObjects(doc, parts);
      for (const block of blocks) next = addCut(next, pageId, block.key, block, "#ffffff", null);
      return {
        ...next,
        objects: { ...next.objects, [table.id]: table },
        pages: next.pages.map((item) =>
          item.id === pageId
            ? { ...item, pathCuts: [...new Set([...item.pathCuts, ...ops])], objects: [...item.objects, table.id] }
            : item,
        ),
      };
    });
    this.select([table.id]);
    return table.id;
  }

  /** Takes blocks off the page for good. */
  async cutBlocks(pageId: string, keys: readonly string[], cover: (block: Block) => string) {
    const page = this.page(pageId);
    if (!page) return;
    this.commit((doc) => {
      let next = doc;
      for (const key of keys) {
        const block = this.block(page, key);
        if (block) next = addCut(next, pageId, key, block, cover(block), null);
      }
      return next;
    });
  }

  /** The colour most common around a box of the page. */
  sample(pageId: string, box: Box): string {
    const drawn = this.canvases.get(pageId);
    const paper = this.page(pageId)?.paper ?? "#ffffff";
    if (!drawn) return paper;
    const { scale, canvas } = drawn;
    const x0 = Math.max(0, Math.floor((box.x - 2) * scale));
    const y0 = Math.max(0, Math.floor((box.y - 1) * scale));
    const x1 = Math.min(canvas.width, Math.ceil((box.x + box.w + 2) * scale));
    const y1 = Math.min(canvas.height, Math.ceil((box.y + box.h + 1) * scale));
    if (x1 - x0 < 2 || y1 - y0 < 2) return paper;
    try {
      // Copied out first: reading the big canvas itself would slow its drawing down.
      this.patchCanvas ??= document.createElement("canvas");
      const bench = this.patchCanvas;
      bench.width = x1 - x0;
      bench.height = y1 - y0;
      const context = bench.getContext("2d", { willReadFrequently: true });
      if (!context) return paper;
      context.fillStyle = paper;
      context.fillRect(0, 0, bench.width, bench.height);
      context.drawImage(canvas, -x0, -y0);
      const { data, width, height } = context.getImageData(0, 0, bench.width, bench.height);
      const count = new Map<number, number>();
      const add = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        count.set(key, (count.get(key) ?? 0) + 1);
      };
      for (let x = 0; x < width; x += 1) {
        add(x, 0);
        add(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        add(0, y);
        add(width - 1, y);
      }
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return `#${best.toString(16).padStart(6, "0")}`;
    } catch {
      return paper;
    }
  }

  // -------------------------------------------------------------- pictures

  async addImageFile(file: Blob, pageId: string | null, at?: { x: number; y: number }) {
    const page =
      (pageId && this.page(pageId)) || this.doc.pages.find((item) => item.id === this.view.page) || this.doc.pages[0];
    if (!page) return;
    const asset = await this.makeAsset(file);
    const area = marginBox(page);
    const room = { w: Math.min(area.w, pageBox(page).w * 0.6), h: pageBox(page).h * 0.5 };
    const scale = Math.min(1, room.w / (asset.w * 0.75), room.h / (asset.h * 0.75));
    const w = asset.w * 0.75 * scale;
    const h = asset.h * 0.75 * scale;
    const place = at ?? { x: area.x + area.w / 2, y: area.y + area.h / 2 };
    const object: ImageObject = {
      id: uid("i"),
      type: "image",
      asset: asset.id,
      x: Math.max(pageBox(page).x, Math.min(pageBox(page).x + pageBox(page).w - w, place.x - w / 2)),
      y: Math.max(pageBox(page).y, Math.min(pageBox(page).y + pageBox(page).h - h, place.y - h / 2)),
      w,
      h,
      angle: 0,
      opacity: 1,
    };
    this.setView({ tool: "select" });
    this.add(page.id, object);
    if (!at) this.setView({ goTo: { page: page.id, box: objectBounds(object), n: ++this.counter } });
    return object.id;
  }

  async replaceImage(id: string, file: Blob) {
    const asset = await this.makeAsset(file);
    this.patch<ImageObject>(id, (object) => {
      const h = (object.w * asset.h) / asset.w;
      const scale = Math.min(1, (object.h * 1.5) / h);
      return { asset: asset.id, crop: undefined, flipX: false, flipY: false, w: object.w * scale, h: h * scale };
    });
  }

  async makeAsset(file: Blob, origin?: Asset["origin"]): Promise<Asset> {
    const { readImage } = await import("./engine/images");
    const image = await readImage(file);
    const asset: Asset = {
      id: uid("a"),
      ...image,
      url: URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime })),
      origin,
    };
    this.assets.set(asset.id, asset);
    return asset;
  }

  picturesOf(page: Page): Promise<PagePicture[]> {
    if (page.source === null) return Promise.resolve([]);
    const key = `${page.source}:${page.index}`;
    let job = this.pictures.get(key);
    if (!job) {
      const { source, index, w, h, view } = page;
      job = this.lib(source)
        .then(async (lib) => {
          const { readPage } = await import("./engine/content");
          const tree = readPage(lib.getPage(index));
          return tree.pictures
            .map((picture, i): PagePicture | null => {
              if (picture.inline || !picture.xobject) return null;
              const m = mul(picture.ctm, view);
              const corner = apply(m, 0, 1);
              const right = apply(m, 1, 1);
              const below = apply(m, 0, 0);
              const u = { x: right.x - corner.x, y: right.y - corner.y };
              const v = { x: below.x - corner.x, y: below.y - corner.y };
              const pw = Math.hypot(u.x, u.y);
              const ph = Math.hypot(v.x, v.y);
              if (pw < 4 || ph < 4) return null;
              const flip = u.x * v.y - u.y * v.x < 0;
              const at = flip ? below : corner;
              let crop: PagePicture["crop"] = null;
              const all = bounds(corners(m, { x: 0, y: 0, w: 1, h: 1 }));
              let x = at.x;
              let y = at.y;
              let sw = pw;
              let sh = ph;
              const angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
              if (picture.clip && Math.abs(angle) < 0.5 && !flip) {
                const clip = bounds(corners(view, picture.clip));
                const seen = intersect(clip, all);
                if (seen.w < 3 || seen.h < 3) return null;
                if (seen.w < all.w - 1 || seen.h < all.h - 1) {
                  crop = {
                    x: (seen.x - all.x) / all.w,
                    y: (seen.y - all.y) / all.h,
                    w: seen.w / all.w,
                    h: seen.h / all.h,
                  };
                  x = seen.x;
                  y = seen.y;
                  sw = seen.w;
                  sh = seen.h;
                }
              }
              const onPage = intersect(all, { x: 0, y: 0, w, h });
              if (onPage.w < 3 || onPage.h < 3) return null;
              return {
                index: i,
                x,
                y,
                w: sw,
                h: sh,
                angle: Math.abs(angle) < 0.05 ? 0 : angle,
                flip,
                crop,
                whole: onPage.w * onPage.h > w * h * 0.88,
              };
            })
            .filter((picture): picture is PagePicture => picture !== null);
        })
        .catch(() => []);
      this.pictures.set(key, job);
      void job.then((list) => this.picturesNow.set(key, list));
    }
    return job;
  }

  /** A picture of the page as a file of its own. */
  async pictureAsset(page: Page, picture: PagePicture): Promise<Asset | null> {
    if (page.source === null) return null;
    const lib = await this.lib(page.source);
    const [{ readPage }, { pictureDocument }] = await Promise.all([
      import("./engine/content"),
      import("./engine/export"),
    ]);
    const raw = readPage(lib.getPage(page.index)).pictures[picture.index];
    if (!raw?.xobject) return null;
    const crop = picture.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const fullW = picture.w / crop.w;
    const fullH = picture.h / crop.h;
    const bytes = await pictureDocument(lib, raw.xobject, fullW, fullH);
    const pdf = await this.openPdf(bytes);
    let blob: Blob | null;
    try {
      const proxy = await pdf.getPage(1);
      const scale = Math.min(6, 1600 / Math.max(fullW, fullH));
      const viewport = proxy.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await renderClear(proxy, canvas, viewport).promise;
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      void pdf.destroy();
    }
    return blob ? this.makeAsset(blob, { source: page.source, page: page.index, picture: picture.index }) : null;
  }

  /** The lines and shapes of a page without its words and pictures, as a picture. Null when there are none. */
  async artOf(page: Page, scale: number): Promise<Blob | null> {
    if (page.source === null) return null;
    const { source, index } = page;
    const text = await this.textOf(source, index);
    const gone = new Set(page.pathCuts);
    if (!text.paths.some((path) => !gone.has(path.op) && path.alpha > 0)) return null;
    return this.queue(async () => {
      const [{ cutPage, setContents }, { mat }] = await Promise.all([
        import("./engine/content"),
        import("./engine/matrix"),
      ]);
      const bare = await this.bareOf(source, index);
      const cuts = cutsOf(page, this.doc.objects, text);
      for (const glyph of text.glyphs) {
        let set = cuts.text.get(glyph.op);
        if (!set) cuts.text.set(glyph.op, (set = new Set()));
        set.add(glyph.at);
      }
      bare.tree.pictures.forEach((_, i) => cuts.pictures.add(i));
      const cut = cutPage(bare.page, bare.tree, text, cuts);
      setContents(bare.page, cut.bytes, bare.tree.root, `q ${mat(invert(page.view))} cm Q`, false);
      const pdf = await this.openPdf(await bare.doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
      try {
        const proxy = await pdf.getPage(1);
        const viewport = proxy.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        await renderClear(proxy, canvas, viewport, { annotationMode: 0 }).promise;
        return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      } finally {
        void pdf.destroy();
      }
    });
  }

  /** Makes a picture of the PDF movable. Nothing is kept if it is left unchanged. */
  async openPicture(pageId: string, picture: PagePicture, alone = false): Promise<string | null> {
    const page = this.page(pageId);
    if (!page || page.source === null || page.imageCuts.includes(picture.index)) return null;
    const asset = await this.pictureAsset(page, picture);
    if (!asset || this.page(pageId)?.imageCuts.includes(picture.index)) return null;
    const object: ImageObject = {
      id: uid("i"),
      type: "image",
      asset: asset.id,
      x: picture.x,
      y: picture.y,
      w: picture.w,
      h: picture.h,
      angle: picture.angle,
      opacity: 1,
      flipY: picture.flip || undefined,
      crop: picture.crop ?? undefined,
      ops: [picture.index],
      pristine: true,
    };
    this.silent(
      (doc) => ({
        ...doc,
        objects: { ...doc.objects, [object.id]: object },
        pages: doc.pages.map((item) =>
          item.id === pageId
            ? { ...item, imageCuts: [...item.imageCuts, picture.index], objects: [object.id, ...item.objects] }
            : item,
        ),
      }),
      true,
    );
    // Words that lie on the picture come along, or it would hide them.
    const whole = pictureBox(picture);
    const mates: string[] = [];
    for (const block of alone ? [] : (this.readyText(page)?.blocks ?? [])) {
      if (this.page(pageId)?.cuts[block.key]) continue;
      const box = blockBox(block);
      const shared = intersect(box, whole);
      if (shared.w * shared.h <= box.w * box.h * 0.15) continue;
      const one = await this.openBlock(pageId, block.key, "#ffffff", true);
      if (one) mates.push(one);
    }
    if (mates.length > 0)
      this.silent((doc) => {
        const now = doc.objects[object.id];
        return now ? { ...doc, objects: { ...doc.objects, [object.id]: { ...now, mates } } } : doc;
      });
    return object.id;
  }

  cutPicture(pageId: string, index: number) {
    this.commit((doc) => ({
      ...doc,
      pages: doc.pages.map((page) => (page.id === pageId ? { ...page, imageCuts: [...page.imageCuts, index] } : page)),
    }));
  }

  // -------------------------------------------------------------- links and forms of the file

  notesOf(page: Page): Promise<{ links: PageLink[]; fields: PageField[] }> {
    if (page.source === null) return Promise.resolve({ links: [], fields: [] });
    const key = `${page.source}:${page.index}`;
    let job = this.notes.get(key);
    if (!job) {
      const { source, index } = page;
      const view = page.view;
      job = (async () => {
        const file = this.sources.get(source);
        if (!file) return { links: [], fields: [] };
        const proxy = await file.pdf.getPage(index + 1);
        const list = (await proxy.getAnnotations({ intent: "display" })) as Record<string, unknown>[];
        const places = new Map<string, number>();
        if (list.some((item) => item.subtype === "Link")) {
          const lib = await this.lib(source);
          const { PDFArray, PDFName, PDFRef } = await import("pdf-lib");
          const annots = lib.getPage(index).node.lookup(PDFName.of("Annots"));
          if (annots instanceof PDFArray) {
            for (let i = 0; i < annots.size(); i += 1) {
              const ref = annots.get(i);
              if (ref instanceof PDFRef) places.set(`${ref.objectNumber}R${ref.generationNumber || ""}`, i);
            }
          }
        }
        const links: PageLink[] = [];
        const fields: PageField[] = [];
        for (const item of list) {
          const rect = item.rect as number[] | undefined;
          if (!rect) continue;
          const box = bounds(corners(view, { x: rect[0], y: rect[1], w: rect[2] - rect[0], h: rect[3] - rect[1] }));
          if (item.subtype === "Link") {
            const place = places.get(String(item.id));
            if (place !== undefined)
              links.push({ place, box, url: String(item.unsafeUrl ?? item.url ?? ""), dest: item.dest });
          } else if (item.subtype === "Widget" && !item.hidden) {
            const type = item.fieldType;
            const raw = item.fieldValue;
            const value = Array.isArray(raw)
              ? String(raw[0] ?? "")
              : raw === null || raw === undefined
                ? ""
                : String(raw);
            const base = {
              name: String(item.fieldName ?? ""),
              box,
              options: ((item.options as { displayValue?: string; exportValue?: string }[] | undefined) ?? []).map(
                (option) => String(option.displayValue ?? option.exportValue ?? ""),
              ),
              readOnly: Boolean(item.readOnly),
              size: Number((item.defaultAppearanceData as { fontSize?: number } | undefined)?.fontSize ?? 0),
            };
            if (!base.name) continue;
            if (type === "Tx") fields.push({ ...base, kind: item.multiLine ? "multiline" : "text", value });
            else if (type === "Ch") fields.push({ ...base, kind: "list", value });
            else if (type === "Btn" && item.checkBox)
              fields.push({ ...base, kind: "check", value: value !== "Off" && value !== "" });
            else if (type === "Btn" && item.radioButton)
              fields.push({ ...base, kind: "radio", value, option: String(item.buttonValue ?? "") });
          }
        }
        return { links, fields };
      })().catch(() => ({ links: [], fields: [] }));
      this.notes.set(key, job);
    }
    return job;
  }

  setValue(source: string, name: string, value: string | boolean) {
    const key = `${source}:${name}`;
    this.commit((doc) => ({ ...doc, values: { ...doc.values, [key]: value } }), `value:${key}`);
  }

  openLink(pageId: string, link: PageLink) {
    const object: LinkObject = {
      id: uid("l"),
      type: "link",
      x: link.box.x,
      y: link.box.y,
      w: link.box.w,
      h: link.box.h,
      angle: 0,
      opacity: 1,
      url: link.url,
    };
    this.commit((doc) => ({
      ...doc,
      objects: { ...doc.objects, [object.id]: object },
      pages: doc.pages.map((page) =>
        page.id === pageId
          ? { ...page, objects: [...page.objects, object.id], linkCuts: [...page.linkCuts, link.place] }
          : page,
      ),
    }));
    this.select([object.id]);
  }

  // -------------------------------------------------------------- pages

  async openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
    return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, fontExtraProperties: true }).promise;
  }

  lib(source: string): Promise<LibDocument> {
    let job = this.libs.get(source);
    if (!job) {
      const file = this.sources.get(source);
      if (!file) return Promise.reject(new EditError("That file is gone."));
      job = import("pdf-lib").then(({ PDFDocument }) => PDFDocument.load(file.bytes, { updateMetadata: false }));
      this.libs.set(source, job);
    }
    return job;
  }

  // Passwords are asked for by the screen, which answers here.
  asking: { file: string; why: "open" | "change"; wrong: boolean } | null = null;
  private answerTo: ((password: string | null) => void) | null = null;

  private ask(file: string, why: "open" | "change", wrong: boolean): Promise<string | null> {
    this.asking = { file, why, wrong };
    this.emit();
    return new Promise((resolve) => {
      this.answerTo = (password) => {
        this.asking = null;
        this.answerTo = null;
        this.emit();
        resolve(password);
      };
    });
  }

  answer(password: string | null) {
    this.answerTo?.(password);
  }

  /** The bytes of a PDF that can be worked on: unlocked with its password when it has one. */
  private async unlocked(name: string, bytes: Uint8Array): Promise<Uint8Array> {
    const { lockOf, unlockPdf } = await import("./engine/crypt");
    const lock = await lockOf(bytes).catch(() => null);
    if (!lock) return bytes;
    const strange = new EditError(`${name} is locked in a way that cannot be opened here (${lock.method}).`);
    const attempt = (password: string) =>
      unlockPdf(bytes, password).catch(() => {
        throw strange;
      });
    let why: "open" | "change" = lock.needsPassword ? "open" : "change";
    // A lock nobody knows the kind of: no password would help.
    if (lock.needsPassword && (await attempt("")) !== null) throw strange;
    // Locked in name only: it opens for everyone and may be changed.
    let done = lock.needsPassword ? null : await attempt("");
    if (done && !done.mayChange && done.role !== "owner") done = null;
    for (let wrong = false; !done;) {
      const password = await this.ask(name, why, wrong);
      if (password === null) throw new EditError(`${name} was not opened. It needs its password.`);
      const got = await attempt(password);
      if (got && (got.role === "owner" || got.mayChange)) done = got;
      else if (got) {
        // Right for reading, but its owner keeps changes for the second password.
        wrong = why === "change";
        why = "change";
      } else wrong = true;
    }
    return done.bytes;
  }

  /** Opens a PDF and gives back its pages. */
  async addSource(name: string, raw: Uint8Array, id = uid("s")): Promise<Page[]> {
    const bytes = await this.unlocked(name, raw);
    let pdf: PDFDocumentProxy;
    try {
      pdf = await this.openPdf(bytes);
    } catch {
      throw new EditError(`${name} could not be read as a PDF. It may be damaged.`);
    }
    const source: Source = { id, name, bytes, pdf };
    this.sources.set(id, source);
    try {
      await this.lib(id);
    } catch {
      this.sources.delete(id);
      this.libs.delete(id);
      void pdf.destroy();
      throw new EditError(`${name} is damaged in a way that stops it from being edited.`);
    }
    const pages: Page[] = [];
    for (let from = 0; from < pdf.numPages; from += 24) {
      const proxies = await Promise.all(
        Array.from({ length: Math.min(24, pdf.numPages - from) }, (_, i) => pdf.getPage(from + i + 1)),
      );
      proxies.forEach((page, i) => {
        const viewport = page.getViewport({ scale: 1 });
        pages.push({
          ...blankPage(viewport.width, viewport.height),
          source: id,
          index: from + i,
          view: viewport.transform as Matrix,
        });
      });
    }
    return pages;
  }

  /** The pages any kind of file turns into, with what is on them. */
  private async pagesOf(file: File, like: Page | null): Promise<Made> {
    const { sniff } = await import("./convert/sniff");
    const kind = await sniff(file);
    if (kind === "pdf") {
      const pages = await this.addSource(file.name, new Uint8Array(await file.arrayBuffer()));
      return { pages, objects: {}, source: pages[0]?.source ?? null, kind };
    }
    if (kind === "image") {
      const asset = await this.makeAsset(file);
      const tall = asset.h >= asset.w;
      const size = like ? { w: Math.min(like.w, like.h), h: Math.max(like.w, like.h) } : A4;
      const w = tall ? size.w : size.h;
      const h = tall ? size.h : size.w;
      const scale = Math.min(w / asset.w, h / asset.h);
      const object: ImageObject = {
        id: uid("i"),
        type: "image",
        asset: asset.id,
        x: (w - asset.w * scale) / 2,
        y: (h - asset.h * scale) / 2,
        w: asset.w * scale,
        h: asset.h * scale,
        angle: 0,
        opacity: 1,
      };
      return {
        pages: [{ ...blankPage(w, h), objects: [object.id] }],
        objects: { [object.id]: object },
        source: null,
        kind,
      };
    }
    const [{ readFile }, { layDocument }] = await Promise.all([import("./convert/read"), import("./convert/lay")]);
    const read = await readFile(file, kind);
    const laid = await layDocument(read, {
      blank: blankPage,
      makeAsset: (blob) => this.makeAsset(blob),
      decor: like === null,
    });
    const about = read as { title?: string; author?: string };
    const meta =
      about.title || about.author
        ? { title: about.title ?? "", author: about.author ?? "", subject: "", keywords: "" }
        : undefined;
    return { ...laid, meta, source: null, kind };
  }

  async open(file: File) {
    this.setView({ opening: true, error: null });
    registerLibrary();
    try {
      const before = new Set(this.assets.keys());
      const made = await this.pagesOf(file, null);
      const kept = [...this.assets.values()].filter((asset) => !before.has(asset.id));
      this.close(false, made.source, new Set(kept.map((asset) => asset.id)));
      this.primary = made.source;
      this.name = baseName(file.name);
      this.origin = originOf(file, made.kind);
      this.doc = {
        ...EMPTY,
        pages: made.pages,
        objects: made.objects,
        decor: made.decor,
        outline: made.outline,
        meta: made.meta,
      };
      this.view = { ...this.freshView(made.pages[0]?.id ?? null), format: this.origin.format };
      this.emit();
      void import("./engine/export");
      if (made.source) void this.findMargins(made.source);
    } catch (error) {
      this.setView({ opening: false, error: messageOf(error, "That file could not be opened.") });
    }
  }

  private freshView(page: string | null): View {
    return { ...VIEW, zoom: this.view.zoom, prefs: { ...this.view.prefs, text: DEFAULT_STYLE }, page };
  }

  /** A new document of empty pages. */
  startBlank(setup: { w: number; h: number; margin: Margin | null; count?: number } = { ...A4, margin: null }) {
    registerLibrary();
    this.close(false);
    this.name = "document";
    this.origin = null;
    const pages = Array.from({ length: Math.max(1, setup.count ?? 1) }, () => ({
      ...blankPage(setup.w, setup.h),
      margin: setup.margin,
    }));
    this.doc = { ...EMPTY, pages };
    this.view = this.freshView(pages[0].id);
    this.emit();
  }

  close(emit = true, keep: string | null = null, keepAssets: ReadonlySet<string> = new Set()) {
    for (const backdrop of this.backdrops.values())
      void backdrop.job.then((item) => item?.pdf?.destroy()).catch(() => undefined);
    for (const [id, source] of this.sources) {
      if (id === keep) continue;
      forgetPdfFonts(id);
      void source.pdf.destroy();
      this.sources.delete(id);
      this.libs.delete(id);
    }
    for (const [id, asset] of this.assets) {
      if (keepAssets.has(id)) continue;
      URL.revokeObjectURL(asset.url);
      this.assets.delete(id);
    }
    this.backdrops.clear();
    this.texts.clear();
    this.textNow.clear();
    this.pictures.clear();
    this.picturesNow.clear();
    this.notes.clear();
    this.bare.clear();
    this.past = [];
    this.future = [];
    this.base = null;
    this.clip = null;
    this.room = null;
    this.growing.clear();
    this.primary = null;
    if (emit) {
      this.doc = EMPTY;
      this.view = this.freshView(null);
      this.emit();
    }
  }

  /** Puts a saved state back: a draft from an earlier visit. */
  async restore(state: {
    name: string;
    primary: string | null;
    doc: DocState;
    sources: { id: string; name: string; bytes: Uint8Array }[];
    assets: Omit<Asset, "url">[];
  }) {
    this.setView({ opening: true, error: null });
    registerLibrary();
    try {
      this.close(false);
      for (const source of state.sources) await this.addSource(source.name, source.bytes, source.id);
      for (const asset of state.assets)
        this.assets.set(asset.id, {
          ...asset,
          url: URL.createObjectURL(new Blob([asset.bytes as BlobPart], { type: asset.mime })),
        });
      // Text of the file's own fonts needs them read before it is shown.
      for (const page of state.doc.pages)
        if (page.source !== null && Object.keys(page.cuts).length > 0)
          await this.textOf(page.source, page.index).catch(() => null);
      this.primary = state.primary;
      this.name = state.name;
      this.doc = state.doc;
      this.view = { ...this.freshView(state.doc.pages[0]?.id ?? null), dirty: true };
      this.emit();
    } catch (error) {
      this.close(false);
      this.doc = EMPTY;
      this.setView({ opening: false, error: messageOf(error, "That draft could not be opened.") });
    }
  }

  /** Adds files as pages, before `at` (the end when left out). Any kind that can be opened can be added. */
  async insertFiles(files: readonly File[], at?: number) {
    registerLibrary();
    this.setView({ busy: { label: "Adding pages", progress: null }, error: null });
    const problems: string[] = [];
    const pages: Page[] = [];
    const objects: Record<string, EditObject> = {};
    const sources: string[] = [];
    for (const file of files) {
      try {
        const made = await this.pagesOf(file, this.doc.pages[0] ?? pages[0] ?? null);
        pages.push(...made.pages);
        Object.assign(objects, made.objects);
        if (made.source) sources.push(made.source);
      } catch (error) {
        problems.push(messageOf(error, `${file.name} could not be added.`));
      }
    }
    const error = problems.length > 0 ? problems.join(" ") : null;
    if (pages.length === 0) {
      this.setView({ busy: null, error: error ?? "There was nothing to add." });
      return;
    }
    if (this.doc.pages.length === 0) {
      this.doc = { ...EMPTY, pages, objects };
      this.primary = sources[0] ?? null;
      this.name = baseName(files[0].name);
      this.view = { ...this.freshView(pages[0].id), error };
      this.emit();
    } else {
      this.commit((doc) => {
        const list = [...doc.pages];
        list.splice(at ?? list.length, 0, ...pages);
        return { ...doc, pages: list, objects: { ...doc.objects, ...objects } };
      });
      this.setView({ busy: null, error, goTo: { page: pages[0].id, n: ++this.counter } });
    }
    for (const source of sources) void this.findMargins(source);
  }

  /** Empty pages like the one before them, margins and all. */
  addBlank(at?: number, count = 1) {
    const near = this.doc.pages[Math.max(0, (at ?? this.doc.pages.length) - 1)];
    const size = near ? shownSize(near) : A4;
    const pages = Array.from({ length: count }, () => ({
      ...blankPage(size.w, size.h),
      margin: near?.margin ?? null,
      paper: near?.paper,
    }));
    this.commit((doc) => {
      const list = [...doc.pages];
      list.splice(at ?? list.length, 0, ...pages);
      return { ...doc, pages: list };
    });
    this.setView({ goTo: { page: pages[0].id, n: ++this.counter } });
    return pages[0].id;
  }

  deletePages(ids: readonly string[]) {
    if (ids.length >= this.doc.pages.length) {
      this.setView({ error: "A document needs at least one page. Add another before deleting this one." });
      return;
    }
    const set = new Set(ids);
    const at = this.doc.pages.findIndex((page) => set.has(page.id));
    this.select([]);
    this.commit((doc) => {
      const gone = new Set(doc.pages.filter((page) => set.has(page.id)).flatMap((page) => page.objects));
      return {
        ...doc,
        pages: doc.pages.filter((page) => !set.has(page.id)),
        objects: Object.fromEntries(Object.entries(doc.objects).filter(([id]) => !gone.has(id))),
        outline: doc.outline?.filter((mark) => !set.has(mark.page)),
      };
    });
    const next = this.doc.pages[Math.min(Math.max(0, at), this.doc.pages.length - 1)];
    this.setView({ page: next?.id ?? null, marked: [], goTo: next ? { page: next.id, n: ++this.counter } : null });
  }

  duplicatePages(ids: readonly string[]) {
    const objects: Record<string, EditObject> = {};
    const copies = new Map<string, Page>();
    for (const id of ids) {
      const page = this.page(id);
      if (!page) continue;
      const mates = new Map<string, string>();
      const made = page.objects.map((from) => {
        const copy = { ...this.doc.objects[from], id: uid("o") } as EditObject;
        if (copy.group) {
          if (!mates.has(copy.group)) mates.set(copy.group, uid("g"));
          copy.group = mates.get(copy.group);
        }
        if (copy.type === "text") {
          delete copy.flow;
          delete copy.cont;
        }
        objects[copy.id] = copy;
        return copy.id;
      });
      copies.set(id, { ...page, id: uid("p"), objects: made });
    }
    if (copies.size === 0) return;
    const last = ids[ids.length - 1];
    this.commit((doc) => {
      const list: Page[] = [];
      for (const page of doc.pages) {
        list.push(page);
        if (page.id === last)
          for (const id of ids) {
            const copy = copies.get(id);
            if (copy) list.push(copy);
          }
      }
      return { ...doc, pages: list, objects: { ...doc.objects, ...objects } };
    });
    const first = copies.get(ids[0]);
    if (first) this.setView({ goTo: { page: first.id, n: ++this.counter } });
  }

  rotatePages(ids: readonly string[], by: 90 | -90) {
    const set = new Set(ids);
    this.commit((doc) => ({
      ...doc,
      pages: doc.pages.map((page) =>
        set.has(page.id) ? { ...page, rotate: ((((page.rotate + by) % 360) + 360) % 360) as Page["rotate"] } : page,
      ),
    }));
  }

  /** Moves pages so that they stand before what is now page `to`. */
  movePages(ids: readonly string[], to: number) {
    const set = new Set(ids);
    this.commit((doc) => {
      const moving = doc.pages.filter((page) => set.has(page.id));
      const before = doc.pages.slice(0, Math.max(0, to)).filter((page) => !set.has(page.id));
      const after = doc.pages.slice(Math.max(0, to)).filter((page) => !set.has(page.id));
      const pages = [...before, ...moving, ...after];
      return pages.every((page, i) => page === doc.pages[i]) ? doc : { ...doc, pages };
    });
  }

  patchPages(ids: readonly string[], patch: (page: Page) => Partial<Page>, key: string | null = null) {
    const set = new Set(ids);
    this.commit(
      (doc) => ({ ...doc, pages: doc.pages.map((page) => (set.has(page.id) ? { ...page, ...patch(page) } : page)) }),
      key,
    );
  }

  show(page: string, box?: Box) {
    this.setView({ goTo: { page, box, n: ++this.counter } });
  }

  // -------------------------------------------------------------- margins

  /** Reads the margin a file was made with and gives it to that file's pages. Other files keep their own. */
  private async findMargins(source: string) {
    const count = this.sources.get(source)?.pdf.numPages ?? 0;
    const step = Math.max(1, Math.floor(count / 9));
    const samples: { text: PageText; w: number; h: number }[] = [];
    for (let i = 0; i < count && samples.length < 9; i += step) {
      const page = this.doc.pages.find((item) => item.source === source && item.index === i);
      const text = page ? await this.textOf(source, i).catch(() => null) : null;
      if (page && text) samples.push({ text, w: page.w, h: page.h });
    }
    // Pages of another size than most have margins of their own making.
    const key = (s: { w: number; h: number }) => `${Math.round(s.w)}x${Math.round(s.h)}`;
    const sizes = new Map<string, typeof samples>();
    for (const sample of samples) sizes.set(key(sample), [...(sizes.get(key(sample)) ?? []), sample]);
    const found = new Map<string, Margin | null>();
    for (const [size, list] of sizes) found.set(size, detectMargin(list));
    if (![...found.values()].some(Boolean)) return;
    const common = detectMargin([...sizes.values()].sort((a, b) => b.length - a.length)[0] ?? []);
    const set = (doc: DocState): DocState => ({
      ...doc,
      pages: doc.pages.map((page) =>
        page.source === source && page.margin === undefined
          ? { ...page, margin: found.has(key(page)) ? (found.get(key(page)) ?? null) : common }
          : page,
      ),
    });
    this.silent(set);
    // Going back must not lose them again.
    this.past = this.past.map((entry) => ({ ...entry, doc: set(entry.doc) }));
  }

  /** The margin a page came with, for going back to it. */
  async fileMargin(page: Page): Promise<Margin | null> {
    if (page.source === null) return null;
    const { source } = page;
    const list = this.doc.pages.filter((item) => item.source === source && Math.abs(item.w - page.w) < 1).slice(0, 8);
    const samples: { text: PageText; w: number; h: number }[] = [];
    for (const item of list) {
      const text = await this.textOf(source, item.index).catch(() => null);
      if (text) samples.push({ text, w: item.w, h: item.h });
    }
    return detectMargin(samples);
  }

  // -------------------------------------------------------------- the page behind the objects

  backdropKey(page: Page): string {
    return page.source === null ? "blank" : cutKey(page, this.doc.objects);
  }

  /** What pdf.js should draw for a page: the original, or the original without what was taken off it. */
  backdrop(page: Page): Promise<{ page: PDFPageProxy; pdf: PDFDocumentProxy | null } | null> {
    if (page.source === null) return Promise.resolve(null);
    const key = this.backdropKey(page);
    const found = this.backdrops.get(page.id);
    if (found?.key === key) return found.job;
    const source = this.sources.get(page.source);
    if (!source) return Promise.resolve(null);
    const { objects } = this.doc;
    const job =
      key === UNCUT
        ? source.pdf.getPage(page.index + 1).then((proxy) => ({ page: proxy, pdf: null }))
        : this.queue(async () => {
            const text = await this.textOf(source.id, page.index);
            const cuts = cutsOf(page, objects, text);
            if (!hasCuts(cuts)) return { page: await source.pdf.getPage(page.index + 1), pdf: null };
            const [{ cutPage, setContents }, { coverOps }] = await Promise.all([
              import("./engine/content"),
              import("./engine/export"),
            ]);
            const bare = await this.bareOf(source.id, page.index);
            const cut = cutPage(bare.page, bare.tree, text, cuts);
            const cover = coverOps(page, text, cut.failed);
            const { mat } = await import("./engine/matrix");
            setContents(
              bare.page,
              cut.bytes,
              bare.tree.root,
              cover ? `q ${mat(invert(page.view))} cm\n${cover}\nQ` : "",
              false,
            );
            const pdf = await this.openPdf(
              await bare.doc.save({ useObjectStreams: false, updateFieldAppearances: false }),
            );
            return { page: await pdf.getPage(1), pdf };
          });
    this.backdrops.set(page.id, { key, job });
    if (found) void found.job.then((item) => setTimeout(() => void item?.pdf?.destroy(), 1500)).catch(() => undefined);
    job.catch(() => undefined);
    return job;
  }

  private bareOf(source: string, index: number) {
    const key = `${source}:${index}`;
    let job = this.bare.get(key);
    if (!job) {
      job = (async () => {
        const [{ bareDocument }, { readPage }] = await Promise.all([
          import("./engine/export"),
          import("./engine/content"),
        ]);
        const made = await bareDocument(await this.lib(source), index);
        return { ...made, tree: readPage(made.page) };
      })();
      this.bare.set(key, job);
    }
    return job;
  }

  private queue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work);
    this.chain = run.catch(() => undefined);
    return run;
  }

  // -------------------------------------------------------------- find and replace

  /** Finds words, wherever they are: in the file's own text, in what was typed, in tables and shapes. */
  async find(query: string, how: FindHow = this.view.find.how, quiet = false) {
    this.setView({ find: { ...this.view.find, query, how, searching: query.trim() !== "" } });
    if (query.trim() === "") {
      this.setView({ find: { ...this.view.find, hits: [], at: 0, searching: false } });
      return;
    }
    const hits: Hit[] = [];
    const still = () => this.view.find.query === query && this.view.find.how === how;
    for (const page of this.doc.pages) {
      const here: Hit[] = [];
      if (page.source !== null) {
        const text = await this.textOf(page.source, page.index).catch(() => null);
        for (const block of text?.blocks ?? []) {
          if (page.cuts[block.key]) continue;
          matchesIn(block.text, query, how).forEach((match, nth) =>
            here.push({ page: page.id, block: block.key, match, nth, spots: spotsInBlock(block, match) }),
          );
        }
      }
      for (const id of page.objects) here.push(...this.hitsInObject(page.id, id, query, how));
      here.sort((a, b) => {
        const p = a.spots[0];
        const q = b.spots[0];
        if (!p || !q) return 0;
        return Math.abs(p.y - q.y) > 4 ? p.y - q.y : p.x - q.x;
      });
      hits.push(...here);
      if (!still()) return;
      if (hits.length > 4000) break;
    }
    // The first one from the page being looked at.
    const from = this.doc.pages.findIndex((page) => page.id === this.view.page);
    const order = new Map(this.doc.pages.map((page, i) => [page.id, i]));
    const near = hits.findIndex((hit) => (order.get(hit.page) ?? 0) >= from);
    const at = quiet ? Math.min(this.view.find.at, Math.max(0, hits.length - 1)) : Math.max(0, near);
    this.setView({ find: { ...this.view.find, hits, at, searching: false } });
    if (!quiet && hits[at]) this.showHit(hits[at]);
  }

  private hitsInObject(page: string, id: string, query: string, how: FindHow): Hit[] {
    const object = this.doc.objects[id];
    if (!object) return [];
    const place = placement(object.x, object.y, object.angle);
    const out: Hit[] = [];
    const add = (laid: Laid, dx: number, dy: number, cell?: CellAt) => {
      matchesIn(plainText(laid.runs), query, how).forEach((match, nth) => {
        const spots = spotsInText(laid, match).map((spot) => {
          const at = apply(place, spot.x + dx, spot.y + dy);
          return { ...spot, x: at.x, y: at.y, angle: object.angle };
        });
        out.push({ page, object: id, cell, match, nth, spots });
      });
    };
    if (object.type === "text") add(object, 0, 0);
    else if (object.type === "table")
      for (const item of layTable(object).cells)
        add({ ...item.cell, wrap: true, w: item.inner.w }, item.inner.x, item.inner.y, { r: item.r, c: item.c });
    else if (object.type === "shape" && object.text) {
      const box = wordsBox(object, object.text);
      add({ ...object.text, wrap: true, w: box.w }, box.x, box.y);
    }
    return out;
  }

  private showHit(hit: Hit) {
    const spot = hit.spots[0];
    this.show(hit.page, spot ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h } : undefined);
  }

  findStep(by: 1 | -1) {
    const { hits, at } = this.view.find;
    if (hits.length === 0) return;
    const next = (at + by + hits.length) % hits.length;
    this.setView({ find: { ...this.view.find, at: next } });
    this.showHit(hits[next]);
  }

  /** Puts other words in the place of some of the ones found, as one step. Returns how many. */
  async replace(hits: readonly Hit[], value: string): Promise<number> {
    const { query, how } = this.view.find;
    if (query.trim() === "" || hits.length === 0) return 0;
    this.select([]);
    const groups = new Map<string, Hit[]>();
    for (const hit of hits) {
      const key = hit.block
        ? `${hit.page}|${hit.block}`
        : `${hit.object}|${hit.cell ? `${hit.cell.r},${hit.cell.c}` : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), hit]);
    }
    let count = 0;
    const swapped = (body: TextBody, list: readonly Hit[]): Partial<TextBody> => {
      const found = matchesIn(plainText(body.runs), query, how);
      const wanted = new Set(list.map((hit) => hit.nth));
      let next: TextBody = body;
      for (let i = found.length - 1; i >= 0; i -= 1) {
        if (!wanted.has(i)) continue;
        next = { ...next, ...editBody(next, found[i].from, found[i].to, value) };
        count += 1;
      }
      return { runs: next.runs, paras: next.paras };
    };
    const opened: { page: string; block: Block; object: TextObject; cover: string; list: readonly Hit[] }[] = [];
    for (const list of groups.values()) {
      const [first] = list;
      const page = first.block ? this.page(first.page) : null;
      if (!page || page.source === null || !first.block || page.cuts[first.block]) continue;
      await this.textOf(page.source, page.index);
      const block = this.block(page, first.block);
      if (!block) continue;
      const object = await this.blockObject(block, page);
      opened.push({
        page: page.id,
        block,
        object,
        cover: this.sample(page.id, blockBox(block)),
        list,
      });
    }
    this.commit((doc) => {
      let next = doc;
      const done = new Set<string>();
      for (const { page, block, object, cover, list } of opened) {
        // Taken off the page in the meantime, because something above it grew.
        if (next.pages.find((item) => item.id === page)?.cuts[block.key]) continue;
        done.add(`${page}|${block.key}`);
        next = addCut(next, page, block.key, block, cover, {
          ...object,
          ...swapped(object, list),
          pristine: undefined,
        });
      }
      for (const list of groups.values()) {
        const [first] = list;
        let id = first.object;
        if (first.block) {
          if (done.has(`${first.page}|${first.block}`)) continue;
          id = next.pages
            .find((item) => item.id === first.page)
            ?.objects.find((one) => {
              const object = next.objects[one];
              return object?.type === "text" && object.block === first.block;
            });
        }
        const body = id ? bodyIn(next.objects[id], first.cell ?? null) : null;
        if (id && body) next = this.withBody(next, id, first.cell ?? null, swapped(body, list));
      }
      return next;
    });
    return count;
  }

  // -------------------------------------------------------------- saving

  async save(options: SaveOptions = {}): Promise<Uint8Array> {
    this.select([]);
    const label = options.quiet ? "Getting it ready" : "Saving your PDF";
    this.setView({ busy: { label, progress: 0 }, error: null });
    try {
      const { exportPdf } = await import("./engine/export");
      const wanted = options.pages ? new Set(options.pages) : null;
      const doc = wanted ? { ...this.doc, pages: this.doc.pages.filter((page) => wanted.has(page.id)) } : this.doc;
      let bytes = await exportPdf({
        doc,
        all: this.doc.pages,
        name: this.name,
        sources: this.sources,
        assets: this.assets,
        primary: this.primary,
        textOf: this.textOf,
        flatten: options.flatten,
        shrink: options.shrink,
        onProgress: (done, total) => this.setView({ busy: { label, progress: done / total } }),
      });
      if (options.protect) {
        const { protectPdf } = await import("./engine/crypt");
        bytes = await protectPdf(bytes, options.protect);
      }
      this.setView(
        options.quiet
          ? { busy: null }
          : { busy: null, dirty: wanted ? this.view.dirty : false, saved: this.view.saved + 1 },
      );
      return bytes;
    } catch (error) {
      this.setView({ busy: null, error: messageOf(error, "The PDF could not be saved.") });
      throw error;
    }
  }
}

type Made = {
  pages: Page[];
  objects: Record<string, EditObject>;
  source: string | null;
  kind?: string;
  decor?: DocState["decor"];
  outline?: DocState["outline"];
  meta?: DocState["meta"];
};

/** A table drawn with lines in the PDF. */
export type Grid = { box: Box; units: Unit[] };

export type Origin = {
  /** The kind of file that is recommended. */
  format: Format;
  /** The ending of the file that was opened. */
  from: string;
  /** Why that kind is recommended. */
  why: string;
};

/** Saving goes back to the kind of file that came in, where the editor can make it. */
export function originOf(file: File, kind = "pdf"): Origin {
  const from = (/\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1] ?? kind).toLowerCase();
  const same = "The same kind as the file you opened";
  switch (kind) {
    case "docx":
      return { format: "docx", from, why: same };
    case "doc":
      return { format: "docx", from, why: `Word, like the .${from} file you opened` };
    case "odt":
      return { format: "odt", from, why: same };
    case "rtf":
      return { format: "rtf", from, why: same };
    case "pptx":
      return { format: "pptx", from, why: same };
    case "xlsx":
      return { format: "xlsx", from, why: same };
    case "ods":
    case "csv":
      return { format: "xlsx", from, why: `Excel, for the .${from} sheet you opened` };
    case "html":
      return { format: "html", from, why: same };
    case "markdown":
      return { format: "md", from, why: same };
    case "text":
      return { format: "txt", from, why: same };
    case "image":
      return { format: "pdf", from, why: "Keeps the picture and everything put on it" };
    case "pdf":
      return { format: "pdf", from, why: same };
    default:
      return { format: "pdf", from, why: "Keeps every page exactly as it looks" };
  }
}

export type SaveOptions = {
  pages?: readonly string[];
  flatten?: boolean;
  shrink?: "light" | "medium" | "strong";
  protect?: {
    open?: string;
    owner: string;
    allow: { print: boolean; copy: boolean; change: boolean; comment: boolean; fill: boolean };
  };
  /** For another format, or for printing: not a download of its own. */
  quiet?: boolean;
};

// ---------------------------------------------------------------- helpers

export const isImage = (file: File) =>
  file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|tiff?)$/i.test(file.name);

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** Every kind of file that can be opened as pages. */
export const OPENS =
  "application/pdf,.pdf,image/*,.heic,.heif,.docx,.doc,.odt,.rtf,.txt,.md,.markdown,.html,.htm,.pptx,.xlsx,.ods,.csv,.tsv,.epub";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "document";

export const messageOf = (error: unknown, other: string) =>
  error instanceof Error && error.message ? error.message : other;

export function blankPage(w: number, h: number): Page {
  return {
    id: uid("p"),
    source: null,
    index: 0,
    w,
    h,
    view: [1, 0, 0, -1, 0, h],
    rotate: 0,
    objects: [],
    cuts: {},
    covers: {},
    imageCuts: [],
    linkCuts: [],
    pathCuts: [],
  };
}

export const leadingOf = (style: Style) => Math.round(style.size * 1.22 * 10) / 10;

/** From a place on the page to its right margin: how wide a text there may grow. */
function roomRight(page: Page, x: number): number {
  const box = marginBox(page);
  const edge = page.margin ? box.x + box.w : box.x + box.w - 6;
  return Math.max(24, edge - x);
}

const turnOf = (angle: number) => ({ cos: Math.cos((angle * Math.PI) / 180), sin: Math.sin((angle * Math.PI) / 180) });

export const blockBox = (block: Block): Box =>
  bounds(corners(placement(block.x, block.y, block.angle), { x: 0, y: 0, w: block.w, h: block.h }));

export const pictureBox = (picture: PagePicture): Box =>
  bounds(corners(placement(picture.x, picture.y, picture.angle), { x: 0, y: 0, w: picture.w, h: picture.h }));

/** The words an object holds, for the clipboard. */
function wordsOf(object: EditObject): string {
  if (object.type === "text") return plainText(object.runs);
  if (object.type === "shape") return object.text ? plainText(object.text.runs) : "";
  if (object.type === "table")
    return object.cells
      .map((row) => row.map((cell) => (cell.covered ? "" : plainText(cell.runs).replace(/[\t\n]+/g, " "))).join("\t"))
      .join("\n");
  return object.type === "note" ? object.text : "";
}

export function bodyIn(object: EditObject | undefined, cell: CellAt | null): TextBody | null {
  if (!object) return null;
  if (object.type === "text") return object;
  if (object.type === "shape") return object.text ?? null;
  if (object.type === "table" && cell) return object.cells[cell.r]?.[cell.c] ?? null;
  return null;
}

/** The words of a shape, made when there are none yet. */
export function shapeText(shape: ShapeObject, style: Style): NonNullable<ShapeObject["text"]> {
  if (shape.text) return shape.text;
  // Dark shapes get light words.
  const dark = shape.fill ? lightness(shape.fill) < 0.45 : false;
  const own = { ...style, color: dark ? "#ffffff" : style.color };
  return { runs: [{ text: "", style: own }], align: "center", leading: leadingOf(own), valign: "middle", pad: 6 };
}

export function lightness(color: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Some letters of a text with their paragraphs. `inside`: they begin in the middle of one. */
function cutBody(body: TextBody, from: number, to: number, inside: boolean): TextBody {
  const runs = sliceRuns(body.runs, from, to);
  const style = runs[0]?.style ?? body.runs[0].style;
  if (!body.paras) return { ...body, runs: runs.length > 0 ? runs : [{ text: "", style }] };
  const first = paraAt(body.runs, from).index;
  const last = paraAt(body.runs, to).index;
  const marks = listMarks(body);
  const paras = allParas(body).slice(first, last + 1);
  if (inside && paras[0]) paras[0] = { ...paras[0], first: undefined, before: undefined, list: undefined };
  if (from > 0) {
    // Numbers go on where they were.
    const next = paras.findIndex((para) => para.list?.type === "number");
    if (next >= 0) {
      const own = paras[next].list;
      const value = listValue(marks, body, first + next);
      if (own && own.start === undefined && value !== undefined)
        paras[next] = { ...paras[next], list: { ...own, start: value, resume: true } };
    }
  }
  return { ...body, runs: runs.length > 0 ? tidyRuns(runs) : [{ text: "", style }], paras: tidyParas(paras) };
}

/** The count a numbered paragraph has. */
function listValue(
  marks: (string | null)[],
  body: Pick<TextBody, "runs" | "paras">,
  index: number,
): number | undefined {
  const own = paraOf(body, index).list;
  if (!own || own.type !== "number") return undefined;
  let count = 1;
  for (let i = index; i > 0; i -= 1) {
    const list = paraOf(body, i).list;
    if (!list) break;
    if (list.level < own.level) break;
    if (list.level === own.level) {
      if (list.mark !== own.mark || list.type !== own.type) break;
      if (list.start !== undefined) return list.start + count - 1;
      const before = paraOf(body, i - 1).list;
      if (before && before.level >= own.level) count += before.level === own.level ? 1 : 0;
      else break;
    }
  }
  const head = paraOf(body, 0).list;
  return index - count + 1 === 0 && head?.start !== undefined ? head.start + count - 1 : count;
}

const inset = (para: Para, by: number): Para => (by > 0.3 ? { ...para, left: (para.left ?? 0) + by } : para);

/** Texts one under the other as one text. */
function joined(list: readonly TextObject[]): TextBody {
  const [first, ...rest] = list;
  const runs = [...first.runs];
  const paras = allParas(first);
  for (const object of rest) {
    runs.push({ text: "\n", style: object.runs[0].style }, ...object.runs);
    paras.push(
      ...allParas(object).map((para) =>
        object.leading !== first.leading ? { ...para, leading: para.leading ?? object.leading } : para,
      ),
    );
  }
  return { runs: tidyRuns(runs), paras: tidyParas(paras), align: first.align, leading: first.leading };
}

const nearStyle = (bodies: Map<number, { object: TextObject }[]>): Style | undefined =>
  bodies.values().next().value?.[0]?.object.runs[0]?.style;

/** A line or shape of the page as an object of its own. */
function unitObject(unit: Unit): EditObject {
  const base = { id: uid("v"), angle: 0, ops: unit.ops, pristine: true };
  const [path] = unit.paths;
  if (unit.line) {
    const { x0, y0, x1, y1, width, color, dash } = unit.line;
    const line: ShapeObject = {
      ...base,
      type: "shape",
      kind: "line",
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
      flip: (x1 - x0) * (y1 - y0) < 0,
      opacity: path.alpha,
      stroke: color,
      fill: null,
      width,
      dash: dash.length === 0 ? "solid" : dash[0] < width * 1.6 ? "dot" : "dash",
    };
    return line;
  }
  const { box } = unit;
  if (unit.paths.length === 1 && isRect(path)) {
    const rect: ShapeObject = {
      ...base,
      type: "shape",
      kind: "rect",
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      opacity: path.alpha,
      stroke: path.stroke,
      fill: path.fill,
      width: path.stroke ? path.width : 0,
      dash: path.dash.length > 0 ? "dash" : "solid",
    };
    return rect;
  }
  const w = Math.max(0.01, box.w);
  const h = Math.max(0.01, box.h);
  const object: PathObject = {
    ...base,
    type: "path",
    x: box.x,
    y: box.y,
    w,
    h,
    opacity: path.alpha,
    path: unit.paths.flatMap((item) =>
      item.path.map((cmd): (typeof item.path)[number] => {
        if (cmd[0] === "Z") return cmd;
        const px = (v: number) => (v - box.x) / w;
        const py = (v: number) => (v - box.y) / h;
        if (cmd[0] === "C") return ["C", px(cmd[1]), py(cmd[2]), px(cmd[3]), py(cmd[4]), px(cmd[5]), py(cmd[6])];
        return [cmd[0], px(cmd[1]), py(cmd[2])];
      }),
    ),
    stroke: path.stroke,
    fill: path.fill,
    width: path.width,
    dash: path.dash,
    cap: path.cap,
    join: path.join,
    evenOdd: path.evenOdd,
  };
  return object;
}

/** Four corners, upright. */
function isRect(path: Unit["paths"][number]): boolean {
  const points: Point[] = [];
  for (const cmd of path.path) {
    if (cmd[0] === "C") return false;
    if (cmd[0] === "M" && points.length > 0) return false;
    if (cmd[0] !== "Z") points.push({ x: cmd[1], y: cmd[2] });
  }
  if (points.length < 4 || points.length > 5) return false;
  const { box } = path;
  return points.every(
    (p) =>
      (Math.abs(p.x - box.x) < 0.05 || Math.abs(p.x - box.x - box.w) < 0.05) &&
      (Math.abs(p.y - box.y) < 0.05 || Math.abs(p.y - box.y - box.h) < 0.05),
  );
}

/** Where a text has to be for its first line not to move when its size or spacing changes. */
export function firstLineStays(
  object: TextObject,
  runs: TextObject["runs"],
  leading: number,
  paras: TextObject["paras"] = object.paras,
): { x: number; y: number } {
  const base = (list: TextObject["runs"], own: number, all: TextObject["paras"]) => {
    const text = plainText(list);
    const end = text.indexOf("\n");
    const line = sliceRuns(list, 0, end < 0 ? text.length : end);
    return firstBaseline(paraSize(line.length > 0 ? line : list), all?.[0]?.leading ?? own);
  };
  const by = base(object.runs, object.leading, object.paras) - base(runs, leading, paras);
  return apply(placement(object.x, object.y, object.angle), 0, by);
}

/** The document with everything opened but unchanged put back. */
function withoutPristine(doc: DocState, keep?: ReadonlySet<string>): DocState {
  const drop = Object.values(doc.objects).filter((object) => object.pristine && !keep?.has(object.id));
  if (drop.length === 0) return doc;
  const ids = new Set(drop.map((object) => object.id));
  return {
    ...doc,
    objects: Object.fromEntries(Object.entries(doc.objects).filter(([id]) => !ids.has(id))),
    pages: doc.pages.map((page) => {
      const here = drop.filter((object) => page.objects.includes(object.id));
      if (here.length === 0) return page;
      const cuts = { ...page.cuts };
      const covers = { ...page.covers };
      const ops = new Set<number>();
      const pictures = new Set<number>();
      for (const object of here) {
        if (object.type === "text" && object.block) {
          delete cuts[object.block];
          delete covers[object.block];
        } else if (object.type === "image") object.ops?.forEach((op) => pictures.add(op));
        else object.ops?.forEach((op) => ops.add(op));
      }
      return {
        ...page,
        cuts,
        covers,
        pathCuts: ops.size > 0 ? page.pathCuts.filter((op) => !ops.has(op)) : page.pathCuts,
        imageCuts: pictures.size > 0 ? page.imageCuts.filter((index) => !pictures.has(index)) : page.imageCuts,
        objects: page.objects.filter((id) => !ids.has(id)),
      };
    }),
  };
}

function removeObjects(doc: DocState, ids: ReadonlySet<string>): DocState {
  if (ids.size === 0) return doc;
  return {
    ...doc,
    objects: Object.fromEntries(Object.entries(doc.objects).filter(([id]) => !ids.has(id))),
    pages: doc.pages.map((page) =>
      page.objects.some((id) => ids.has(id)) ? { ...page, objects: page.objects.filter((id) => !ids.has(id)) } : page,
    ),
  };
}

/** Takes a block off the page. Its text goes under everything added since, unless it is being moved. */
function addCut(
  doc: DocState,
  pageId: string,
  key: string,
  block: Block,
  cover: string,
  object: TextObject | null,
  front = false,
): DocState {
  const place = (ids: readonly string[]) => {
    if (!object) return [...ids];
    // After what is already out of the page itself, so it keeps its reading order.
    const own = ids.findIndex((id) => {
      const item = doc.objects[id];
      return !(item?.type === "text" && item.block) && !item?.ops && item?.type !== "image";
    });
    const at = front || own < 0 ? ids.length : own;
    return [...ids.slice(0, at), object.id, ...ids.slice(at)];
  };
  return {
    ...doc,
    objects: object ? { ...doc.objects, [object.id]: object } : doc.objects,
    pages: doc.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            cuts: { ...page.cuts, [key]: block.ranges },
            covers: { ...page.covers, [key]: cover },
            objects: place(page.objects),
          }
        : page,
    ),
  };
}

/** The look of what is selected, for the format bar. */
export function styleOfSelection(store: EditorStore): Style | null {
  const { editing, selection, range, pending, cell, area } = store.view;
  if (pending) return pending;
  const id =
    editing ?? selection.find((item) => ["text", "table", "shape"].includes(store.doc.objects[item]?.type ?? ""));
  const object = id ? store.doc.objects[id] : undefined;
  const body = editing
    ? bodyIn(object, cell)
    : object?.type === "table"
      ? bodyIn(object, area ? { r: area.r0, c: area.c0 } : { r: 0, c: 0 })
      : bodyIn(object, null);
  if (!body) return null;
  if (!editing || !range) return body.runs[0]?.style ?? null;
  let at = 0;
  const text = plainText(body.runs);
  // At the start of a line the letter after the caret counts, elsewhere the one before it.
  const caret = range.from === range.to;
  const want = caret && range.from > 0 && text[range.from - 1] !== "\n" ? range.from - 1 : range.from;
  for (const run of body.runs) {
    const end = at + run.text.length;
    if (want < end) return run.style;
    at = end;
  }
  return body.runs[body.runs.length - 1]?.style ?? null;
}

/** The paragraph the caret is in, or the first one of what is selected. */
export function paraOfSelection(store: EditorStore): { body: TextBody; para: Para; index: number } | null {
  const { editing, selection, range, cell, area } = store.view;
  const id =
    editing ?? selection.find((item) => ["text", "table", "shape"].includes(store.doc.objects[item]?.type ?? ""));
  const object = id ? store.doc.objects[id] : undefined;
  const at = editing ? cell : object?.type === "table" ? { r: area?.r0 ?? 0, c: area?.c0 ?? 0 } : null;
  const body = bodyIn(object, at);
  if (!body) return null;
  const index = editing && range ? paraAt(body.runs, range.from).index : 0;
  return { body, para: paraOf(body, index), index };
}

export function useEditor<T>(store: EditorStore, select: (store: EditorStore) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store),
    () => select(store),
  );
}

/** Fonts of the open files, one per look. */
export function documentFonts(store: EditorStore): PdfFont[] {
  const out = new Map<string, PdfFont>();
  for (const page of store.doc.pages) {
    if (page.source === null) continue;
    for (const glyph of store.readyText(page)?.glyphs ?? []) {
      const font = pdfFont(glyph.font);
      if (font?.codes && !out.has(font.name)) out.set(font.name, font);
    }
  }
  return [...out.values()];
}

export const SYMBOLS: ReadonlySet<ShapeKind> = new Set<ShapeKind>(["check", "cross", "dot"]);
