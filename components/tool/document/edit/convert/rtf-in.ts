import {
  bitmapFile,
  bulletLook,
  cleanLink,
  decodeText,
  flatten,
  hexOf,
  isBlank,
  joinFrames,
  lettered,
  listOfMark,
  mixColors,
  openPicture,
  placeTabs,
  plain,
  roman,
  round,
  runsWidth,
  safeDecode,
  setStarts,
  settleBorders,
  symbolText,
  textOf,
  textWidth,
  tidyRuns,
  whiteOnDark,
  type Stop,
} from "./html-in";
import {
  ConvertError,
  type FlowAlign,
  type FlowBlock,
  type FlowBox,
  type FlowCell,
  type FlowDoc,
  type FlowImage,
  type FlowLine,
  type FlowList,
  type FlowPara,
  type FlowRow,
  type FlowRun,
  type FlowSection,
  type FlowStyle,
  type FlowTable,
} from "./flow";
import {
  connectorCorners,
  fillStyle,
  lineImage,
  onSide,
  paintImage,
  quartersOf,
  runThrough,
  shapeImage,
  SIMPLE,
  strokeWith,
  turnedShape,
  turnLine,
  type Frame,
  type Paint,
  type Point,
} from "./xml";

/**
 * Rich Text Format, and what it has in common with Word's old binary files:
 * both keep Word's own ideas of lists, tab stops, shading and tables.
 */

// ---------------------------------------------------------------- lists, as Word counts

export type Level = {
  /** Word's number for the kind: 0 digits, 1 and 2 Roman, 3 and 4 letters, 23 a bullet, 255 nothing. */
  kind: number;
  start: number;
  /** What is written; characters 0 to 8 stand for the counts of those levels. */
  text: string;
  /** The bullet's font. */
  font?: string;
  /** What comes after it: 0 a tab, 1 a space, 2 nothing. */
  follow: number;
  /** Its place: 0 it starts where the paragraph does, 1 it has its middle there, 2 it ends there. */
  side?: number;
  /** All counts in digits. */
  legal: boolean;
  /** Items of levels below this number start the level over. */
  restart: number;
};

/** A live list where the editor can count on its own, otherwise the mark as letters. */
export type Mark =
  | { list: FlowList; count: number; side?: number; follow?: number; lead?: undefined }
  | { lead: string; list?: undefined };

const PATTERNS: Record<number, string> = { 0: "1", 1: "I", 2: "i", 3: "A", 4: "a" };
const ONES = (
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen " +
  "sixteen seventeen eighteen nineteen"
).split(" ");
const TENS = "x x twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const ORDINALS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
};

function spelled(n: number, ordinal: boolean): string {
  const tail = n % 100;
  const whole = [
    n >= 100 ? `${n >= 2000 ? n / 100 : ONES[Math.floor(n / 100)]} hundred` : "",
    tail > 0 || n === 0
      ? tail < 20
        ? ONES[tail]
        : TENS[Math.floor(tail / 10)] + (tail % 10 ? `-${ONES[tail % 10]}` : "")
      : "",
  ].filter(Boolean);
  let text = whole.join(" ");
  if (ordinal)
    text = text.replace(
      /[a-z]+$/,
      (word) => ORDINALS[word] ?? (word.endsWith("y") ? `${word.slice(0, -1)}ieth` : `${word}th`),
    );
  return text[0].toUpperCase() + text.slice(1);
}

export function countText(kind: number, n: number): string {
  if (kind === 1) return roman(n).toUpperCase();
  if (kind === 2) return roman(n);
  // Word repeats its letters after z: aa, bb, cc.
  if (kind === 3 || kind === 4) {
    const text = n > 26 ? lettered(((n - 1) % 26) + 1).repeat(Math.ceil(n / 26)) : lettered(n);
    return kind === 3 ? text.toUpperCase() : text;
  }
  if (kind === 5) return `${n}${/1\d$/.test(String(n)) ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
  if ((kind === 6 || kind === 7) && n >= 0 && n < 2000) return spelled(n, kind === 7);
  if (kind === 22) return n < 10 ? `0${n}` : String(n);
  return String(n);
}

/** Keeps the counts of every list of a document. */
export class Counter {
  private counts = new Map<string, (number | undefined)[]>();
  private used = new Set<string>();

  /** `instance` is one use of the list, which may ask for numbers of its own to start with. */
  next(
    list: string,
    levels: readonly Level[],
    at: number,
    instance = "",
    starts?: ReadonlyMap<number, number>,
  ): Mark | null {
    const level = levels[at];
    if (!level) return null;
    const counts = this.counts.get(list) ?? [];
    this.counts.set(list, counts);
    const begin = (one: number) => starts?.get(one) ?? levels[one]?.start ?? 1;
    // A number of its own to start with counts from the first item of that level on.
    const use = `${instance} ${at}`;
    if (starts?.has(at) && !this.used.has(use)) counts[at] = undefined;
    this.used.add(use);
    const was = counts[at];
    const count = was === undefined ? begin(at) : was + 1;
    counts[at] = count;
    for (let deeper = at + 1; deeper < 9; deeper += 1)
      if (at < (levels[deeper]?.restart ?? deeper)) counts[deeper] = undefined;

    if (level.kind === 23) {
      const text = symbolText(level.font, level.text) ?? level.text;
      const bullet = /courier/i.test(level.font ?? "") && text === "o" ? "◦" : bulletLook(plain(text).trim());
      return bullet
        ? { list: { type: "bullet", mark: bullet, level: at }, count: 0, side: level.side, follow: level.follow }
        : null;
    }
    const holders = [...level.text].filter((sign) => sign.charCodeAt(0) < 9).map((sign) => sign.charCodeAt(0));
    const words = level.text.replace(/[\u0000-\u0008]/g, "");
    if (holders.length === 0) return words.trim() ? { lead: this.after(words, level) } : null;
    const pattern = PATTERNS[level.kind];
    const simple = holders.length === 1 && holders[0] === at && pattern !== undefined && !/[1aAiI]/.test(words);
    // The editor counts letters on past z in another way.
    if (simple && !(level.kind > 2 && count > 26)) {
      const mark = level.text.replace(/[\u0000-\u0008]/, pattern).trim();
      return { list: { type: "number", mark, level: at }, count, side: level.side, follow: level.follow };
    }
    const text = level.text.replace(/[\u0000-\u0008]/g, (sign) => {
      const one = sign.charCodeAt(0);
      const kind = levels[one]?.kind ?? 0;
      return countText(level.legal && kind !== 22 ? 0 : kind, counts[one] ?? begin(one));
    });
    return { lead: this.after(text, level) };
  }

  private after(text: string, level: Level): string {
    return text + (level.follow === 0 ? "\t" : level.follow === 1 ? " " : "");
  }
}

/**
 * Marks stand in front of the words here, at the place the first line starts. Where
 * Word lets them end there, or has no room for them, the paragraph makes it.
 */
export function hangMark(para: FlowPara, mark: Extract<Mark, { list: FlowList }>, stops: readonly Stop[]) {
  const { list, count, side = 0, follow = 0 } = mark;
  const style = { ...para.runs.find((piece) => piece.text !== undefined)?.style, tracking: 0 };
  const kinds: Record<string, number> = { "1": 0, I: 1, i: 2, A: 3, a: 4 };
  const text =
    list.type === "bullet" ? list.mark : list.mark.replace(/[1aAiI]/, (kind) => countText(kinds[kind], count));
  const wide = textWidth(text, style);
  const left = para.left ?? 0;
  const first = para.first ?? 0;
  let hang = -first;
  if (hang > 0) {
    if (side === 2) hang += wide;
    else if (side === 1) hang += wide / 2;
    hang = Math.max(hang, wide + 3);
  } else {
    // The words follow in the same line: after a space, or at the next stop.
    const from = left + first;
    const end = from + wide + (follow === 2 ? 1 : 3);
    const next = follow !== 0 ? end : (stops.find((stop) => stop.at > end)?.at ?? (Math.floor(end / 36) + 1) * 36);
    para.left = round(next);
    hang = next - from;
  }
  para.first = round(-hang);
}

// ---------------------------------------------------------------- shading and lines

/** Shares of the front colour in Word's shading patterns. */
// prettier-ignore
const PERCENT: Record<number, number> = {
  2: 5, 3: 10, 4: 20, 5: 25, 6: 30, 7: 40, 8: 50, 9: 60, 10: 70, 11: 75, 12: 80, 13: 90,
  35: 2.5, 36: 7.5, 37: 12.5, 38: 15, 39: 17.5, 40: 22.5, 41: 27.5, 42: 32.5, 43: 35, 44: 37.5, 45: 42.5, 46: 45,
  47: 47.5, 48: 52.5, 49: 55, 50: 57.5, 51: 62.5, 52: 65, 53: 67.5, 54: 72.5, 55: 77.5, 56: 82.5, 57: 85, 58: 87.5,
  59: 92.5, 60: 95, 61: 97.5, 62: 97,
};

/** The colour a shading comes down to. Undefined colours are "automatic". */
export function shade(fore: string | undefined, back: string | undefined, pattern: number): string | undefined {
  if (pattern === 0xffff) return undefined;
  if (pattern === 0) return back;
  if (pattern === 1) return fore ?? "#000000";
  const part = PERCENT[pattern] ?? (pattern <= 19 ? 45 : pattern <= 25 ? 25 : 0);
  return mixColors(fore ?? "#000000", back ?? "#ffffff", part / 100);
}

/** The same for a share in hundredths of a percent, as RTF has it. */
export const shadeShare = (fore: string | undefined, back: string | undefined, share: number) =>
  share <= 0 ? back : mixColors(fore ?? "#000000", back ?? "#ffffff", Math.min(1, share / 10000));

/** A line of Word's: its kind, its width in eighths of a point. Null for none. */
export function wordLine(kind: number, eighths: number, color: string | undefined): FlowLine | null {
  if (kind === 0 || kind === 255 || (eighths === 0 && kind < 64)) return null;
  // Two or three thin lines look like a somewhat thicker one.
  const many = kind === 3 || (kind >= 10 && kind <= 19) || kind === 21;
  const width = kind >= 64 ? Math.min(6, eighths) : (eighths / 8) * (many ? 1.5 : 1);
  const line: FlowLine = { color: color ?? "#000000", width: round(Math.max(0.25, Math.min(12, width))) };
  if (kind === 6) line.dash = "dot";
  else if (kind === 7 || kind === 8 || kind === 9 || kind === 22 || kind === 23) line.dash = "dash";
  return line;
}

// ---------------------------------------------------------------- tables

export type RowCell = {
  /** Edges in points from the text's left margin. */
  x0: number;
  x1: number;
  blocks: FlowPara[];
  /** Goes on from the cell above, or starts a cell that goes on below. */
  down?: "start" | "more";
  fill?: string;
  valign?: FlowCell["valign"];
  border: NonNullable<FlowCell["border"]>;
};

export type TableRow = { cells: RowCell[]; h?: number; head?: boolean };

/** Rows whose cells end anywhere become rows of one grid. */
export function buildTable(rows: readonly TableRow[], pad: NonNullable<FlowTable["pad"]>): FlowTable | null {
  const edges: number[] = [];
  for (const row of rows)
    for (const cell of row.cells)
      for (const x of [cell.x0, cell.x1]) if (!edges.some((edge) => Math.abs(edge - x) < 0.8)) edges.push(x);
  edges.sort((a, b) => a - b);
  if (edges.length < 2) return null;
  const place = (x: number) => {
    let best = 0;
    for (let i = 1; i < edges.length; i += 1) if (Math.abs(edges[i] - x) < Math.abs(edges[best] - x)) best = i;
    return best;
  };
  const table: FlowTable = { kind: "table", cols: [], rows: [], pad };
  table.cols = edges.slice(1).map((edge, i) => round(edge - edges[i]));
  /** Cells that reach down into the next row, by their first column. */
  let open = new Map<number, { cell: FlowCell; cols: number }>();
  const none = { top: null, right: null, bottom: null, left: null };
  const filler = (cols: number): FlowCell => {
    const cell: FlowCell = {
      blocks: [{ kind: "para", runs: [{ text: "", style: {} }], before: 0, after: 0 }],
      border: { ...none },
    };
    if (cols > 1) cell.colSpan = cols;
    return cell;
  };
  for (const row of rows) {
    const out: FlowRow = { cells: [] };
    if (row.h) out.h = round(row.h);
    if (row.head) out.head = true;
    const still = new Map<number, { cell: FlowCell; cols: number }>();
    let at = 0;
    for (const source of row.cells) {
      const from = place(source.x0);
      const to = place(source.x1);
      if (to <= from || from < at) {
        // No width of its own: its words go to the cell before it.
        const last = out.cells[out.cells.length - 1];
        if (last && !source.blocks.every(isBlank)) last.blocks.push(...source.blocks);
        continue;
      }
      if (from > at) out.cells.push(filler(from - at));
      const above = source.down === "more" ? open.get(from) : undefined;
      if (above && above.cols === to - from) {
        above.cell.rowSpan = (above.cell.rowSpan ?? 1) + 1;
        if (above.cell.border && source.border.bottom !== undefined) above.cell.border.bottom = source.border.bottom;
        if (!source.blocks.every(isBlank)) above.cell.blocks.push(...source.blocks);
        still.set(from, above);
      } else {
        const cell: FlowCell = { blocks: source.blocks, border: source.border };
        if (cell.blocks.length === 0) cell.blocks = filler(1).blocks;
        if (to - from > 1) cell.colSpan = to - from;
        if (source.fill) cell.fill = source.fill;
        if (source.valign && source.valign !== "top") cell.valign = source.valign;
        whiteOnDark(cell.blocks, cell.fill);
        out.cells.push(cell);
        if (source.down) still.set(from, { cell, cols: to - from });
      }
      at = to;
    }
    if (at < edges.length - 1) out.cells.push(filler(edges.length - 1 - at));
    open = still;
    table.rows.push(out);
  }
  table.rows.forEach((row) => {
    let at = 0;
    for (const cell of row.cells) {
      const cols = cell.colSpan ?? 1;
      const wide = table.cols.slice(at, at + cols).reduce((sum, one) => sum + one, 0) - pad.left - pad.right;
      at += cols;
      const high = pictureRoom(cell.blocks, Math.max(8, wide));
      if (high > 0 && !cell.rowSpan) row.h = round(Math.max(row.h ?? 0, high + pad.top + pad.bottom));
    }
  });
  settleBorders(table);
  return table;
}

/** A table that asks for another width than its columns have gets it. */
export function stretch(table: FlowTable, wanted: number) {
  const total = table.cols.reduce((sum, one) => sum + one, 0);
  if (wanted > 20 && Math.abs(wanted - total) > total * 0.02)
    table.cols = table.cols.map((one) => round((one * wanted) / total));
}

/** Pictures in cells must not be wider than these, and the row must be high enough for them. */
export function pictureRoom(blocks: readonly FlowPara[], wide: number): number {
  let any = false;
  for (const para of blocks)
    for (const { image } of para.runs) {
      if (!image || image.float) continue;
      any = true;
      if (image.w > wide) {
        image.h = round((image.h * wide) / image.w);
        image.w = round(wide);
      }
      const line = para.line && "points" in para.line ? para.line.points : 0;
      para.line = { points: round(Math.max(line, image.h + 2)), atLeast: true };
    }
  return any ? blocks.reduce((sum, para) => sum + heightOf(para, wide), 0) : 0;
}

// ---------------------------------------------------------------- last touches

export type ParaInfo = { style: string; contextual: boolean; between?: FlowLine };

/** What a reader knows about the paragraphs it made. */
export type Known = {
  info: Map<FlowPara, ParaInfo>;
  counts: Map<FlowPara, number>;
  /** Of two spaces that meet only the larger one shows, as on web pages. */
  larger: boolean;
};

/** Space between paragraphs, frames, white text on dark, and where lists start. */
export function finishBlocks(blocks: readonly FlowBlock[], { info, counts, larger }: Known) {
  for (let i = 1; i < blocks.length; i += 1) {
    const a = blocks[i - 1];
    const b = blocks[i];
    if (a.kind !== "para" || b.kind !== "para") continue;
    const one = info.get(a);
    const two = info.get(b);
    if (!one || !two) continue;
    if (one.style === two.style) {
      if (one.contextual) a.after = 0;
      if (two.contextual) b.before = 0;
    }
    if (larger && b.before && a.after && !b.breakBefore) b.before = round(Math.max(0, b.before - a.after));
  }
  const between = new Map<FlowPara, FlowLine>();
  for (const [para, { between: line }] of info) if (line) between.set(para, line);
  joinFrames(blocks, between);
  setStarts(blocks, counts);
  for (const block of blocks) if (block.kind === "para") whiteOnDark([block], block.fill);
}

/**
 * Sections that go on down the same page. One page has one set of columns here,
 * so they become one section with those that hold most of the text.
 */
export function joinSections(sections: { section: FlowSection; goesOn: boolean }[]): FlowSection[] {
  const weight = (blocks: readonly FlowBlock[]) => {
    let sum = 0;
    for (const block of blocks) {
      if (block.kind === "para") sum += textOf(block).length + 20;
      else if (block.kind === "table")
        for (const row of block.rows)
          for (const cell of row.cells) for (const para of cell.blocks) sum += textOf(para).length;
    }
    return sum;
  };
  const groups: FlowSection[][] = [];
  for (const { section, goesOn } of sections) {
    const last = groups[groups.length - 1];
    const before = last?.[0];
    if (goesOn && before && Math.abs(before.w - section.w) < 1 && Math.abs(before.h - section.h) < 1)
      last.push(section);
    else groups.push([section]);
  }
  return groups.map((group) => {
    const [first] = group;
    if (group.length === 1) return first;
    const main = group.reduce((best, one) => (weight(one.blocks) > weight(best.blocks) ? one : best), first);
    const out: FlowSection = { ...first, blocks: group.flatMap((one) => one.blocks) };
    delete out.columns;
    delete out.gap;
    if (main.columns) out.columns = main.columns;
    if (main.gap !== undefined) out.gap = main.gap;
    if (main !== first) out.margin = { ...first.margin, left: main.margin.left, right: main.margin.right };
    return out;
  });
}

/** Turns odd kinds of pictures into ones everything can show, and drops those that cannot be opened. */
export async function settlePictures(sections: readonly FlowSection[], images: readonly FlowImage[]) {
  const lost = new Set<FlowImage>();
  const done = new Map<Uint8Array, ReturnType<typeof openPicture>>();
  await Promise.all(
    images.map(async (image) => {
      const job = done.get(image.bytes) ?? openPicture(image.bytes, image.mime);
      done.set(image.bytes, job);
      const picture = await job;
      if (!picture) lost.add(image);
      else {
        image.bytes = picture.bytes;
        image.mime = picture.mime;
      }
    }),
  );
  if (lost.size === 0) return;
  for (const section of sections)
    for (const blocks of [section.blocks, section.header ?? [], section.footer ?? []])
      for (const para of allParas(blocks)) {
        const blank = para.runs.find((piece) => piece.text !== undefined)?.style ?? {};
        para.runs = para.runs.filter((piece) => !piece.image || !lost.has(piece.image));
        if (para.runs.length === 0) para.runs.push({ text: "", style: { ...blank } });
      }
}

function allParas(blocks: readonly FlowBlock[]): FlowPara[] {
  return blocks.flatMap((block) => {
    if (block.kind === "para") return [block];
    if (block.kind === "box") return block.blocks;
    return block.kind === "table" ? block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.blocks)) : [];
  });
}

/** A copy that shares nothing but the pictures' bytes. */
export function copyBlocks<T>(value: T): T {
  if (value instanceof Uint8Array || typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map((one) => copyBlocks(one)) as T;
  return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, copyBlocks(one)])) as T;
}

/** The last touches for blocks and for what stands in their cells and boxes. */
export function finishAll(blocks: readonly FlowBlock[], known: Known) {
  finishBlocks(blocks, known);
  for (const block of blocks) {
    if (block.kind === "box") finishBlocks(block.blocks, known);
    else if (block.kind === "table")
      for (const row of block.rows) for (const cell of row.cells) finishBlocks(cell.blocks, known);
  }
}

// ---------------------------------------------------------------- pages

export const columnWidth = (section: FlowSection): number => {
  const width = section.w - section.margin.left - section.margin.right;
  const cols = section.columns ?? 1;
  return cols > 1 ? (width - (section.gap ?? 0) * (cols - 1)) / cols : width;
};

/** About how high a block gets. */
function heightOf(block: FlowBlock, width: number): number {
  if (block.kind === "para") {
    let size = 0;
    let picture = 0;
    for (const piece of block.runs) {
      if (piece.image) picture = piece.image.float ? picture : Math.max(picture, piece.image.h);
      else size = Math.max(size, piece.style.size ?? 11);
    }
    const room = Math.max(20, width - (block.left ?? 0) - (block.right ?? 0));
    const lines = Math.max(1, Math.ceil(runsWidth(block.runs.filter((piece) => !piece.image?.float)) / room));
    const breaks = textOf(block).split("\n").length - 1;
    const line =
      block.line && "points" in block.line ? block.line.points : (size || 11) * 1.2 * (block.line?.times ?? 1);
    return (block.before ?? 0) + (block.after ?? 0) + (lines + breaks) * line + Math.max(0, picture - line);
  }
  if (block.kind === "table")
    return block.rows.reduce((sum, row) => {
      const part = width / Math.max(1, row.cells.length);
      const cells = row.cells.map((cell) => cell.blocks.reduce((high, para) => high + heightOf(para, part), 0));
      return sum + Math.max(row.h ?? 0, ...cells);
    }, 0);
  return block.kind === "rule" ? 8 : 0;
}

export type Heads = { header?: FlowBlock[]; footer?: FlowBlock[] };

/**
 * A first page with a header of its own becomes a section of its own, where the
 * text says where that page ends. Sections have one header here.
 */
export function splitFirst(section: FlowSection, own: Heads | undefined): FlowSection[] {
  if (!own) return [section];
  // A letterhead that is only on the first page is better on all than on none.
  if (!section.header && !section.footer) return [{ ...section, ...own }];
  const words = (blocks?: FlowBlock[]) =>
    JSON.stringify(blocks?.map((one) => (one.kind === "para" ? textOf(one) : one.kind)));
  if (words(own.header) === words(section.header) && words(own.footer) === words(section.footer)) return [section];
  const mine = (page: FlowSection): FlowSection => {
    const out = { ...page };
    delete out.header;
    delete out.footer;
    if (own.header) out.header = own.header;
    if (own.footer) out.footer = own.footer;
    return out;
  };
  const room = section.h - section.margin.top - section.margin.bottom;
  const width = columnWidth(section);
  let high = 0;
  for (let i = 0; i < section.blocks.length && high < room * 1.05; i += 1) {
    const block = section.blocks[i];
    if (block.kind === "break" || (block.kind === "para" && block.breakBefore && i > 0)) {
      const rest = section.blocks.slice(block.kind === "break" ? i + 1 : i);
      if (rest.length === 0) return [mine(section)];
      if (rest[0].kind === "para") delete rest[0].breakBefore;
      return [mine({ ...section, blocks: section.blocks.slice(0, i) }), { ...section, blocks: rest }];
    }
    high += heightOf(block, width);
  }
  return high < room * 0.8 ? [mine(section)] : [section];
}

/** Text of a header or footer, or nothing when it only holds empty lines. */
export function headBlocks(blocks: FlowBlock[]): FlowBlock[] | undefined {
  const last = () => blocks[blocks.length - 1];
  // Page numbers often stand in a frame, with the empty line of the footer after it.
  while (
    blocks.length > 1 &&
    last().kind === "para" &&
    isBlank(last() as FlowPara) &&
    blocks[blocks.length - 2].kind === "para"
  )
    blocks.pop();
  return blocks.every((block) => block.kind === "para" && isBlank(block)) ? undefined : blocks;
}

// ---------------------------------------------------------------- rows as both formats have them

/** undefined: nothing said. null: no line. */
export type Edge = FlowLine | null | undefined;

export type RuledCell = {
  x0: number;
  x1: number;
  blocks: FlowPara[];
  /** Goes with the cell before it. */
  joined: boolean;
  down?: RowCell["down"];
  valign: FlowCell["valign"];
  /** Top, left, bottom, right. */
  border: Edge[];
  fill?: string;
};

export type RuledRow = {
  cells: RuledCell[];
  /** Top, left, bottom, right, between rows, between columns. */
  lines: Edge[];
  h: number;
  head: boolean;
};

/** Joins cells and gives every side the line that counts: the cell's own, or the row's. */
export function ruledRows(rows: readonly RuledRow[]): TableRow[] {
  return rows.map((row, r) => {
    const cells: RowCell[] = [];
    row.cells.forEach((cell, c) => {
      const edge = (own: number, outer: number, between: number, atEdge: boolean): FlowLine | null =>
        (cell.border[own] === undefined ? row.lines[atEdge ? outer : between] : cell.border[own]) ?? null;
      const right = edge(3, 3, 5, c === row.cells.length - 1);
      const before = cells[cells.length - 1];
      if (cell.joined && before) {
        before.x1 = cell.x1;
        if (!cell.blocks.every(isBlank)) before.blocks.push(...cell.blocks);
        before.border.right = right;
        return;
      }
      const one: RowCell = {
        x0: cell.x0,
        x1: cell.x1,
        blocks: cell.blocks,
        valign: cell.valign,
        border: {
          top: edge(0, 0, 4, r === 0),
          right,
          bottom: edge(2, 2, 4, r === rows.length - 1),
          left: edge(1, 1, 5, c === 0),
        },
      };
      if (cell.down) one.down = cell.down;
      if (cell.fill) one.fill = cell.fill;
      cells.push(one);
    });
    const out: TableRow = { cells };
    if (row.h) out.h = Math.abs(row.h);
    if (row.head) out.head = true;
    return out;
  });
}

// ---------------------------------------------------------------- floating things

/** Office notes the place of what lies on its side as if it stood upright. */
export function turned(at: Frame, angle: number): Frame {
  const side = ((angle % 180) + 180) % 180;
  if (side < 45 || side >= 135) return at;
  return { x: at.x + (at.w - at.h) / 2, y: at.y + (at.h - at.w) / 2, w: at.h, h: at.w };
}

/** How words go around something: beside it, or only above and below. */
export type Wraps = Map<FlowImage | FlowBox, "around" | "apart">;

/**
 * Pictures and boxes the words only stand above and below of get room of their own.
 * (Words beside them are looked after when the pages are made.)
 */
export function makeRoom(source: readonly FlowBlock[], wraps: Wraps, room: number): FlowBlock[] {
  if (wraps.size === 0) return [...source];
  const blocks: FlowBlock[] = [];
  for (const block of source) {
    if (block.kind === "box") {
      const how = block.from === "para" ? wraps.get(block) : undefined;
      if (how && (how === "apart" || Math.max(block.x, room - block.x - block.w) < room * 0.3)) {
        // An empty paragraph keeps the room the box needs.
        const high = round(Math.max(4, block.h + 6));
        blocks.push({ ...block, y: 0 });
        blocks.push({
          kind: "para",
          runs: [{ text: "", style: { size: 4 } }],
          line: { points: high },
          before: 0,
          after: 0,
        });
        continue;
      }
    }
    if (block.kind !== "para") {
      blocks.push(block);
      continue;
    }
    const above: FlowPara[] = [];
    const below: FlowPara[] = [];
    block.runs = block.runs.filter(({ image }) => {
      const place = image?.float;
      if (!image || !place || place.from !== "para" || wraps.get(image) !== "apart") return true;
      const own: FlowPara = { kind: "para", runs: [{ image }], line: { times: 1 }, before: 4, after: 4 };
      const middle = place.x + image.w / 2;
      if (Math.abs(middle - room / 2) < room * 0.08) own.align = "center";
      else if (place.x + image.w > room * 0.94) own.align = "right";
      else if (place.x > 1) own.left = round(place.x);
      (place.y < 12 || isBlank(block) ? above : below).push(own);
      delete image.float;
      return false;
    });
    if (block.runs.length === 0) block.runs.push({ text: "", style: {} });
    // A line that only held the picture goes with it.
    const alone = above.length > 0 && isBlank(block) && !block.breakBefore;
    blocks.push(...above, ...(alone ? [] : [block]), ...below);
  }
  return blocks;
}

// ---------------------------------------------------------------- letters and shapes

/**
 * 0 plain letters, 1 other Western ones, 2 East Asian, 3 right to left; -1 goes with
 * what is around it. Indian and similar letters only have looks of their own where
 * the file says so, as in Word.
 */
export function scriptOf(code: number): number {
  if (code === 0x20 || code === 0xa0 || code === 9) return -1;
  if (code < 0x80) return 0;
  if ((code >= 0x590 && code <= 0x8ff) || (code >= 0xfb1d && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfefc))
    return 3;
  if (code >= 0x2e80 && code <= 0xd7ff && !(code >= 0xa4d0 && code <= 0xabff)) return 2;
  if ((code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef)) return 2;
  if (code >= 0xd840 && code <= 0xdbff) return 2;
  // Joiners and the danda belong to the letters around them.
  if (code === 0x200c || code === 0x200d) return -1;
  return 1;
}

/** Office's numbers for shapes, and the names the editor has for them. */
export const OFFICE_SHAPES: Record<number, string> = {};
(
  "1 rect 2 roundRect 3 ellipse 4 diamond 5 triangle 6 rtTriangle 7 parallelogram 8 trapezoid " +
  "9 hexagon 10 octagon 11 plus 12 star5 13 rightArrow 14 rightArrow 15 homePlate 16 cube 19 arc " +
  "20 line 21 plaque 22 can 23 donut 32 line 47 borderCallout1 53 ribbon2 54 ribbon 55 chevron " +
  "56 pentagon 57 noSmoking 58 star8 59 star16 60 star32 61 wedgeRectCallout 62 wedgeRoundRectCallout " +
  "63 wedgeEllipseCallout 64 wave 65 foldedCorner 66 leftArrow 67 downArrow 68 upArrow " +
  "69 leftRightArrow 70 upDownArrow 71 irregularSeal1 72 irregularSeal2 73 lightningBolt 74 heart " +
  "76 quadArrow 78 rightArrowCallout 84 bevel 85 leftBracket 86 rightBracket 87 leftBrace " +
  "88 rightBrace 91 bentArrow 92 star24 93 stripedRightArrow 94 notchedRightArrow 95 blockArc " +
  "96 smileyFace 99 circularArrow 101 uturnArrow 102 curvedRightArrow 106 cloudCallout " +
  "109 flowChartProcess 110 flowChartDecision 111 flowChartInputOutput 112 flowChartPredefinedProcess " +
  "113 flowChartInternalStorage 114 flowChartDocument 115 flowChartMultidocument " +
  "116 flowChartTerminator 117 flowChartPreparation 118 flowChartManualInput " +
  "119 flowChartManualOperation 120 flowChartConnector 122 flowChartPunchedTape " +
  "123 flowChartSummingJunction 124 flowChartOr 125 flowChartCollate 126 flowChartSort " +
  "127 flowChartExtract 128 flowChartMerge 130 flowChartOnlineStorage 132 flowChartMagneticDisk " +
  "134 flowChartDisplay 135 flowChartDelay 176 flowChartAlternateProcess 177 flowChartOffpageConnector " +
  "183 sun 184 moon 185 bracketPair 186 bracePair 187 star4 188 doubleWave 202 rect"
).replace(/(\d+) (\w+)/g, (_, number, name) => (OFFICE_SHAPES[Number(number)] = name));

/** The outline of a shape of its own: corners, what to do with them, and the box they are measured in. */
export type Outline = { points: Point[]; steps: number[]; box: [number, number, number, number]; kind: number };

/** Words drawn as a shape (WordArt), the way watermarks are. */
export type Art = { words: string; font: string; bold: boolean; italic: boolean };

/** A drawn shape, the way both formats tell of it. */
export type Drawing = {
  /** Office's number for what it is. */
  type: number;
  /** Where it stands before it is turned. */
  frame: Frame;
  angle: number;
  flipH: boolean;
  flipV: boolean;
  fill: Paint | null;
  stroke: FlowLine | null;
  /** Lines: whether their ends have heads, and where they bend. */
  start: boolean;
  end: boolean;
  bends: number[];
  outline: Outline | null;
  art: Art | null;
  blocks: FlowPara[];
  valign: FlowBox["valign"];
};

/** A colour of a drawing. Some are the colour it is filled with, made darker or lighter. */
export function officeColor(value: number | undefined, usual: string, fill = usual): string {
  if (value === undefined) return usual;
  const [red, green, blue, kind] = [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24];
  if (kind & 0x10) {
    if (red === 5) return "#ffffff";
    if (red === 8) return "#000000";
    if (red < 0xf0) return usual;
    const how = green & 15;
    return how === 1
      ? mixColors(fill, "#000000", blue / 255)
      : how === 2
        ? mixColors(fill, "#ffffff", blue / 255)
        : fill;
  }
  return kind & 9 ? usual : hexOf(red, green, blue);
}

/** What a shape is filled with: one colour, or two that run into each other. */
export function paintOf(how: {
  kind: number;
  color: string;
  back: string;
  angle: number;
  focus: number;
  stops: [number, string][];
}): Paint | null {
  const { kind, color, back, focus } = how;
  if (kind < 4 || kind > 8) return { color };
  // From the first colour to the second up to the focus, and back again after it.
  const there: [number, string][] =
    how.stops.length > 1
      ? how.stops
      : [
          [0, color],
          [1, back],
        ];
  const again = there.map(([at, one]): [number, string] => [1 - at, one]).reverse();
  const share = Math.min(1, Math.abs(focus) / 100);
  const [first, second] = focus < 0 ? [again, there] : [there, again];
  const stops = [
    ...(share > 0 ? first.map(([at, one]): [number, string] => [at * share, one]) : []),
    ...(share < 1 ? second.map(([at, one]): [number, string] => [share + at * (1 - share), one]) : []),
  ];
  return runThrough(stops, kind === 5 || kind === 6 ? { radial: true } : { angle: 90 - how.angle });
}

/** Draws a shape of its own. Null when it is told in a way not known here. */
function outlineImage({ frame, flipH, flipV, fill, stroke }: Drawing, outline: Outline) {
  const { points, kind, box } = outline;
  const { w, h } = frame;
  if (!(w > 0.5 || h > 0.5)) return null;
  const at = ({ x, y }: Point): [number, number] => {
    const [a, b] = [
      ((x - box[0]) / Math.max(1, box[2] - box[0])) * w,
      ((y - box[1]) / Math.max(1, box[3] - box[1])) * h,
    ];
    return [flipH ? w - a : a, flipV ? h - b : b];
  };
  // Nothing said: one line or curve through all of the corners.
  const all = points.length - 1;
  const usual = [0x4000, kind < 2 ? all : 0x2000 + Math.floor(all / 3), kind === 1 || kind === 3 ? 0x6001 : 0x8000];
  type Part = { path: Path2D; filled: boolean; lined: boolean };
  const start = (): Part => ({ path: new Path2D(), filled: true, lined: true });
  const parts: Part[] = [start()];
  let next = 0;
  for (const step of outline.steps.length > 0 ? outline.steps : usual) {
    const part = parts[parts.length - 1];
    const what = step >> 13;
    if (what < 3) {
      const each = what === 1 ? 3 : 1;
      for (let i = what === 2 ? 1 : step & 0x1fff; i > 0; i -= 1) {
        const group = points.slice(next, next + each).map(at);
        if (group.length < each) return null;
        next += each;
        if (what === 0) part.path.lineTo(...group[0]);
        else if (what === 2) part.path.moveTo(...group[0]);
        else part.path.bezierCurveTo(...group[0], ...group[1], ...group[2]);
      }
    } else if (what === 3) part.path.closePath();
    else if (what === 4) parts.push(start());
    else {
      const note = (step >> 8) & 31;
      if (note === 10) part.filled = false;
      else if (note === 11) part.lined = false;
      else if (note < 10) return null;
    }
  }
  const edge = stroke?.width ?? 0;
  const image = paintImage(w + edge * 2, h + edge * 2, (pen) => {
    pen.translate(edge, edge);
    if (fill) pen.fillStyle = fillStyle(pen, fill, w, h);
    for (const { path, filled, lined } of parts) {
      if (fill && filled) pen.fill(path);
      if (stroke && lined) strokeWith(pen, stroke, path);
    }
  });
  return image && { image, edge };
}

/** Words that fill the whole frame, however much that stretches them. */
function artImage({ frame: { w, h }, fill, stroke }: Drawing, { words, font, bold, italic }: Art): FlowImage | null {
  const lines = words.split(/[\r\n]+/).filter((line) => line.trim() !== "");
  if (lines.length === 0 || w < 1 || h < 1) return null;
  return paintImage(w, h, (pen) => {
    pen.font = `${italic ? "italic" : "normal"} ${bold ? 700 : 400} 100px "${font.replace(/["\\]/g, "")}", Arial, sans-serif`;
    const sizes = lines.map((line) => pen.measureText(line));
    const up = Math.max(...sizes.map((size) => size.actualBoundingBoxAscent));
    const down = Math.max(...sizes.map((size) => size.actualBoundingBoxDescent));
    const wide = Math.max(...sizes.map((size) => size.width));
    pen.scale(w / (wide || 1), h / (lines.length * (up + down) || 1));
    lines.forEach((line, i) => {
      const [x, y] = [(wide - sizes[i].width) / 2, i * (up + down) + up];
      if (fill) {
        pen.fillStyle = fill.color;
        pen.fillText(line, x, y);
      }
      if (stroke && (!fill || stroke.color !== fill.color)) {
        pen.strokeStyle = stroke.color;
        pen.lineWidth = stroke.width;
        pen.strokeText(line, x, y);
      }
    });
  });
}

/**
 * What a shape is on the page: one of the editor's own, or a picture where the
 * editor has none like it, with the words of the shape on top.
 */
export function drawnShape(
  drawing: Drawing,
  // Words run over what is loose: lines between boxes, watermarks.
  { from, behind, loose }: { from: "page" | "para"; behind: boolean; loose: boolean },
): { image?: FlowImage; box?: FlowBox } {
  const { type, frame: own, flipH, flipV, fill, stroke, blocks, valign } = drawing;
  const turn = ((drawing.angle % 360) + 360) % 360;
  const angle = turn > 0.05 && turn < 359.95 ? { angle: round(turn) } : {};
  const picture = (image: FlowImage | null, { x, y }: Point, under: boolean, side: { angle?: number } = angle) =>
    image
      ? { image: { ...image, ...side, float: { x: round(x), y: round(y), from, ...(under ? { behind: true } : {}) } } }
      : {};
  const box = (at: Frame, shape: string, more: Partial<FlowBox>): { box: FlowBox } => ({
    box: {
      kind: "box",
      x: round(at.x),
      y: round(at.y),
      from,
      w: round(Math.max(0, at.w)),
      h: round(Math.max(0, at.h)),
      ...(shape === "rect" ? {} : { shape }),
      blocks: [],
      ...more,
    },
  });
  if (drawing.art) return picture(artImage(drawing, drawing.art), own, behind || loose);
  if (type === 20 || (type >= 32 && type <= 40)) {
    if (!stroke) return {};
    const straight = type === 20 || type === 32;
    const way = straight ? turnLine(own, { flipH, flipV }, turn) : { frame: own, flipH, flipV };
    const { x, y, w, h } = way.frame;
    const back = way.flipH || (way.flipV && h > 0.5);
    if (straight && !drawing.start && !(drawing.end && back)) {
      const up = way.flipH !== way.flipV && w > 0.5 && h > 0.5;
      return box(way.frame, drawing.end ? "arrow" : up ? "lineInv" : "line", { stroke });
    }
    const corners = connectorCorners(
      straight ? "line" : `bent${type < 37 ? type - 31 : type - 35}`,
      w,
      h,
      drawing.bends,
    );
    const path = corners.map((at) => ({ x: way.flipH ? w - at.x : at.x, y: way.flipV ? h - at.y : at.y }));
    const made = lineImage(path, stroke, { start: drawing.start, end: drawing.end, curved: type >= 37 });
    if (!made) return {};
    return picture(made.image, { x: x - made.edge, y: y - made.edge }, behind || loose, straight ? {} : angle);
  }
  const quarters = quartersOf(turn);
  const at = quarters !== null && quarters % 2 === 1 ? onSide(own) : own;
  const empty = blocks.every(isBlank);
  const words = empty ? {} : { blocks, valign };
  const made = drawing.outline && (fill || stroke) ? outlineImage(drawing, drawing.outline) : null;
  if (made)
    return {
      ...picture(made.image, { x: own.x - made.edge, y: own.y - made.edge }, behind),
      ...(empty ? {} : box(at, "rect", words)),
    };
  const name = OFFICE_SHAPES[type];
  if (!name || (!fill && !stroke)) return empty ? {} : box(at, "rect", words);
  const shape = turnedShape(name, quarters ?? 0, { flipH, flipV });
  if (empty && (fill?.stops || quarters === null) && SIMPLE.test(shape))
    return picture(shapeImage(shape, own, fill, stroke), own, behind);
  return box(at, shape, { ...words, ...(fill ? { fill: fill.color } : {}), ...(stroke ? { stroke } : {}) });
}

// ---------------------------------------------------------------- Rich Text Format

/** Code pages by the number of a font's character set. */
const CHARSETS: Record<number, string> = {
  0: "windows-1252",
  2: "symbol",
  77: "macintosh",
  78: "shift_jis",
  79: "euc-kr",
  80: "gbk",
  81: "big5",
  89: "x-mac-cyrillic",
  128: "shift_jis",
  129: "euc-kr",
  130: "euc-kr",
  134: "gbk",
  136: "big5",
  161: "windows-1253",
  162: "windows-1254",
  163: "windows-1258",
  177: "windows-1255",
  178: "windows-1256",
  186: "windows-1257",
  204: "windows-1251",
  222: "windows-874",
  238: "windows-1250",
};

/** What the browser calls a code page. */
export const codePage = (number: number): string => {
  const known: Record<number, string> = {
    866: "ibm866",
    874: "windows-874",
    932: "shift_jis",
    936: "gbk",
    949: "euc-kr",
    950: "big5",
    10000: "macintosh",
    10007: "x-mac-cyrillic",
    65001: "utf-8",
  };
  return known[number] ?? (number >= 1250 && number <= 1258 ? `windows-${number}` : "windows-1252");
};

/** How letters look. Some programs name a font of its own for accented and for East Asian letters. */
type Look = {
  font: number;
  high: number;
  east: number;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  caps: boolean;
  small: boolean;
  hidden: boolean;
  deleted: boolean;
  color: number;
  back: number;
  marker: number;
  script: 0 | 1 | 2;
  tracking: number;
  /** Which letters the next font belongs to. */
  kind: "" | "low" | "high" | "east";
  /** Something was said since the last reset. */
  said: boolean;
};

type Side = "top" | "right" | "bottom" | "left" | "between";
type Draw = { kind: number; width: number; color: number; none: boolean };

/** How a paragraph looks, in twentieths of a point. */
type Form = {
  style: number;
  align: number;
  rtl: boolean;
  left: number;
  right: number;
  first: number;
  before: number;
  after: number;
  autoBefore: boolean;
  autoAfter: boolean;
  contextual: boolean;
  line: number;
  multiple: boolean;
  keepNext: boolean;
  pageBreak: boolean;
  outline: number;
  list: number;
  level: number;
  inTable: boolean;
  depth: number;
  tabs: Stop[];
  fore: number;
  back: number;
  share: number;
  lines: Partial<Record<Side, Draw>>;
  frame: number;
  drop: boolean;
  said: boolean;
};

type CellDef = {
  right: number;
  merge: number;
  down: number;
  valign: number;
  lines: (Draw | undefined)[];
  fore: number;
  back: number;
  share: number;
};

type RowDef = {
  left: number;
  gap: number;
  height: number;
  head: boolean;
  align: number;
  lines: (Draw | undefined)[];
  pad: { top: number; right: number; bottom: number; left: number };
  /** How wide it wants to be, in what unit, and where its words start. */
  width: number;
  unit: number;
  indent: number | null;
  cells: CellDef[];
  next: CellDef;
};

const newLook = (font: number): Look => ({
  font,
  high: -1,
  east: -1,
  size: 24,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  caps: false,
  small: false,
  hidden: false,
  deleted: false,
  color: 0,
  back: 0,
  marker: 0,
  script: 0,
  tracking: 0,
  kind: "",
  said: false,
});

const newForm = (): Form => ({
  style: 0,
  align: 0,
  rtl: false,
  left: 0,
  right: 0,
  first: 0,
  before: 0,
  after: 0,
  autoBefore: false,
  autoAfter: false,
  contextual: false,
  line: 0,
  multiple: false,
  keepNext: false,
  pageBreak: false,
  outline: 9,
  list: 0,
  level: 0,
  inTable: false,
  depth: 1,
  tabs: [],
  fore: 0,
  back: 0,
  share: 0,
  lines: {},
  frame: 0,
  drop: false,
  said: false,
});

const newCellDef = (): CellDef => ({ right: 0, merge: 0, down: 0, valign: 0, lines: [], fore: 0, back: 0, share: 0 });
const newRowDef = (): RowDef => ({
  left: 0,
  gap: 0,
  height: 0,
  head: false,
  align: 0,
  lines: [],
  pad: { top: 0, right: -1, bottom: 0, left: -1 },
  width: 0,
  unit: 0,
  indent: null,
  cells: [],
  next: newCellDef(),
});

const newFigure = (): Figure => ({
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  props: new Map(),
  picture: null,
  blocks: [],
  fromX: "column",
  fromY: "para",
  wrap: 3,
  behind: false,
  kids: [],
});

type Field = {
  code: string;
  shown: boolean;
  link?: string;
  hide: boolean;
  put?: string;
  form?: { kind: number; value: number; usual: number; items: string[] };
};
type Figure = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  props: Map<string, string>;
  picture: FlowImage | null;
  blocks: FlowPara[];
  fromX: string;
  fromY: string;
  wrap: number;
  behind: boolean;
  kids: Figure[];
};
type Pict = {
  kind: string;
  w: number;
  h: number;
  goalW: number;
  goalH: number;
  scaleX: number;
  scaleY: number;
  crop: [number, number, number, number];
  parts: Uint8Array[];
  odd: number;
  alt: string;
};
type Dest =
  | "text"
  | "quiet"
  | "fonts"
  | "colors"
  | "styles"
  | "style"
  | "title"
  | "author"
  | "code"
  | "picture"
  | "mark"
  | "leveltext"
  | "name"
  | "value"
  | "item";
type State = {
  dest: Dest;
  look: Look;
  form: Form;
  skip: number;
  field: Field | null;
  link?: string;
  close?: () => void;
};

/** Everything that belongs to one run of text: the pages, a header, a note, a box. */
class Story {
  blocks: FlowBlock[] = [];
  runs: FlowRun[] = [];
  boxes: FlowBox[] = [];
  /** What a list mark written out says. */
  mark = "";
  /** Its own number, for a note. */
  note: () => string = () => "";
  /** Goes on with a paragraph a page break has cut. */
  cut = false;
  /** Nothing but a page break came before. */
  fresh = false;
  /** Words were left out because they are hidden or crossed out. */
  gone = false;
  /** Tables being filled, the outermost at 1. */
  tables: { cell: FlowBlock[]; cells: FlowBlock[][]; rows: { cells: FlowBlock[][]; def: RowDef }[] }[] = [];
  /** Letters of a large first letter that belong to the next paragraph. */
  dropped: FlowRun[] = [];

  constructor(public where: "main" | "head" | "note" | "box") {}
}

type RtfSection = {
  section: FlowSection;
  goesOn: boolean;
  own: boolean;
  heads: Map<string, FlowBlock[]>;
  story: FlowBlock[];
};

class Rtf {
  private at = 0;
  private state: State;
  private stack: State[] = [];
  private page = "windows-1252";
  private pend: number[] = [];
  private eat = 0;
  private firstFont = 0;
  private fonts = new Map<number, { name: string; page: string }>();
  private font = { id: 0, name: "", page: "" };
  private colors: (string | undefined)[] = [];
  private mix: number[] = [];
  private styles = new Map<number, { name: string; base: number; look: Look; form: Form }>();
  private style = { id: 0, kind: "s", name: "", base: -1 };
  private lists = new Map<number, Level[]>();
  private list: { id: number; levels: Level[] } = { id: 0, levels: [] };
  private level: Level | null = null;
  private uses = new Map<number, { list: number; starts: Map<number, number>; levels: Map<number, Level> }>();
  private use = { id: 0, list: 0, starts: new Map<number, number>(), levels: new Map<number, Level>(), at: -1 };
  private counter = new Counter();
  private known: Known = { info: new Map(), counts: new Map(), larger: false };
  private wraps: Wraps = new Map();
  private images: FlowImage[] = [];
  private main = new Story("main");
  private story = this.main;
  private stories: Story[] = [];
  private sections: RtfSection[] = [];
  private paper = { w: 12240, h: 15840, left: 1800, right: 1800, top: 1440, bottom: 1440, gutter: 0, turned: false };
  private sect = this.newSect();
  private heads = new Map<string, FlowBlock[]>();
  private row = newRowDef();
  private rows: RowDef[] = [];
  private draw: Draw | null = null;
  private tab: Stop["kind"] = "left";
  private title = "";
  private author = "";
  private pict: Pict | null = null;
  private figures: Figure[] = [];
  private prop = { name: "", value: "" };
  private notes: { kind: "foot" | "end"; blocks: FlowBlock[] }[] = [];
  private noteCount = { foot: 0, end: 0 };
  private noteKind: "foot" | "end" = "foot";
  private noteRef: FlowRun | null = null;
  private rowOpen = false;

  constructor(private bytes: Uint8Array) {
    this.state = { dest: "text", look: newLook(0), form: newForm(), skip: 1, field: null };
  }

  private newSect() {
    return { ...this.paper, cols: 1, gap: 720, head: 720, foot: 720, kind: 2, own: false };
  }

  async read(): Promise<FlowDoc> {
    const b = this.bytes;
    while (this.at < b.length) {
      const byte = b[this.at];
      if (byte === 0x5c) this.control();
      else if (byte === 0x7b) {
        this.at += 1;
        this.open();
      } else if (byte === 0x7d) {
        this.at += 1;
        if (!this.close()) break;
      } else if (byte === 0x0d || byte === 0x0a || byte === 0) this.at += 1;
      else this.letters();
    }
    this.flush();
    while (this.stack.length > 0) this.close();
    if (this.story.runs.length > 0) this.endPara();
    this.endSection();
    const sections = joinSections(
      this.sections.flatMap(({ section, goesOn, own, heads }) => {
        const header = headBlocks([...(heads.get("header") ?? [])]);
        const footer = headBlocks([...(heads.get("footer") ?? [])]);
        if (header) section.header = header;
        if (footer) section.footer = footer;
        const first = own
          ? {
              header: headBlocks([...(heads.get("headerf") ?? [])]),
              footer: headBlocks([...(heads.get("footerf") ?? [])]),
            }
          : undefined;
        return splitFirst(section, first && (first.header || first.footer || header || footer) ? first : undefined).map(
          (one, i) => ({ section: one, goesOn: goesOn && i === 0 }),
        );
      }),
    );
    const last = sections[sections.length - 1];
    for (const kind of ["foot", "end"] as const) {
      const notes = this.notes.filter((note) => note.kind === kind);
      if (notes.length === 0) continue;
      last.blocks.push({ kind: "rule", color: "#808080", width: 0.5 }, ...notes.flatMap((note) => note.blocks));
    }
    const done = new Set<FlowBlock>();
    for (const section of sections) {
      section.blocks = makeRoom(section.blocks, this.wraps, columnWidth(section));
      finishAll(section.blocks, this.known);
      for (const side of ["header", "footer"] as const) {
        const blocks = section[side];
        if (!blocks) continue;
        // Sections that share a header each get their own copy.
        if (done.has(blocks[0])) section[side] = copyBlocks(blocks);
        else finishAll(blocks, this.known);
        done.add(blocks[0]);
      }
    }
    await settlePictures(sections, this.images);
    const out: FlowDoc = { kind: "flow", sections };
    if (this.title.trim()) out.title = this.title.trim();
    if (this.author.trim()) out.author = this.author.trim();
    return out;
  }

  // ---------------------------------------------------------------- signs

  private open() {
    this.flush();
    this.eat = 0;
    const { state } = this;
    this.stack.push(state);
    this.state = {
      ...state,
      look: { ...state.look },
      form: { ...state.form, lines: { ...state.form.lines } },
      close: undefined,
    };
    if (state.dest === "styles") {
      this.state.dest = "style";
      this.state.look = newLook(this.firstFont);
      this.state.form = newForm();
      this.style = { id: 0, kind: "s", name: "", base: -1 };
      this.state.close = () => this.endStyle();
    }
  }

  private close(): boolean {
    this.flush();
    this.eat = 0;
    const { state } = this;
    const before = this.stack.pop();
    if (!before) return false;
    state.close?.();
    this.state = before;
    return true;
  }

  /** Leaves the rest of the group out. */
  private skipGroup() {
    const b = this.bytes;
    let deep = 1;
    while (this.at < b.length) {
      const byte = b[this.at];
      if (byte === 0x5c) {
        // Raw bytes may hold anything.
        if (
          b[this.at + 1] === 0x62 &&
          b[this.at + 2] === 0x69 &&
          b[this.at + 3] === 0x6e &&
          b[this.at + 4] >= 0x30 &&
          b[this.at + 4] <= 0x39
        ) {
          let end = this.at + 4;
          let count = 0;
          while (b[end] >= 0x30 && b[end] <= 0x39) {
            count = count * 10 + b[end] - 0x30;
            end += 1;
          }
          this.at = end + (b[end] === 0x20 ? 1 : 0) + count;
        } else this.at += 2;
        continue;
      }
      if (byte === 0x7b) deep += 1;
      else if (byte === 0x7d) {
        deep -= 1;
        // The bracket itself is for the group's own end.
        if (deep === 0) return;
      }
      this.at += 1;
    }
  }

  private letters() {
    const b = this.bytes;
    const from = this.at;
    let end = from;
    while (
      end < b.length &&
      b[end] !== 0x5c &&
      b[end] !== 0x7b &&
      b[end] !== 0x7d &&
      b[end] !== 0x0d &&
      b[end] !== 0x0a
    )
      end += 1;
    this.at = end;
    if (this.state.dest === "picture") {
      this.hex(from, end);
      return;
    }
    for (let i = from; i < end; i += 1) {
      if (this.eat > 0) this.eat -= 1;
      else this.pend.push(b[i]);
    }
  }

  private hex(from: number, end: number) {
    const { pict } = this;
    if (!pict) return;
    const out = new Uint8Array(((end - from) >> 1) + 1);
    let count = 0;
    let high = pict.odd;
    for (let i = from; i < end; i += 1) {
      const byte = this.bytes[i];
      const digit =
        byte >= 0x30 && byte <= 0x39
          ? byte - 0x30
          : byte >= 0x61 && byte <= 0x66
            ? byte - 0x57
            : byte >= 0x41 && byte <= 0x46
              ? byte - 0x37
              : -1;
      if (digit < 0) continue;
      if (high < 0) high = digit;
      else {
        out[count] = high * 16 + digit;
        count += 1;
        high = -1;
      }
    }
    pict.odd = high;
    if (count > 0) pict.parts.push(out.subarray(0, count));
  }

  private control() {
    const b = this.bytes;
    const next = b[this.at + 1];
    const letter = (byte: number) => (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x41 && byte <= 0x5a);
    if (!letter(next)) {
      this.at += 2;
      if (next === 0x27) {
        const value = parseInt(String.fromCharCode(b[this.at] ?? 0x30, b[this.at + 1] ?? 0x30), 16);
        this.at += 2;
        if (this.eat > 0) this.eat -= 1;
        else if (Number.isFinite(value)) this.pend.push(value);
        return;
      }
      if (this.eat > 0 && next !== 0x2a) {
        this.eat -= 1;
        return;
      }
      if (next === 0x5c || next === 0x7b || next === 0x7d) this.pend.push(next);
      else {
        this.flush();
        if (next === 0x7e) this.put("\u00a0");
        else if (next === 0x5f) this.put("‑");
        else if (next === 0x2a) this.star();
        else if (next === 0x0d || next === 0x0a) this.word("par", undefined);
        else if (next === 0x09) this.put("\t");
      }
      return;
    }
    let end = this.at + 1;
    while (end < b.length && letter(b[end]) && end - this.at < 40) end += 1;
    const name = String.fromCharCode(...b.subarray(this.at + 1, end));
    let value: number | undefined;
    if (b[end] === 0x2d || (b[end] >= 0x30 && b[end] <= 0x39)) {
      const start = end;
      end += 1;
      while (b[end] >= 0x30 && b[end] <= 0x39) end += 1;
      value = Number(String.fromCharCode(...b.subarray(start, end)));
    }
    if (b[end] === 0x20) end += 1;
    this.at = end;
    if (name === "bin") {
      this.flush();
      const count = Math.max(0, value ?? 0);
      if (this.state.dest === "picture") this.pict?.parts.push(b.subarray(this.at, this.at + count));
      this.at += count;
      return;
    }
    if (name === "u") {
      // A character outside the code page; the ones after it stand in for it in old programs.
      if (this.eat > 0) this.eat -= 1;
      else {
        this.flush();
        this.put(String.fromCharCode((value ?? 63) & 0xffff));
        this.eat = this.state.skip;
      }
      return;
    }
    if (this.eat > 0) {
      this.eat -= 1;
      return;
    }
    this.flush();
    this.word(name, value);
  }

  /** "\*": what comes next may be left out by programs that do not know it. */
  private star() {
    const b = this.bytes;
    while (b[this.at] === 0x0d || b[this.at] === 0x0a || b[this.at] === 0x20) this.at += 1;
    const rest = String.fromCharCode(...b.subarray(this.at, this.at + 40));
    const name = /^\\([a-zA-Z]+)/.exec(rest)?.[1] ?? "";
    if (!STARRED.has(name) && !(this.state.dest === "style" && /^(cs|ts|ds)$/.test(name))) this.skipGroup();
  }

  /** Letters waiting in their code page. */
  private flush() {
    if (this.pend.length === 0) return;
    const raw = Uint8Array.from(this.pend);
    this.pend = [];
    if (this.state.dest === "leveltext" || this.state.dest === "picture") {
      this.put(String.fromCharCode(...raw));
      return;
    }
    let page = this.page;
    if (this.state.dest === "fonts") page = this.font.page || this.page;
    else if (this.state.dest === "text" || this.state.dest === "mark")
      page = this.fonts.get(this.fontNow())?.page || this.page;
    if (page === "symbol") {
      const name = this.fonts.get(this.fontNow())?.name;
      const text = String.fromCharCode(...raw);
      this.put(
        symbolText(name, text) === null
          ? text
          : [...raw].map((byte) => String.fromCharCode(byte < 0x20 ? byte : 0xf000 + byte)).join(""),
      );
      return;
    }
    this.put(safeDecode(raw, page) ?? new TextDecoder("windows-1252").decode(raw));
  }

  private fontNow(): number {
    const { look } = this.state;
    if (look.kind === "east" && look.east >= 0) return look.east;
    return look.kind === "high" && look.high >= 0 ? look.high : look.font;
  }

  // ---------------------------------------------------------------- text

  private put(text: string) {
    const { dest } = this.state;
    if (dest === "text") this.add(text);
    else if (dest === "fonts") {
      for (const sign of text) {
        if (sign !== ";") this.font.name += sign;
        else this.endFont();
      }
    } else if (dest === "colors") {
      for (const sign of text) {
        if (sign !== ";") continue;
        this.colors.push(this.mix.length > 0 ? hexOf(this.mix[0] ?? 0, this.mix[1] ?? 0, this.mix[2] ?? 0) : undefined);
        this.mix = [];
      }
    } else if (dest === "style") this.style.name += text;
    else if (dest === "title") this.title += plain(text);
    else if (dest === "author") this.author += plain(text);
    else if (dest === "code" && this.state.field) this.state.field.code += text;
    else if (dest === "mark") this.story.mark += text;
    else if (dest === "leveltext" && this.level) this.level.text += text;
    else if (dest === "name") this.prop.name += text;
    else if (dest === "value") this.prop.value += text;
    else if (dest === "item") {
      const items = this.state.field?.form?.items;
      if (items && items.length > 0) items[items.length - 1] += text;
    }
  }

  private endFont() {
    const { id, name, page } = this.font;
    const bare = name.trim().replace(/^@/, "");
    if (bare)
      this.fonts.set(id, {
        name: bare.replace(/ (CE|Cyr|Greek|Tur|\(Hebrew\)|\(Arabic\)|Baltic|\(Vietnamese\)|Western|\(Thai\))$/, ""),
        page,
      });
    this.font = { id: -1, name: "", page: "" };
  }

  private endStyle() {
    const { look, form } = this.state;
    const name = this.style.name.replace(/;\s*$/, "").trim();
    if (this.style.kind === "s") {
      if (form.outline === 9) {
        const head = /^heading ([1-9])\b/i.exec(name);
        if (head) form.outline = Number(head[1]) - 1;
      }
      this.styles.set(this.style.id, { name, base: this.style.base, look, form });
    }
  }

  private color(index: number): string | undefined {
    return index > 0 ? this.colors[index] : undefined;
  }

  /** How the text goes that comes now. */
  private styleOf(look: Look, script: number, small: boolean): FlowStyle {
    const id = script === 2 && look.east >= 0 ? look.east : script === 1 && look.high >= 0 ? look.high : look.font;
    const font = this.fonts.get(id)?.name;
    const style: FlowStyle = { size: (look.size / 2) * (small ? 0.8 : 1) };
    if (font && !/^(symbol|wingdings|webdings)/i.test(font)) style.font = font;
    if (look.bold) style.bold = true;
    if (look.italic) style.italic = true;
    if (look.underline) style.underline = true;
    if (look.strike) style.strike = true;
    const color = this.color(look.color);
    if (color) style.color = color;
    const back = this.color(look.marker) ?? this.color(look.back);
    if (back && back !== "#ffffff") style.highlight = back;
    if (look.script) style.script = look.script === 1 ? "super" : "sub";
    if (look.tracking) style.tracking = look.tracking / 20;
    if (this.state.link) style.link = this.state.link;
    return style;
  }

  /** A style that says nothing about itself leaves everything to the one of the paragraph. */
  private lookNow(): Look {
    const { look, form } = this.state;
    if (look.said || form.style === 0) return look;
    return this.styleLook(form.style, 0) ?? look;
  }

  private styleLook(id: number, deep: number): Look | null {
    const style = this.styles.get(id);
    if (!style || deep > 8) return null;
    if (style.look.said || style.base < 0 || style.base === id) return style.look;
    return this.styleLook(style.base, deep + 1) ?? style.look;
  }

  private styleForm(id: number, deep: number): Form | null {
    const style = this.styles.get(id);
    if (!style || deep > 8) return null;
    if (style.form.said || style.base < 0 || style.base === id) return style.form;
    return this.styleForm(style.base, deep + 1) ?? style.form;
  }

  private add(source: string) {
    const look = this.lookNow();
    if (look.hidden || look.deleted) {
      this.story.gone = true;
      return;
    }
    const font = this.fonts.get(look.font)?.name;
    let text = plain(symbolText(font, source) ?? source);
    if (text === "") return;
    if (look.caps) text = text.toUpperCase();
    const { runs } = this.story;
    // Letters of one script, with the spaces between them.
    let at = 0;
    while (at < text.length) {
      let script = scriptOf(text.charCodeAt(at));
      let end = at + 1;
      for (; end < text.length; end += 1) {
        const next = scriptOf(text.charCodeAt(end));
        if (next < 0 || next === script || (text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff)) continue;
        if (script < 0) script = next;
        else if (!(next < 2 && script < 2 && (look.high < 0 || look.high === look.font))) break;
      }
      const part = text.slice(at, end);
      at = end;
      if (look.small) {
        for (const bit of part.match(/\p{Ll}+|\P{Ll}+/gu) ?? []) {
          const low = /^\p{Ll}/u.test(bit);
          runs.push({ text: low ? bit.toUpperCase() : bit, style: this.styleOf(look, Math.max(0, script), low) });
        }
      } else runs.push({ text: part, style: this.styleOf(look, Math.max(0, script), false) });
    }
  }

  // ---------------------------------------------------------------- paragraphs

  private depth(form: Form): number {
    return form.inTable ? Math.max(1, form.depth) : 0;
  }

  /** Ends the paragraph. In cells an empty one counts as well. */
  private endPara(keep = true) {
    const { story } = this;
    const { form } = this.state;
    const depth = this.depth(form);
    const runs = story.runs;
    story.runs = [];
    const boxes = story.boxes;
    story.boxes = [];
    const mark = story.mark;
    story.mark = "";
    if (!keep && runs.length === 0 && boxes.length === 0) return;
    const { cut, fresh, gone } = story;
    story.cut = false;
    story.fresh = false;
    story.gone = false;
    // A line whose words and end are hidden is not there at all.
    const { look } = this.state;
    if (gone && (look.hidden || look.deleted) && runs.length === 0 && boxes.length === 0 && depth === 0) return;
    // The mark after a page break is no line of its own.
    if (fresh && runs.length === 0 && boxes.length === 0 && depth === 0) return;
    if (form.drop && runs.length > 0 && textOf({ kind: "para", runs }).length < 12) {
      story.dropped = runs;
      return;
    }
    if (story.dropped.length > 0) {
      const size = runs.find((piece) => piece.text)?.style?.size;
      runs.unshift(
        ...story.dropped.map((piece) =>
          piece.image ? piece : { ...piece, style: { ...piece.style, size: size ?? piece.style.size } },
        ),
      );
      story.dropped = [];
    }
    const made: FlowBlock[] = [...boxes];
    if (keep || runs.length > 0)
      made.push(
        this.dress(
          cut ? { ...form, first: 0, before: 0, list: 0, pageBreak: false } : form,
          runs,
          cut ? "" : mark,
          depth,
        ),
      );
    this.place(made, depth);
  }

  /** Puts finished blocks where they belong: on the page or into the cell being filled. */
  private place(blocks: FlowBlock[], depth: number) {
    const { story } = this;
    const real = depth === 0 && this.rowOpen && (story.tables[1]?.cells.length ?? 0) > 0 ? 1 : depth;
    this.closeTables(real);
    if (real === 0) story.blocks.push(...blocks);
    else this.table(real).cell.push(...blocks);
  }

  private table(depth: number) {
    const { tables } = this.story;
    for (let i = 1; i <= depth; i += 1) tables[i] ??= { cell: [], cells: [], rows: [] };
    return tables[depth];
  }

  /** Tables deeper than this are over. */
  private closeTables(depth: number) {
    const { story } = this;
    for (let i = story.tables.length - 1; i > depth && i > 0; i -= 1) {
      const table = story.tables[i];
      story.tables.length = i;
      if (!table) continue;
      if (table.cell.length > 0) table.cells.push(table.cell);
      if (table.cells.length > 0) table.rows.push({ cells: table.cells, def: this.row });
      if (table.rows.length === 0) continue;
      const made = this.tableOf(table.rows, i);
      if (i === 1) story.blocks.push(...made);
      else this.table(i - 1).cell.push(...made);
    }
  }

  private lineOf(draw: Draw | undefined): Edge {
    if (!draw) return undefined;
    return draw.none ? null : wordLine(draw.kind, (draw.width / 20) * 8, this.color(draw.color));
  }

  private tableOf(rows: { cells: FlowBlock[][]; def: RowDef }[], depth: number): FlowBlock[] {
    // Tables in tables become lines of text, but not when the outer one only holds them.
    if (
      depth === 1 &&
      rows.every(({ cells }) => cells.length === 1) &&
      rows.some(({ cells }) => cells[0].some((block) => block.kind === "table"))
    )
      return rows.flatMap(({ cells }) => cells[0]);
    const room = this.width();
    const ruled: RuledRow[] = rows.map(({ cells, def }) => {
      let x = def.left / 20;
      const count = Math.max(def.cells.length, cells.length);
      const list: RuledCell[] = [];
      for (let c = 0; c < count; c += 1) {
        const cell = def.cells[c];
        const x1 = cell ? Math.max(x, cell.right / 20) : x + Math.max(20, (room - x) / (count - c));
        const one: RuledCell = {
          x0: x,
          x1,
          blocks: flatten(cells[c] ?? []),
          joined: cell?.merge === 1,
          valign: cell?.valign === 1 ? "middle" : cell?.valign === 2 ? "bottom" : "top",
          border:
            (cell?.lines ?? []).length > 0
              ? [0, 1, 2, 3].map((i) => this.lineOf(cell?.lines[i]))
              : [undefined, undefined, undefined, undefined],
        };
        if (cell?.down) one.down = cell.down === 1 ? "more" : "start";
        const fill = cell ? shadeShare(this.color(cell.fore), this.color(cell.back), cell.share) : undefined;
        if (fill && fill !== "#ffffff") one.fill = fill;
        for (const block of one.blocks) delete block.breakBefore;
        list.push(one);
        x = x1;
      }
      return {
        cells: list,
        lines: [0, 1, 2, 3, 4, 5].map((i) => this.lineOf(def.lines[i])),
        h: def.height / 20,
        head: def.head,
      };
    });
    const { def } = rows[0];
    const gap = def.gap / 20;
    const pad = {
      top: round(def.pad.top / 20),
      right: round(def.pad.right >= 0 ? def.pad.right / 20 : gap),
      bottom: round(def.pad.bottom / 20),
      left: round(def.pad.left >= 0 ? def.pad.left / 20 : gap),
    };
    const table = buildTable(ruledRows(ruled), pad);
    if (!table) return [];
    stretch(table, def.unit === 3 ? def.width / 20 : def.unit === 2 ? (def.width / 5000) * room : 0);
    // The indent says where the words of the first cell start; its edge stands further left.
    const start = def.indent === null ? def.left / 20 : def.indent / 20 - pad.left;
    if (def.align === 1) table.align = "center";
    else if (def.align === 2) table.align = "right";
    else if (depth === 1 && Math.abs(start) > 0.01) table.left = round(start);
    return [table];
  }

  /** Room for text where the story stands. */
  private width(): number {
    const { sect } = this;
    const width = (sect.w - sect.left - sect.right - sect.gutter) / 20;
    if (this.story.where === "main" && sect.cols > 1) return (width - (sect.gap / 20) * (sect.cols - 1)) / sect.cols;
    return Math.max(72, width);
  }

  private dress(source: Form, words: FlowRun[], written: string, depth: number): FlowPara {
    const styled = source.said ? null : source.style > 0 ? this.styleForm(source.style, 0) : null;
    const form = styled ? { ...styled, style: source.style, inTable: source.inTable, depth: source.depth } : source;
    const out: FlowPara = { kind: "para", runs: [] };
    let runs = words;
    const main = this.story.where === "main";
    let { align } = form;
    if (this.story.where === "head" && form.frame && align === 0) align = form.frame;
    if (align > 0) out.align = (["left", "center", "right", "justify"] as FlowAlign[])[align];
    if (form.left) out.left = round(form.left / 20);
    if (form.right) out.right = round(form.right / 20);
    if (form.first) out.first = round(form.first / 20);
    out.before = form.autoBefore ? 14 : form.before / 20;
    out.after = form.autoAfter ? 14 : form.after / 20;
    if (form.multiple && form.line > 0) out.line = { times: round(form.line / 240) };
    else if (form.line < 0) out.line = { points: -form.line / 20 };
    else if (form.line > 0) out.line = { points: form.line / 20, atLeast: true };
    else out.line = { times: 1 };
    const outline = form.outline < 9 ? form.outline : (this.styles.get(form.style)?.form.outline ?? 9);
    if (outline < 9 && depth === 0 && main) out.heading = Math.min(6, outline + 1) as FlowPara["heading"];
    if (form.pageBreak && depth === 0 && main) out.breakBefore = true;
    if (form.keepNext) out.keepNext = true;
    const fill = shadeShare(this.color(form.fore), this.color(form.back), form.share);
    if (fill && fill !== "#ffffff") out.fill = fill;
    const border: NonNullable<FlowPara["border"]> = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const line = this.lineOf(form.lines[side]);
      if (line) border[side] = line;
    }
    if (Object.keys(border).length > 0) out.border = border;

    const blank = this.styleOf(this.lookNow(), 0, false);
    const mark = this.markOf(form, written);
    if (mark?.list) {
      out.list = mark.list;
      this.known.counts.set(out, mark.count);
    } else if (mark?.lead)
      runs = [
        { text: mark.lead, style: { ...(runs.find((piece) => piece.text !== undefined)?.style ?? blank) } },
        ...runs,
      ];
    out.runs = tidyRuns(runs, blank);
    placeTabs(out, form.tabs, this.width());
    if (mark?.list) hangMark(out, mark, form.tabs);
    const between = this.lineOf(form.lines.between);
    const auto = form.list > 0 && form.autoBefore && form.autoAfter;
    this.known.info.set(out, {
      style: String(form.style),
      contextual: form.contextual || auto,
      ...(between ? { between } : {}),
    });
    return out;
  }

  private markOf(form: Form, written: string): Mark | null {
    const use = form.list > 0 ? this.uses.get(form.list) : undefined;
    const levels = use && this.lists.get(use.list)?.map((level, i) => use.levels.get(i) ?? level);
    if (use && levels && levels.length > 0) {
      const level = Math.min(form.level, levels.length - 1);
      return this.counter.next(String(use.list), levels, level, String(form.list), use.starts);
    }
    // No list to look it up in: the mark as it was written out.
    const text = plain(symbolText(undefined, written) ?? written)
      .replace(/\t/g, " ")
      .trim();
    if (!text) return null;
    const found = listOfMark(text, form.level, 0);
    return found ? found : { lead: `${text}\t` };
  }

  private endSection() {
    this.closeTables(0);
    const { sect, story } = this;
    const at = { ...sect };
    if (at.w < 720 || at.h < 720) [at.w, at.h] = [12240, 15840];
    if (at.turned && at.w < at.h) [at.w, at.h] = [at.h, at.w];
    if (at.left + at.right + at.gutter > at.w - 360) [at.left, at.right, at.gutter] = [720, 720, 0];
    if (at.top + at.bottom > at.h - 360) [at.top, at.bottom] = [720, 720];
    const section: FlowSection = {
      w: at.w / 20,
      h: at.h / 20,
      margin: { top: at.top / 20, right: at.right / 20, bottom: at.bottom / 20, left: (at.left + at.gutter) / 20 },
      blocks: story.blocks,
      headerAt: at.head / 20,
      footerAt: at.foot / 20,
    };
    if (at.cols > 1) {
      section.columns = Math.min(8, at.cols);
      section.gap = at.gap / 20;
    }
    // Headers a section does not have of its own come from the one before.
    this.sections.push({ section, goesOn: at.kind < 2, own: at.own, heads: new Map(this.heads), story: story.blocks });
    story.blocks = [];
  }

  // ---------------------------------------------------------------- groups with a purpose

  /** Text of this group goes somewhere else. */
  private divert(where: Story["where"], done: (blocks: FlowBlock[], story: Story) => void) {
    this.stories.push(this.story);
    const story = new Story(where);
    this.story = story;
    const { row, rowOpen } = this;
    this.rowOpen = false;
    this.state.dest = "text";
    this.state.look = newLook(this.firstFont);
    this.state.form = newForm();
    const link = this.state.link;
    this.state.link = undefined;
    this.state.close = () => {
      if (story.runs.length > 0 || story.boxes.length > 0) this.endPara();
      this.closeTables(0);
      this.story = this.stories.pop() ?? this.main;
      this.row = row;
      this.rowOpen = rowOpen;
      this.state.link = link;
      done(story.blocks, story);
    };
  }

  private startNote() {
    const ref = this.noteRef;
    this.noteRef = null;
    this.noteKind = "foot";
    let mark = "";
    this.divert("note", (blocks) => {
      if (ref && ref.text !== undefined && mark) ref.text = mark;
      if (blocks.length > 0) this.notes.push({ kind: this.noteKind, blocks });
    });
    this.story.note = () => {
      if (!mark) {
        const n = (this.noteCount[this.noteKind] += 1);
        mark = this.noteKind === "foot" ? String(n) : countText(2, n);
      }
      return mark;
    };
  }

  private startResult(field: Field) {
    const code = field.code.trim();
    const name = /^\S*/.exec(code)?.[0].toUpperCase() ?? "";
    if (name === "HYPERLINK") {
      const rest = code.slice(9);
      const address = /^\s*(?:"([^"]*)"|([^\s\\"][^\s"]*))/.exec(rest);
      const part = /\\l\s+"([^"]*)"/i.exec(rest)?.[1];
      const url = (address?.[1] ?? address?.[2] ?? "").replace(/\\\\/g, "\\");
      field.link = url ? cleanLink(part && !url.includes("#") ? `${url}#${part}` : url) : undefined;
    } else if ((name === "PAGE" || name === "NUMPAGES" || name === "SECTIONPAGES") && this.story.where === "head")
      field.put = name === "PAGE" ? "{page}" : "{pages}";
    else if (name === "SYMBOL") {
      const sign = /^SYMBOL\s+(0x[0-9a-f]+|\d+)/i.exec(code);
      const font = /\\f\s+(?:"([^"]*)"|(\S+))/i.exec(code);
      if (sign) {
        const letter = String.fromCharCode(Number(sign[1]));
        field.put = symbolText(font?.[1] ?? font?.[2], letter) ?? letter;
      }
    } else if (name === "MACROBUTTON" || name === "GOTOBUTTON") field.put = code.replace(/^\S+\s+\S+\s*/, "");
    else if (/^(XE|TC|TA|RD|SET|ASK|PRIVATE|ADVANCE)$/.test(name)) field.hide = true;
    else if (field.form?.kind === 1 || name === "FORMCHECKBOX") {
      const { value = 25, usual = 0 } = field.form ?? {};
      field.put = (value === 25 ? usual : value) === 1 ? "☒" : "☐";
    } else if (field.form?.kind === 2) {
      const { value, usual, items } = field.form;
      field.put = items[value === 25 ? usual : value] ?? "";
    }
  }

  // ---------------------------------------------------------------- pictures and shapes

  private endPicture(pict: Pict) {
    const mime = { pngblip: "image/png", jpegblip: "image/jpeg", dibitmap: "image/bmp" }[pict.kind];
    if (!mime) return;
    let size = 0;
    for (const part of pict.parts) size += part.length;
    if (size < 24) return;
    let bytes: Uint8Array = new Uint8Array(size);
    let at = 0;
    for (const part of pict.parts) {
      bytes.set(part, at);
      at += part.length;
    }
    if (pict.kind === "dibitmap") bytes = bitmapFile(bytes);
    const [left, right, top, bottom] = pict.crop;
    let w = (pict.goalW || pict.w * 15) / 20;
    let h = (pict.goalH || pict.h * 15) / 20;
    const image: FlowImage = { bytes, mime, w: 0, h: 0 };
    if (
      (left || right || top || bottom) &&
      left + right < w * 19 &&
      top + bottom < h * 19 &&
      Math.min(left, right, top, bottom) >= 0
    ) {
      const share = (value: number, whole: number) => Math.round((value / 20 / whole) * 10000) / 10000;
      image.crop = {
        x: share(left, w),
        y: share(top, h),
        w: 1 - share(left + right, w),
        h: 1 - share(top + bottom, h),
      };
      image.crop.w = Math.round(image.crop.w * 10000) / 10000;
      image.crop.h = Math.round(image.crop.h * 10000) / 10000;
      w -= (left + right) / 20;
      h -= (top + bottom) / 20;
    }
    image.w = round((w * (pict.scaleX || 100)) / 100);
    image.h = round((h * (pict.scaleY || 100)) / 100);
    if (pict.alt) image.alt = pict.alt;
    if (!(image.w > 0.5 && image.h > 0.5)) return;
    this.images.push(image);
    const figure = this.figures[this.figures.length - 1];
    if (figure && this.state.dest === "picture" && this.inValue) {
      figure.picture = image;
      return;
    }
    const look = this.lookNow();
    if (!look.hidden && !look.deleted) this.story.runs.push({ image });
  }

  private inValue = false;

  private startFigure() {
    const figure = newFigure();
    this.figures.push(figure);
    this.state.dest = "quiet";
    const { story } = this;
    this.state.close = () => {
      this.figures.pop();
      const parent = this.figures[this.figures.length - 1];
      if (parent) parent.kids.push(figure);
      else this.endFigure(figure, story);
    };
  }

  private endFigure(figure: Figure, story: Story) {
    if (story.where !== "main" && story.where !== "head") return;
    const { sect } = this;
    const margin = {
      left: (sect.left + sect.gutter) / 20,
      top: sect.top / 20,
      right: sect.right / 20,
      bottom: sect.bottom / 20,
    };
    const [w, h] = [(figure.right - figure.left) / 20, (figure.bottom - figure.top) / 20];
    const number = (name: string) => Number(figure.props.get(name) ?? NaN);
    const pick = (name: string, words: string[], usual: string) =>
      Number.isFinite(number(name)) ? (words[number(name)] ?? usual) : usual;
    const fromX = pick("posrelh", ["margin", "page", "column", "column"], figure.fromX);
    const fromY = pick("posrelv", ["margin", "page", "para", "para"], figure.fromY);
    const sideX = number("posh") || 0;
    const sideY = number("posv") || 0;
    const [pageW, pageH] = [sect.w / 20, sect.h / 20];
    const left = fromX === "page" ? 0 : margin.left;
    const wide = fromX === "page" ? pageW : pageW - margin.left - margin.right;
    let x = left + figure.left / 20;
    if (sideX === 2) x = left + (wide - w) / 2;
    else if (sideX === 3 || sideX === 5) x = left + wide - w;
    else if (sideX > 0) x = left;
    const onPage = fromY !== "para";
    let y = figure.top / 20;
    if (onPage) {
      const top = fromY === "page" ? 0 : margin.top;
      const high = fromY === "page" ? pageH : pageH - margin.top - margin.bottom;
      y = sideY === 2 ? top + (high - h) / 2 : sideY === 3 || sideY === 5 ? top + high - h : sideY > 0 ? top : top + y;
    }
    const at = { x: onPage ? x : x - margin.left, y, w, h };
    const how = figure.wrap === 1 ? "apart" : figure.wrap === 3 ? null : "around";
    this.drawn(
      figure,
      at,
      onPage ? "page" : "para",
      figure.behind || figure.props.get("fBehindDocument") === "1",
      how,
      story,
    );
  }

  private drawn(
    figure: Figure,
    place: Frame,
    from: "page" | "para",
    behind: boolean,
    wrap: "around" | "apart" | null,
    story: Story,
  ) {
    const { props } = figure;
    const number = (name: string, usual: number) => (props.has(name) ? Number(props.get(name)) : usual);
    if (figure.kids.length > 0) {
      const [gx, gy] = [number("groupLeft", 0), number("groupTop", 0)];
      const [kx, ky] = [
        place.w / Math.max(1, number("groupRight", 1) - gx),
        place.h / Math.max(1, number("groupBottom", 1) - gy),
      ];
      for (const kid of figure.kids) {
        const rel = (name: string) => Number(kid.props.get(name) ?? 0);
        const inner = {
          x: place.x + (rel("relLeft") - gx) * kx,
          y: place.y + (rel("relTop") - gy) * ky,
          w: (rel("relRight") - rel("relLeft")) * kx,
          h: (rel("relBottom") - rel("relTop")) * ky,
        };
        this.drawn(kid, inner, from, behind, null, story);
      }
      return;
    }
    const angle = number("rotation", 0) / 65536;
    const at = turned(place, angle);
    const [w, h] = [round(Math.max(0, at.w)), round(Math.max(0, at.h))];
    if (figure.picture) {
      const image = figure.picture;
      Object.assign(image, {
        w,
        h,
        float: { x: round(at.x), y: round(at.y), from, ...(behind ? { behind: true } : {}) },
      });
      const part = (name: string) => number(name, 0) / 65536;
      const [top, bottom, left, right] = [
        part("cropFromTop"),
        part("cropFromBottom"),
        part("cropFromLeft"),
        part("cropFromRight"),
      ];
      if (
        (top || bottom || left || right) &&
        left + right < 0.99 &&
        top + bottom < 0.99 &&
        Math.min(top, bottom, left, right) > -0.01
      )
        image.crop = { x: left, y: top, w: 1 - left - right, h: 1 - top - bottom };
      if (angle) image.angle = round(angle);
      const alt = props.get("wzDescription");
      if (alt) image.alt = alt;
      if (wrap) this.wraps.set(image, wrap);
      if (w > 0.5 && h > 0.5) story.runs.push({ image });
      return;
    }
    const type = number("shapeType", 1);
    if (type === 75) return;
    const yes = (name: string, usual: boolean) => (props.has(name) ? props.get(name)?.trim() === "1" : usual);
    const color = (name: string, usual: string, fill?: string) =>
      officeColor(props.has(name) ? number(name, 0) >>> 0 : undefined, usual, fill);
    // Paper shows through what is not solid.
    const seen = (one: string, name: string) =>
      mixColors(one, "#ffffff", Math.max(0, Math.min(1, number(name, 65536) / 65536)));
    const fill = color("fillColor", "#ffffff");
    const pairs = (name: string) =>
      [...(props.get(name) ?? "").matchAll(/\((-?\d+),(-?\d+)\)/g)].map((pair) => [Number(pair[1]), Number(pair[2])]);
    const dash = number("lineDashing", 0);
    const stroke: FlowLine = {
      color: seen(color("lineColor", "#000000", fill), "lineOpacity"),
      width: round(Math.max(0.25, number("lineWidth", 9525) / 12700)),
      ...(dash === 2 || dash === 5 ? { dash: "dot" } : dash > 0 ? { dash: "dash" } : {}),
    };
    const art = props.get("gtextUNICODE");
    const upright = number("anchorText", 0);
    const drawing: Drawing = {
      type,
      frame: at,
      angle,
      flipH: yes("fFlipH", false),
      flipV: yes("fFlipV", false),
      fill: yes("fFilled", true)
        ? paintOf({
            kind: number("fillType", 0),
            color: seen(fill, "fillOpacity"),
            back: seen(color("fillBackColor", "#ffffff", fill), "fillBackOpacity"),
            angle: number("fillAngle", 0) / 65536,
            focus: number("fillFocus", 0),
            stops: pairs("fillShadeColors").map(([one, place]) => [
              place / 65536,
              officeColor(one >>> 0, "#ffffff", fill),
            ]),
          })
        : null,
      stroke: yes("fLine", true) ? stroke : null,
      start: number("lineStartArrowhead", 0) > 0,
      end: number("lineEndArrowhead", 0) > 0,
      bends: ["adjustValue", "adjust2Value", "adjust3Value"].map((name) => number(name, 10800) / 21600),
      outline:
        !OFFICE_SHAPES[type] && props.has("pVerticies")
          ? {
              points: pairs("pVerticies").map(([x, y]) => ({ x, y })),
              steps: (props.get("pSegmentInfo") ?? "").split(";").slice(2).map(Number),
              box: [number("geoLeft", 0), number("geoTop", 0), number("geoRight", 21600), number("geoBottom", 21600)],
              kind: number("shapePath", 1),
            }
          : null,
      art: art
        ? {
            words: plain(art).trim(),
            font: props.get("gtextFont") ?? "Arial",
            bold: yes("gtextFBold", false),
            italic: yes("gtextFItalic", false),
          }
        : null,
      blocks: figure.blocks,
      valign: upright === 1 || upright === 4 ? "middle" : upright === 2 || upright === 5 ? "bottom" : "top",
    };
    const { image, box } = drawnShape(drawing, { from, behind, loose: wrap === null });
    if (wrap) for (const thing of [image, box]) if (thing) this.wraps.set(thing, wrap);
    if (image) story.runs.push({ image });
    if (box) story.boxes.push(box);
  }

  // ---------------------------------------------------------------- words of the format

  private side(index: number, target: "cell" | "row" | Side) {
    const draw: Draw = { kind: 1, width: 10, color: 0, none: false };
    this.draw = draw;
    if (target === "cell") this.row.next.lines[index] = draw;
    else if (target === "row") this.row.lines[index] = draw;
    else this.state.form.lines[target] = draw;
  }

  private word(name: string, value: number | undefined) {
    const { state } = this;
    const { look, form } = state;
    const on = value !== 0;
    const n = value ?? 0;
    const lookFlag = LOOK_FLAGS[name];
    if (lookFlag) {
      look[lookFlag] = on;
      look.said = true;
      return;
    }
    if (name.startsWith("ul") && UNDERLINES.has(name)) {
      look.underline = name !== "ulnone" && on;
      look.said = true;
      return;
    }
    if (this.draw && name.startsWith("brdr") && this.lineWord(name, n)) return;
    switch (name) {
      // ---------------- text
      case "par":
        if (state.dest === "text") this.endPara();
        return;
      case "line":
      case "softline":
        this.put("\n");
        return;
      case "tab":
        if (state.dest === "text" || state.dest === "mark") this.put("\t");
        return;
      case "page":
        if (state.dest === "text") this.pageBreak();
        return;
      case "column":
        if (state.dest === "text") {
          if (this.sect.cols > 1) this.endPara(false);
          else this.pageBreak();
        }
        return;
      case "emdash":
        this.put("—");
        return;
      case "endash":
        this.put("–");
        return;
      case "lquote":
        this.put("‘");
        return;
      case "rquote":
        this.put("’");
        return;
      case "ldblquote":
        this.put("“");
        return;
      case "rdblquote":
        this.put("”");
        return;
      case "bullet":
        this.put("•");
        return;
      case "emspace":
        this.put(" ");
        return;
      case "enspace":
        this.put(" ");
        return;
      case "qmspace":
        this.put(" ");
        return;
      case "zwj":
        this.put("\u200d");
        return;
      case "zwnj":
        this.put("\u200c");
        return;
      case "chpgn":
        if (this.story.where === "head") this.put("{page}");
        return;
      case "chftn":
        if (state.dest !== "text") return;
        if (this.story.where === "note") this.put(this.story.note());
        else {
          const ref: FlowRun = { text: "*", style: this.styleOf({ ...this.lookNow(), script: 1 }, 0, false) };
          this.story.runs.push(ref);
          this.noteRef = ref;
        }
        return;
      case "uc":
        state.skip = Math.max(0, n);
        return;
      // ---------------- tables
      case "cell":
        if (state.dest === "text") {
          const wasIn = form.inTable;
          form.inTable = true;
          const deep = form.depth;
          form.depth = 1;
          this.endPara();
          const table = this.table(1);
          this.closeTables(1);
          table.cells.push(table.cell);
          table.cell = [];
          form.inTable = wasIn;
          form.depth = deep;
        }
        return;
      case "nestcell":
        if (state.dest === "text") {
          const deep = Math.max(2, form.depth);
          form.inTable = true;
          form.depth = deep;
          this.endPara();
          const table = this.table(deep);
          this.closeTables(deep);
          table.cells.push(table.cell);
          table.cell = [];
        }
        return;
      case "row":
      case "nestrow": {
        const deep = name === "row" ? 1 : Math.max(2, form.depth);
        const table = this.table(deep);
        this.closeTables(deep);
        if (table.cell.length > 0 && table.cells.length < this.row.cells.length) {
          table.cells.push(table.cell);
          table.cell = [];
        }
        if (table.cells.length > 0) table.rows.push({ cells: table.cells, def: this.row });
        table.cells = [];
        if (name === "row") this.rowOpen = false;
        return;
      }
      case "trowd":
        this.row = newRowDef();
        this.rowOpen = true;
        return;
      case "cellx": {
        const cell = this.row.next;
        cell.right = n;
        this.row.cells.push(cell);
        this.row.next = newCellDef();
        this.draw = null;
        return;
      }
      case "trleft":
        this.row.left = n;
        return;
      case "trgaph":
        this.row.gap = n;
        return;
      case "trrh":
        this.row.height = n;
        return;
      case "trhdr":
        this.row.head = true;
        return;
      case "trqc":
        this.row.align = 1;
        return;
      case "trqr":
        this.row.align = 2;
        return;
      case "trwWidth":
        this.row.width = n;
        return;
      case "trftsWidth":
        this.row.unit = n;
        return;
      case "tblind":
        this.row.indent = n;
        return;
      case "tblindtype":
        if (n !== 3) this.row.indent = null;
        return;
      case "trpaddl":
        this.row.pad.left = n;
        return;
      case "trpaddr":
        this.row.pad.right = n;
        return;
      case "trpaddt":
        this.row.pad.top = n;
        return;
      case "trpaddb":
        this.row.pad.bottom = n;
        return;
      case "clmgf":
        this.row.next.merge = 2;
        return;
      case "clmrg":
        this.row.next.merge = 1;
        return;
      case "clvmgf":
        this.row.next.down = 2;
        return;
      case "clvmrg":
        this.row.next.down = 1;
        return;
      case "clvertalc":
        this.row.next.valign = 1;
        return;
      case "clvertalb":
        this.row.next.valign = 2;
        return;
      case "clcbpat":
        this.row.next.back = n;
        return;
      case "clcfpat":
        this.row.next.fore = n;
        return;
      case "clshdng":
        this.row.next.share = n;
        return;
      case "clbrdrt":
        return this.side(0, "cell");
      case "clbrdrl":
        return this.side(1, "cell");
      case "clbrdrb":
        return this.side(2, "cell");
      case "clbrdrr":
        return this.side(3, "cell");
      case "trbrdrt":
        return this.side(0, "row");
      case "trbrdrl":
        return this.side(1, "row");
      case "trbrdrb":
        return this.side(2, "row");
      case "trbrdrr":
        return this.side(3, "row");
      case "trbrdrh":
        return this.side(4, "row");
      case "trbrdrv":
        return this.side(5, "row");
      case "nesttableprops":
        this.rows.push(this.row);
        this.row = newRowDef();
        state.dest = "text";
        state.close = () => {
          this.row = this.rows.pop() ?? this.row;
        };
        return;
      case "nonesttables":
        this.skipGroup();
        return;
      // ---------------- paragraphs
      case "pard": {
        // Text so far keeps its paragraph; only what follows changes.
        state.form = newForm();
        this.draw = null;
        this.tab = "left";
        return;
      }
      case "s":
        if (state.dest === "style") this.style.id = n;
        else form.style = n;
        return;
      case "ds":
      case "ts":
        if (state.dest === "style") this.style.kind = name;
        return;
      case "cs":
        if (state.dest === "style") this.style.kind = "cs";
        return;
      case "sbasedon":
        this.style.base = n;
        return;
      case "brdrt":
        return this.side(0, "top");
      case "brdrb":
        return this.side(0, "bottom");
      case "brdrl":
        return this.side(0, "left");
      case "brdrr":
        return this.side(0, "right");
      case "brdrbtw":
        return this.side(0, "between");
      case "box": {
        this.side(0, "top");
        const { draw } = this;
        if (draw) form.lines = { ...form.lines, top: draw, right: draw, bottom: draw, left: draw };
        return;
      }
      case "brdrbar":
      case "chbrdr":
      case "pgbrdrt":
      case "pgbrdrb":
      case "pgbrdrl":
      case "pgbrdrr":
        // Lines nothing here can show; what follows describes them.
        this.draw = { kind: 0, width: 0, color: 0, none: true };
        return;
      case "tqr":
        this.tab = "right";
        return;
      case "tqc":
        this.tab = "center";
        return;
      case "tqdec":
        this.tab = "decimal";
        return;
      case "tx":
        form.tabs = [...form.tabs, { at: n / 20, kind: this.tab }];
        this.tab = "left";
        form.said = true;
        return;
      case "tb":
        this.tab = "left";
        return;
      case "ls":
        if (state.dest === "quiet" && this.use.id === 0) this.use.id = n;
        form.list = n;
        return;
      case "ilvl":
        form.level = Math.max(0, Math.min(8, n));
        return;
      case "intbl":
        form.inTable = true;
        return;
      case "itap":
        form.depth = Math.max(1, n);
        form.inTable = n > 0;
        return;
      case "outlinelevel":
        form.outline = n;
        return;
      case "posxc":
        form.frame = 1;
        return;
      case "posxr":
        form.frame = 2;
        return;
      case "dropcapli":
        form.drop = true;
        return;
      // ---------------- letters
      case "plain":
        state.look = { ...newLook(this.firstFont), kind: "" };
        return;
      case "f":
        this.setFont(n);
        return;
      case "af":
        // After a direction it belongs to letters of the other one.
        if (look.kind === "low") look.font = n;
        else if (look.kind === "high") look.high = n;
        else if (look.kind === "east") look.east = n;
        return;
      case "fs":
        if (n > 1) look.size = n;
        look.said = true;
        return;
      case "rtlch":
      case "ltrch":
      case "fcs":
        look.kind = "";
        return;
      case "loch":
        look.kind = "low";
        return;
      case "hich":
        look.kind = "high";
        return;
      case "dbch":
        look.kind = "east";
        return;
      case "cf":
        look.color = n;
        look.said = true;
        return;
      case "cb":
      case "chcbpat":
        look.back = n;
        return;
      case "highlight":
        look.marker = n;
        return;
      case "super":
        look.script = on ? 1 : 0;
        return;
      case "sub":
        look.script = on ? 2 : 0;
        return;
      case "nosupersub":
        look.script = 0;
        return;
      case "expndtw":
        look.tracking = n;
        return;
      case "expnd":
        if (look.tracking === 0) look.tracking = n * 5;
        return;
      // ---------------- fonts, colours, styles, lists
      case "fonttbl":
        state.dest = "fonts";
        state.close = () => {
          if (this.font.name) this.endFont();
        };
        return;
      case "fcharset":
        if (state.dest === "fonts") this.font.page = CHARSETS[n] ?? "";
        return;
      case "cpg":
        if (state.dest === "fonts") this.font.page = codePage(n);
        return;
      case "colortbl":
        state.dest = "colors";
        return;
      case "red":
      case "green":
      case "blue":
        this.mix[name === "red" ? 0 : name === "green" ? 1 : 2] = n;
        return;
      case "stylesheet":
        state.dest = "styles";
        return;
      case "listtable":
      case "listoverridetable":
        state.dest = "quiet";
        return;
      case "list":
        if (state.dest !== "quiet") return;
        this.list = { id: 0, levels: [] };
        state.close = () => {
          this.lists.set(this.list.id, this.list.levels);
        };
        return;
      case "listlevel": {
        const level: Level = { kind: 0, start: 1, text: "", follow: 0, legal: false, restart: 9 };
        this.level = level;
        state.close = () => {
          const length = level.text.charCodeAt(0) || 0;
          level.text = level.text.slice(1, 1 + length);
          this.level = null;
          if (this.use.at >= 0) {
            level.restart = Math.min(level.restart, this.use.at);
            this.use.levels.set(this.use.at, level);
            return;
          }
          level.restart = Math.min(level.restart, this.list.levels.length);
          this.list.levels.push(level);
        };
        return;
      }
      case "levelnfc":
        if (this.level) this.level.kind = n;
        return;
      case "levelnfcn":
        if (this.level) this.level.kind = n;
        return;
      case "levelstartat":
        if (this.level) this.level.start = n;
        else if (this.use.at >= 0) this.use.starts.set(this.use.at, n);
        return;
      case "levelfollow":
        if (this.level) this.level.follow = n;
        return;
      case "leveljc":
      case "leveljcn":
        if (this.level) this.level.side = n;
        return;
      case "levellegal":
        if (this.level) this.level.legal = on;
        return;
      case "levelnorestart":
        if (this.level && on) this.level.restart = 0;
        return;
      case "leveltext":
        state.dest = "leveltext";
        return;
      case "levelnumbers":
      case "listname":
      case "liststylename":
        this.skipGroup();
        return;
      case "listid":
        if (state.dest !== "quiet") return;
        this.list.id = n;
        this.use.list = n;
        return;
      case "listoverride":
        this.use = { id: 0, list: 0, starts: new Map(), levels: new Map(), at: -1 };
        state.close = () => {
          this.uses.set(this.use.id, this.use);
        };
        return;
      case "lfolevel":
        this.use.at += 1;
        return;
      case "pntext":
      case "listtext":
        state.dest = "mark";
        this.story.mark = "";
        return;
      // ---------------- the document
      case "htmautsp":
        this.known.larger = true;
        return;
      case "ansicpg":
        this.page = codePage(n);
        return;
      case "mac":
        this.page = "macintosh";
        return;
      case "deff":
        this.firstFont = n;
        this.state.look.font = n;
        return;
      case "info":
        state.dest = "quiet";
        return;
      case "title":
        if (state.dest === "quiet") state.dest = "title";
        return;
      case "author":
        if (state.dest === "quiet") state.dest = "author";
        return;
      case "header":
      case "headerl":
      case "headerr":
      case "headerf":
      case "footer":
      case "footerl":
      case "footerr":
      case "footerf":
        this.divert("head", (blocks) => {
          // Those of right pages stand for all; left pages have no place here.
          if (!name.endsWith("l")) this.heads.set(name.replace(/rr$/, "r"), blocks);
        });
        return;
      case "footnote":
        this.startNote();
        return;
      case "ftnalt":
        this.noteKind = "end";
        return;
      case "ftnsep":
      case "ftnsepc":
      case "ftncn":
      case "aftnsep":
      case "aftnsepc":
      case "aftncn":
      case "annotation":
      case "nonshppict":
      case "shprslt":
      case "fldtype":
      case "objdata":
      case "bkmkstart":
      case "bkmkend":
      case "xe":
      case "tc":
      case "pntxta":
      case "pntxtb":
      case "revtbl":
      case "filetbl":
        this.skipGroup();
        return;
      case "upr":
        // The same twice; the second one has all letters.
        state.dest = "quiet";
        return;
      case "ud":
        state.dest = this.stack[this.stack.length - 2]?.dest ?? "text";
        return;
      // ---------------- fields
      case "field":
        {
          const field: Field = { code: "", shown: false, hide: false };
          const { dest } = state;
          state.field = field;
          // Some fields have no result but show something all the same.
          state.close = () => {
            if (field.shown || dest !== "text") return;
            this.startResult(field);
            if (field.put) this.add(field.put);
          };
        }
        return;
      case "fldinst":
        state.dest = "code";
        return;
      case "fldrslt": {
        const { field } = state;
        // Inside what another field does, the result is part of that.
        const outer = this.stack[this.stack.length - 2];
        if (!field) return;
        this.startResult(field);
        field.shown = true;
        if (outer?.dest === "code" && outer.field) {
          state.dest = "code";
          state.field = outer.field;
          return;
        }
        if (state.dest !== "text") return;
        if (field.hide) return this.skipGroup();
        if (field.put !== undefined) {
          this.add(field.put);
          return this.skipGroup();
        }
        if (field.link) state.link = field.link;
        return;
      }
      case "formfield":
        state.dest = "quiet";
        if (state.field) state.field.form = { kind: 0, value: 25, usual: 0, items: [] };
        return;
      case "fftype":
        if (state.field?.form) state.field.form.kind = n;
        return;
      case "ffres":
        if (state.field?.form) state.field.form.value = n;
        return;
      case "ffdefres":
        if (state.field?.form) state.field.form.usual = n;
        return;
      case "ffl":
        if (state.field?.form) {
          state.field.form.items.push("");
          state.dest = "item";
        }
        return;
      case "ffname":
      case "ffdeftext":
      case "ffformat":
      case "ffhelptext":
      case "ffstattext":
      case "ffentrymcr":
      case "ffexitmcr":
      case "datafield":
        this.skipGroup();
        return;
      // ---------------- pictures and shapes
      case "pict": {
        if (state.dest !== "text" && state.dest !== "value") return this.skipGroup();
        const pict: Pict = {
          kind: "",
          w: 0,
          h: 0,
          goalW: 0,
          goalH: 0,
          scaleX: 100,
          scaleY: 100,
          crop: [0, 0, 0, 0],
          parts: [],
          odd: -1,
          alt: "",
        };
        const inValue = state.dest === "value";
        this.pict = pict;
        state.dest = "picture";
        state.close = () => {
          this.inValue = inValue;
          this.endPicture(pict);
          this.inValue = false;
          this.pict = null;
        };
        return;
      }
      case "pngblip":
      case "jpegblip":
      case "dibitmap":
        if (this.pict) this.pict.kind = name;
        return;
      case "picw":
        if (this.pict) this.pict.w = n;
        return;
      case "pich":
        if (this.pict) this.pict.h = n;
        return;
      case "picwgoal":
        if (this.pict) this.pict.goalW = n;
        return;
      case "pichgoal":
        if (this.pict) this.pict.goalH = n;
        return;
      case "picscalex":
        if (this.pict) this.pict.scaleX = n;
        return;
      case "picscaley":
        if (this.pict) this.pict.scaleY = n;
        return;
      case "piccropl":
        if (this.pict) this.pict.crop[0] = n;
        return;
      case "piccropr":
        if (this.pict) this.pict.crop[1] = n;
        return;
      case "piccropt":
        if (this.pict) this.pict.crop[2] = n;
        return;
      case "piccropb":
        if (this.pict) this.pict.crop[3] = n;
        return;
      case "object":
        state.dest = state.dest === "text" ? "quiet" : state.dest;
        return;
      case "result":
        if (state.dest === "quiet") state.dest = "text";
        return;
      case "shp":
      case "shpgrp":
        if (state.dest === "text") state.dest = "quiet";
        return;
      case "shpinst":
        this.startFigure();
        return;
      case "shptxt":
        this.divert("box", (blocks) => {
          const figure = this.figures[this.figures.length - 1];
          const made = flatten(blocks);
          // The last mark only closes the box.
          if (made.length > 1 && isBlank(made[made.length - 1])) made.pop();
          if (figure) figure.blocks = made;
        });
        return;
      case "sp":
        if (this.figures.length === 0) return this.skipGroup();
        this.prop = { name: "", value: "" };
        state.close = () => {
          const figure = this.figures[this.figures.length - 1];
          figure?.props.set(this.prop.name.trim(), this.prop.value.trim());
          this.prop = { name: "", value: "" };
        };
        return;
      case "sn":
        state.dest = "name";
        return;
      case "sv":
        state.dest = "value";
        return;
      case "picprop": {
        const { pict } = this;
        const figure = newFigure();
        this.figures.push(figure);
        state.dest = "quiet";
        state.close = () => {
          this.figures.pop();
          if (pict) pict.alt = figure.props.get("wzDescription") ?? "";
        };
        return;
      }
      default:
        break;
    }
    if (name.startsWith("shp")) this.figureWord(name, n);
    else if (!this.formWord(name, n, on)) this.pageWord(name, n);
  }

  private setFont(n: number) {
    const { state } = this;
    if (state.dest === "fonts") {
      if (this.font.name) this.endFont();
      this.font = { id: n, name: "", page: "" };
      return;
    }
    if (this.level && state.dest !== "text") {
      this.level.font ??= this.fonts.get(n)?.name;
      return;
    }
    const { look } = state;
    look.said = true;
    if (look.kind === "east") look.east = n;
    else if (look.kind === "high") look.high = n;
    else {
      look.font = n;
      if (look.kind === "") look.high = -1;
    }
  }

  private pageBreak() {
    const { story } = this;
    if (story.where !== "main" || this.depth(this.state.form) > 0) return;
    const cut = story.runs.length > 0;
    this.endPara(false);
    this.place([{ kind: "break" }], 0);
    story.cut = cut;
    story.fresh = true;
  }

  private lineWord(name: string, n: number): boolean {
    const draw = this.draw as Draw;
    if (name === "brdrw") draw.width = n;
    else if (name === "brdrcf") draw.color = n;
    else if (name === "brdrnone" || name === "brdrnil" || name === "brdrtbl") draw.none = true;
    else {
      const kind = LINE_KINDS[name];
      if (kind === undefined) return false;
      draw.kind = kind;
      if (name === "brdrth") draw.width *= 2;
    }
    return true;
  }

  private formWord(name: string, n: number, on: boolean): boolean {
    const { form } = this.state;
    switch (name) {
      case "ql":
        form.align = 0;
        break;
      case "qc":
        form.align = 1;
        break;
      case "qr":
        form.align = 2;
        break;
      case "qj":
      case "qd":
      case "qt":
        form.align = 3;
        break;
      case "li":
        form.left = n;
        break;
      case "ri":
        form.right = n;
        break;
      case "fi":
        form.first = n;
        break;
      case "sb":
        form.before = n;
        break;
      case "sa":
        form.after = n;
        break;
      case "sbauto":
        form.autoBefore = on;
        break;
      case "saauto":
        form.autoAfter = on;
        break;
      case "contextualspace":
        form.contextual = true;
        break;
      case "sl":
        form.line = n;
        break;
      case "slmult":
        form.multiple = on;
        break;
      case "keepn":
        form.keepNext = on;
        break;
      case "pagebb":
        form.pageBreak = on;
        break;
      case "rtlpar":
        form.rtl = true;
        return true;
      case "ltrpar":
        form.rtl = false;
        return true;
      case "cbpat":
        form.back = n;
        return true;
      case "cfpat":
        form.fore = n;
        return true;
      case "shading":
        form.share = n;
        return true;
      default:
        return false;
    }
    form.said = true;
    return true;
  }

  private figureWord(name: string, n: number) {
    const figure = this.figures[this.figures.length - 1];
    if (!figure) return;
    if (name === "shpleft") figure.left = n;
    else if (name === "shptop") figure.top = n;
    else if (name === "shpright") figure.right = n;
    else if (name === "shpbottom") figure.bottom = n;
    else if (name === "shpwr") figure.wrap = n;
    else if (name === "shpfblwtxt") figure.behind = n === 1;
    else if (/^shpbx(page|margin|column)$/.test(name)) figure.fromX = name.slice(5);
    else if (/^shpby(page|margin|para)$/.test(name)) figure.fromY = name.slice(5);
  }

  private pageWord(name: string, n: number) {
    const { paper, sect } = this;
    // Word repeats parts of this inside headers, where it says nothing.
    if (this.story.where !== "main") return;
    switch (name) {
      case "paperw":
        paper.w = sect.w = n;
        break;
      case "paperh":
        paper.h = sect.h = n;
        break;
      case "margl":
        paper.left = sect.left = n;
        break;
      case "margr":
        paper.right = sect.right = n;
        break;
      case "margt":
        paper.top = sect.top = Math.abs(n);
        break;
      case "margb":
        paper.bottom = sect.bottom = Math.abs(n);
        break;
      case "gutter":
        paper.gutter = sect.gutter = n;
        break;
      case "landscape":
        paper.turned = sect.turned = true;
        break;
      case "sectd":
        this.sect = this.newSect();
        break;
      case "sect":
        if (this.state.dest !== "text") break;
        this.endPara(false);
        this.endSection();
        break;
      case "pgwsxn":
        // Sizes of its own are those of the turned page already.
        sect.w = n;
        sect.turned = false;
        break;
      case "pghsxn":
        sect.h = n;
        break;
      case "marglsxn":
        sect.left = n;
        break;
      case "margrsxn":
        sect.right = n;
        break;
      case "margtsxn":
        sect.top = Math.abs(n);
        break;
      case "margbsxn":
        sect.bottom = Math.abs(n);
        break;
      case "guttersxn":
        sect.gutter = n;
        break;
      case "lndscpsxn":
        if (sect.w === paper.w) sect.turned = true;
        break;
      case "cols":
        sect.cols = Math.max(1, n);
        break;
      case "colsx":
        sect.gap = n;
        break;
      case "headery":
        sect.head = n;
        break;
      case "footery":
        sect.foot = n;
        break;
      case "titlepg":
        sect.own = true;
        break;
      case "sbknone":
        sect.kind = 0;
        break;
      case "sbkcol":
        sect.kind = 1;
        break;
      case "sbkpage":
      case "sbkeven":
      case "sbkodd":
        sect.kind = 2;
        break;
      default:
        break;
    }
  }
}

const LOOK_FLAGS: Record<string, "bold" | "italic" | "strike" | "caps" | "small" | "hidden" | "deleted"> = {
  b: "bold",
  i: "italic",
  strike: "strike",
  striked: "strike",
  caps: "caps",
  scaps: "small",
  v: "hidden",
  deleted: "deleted",
};

const UNDERLINES = new Set(
  (
    "ul uld uldash uldashd uldashdd uldb ulhair ulhwave ulldash ulnone ulth ulthd ulthdash ulthdashd " +
    "ulthdashdd ulthldash ululdbwave ulw ulwave"
  ).split(" "),
);

const LINE_KINDS: Record<string, number> = {
  brdrs: 1,
  brdrth: 1,
  brdrsh: 1,
  brdrdb: 3,
  brdrdot: 6,
  brdrdash: 7,
  brdrdashsm: 22,
  brdrdashd: 8,
  brdrdashdd: 9,
  brdrdashdotstr: 23,
  brdrhair: 1,
  brdrtriple: 10,
  brdrthtnsg: 11,
  brdrtnthsg: 12,
  brdrtnthtnsg: 13,
  brdrthtnmg: 14,
  brdrtnthmg: 15,
  brdrtnthtnmg: 16,
  brdrthtnlg: 17,
  brdrtnthlg: 18,
  brdrtnthtnlg: 19,
  brdrwavy: 20,
  brdrwavydb: 21,
  brdremboss: 24,
  brdrengrave: 25,
  brdroutset: 26,
  brdrinset: 27,
};

/** Marked as optional, but known here. */
const STARRED = new Set(
  (
    "shppict shpinst fldinst listtable listoverridetable formfield ffl ud nesttableprops picprop footnote " +
    "listlevel list listoverride sn sv sp shptxt result fldrslt"
  ).split(" "),
);

export async function readRtf(bytes: Uint8Array): Promise<FlowDoc> {
  let start = 0;
  // Some programs write RTF in two bytes a letter, or with a mark in front.
  let source = bytes;
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
    source = Uint8Array.from(decodeText(bytes), (sign) => Math.min(255, sign.charCodeAt(0)));
  while (start < Math.min(64, source.length) && source[start] !== 0x7b) start += 1;
  const head = String.fromCharCode(...source.subarray(start, start + 5));
  if (head !== "{\\rtf") throw new ConvertError("This does not look like a Rich Text file.");
  return new Rtf(source.subarray(start)).read();
}
