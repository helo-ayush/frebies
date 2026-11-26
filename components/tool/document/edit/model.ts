import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Box, Matrix } from "./engine/matrix";
import type { Cmd } from "./engine/shapes";

/**
 * The document being edited. Every page is measured in points from its top-left
 * corner, y down, as the page is shown before any rotation made here.
 */

// ---------------------------------------------------------------- text

export type Style = {
  /** `lib:arimo`, `pdf:<source>/<font>` or `user:<n>`. */
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** Extra space after every character, in points. */
  tracking: number;
  /** Above (+) or below (-) the line, in points. */
  rise: number;
  /** Colour behind the letters. */
  back?: string;
  script?: "super" | "sub";
  /** Where the words lead when they are clicked in the PDF. */
  link?: string;
};

export type Run = { text: string; style: Style };
export type Align = "left" | "center" | "right" | "justify";

/**
 * `mark` is the bullet itself, or the pattern of the number, in which the first
 * 1, a, A, i or I stands for the count: "1.", "1)", "(a)", "I.".
 */
export type List = {
  type: "bullet" | "number";
  mark: string;
  level: number;
  start?: number;
  /** The start only goes on from the page before. */
  resume?: boolean;
  /** From the mark to the text, in points. */
  gap: number;
};

/** How one paragraph differs from the text it is in. Measures in points. */
export type Para = {
  align?: Align;
  list?: List;
  left?: number;
  right?: number;
  /** Added to `left` for the first line. Negative hangs. */
  first?: number;
  before?: number;
  after?: number;
  leading?: number;
  /** Colour behind the whole paragraph. */
  fill?: string;
};

/** Words with their looks: what a text box, a table cell and a shape hold. */
export type TextBody = {
  runs: Run[];
  /** One per paragraph (paragraphs are split by "\n" in the runs). */
  paras?: Para[];
  align: Align;
  /** Line height in points. */
  leading: number;
};

// ---------------------------------------------------------------- objects

export type Dash = "solid" | "dash" | "dot" | "dashdot";
export type Head = "none" | "arrow" | "open" | "dot" | "bar" | "diamond";
export type Valign = "top" | "middle" | "bottom";

type Base = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the top-left corner. */
  angle: number;
  opacity: number;
  /** Moves and is picked together with everything of the same group. */
  group?: string;
  /** Stays where it is until unlocked. */
  lock?: boolean;
  /** Opened but not changed yet: leaving it puts the original back untouched. */
  pristine?: boolean;
  /** Drawing instructions of the page this stands in for. */
  ops?: number[];
  /** Opened along with this one; stays open once this one is changed. */
  mates?: string[];
};

export type TextObject = Base &
  TextBody & {
    type: "text";
    /** False: the box grows with its longest line. */
    wrap: boolean;
    /** Where a box that grows stops growing and starts to wrap. */
    max?: number;
    /** The text block of the PDF this came from. */
    block?: string;
    /** Goes on in the next text of the same chain when the page is full. */
    flow?: string;
    /** Starts in the middle of the paragraph the one before it ends with. */
    cont?: boolean;
    /** Box behind the text. */
    fill?: string | null;
    pad?: number;
  };

export type ImageObject = Base & {
  type: "image";
  asset: string;
  /** Part of the picture that shows, as fractions of it. */
  crop?: { x: number; y: number; w: number; h: number };
  flipX?: boolean;
  flipY?: boolean;
  /** Frame and corners. */
  stroke?: string | null;
  width?: number;
  radius?: number;
  /** 1 is as it is. */
  look?: { bright: number; contrast: number; color: number };
};

/** Office's names for shapes, plus the editor's own marks. */
export type ShapeKind = string;
export type ShapeText = TextBody & { valign: Valign; pad: number };
export type ShapeObject = Base & {
  type: "shape";
  kind: ShapeKind;
  stroke: string | null;
  fill: string | null;
  width: number;
  dash: Dash;
  /** Lines: drawn from the other pair of corners. */
  flip?: boolean;
  /** Lines: start and end swapped. */
  back?: boolean;
  start?: Head;
  end?: Head;
  /** Shapes: mirrored. */
  flipX?: boolean;
  flipY?: boolean;
  /** Where the yellow handles are. */
  adj?: number[];
  text?: ShapeText;
};

/** A drawing of any form: one taken out of the PDF, or one drawn point by point. */
export type PathObject = Base & {
  type: "path";
  /** In fractions of the box. */
  path: Cmd[];
  stroke: string | null;
  fill: string | null;
  width: number;
  dash: number[];
  cap: 0 | 1 | 2;
  join: 0 | 1 | 2;
  evenOdd?: boolean;
  flipX?: boolean;
  flipY?: boolean;
};

export type InkObject = Base & {
  type: "ink";
  /** Strokes as x,y pairs, 0 to 1 of the box. */
  strokes: number[][];
  stroke: string;
  width: number;
  marker: boolean;
};

export type MarkObject = Base & {
  type: "mark";
  kind: "highlight" | "underline" | "strike" | "squiggle";
  color: string;
  /** x, y, w, h from the box's corner. */
  rects: [number, number, number, number][];
};

export type LinkObject = Base & {
  type: "link";
  url: string;
  /** A page of this document, instead of an address. */
  page?: string;
};

export type FieldKind = "text" | "multiline" | "check" | "list" | "radio" | "sign";
export type FieldObject = Base & {
  type: "field";
  kind: FieldKind;
  name: string;
  options: string[];
  required?: boolean;
  /** Radio buttons: the value this one stands for. */
  value?: string;
};

export type Edge = { color: string; width: number; dash: Dash };
export type Side = "top" | "right" | "bottom" | "left";
export type Cell = TextBody & {
  fill?: string | null;
  valign?: Valign;
  /** Covers this many rows and columns. */
  rows?: number;
  cols?: number;
  /** Lies under a cell that spans. */
  covered?: boolean;
  /** Lines of its own. null: none on that side. */
  edges?: Partial<Record<Side, Edge | null>>;
};
export type TableObject = Base & {
  type: "table";
  cols: number[];
  /** At least this high. */
  rows: number[];
  cells: Cell[][];
  edge: Edge | null;
  pad: { x: number; y: number };
  /** The first row is a heading, repeated when the table goes on over pages. */
  head?: boolean;
};

/** A comment pinned to the page. */
export type NoteObject = Base & { type: "note"; text: string; color: string; author: string; date: string };

export type EditObject =
  | TextObject
  | ImageObject
  | ShapeObject
  | PathObject
  | InkObject
  | MarkObject
  | LinkObject
  | FieldObject
  | TableObject
  | NoteObject;
export type ObjectType = EditObject["type"];

// ---------------------------------------------------------------- pages

/** Glyphs of one text-showing operator: [operator, first, one past last]. */
export type GlyphRange = [number, number, number];

export type Margin = { top: number; right: number; bottom: number; left: number };

export type Page = {
  id: string;
  /** Null for a blank page. */
  source: string | null;
  /** Page of the source, from 0. */
  index: number;
  w: number;
  h: number;
  /** PDF space to page space. */
  view: Matrix;
  /** Degrees added here. */
  rotate: 0 | 90 | 180 | 270;
  /** The part that shows, when it is not the whole page: cropped, or with room added around it. */
  box?: Box;
  margin?: Margin | null;
  /** Colour of the paper. */
  paper?: string;
  objects: string[];
  /** Original text taken off the page, by block. */
  cuts: Record<string, GlyphRange[]>;
  /** The colour behind each of those blocks. */
  covers: Record<string, string>;
  /** Original pictures taken off the page. */
  imageCuts: number[];
  /** Original links taken off the page, as places in its annotation list. */
  linkCuts: number[];
  /** Original lines and shapes taken off the page, as places among its drawing instructions. */
  pathCuts: number[];
};

// ---------------------------------------------------------------- the whole document

/** Words at the head or foot of every page. {page}, {pages}, {date} and {file} are filled in. */
export type Band = { left: string; center: string; right: string };
export type PageSet = { kind: "all" | "odd" | "even" | "list"; list: string; skipFirst: boolean };

export type Decor = {
  header?: Band;
  footer?: Band;
  bandStyle: Style;
  /** From the page's edge to the words. */
  bandAt: number;
  bandPages: PageSet;
  /** What the first numbered page counts as, and how many digits numbers have. */
  from: number;
  digits: number;
  watermark?: {
    kind: "text" | "image";
    text: string;
    asset?: string;
    style: Style;
    angle: number;
    opacity: number;
    /** Share of the page's width. */
    size: number;
    tile: boolean;
    place: "center" | "top" | "bottom";
    pages: PageSet;
  };
};

export type Mark = { id: string; title: string; page: string; y: number | null; level: number };
export type Meta = { title: string; author: string; subject: string; keywords: string };

export type DocState = {
  pages: Page[];
  objects: Record<string, EditObject>;
  /** Form answers, by `source:name`. */
  values: Record<string, string | boolean>;
  decor?: Decor;
  /** Bookmarks, once they were looked at. */
  outline?: Mark[];
  meta?: Meta;
};

export type Source = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
};

export type Asset = {
  id: string;
  url: string;
  w: number;
  h: number;
  mime: "image/png" | "image/jpeg";
  bytes: Uint8Array;
  /** A picture of the PDF itself, which can go back in as it was. */
  origin?: { source: string; page: number; picture: number };
};

export type Tool =
  | "select"
  | "text"
  | "pen"
  | "marker"
  | "polygon"
  | "highlight"
  | "underline"
  | "strike"
  | "squiggle"
  | "whiteout"
  | "redact"
  | "check"
  | "cross"
  | "dot"
  | "line"
  | "arrow"
  | "link"
  | "note"
  | "crop"
  | `shape:${string}`
  | `field-${FieldKind}`;

export const DEFAULT_STYLE: Style = {
  font: "lib:arimo",
  size: 12,
  color: "#1d1c1f",
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  tracking: 0,
  rise: 0,
};

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36)}`;
}

// ---------------------------------------------------------------- runs

export const plainText = (runs: readonly Run[]) => runs.map((run) => run.text).join("");

/** Size and height above the line as drawn: small for super- and subscript. */
export const drawnSize = (style: Style) => (style.script ? style.size * 0.64 : style.size);
export const drawnRise = (style: Style) =>
  style.rise + (style.script === "super" ? style.size * 0.35 : style.script === "sub" ? style.size * -0.13 : 0);

export function sameStyle(a: Style, b: Style): boolean {
  return (
    a.font === b.font &&
    a.size === b.size &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.tracking === b.tracking &&
    a.rise === b.rise &&
    a.back === b.back &&
    a.script === b.script &&
    a.link === b.link
  );
}

/** Joins neighbours that look the same and drops empty ones, keeping at least one. */
export function tidyRuns(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last.style, run.style)) out[out.length - 1] = { ...last, text: last.text + run.text };
    else out.push(run);
  }
  if (out.length === 0 && runs.length > 0) out.push({ text: "", style: runs[0].style });
  return out;
}

/** Runs between two character offsets. */
export function sliceRuns(runs: readonly Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + run.text.length);
    if (end > start) out.push({ text: run.text.slice(start - at, end - at), style: run.style });
    at += run.text.length;
  }
  return out;
}

export function styleRuns(runs: readonly Run[], from: number, to: number, patch: (style: Style) => Style): Run[] {
  const length = plainText(runs).length;
  return tidyRuns([
    ...sliceRuns(runs, 0, from),
    ...sliceRuns(runs, from, to).map((run) => ({ ...run, style: patch(run.style) })),
    ...sliceRuns(runs, to, length),
  ]);
}

export function replaceText(runs: readonly Run[], from: number, to: number, text: string, style?: Style): Run[] {
  const length = plainText(runs).length;
  return tidyRuns([
    ...sliceRuns(runs, 0, from),
    { text, style: style ?? styleAt(runs, from) },
    ...sliceRuns(runs, to, length),
  ]);
}

/** The style a character typed at `offset` takes: that of the letter before it, in the same paragraph. */
export function styleAt(runs: readonly Run[], offset: number): Style {
  const text = plainText(runs);
  const fresh = offset > 0 && text[offset - 1] === "\n" && offset < text.length && text[offset] !== "\n";
  const want = fresh || offset === 0 ? offset : offset - 1;
  let at = 0;
  for (const run of runs) {
    at += run.text.length;
    if (want < at) return run.style;
  }
  return runs[runs.length - 1]?.style ?? DEFAULT_STYLE;
}

// ---------------------------------------------------------------- paragraphs

/** Runs of every paragraph. An empty one keeps a run, for its style. */
export function splitParas(runs: readonly Run[]): Run[][] {
  const out: Run[][] = [[]];
  let style = runs[0]?.style ?? DEFAULT_STYLE;
  for (const run of runs) {
    const parts = run.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) {
        const last = out[out.length - 1];
        if (last.length === 0) last.push({ text: "", style });
        out.push([]);
      }
      style = run.style;
      if (part !== "") out[out.length - 1].push({ text: part, style });
    });
  }
  const last = out[out.length - 1];
  if (last.length === 0) last.push({ text: "", style });
  return out;
}

export function paraCount(runs: readonly Run[]): number {
  let count = 1;
  for (const run of runs) for (let i = 0; i < run.text.length; i += 1) if (run.text[i] === "\n") count += 1;
  return count;
}

export const paraOf = (body: Pick<TextBody, "paras">, index: number): Para => body.paras?.[index] ?? {};

/** Which paragraph a character is in, and where that paragraph starts and ends. */
export function paraAt(runs: readonly Run[], offset: number): { index: number; from: number; to: number } {
  const text = plainText(runs);
  const from = offset <= 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
  const end = text.indexOf("\n", offset);
  let index = 0;
  for (let i = 0; i < from; i += 1) if (text[i] === "\n") index += 1;
  return { index, from, to: end < 0 ? text.length : end };
}

/** First and last paragraph a range of characters touches. */
export function parasIn(runs: readonly Run[], from: number, to: number): [number, number] {
  const first = paraAt(runs, from).index;
  // A selection that ends right at the start of a paragraph does not touch it.
  const last = to > from ? paraAt(runs, to) : null;
  if (!last) return [first, first];
  return [first, last.from === to && last.index > first ? last.index - 1 : last.index];
}

const plainPara = (para: Para) => Object.values(para).every((value) => value === undefined);

/** Paragraph settings with nothing in them are left out altogether. */
export function tidyParas(paras: readonly Para[]): Para[] | undefined {
  return paras.some((para) => !plainPara(para)) ? [...paras] : undefined;
}

export const allParas = (body: Pick<TextBody, "runs" | "paras">): Para[] =>
  Array.from({ length: paraCount(body.runs) }, (_, i) => paraOf(body, i));

export type BodyEdit = Pick<TextBody, "runs" | "paras">;

/** Replaces characters; paragraphs split and join with the line ends that come and go. */
export function editBody(
  body: Pick<TextBody, "runs" | "paras">,
  from: number,
  to: number,
  text: string,
  style?: Style,
): BodyEdit {
  const runs = replaceText(body.runs, from, to, text, style);
  if (!body.paras) return { runs, paras: undefined };
  const paras = allParas(body);
  const first = paraAt(body.runs, from);
  const last = paraAt(body.runs, to);
  const breaks = text.split("\n").length - 1;
  // An empty line that is joined with the next takes the next one's look.
  const own = breaks === 0 && last.index > first.index && first.from === from ? paras[last.index] : paras[first.index];
  const added = Array.from({ length: breaks }, () => continued(own));
  return { runs, paras: tidyParas([...paras.slice(0, first.index), own, ...added, ...paras.slice(last.index + 1)]) };
}

/** A list goes on; its number does not start over. */
function continued(para: Para): Para {
  return para.list ? { ...para, list: { ...para.list, start: undefined } } : para;
}

/** Changes the settings of some paragraphs. */
export function setParas(
  body: Pick<TextBody, "runs" | "paras">,
  from: number,
  to: number,
  patch: (para: Para, index: number) => Para,
): Para[] | undefined {
  return tidyParas(allParas(body).map((para, i) => (i >= from && i <= to ? patch(para, i) : para)));
}

// ---------------------------------------------------------------- lists

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function roman(value: number): string {
  let left = Math.max(1, Math.min(3999, Math.round(value)));
  let out = "";
  for (const [n, sign] of ROMAN) {
    while (left >= n) {
      out += sign;
      left -= n;
    }
  }
  return out;
}

function lettered(value: number): string {
  let left = Math.max(1, Math.round(value));
  let out = "";
  while (left > 0) {
    left -= 1;
    out = String.fromCharCode(97 + (left % 26)) + out;
    left = Math.floor(left / 26);
  }
  return out;
}

/** "1." with 3 is "3."; "(a)" with 3 is "(c)". */
export function numberMark(mark: string, value: number): string {
  return mark.replace(/[1aAiI]/, (kind) => {
    if (kind === "1") return String(value);
    if (kind === "a") return lettered(value);
    if (kind === "A") return lettered(value).toUpperCase();
    return kind === "i" ? roman(value) : roman(value).toUpperCase();
  });
}

/** What stands in front of every paragraph: its bullet or number, or nothing. */
export function listMarks(body: Pick<TextBody, "runs" | "paras">): (string | null)[] {
  const counts: number[] = [];
  const kinds: string[] = [];
  return allParas(body).map(({ list }) => {
    if (!list) {
      counts.length = 0;
      kinds.length = 0;
      return null;
    }
    const { level } = list;
    const kind = `${list.type}${list.mark}`;
    counts.length = Math.min(counts.length, level + 1);
    kinds.length = Math.min(kinds.length, level + 1);
    if (list.type === "bullet") {
      kinds[level] = kind;
      counts[level] = 0;
      return list.mark;
    }
    const goes = counts[level] !== undefined && kinds[level] === kind && list.start === undefined;
    counts[level] = goes ? counts[level] + 1 : (list.start ?? 1);
    kinds[level] = kind;
    return numberMark(list.mark, counts[level]);
  });
}

/** How far a list level steps in, for a text size. */
export const listStep = (size: number) => Math.max(12, Math.round(size * 1.5 * 2) / 2);

export const BULLETS = ["•", "◦", "▪", "–", "➤", "✓", "★", "◆", "☐"] as const;
export const NUMBERS = ["1.", "1)", "(1)", "a.", "a)", "A.", "i.", "I."] as const;

/** What deeper levels look like. */
const DEEPER: string[][] = [
  ["•", "◦", "▪"],
  ["1.", "a.", "i."],
  ["1)", "a)", "i)"],
  ["(1)", "(a)", "(i)"],
  ["A.", "1.", "a."],
  ["I.", "A.", "1."],
];

/** The mark of a level, for a list where `mark` is the one of level `from`. */
export function levelMark(mark: string, from: number, to: number): string {
  if (from === to) return mark;
  for (const row of DEEPER) if (row[from % row.length] === mark) return row[to % row.length];
  // A list that started with another look goes on with the usual ones below it.
  for (const row of DEEPER) {
    const at = row.indexOf(mark);
    if (at >= 0) return row[(((at + to - from) % row.length) + row.length) % row.length];
  }
  return mark;
}

// ---------------------------------------------------------------- pages and objects

export function pageOf(doc: DocState, objectId: string): Page | null {
  return doc.pages.find((page) => page.objects.includes(objectId)) ?? null;
}

/** The part of a page that shows, in page space. */
export const pageBox = (page: Page): Box => page.box ?? { x: 0, y: 0, w: page.w, h: page.h };

/** Highlights mix with what is under them, so they lie over everything else. */
export const mixes = (object: EditObject | undefined): boolean =>
  object?.type === "mark" ? object.kind === "highlight" : object?.type === "ink" ? object.marker : false;

/** Size of a page as it is shown, with its rotation. */
export function shownSize(page: Page): { w: number; h: number } {
  const box = pageBox(page);
  return page.rotate % 180 === 0 ? { w: box.w, h: box.h } : { w: box.h, h: box.w };
}

/** From the page as it is stored to the page as it is shown, turned and cropped, in points. */
export function shownMatrix(page: Page): Matrix {
  const box = pageBox(page);
  switch (page.rotate) {
    case 90:
      return [0, 1, -1, 0, box.y + box.h, -box.x];
    case 180:
      return [-1, 0, 0, -1, box.x + box.w, box.y + box.h];
    case 270:
      return [0, -1, 1, 0, -box.y, box.x + box.w];
    default:
      return [1, 0, 0, 1, -box.x, -box.y];
  }
}

/** The room between the margins, in page space. The whole page when there are none. */
export function marginBox(page: Page): Box {
  const box = pageBox(page);
  const margin = page.margin;
  if (!margin) return box;
  const w = Math.max(20, box.w - margin.left - margin.right);
  const h = Math.max(20, box.h - margin.top - margin.bottom);
  return { x: box.x + margin.left, y: box.y + margin.top, w, h };
}

/** Lines have two ends instead of a box. */
export const isLine = (object: EditObject | undefined): object is ShapeObject & { kind: "line" | "arrow" } =>
  object?.type === "shape" && (object.kind === "line" || object.kind === "arrow");

/** Covers what is under it and takes the words out of the file. */
export const isCover = (object: EditObject | undefined): object is ShapeObject & { kind: "whiteout" | "redact" } =>
  object?.type === "shape" && (object.kind === "whiteout" || object.kind === "redact");

export const dashArray = (dash: Dash, width: number): number[] =>
  dash === "dash"
    ? [width * 3, width * 2]
    : dash === "dot"
      ? [Math.max(0.1, width), width * 1.6]
      : dash === "dashdot"
        ? [width * 3, width * 1.6, Math.max(0.1, width), width * 1.6]
        : [];
