import { objectBounds, type Box } from "./engine/matrix";
import { paraSize } from "./engine/text-dom";
import { changeCase, clearList, spaced, stepParas, toggleList, type Case } from "./engine/typing";
import {
  applyLook,
  divideCell,
  evenCols,
  evenRows,
  insertCols,
  insertRows,
  mergeCells,
  moveRows,
  newTable,
  nextCell,
  removeCols,
  removeRows,
  resized,
  setCells,
  sortRows,
  splitCells,
  tableFromRows,
  totalAbove,
  wholeArea,
  type Area,
} from "./engine/table";
import {
  DEFAULT_STYLE,
  allParas,
  marginBox,
  pageBox,
  pageOf,
  paraAt,
  paraOf,
  parasIn,
  plainText,
  setParas,
  sliceRuns,
  styleRuns,
  tidyParas,
  uid,
  type Align,
  type Cell,
  type DocState,
  type Edge,
  type EditObject,
  type List,
  type Page,
  type Para,
  type ShapeObject,
  type Side,
  type Style,
  type TableObject,
  type TextBody,
  type TextObject,
  type Valign,
} from "./model";
import {
  bodyIn,
  firstLineStays,
  paraOfSelection,
  shapeText,
  styleOfSelection,
  type CellAt,
  type EditorStore,
} from "./store";

/** What the bars and the keyboard do to whatever is selected. */

type Target = { id: string; cell: CellAt | null };

/** Every text the selection means: the one with the caret, or all of the picked boxes and cells. */
export function targetsOf(store: EditorStore): Target[] {
  const { editing, cell, selection, area } = store.view;
  if (editing) return [{ id: editing, cell }];
  const out: Target[] = [];
  for (const id of selection) {
    const object = store.doc.objects[id];
    if (object?.type === "text" || (object?.type === "shape" && object.text)) out.push({ id, cell: null });
    else if (object?.type === "table")
      object.cells.forEach((row, r) =>
        row.forEach((item, c) => {
          if (item.covered) return;
          if (area && selection.length === 1 && (r < area.r0 || r > area.r1 || c < area.c0 || c > area.c1)) return;
          out.push({ id, cell: { r, c } });
        }),
      );
  }
  return out;
}

const partOf = (store: EditorStore, body: TextBody): { from: number; to: number; caret: boolean } => {
  const { editing, range } = store.view;
  const length = plainText(body.runs).length;
  if (!editing || !range) return { from: 0, to: length, caret: false };
  return { from: Math.min(range.from, length), to: Math.min(range.to, length), caret: range.from === range.to };
};

function changeBodies(
  store: EditorStore,
  change: (
    body: TextBody,
    part: { from: number; to: number; caret: boolean },
    object: EditObject,
  ) => Partial<TextBody> | null,
  key: string | null,
) {
  const targets = targetsOf(store);
  if (targets.length === 0) return false;
  store.commit((doc) => {
    let next: DocState = doc;
    for (const { id, cell } of targets) {
      const object = next.objects[id];
      const body = bodyIn(object, cell);
      if (!object || !body) continue;
      const patch = change(body, partOf(store, body), object);
      if (!patch) continue;
      next = store.withBody(next, id, cell, patch);
      if (object.type === "text") {
        // The first line stays where it is when sizes change.
        const at = firstLineStays(
          object,
          patch.runs ?? object.runs,
          patch.leading ?? object.leading,
          "paras" in patch ? patch.paras : object.paras,
        );
        next = store.patched<TextObject>(next, id, {
          x: at.x,
          y: at.y,
          ...("max" in object ? { max: object.max } : {}),
        } as Partial<TextObject>);
      }
    }
    return next;
  }, key);
  return true;
}

// ---------------------------------------------------------------- letters

/** `next`: with only a caret, the change is for the letters typed from here; otherwise for the whole text. */
export function styleSelection(
  store: EditorStore,
  patch: (style: Style) => Style,
  key: string | null = null,
  next = false,
) {
  const { editing, range, cell } = store.view;
  if (targetsOf(store).length === 0) {
    store.setPrefs({ text: patch(store.view.prefs.text) });
    return;
  }
  const body = editing ? store.bodyOf(editing, cell) : null;
  if (next && body && range && range.from === range.to && plainText(body.runs).length > 0) {
    store.setView({ pending: patch(store.view.pending ?? styleOfSelection(store) ?? store.view.prefs.text) });
    return;
  }
  changeBodies(
    store,
    (own, part) => {
      const length = plainText(own.runs).length;
      const from = part.caret ? 0 : part.from;
      const to = part.caret ? length : part.to;
      const runs =
        length === 0
          ? own.runs.map((run) => ({ ...run, style: patch(run.style) }))
          : styleRuns(own.runs, from, to, patch);
      return { runs, ...keptSpacing(own, runs) };
    },
    key,
  );
  const look = styleOfSelection(store);
  if (look && !look.font.startsWith("pdf:"))
    store.setPrefs({ text: { ...look, tracking: 0, rise: 0, link: undefined, script: undefined, back: undefined } });
}

/** Line spacing keeps its proportion when letters change size, paragraph by paragraph. */
function keptSpacing(body: TextBody, runs: TextBody["runs"]): Pick<TextBody, "leading" | "paras"> {
  const text = plainText(body.runs);
  if (plainText(runs) !== text) return { leading: body.leading, paras: body.paras };
  const sizes: [number, number][] = [];
  let at = 0;
  for (const part of text.split("\n")) {
    const before = sliceRuns(body.runs, at, at + part.length);
    const after = sliceRuns(runs, at, at + part.length);
    sizes.push([
      paraSize(before.length > 0 ? before : [body.runs[body.runs.length - 1]]),
      paraSize(after.length > 0 ? after : [runs[runs.length - 1]]),
    ]);
    at += part.length + 1;
  }
  if (sizes.every(([a, b]) => Math.abs(a - b) < 0.01)) return { leading: body.leading, paras: body.paras };
  const own = allParas(body).map((para, i) => ((para.leading ?? body.leading) * sizes[i][1]) / sizes[i][0]);
  const leading = own[0];
  return {
    leading,
    paras: tidyParas(
      allParas(body).map((para, i) => ({ ...para, leading: Math.abs(own[i] - leading) > 0.05 ? own[i] : undefined })),
    ),
  };
}

export function setCase(store: EditorStore, how: Case) {
  changeBodies(
    store,
    (body, part) => {
      let { from, to } = part;
      if (part.caret) {
        // Just a caret: the word it is in.
        const text = plainText(body.runs);
        while (from > 0 && /[\p{L}\p{M}\p{N}'’]/u.test(text[from - 1])) from -= 1;
        while (to < text.length && /[\p{L}\p{M}\p{N}'’]/u.test(text[to])) to += 1;
        if (from === to) return { runs: changeCase(body.runs, 0, text.length, how) };
      }
      return { runs: changeCase(body.runs, from, to, how) };
    },
    null,
  );
}

/** Back to plain words: size, font and colour stay. */
export const clearLook = (store: EditorStore) =>
  styleSelection(store, (style) => ({
    ...style,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    tracking: 0,
    rise: 0,
    back: undefined,
    script: undefined,
    link: undefined,
    color: DEFAULT_STYLE.color,
  }));

export const setScript = (store: EditorStore, script: "super" | "sub", next = false) => {
  const now = styleOfSelection(store)?.script;
  styleSelection(store, (style) => ({ ...style, script: now === script ? undefined : script }), null, next);
};

/** Picks up the look under the caret, to put it on the next text that is selected. */
export function pickPainter(store: EditorStore) {
  if (store.view.painter) {
    store.setView({ painter: null });
    return;
  }
  const style = styleOfSelection(store);
  if (!style) return;
  const { editing, range } = store.view;
  const whole = !editing || !range || range.from === range.to;
  store.setView({ painter: { style, para: whole ? (paraOfSelection(store)?.para ?? null) : null } });
}

export function applyPainter(store: EditorStore) {
  const { painter } = store.view;
  if (!painter) return;
  const { style, para } = painter;
  store.setView({ painter: null });
  styleSelection(store, (own) => ({ ...style, link: own.link }));
  if (para?.align) alignSelection(store, para.align);
}

// ---------------------------------------------------------------- paragraphs

function paraPart(store: EditorStore, body: TextBody): [number, number] {
  const { editing, range } = store.view;
  if (editing && range) return parasIn(body.runs, range.from, range.to);
  return [0, allParas(body).length - 1];
}

function changeParas(
  store: EditorStore,
  patch: (para: Para, body: TextBody, index: number) => Para,
  key: string | null = null,
) {
  changeBodies(
    store,
    (body) => {
      const [from, to] = paraPart(store, body);
      return { paras: setParas(body, from, to, (para, i) => patch(para, body, i)) };
    },
    key,
  );
}

/** The room a text may be lined up in: its column, else what lies between the margins. */
function columnFor(page: Page, object: TextObject, store: EditorStore): Box | null {
  if (object.angle !== 0) return null;
  const area = marginBox(page);
  if (object.block && page.source !== null) {
    const block = store.block(page, object.block);
    if (block && Math.abs(block.y - object.y) < block.leading * 3) {
      const col = store.columnOf(block, page);
      const x0 = block.free.left && page.margin ? Math.min(col.x0, Math.max(area.x, col.x0)) : col.x0;
      return { x: x0, y: object.y, w: Math.max(object.w, col.x1 - x0), h: object.h };
    }
  }
  const inside = object.x >= area.x - 2 && object.x + object.w <= area.x + area.w + 2;
  if (page.margin && inside) return { x: area.x, y: object.y, w: area.w, h: object.h };
  const box = pageBox(page);
  const side = Math.max(0, Math.min(object.x - box.x, box.x + box.w - object.x - object.w));
  return { x: box.x + side, y: object.y, w: box.w - side * 2, h: object.h };
}

/**
 * Lines words up. A text that is only as wide as its words has nothing to line
 * up in, so it takes the whole width of its column first.
 */
export function alignSelection(store: EditorStore, align: Align) {
  const targets = targetsOf(store);
  if (targets.length === 0) return;
  store.commit((doc) => {
    let next = doc;
    for (const { id, cell } of targets) {
      const object = next.objects[id];
      const body = bodyIn(object, cell);
      if (!object || !body) continue;
      const [from, to] = paraPart(store, body);
      const count = allParas(body).length;
      const whole = from === 0 && to === count - 1;
      const patch: Partial<TextBody> = whole
        ? { align, paras: setParas(body, 0, count - 1, (para) => ({ ...para, align: undefined })) }
        : { paras: setParas(body, from, to, (para) => ({ ...para, align })) };
      next = store.withBody(next, id, cell, patch);
      if (object.type !== "text") continue;
      const page = pageOf(doc, id);
      const lines = Math.round(object.h / object.leading);
      // A single line, or lines that all end on their own: give them room.
      if (page && !object.wrap && (align !== "left" || lines > 1)) {
        const col = columnFor(page, object, store);
        if (col && col.w > object.w + 1)
          next = store.patched<TextObject>(next, id, { x: col.x, w: col.w, wrap: true, max: undefined });
      } else if (page && object.wrap && align !== "left" && count === 1 && lines <= 1) {
        const col = columnFor(page, object, store);
        if (col && col.w > object.w + 1 && object.x >= col.x - 1)
          next = store.patched<TextObject>(next, id, { x: col.x, w: col.w, max: undefined });
      }
    }
    return next;
  });
}

export function listSelection(store: EditorStore, list: Pick<List, "type" | "mark"> | null) {
  changeBodies(
    store,
    (body) => {
      const [from, to] = paraPart(store, body);
      return { paras: list ? toggleList(body, from, to, list) : clearList(body, from, to) };
    },
    null,
  );
}

/** A paragraph's number starts over, or goes on from a number. */
export function startListAt(store: EditorStore, start: number | null) {
  changeParas(store, (para, body, index) => {
    if (!para.list) return para;
    const first = paraOfSelection(store)?.index ?? index;
    return index === first ? { ...para, list: { ...para.list, start: start ?? undefined } } : para;
  });
}

export function indentSelection(store: EditorStore, by: 1 | -1) {
  changeBodies(
    store,
    (body) => {
      const [from, to] = paraPart(store, body);
      return { paras: stepParas(body, from, to, by) };
    },
    null,
  );
}

/** Distance between lines, as a share of the text size. */
export function spaceLines(store: EditorStore, times: number) {
  changeBodies(store, (body) => spaced(body, times), "leading");
}

export function spaceParas(store: EditorStore, side: "before" | "after", points: number) {
  changeParas(store, (para) => ({ ...para, [side]: points || undefined }), `para-${side}`);
}

export function paraFill(store: EditorStore, fill: string | null) {
  changeParas(store, (para) => ({ ...para, fill: fill ?? undefined }));
}

export type Preset = {
  id: string;
  label: string;
  size: number;
  bold: boolean;
  color: string;
  font?: string;
  italic?: boolean;
  before: number;
  after: number;
  times: number;
};
/** Ready-made looks for paragraphs, as in Word's gallery. */
export const PRESETS: readonly Preset[] = [
  { id: "normal", label: "Normal", size: 12, bold: false, color: "#1d1c1f", before: 0, after: 0, times: 1.22 },
  { id: "title", label: "Title", size: 28, bold: true, color: "#1d1c1f", before: 0, after: 6, times: 1.15 },
  { id: "subtitle", label: "Subtitle", size: 15, bold: false, color: "#57565c", before: 0, after: 8, times: 1.2 },
  { id: "h1", label: "Heading 1", size: 20, bold: true, color: "#1d1c1f", before: 10, after: 4, times: 1.18 },
  { id: "h2", label: "Heading 2", size: 16, bold: true, color: "#1d1c1f", before: 8, after: 3, times: 1.18 },
  { id: "h3", label: "Heading 3", size: 13, bold: true, color: "#d8431b", before: 6, after: 2, times: 1.2 },
  {
    id: "quote",
    label: "Quote",
    size: 12,
    bold: false,
    italic: true,
    color: "#57565c",
    before: 4,
    after: 4,
    times: 1.3,
  },
  { id: "small", label: "Small print", size: 9, bold: false, color: "#57565c", before: 0, after: 0, times: 1.22 },
  {
    id: "code",
    label: "Code",
    size: 10.5,
    bold: false,
    color: "#1d1c1f",
    font: "lib:cousine",
    before: 0,
    after: 0,
    times: 1.3,
  },
];

export function applyPreset(store: EditorStore, preset: Preset) {
  if (targetsOf(store).length === 0) {
    store.setPrefs({
      text: {
        ...store.view.prefs.text,
        size: preset.size,
        bold: preset.bold,
        color: preset.color,
        italic: Boolean(preset.italic),
        font: preset.font ?? store.view.prefs.text.font,
      },
    });
    return;
  }
  changeBodies(
    store,
    (body) => {
      const [first, last] = paraPart(store, body);
      const text = plainText(body.runs);
      const paras = text.split("\n");
      let from = 0;
      for (let i = 0; i < first; i += 1) from += paras[i].length + 1;
      let to = from;
      for (let i = first; i <= last; i += 1) to += paras[i].length + (i < last ? 1 : 0);
      const restyle = (style: Style): Style => ({
        ...style,
        size: preset.size,
        bold: preset.bold,
        italic: Boolean(preset.italic),
        color: preset.color,
        font: preset.font ?? (style.font.startsWith("pdf:") && preset.id === "normal" ? style.font : style.font),
        tracking: 0,
      });
      const runs =
        text.length === 0
          ? body.runs.map((run) => ({ ...run, style: restyle(run.style) }))
          : styleRuns(body.runs, from, to, restyle);
      const alone = first === 0 && last === paras.length - 1;
      const leading = preset.size * preset.times;
      return {
        runs,
        leading: alone ? leading : body.leading,
        paras: setParas(body, first, last, (para, i) => ({
          ...para,
          leading: alone ? undefined : leading,
          before: i > 0 ? preset.before || undefined : undefined,
          after: preset.after || undefined,
        })),
      };
    },
    null,
  );
}

export function textBoxes(
  store: EditorStore,
  patch: (object: TextObject) => Partial<TextObject>,
  key: string | null = null,
) {
  const { selection, editing } = store.view;
  const ids = (editing ? [editing] : selection).filter((id) => store.doc.objects[id]?.type === "text");
  if (ids.length > 0)
    store.commit((doc) => ids.reduce((next, id) => store.patched<TextObject>(next, id, patch), doc), key);
}

/** Words become a link, or stop being one. With only a caret: the word, or the whole link, it is in. */
export function linkSelection(store: EditorStore, url: string | null) {
  changeBodies(
    store,
    (body, part) => {
      let { from, to } = part;
      if (part.caret) {
        let at = 0;
        for (const run of body.runs) {
          const end = at + run.text.length;
          if (run.style.link && part.from >= at && part.from <= end) {
            from = at;
            to = end;
            break;
          }
          at = end;
        }
        if (from === to) {
          const text = plainText(body.runs);
          while (from > 0 && /\S/.test(text[from - 1])) from -= 1;
          while (to < text.length && /\S/.test(text[to])) to += 1;
        }
        if (from === to) return null;
      }
      return {
        runs: styleRuns(body.runs, from, to, (style) => ({
          ...style,
          link: url ?? undefined,
          underline: Boolean(url),
          color: url ? "#1c5fc4" : style.link ? DEFAULT_STYLE.color : style.color,
        })),
      };
    },
    "link",
  );
}

// ---------------------------------------------------------------- objects together

export function groupSelection(store: EditorStore) {
  const ids = store.view.selection;
  if (ids.length < 2) return;
  const group = uid("g");
  store.patchMany(ids, () => ({ group }));
}

export function ungroupSelection(store: EditorStore) {
  store.patchMany(store.view.selection, () => ({ group: undefined }));
}

export type EdgeName = "left" | "centre" | "right" | "top" | "middle" | "bottom";

/** Lines things up with each other, or one thing with the page (its margins first). */
export function lineUp(store: EditorStore, edge: EdgeName) {
  const objects = store.view.selection
    .map((id) => store.doc.objects[id])
    .filter((object): object is EditObject => Boolean(object));
  if (objects.length === 0) return;
  const page = pageOf(store.doc, objects[0].id);
  if (!page) return;
  const boxes = objects.map((object) => objectBounds(object));
  const groups = new Set(objects.map((object) => object.group ?? object.id));
  const frame = marginBox(page);
  const area =
    groups.size === 1
      ? { x0: frame.x, y0: frame.y, x1: frame.x + frame.w, y1: frame.y + frame.h }
      : {
          x0: Math.min(...boxes.map((box) => box.x)),
          y0: Math.min(...boxes.map((box) => box.y)),
          x1: Math.max(...boxes.map((box) => box.x + box.w)),
          y1: Math.max(...boxes.map((box) => box.y + box.h)),
        };
  // A group moves as one.
  const boxOf = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  objects.forEach((object, i) => {
    const key = object.group ?? object.id;
    const box = boxes[i];
    const now = boxOf.get(key);
    boxOf.set(key, {
      x0: Math.min(now?.x0 ?? Infinity, box.x),
      y0: Math.min(now?.y0 ?? Infinity, box.y),
      x1: Math.max(now?.x1 ?? -Infinity, box.x + box.w),
      y1: Math.max(now?.y1 ?? -Infinity, box.y + box.h),
    });
  });
  store.patchMany(
    objects.map((object) => object.id),
    (object) => {
      const box = boxOf.get(object.group ?? object.id);
      if (!box) return {};
      switch (edge) {
        case "left":
          return { x: object.x + area.x0 - box.x0 };
        case "centre":
          return { x: object.x + (area.x0 + area.x1) / 2 - (box.x0 + box.x1) / 2 };
        case "right":
          return { x: object.x + area.x1 - box.x1 };
        case "top":
          return { y: object.y + area.y0 - box.y0 };
        case "middle":
          return { y: object.y + (area.y0 + area.y1) / 2 - (box.y0 + box.y1) / 2 };
        case "bottom":
          return { y: object.y + area.y1 - box.y1 };
      }
    },
  );
}

/** The same gaps between things. */
export function spread(store: EditorStore, way: "x" | "y") {
  const objects = store.view.selection
    .map((id) => store.doc.objects[id])
    .filter((object): object is EditObject => Boolean(object));
  if (objects.length < 3) return;
  const size = way === "x" ? "w" : "h";
  const items = objects
    .map((object) => ({ id: object.id, box: objectBounds(object) }))
    .sort((a, b) => a.box[way] - b.box[way]);
  const first = items[0].box[way];
  const last = items[items.length - 1].box;
  const total = last[way] + last[size] - first;
  const gap = (total - items.reduce((sum, item) => sum + item.box[size], 0)) / (items.length - 1);
  const to = new Map<string, number>();
  let at = first;
  for (const item of items) {
    to.set(item.id, at - item.box[way]);
    at += item.box[size] + gap;
  }
  store.patchMany(
    items.map((item) => item.id),
    (object) => (way === "x" ? { x: object.x + (to.get(object.id) ?? 0) } : { y: object.y + (to.get(object.id) ?? 0) }),
  );
}

export function sameSize(store: EditorStore, side: "w" | "h" | "both") {
  const [first, ...rest] = store.view.selection
    .map((id) => store.doc.objects[id])
    .filter((object): object is EditObject => Boolean(object));
  if (!first || rest.length === 0) return;
  store.patchMany(
    rest.map((object) => object.id),
    () => (side === "w" ? { w: first.w } : side === "h" ? { h: first.h } : { w: first.w, h: first.h }),
  );
}

// ---------------------------------------------------------------- shapes

export function shapeWords(store: EditorStore, id: string) {
  const object = store.doc.objects[id];
  if (object?.type !== "shape" || object.lock) return;
  if (!object.text)
    store.silent((doc) => {
      const now = doc.objects[id] as ShapeObject | undefined;
      return now
        ? { ...doc, objects: { ...doc.objects, [id]: { ...now, text: shapeText(now, store.freshStyle()) } } }
        : doc;
    });
  store.select([id], id);
}

// ---------------------------------------------------------------- tables

/** The table being worked in and the cells meant: where the caret is, or the picked ones. */
export function tableAt(store: EditorStore): { table: TableObject; area: Area; picked: boolean } | null {
  const { editing, cell, selection, area } = store.view;
  const id = editing ?? (selection.length === 1 ? selection[0] : null);
  const table = id ? store.doc.objects[id] : null;
  if (table?.type !== "table") return null;
  if (editing && cell) {
    const own = table.cells[cell.r]?.[cell.c];
    return {
      table,
      area: { r0: cell.r, c0: cell.c, r1: cell.r + (own?.rows ?? 1) - 1, c1: cell.c + (own?.cols ?? 1) - 1 },
      picked: true,
    };
  }
  if (area) return { table, area: wholeArea(table, area), picked: true };
  return { table, area: { r0: 0, c0: 0, r1: table.cells.length - 1, c1: table.cols.length - 1 }, picked: false };
}

const tablePatch = (
  store: EditorStore,
  table: TableObject,
  patch: Partial<TableObject> | null,
  key: string | null = null,
) => {
  if (patch) store.patch<TableObject>(table.id, patch, key);
};

export type TableDo =
  | "row-above"
  | "row-below"
  | "col-left"
  | "col-right"
  | "row-delete"
  | "col-delete"
  | "delete"
  | "merge"
  | "split"
  | "divide-cols"
  | "divide-rows"
  | "even-cols"
  | "even-rows"
  | "row-up"
  | "row-down"
  | "clear"
  | "fit";

export function tableDo(store: EditorStore, what: TableDo) {
  const at = tableAt(store);
  if (!at) return;
  const { table, area } = at;
  const count = { rows: area.r1 - area.r0 + 1, cols: area.c1 - area.c0 + 1 };
  const { cell, editing } = store.view;
  const back = (r: number, c: number) => {
    if (editing && cell) store.select([table.id], table.id, { r, c });
    else store.pickCells(table.id, null);
  };
  switch (what) {
    case "row-above":
      tablePatch(store, table, insertRows(table, area.r0, at.picked ? count.rows : 1));
      if (cell) back(cell.r, cell.c);
      return;
    case "row-below":
      tablePatch(store, table, insertRows(table, area.r1 + 1, at.picked ? count.rows : 1));
      if (cell) back(area.r1 + 1, cell.c);
      return;
    case "col-left":
      tablePatch(store, table, insertCols(table, area.c0, at.picked ? count.cols : 1));
      return;
    case "col-right":
      tablePatch(store, table, insertCols(table, area.c1 + 1, at.picked ? count.cols : 1));
      return;
    case "row-delete": {
      const patch = removeRows(table, area.r0, area.r1);
      if (patch) {
        store.pickCells(table.id, null);
        tablePatch(store, table, patch);
      } else store.remove([table.id]);
      return;
    }
    case "col-delete": {
      const patch = removeCols(table, area.c0, area.c1);
      if (patch) {
        store.pickCells(table.id, null);
        tablePatch(store, table, patch);
      } else store.remove([table.id]);
      return;
    }
    case "delete":
      store.remove([table.id]);
      return;
    case "merge":
      store.pickCells(table.id, { r0: area.r0, c0: area.c0, r1: area.r0, c1: area.c0 });
      tablePatch(store, table, mergeCells(table, area));
      return;
    case "split":
      tablePatch(store, table, splitCells(table, area));
      return;
    case "divide-cols":
      store.pickCells(table.id, null);
      tablePatch(store, table, divideCell(table, area.r0, area.c0, "cols"));
      return;
    case "divide-rows":
      store.pickCells(table.id, null);
      tablePatch(store, table, divideCell(table, area.r0, area.c0, "rows"));
      return;
    case "even-cols":
      tablePatch(store, table, evenCols(table, at.picked ? area : null));
      return;
    case "even-rows":
      tablePatch(store, table, evenRows(table, at.picked ? area : null));
      return;
    case "row-up":
      if (area.r0 > 0) {
        tablePatch(store, table, moveRows(table, area.r0, area.r0 - 1));
        if (cell) back(cell.r - 1, cell.c);
      }
      return;
    case "row-down":
      if (area.r0 < table.cells.length - 1) {
        tablePatch(store, table, moveRows(table, area.r0, area.r0 + 1));
        if (cell) back(cell.r + 1, cell.c);
      }
      return;
    case "clear":
      tablePatch(
        store,
        table,
        setCells(table, area, (item) => ({
          ...item,
          runs: [{ text: "", style: item.runs[0].style }],
          paras: undefined,
        })),
      );
      return;
    case "fit": {
      const page = pageOf(store.doc, table.id);
      if (!page) return;
      const box = marginBox(page);
      const k = box.w / table.w;
      const next = { ...table, cols: table.cols.map((w) => w * k) };
      tablePatch(store, table, { cols: next.cols, x: box.x, ...resized(next) });
      return;
    }
  }
}

export function cellLooks(store: EditorStore, patch: (cell: Cell) => Partial<Cell>, key: string | null = null) {
  const at = tableAt(store);
  if (at)
    tablePatch(
      store,
      at.table,
      setCells(at.table, at.area, (cell) => ({ ...cell, ...patch(cell) })),
      key,
    );
}

export const cellFill = (store: EditorStore, fill: string | null) => cellLooks(store, () => ({ fill }), "cell-fill");
export const cellValign = (store: EditorStore, valign: Valign) => cellLooks(store, () => ({ valign }));

/** Lines around and inside the picked cells. */
export function cellEdges(store: EditorStore, which: "all" | "outer" | "inner" | "none" | Side, edge: Edge) {
  const at = tableAt(store);
  if (!at) return;
  const { table, area } = at;
  if (!at.picked && (which === "all" || which === "none")) {
    tablePatch(store, table, {
      edge: which === "all" ? edge : null,
      ...setCells(table, area, (cell) => ({ ...cell, edges: undefined })),
    });
    return;
  }
  const sides: Side[] = ["top", "right", "bottom", "left"];
  tablePatch(
    store,
    table,
    setCells(table, area, (cell, r, c) => {
      const r1 = r + (cell.rows ?? 1) - 1;
      const c1 = c + (cell.cols ?? 1) - 1;
      const outer: Record<Side, boolean> = {
        top: r === area.r0,
        left: c === area.c0,
        bottom: r1 === area.r1,
        right: c1 === area.c1,
      };
      const edges = { ...cell.edges };
      for (const side of sides) {
        if (which === "all") edges[side] = edge;
        else if (which === "none") edges[side] = null;
        else if (which === "outer") {
          if (outer[side]) edges[side] = edge;
        } else if (which === "inner") {
          if (!outer[side]) edges[side] = edge;
        } else if (which === side && outer[side]) edges[side] = edge;
      }
      return { ...cell, edges };
    }),
  );
}

export function tableLook(store: EditorStore, id: string) {
  const at = tableAt(store);
  if (at) tablePatch(store, at.table, applyLook(at.table, id));
}

export function tableSort(store: EditorStore, up: boolean) {
  const at = tableAt(store);
  if (!at) return;
  const col = store.view.cell?.c ?? at.area.c0;
  const patch = sortRows(at.table, { col, up, head: Boolean(at.table.head) });
  if (patch) tablePatch(store, at.table, patch);
  else store.say("Tables with joined cells cannot be sorted.");
}

/** The sum of the numbers above, written where the caret is. */
export function tableTotal(store: EditorStore) {
  const at = tableAt(store);
  const cell = store.view.cell;
  if (!at || !cell) return;
  const sum = totalAbove(at.table, cell.r, cell.c);
  if (sum === null) {
    store.say("There are no numbers above this cell.");
    return;
  }
  const own = at.table.cells[cell.r][cell.c];
  const text = sum.toLocaleString(undefined, { maximumFractionDigits: 6 });
  store.setBody(at.table.id, cell, { runs: [{ text, style: own.runs[0].style }] });
}

/** Tab in a table: the next cell, and a new row after the last one. */
export function tabCell(store: EditorStore, by: 1 | -1) {
  const { editing, cell } = store.view;
  const table = editing ? store.doc.objects[editing] : null;
  if (table?.type !== "table" || !cell) return;
  const next = nextCell(table, cell.r, cell.c, by);
  if (next) {
    store.caret = null;
    store.select([table.id], table.id, next);
    selectAllIn(store);
    return;
  }
  if (by < 0) return;
  tablePatch(store, table, insertRows(table, table.cells.length));
  store.select([table.id], table.id, { r: table.cells.length, c: 0 });
}

/** Everything in the text being edited. */
export function selectAllIn(store: EditorStore) {
  const { editing, cell } = store.view;
  const body = editing ? store.bodyOf(editing, cell) : null;
  if (body) store.setView({ range: { from: 0, to: plainText(body.runs).length } });
}

/** Copied cells, spread over the cells from the one with the caret. False when there is no such table. */
export function pasteCells(store: EditorStore, rows: string[][]): boolean {
  const { editing, cell } = store.view;
  const table = editing ? store.doc.objects[editing] : null;
  if (table?.type !== "table" || !cell) return false;
  const wide = Math.max(...rows.map((row) => row.length));
  let next: TableObject = table;
  const missingRows = cell.r + rows.length - next.cells.length;
  if (missingRows > 0) next = { ...next, ...insertRows(next, next.cells.length, missingRows) };
  const missingCols = cell.c + wide - next.cols.length;
  if (missingCols > 0) next = { ...next, ...insertCols(next, next.cols.length, missingCols) };
  const area = { r0: cell.r, c0: cell.c, r1: cell.r + rows.length - 1, c1: cell.c + wide - 1 };
  const patch = setCells(next, area, (item, r, c) => ({
    ...item,
    runs: [{ text: rows[r - cell.r]?.[c - cell.c] ?? "", style: item.runs[0].style }],
    paras: undefined,
  }));
  store.patch<TableObject>(table.id, patch);
  store.pickCells(table.id, wholeArea({ ...next, ...patch }, area));
  return true;
}

/** Copied cells as a new table. */
export function tableOf(store: EditorStore, rows: string[][], bold?: boolean[][]) {
  const page = store.here;
  if (!page) return;
  const box = marginBox(page);
  const side = page.margin ? 0 : Math.min(36, box.w * 0.08);
  const style = { ...store.freshStyle(), size: Math.min(store.view.prefs.text.size, 11) };
  const made = tableFromRows(rows, box.w - side * 2, style, bold);
  const table = { ...made, id: uid("b"), x: box.x + side, y: box.y + (page.margin ? 0 : 36) } as TableObject;
  store.add(page.id, table);
  store.show(page.id, { x: table.x, y: table.y, w: table.w, h: Math.min(table.h, 40) });
}

/** A table where it was asked for, as wide as the room between the margins. */
export function insertTable(
  store: EditorStore,
  rows: number,
  cols: number,
  at: { page: string; x: number; y: number } | null,
) {
  const page = (at && store.page(at.page)) || store.here;
  if (!page) return;
  const box = marginBox(page);
  const side = page.margin ? 0 : Math.min(36, box.w * 0.08);
  const w = Math.min(box.w - side * 2, Math.max(120, cols * 160));
  const style = { ...store.freshStyle(), size: Math.min(store.view.prefs.text.size, 14) };
  const made = newTable(rows, cols, w, style);
  const y = Math.max(box.y, Math.min((at?.y ?? box.y + 40) - 10, box.y + box.h - made.h));
  const table = {
    ...made,
    id: uid("b"),
    x:
      box.x +
      side +
      (at && w < box.w * 0.6 ? Math.max(0, Math.min(box.w - side * 2 - w, at.x - box.x - side - w / 2)) : 0),
    y,
  } as TableObject;
  store.add(page.id, table, false);
  store.setView({ tool: "select" });
  store.select([table.id], table.id, { r: 0, c: 0 });
}

export const paraOfCaret = (store: EditorStore) => {
  const { editing, range, cell } = store.view;
  const body = editing ? store.bodyOf(editing, cell) : null;
  return body && range
    ? { body, ...paraAt(body.runs, range.from), para: paraOf(body, paraAt(body.runs, range.from).index) }
    : null;
};
