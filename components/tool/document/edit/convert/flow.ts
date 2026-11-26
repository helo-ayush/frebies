/**
 * Documents the way other programs keep them. Readers turn a file into one of
 * these, the editor lays it out on pages; writers go the other way. All
 * measures are points (1/72 inch), all colours `#rrggbb`.
 */

export type FlowAlign = "left" | "center" | "right" | "justify";

export type FlowStyle = {
  /** Family as the file names it ("Calibri"), or an editor font ("lib:arimo"). */
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  script?: "super" | "sub";
  /** Colour behind the letters. */
  highlight?: string;
  /** Where the words lead: an address, mail or phone link. */
  link?: string;
  /** Extra space after every letter. */
  tracking?: number;
};

export type FlowImage = {
  bytes: Uint8Array;
  mime: string;
  /** Size on the page. */
  w: number;
  h: number;
  alt?: string;
  /** Placed on its own instead of in the line. Measured from the page or from its paragraph. */
  float?: { x: number; y: number; from: "page" | "para"; behind?: boolean };
  /** Part that shows, as fractions. */
  crop?: { x: number; y: number; w: number; h: number };
  angle?: number;
};

/** Letters, or a picture standing in the line. "\n" is a line break, "\t" a tab. */
export type FlowRun =
  { text: string; style: FlowStyle; image?: undefined } | { image: FlowImage; text?: undefined; style?: FlowStyle };

/**
 * `mark` is the bullet itself ("•", "☐") or the pattern of the number, where
 * 1, a, A, i or I stands for the count: "1.", "1)", "(a)", "I.".
 */
export type FlowList = { type: "bullet" | "number"; mark: string; level: number; start?: number };

export type FlowLine = { color: string; width: number; dash?: "solid" | "dash" | "dot" };

export type FlowPara = {
  kind: "para";
  runs: FlowRun[];
  align?: FlowAlign;
  list?: FlowList;
  /** Indents. `first` is added to `left` for the first line; negative hangs. */
  left?: number;
  right?: number;
  first?: number;
  before?: number;
  after?: number;
  /** A multiple of the font's own line height (Word's "single" is 1), or points. */
  line?: { times: number } | { points: number; atLeast?: boolean };
  heading?: 1 | 2 | 3 | 4 | 5 | 6;
  breakBefore?: boolean;
  keepNext?: boolean;
  /** Colour behind the paragraph, and lines around it. */
  fill?: string;
  border?: { top?: FlowLine; right?: FlowLine; bottom?: FlowLine; left?: FlowLine };
  /** Tab stops, from the left margin. */
  tabs?: number[];
  /** Writers: keep it exactly here on the page (points from the page's top-left). */
  frame?: { x: number; y: number; w: number; h?: number };
};

export type FlowCell = {
  blocks: FlowPara[];
  colSpan?: number;
  rowSpan?: number;
  fill?: string;
  valign?: "top" | "middle" | "bottom";
  /** null: no line on that side. Left out: the table's own line. */
  border?: { top?: FlowLine | null; right?: FlowLine | null; bottom?: FlowLine | null; left?: FlowLine | null };
};

export type FlowRow = { cells: FlowCell[]; /** At least this high. */ h?: number; head?: boolean };

/** Cells covered by a span are simply not in their row's list, as in HTML. */
export type FlowTable = {
  kind: "table";
  cols: number[];
  rows: FlowRow[];
  align?: "left" | "center" | "right";
  left?: number;
  border?: FlowLine | null;
  pad?: { top: number; right: number; bottom: number; left: number };
};

/** A text box or drawing that stands on its own on the page. */
export type FlowBox = {
  kind: "box";
  x: number;
  y: number;
  from: "page" | "para";
  w: number;
  h: number;
  /** One of the editor's shapes; "rect" when left out. */
  shape?: string;
  blocks: FlowPara[];
  fill?: string;
  stroke?: FlowLine;
  valign?: "top" | "middle" | "bottom";
};

export type FlowRule = { kind: "rule"; color?: string; width?: number };
export type FlowBreak = { kind: "break" };

export type FlowBlock = FlowPara | FlowTable | FlowBox | FlowRule | FlowBreak;

export type FlowMargin = { top: number; right: number; bottom: number; left: number };

export type FlowSection = {
  w: number;
  h: number;
  margin: FlowMargin;
  /** Text columns side by side. */
  columns?: number;
  gap?: number;
  blocks: FlowBlock[];
  /** Shown on every page. "{page}" and "{pages}" in the text stand for the numbers. */
  header?: FlowBlock[];
  footer?: FlowBlock[];
  /** From the page's edge. */
  headerAt?: number;
  footerAt?: number;
};

export type FlowDoc = { kind: "flow"; title?: string; author?: string; sections: FlowSection[] };

// ---------------------------------------------------------------- pages where everything has its place

export type FixedText = {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  blocks: FlowPara[];
  valign?: "top" | "middle" | "bottom";
  pad?: { top: number; right: number; bottom: number; left: number };
  /** The box behind the text. "rect" when left out. */
  shape?: string;
  adj?: number[];
  fill?: string;
  stroke?: FlowLine;
  opacity?: number;
  /** Lines end only where the text says so. */
  noWrap?: boolean;
  flipX?: boolean;
  flipY?: boolean;
};

export type FixedImage = {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  bytes: Uint8Array;
  mime: string;
  crop?: { x: number; y: number; w: number; h: number };
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
};

export type LineHead = "none" | "arrow" | "open" | "dot" | "bar" | "diamond";

export type FixedShape = {
  kind: "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  /** Named as in Office: rect, roundRect, ellipse, triangle, rightArrow, star5, line... */
  shape: string;
  adj?: number[];
  fill?: string;
  stroke?: FlowLine;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Lines only. */
  start?: LineHead;
  end?: LineHead;
};

export type FixedTable = { kind: "table"; x: number; y: number; w: number; table: FlowTable };

export type FixedItem = FixedText | FixedImage | FixedShape | FixedTable;

export type FixedPage = { w: number; h: number; fill?: string; items: FixedItem[]; notes?: string };

export type FixedDoc = { kind: "fixed"; title?: string; pages: FixedPage[] };

export type AnyDoc = FlowDoc | FixedDoc;

/** What a reader throws when a file cannot be opened, in words for the visitor. */
export class ConvertError extends Error {}
