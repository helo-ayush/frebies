import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Matrix } from "./engine/matrix";

/**
 * The document being edited. Every page is measured in points from its top-left
 * corner, y down, as the page is shown before any rotation made here.
 */

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
};

export type Run = { text: string; style: Style };
export type Align = "left" | "center" | "right" | "justify";

type Base = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the top-left corner. */
  angle: number;
  opacity: number;
};

export type TextObject = Base & {
  type: "text";
  runs: Run[];
  align: Align;
  /** Line height in points. */
  leading: number;
  /** False: the box grows with its longest line. */
  wrap: boolean;
  /** First line pushed in (or out), and the room kept on the left for it. */
  indent?: number;
  hang?: number;
  /** The text block of the PDF this came from. */
  block?: string;
  /** Opened but not changed yet: leaving it puts the original back untouched. */
  pristine?: boolean;
};

export type ImageObject = Base & {
  type: "image";
  asset: string;
  /** Part of the picture that shows, as fractions of it. */
  crop?: { x: number; y: number; w: number; h: number };
  flipX?: boolean;
  flipY?: boolean;
};

export type ShapeKind = "rect" | "ellipse" | "line" | "arrow" | "check" | "cross" | "dot" | "whiteout";
export type ShapeObject = Base & {
  type: "shape";
  kind: ShapeKind;
  stroke: string | null;
  fill: string | null;
  width: number;
  dash: boolean;
  /** Lines: drawn from the other pair of corners. */
  flip?: boolean;
  /** Arrows: the head is at the start. */
  back?: boolean;
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
  kind: "highlight" | "underline" | "strike";
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

export type FieldObject = Base & {
  type: "field";
  kind: "text" | "multiline" | "check" | "list";
  name: string;
  options: string[];
};

export type EditObject = TextObject | ImageObject | ShapeObject | InkObject | MarkObject | LinkObject | FieldObject;
export type ObjectType = EditObject["type"];

/** Glyphs of one text-showing operator: [operator, first, one past last]. */
export type GlyphRange = [number, number, number];

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
  objects: string[];
  /** Original text taken off the page, by block. */
  cuts: Record<string, GlyphRange[]>;
  /** The colour behind each of those blocks. */
  covers: Record<string, string>;
  /** Original pictures taken off the page. */
  imageCuts: number[];
  /** Original links taken off the page, as places in its annotation list. */
  linkCuts: number[];
};

export type DocState = {
  pages: Page[];
  objects: Record<string, EditObject>;
  /** Form answers, by `source:name`. */
  values: Record<string, string | boolean>;
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
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "highlight"
  | "underline"
  | "strike"
  | "whiteout"
  | "check"
  | "cross"
  | "dot"
  | "link"
  | "field-text"
  | "field-multiline"
  | "field-check"
  | "field-list";

export const DEFAULT_STYLE: Style = {
  font: "lib:arimo",
  size: 14,
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
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

export const plainText = (runs: readonly Run[]) => runs.map((run) => run.text).join("");

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
    a.rise === b.rise
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

/** The style a character typed at `offset` takes. */
export function styleAt(runs: readonly Run[], offset: number): Style {
  let at = 0;
  for (const run of runs) {
    at += run.text.length;
    if (offset <= at && run.text.length > 0) return run.style;
  }
  return runs[runs.length - 1]?.style ?? DEFAULT_STYLE;
}

export function pageOf(doc: DocState, objectId: string): Page | null {
  return doc.pages.find((page) => page.objects.includes(objectId)) ?? null;
}

/** Highlights mix with what is under them, so they lie over everything else. */
export const mixes = (object: EditObject | undefined): boolean =>
  object?.type === "mark" ? object.kind === "highlight" : object?.type === "ink" ? object.marker : false;

/** Size of a page as it is shown, with its rotation. */
export function shownSize(page: Page): { w: number; h: number } {
  return page.rotate % 180 === 0 ? { w: page.w, h: page.h } : { w: page.h, h: page.w };
}
