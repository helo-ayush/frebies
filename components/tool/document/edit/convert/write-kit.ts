import type { Box } from "../engine/matrix";
import { adjOf, shapeDef, type ShapePart } from "../engine/shape-kinds";
import type { Cmd } from "../engine/shapes";
import type {
  FlowBlock,
  FlowBox,
  FlowCell,
  FlowDoc,
  FlowImage,
  FlowLine,
  FlowMargin,
  FlowList,
  FlowPara,
  FlowRule,
  FlowRun,
  FlowSection,
  FlowStyle,
  FlowTable,
} from "./flow";

/** What the writers share: measures, names, lists, table grids, pictures and shapes. */

// ---------------------------------------------------------------- measures and colours

export const finite = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : 0);
export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** The twentieths of a point Word measures in, and the 12700ths its drawings use. */
export const twips = (points: number | undefined) => Math.round(finite(points) * 20);
export const emu = (points: number | undefined) => Math.round(finite(points) * 12700);
/** Two decimals are plenty on paper. */
export const short = (value: number | undefined) => String(Math.round(finite(value) * 100) / 100);
export const pt = (points: number | undefined) => `${short(points)}pt`;

/** "#1d1c1f" as "1D1C1F"; null for what is no colour. */
export function hex(color: string | null | undefined): string | null {
  const digits = /^#([0-9a-f]{3,8})$/i.exec(color ?? "")?.[1] ?? "";
  const six = digits.length < 5 ? [...digits.slice(0, 3)].map((digit) => digit + digit).join("") : digits.slice(0, 6);
  return six.length === 6 ? six.toUpperCase() : null;
}

/** Red, green and blue, 0 to 255. */
export function rgb(color: string): [number, number, number] {
  const value = parseInt(hex(color) ?? "000000", 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

/** Page and margins with room left for at least some words, and the columns that fit. */
export function paperOf(section: FlowSection, most: number) {
  const page = {
    w: clamp(finite(section.w) || 595.3, 36, most),
    h: clamp(finite(section.h) || 841.9, 36, most),
  };
  const pair = (a: number, b: number, room: number): [number, number] => {
    const [x, y] = [Math.max(0, finite(a)), Math.max(0, finite(b))];
    const left = Math.max(0, room - 18);
    return x + y > left ? [(x / (x + y)) * left, (y / (x + y)) * left] : [x, y];
  };
  const [left, right] = pair(section.margin.left, section.margin.right, page.w);
  const [top, bottom] = pair(section.margin.top, section.margin.bottom, page.h);
  const width = page.w - left - right;
  const gap = Math.max(0, section.gap ?? 24);
  let columns = clamp(Math.round(section.columns ?? 1), 1, 45);
  while (columns > 1 && (width - gap * (columns - 1)) / columns < 36) columns -= 1;
  /** A header or footer that does not say how far from the edge it is. */
  const bandAt = (points: number | undefined, edge: number) => clamp(points ?? Math.min(36, edge / 2), 0, page.h / 2);
  return {
    page,
    margin: { top, right, bottom, left },
    columns,
    gap,
    /** Room for the words: the whole width, one column of it, and the height. */
    width,
    column: (width - gap * (columns - 1)) / columns,
    height: page.h - top - bottom,
    headerAt: bandAt(section.headerAt, top),
    footerAt: bandAt(section.footerAt, bottom),
  };
}

// ---------------------------------------------------------------- words

/** Line ends as "\n"; characters XML cannot hold in any form are dropped. */
export function clean(text: string): string {
  return text
    .replace(/\r\n?|[\v\u{85}\u{2028}\u{2029}]/gu, "\n")
    .replace(/[\u{0}-\u{8}\f\u{e}-\u{1f}\u{d800}-\u{dfff}\u{fffe}\u{ffff}]/gu, "");
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const xml = (text: string) => clean(text).replace(/[&<>"]/g, (sign) => ENTITIES[sign]);
/** For attributes, where a line end is only a space. */
export const attr = (text: string) => xml(text).replace(/[\n\t]+/g, " ");

export const textOf = (para: FlowPara) => clean(para.runs.map((run) => run.text ?? "").join(""));
export const isBlank = (para: FlowPara) => para.runs.every((run) => !run.image && run.text === "");
/** Nothing but pictures that stand elsewhere: there is no line to keep for them. */
export const isLoose = (para: FlowPara) =>
  !para.list &&
  !para.heading &&
  para.runs.some((run) => run.image) &&
  para.runs.every((run) => run.image?.float || run.text === "");
export const hasWords = (blocks: readonly FlowPara[]) => blocks.some((para) => !isBlank(para));
/** Arabic, Hebrew and the like: its first letter says so. */
export const isRtl = (para: FlowPara) =>
  /^[^\p{L}]*[\u{590}-\u{8ff}\u{fb1d}-\u{fdff}\u{fe70}-\u{fefc}]/u.test(textOf(para));

/** Devanagari and the other scripts that Office sets in its "complex" font. */
export const isComplex = (text: string) => /[\u{590}-\u{109f}\u{1780}-\u{17ff}]/u.test(text);

/** An address that can be followed, or null for what should not be a link. */
export function href(link: string | undefined): string | null {
  const text = clean(link ?? "").trim();
  if (!text || text.startsWith("#") || /^(javascript|vbscript|data|file|blob|about):/i.test(text)) return null;
  let url = text;
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(text)) url = `mailto:${text}`;
  else if (/^\+?[\d\s().-]{6,}$/.test(text)) url = `tel:${text.replace(/[^\d+]/g, "")}`;
  else if (text.startsWith("//")) url = `https:${text}`;
  else if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(text)) url = `https://${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:./i.test(text)) return null;
  return url
    .replace(/%(?![0-9a-f]{2})/gi, "%25")
    .replace(/[^\w\-.~:/?#[\]@!$&'()*+,;=%]/gu, (sign) => encodeURIComponent(sign));
}

const WIDE = /[\u{1100}-\u{11ff}\u{2e80}-\u{ffef}\u{1f000}-\u{1faff}]/u;

/** About how wide some words come out. */
export function roughWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const sign of text)
    units += WIDE.test(sign) ? 1 : /[iIjltf.,:;'|!()[\] ]/.test(sign) ? 0.3 : /[A-Zmw%@&]/.test(sign) ? 0.68 : 0.52;
  return units * size * (bold ? 1.08 : 1);
}

/** About how high paragraphs come out in a room so wide. */
export function roughHeight(blocks: readonly FlowPara[], width: number, usual: number): number {
  let total = 0;
  for (const para of blocks) {
    const room = Math.max(8, width - finite(para.left) - finite(para.right));
    let size = markStyle(para).size ?? usual;
    let pictures = 0;
    const lines = [finite(para.first)];
    for (const run of para.runs) {
      if (run.image) {
        if (!run.image.float) pictures = Math.max(pictures, run.image.h);
        continue;
      }
      if (run.text) size = Math.max(size, run.style.size ?? usual);
      clean(run.text)
        .split("\n")
        .forEach((words, i) => {
          if (i > 0) lines.push(0);
          lines[lines.length - 1] += roughWidth(words, run.style.size ?? usual, run.style.bold);
        });
    }
    const count = lines.reduce((sum, wide) => sum + Math.max(1, Math.ceil(wide / room)), 0);
    let high = size * 1.22;
    if (para.line && "times" in para.line) high *= para.line.times;
    else if (para.line) high = para.line.atLeast ? Math.max(high, para.line.points) : para.line.points;
    total += finite(para.before) + finite(para.after) + Math.max(count * high, pictures);
  }
  return total;
}

/** The same for everything in a header or footer. */
export const roughBand = (blocks: readonly FlowBlock[], width: number, usual: number) =>
  blocks.reduce((sum, block) => {
    if (block.kind === "para") return sum + roughHeight([block], width, usual);
    return sum + (block.kind === "rule" ? 10 : block.kind === "table" ? block.rows.length * usual * 1.5 : 0);
  }, 0);

/** Height for the words of a page. A header or footer that does not fit into its margin takes some of it. */
export function bodyHeight(section: FlowSection, most: number, usual: number): number {
  const { margin, width, height, headerAt, footerAt } = paperOf(section, most);
  const over = (blocks: readonly FlowBlock[] | undefined, at: number, edge: number) =>
    blocks?.length ? Math.max(0, at + roughBand(blocks, width, usual) - edge) : 0;
  const [top, bottom] = [over(section.header, headerAt, margin.top), over(section.footer, footerAt, margin.bottom)];
  return Math.max(18, height - top - bottom);
}

// ---------------------------------------------------------------- fonts

/** The editor's own fonts, as the font of the same shape that people have. */
const EDITOR_FONTS: Record<string, string> = {
  arimo: "Arial",
  tinos: "Times New Roman",
  cousine: "Courier New",
  carlito: "Calibri",
  caladea: "Cambria",
  gelasio: "Georgia",
  "open-sans": "Open Sans",
  roboto: "Roboto",
  inter: "Inter",
  lato: "Lato",
  montserrat: "Montserrat",
  poppins: "Poppins",
  oswald: "Oswald",
  garamond: "Garamond",
  playfair: "Playfair Display",
  dancing: "Dancing Script",
  caveat: "Caveat",
  vibes: "Great Vibes",
  devanagari: "Mangal",
  symbols: "Segoe UI Symbol",
};

const GENERIC: Record<string, string> = {
  "sans-serif": "Arial",
  "system-ui": "Segoe UI",
  serif: "Times New Roman",
  monospace: "Courier New",
  cursive: "Segoe Script",
};

/** A font by the name other programs know it under. */
export function fontName(font: string | undefined): string | undefined {
  if (font?.startsWith("lib:")) return EDITOR_FONTS[font.slice(4)] ?? "Arial";
  if (!font || /^(pdf|user):/.test(font)) return undefined;
  const first = clean(font)
    .split(",")[0]
    .replace(/["'\n\t]/g, "")
    .replace(/^[A-Z]{6}\+/, "")
    .trim()
    .slice(0, 100);
  return GENERIC[first.toLowerCase()] ?? (first || undefined);
}

export type FontKind = "sans" | "serif" | "mono" | "script";

const MONO = /courier|consol|mono|menlo|monaco|typewriter|lucidacons|cousine|sourcecode|firacode|cmtt/;
const SCRIPT = /script|brush|hand|caveat|vibes|cursive|comic|calligra/;
const SANS = /sans|grotesk|gothic/;
const SERIF = new RegExp(
  "times|serif|roman|georgia|cambria|garamond|playfair|palatino|bookman|antiqua|baskerville|minion|didot|bodoni|" +
    "constantia|century|tinos|caladea|gelasio|mincho|song",
);

export function fontKind(name: string): FontKind {
  const flat = name.toLowerCase().replace(/[\s_-]/g, "");
  if (MONO.test(flat)) return "mono";
  if (SCRIPT.test(flat)) return "script";
  return !SANS.test(flat) && SERIF.test(flat) ? "serif" : "sans";
}

export const isMono = (font: string | undefined) => fontKind(fontName(font) ?? "") === "mono";

/** What is shown where the font itself is missing. */
export const STAND_IN: Record<FontKind, string> = {
  sans: "Arial",
  serif: "Times New Roman",
  mono: "Courier New",
  script: "Segoe Script",
};

// ---------------------------------------------------------------- walking through a document

export function eachPara(blocks: readonly FlowBlock[], visit: (para: FlowPara) => void) {
  for (const block of blocks) {
    if (block.kind === "para") visit(block);
    else if (block.kind === "box") block.blocks.forEach(visit);
    else if (block.kind === "table")
      for (const row of block.rows) for (const cell of row.cells) cell.blocks.forEach(visit);
  }
}

export function eachDocPara(doc: FlowDoc, visit: (para: FlowPara) => void) {
  for (const section of doc.sections)
    for (const blocks of [section.blocks, section.header ?? [], section.footer ?? []]) eachPara(blocks, visit);
}

/** Adds up weights and says which key has the most. */
export class Tally<K> {
  private sums = new Map<K, number>();

  add(key: K, weight: number) {
    this.sums.set(key, (this.sums.get(key) ?? 0) + weight);
  }

  top(): K | undefined {
    let best: K | undefined;
    let most = -1;
    for (const [key, sum] of this.sums) if (sum > most) [best, most] = [key, sum];
    return best;
  }
}

export type Look = { font: string; size: number; color: string };

const PLAIN: Look = { font: "Calibri", size: 11, color: "#000000" };

/** How most of the words look: what a style for them should be. */
export function usualLook(paras: readonly FlowPara[], back: Look = PLAIN): Look {
  const fonts = new Tally<string>();
  const sizes = new Tally<number>();
  const colors = new Tally<string>();
  for (const para of paras) {
    for (const run of para.runs) {
      if (run.image || run.text.trim() === "") continue;
      const font = fontName(run.style.font);
      const color = hex(run.style.color);
      if (font) fonts.add(font, run.text.length);
      if (run.style.size) sizes.add(Math.round(run.style.size * 2) / 2, run.text.length);
      if (color) colors.add(`#${color.toLowerCase()}`, run.text.length);
    }
  }
  return { font: fonts.top() ?? back.font, size: sizes.top() ?? back.size, color: colors.top() ?? back.color };
}

/** The look of the body text. Headings only count when there is nothing else. */
export function bodyLook(doc: FlowDoc): Look {
  const plain: FlowPara[] = [];
  const all: FlowPara[] = [];
  for (const section of doc.sections)
    eachPara(section.blocks, (para) => {
      all.push(para);
      if (!para.heading) plain.push(para);
    });
  return usualLook(plain, usualLook(all));
}

export const headingOf = (para: FlowPara) => (para.heading ? clamp(Math.round(para.heading), 1, 6) : 0);

export type HeadLook = Look & { bold: boolean; italic: boolean; first?: FlowPara };

/** What the heading styles look like: as the headings of a document do, or like Word's own when it has none. */
export function headLooks(doc: FlowDoc, base: Look): HeadLook[] {
  const levels: FlowPara[][] = [[], [], [], [], [], []];
  for (const section of doc.sections)
    eachPara(section.blocks, (para) => para.heading && levels[headingOf(para) - 1].push(para));
  return levels.map((paras, i) => {
    const size = Math.round([20, 16, 14, 12, 11, 11][i] * (base.size / 11) * 2) / 2;
    const bold = new Tally<boolean>();
    const italic = new Tally<boolean>();
    for (const { text, style } of paras.flatMap((para) => para.runs)) {
      if (!text) continue;
      bold.add(Boolean(style.bold), text.length);
      italic.add(Boolean(style.italic), text.length);
    }
    const look = usualLook(paras, { ...base, size });
    return { ...look, bold: bold.top() ?? true, italic: italic.top() ?? false, first: paras[0] };
  });
}

/** The style an empty paragraph, a bullet or the end of a line takes. */
export function markStyle(para: FlowPara): FlowStyle {
  const words = para.runs.filter((run) => !run.image && run.text !== "");
  const run = para.list ? words[0] : words[words.length - 1];
  return (run ?? para.runs.find((other) => !other.image))?.style ?? {};
}

/** The smallest text in some cells: an empty cell should not make its row higher than that. */
export function smallest(cells: readonly FlowCell[]): number | undefined {
  let size: number | undefined;
  for (const cell of cells)
    for (const para of cell.blocks)
      for (const run of para.runs)
        if (!run.image && run.text !== "" && run.style.size) size = Math.min(size ?? Infinity, run.style.size);
  return size;
}

// ---------------------------------------------------------------- page numbers

export type Piece = { run: FlowRun; field?: "page" | "pages" };

/** Cuts "{page}" and "{pages}" out of the words around them, also when their letters look different. */
export function pieces(runs: readonly FlowRun[], fields: boolean): Piece[] {
  if (!fields) return runs.map((run) => ({ run }));
  const all = runs.map((run) => (run.image ? "\u{fffc}" : run.text)).join("");
  const tokens = [...all.matchAll(/\{(pages?)\}/g)].map((match) => ({
    name: match[1] as "page" | "pages",
    from: match.index ?? 0,
    to: (match.index ?? 0) + match[0].length,
  }));
  const out: Piece[] = [];
  let at = 0;
  for (const run of runs) {
    if (run.image) {
      out.push({ run });
      at += 1;
      continue;
    }
    const end = at + run.text.length;
    let from = at;
    for (const token of tokens) {
      if (token.to <= at || token.from >= end) continue;
      if (token.from > from) out.push({ run: { text: all.slice(from, token.from), style: run.style } });
      if (token.from >= at) out.push({ run: { text: "", style: run.style }, field: token.name });
      from = Math.min(end, token.to);
    }
    if (from < end) out.push({ run: { text: all.slice(from, end), style: run.style } });
    at = end;
  }
  return out;
}

export type Stop = { kind: "left" | "center" | "right"; at: number };

/** Tab stops of headers and footers that name none: the middle and the right edge. */
export const bandStops = (width: number): Stop[] => [
  { kind: "center", at: width / 2 },
  { kind: "right", at: width },
];

/** Words end at a stop on the right edge, and stand around one in the middle before it. */
export function stopsOf(para: FlowPara, band: boolean, width: number): Stop[] {
  const tabs = (para.tabs ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!band) return tabs.map((at) => ({ kind: "left", at }));
  if (tabs.length === 0) return bandStops(width);
  const edge = Math.abs(tabs[tabs.length - 1] - width) < 6;
  return tabs.map((at, i): Stop => {
    if (edge && i === tabs.length - 1) return { kind: "right", at: width };
    const middle = edge && (tabs.length === 2 || Math.abs(at - width / 2) < 6);
    return { kind: middle ? "center" : "left", at };
  });
}

// ---------------------------------------------------------------- lists

export type NumberKind = "1" | "a" | "A" | "i" | "I";

/** The pattern of a number: `between[0]`, a count, `between[1]`, a count... The last count is the item's own. */
export type MarkPattern = { between: string[]; kinds: NumberKind[] };

/** What is longer is no mark, and more than Word can take. */
const cutMark = (mark: string) => [...mark].slice(0, 60).join("");

export function markPattern(given: string, level: number): MarkPattern {
  const mark = cutMark(given);
  const signs = [...mark.matchAll(/[1aAiI]/g)].map((match) => match.index ?? 0);
  const part = (index: number) => /[A-Za-z0-9]/.test(mark[index] ?? "");
  // "Part 1": the letters of a word are not counts.
  const alone = signs.filter((index) => !part(index - 1) && !part(index + 1));
  // "1.1" on the second level: the counts of the levels above come first.
  const middle = mark.slice(alone[0] ?? 0, (alone[alone.length - 1] ?? -1) + 1);
  const chain = alone.length > 1 && alone.length <= level + 1 && /^\w([.\-–]\w)+$/.test(middle);
  const found = chain ? alone : (alone.length > 0 ? alone : signs).slice(0, 1);
  if (found.length === 0) return { between: ["", mark || "."], kinds: ["1"] };
  const between: string[] = [];
  const kinds: NumberKind[] = [];
  let at = 0;
  for (const index of found) {
    between.push(mark.slice(at, index));
    kinds.push(mark[index] as NumberKind);
    at = index + 1;
  }
  between.push(mark.slice(at));
  return { between, kinds };
}

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

export function countText(kind: NumberKind, value: number): string {
  if (kind === "1") return String(value);
  let out = "";
  if (kind === "a" || kind === "A") {
    for (let left = Math.max(1, value); left > 0; left = Math.floor((left - 1) / 26))
      out = String.fromCharCode(97 + ((left - 1) % 26)) + out;
  } else {
    let left = clamp(value, 1, 3999);
    for (const [size, sign] of ROMAN) for (; left >= size; left -= size) out += sign;
  }
  return kind === "A" || kind === "I" ? out.toUpperCase() : out;
}

/** Bullets of Word's old picture fonts, as characters every font program knows. */
const PRIVATE: Record<string, string> = {
  "\u{f0b7}": "•",
  "\u{f0a7}": "▪",
  "\u{f0a8}": "□",
  "\u{f06f}": "☐",
  "\u{f0fe}": "☒",
  "\u{f0fc}": "✓",
  "\u{f0fb}": "✗",
  "\u{f0d8}": "➢",
  "\u{f076}": "❖",
  "\u{f0e0}": "→",
  "\u{f0ab}": "★",
  "\u{f06c}": "●",
  "\u{f06e}": "■",
  "\u{f075}": "◆",
};

export function bulletText(mark: string): string {
  const text = cutMark(
    clean(mark)
      .replace(/[\n\t]/g, "")
      .trim(),
  );
  return text.replace(/[\u{e000}-\u{f8ff}]/gu, (sign) => PRIVATE[sign] ?? "•") || "•";
}

/** Letters and dots are in every font; for drawn bullets one has to be named. */
export function bulletFont(text: string): string | null {
  if (/[\u{10000}-\u{10ffff}]/u.test(text)) return "Segoe UI Emoji";
  return /[\u{2300}-\u{ffff}]/u.test(text) ? "Segoe UI Symbol" : null;
}

/** What Word can start a list from. */
const MAX_COUNT = 32767;

export const listLevel = (list: FlowList) => clamp(Math.round(finite(list.level)), 0, 8);

export type ListItem = {
  level: number;
  /** What stands in front: the bullet, or the number worked out. */
  label: string;
  /** Its count; 0 for a bullet. */
  value: number;
  /** A list of its own begins here, at this level. */
  fresh: boolean;
};

/**
 * Counts as the editor does: a paragraph without a mark ends the list, an item
 * starts the levels below it over, another kind of mark is another list.
 */
export class ListCounter {
  private levels: ({ kind: string; count: number } | undefined)[] = [];

  stop() {
    this.levels = [];
  }

  next(list: FlowList): ListItem {
    const level = listLevel(list);
    this.levels.length = Math.min(this.levels.length, level + 1);
    const was = this.levels[level];
    const kind = `${list.type}${list.mark}`;
    const number = list.type === "number";
    const start = number && Number.isFinite(list.start) ? clamp(Math.round(finite(list.start)), 0, MAX_COUNT) : null;
    const goes = was?.kind === kind && (start === null || start === was.count + 1);
    const count = goes && was ? was.count + 1 : (start ?? 1);
    this.levels[level] = { kind, count };
    if (!number) return { level, label: bulletText(list.mark), value: 0, fresh: !goes };
    const { between, kinds } = markPattern(list.mark, level);
    const label = kinds
      .map((one, i) => {
        const above = level - (kinds.length - 1 - i);
        return between[i] + countText(one, above === level ? count : (this.levels[above]?.count ?? 1));
      })
      .join("");
    return { level, label: clean(label + between[between.length - 1]), value: count, fresh: !goes };
  }
}

/** What levels look like that a list does not use yet. */
const SPARE_BULLETS = ["•", "◦", "▪"];
const SPARE_NUMBERS = ["1.", "a.", "i."];

const LIST_STEP = 36;
const LIST_HANG = 18;

export type BookLevel = {
  kind: string;
  number: boolean;
  mark: string;
  start: number;
  /** Left edge of the words, and how far the mark stands out from it (negative). */
  left: number;
  first: number;
  /** There is room for the mark: the words can all start at the left edge. */
  tab: boolean;
};

/** A list as word processors have them. `counts` is how far one would have counted by now, level by level. */
export type BookList = { id: number; levels: (BookLevel | undefined)[]; counts: (number | undefined)[] };
/** `left` and `first`: where the words of this item start, and its mark. */
export type BookItem = {
  list: BookList;
  at: number;
  level: BookLevel;
  value: number;
  label: string;
  left: number;
  first: number;
};

/** Every run of list items gets a list of its own, unless its first number goes on from an earlier one. */
export class ListBook {
  readonly lists: BookList[] = [];
  private counter = new ListCounter();
  /** By level: the list the last item there went into. */
  private held: (BookList | undefined)[] = [];
  private inRun = new Set<BookList>();
  private recent = new Map<string, BookList>();

  stop() {
    this.counter.stop();
    this.held = [];
    this.inRun.clear();
  }

  /** Words in a drawing are counted apart from the text around it. */
  apart<T>(work: () => T): T {
    const { counter, held, inRun, recent } = this;
    this.counter = new ListCounter();
    this.held = [];
    this.inRun = new Set();
    this.recent = new Map();
    try {
      return work();
    } finally {
      Object.assign(this, { counter, held, inRun, recent });
    }
  }

  /** `usual` is the size of text that does not say. */
  use(para: FlowPara, usual: number): BookItem {
    const given = para.list ?? { type: "bullet", mark: "•", level: 0 };
    const { level: at, value, label } = this.counter.next(given);
    const number = given.type === "number";
    const kind = `${given.type} ${given.mark}`;
    this.held.length = Math.min(this.held.length, at + 1);
    const above = this.held.slice(0, at).reverse().find(Boolean);
    const choices = [this.held[at], above, ...(number ? [] : this.inRun)];
    if (number && (given.start ?? 1) > 1) choices.push(this.recent.get(`${at} ${kind}`));
    const list = choices.find((one) => one && this.fits(one, at, kind, value)) ?? this.make(above, at);
    const place = listPlace(para, at);
    const style = markStyle(para);
    // A mark wider than its room would push the words to the next tab stop, far off.
    const tab = place.first < 0 && roughWidth(label, style.size ?? usual, style.bold) <= -place.first;
    const level = (list.levels[at] ??= { kind, number, mark: given.mark, start: value, ...place, tab });
    list.counts.length = Math.min(list.counts.length, at);
    list.counts[at] = value;
    this.held[at] = list;
    this.inRun.add(list);
    this.recent.set(`${at} ${kind}`, list);
    return { list, at, level, value, label, ...place };
  }

  /** Would a word processor show the right thing if the item went into this list? */
  private fits(list: BookList, at: number, kind: string, value: number): boolean {
    const level = list.levels[at];
    if (!level) return true;
    if (level.kind !== kind) return false;
    return !level.number || (list.counts[at] ?? level.start - 1) + 1 === value;
  }

  private make(above: BookList | undefined, at: number): BookList {
    const list: BookList = { id: this.lists.length + 1, levels: above ? above.levels.slice(0, at) : [], counts: [] };
    this.lists.push(list);
    return list;
  }
}

/** With one measure given the other is meant as well. */
function listPlace(para: FlowPara, at: number): { left: number; first: number } {
  const left = para.left === undefined && para.first === undefined ? LIST_STEP * (at + 1) : finite(para.left);
  return { left, first: para.first ?? -clamp(left, 0, LIST_HANG) };
}

/** All nine levels of a list. Those no item uses are there for whoever goes on with it. */
export function allLevels(levels: readonly (BookLevel | undefined)[]): BookLevel[] {
  let near = levels.findIndex(Boolean);
  return Array.from({ length: 9 }, (_, at) => {
    const own = levels[at];
    if (own) {
      near = at;
      return own;
    }
    const like = levels[near];
    const number = like?.number ?? false;
    const marks = number ? SPARE_NUMBERS : SPARE_BULLETS;
    const left = Math.max(LIST_HANG, finite(like?.left) + LIST_STEP * (at - Math.max(0, near)));
    return { kind: "", number, mark: marks[at % marks.length], start: 1, left, first: -LIST_HANG, tab: true };
  });
}

// ---------------------------------------------------------------- tables

export type Side = "top" | "right" | "bottom" | "left";
export type Placed = { cell: FlowCell; row: number; col: number; rows: number; cols: number };
export type Grid = {
  cols: number[];
  /** Room around the words of every cell. */
  pad: FlowMargin;
  /** Which cell covers each place of a row; null where there is none. */
  rows: { h?: number; head: boolean; slots: (Placed | null)[] }[];
  cells: Placed[];
  /** Lines: `across[r][c]` runs above row r, `down[r][c]` left of column c. */
  across: (FlowLine | null)[][];
  down: (FlowLine | null)[][];
};

type Edge = FlowLine | null | undefined;

/** Two cells share an edge: a line wins over none, the wider line over the thinner. */
function heavier(a: Edge, b: Edge): Edge {
  if (!a) return b === undefined ? a : b;
  return b && b.width > a.width ? b : a;
}

const spanOf = (span: number | undefined, most: number) => clamp(Math.round(finite(span ?? 1)), 1, most);

/** `most`: a table wider than that is made narrower. */
export function gridOf(table: FlowTable, most = Infinity): Grid {
  const rows = table.rows.map((row) => ({ h: row.h, head: Boolean(row.head), slots: [] as (Placed | null)[] }));
  const cells: Placed[] = [];
  let width = table.cols.length;
  table.rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (rows[r].slots[c]) c += 1;
      const tall = spanOf(cell.rowSpan, rows.length - r);
      const wanted = spanOf(cell.colSpan, 1000);
      let wide = 1;
      while (wide < wanted && !rows[r].slots[c + wide]) wide += 1;
      const placed: Placed = { cell, row: r, col: c, rows: tall, cols: wide };
      cells.push(placed);
      for (let y = r; y < r + tall; y += 1) for (let x = c; x < c + wide; x += 1) rows[y].slots[x] = placed;
      c += wide;
      width = Math.max(width, c);
    }
  });
  width = Math.max(1, width);
  let heads = true;
  for (const row of rows) {
    // Only rows at the top can be repeated on the next page.
    heads = heads && row.head;
    row.head = heads;
    for (let c = 0; c < width; c += 1) row.slots[c] = row.slots[c] ?? null;
  }
  const known = table.cols.map((w) => finite(w)).filter((w) => w > 0);
  const usual = known.length > 0 ? sumCols(known) / known.length : 72;
  const cols = Array.from({ length: width }, (_, c) => Math.max(0, finite(table.cols[c])) || usual);
  const scale = Math.min(1, most / sumCols(cols));
  const pad = table.pad ?? CELL_PAD;
  const room = (points: number) => clamp(finite(points), 0, 1584);

  const across: Edge[][] = Array.from({ length: rows.length + 1 }, () => Array<Edge>(width).fill(undefined));
  const down: Edge[][] = Array.from({ length: rows.length }, () => Array<Edge>(width + 1).fill(undefined));
  for (const { cell, row, col, rows: tall, cols: wide } of cells) {
    const border = cell.border ?? {};
    for (let x = col; x < col + wide; x += 1) {
      across[row][x] = heavier(across[row][x], border.top);
      across[row + tall][x] = heavier(across[row + tall][x], border.bottom);
    }
    for (let y = row; y < row + tall; y += 1) {
      down[y][col] = heavier(down[y][col], border.left);
      down[y][col + wide] = heavier(down[y][col + wide], border.right);
    }
  }
  const usualLine = table.border ?? null;
  const slot = (r: number, c: number) => rows[r]?.slots[c] ?? null;
  const settle = (edge: Edge, a: Placed | null, b: Placed | null) =>
    a === b ? null : edge === undefined ? usualLine : edge;
  return {
    cols: cols.map((w) => w * scale),
    pad: { top: room(pad.top), right: room(pad.right), bottom: room(pad.bottom), left: room(pad.left) },
    rows,
    cells,
    across: across.map((line, r) => line.map((edge, c) => settle(edge, slot(r - 1, c), slot(r, c)))),
    down: down.map((line, r) => line.map((edge, c) => settle(edge, slot(r, c - 1), slot(r, c)))),
  };
}

export const lineKey = (line: FlowLine | null) =>
  line && line.width > 0 ? `${hex(line.color)} ${line.width} ${line.dash ?? "solid"}` : "";

/** The line along one side of a cell. None when its parts differ: the neighbours draw them then. */
export function sideOf(grid: Grid, { row, col, rows, cols }: Placed, side: Side): FlowLine | null {
  const parts: (FlowLine | null)[] = [];
  if (side === "top" || side === "bottom")
    for (let x = col; x < col + cols; x += 1) parts.push(grid.across[side === "top" ? row : row + rows][x]);
  else for (let y = row; y < row + rows; y += 1) parts.push(grid.down[y][side === "left" ? col : col + cols]);
  return parts.every((part) => lineKey(part) === lineKey(parts[0])) ? parts[0] : null;
}

export const sumCols = (cols: readonly number[], from = 0, count = cols.length) =>
  cols.slice(from, from + count).reduce((sum, w) => sum + w, 0);

/** Room around the words of a cell, when the table does not say: as Word has it. */
const CELL_PAD = { top: 0, right: 5.4, bottom: 0, left: 5.4 };

// ---------------------------------------------------------------- blocks in a row, as Word has them

export type Place = "body" | "cell" | "box" | "header" | "footer";

/** A paragraph that can still be added to. `section` is what ends it when it is the last one. */
export type WordPara = { props: string; mark: string; section: string; content: string; framed: boolean };

/** What a Word format has to be able to write. `Room` is where the words are being put. */
export type WordFormat<Room> = {
  lists: ListBook;
  /** `loose`: floating pictures of a paragraph that cannot hold them. */
  para: (para: FlowPara, room: Room, turn: boolean, framed: boolean) => { para: WordPara; loose: string };
  /** Carries drawings, breaks and section ends where there is no paragraph to do it. */
  tiny: (turn: boolean) => WordPara;
  rule: (rule: FlowRule, turn: boolean) => WordPara;
  box: (box: FlowBox, room: Room) => string;
  /** More than one when a table is too wide. */
  tables: (table: FlowTable, room: Room) => string[];
  join: (para: WordPara) => string;
};

/** Drawings wait for a paragraph to hang on, page breaks for one to start the page. */
export class WordStory<Room extends { place: Place }> {
  /** Tables are ready-made. */
  private out: (WordPara | string)[] = [];
  private waiting = "";
  private turn = false;
  /** Nothing is on the page yet. */
  private bare = true;

  constructor(
    private format: WordFormat<Room>,
    private room: Room,
  ) {}

  add(block: FlowBlock) {
    if (block.kind === "para") this.para(block);
    else if (block.kind === "table") this.table(block);
    else if (block.kind === "box") this.waiting += this.format.box(block, this.room);
    else if (block.kind === "rule") this.rule(block);
    else this.pageBreak();
  }

  private last(): WordPara | null {
    const last = this.out[this.out.length - 1];
    return typeof last === "object" ? last : null;
  }

  private push(para: WordPara) {
    if (!para.framed) {
      para.content = this.waiting + para.content;
      this.waiting = "";
      this.turn = false;
    }
    this.out.push(para);
    this.bare = false;
  }

  /** Frames belong to the page of the paragraph after them, drawings to that of the one they hang on. */
  private settle() {
    const last = this.last();
    if (this.waiting && last && !last.framed && !this.bare) {
      last.content += this.waiting;
      this.waiting = "";
    }
    if (this.waiting || last?.framed) this.push(this.format.tiny(this.turn));
  }

  private pageBreak() {
    if (this.room.place !== "body") return;
    this.settle();
    if (this.bare) this.push(this.format.tiny(this.turn));
    this.turn = true;
    this.bare = true;
  }

  private para(para: FlowPara) {
    const { format, room } = this;
    if (para.breakBefore && room.place === "body" && !this.turn && this.out.length > 0) {
      this.settle();
      this.turn = true;
      this.bare = true;
    }
    if (isLoose(para)) {
      this.waiting += format.para(para, room, false, false).para.content;
      return;
    }
    if (!para.list) format.lists.stop();
    const framed = para.frame !== undefined && room.place !== "cell" && room.place !== "box";
    // A frame stays on the page before if only the paragraph after it starts the new one.
    if (framed && this.turn) this.push(format.tiny(true));
    const made = format.para(para, room, this.turn, framed);
    this.waiting += made.loose;
    this.push(made.para);
  }

  private rule(rule: FlowRule) {
    this.format.lists.stop();
    this.push(this.format.rule(rule, this.turn));
  }

  private table(table: FlowTable) {
    this.format.lists.stop();
    if (table.rows.length === 0) return;
    this.settle();
    // Two tables in a row would become one, and a table cannot start a page by itself.
    if (this.turn || typeof this.out[this.out.length - 1] === "string") this.push(this.format.tiny(this.turn));
    this.format.tables(table, this.room).forEach((one, i) => {
      if (i > 0) this.push(this.format.tiny(false));
      this.out.push(one);
    });
    this.bare = false;
  }

  /** Everything so far. `section` ends the last paragraph. */
  end(section = ""): string {
    this.settle();
    if (this.turn || !this.last()) this.push(this.format.tiny(this.turn));
    const last = this.last();
    if (last) last.section = section;
    this.format.lists.stop();
    return this.out.map((one) => (typeof one === "string" ? one : this.format.join(one))).join("");
  }
}

// ---------------------------------------------------------------- pictures

export type Picture = {
  bytes: Uint8Array;
  type: "png" | "jpeg" | "gif";
  /** In pixels. */
  w: number;
  h: number;
};

/** One clear pixel: keeps the room of a picture that cannot be read. */
const CLEAR = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
const clearPicture = (): Picture => {
  const bytes = Uint8Array.from(atob(CLEAR), (sign) => sign.charCodeAt(0));
  return { bytes, type: "png", w: 1, h: 1 };
};

/** What a file really is: the name it came with may be wrong. */
function typeOf(bytes: Uint8Array): Picture["type"] | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  return null;
}

/** Size in pixels and, for photos, the turn the camera noted. Null when the file does not say. */
function measure(bytes: Uint8Array, type: Picture["type"]): { w: number; h: number; turn: number } | null {
  if (bytes.length < 32) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "png") return { w: view.getUint32(16), h: view.getUint32(20), turn: 1 };
  if (type === "gif") return { w: view.getUint16(6, true), h: view.getUint16(8, true), turn: 1 };
  let turn = 1;
  let at = 2;
  while (at + 9 < view.byteLength && view.getUint8(at) === 0xff) {
    const marker = view.getUint8(at + 1);
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { w: view.getUint16(at + 7), h: view.getUint16(at + 5), turn };
    if (marker === 0xe1 && at + 18 < view.byteLength && view.getUint32(at + 4) === 0x45786966) {
      const tiff = at + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const list = tiff + view.getUint32(tiff + 4, little);
      const count = list + 2 <= view.byteLength ? view.getUint16(list, little) : 0;
      for (let i = 0; i < count && list + 14 + i * 12 <= view.byteLength; i += 1)
        if (view.getUint16(list + 2 + i * 12, little) === 0x0112) turn = view.getUint16(list + 10 + i * 12, little);
    }
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}

type Drawable = { draw: CanvasImageSource; w: number; h: number };

const isDrawing = (image: FlowImage) => /svg/i.test(image.mime);

async function decode(image: FlowImage): Promise<Drawable> {
  const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
  if (!isDrawing(image)) {
    try {
      const bitmap = await createImageBitmap(blob);
      return { draw: bitmap, w: bitmap.width, h: bitmap.height };
    } catch {
      // HEIC, TIFF and the like go through the image tools' own readers below.
    }
  }
  const { loadImageFile } = await import("@/lib/image/encode");
  const element = await loadImageFile(new File([blob], "picture", { type: image.mime }));
  return { draw: element, w: element.naturalWidth || image.w, h: element.naturalHeight || image.h };
}

async function encode(canvas: HTMLCanvasElement, type: "png" | "jpeg"): Promise<Picture> {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, `image/${type}`, 0.93));
  if (!blob) throw new Error("no picture");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type, w: canvas.width, h: canvas.height };
}

/** The room a turned picture takes. */
export function turnedSize(w: number, h: number, angle: number | undefined): { w: number; h: number } {
  const rad = (finite(angle) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { w: w * cos + h * sin, h: w * sin + h * cos };
}

export const isTurned = (image: FlowImage) => Math.abs(finite(image.angle) % 360) > 0.05;

/** The part that shows, when it is not all of it. */
export function cropOf(image: FlowImage): NonNullable<FlowImage["crop"]> | null {
  const crop = image.crop;
  if (!crop || !(crop.w > 0) || !(crop.h > 0)) return null;
  return crop.x > 0.0005 || crop.y > 0.0005 || crop.w < 0.9995 || crop.h < 0.9995 ? crop : null;
}

/** Draws a picture anew; with `bake` only the part that shows, turned as asked. */
async function redraw(image: FlowImage, type: Picture["type"] | null, bake: boolean): Promise<Picture> {
  const source = await decode(image);
  const crop = (bake && cropOf(image)) || { x: 0, y: 0, w: 1, h: 1 };
  // A drawing has no pixels of its own: it gets enough of them for print.
  const sharp = isDrawing(image) ? Math.max(1, (image.w * 3) / (source.w * crop.w)) : 1;
  const part = { w: source.w * crop.w * sharp, h: source.h * crop.h * sharp };
  const turn = bake && isTurned(image);
  // The page may stretch its pixels: a turn has to happen in the proportions of the page.
  const wide = turn ? Math.max(part.w, (part.h * image.w) / (image.h || 1)) : part.w;
  const high = turn ? (wide * image.h) / (image.w || 1) : part.h;
  const size = turn ? turnedSize(wide, high, image.angle) : { w: wide, h: high };
  // A turned photo has to be a PNG, which grows large: it gets the pixels a printer can show and no more.
  const enough = turn ? (image.w * 300) / 72 / wide : 1;
  const scale = Math.min(1, enough, 4096 / Math.max(size.w, size.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(size.w * scale));
  canvas.height = Math.max(1, Math.round(size.h * scale));
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("no canvas");
  pen.imageSmoothingQuality = "high";
  pen.translate(canvas.width / 2, canvas.height / 2);
  if (turn) pen.rotate((finite(image.angle) * Math.PI) / 180);
  const [w, h] = [wide * scale, high * scale];
  pen.beginPath();
  pen.rect(-w / 2, -h / 2, w, h);
  pen.clip();
  // The whole picture, so large that the part that shows fills the room; the rest is clipped off.
  const [allW, allH] = [w / crop.w, h / crop.h];
  pen.drawImage(source.draw, -w / 2 - crop.x * allW, -h / 2 - crop.y * allH, allW, allH);
  if (source.draw instanceof ImageBitmap) source.draw.close();
  return encode(canvas, type === "jpeg" && !turn ? "jpeg" : "png");
}

/** The pictures of a document, ready to be written. One that is used twice is made once. */
export class Pictures {
  private made = new Map<FlowImage, Picture>();

  /** `gif`: the format can hold them. `bake`: it cannot crop or turn pictures itself. */
  constructor(private how: { gif: boolean; bake: boolean }) {}

  async load(doc: FlowDoc) {
    const images = new Set<FlowImage>();
    eachDocPara(doc, (para) => para.runs.forEach((run) => run.image && images.add(run.image)));
    const known = new Map<Uint8Array, Map<string, Picture>>();
    for (const image of images) {
      const key = this.how.bake ? JSON.stringify([image.crop, image.angle, image.w, image.h]) : "";
      const others = known.get(image.bytes) ?? new Map<string, Picture>();
      const picture = others.get(key) ?? (await this.read(image));
      known.set(image.bytes, others.set(key, picture));
      this.made.set(image, picture);
    }
  }

  private async read(image: FlowImage): Promise<Picture> {
    try {
      const type = typeOf(image.bytes);
      const bake = this.how.bake && (cropOf(image) !== null || isTurned(image));
      const size = type && !bake && (type !== "gif" || this.how.gif) ? measure(image.bytes, type) : null;
      // Office shows photos as they lie in the file, whichever way up that is.
      if (type && size && size.turn === 1) return { bytes: image.bytes, type, w: size.w, h: size.h };
      return await redraw(image, type, this.how.bake);
    } catch {
      return clearPicture();
    }
  }

  get(image: FlowImage): Picture {
    return this.made.get(image) ?? clearPicture();
  }
}

/** Pictures inside a zip, each there once however often it is used. */
export class MediaFolder {
  readonly files: { name: string; picture: Picture }[] = [];
  private names = new Map<Uint8Array, string>();

  name(picture: Picture): string {
    const known = this.names.get(picture.bytes);
    if (known) return known;
    const twin = this.files.find(
      ({ picture: other }) =>
        other.bytes.length === picture.bytes.length && other.bytes.every((byte, i) => byte === picture.bytes[i]),
    );
    const name = twin?.name ?? `image${this.files.length + 1}.${picture.type}`;
    if (!twin) this.files.push({ name, picture });
    this.names.set(picture.bytes, name);
    return name;
  }
}

// ---------------------------------------------------------------- shapes

/** Every ready-made shape Office has. Any other name makes Word refuse the file. */
const PRESETS = new Set(
  (
    "line lineInv triangle rtTriangle rect diamond parallelogram trapezoid nonIsoscelesTrapezoid pentagon hexagon " +
    "heptagon octagon decagon dodecagon star4 star5 star6 star7 star8 star10 star12 star16 star24 star32 roundRect " +
    "round1Rect round2SameRect round2DiagRect snipRoundRect snip1Rect snip2SameRect snip2DiagRect plaque ellipse " +
    "teardrop homePlate chevron pieWedge pie blockArc donut noSmoking rightArrow leftArrow upArrow downArrow " +
    "stripedRightArrow notchedRightArrow bentUpArrow leftRightArrow upDownArrow leftUpArrow leftRightUpArrow " +
    "quadArrow leftArrowCallout rightArrowCallout upArrowCallout downArrowCallout leftRightArrowCallout " +
    "upDownArrowCallout quadArrowCallout bentArrow uturnArrow circularArrow leftCircularArrow " +
    "leftRightCircularArrow curvedRightArrow curvedLeftArrow curvedUpArrow curvedDownArrow swooshArrow cube can " +
    "lightningBolt heart sun moon smileyFace irregularSeal1 irregularSeal2 foldedCorner bevel frame halfFrame " +
    "corner diagStripe chord arc leftBracket rightBracket leftBrace rightBrace bracketPair bracePair " +
    "straightConnector1 bentConnector2 bentConnector3 bentConnector4 bentConnector5 curvedConnector2 " +
    "curvedConnector3 curvedConnector4 curvedConnector5 callout1 callout2 callout3 accentCallout1 accentCallout2 " +
    "accentCallout3 borderCallout1 borderCallout2 borderCallout3 accentBorderCallout1 accentBorderCallout2 " +
    "accentBorderCallout3 wedgeRectCallout wedgeRoundRectCallout wedgeEllipseCallout cloudCallout cloud ribbon " +
    "ribbon2 ellipseRibbon ellipseRibbon2 leftRightRibbon verticalScroll horizontalScroll wave doubleWave plus " +
    "flowChartProcess flowChartDecision flowChartInputOutput flowChartPredefinedProcess flowChartInternalStorage " +
    "flowChartDocument flowChartMultidocument flowChartTerminator flowChartPreparation flowChartManualInput " +
    "flowChartManualOperation flowChartConnector flowChartPunchedCard flowChartPunchedTape " +
    "flowChartSummingJunction flowChartOr flowChartCollate flowChartSort flowChartExtract flowChartMerge " +
    "flowChartOfflineStorage flowChartOnlineStorage flowChartMagneticTape flowChartMagneticDisk " +
    "flowChartMagneticDrum flowChartDisplay flowChartDelay flowChartAlternateProcess flowChartOffpageConnector " +
    "actionButtonBlank actionButtonHome actionButtonHelp actionButtonInformation actionButtonForwardNext " +
    "actionButtonBackPrevious actionButtonEnd actionButtonBeginning actionButtonReturn actionButtonDocument " +
    "actionButtonSound actionButtonMovie gear6 gear9 funnel mathPlus mathMinus mathMultiply mathDivide mathEqual " +
    "mathNotEqual cornerTabs squareTabs plaqueTabs chartX chartStar chartPlus"
  ).split(" "),
);

/** The editor's own marks under Office's names. "check" and "cross" have none. */
const MARKS: Record<string, string> = { whiteout: "rect", redact: "rect", dot: "ellipse", arrow: "straightConnector1" };

export function shapeName(shape: string | undefined): string {
  const name = MARKS[shape ?? "rect"] ?? shape ?? "rect";
  return PRESETS.has(name) || name === "check" || name === "cross" ? name : "rect";
}

/** Lines have two ends and nothing inside. */
export const isLineShape = (name: string) => /^(line|lineInv)$|Connector\d$/.test(name);
export const isOpenShape = (name: string) => isLineShape(name) || name === "check" || name === "cross";

export function boxFill(box: FlowBox): string | null {
  if (isOpenShape(shapeName(box.shape))) return null;
  return hex(box.fill) ?? (box.shape === "whiteout" ? "FFFFFF" : box.shape === "redact" ? "000000" : null);
}

export const boxLine = (box: FlowBox): FlowLine | null => (box.stroke && box.stroke.width > 0 ? box.stroke : null);

/** Lies under the words unless it is there to cover them, holds words itself, or lets them through anyway. */
export const isBehind = (box: FlowBox) =>
  boxFill(box) !== null && !hasWords(box.blocks) && box.shape !== "whiteout" && box.shape !== "redact";

const strokes = (...xy: number[]): Cmd[] =>
  Array.from({ length: xy.length / 2 }, (_, i): Cmd => [i === 0 ? "M" : "L", xy[i * 2], xy[i * 2 + 1]]);

/** What a shape is drawn with, from the corner of its box. */
export function shapeParts(shape: string | undefined, w: number, h: number): ShapePart[] {
  const name = shapeName(shape);
  if (name === "check")
    return [{ path: strokes(w * 0.06, h * 0.55, w * 0.37, h * 0.88, w * 0.94, h * 0.12), paint: "stroke" }];
  if (name === "cross") {
    const path = [...strokes(w * 0.1, h * 0.1, w * 0.9, h * 0.9), ...strokes(w * 0.9, h * 0.1, w * 0.1, h * 0.9)];
    return [{ path, paint: "stroke" }];
  }
  if (name === "lineInv") return [{ path: strokes(0, h, w, 0), paint: "stroke" }];
  if (isLineShape(name)) return [{ path: strokes(0, 0, w, h), paint: "stroke" }];
  const def = shapeDef(name);
  if (def && w > 0 && h > 0) return def.parts(w, h, adjOf(def));
  return [{ path: [...strokes(0, 0, w, 0, w, h, 0, h), ["Z"]], paint: "both" }];
}

/** Room for the words of a shape. */
export function shapeRoom(box: FlowBox): Box {
  const def = shapeDef(shapeName(box.shape));
  if (!def || !(box.w > 0) || !(box.h > 0)) return { x: 0, y: 0, w: box.w, h: box.h };
  return def.text(box.w, box.h, adjOf(def));
}

/** Space between the edge of a box and its words: as in the editor, or less where they would not fit. */
export function boxPad(box: FlowBox, usual: number): { x: number; y: number } {
  if (boxFill(box) === null && !boxLine(box)) return { x: 0, y: 0 };
  const room = shapeRoom(box);
  const fits = (x: number, y: number) => roughHeight(box.blocks, room.w - x * 2, usual) <= room.h - y * 2;
  if (fits(5, 4)) return { x: 5, y: 4 };
  return fits(3, 2) ? { x: 3, y: 2 } : { x: Math.min(2, room.w * 0.05), y: Math.min(1, room.h * 0.05) };
}

/** Do the words need more room than the box has? */
export const isCramped = (box: FlowBox, pad: { x: number; y: number }, usual: number) =>
  roughHeight(box.blocks, shapeRoom(box).w - pad.x * 2, usual) > shapeRoom(box).h - pad.y * 2;
