"use client";

import { useSyncExternalStore } from "react";
import type { PDFDocument as LibDocument } from "pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { forgetPdfFonts, pdfFont, registerLibrary, type PdfFont } from "./engine/fonts";
import { cutKey, cutsOf, hasCuts } from "./engine/cuts";
import { firstBaseline, readText as readPageText, type Block, type PageText } from "./engine/extract";
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
} from "./engine/matrix";
import type { PageTree } from "./engine/content";
import { flowLines, measureBox } from "./engine/text-dom";
import {
  DEFAULT_STYLE,
  pageOf,
  plainText,
  replaceText,
  shownSize,
  styleRuns,
  uid,
  type Asset,
  type DocState,
  type EditObject,
  type ImageObject,
  type LinkObject,
  type Page,
  type ShapeKind,
  type Source,
  type Style,
  type TextObject,
  type Tool,
} from "./model";

export type Prefs = {
  text: Style;
  pen: { color: string; width: number };
  marker: { color: string; width: number };
  shape: { stroke: string | null; fill: string | null; width: number; dash: boolean };
  mark: { highlight: string; underline: string; strike: string };
  /** What erasing leaves: a colour, or null for whatever is around it. */
  white: string | null;
  symbol: string;
};

export type View = {
  tool: Tool;
  selection: string[];
  editing: string | null;
  /** The picture being cropped. */
  crop: string | null;
  /** Characters selected inside the text being edited. */
  range: { from: number; to: number } | null;
  /** Style for the next letters typed. */
  pending: Style | null;
  zoom: number;
  fit: "width" | "page" | null;
  /** The page most in view. */
  page: string | null;
  prefs: Prefs;
  busy: { label: string; progress: number | null } | null;
  error: string | null;
  opening: boolean;
  dirty: boolean;
  saved: number;
  find: { open: boolean; query: string; matchCase: boolean; hits: Hit[]; at: number; searching: boolean };
  guides: { page: string; x: number | null; y: number | null } | null;
  /** Scroll this into view once. */
  goTo: { page: string; box?: Box; n: number } | null;
};

export type Hit = { page: string; block?: string; object?: string; box: Box };

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

const VIEW: View = {
  tool: "select",
  selection: [],
  editing: null,
  crop: null,
  range: null,
  pending: null,
  zoom: 1,
  fit: "width",
  page: null,
  prefs: {
    text: DEFAULT_STYLE,
    pen: { color: "#1d1c1f", width: 2 },
    marker: { color: "#ffd23f", width: 14 },
    shape: { stroke: "#f2552c", fill: null, width: 2, dash: false },
    mark: { highlight: "#ffd23f", underline: "#f2552c", strike: "#d8431b" },
    white: null,
    symbol: "#1d1c1f",
  },
  busy: null,
  error: null,
  opening: false,
  dirty: false,
  saved: 0,
  find: { open: false, query: "", matchCase: false, hits: [], at: 0, searching: false },
  guides: null,
  goTo: null,
};

const A4 = { w: 595.28, h: 841.89 };
const HISTORY = 120;
const KEPT_TEXTS = 90;

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

  /** Elements of the pages on screen, and what is drawn on them. */
  readonly sheets = new Map<string, HTMLElement>();
  readonly canvases = new Map<string, { canvas: HTMLCanvasElement; scale: number }>();
  /** What the pages scroll in. */
  scroller: HTMLElement | null = null;
  /** Where to put the caret when a text opens. */
  caret: { x: number; y: number } | null = null;

  private past: Entry[] = [];
  private future: DocState[] = [];
  /** The document as it was before a block was merely opened. */
  private base: DocState | null = null;
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
  private notes = new Map<string, Promise<{ links: PageLink[]; fields: PageField[] }>>();
  private clip: { objects: EditObject[]; page: string } | null = null;
  /** What was put on the clipboard with it, to know it again. */
  clipText = "";
  private chain: Promise<unknown> = Promise.resolve();
  private counter = 0;
  private patchCanvas: HTMLCanvasElement | null = null;

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
    this.view = {
      ...this.view,
      dirty: true,
      selection: this.view.selection.filter(has),
      crop: null,
      editing: this.view.editing && has(this.view.editing) ? this.view.editing : null,
      range: null,
      pending: null,
    };
    if (!this.doc.pages.some((page) => page.id === this.view.page))
      this.view = { ...this.view, page: this.doc.pages[0]?.id ?? null };
    this.emit();
  }

  patch<T extends EditObject>(id: string, patch: Partial<T> | ((object: T) => Partial<T>), key: string | null = null) {
    this.commit((doc) => this.patched(doc, id, patch), key);
  }

  private patched<T extends EditObject>(
    doc: DocState,
    id: string,
    patch: Partial<T> | ((object: T) => Partial<T>),
  ): DocState {
    const object = doc.objects[id] as T | undefined;
    if (!object) return doc;
    const change = typeof patch === "function" ? patch(object) : patch;
    const next = { ...object, ...change } as T;
    if (next.type === "text" && (next as TextObject).pristine) (next as TextObject).pristine = false;
    return { ...doc, objects: { ...doc.objects, [id]: next } };
  }

  patchMany(ids: readonly string[], patch: (object: EditObject) => Partial<EditObject>, key: string | null = null) {
    this.commit(
      (doc) =>
        ids.reduce((next, id) => this.patched(next, id, patch as (object: EditObject) => Partial<EditObject>), doc),
      key,
    );
  }

  add(pageId: string, object: EditObject, select = true) {
    this.commit((doc) => ({
      ...doc,
      objects: { ...doc.objects, [object.id]: object },
      pages: doc.pages.map((page) => (page.id === pageId ? { ...page, objects: [...page.objects, object.id] } : page)),
    }));
    if (select) this.select([object.id]);
  }

  // -------------------------------------------------------------- choosing

  select(ids: string[], editing: string | null = null) {
    const keep = new Set(ids);
    if (editing) keep.add(editing);
    this.settle(keep);
    const now = this.view;
    if (now.editing === editing && now.selection.length === ids.length && ids.every((id, i) => id === now.selection[i]))
      return;
    this.setView({ selection: ids, editing, crop: null, range: null, pending: null });
  }

  setTool(tool: Tool) {
    if (tool !== "select") this.select([]);
    this.setView({ tool });
  }

  /** Blocks opened and left as they were go back to being the page's own; empty text goes. */
  private settle(keep: ReadonlySet<string>) {
    const empty: string[] = [];
    for (const object of Object.values(this.doc.objects)) {
      if (object.type === "text" && !object.pristine && !keep.has(object.id) && plainText(object.runs).trim() === "")
        empty.push(object.id);
    }
    const left = withoutPristine(this.doc, keep);
    if (left !== this.doc) {
      this.doc = left;
      // Others may still be open: their "before" is this document without them.
      const open = Object.values(this.doc.objects).some((object) => object.type === "text" && object.pristine);
      this.base = open ? withoutPristine(this.doc) : null;
      this.emit();
    }
    if (empty.length > 0) this.silent((doc) => removeObjects(doc, new Set(empty)));
  }

  remove(ids: readonly string[]) {
    if (ids.length === 0) return;
    this.commit((doc) => removeObjects(doc, new Set(ids)));
    this.setView({ selection: [], editing: null, crop: null, range: null });
  }

  order(ids: readonly string[], where: "front" | "back") {
    const set = new Set(ids);
    this.commit((doc) => ({
      ...doc,
      pages: doc.pages.map((page) => {
        const mine = page.objects.filter((id) => set.has(id));
        if (mine.length === 0) return page;
        const rest = page.objects.filter((id) => !set.has(id));
        return { ...page, objects: where === "front" ? [...rest, ...mine] : [...mine, ...rest] };
      }),
    }));
  }

  copy(ids: readonly string[]) {
    const objects = ids.map((id) => this.doc.objects[id]).filter((object): object is EditObject => Boolean(object));
    if (objects.length === 0) return;
    const page = pageOf(this.doc, objects[0].id);
    this.clip = { objects, page: page?.id ?? "" };
    const text = objects
      .map((object) => (object.type === "text" ? plainText(object.runs) : ""))
      .filter(Boolean)
      .join("\n");
    this.clipText = text || " ";
    void navigator.clipboard?.writeText(this.clipText).catch(() => undefined);
  }

  get hasClip() {
    return this.clip !== null;
  }

  paste(pageId: string | null, objects = this.clip?.objects ?? [], nudge = 12) {
    const page = (pageId && this.page(pageId)) || this.doc.pages[0];
    if (!page || objects.length === 0) return;
    const made = objects.map((object): EditObject => {
      const copy = { ...object, id: uid("o"), x: object.x + nudge, y: object.y + nudge } as EditObject;
      if (copy.type === "text") {
        delete copy.block;
        copy.pristine = false;
      }
      copy.x = Math.min(Math.max(copy.x, -copy.w + 20), page.w - 20);
      copy.y = Math.min(Math.max(copy.y, -copy.h + 20), page.h - 20);
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
    const style = { ...this.view.prefs.text, tracking: 0, rise: 0 };
    const leading = Math.round(style.size * 1.25 * 10) / 10;
    const long = text.length > 60;
    const w = long ? Math.min(380, page.w * 0.7) : 10;
    const object: TextObject = {
      id: uid("t"),
      type: "text",
      x: Math.max(0, x - (long ? w / 2 : 60)),
      y,
      w,
      h: leading,
      angle: 0,
      opacity: 1,
      runs: [{ text, style }],
      align: "left",
      leading,
      wrap: long,
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
      const objects = { ...doc.objects };
      for (const id of ids)
        if (objects[id])
          objects[id] = { ...objects[id], x: objects[id].x + shift.x, y: objects[id].y + shift.y } as EditObject;
      return {
        ...doc,
        objects,
        pages: doc.pages.map((page) => {
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

  /** `next`: with only a caret, the change is for the letters typed from here; otherwise for the whole text. */
  styleSelection(patch: (style: Style) => Style, key: string | null = null, next = false) {
    const { selection, editing, range } = this.view;
    const ids = editing ? [editing] : selection.filter((id) => this.doc.objects[id]?.type === "text");
    if (ids.length === 0) {
      this.setPrefs({ text: patch(this.view.prefs.text) });
      return;
    }
    const caret = editing !== null && range !== null && range.from === range.to;
    if (caret && next) {
      const object = this.doc.objects[ids[0]] as TextObject;
      const length = plainText(object.runs).length;
      if (length > 0) {
        this.setView({ pending: patch(this.view.pending ?? styleOfSelection(this) ?? this.view.prefs.text) });
        return;
      }
    }
    this.commit((before) => {
      let doc = before;
      for (const id of ids) {
        doc = this.patched<TextObject>(doc, id, (object) => {
          const length = plainText(object.runs).length;
          const part = editing && range && !caret;
          const from = part ? range.from : 0;
          const to = part ? range.to : length;
          const before = Math.max(...object.runs.map((run) => run.style.size));
          const runs =
            length === 0
              ? object.runs.map((run) => ({ ...run, style: patch(run.style) }))
              : styleRuns(object.runs, from, to, patch);
          const after = Math.max(...runs.map((run) => run.style.size));
          // Line spacing keeps its proportion, and the first line its place.
          const leading = before > 0 ? (object.leading * after) / before : object.leading;
          return { runs, leading, ...firstLineStays(object, runs, leading) };
        });
      }
      return doc;
    }, key);
    const look = styleOfSelection(this);
    if (look && !look.font.startsWith("pdf:")) this.setPrefs({ text: { ...look, tracking: 0, rise: 0 } });
  }

  textBlock(patch: Partial<TextObject> | ((object: TextObject) => Partial<TextObject>), key: string | null = null) {
    const { selection, editing } = this.view;
    const ids = (editing ? [editing] : selection).filter((id) => this.doc.objects[id]?.type === "text");
    if (ids.length === 0) return;
    this.commit((doc) => ids.reduce((next, id) => this.patched<TextObject>(next, id, patch), doc), key);
  }

  /** Distance between lines, as a share of the text size. */
  spaceLines(times: number) {
    this.textBlock((object) => {
      const leading = times * Math.max(1, ...object.runs.map((run) => run.style.size));
      return { leading, ...firstLineStays(object, object.runs, leading) };
    }, "leading");
  }

  addText(pageId: string, x: number, y: number) {
    const style = { ...this.view.prefs.text, tracking: 0, rise: 0 };
    const leading = Math.round(style.size * 1.25 * 10) / 10;
    const object: TextObject = {
      id: uid("t"),
      type: "text",
      x,
      y: y - leading / 2,
      w: 10,
      h: leading,
      angle: 0,
      opacity: 1,
      runs: [{ text: "", style }],
      align: "left",
      leading,
      wrap: false,
    };
    this.add(pageId, object, false);
    this.setView({ tool: "select" });
    this.select([object.id], object.id);
    return object.id;
  }

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

  private async blockObject(block: Block): Promise<TextObject> {
    const laid = await flowLines(block.lines, {
      w: block.w,
      align: block.align,
      leading: block.leading,
      size: block.size,
    });
    let { w } = laid;
    const box = measureBox({ ...laid, align: block.align, leading: block.leading });
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
      runs: laid.runs,
      align: block.align,
      leading: block.leading,
      wrap: laid.wrap,
      indent: laid.indent,
      hang: laid.hang,
      block: block.key,
      pristine: true,
    };
  }

  /** Takes a block off the page and makes it editable. Nothing is kept if it is left unchanged. */
  async openBlock(pageId: string, key: string, cover: string, front = false): Promise<string | null> {
    const page = this.page(pageId);
    const block = page && this.block(page, key);
    if (!page || !block || page.cuts[key]) return null;
    const object = await this.blockObject(block);
    if (this.page(pageId)?.cuts[key]) return null;
    this.silent((doc) => addCut(doc, pageId, key, block, cover, object, front), true);
    return object.id;
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
    if (!drawn) return "#ffffff";
    const { scale, canvas } = drawn;
    const x0 = Math.max(0, Math.floor((box.x - 2) * scale));
    const y0 = Math.max(0, Math.floor((box.y - 1) * scale));
    const x1 = Math.min(canvas.width, Math.ceil((box.x + box.w + 2) * scale));
    const y1 = Math.min(canvas.height, Math.ceil((box.y + box.h + 1) * scale));
    if (x1 - x0 < 2 || y1 - y0 < 2) return "#ffffff";
    try {
      // Copied out first: reading the big canvas itself would slow its drawing down.
      this.patchCanvas ??= document.createElement("canvas");
      const bench = this.patchCanvas;
      bench.width = x1 - x0;
      bench.height = y1 - y0;
      const context = bench.getContext("2d", { willReadFrequently: true });
      if (!context) return "#ffffff";
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
      return "#ffffff";
    }
  }

  // -------------------------------------------------------------- pictures

  async addImageFile(file: Blob, pageId: string | null, at?: { x: number; y: number }) {
    const page =
      (pageId && this.page(pageId)) || this.doc.pages.find((item) => item.id === this.view.page) || this.doc.pages[0];
    if (!page) return;
    const asset = await this.makeAsset(file);
    const room = { w: page.w * 0.6, h: page.h * 0.5 };
    const scale = Math.min(1, room.w / (asset.w * 0.75), room.h / (asset.h * 0.75));
    const w = asset.w * 0.75 * scale;
    const h = asset.h * 0.75 * scale;
    const place = at ?? { x: page.w / 2, y: page.h / 2 };
    const object: ImageObject = {
      id: uid("i"),
      type: "image",
      asset: asset.id,
      x: Math.max(0, Math.min(page.w - w, place.x - w / 2)),
      y: Math.max(0, Math.min(page.h - h, place.y - h / 2)),
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
    }
    return job;
  }

  /** Makes a picture of the PDF movable. */
  async openPicture(pageId: string, picture: PagePicture, key: string | null = null): Promise<string | null> {
    const page = this.page(pageId);
    if (!page || page.source === null || page.imageCuts.includes(picture.index)) return null;
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
      await proxy.render({ canvas, viewport, background: "rgba(0,0,0,0)" }).promise;
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      void pdf.destroy();
    }
    if (!blob) return null;
    const asset = await this.makeAsset(blob, { source: page.source, page: page.index, picture: picture.index });
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
    };
    // Words that lie on the picture come along, or it would hide them.
    const whole = bounds(
      corners(placement(picture.x, picture.y, picture.angle), { x: 0, y: 0, w: picture.w, h: picture.h }),
    );
    const above: { block: Block; object: TextObject }[] = [];
    for (const block of this.readyText(page)?.blocks ?? []) {
      if (page.cuts[block.key]) continue;
      const box = bounds(corners(placement(block.x, block.y, block.angle), { x: 0, y: 0, w: block.w, h: block.h }));
      const shared = intersect(box, whole);
      if (shared.w > 0 && shared.h > 0 && shared.w * shared.h > box.w * box.h * 0.15)
        above.push({ block, object: { ...(await this.blockObject(block)), pristine: false } });
    }
    this.commit((doc) => {
      let next: DocState = {
        ...doc,
        objects: { ...doc.objects, [object.id]: object },
        pages: doc.pages.map((item) =>
          item.id === pageId ? { ...item, imageCuts: [...item.imageCuts, picture.index] } : item,
        ),
      };
      for (const item of above) next = addCut(next, pageId, item.block.key, item.block, "#ffffff", item.object);
      return {
        ...next,
        pages: next.pages.map((item) =>
          item.id === pageId ? { ...item, objects: [object.id, ...item.objects] } : item,
        ),
      };
    }, key);
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

  private async openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
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

  /** Opens a PDF and gives back its pages. */
  private async addSource(file: File): Promise<Page[]> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pdf: PDFDocumentProxy;
    try {
      pdf = await this.openPdf(bytes);
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      throw new EditError(
        name === "PasswordException"
          ? `${file.name} needs a password. Remove it, then open the file again.`
          : `${file.name} could not be read as a PDF. It may be damaged.`,
      );
    }
    const id = uid("s");
    const source: Source = { id, name: file.name, bytes, pdf };
    this.sources.set(id, source);
    try {
      await this.lib(id);
    } catch (error) {
      this.sources.delete(id);
      this.libs.delete(id);
      void pdf.destroy();
      const message = error instanceof Error ? error.message : "";
      throw new EditError(
        /encrypt/i.test(message)
          ? `${file.name} is protected against changes. Remove the protection, then open it again.`
          : `${file.name} is damaged in a way that stops it from being edited.`,
      );
    }
    const pages: Page[] = [];
    for (let from = 0; from < pdf.numPages; from += 24) {
      const proxies = await Promise.all(
        Array.from({ length: Math.min(24, pdf.numPages - from) }, (_, i) => pdf.getPage(from + i + 1)),
      );
      proxies.forEach((page, i) => {
        const viewport = page.getViewport({ scale: 1 });
        pages.push({
          id: uid("p"),
          source: id,
          index: from + i,
          w: viewport.width,
          h: viewport.height,
          view: viewport.transform as Matrix,
          rotate: 0,
          objects: [],
          cuts: {},
          covers: {},
          imageCuts: [],
          linkCuts: [],
        });
      });
    }
    return pages;
  }

  async open(file: File) {
    this.setView({ opening: true, error: null });
    registerLibrary();
    try {
      const pages = await this.addSource(file);
      this.close(false, pages[0]?.source ?? null);
      this.primary = pages[0]?.source ?? null;
      this.name = file.name.replace(/\.pdf$/i, "") || "document";
      this.doc = { ...EMPTY, pages };
      this.view = { ...VIEW, zoom: this.view.zoom, fit: "width", prefs: this.view.prefs, page: pages[0]?.id ?? null };
      this.emit();
      void import("./engine/export");
    } catch (error) {
      this.setView({
        opening: false,
        error: error instanceof Error ? error.message : "That file could not be opened.",
      });
    }
  }

  /** A new document of one empty page. */
  startBlank() {
    registerLibrary();
    this.close(false);
    this.name = "document";
    this.doc = { ...EMPTY, pages: [blankPage(A4.w, A4.h)] };
    this.view = { ...VIEW, zoom: this.view.zoom, prefs: this.view.prefs, page: this.doc.pages[0].id };
    this.emit();
  }

  close(emit = true, keep: string | null = null) {
    for (const backdrop of this.backdrops.values())
      void backdrop.job.then((item) => item?.pdf?.destroy()).catch(() => undefined);
    for (const [id, source] of this.sources) {
      if (id === keep) continue;
      forgetPdfFonts(id);
      void source.pdf.destroy();
      this.sources.delete(id);
      this.libs.delete(id);
    }
    for (const asset of this.assets.values()) URL.revokeObjectURL(asset.url);
    this.assets.clear();
    this.backdrops.clear();
    this.texts.clear();
    this.textNow.clear();
    this.pictures.clear();
    this.notes.clear();
    this.bare.clear();
    this.past = [];
    this.future = [];
    this.base = null;
    this.clip = null;
    this.primary = null;
    if (emit) {
      this.doc = EMPTY;
      this.view = { ...VIEW, zoom: this.view.zoom, prefs: this.view.prefs };
      this.emit();
    }
  }

  /** Adds PDFs and pictures as pages, before `at` (the end when left out). */
  async insertFiles(files: readonly File[], at?: number) {
    const pdfs = files.filter(isPdf);
    const pictures = files.filter((file) => !isPdf(file) && isImage(file));
    if (pdfs.length + pictures.length === 0) {
      this.setView({ error: "Only PDFs and pictures can be added as pages." });
      return;
    }
    registerLibrary();
    this.setView({ busy: { label: "Adding pages", progress: null }, error: null });
    try {
      const pages: Page[] = [];
      const objects: Record<string, EditObject> = {};
      for (const file of files) {
        if (pdfs.includes(file)) pages.push(...(await this.addSource(file)));
        else if (pictures.includes(file)) {
          const asset = await this.makeAsset(file);
          const like = this.doc.pages[0];
          const tall = asset.h >= asset.w;
          const size = like ? { w: Math.min(like.w, like.h), h: Math.max(like.w, like.h) } : A4;
          const w = tall ? size.w : size.h;
          const h = tall ? size.h : size.w;
          const scale = Math.min(w / asset.w, h / asset.h);
          const page = blankPage(w, h);
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
          objects[object.id] = object;
          pages.push({ ...page, objects: [object.id] });
        }
      }
      if (this.doc.pages.length === 0) {
        this.doc = { ...EMPTY, pages, objects };
        this.primary = pages.find((page) => page.source !== null)?.source ?? null;
        this.name = files[0].name.replace(/\.[^.]+$/, "") || "document";
        this.view = { ...VIEW, zoom: this.view.zoom, prefs: this.view.prefs, page: pages[0]?.id ?? null };
        this.emit();
        return;
      }
      this.commit((doc) => {
        const list = [...doc.pages];
        list.splice(at ?? list.length, 0, ...pages);
        return { ...doc, pages: list, objects: { ...doc.objects, ...objects } };
      });
      this.setView({ busy: null, goTo: pages[0] ? { page: pages[0].id, n: ++this.counter } : null });
    } catch (error) {
      this.setView({ busy: null, error: error instanceof Error ? error.message : "Those pages could not be added." });
    }
  }

  addBlank(at?: number) {
    const near = this.doc.pages[Math.max(0, (at ?? this.doc.pages.length) - 1)];
    const size = near ? shownSize(near) : A4;
    const page = blankPage(size.w, size.h);
    this.commit((doc) => {
      const list = [...doc.pages];
      list.splice(at ?? list.length, 0, page);
      return { ...doc, pages: list };
    });
    this.setView({ goTo: { page: page.id, n: ++this.counter } });
    return page.id;
  }

  deletePages(ids: readonly string[]) {
    if (ids.length >= this.doc.pages.length) {
      this.setView({ error: "A PDF needs at least one page. Add another before deleting this one." });
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
      };
    });
    const next = this.doc.pages[Math.min(Math.max(0, at), this.doc.pages.length - 1)];
    this.setView({ page: next?.id ?? null, goTo: next ? { page: next.id, n: ++this.counter } : null });
  }

  duplicatePage(id: string) {
    const page = this.page(id);
    if (!page) return;
    const objects: Record<string, EditObject> = {};
    const ids = page.objects.map((from) => {
      const copy = { ...this.doc.objects[from], id: uid("o") } as EditObject;
      objects[copy.id] = copy;
      return copy.id;
    });
    const made: Page = { ...page, id: uid("p"), objects: ids };
    this.commit((doc) => {
      const list = [...doc.pages];
      list.splice(list.findIndex((item) => item.id === id) + 1, 0, made);
      return { ...doc, pages: list, objects: { ...doc.objects, ...objects } };
    });
    this.setView({ goTo: { page: made.id, n: ++this.counter } });
  }

  rotatePage(id: string, by: 90 | -90) {
    this.commit((doc) => ({
      ...doc,
      pages: doc.pages.map((page) =>
        page.id === id ? { ...page, rotate: ((((page.rotate + by) % 360) + 360) % 360) as Page["rotate"] } : page,
      ),
    }));
  }

  movePage(id: string, to: number) {
    this.commit((doc) => {
      const from = doc.pages.findIndex((page) => page.id === id);
      if (from < 0) return doc;
      const list = [...doc.pages];
      const [page] = list.splice(from, 1);
      const at = Math.max(0, Math.min(list.length, to > from ? to - 1 : to));
      if (at === from) return doc;
      list.splice(at, 0, page);
      return { ...doc, pages: list };
    });
  }

  show(page: string, box?: Box) {
    this.setView({ goTo: { page, box, n: ++this.counter } });
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
    const plain = key === "||";
    const job = plain
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
          const cut = cutPage(bare.page, bare.tree, text.shows, cuts);
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

  async find(query: string, matchCase = this.view.find.matchCase, quiet = false) {
    this.setView({ find: { ...this.view.find, query, matchCase, searching: query !== "" } });
    if (query === "") {
      this.setView({ find: { ...this.view.find, hits: [], at: 0, searching: false } });
      return;
    }
    const hits: Hit[] = [];
    for (const page of this.doc.pages) {
      if (page.source !== null) {
        const text = await this.textOf(page.source, page.index).catch(() => null);
        for (const block of text?.blocks ?? []) {
          if (page.cuts[block.key] || !matches(block.text, query, matchCase)) continue;
          hits.push({
            page: page.id,
            block: block.key,
            box: bounds(corners(placement(block.x, block.y, block.angle), { x: 0, y: 0, w: block.w, h: block.h })),
          });
        }
      }
      for (const id of page.objects) {
        const object = this.doc.objects[id];
        if (object?.type === "text" && matches(plainText(object.runs), query, matchCase))
          hits.push({ page: page.id, object: id, box: objectBounds(object) });
      }
      if (this.view.find.query !== query || this.view.find.matchCase !== matchCase) return;
    }
    const at = quiet ? Math.min(this.view.find.at, Math.max(0, hits.length - 1)) : 0;
    this.setView({ find: { ...this.view.find, hits, at, searching: false } });
    if (!quiet && hits[0]) this.show(hits[0].page, hits[0].box);
  }

  findStep(by: 1 | -1) {
    const { hits, at } = this.view.find;
    if (hits.length === 0) return;
    const next = (at + by + hits.length) % hits.length;
    this.setView({ find: { ...this.view.find, at: next } });
    this.show(hits[next].page, hits[next].box);
  }

  /** Replaces in the hits given, as one step. Returns how many words changed. */
  async replace(
    hits: readonly Hit[],
    query: string,
    value: string,
    matchCase: boolean,
    cover: (page: Page, block: Block) => string,
  ): Promise<number> {
    if (query === "" || hits.length === 0) return 0;
    this.select([]);
    const opened: { hit: Hit; object: TextObject; block: Block }[] = [];
    for (const hit of hits) {
      const page = this.page(hit.page);
      if (page && page.source !== null && hit.block) await this.textOf(page.source, page.index);
      const block = page && hit.block ? this.block(page, hit.block) : null;
      if (block && page) opened.push({ hit, object: await this.blockObject(block), block });
    }
    let count = 0;
    const swap = (object: TextObject): TextObject => {
      let runs = object.runs;
      const test = finder(query, matchCase);
      const text = plainText(runs);
      const found: { from: number; to: number }[] = [];
      let match: RegExpExecArray | null;
      while ((match = test.exec(text))) {
        found.push({ from: match.index, to: match.index + match[0].length });
        if (match[0].length === 0) break;
      }
      for (const { from, to } of found.reverse()) {
        runs = replaceText(runs, from, to, value);
        count += 1;
      }
      return { ...object, runs, pristine: false };
    };
    this.commit((doc) => {
      let next = doc;
      for (const { hit, object, block } of opened) {
        const page = next.pages.find((item) => item.id === hit.page);
        if (page) next = addCut(next, hit.page, block.key, block, cover(page, block), swap(object));
      }
      for (const hit of hits) {
        const object = hit.object ? next.objects[hit.object] : null;
        if (object?.type === "text") next = { ...next, objects: { ...next.objects, [object.id]: swap(object) } };
      }
      return next;
    });
    return count;
  }

  // -------------------------------------------------------------- saving

  async save(): Promise<Uint8Array> {
    this.select([]);
    this.setView({ busy: { label: "Saving your PDF", progress: 0 }, error: null });
    try {
      const { exportPdf } = await import("./engine/export");
      const bytes = await exportPdf({
        doc: this.doc,
        sources: this.sources,
        assets: this.assets,
        primary: this.primary,
        textOf: this.textOf,
        onProgress: (done, total) => this.setView({ busy: { label: "Saving your PDF", progress: done / total } }),
      });
      this.setView({ busy: null, dirty: false, saved: this.view.saved + 1 });
      return bytes;
    } catch (error) {
      this.setView({ busy: null, error: error instanceof Error ? error.message : "The PDF could not be saved." });
      throw error;
    }
  }
}

// ---------------------------------------------------------------- helpers

export const isImage = (file: File) =>
  file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|tiff?)$/i.test(file.name);

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

function blankPage(w: number, h: number): Page {
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
  };
}

/** Where a text has to be for its first line not to move when its size or spacing changes. */
function firstLineStays(object: TextObject, runs: TextObject["runs"], leading: number): { x: number; y: number } {
  const size = (list: TextObject["runs"]) => Math.max(1, ...list.map((run) => run.style.size));
  const by = firstBaseline(size(object.runs), object.leading) - firstBaseline(size(runs), leading);
  return apply(placement(object.x, object.y, object.angle), 0, by);
}

/** The document with every opened-but-unchanged block put back. */
function withoutPristine(doc: DocState, keep?: ReadonlySet<string>): DocState {
  const drop = Object.values(doc.objects).filter(
    (object): object is TextObject => object.type === "text" && Boolean(object.pristine) && !keep?.has(object.id),
  );
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
      for (const object of here) {
        if (!object.block) continue;
        delete cuts[object.block];
        delete covers[object.block];
      }
      return { ...page, cuts, covers, objects: page.objects.filter((id) => !ids.has(id)) };
    }),
  };
}

function removeObjects(doc: DocState, ids: ReadonlySet<string>): DocState {
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
    // After the page's own text that is already out, so it keeps its reading order.
    const own = ids.findIndex((id) => {
      const item = doc.objects[id];
      return !(item?.type === "text" && item.block) && item?.type !== "image";
    });
    let at = front || own < 0 ? ids.length : own;
    if (!front) while (at > 0 && doc.objects[ids[at - 1]]?.type === "image") at -= 1;
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

function finder(query: string, matchCase: boolean): RegExp {
  const text = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(text, matchCase ? "g" : "gi");
}

const matches = (text: string, query: string, matchCase: boolean) => finder(query, matchCase).test(text);

/** The look of what is selected, for the format bar. */
export function styleOfSelection(store: EditorStore): Style | null {
  const { editing, selection, range, pending } = store.view;
  if (pending) return pending;
  const id = editing ?? selection.find((item) => store.doc.objects[item]?.type === "text");
  const object = id ? store.doc.objects[id] : null;
  if (object?.type !== "text") return null;
  if (!editing || !range) return object.runs[0]?.style ?? null;
  let at = 0;
  for (const run of object.runs) {
    const end = at + run.text.length;
    if (range.from === range.to ? range.from <= end && run.text.length > 0 : range.from < end) return run.style;
    at = end;
  }
  return object.runs[object.runs.length - 1]?.style ?? null;
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
