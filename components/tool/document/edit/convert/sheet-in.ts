import {
  ConvertError,
  type FlowAlign,
  type FlowBlock,
  type FlowCell,
  type FlowDoc,
  type FlowLine,
  type FlowPara,
  type FlowRun,
  type FlowSection,
  type FlowStyle,
  type FlowTable,
} from "./flow";
import {
  at,
  blend,
  channels,
  dig,
  find,
  fromChannels,
  joinRuns,
  kid,
  kids,
  lengthOf,
  LOCKED,
  openPack,
  outsideLink,
  parseXml,
  resolvePath,
  runsText,
  type Pack,
} from "./xml";

/**
 * Opens workbooks (.xlsx, .ods) and delimited text. Every sheet that shows
 * becomes a table on pages of its own, with the words Excel would show in it.
 */

// ---------------------------------------------------------------- a sheet, whatever file it came from

type Side = "top" | "right" | "bottom" | "left";
const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

type Cell = {
  runs: FlowRun[];
  align?: FlowAlign;
  valign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  indent?: number;
  fill?: string;
  border?: Partial<Record<Side, FlowLine>>;
  cols?: number;
  rows?: number;
  /** A number or a date: never broken over two lines. */
  solid?: boolean;
  /** Stands in the middle of the empty cells after it. */
  across?: boolean;
};

type Sheet = {
  name: string;
  /** Only what shows: hidden rows and columns are gone. Widths and heights are points. */
  cols: number[];
  /** Null: covered by a cell that spans. */
  rows: { h: number; cells: (Cell | null | undefined)[] }[];
  /** Rows repeated on every page, columns repeated when a wide sheet is split. */
  head: number;
  key: number;
  /** Grid lines: printed, only there on screen, or not at all. */
  lines: "print" | "screen" | "none";
  /** Rows there was no room for. */
  more: number;
};

const MAX_ROWS = 4000;
const MAX_COLS = 1000;
/** Rows and columns with nothing but looks are kept up to here after the last words. */
const BARE_ROWS = 60;
const BARE_COLS = 12;

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 36;
/** Letters smaller than this share of their size are too small to read; rather the sheet is split. */
const MIN_SCALE = 0.6;
const SPLIT_SCALE = 0.75;

const PAD = { top: 0.75, right: 1.75, bottom: 0.75, left: 1.75 };
const GRID: FlowLine = { color: "#d0d0d0", width: 0.5 };

const neat = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

let ruler: CanvasRenderingContext2D | null = null;
let rulerFont = "";

function widthOf(runs: readonly FlowRun[]): number {
  ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return 0;
  const lines = [0];
  for (const { text, style } of runs) {
    if (text === undefined) continue;
    const family = (style?.font ?? "Arial").replace(/^lib:/, "fb-");
    const font = `${style?.italic ? "italic " : ""}${style?.bold ? "bold " : ""}${style?.size ?? 11}px "${family}", Carlito, Arial, sans-serif`;
    if (font !== rulerFont) ruler.font = rulerFont = font;
    text.split("\n").forEach((line, i) => {
      if (i > 0) lines.push(0);
      lines[lines.length - 1] += ruler?.measureText(line).width ?? 0;
    });
  }
  return Math.max(...lines);
}

const hasWords = (cell: Cell | null | undefined) => Boolean(cell?.runs.some((run) => run.text));
const hasLooks = (cell: Cell | null | undefined) =>
  Boolean(cell?.fill || (cell?.border && Object.keys(cell.border).length > 0));

/** Cuts off what is empty at the end. Null when there is nothing in the sheet at all. */
function trimmed(sheet: Sheet): Sheet | null {
  let lastRow = -1;
  let lastCol = -1;
  let bareRow = -1;
  let bareCol = -1;
  sheet.rows.forEach(({ cells }, r) =>
    cells.forEach((cell, c) => {
      if (!cell) return;
      const right = c + (cell.cols ?? 1) - 1;
      const low = r + (cell.rows ?? 1) - 1;
      if (hasWords(cell)) {
        lastRow = Math.max(lastRow, low);
        lastCol = Math.max(lastCol, right);
      } else if (hasLooks(cell)) {
        bareRow = Math.max(bareRow, low);
        bareCol = Math.max(bareCol, right);
      }
    }),
  );
  if (lastRow < 0 && bareRow < 0) return null;
  const rows = Math.min(sheet.rows.length, Math.max(lastRow, Math.min(bareRow, lastRow + BARE_ROWS)) + 1);
  const cols = Math.min(sheet.cols.length, Math.max(lastCol, Math.min(bareCol, lastCol + BARE_COLS)) + 1);
  return {
    ...sheet,
    cols: sheet.cols.slice(0, cols),
    rows: sheet.rows.slice(0, rows).map((row) => ({ ...row, cells: row.cells.slice(0, cols) })),
  };
}

/** The width a cell's words need. */
const needOf = (cell: Cell) => widthOf(cell.runs) + PAD.left + PAD.right + (cell.indent ?? 0) + 0.5;

/** Numbers are never broken, so their columns are at least that wide. */
function widened({ cols, rows }: Sheet): number[] {
  const out = [...cols];
  for (const { cells } of rows)
    cells.forEach((cell, c) => {
      if (!cell || (cell.cols ?? 1) > 1 || !hasWords(cell)) return;
      const need = needOf(cell);
      // Words that fit but for a hair do so in Excel: its letters are a little narrower.
      if (cell.solid || need < cols[c] * (cell.wrap ? 1.03 : 1.1) + 2) out[c] = Math.max(out[c], need);
    });
  return out;
}

/** Words that do not fit run on over the empty cells next to them, as they do in Excel. */
function spill(sheet: Sheet, cols: readonly number[]) {
  for (const { cells } of sheet.rows) {
    for (let c = 0; c < cols.length; c += 1) {
      const cell = cells[c];
      if (!cell || cell.solid || (cell.cols ?? 1) > 1 || (cell.rows ?? 1) > 1 || !hasWords(cell)) continue;
      const free = (i: number) => {
        const next = i < 0 || i >= cols.length ? null : cells[i];
        if (next === null) return false;
        return !next
          ? !cell.fill
          : !hasWords(next) && (next.cols ?? 1) * (next.rows ?? 1) === 1 && next.fill === cell.fill;
      };
      /** A line between two cells keeps words in. */
      const open = (i: number) => !cells[i]?.border?.right && !cells[i + 1]?.border?.left;
      let start = c;
      let end = c;
      if (cell.across) while (free(end + 1) && cells[end + 1]?.across) end += 1;
      else if (!cell.wrap) {
        const need = needOf(cell);
        const align = cell.align ?? "left";
        const fits = () => sum(cols.slice(start, end + 1)) >= need;
        const goRight = () => align !== "right" && !fits() && free(end + 1) && open(end);
        const goLeft = () => align !== "left" && !fits() && free(start - 1) && open(start - 1);
        // What is in the middle has to stay there.
        if (align === "center")
          while (goRight() && goLeft()) {
            start -= 1;
            end += 1;
          }
        else if (align === "right") while (goLeft()) start -= 1;
        else while (goRight()) end += 1;
      }
      if (start === end) continue;
      const left = cells[start]?.border?.left;
      const right = cells[end]?.border?.right;
      const border = { ...cell.border, ...(left ? { left } : {}), ...(right ? { right } : {}) };
      for (let i = start; i <= end; i += 1) cells[i] = null;
      cells[start] = { ...cell, cols: end - start + 1, border };
      c = end;
    }
  }
}

/** Columns that go on one page together. */
function groupsOf(cols: readonly number[], key: number, room: number): number[][] {
  const all = cols.map((_, c) => c);
  if (sum(cols) <= room / MIN_SCALE) return [all];
  const keep = all.slice(0, key);
  const kept = sum(keep.map((c) => cols[c]));
  const most = room / SPLIT_SCALE - kept;
  const rest = all.slice(key);
  const pages = Math.max(1, Math.ceil(sum(rest.map((c) => cols[c])) / most));
  const fair = sum(rest.map((c) => cols[c])) / pages;
  const out: number[][] = [];
  let group: number[] = [];
  let width = 0;
  for (const c of rest) {
    if (group.length > 0 && (width + cols[c] > most || width + cols[c] / 2 > fair)) {
      out.push([...keep, ...group]);
      group = [];
      width = 0;
    }
    group.push(c);
    width += cols[c];
  }
  out.push([...keep, ...group]);
  return out;
}

const scaled = (runs: readonly FlowRun[], scale: number): FlowRun[] =>
  runs.map((run) =>
    run.text === undefined
      ? run
      : { text: run.text, style: { ...run.style, size: neat((run.style.size ?? 11) * scale) } },
  );

function paraOf(cell: Cell | null | undefined, scale: number): FlowPara {
  const runs =
    cell && cell.runs.length > 0 ? scaled(cell.runs, scale) : [{ text: "", style: { size: neat(8 * scale) } }];
  const para: FlowPara = { kind: "para", runs, line: { times: 1 } };
  if (cell?.across) para.align = "center";
  else if (cell?.align && cell.align !== "left") para.align = cell.align;
  if (cell?.indent && cell.align === "right") para.right = neat(cell.indent * scale);
  else if (cell?.indent) para.left = neat(cell.indent * scale);
  return para;
}

type Owner = { cell: Cell | null | undefined; r: number; c: number };

function tableOf(
  sheet: Sheet,
  cols: readonly number[],
  group: readonly number[],
  scale: number,
  lines: boolean,
): FlowTable {
  const count = sheet.rows.length;
  const owners: Owner[][] = sheet.rows.map(() => []);
  sheet.rows.forEach(({ cells }, r) => {
    for (let c = 0; c < cols.length; c += 1) {
      const cell = cells[c];
      if (owners[r][c]) continue;
      const owner = { cell, r, c };
      const tall = Math.min(cell?.rows ?? 1, count - r);
      const wide = Math.min(cell?.cols ?? 1, cols.length - c);
      for (let i = r; i < r + tall; i += 1) for (let k = c; k < c + wide; k += 1) owners[i][k] ??= owner;
    }
  });
  const rows = sheet.rows.map(({ h }, r) => {
    const cells: FlowCell[] = [];
    for (let i = 0; i < group.length;) {
      const owner = owners[r][group[i]];
      let wide = 1;
      while (i + wide < group.length && owners[r][group[i + wide]] === owner && owner.cell) wide += 1;
      if (owner.r === r) {
        const { cell } = owner;
        // Of a cell cut in two by the split, the words are in the first part.
        const starts = group[i] === owner.c;
        const tall = Math.min(cell?.rows ?? 1, count - r);
        const out: FlowCell = { blocks: [paraOf(starts ? cell : null, scale)], valign: cell?.valign ?? "bottom" };
        if (wide > 1) out.colSpan = wide;
        if (tall > 1) out.rowSpan = tall;
        if (cell?.fill) out.fill = cell.fill;
        if (cell?.border && Object.keys(cell.border).length > 0) out.border = { ...cell.border };
        cells.push(out);
      }
      i += wide;
    }
    return { cells, h: neat(h * scale), ...(r < sheet.head ? { head: true } : {}) };
  });
  if (sheet.more > 0) {
    const text = `... and ${sheet.more.toLocaleString("en")} more rows`;
    const note: FlowPara = {
      kind: "para",
      runs: [{ text, style: { size: neat(10 * scale), italic: true, color: "#666666" } }],
    };
    rows.push({
      cells: [{ blocks: [note], ...(group.length > 1 ? { colSpan: group.length } : {}) }],
      h: neat(18 * scale),
    });
  }
  const side = (value: number) => neat(value * scale);
  return {
    kind: "table",
    cols: group.map((c) => neat(cols[c] * scale)),
    rows,
    border: lines ? { ...GRID } : null,
    pad: { top: side(PAD.top), right: side(PAD.right), bottom: side(PAD.bottom), left: side(PAD.left) },
  };
}

function sectionOf(sheet: Sheet, titled: boolean): FlowSection {
  let cols = widened(sheet);
  const upright = PAGE.w - MARGIN * 2;
  const flat = PAGE.h - MARGIN * 2;
  // A hair too wide is no reason to turn the page.
  const wide = sum(cols) > upright * 1.05;
  const room = wide ? flat : upright;
  // One endless column must not make all the others too small to read.
  cols = cols.map((width) => Math.min(width, room / SPLIT_SCALE));
  spill(sheet, cols);
  const groups = groupsOf(cols, sheet.key, room);
  const scale = Math.min(1, ...groups.map((group) => room / sum(group.map((c) => cols[c]))));
  // A sheet without any looks of its own is easier to read with the lines it has on screen.
  const plain = !sheet.rows.some(({ cells }) => cells.some(hasLooks));
  const blocks: FlowBlock[] = [];
  if (titled) {
    const name: FlowRun = { text: sheet.name, style: { size: 14, bold: true } };
    blocks.push({ kind: "para", runs: [name], heading: 2, after: 6, keepNext: true });
  }
  groups.forEach((group, i) => {
    if (i > 0) blocks.push({ kind: "break" });
    blocks.push(tableOf(sheet, cols, group, scale, sheet.lines === "print" || (sheet.lines === "screen" && plain)));
  });
  const margin = { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN };
  return { w: wide ? PAGE.h : PAGE.w, h: wide ? PAGE.w : PAGE.h, margin, blocks };
}

function docOf(sheets: readonly Sheet[]): FlowDoc {
  const full = sheets.map(trimmed).filter((sheet): sheet is Sheet => sheet !== null);
  if (full.length === 0) throw new ConvertError("There is nothing in this spreadsheet.");
  return { kind: "flow", sections: full.map((sheet) => sectionOf(sheet, full.length > 1)) };
}

/** Takes out the rows and columns that do not show. Spans lose as many. */
function visible(
  rows: readonly { h: number; hidden: boolean; cells: readonly (Cell | null | undefined)[] }[],
  cols: readonly { w: number; hidden: boolean }[],
): Pick<Sheet, "rows" | "cols"> {
  const shownCols = cols.flatMap((col, c) => (col.hidden ? [] : [c]));
  const shownRows = rows.flatMap((row, r) => (row.hidden ? [] : [r]));
  const colAt = new Map(shownCols.map((c, i) => [c, i]));
  const rowAt = new Map(shownRows.map((r, i) => [r, i]));
  const out = shownRows.map((r) => ({
    h: rows[r].h,
    cells: shownCols.map((c): Cell | null | undefined => rows[r].cells[c]),
  }));
  rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (!cell || ((cell.cols ?? 1) === 1 && (cell.rows ?? 1) === 1)) return;
      const inRows = Array.from({ length: cell.rows ?? 1 }, (_, i) => rowAt.get(r + i)).filter((i) => i !== undefined);
      const inCols = Array.from({ length: cell.cols ?? 1 }, (_, i) => colAt.get(c + i)).filter((i) => i !== undefined);
      if (inRows.length === 0 || inCols.length === 0) return;
      // The corner that holds the words may itself be hidden; the cell then starts at the first that shows.
      out[inRows[0]].cells[inCols[0]] = { ...cell, rows: inRows.length, cols: inCols.length };
    }),
  );
  return { rows: out, cols: shownCols.map((c) => cols[c].w) };
}

// ---------------------------------------------------------------- numbers as Excel shows them

type Part =
  | { kind: "text"; text: string }
  | { kind: "digit"; sign: string }
  | { kind: "point" | "comma" | "percent" | "slash" | "at" | "general" }
  | { kind: "power"; plus: boolean }
  | { kind: "date" | "elapsed" | "half"; text: string };

type Format = {
  parts: Part[];
  color?: string;
  test?: (value: number) => boolean;
  locale?: string;
  /** Windows' own long date or time. */
  system?: "date" | "time";
  isDate: boolean;
};

const COLORS: Record<string, string> = {
  black: "#000000",
  blue: "#0000ff",
  cyan: "#00ffff",
  green: "#00ff00",
  magenta: "#ff00ff",
  red: "#ff0000",
  white: "#ffffff",
  yellow: "#ffff00",
};

/** Excel's old palette, in which colours have numbers. */
const PALETTE =
  "000000ffffffff000000ff000000ffffff00ff00ff00ffff800000008000000080808000800080008080c0c0c08080809999ff993366ffffcc" +
  "ccffff660066ff80800066ccccccff000080ff00ffffff0000ffff8000808000000080800000ff00ccffccffffccffccffff9999ccffff99cc" +
  "cc99ffffcc993366ff33cccc99cc00ffcc00ff9900ff6600666699969696003366339966003300333300993300993366333399333333";
const paletteColor = (index: number) => {
  const hex = PALETTE.slice(index * 6, index * 6 + 6);
  return hex.length === 6 ? `#${hex}` : null;
};

/** The languages numbers stand for that turn up most. */
const LANGUAGES: Record<string, string> = {
  "404": "zh-TW",
  "405": "cs",
  "406": "da",
  "407": "de",
  "408": "el",
  "409": "en-US",
  "40a": "es",
  "40b": "fi",
  "40c": "fr",
  "40e": "hu",
  "410": "it",
  "411": "ja",
  "412": "ko",
  "413": "nl",
  "414": "nb",
  "415": "pl",
  "416": "pt-BR",
  "419": "ru",
  "41d": "sv",
  "41e": "th",
  "41f": "tr",
  "422": "uk",
  "439": "hi",
  "445": "bn",
  "446": "pa",
  "447": "gu",
  "449": "ta",
  "44a": "te",
  "44b": "kn",
  "44e": "mr",
  "804": "zh-CN",
  "807": "de-CH",
  "809": "en-GB",
  "80a": "es-MX",
  "816": "pt-PT",
  c07: "de-AT",
  c09: "en-AU",
  c0a: "es",
  c0c: "fr-CA",
  "1009": "en-CA",
  "4009": "en-IN",
};

/** Splits a format at its semicolons, leaving alone those in quotes and brackets. */
function sectionsOf(code: string): string[] {
  const out = [""];
  for (let i = 0; i < code.length; i += 1) {
    const sign = code[i];
    if (sign === ";") {
      out.push("");
      continue;
    }
    let end = i;
    if (sign === '"') end = code.indexOf('"', i + 1);
    else if (sign === "[") end = code.indexOf("]", i + 1);
    else if (sign === "\\" || sign === "_" || sign === "*") end = i + 1;
    if (end < 0) end = code.length - 1;
    out[out.length - 1] += code.slice(i, end + 1);
    i = end;
  }
  return out;
}

function bracket(word: string, format: Format) {
  const test = /^(>=|<=|<>|>|<|=)\s*([-+]?[\d.]+(?:e[-+]?\d+)?)$/i.exec(word);
  const number = /^colou?r\s*(\d+)$/i.exec(word);
  const money = /^\$([^-]*)(?:-([0-9a-f]+))?/i.exec(word);
  if (/^(h+|m+|s+)$/i.test(word)) format.parts.push({ kind: "elapsed", text: word.toLowerCase() });
  else if (COLORS[word.toLowerCase()]) format.color = COLORS[word.toLowerCase()];
  else if (number) format.color = paletteColor(Number(number[1]) - 1) ?? undefined;
  else if (test) {
    const limit = Number(test[2]);
    const tests: Record<string, (value: number) => boolean> = {
      ">=": (value) => value >= limit,
      "<=": (value) => value <= limit,
      "<>": (value) => value !== limit,
      ">": (value) => value > limit,
      "<": (value) => value < limit,
      "=": (value) => value === limit,
    };
    format.test = tests[test[1]];
  } else if (money) {
    if (money[1]) format.parts.push({ kind: "text", text: money[1] });
    const code = (money[2] ?? "").toLowerCase();
    if (code === "f800") format.system = "date";
    else if (code === "f400") format.system = "time";
    // The front of a longer code asks for other digits, which fonts may not have.
    else if (code) format.locale = LANGUAGES[code.slice(-4).replace(/^0+/, "")];
  }
}

function parseSection(code: string): Format {
  const format: Format = { parts: [], isDate: false };
  const { parts } = format;
  const say = (text: string) => parts.push({ kind: "text", text });
  for (let i = 0; i < code.length;) {
    const sign = code[i];
    const rest = code.slice(i);
    const half = /^(am\/pm|a\/p)/i.exec(rest);
    const letters = /^(y+|m+|d+|h+|s+|e+|g+|b+)/i.exec(rest);
    const power = /^e([-+])/i.exec(rest);
    if (/^general/i.test(rest)) {
      parts.push({ kind: "general" });
      i += 7;
    } else if (half) {
      parts.push({ kind: "half", text: half[0].toUpperCase() });
      i += half[0].length;
    } else if (power && parts.some((part) => part.kind === "digit")) {
      parts.push({ kind: "power", plus: power[1] === "+" });
      i += 2;
    } else if (letters) {
      parts.push({ kind: "date", text: letters[0].toLowerCase() });
      i += letters[0].length;
    } else if (sign === '"') {
      const end = code.indexOf('"', i + 1);
      say(code.slice(i + 1, end < 0 ? undefined : end));
      i = end < 0 ? code.length : end + 1;
    } else if (sign === "[") {
      const end = code.indexOf("]", i);
      if (end < 0) break;
      bracket(code.slice(i + 1, end), format);
      i = end + 1;
    } else if (sign === "\\") {
      say(code[i + 1] ?? "");
      i += 2;
    } else if (sign === "_" || sign === "*") {
      // Room as wide as a letter, or a letter that fills the cell.
      if (sign === "_" || code[i + 1] === " ") say(" ");
      i += 2;
    } else {
      if (sign === "0" || sign === "#" || sign === "?") parts.push({ kind: "digit", sign });
      else if (sign === ".") parts.push({ kind: "point" });
      else if (sign === ",") parts.push({ kind: "comma" });
      else if (sign === "%") parts.push({ kind: "percent" });
      else if (sign === "/") parts.push({ kind: "slash" });
      else if (sign === "@") parts.push({ kind: "at" });
      else say(sign);
      i += 1;
    }
  }
  format.isDate =
    format.system !== undefined ||
    parts.some(
      (part) => part.kind === "elapsed" || part.kind === "half" || (part.kind === "date" && /^[ymdhs]/.test(part.text)),
    );
  if (!format.isDate)
    format.parts = parts.map((part) => (part.kind === "date" ? { kind: "text", text: part.text } : part));
  return format;
}

const formats = new Map<string, Format[]>();
function formatsOf(code: string): Format[] {
  let list = formats.get(code);
  if (!list) formats.set(code, (list = sectionsOf(code).map(parseSection)));
  return list;
}

/** How numbers are written where the visitor is, as Excel does too. */
type Local = { tag: string; point: string; comma: string; first: number; then: number; slash: string };

let local: Local | null = null;
function here(): Local {
  if (local) return local;
  const parts = new Intl.NumberFormat(undefined, { numberingSystem: "latn" }).formatToParts(-123456789012.5);
  const groups = parts.filter((part) => part.type === "integer").map((part) => part.value.length);
  const of = (type: string, other: string) => parts.find((part) => part.type === type)?.value ?? other;
  const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "numeric", year: "numeric" });
  const between =
    date
      .formatToParts(0)
      .find((part) => part.type === "literal")
      ?.value.trim() ?? "/";
  local = {
    tag: new Intl.NumberFormat().resolvedOptions().locale,
    point: of("decimal", "."),
    comma: of("group", ","),
    first: groups.length > 1 ? groups[groups.length - 1] : 3,
    then: groups.length > 2 ? groups[groups.length - 2] : 3,
    slash: /^[/.-]$/.test(between) ? between : "/",
  };
  return local;
}

/** The 15 digits Excel counts with, and where the point stands in them: 12.5 is "125000000000000" and 2. */
function digitsOf(size: number): { digits: string; point: number } {
  if (size === 0) return { digits: "0".repeat(15), point: 1 };
  const [mantissa, power] = size.toExponential(14).split("e");
  return { digits: mantissa.replace(".", ""), point: Number(power) + 1 };
}

/** Their first few as a number, rounded the way one does by hand. */
const firstOf = (digits: string, count: number) =>
  Number(digits.slice(0, Math.max(0, count))) + (count >= 0 && digits[count] >= "5" ? 1 : 0);

/** 1.005 with two places is 1.01. */
function fixed(size: number, places: number): string {
  const { digits, point } = digitsOf(size);
  const count = point + places;
  const whole = count >= 15 ? digits + "0".repeat(count - 15) : String(firstOf(digits, count));
  const all = whole.replace(/^0+(?=.)/, "").padStart(places + 1, "0");
  return places > 0 ? `${all.slice(0, -places)}.${all.slice(-places)}` : all;
}

const trimZeros = (text: string) => (text.includes(".") ? text.replace(/\.?0+$/, "") : text);

/** A number without a format, with as many decimals as there is room for. */
function general(value: number, room = 11): string {
  const size = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const spell = (text: string) => sign + text.replace(".", here().point);
  if (size === 0) return "0";
  const most = clamp(Math.floor(room - sign.length + 0.01), 1, 11);
  const { digits, point } = digitsOf(size);
  if (point <= 11) {
    const plain = trimZeros(fixed(size, clamp(most - Math.max(1, point) - 1, 0, 9)));
    // Small numbers would lose their digits.
    if ((size >= 1e-4 && plain !== "0") || Number(plain) === Number(size.toPrecision(15))) return spell(plain);
  }
  const count = clamp(most - 5, 1, 6);
  const first = String(firstOf(digits, count));
  const power = point - 1 + (first.length > count ? 1 : 0);
  const mantissa = trimZeros(`${first[0]}.${first.slice(1)}`.replace(/\.$/, ""));
  return `${spell(mantissa)}E${power < 0 ? "-" : "+"}${String(Math.abs(power)).padStart(2, "0")}`;
}

/** Puts digits into the places a format has for them, the last into the last. */
function intoPlaces(digits: string, places: readonly string[], grouped: boolean): string[] {
  const { comma, first, then } = here();
  const boundary = (at: number) => grouped && at >= first && (at - first) % then === 0;
  return places.map((sign, i) => {
    const at = places.length - 1 - i;
    const last = digits.length - 1 - at;
    let out = "";
    // Digits there are no places for go before the first.
    for (let k = i === 0 ? 0 : last; k <= last; k += 1) {
      const own = digits[k];
      if (own !== undefined) out += own + (boundary(digits.length - 1 - k) ? comma : "");
    }
    if (out !== "") return out;
    return sign === "0" ? `0${boundary(at) ? comma : ""}` : sign === "?" ? " " : "";
  });
}

/** n / d closest to a share, with a denominator of at most `most`. */
function fraction(share: number, most: number): [number, number] {
  let [a, b, c, d] = [0, 1, 1, 0];
  let x = share;
  for (let i = 0; i < 30; i += 1) {
    const whole = Math.floor(x);
    const [n, m] = [a + whole * c, b + whole * d];
    if (m > most) break;
    [a, b, c, d] = [c, d, n, m];
    if (x - whole < 1e-10) break;
    x = 1 / (x - whole);
  }
  return d === 0 ? [Math.round(share), 1] : [c, d];
}

function writeFraction(parts: readonly Part[], slash: number, size: number): string {
  let start = slash;
  while (start > 0 && parts[start - 1].kind === "digit") start -= 1;
  let end = slash + 1;
  let below = "";
  for (; end < parts.length; end += 1) {
    const part = parts[end];
    if (part.kind === "digit") below += part.sign;
    else if (part.kind === "text" && /^\d$/.test(part.text)) below += part.text;
    else break;
  }
  const whole = parts.slice(0, start).some((part) => part.kind === "digit");
  const given = /[1-9]/.test(below) ? Number(below.replace(/\D/g, "0")) : 0;
  let int = whole ? Math.floor(size) : 0;
  const share = size - int;
  let [n, d] = given > 0 ? [Math.round(share * given), given] : fraction(share, 10 ** Math.max(1, below.length) - 1);
  if (whole && n === d) {
    int += 1;
    n = 0;
  }
  const places = parts.slice(0, start).flatMap((part) => (part.kind === "digit" ? [part.sign] : []));
  const ints = intoPlaces(int === 0 && n !== 0 ? "" : String(int), places, false);
  let used = 0;
  let out = "";
  for (const part of parts.slice(0, start)) {
    if (part.kind === "digit") out += ints[used++];
    else if (part.kind === "text") out += part.text;
  }
  if (n !== 0 || !whole) out += `${n}/${d}`;
  for (const part of parts.slice(end)) if (part.kind === "text") out += part.text;
  return out;
}

function writeNumber(parts: readonly Part[], value: number): string {
  let size = Math.abs(value);
  for (const part of parts) if (part.kind === "percent") size *= 100;
  const slash = parts.findIndex(
    (part, i) => part.kind === "slash" && parts[i - 1]?.kind === "digit" && parts[i + 1] !== undefined,
  );
  if (slash > 0) return writeFraction(parts, slash, size);

  const power = parts.findIndex((part) => part.kind === "power");
  const main = power < 0 ? parts : parts.slice(0, power);
  const point = main.findIndex((part) => part.kind === "point");
  const isDigit = (part: Part) => part.kind === "digit";
  const lastDigit = main.reduce((last, part, i) => (isDigit(part) ? i : last), -1);
  const firstDigit = main.findIndex(isDigit);
  const lastWhole = main.reduce((last, part, i) => (isDigit(part) && (point < 0 || i < point) ? i : last), -1);
  let grouped = false;
  main.forEach((part, i) => {
    if (part.kind !== "comma") return;
    // Commas between places group; after the last place they leave out thousands.
    if (i > firstDigit && i < lastWhole) grouped = true;
    else if (i > lastDigit || (i > lastWhole && (point < 0 || i < point))) size /= 1000;
  });
  const wholes = main.flatMap((part, i) => (part.kind === "digit" && (point < 0 || i < point) ? [part.sign] : []));
  const decimals = main.flatMap((part, i) => (part.kind === "digit" && point >= 0 && i > point ? [part.sign] : []));

  let exponent = 0;
  if (power >= 0 && size > 0) {
    const step = Math.max(1, wholes.length);
    exponent = Math.floor(Math.floor(Math.log10(size) + 1e-12) / step) * step;
    let mantissa = fixed(size / 10 ** exponent, decimals.length);
    if (Number(mantissa) >= 10 ** step) {
      exponent += step;
      mantissa = fixed(size / 10 ** exponent, decimals.length);
    }
    size = Number(mantissa);
  }
  const [int, dec = ""] = fixed(size, decimals.length).split(".");
  const ints = intoPlaces(int === "0" ? "" : int, wholes, grouped);
  const shown = decimals.map((sign, i) =>
    /[1-9]/.test(dec.slice(i)) || sign === "0" ? dec[i] : sign === "?" ? " " : "",
  );
  let out = "";
  let w = 0;
  let d = 0;
  main.forEach((part, i) => {
    if (part.kind === "text") out += part.text;
    else if (part.kind === "percent") out += "%";
    else if (part.kind === "slash") out += "/";
    else if (part.kind === "general" || part.kind === "at") out += general(size);
    else if (part.kind === "point")
      out += (i === point && wholes.length === 0 && int !== "0" ? int : "") + here().point;
    else if (part.kind === "digit") out += point >= 0 && i > point ? shown[d++] : ints[w++];
  });
  const raise = parts[power];
  if (raise?.kind === "power") {
    const after = parts.slice(power + 1);
    const digits = after.filter(isDigit).length;
    out += `E${exponent < 0 ? "-" : raise.plus ? "+" : ""}${String(Math.abs(exponent)).padStart(digits, "0")}`;
    for (const part of after) if (part.kind === "text") out += part.text;
  }
  return out;
}

type Moment = { y: number; m: number; d: number; weekday: number; seconds: number; days: number };

/** A day count as a date. Excel believes there was a 29 February 1900. */
function momentOf(serial: number, places: number, from1904: boolean): Moment | null {
  let days = Math.floor(serial);
  const unit = 10 ** places;
  let seconds = Math.round(Number(((serial - days) * 86400).toPrecision(12)) * unit) / unit;
  if (seconds >= 86400) {
    seconds -= 86400;
    days += 1;
  }
  const count = days + (from1904 ? 1462 : 0);
  if (count < 0 || count > 2958465) return null;
  const weekday = (count + 6) % 7;
  if (count === 60) return { y: 1900, m: 2, d: 29, weekday, seconds, days };
  if (count === 0) return { y: 1900, m: 1, d: 0, weekday, seconds, days };
  const date = new Date(Date.UTC(1899, 11, count > 60 ? 30 : 31) + count * 86400000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), weekday, seconds, days };
}

const dateOf = ({ y, m, d, seconds }: Moment) => new Date(Date.UTC(y, m - 1, d, 0, 0, Math.floor(seconds)));

const names = new Map<string, string>();
function nameOf(
  locale: string | undefined,
  kind: "month" | "weekday",
  style: "long" | "short",
  moment: Moment,
): string {
  const key = `${locale} ${kind} ${style} ${kind === "month" ? moment.m : moment.weekday}`;
  let name = names.get(key);
  if (name === undefined) {
    // 1 January 2023 was a Sunday.
    const date = new Date(
      Date.UTC(2023, kind === "month" ? moment.m - 1 : 0, kind === "month" ? 1 : 1 + moment.weekday),
    );
    const spell = new Intl.DateTimeFormat(locale ?? here().tag, { [kind]: style, timeZone: "UTC" }).format(date);
    names.set(key, (name = kind === "month" && style === "short" ? spell.replace(/^Sept$/, "Sep") : spell));
  }
  return name;
}

const pad = (value: number, length: number) => String(Math.floor(value)).padStart(length, "0");

function writeDate(format: Format, serial: number, from1904: boolean): string {
  const { parts, locale } = format;
  let places = 0;
  parts.forEach((part, i) => {
    if (part.kind !== "point") return;
    let n = 0;
    while (parts[i + 1 + n]?.kind === "digit") n += 1;
    places = Math.max(places, n);
  });
  const moment = momentOf(serial, places, from1904);
  if (!moment) return "########";
  const { y, m, d, seconds } = moment;
  if (format.system) {
    const style = format.system === "date" ? { dateStyle: "full" as const } : { timeStyle: "medium" as const };
    return new Intl.DateTimeFormat(here().tag, { ...style, timeZone: "UTC" }).format(dateOf(moment));
  }
  const half = parts.some((part) => part.kind === "half");
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor(seconds / 60) % 60;
  const inUnits = (unit: number) => Math.floor((moment.days * 86400 + seconds) / unit + 1e-9);
  const clock = parts.map((part) => (part.kind === "date" || part.kind === "elapsed" ? part.text[0] : ""));
  let out = "";
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    switch (part.kind) {
      case "text":
        out += part.text;
        break;
      case "slash":
        out += here().slash;
        break;
      case "comma":
        out += ",";
        break;
      case "percent":
        out += "%";
        break;
      case "half":
        out += part.text === "A/P" ? (hour < 12 ? "A" : "P") : hour < 12 ? "AM" : "PM";
        break;
      case "point": {
        let n = 0;
        while (parts[i + 1 + n]?.kind === "digit") n += 1;
        out += n > 0 ? here().point + pad(Math.round((seconds % 1) * 10 ** n) % 10 ** n, n) : ".";
        i += n;
        break;
      }
      case "elapsed": {
        const unit = part.text[0] === "h" ? 3600 : part.text[0] === "m" ? 60 : 1;
        out += pad(inUnits(unit), part.text.length);
        break;
      }
      case "date": {
        const { text } = part;
        const n = text.length;
        if (text[0] === "y" || text[0] === "e") out += n > 2 || text[0] === "e" ? pad(y, 4) : pad(y % 100, 2);
        else if (text[0] === "d")
          out += n > 2 ? nameOf(locale, "weekday", n === 3 ? "short" : "long", moment) : pad(d, n);
        else if (text[0] === "h") out += pad(half ? hour % 12 || 12 : hour, Math.min(2, n));
        else if (text[0] === "s") out += pad(seconds % 60, Math.min(2, n));
        else if (text[0] === "m") {
          const before = clock.slice(0, i).filter(Boolean).pop();
          const after = clock.slice(i + 1).find(Boolean);
          // Minutes after hours and before seconds, months everywhere else.
          if (n <= 2 && (before === "h" || after === "s")) out += pad(minute, n);
          else if (n <= 2) out += pad(m, n);
          else {
            const name = nameOf(locale, "month", n === 3 ? "short" : "long", moment);
            out += n === 5 ? name.slice(0, 1) : name;
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

type Written = { text: string; color?: string };

/** A value in a format. `room` is how many letters a number without a format may take. */
function writeValue(value: number, code: string, from1904: boolean, room: number): Written {
  if (/^general$/i.test(code) || code === "") return { text: general(value, room) };
  const all = formatsOf(code);
  const list = all.length > 1 && all[all.length - 1].parts.some((part) => part.kind === "at") ? all.slice(0, -1) : all;
  let chosen = list[0];
  let signed = value < 0;
  if (list.some((format) => format.test)) {
    const fits = list.slice(0, 2).find((format) => format.test?.(value));
    const rest = list[0].test && list[1]?.test ? list[2] : list[1];
    chosen = fits ?? rest ?? list[0];
    if (!fits && !rest) return { text: "########" };
    // A section for negative numbers alone says itself how they look.
    if (fits?.test && !fits.test(Math.abs(value)) && !fits.test(0)) signed = false;
    if (!fits && list.length === 2 && value < 0) signed = true;
  } else if (value < 0 && list.length > 1) {
    chosen = list[1];
    signed = false;
  } else if (value === 0 && list.length > 2) chosen = list[2];
  if (chosen.isDate) return { text: value < 0 ? "########" : writeDate(chosen, value, from1904), color: chosen.color };
  const text = writeNumber(chosen.parts, value);
  // What rounds to nothing has no sign.
  const counts = chosen.parts.some((part) => part.kind === "digit" || part.kind === "general");
  const minus = signed && (!counts || /[1-9]/.test(text)) ? "-" : "";
  return { text: minus + text, color: chosen.color };
}

/** The words of a cell in a format that has something to say about words. */
function writeText(text: string, code: string): string {
  const all = formatsOf(code);
  const last = all[all.length - 1];
  const own = all.length === 4 || last.parts.some((part) => part.kind === "at") ? last : null;
  if (!own || /^general$/i.test(code)) return text;
  return own.parts.map((part) => (part.kind === "text" ? part.text : part.kind === "at" ? text : "")).join("");
}

/** Formats Excel knows by number alone. */
const BUILT_IN: Record<number, string> = {
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  37: "#,##0_);(#,##0)",
  38: "#,##0_);[Red](#,##0)",
  39: "#,##0.00_);(#,##0.00)",
  40: "#,##0.00_);[Red](#,##0.00)",
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
  42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
  44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
  48: "##0.0E+0",
  49: "@",
};

/** The short date of where the visitor is, which Excel uses for its plain date. */
function shortDate(): string {
  const parts = new Intl.DateTimeFormat(here().tag, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(2003, 1, 5));
  return parts
    .map(({ type, value }) => {
      if (type === "year") return "yyyy";
      if (type === "month") return value.length > 1 ? "mm" : "m";
      if (type === "day") return value.length > 1 ? "dd" : "d";
      return `"${value}"`;
    })
    .join("");
}

// ---------------------------------------------------------------- workbooks: looks

type Look = {
  style: FlowStyle;
  /** The letters have the sheet's own colour, not one of their own. */
  bare: boolean;
  code: string;
  align?: FlowAlign;
  valign?: "top" | "middle" | "bottom";
  wrap: boolean;
  across: boolean;
  indent: number;
  fill?: string;
  border?: Partial<Record<Side, FlowLine>>;
};

type Rel = { type: string; target: string; external: boolean };

type Colors = {
  /** In the order cells count them: light 1, dark 1, light 2, dark 2, accents, links. */
  theme: string[];
  palette: string[];
};

type Book = Colors & {
  pack: Pack;
  base: FlowStyle;
  looks: Look[];
  strings: Element[];
  from1904: boolean;
  /** Dots a digit takes, which widths are counted in. */
  digit: number;
};

const THEME = "ffffff 000000 e7e6e6 44546a 4472c4 ed7d31 a5a5a5 ffc000 5b9bd5 70ad47 0563c1 954f72"
  .split(" ")
  .map((hex) => `#${hex}`);

/** Excel's way to lighten (+) and darken (-): by the lightness, keeping the hue. */
function tinted(color: string, tint: number): string {
  if (!tint) return color;
  const rgb = channels(color).map((value) => value / 255);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const light = (max + min) / 2;
  const next = tint < 0 ? light * (1 + tint) : light * (1 - tint) + tint;
  if (max === min) return fromChannels([next * 255, next * 255, next * 255]);
  const spread = (max - min) / (light > 0.5 ? 2 - max - min : max + min);
  const reach = spread * (next > 0.5 ? 1 - next : next);
  return fromChannels(rgb.map((value) => (next + ((value - light) / ((max - min) / 2)) * reach) * 255));
}

function colorOf(el: Element | null, { theme, palette }: Colors): string | null {
  if (!el) return null;
  const tint = Number(at(el, "tint") ?? 0);
  const rgb = at(el, "rgb");
  const slot = at(el, "theme");
  const indexed = at(el, "indexed");
  if (rgb && /[0-9a-f]{6}$/i.test(rgb)) return tinted(`#${rgb.slice(-6).toLowerCase()}`, tint);
  if (slot !== null) return theme[Number(slot)] ? tinted(theme[Number(slot)], tint) : null;
  if (indexed === null) return null;
  const index = Number(indexed);
  if (index === 65) return "#ffffff";
  // The first eight colours come twice.
  return palette[index] ?? (index < 8 ? paletteColor(index) : index < 64 ? paletteColor(index - 8) : null);
}

function fontOf(el: Element | null, base: FlowStyle, colors: Colors): FlowStyle {
  const on = (name: string) => {
    const child = kid(el, name);
    return child !== null && !/^(0|false|none)$/.test(at(child, "val") ?? "1");
  };
  const style: FlowStyle = {
    font: at(kid(el, "name") ?? kid(el, "rFont"), "val") ?? base.font,
    size: Number(at(kid(el, "sz"), "val")) || base.size,
    color: colorOf(kid(el, "color"), colors) ?? "#000000",
  };
  if (on("b")) style.bold = true;
  if (on("i")) style.italic = true;
  if (on("u")) style.underline = true;
  if (on("strike")) style.strike = true;
  const script = at(kid(el, "vertAlign"), "val");
  if (script === "superscript") style.script = "super";
  if (script === "subscript") style.script = "sub";
  return style;
}

/** How much of a pattern is its own colour. */
const PATTERNS: Record<string, number> = {
  darkGray: 0.75,
  mediumGray: 0.5,
  lightGray: 0.25,
  gray125: 0.125,
  gray0625: 0.0625,
};

function fillOf(el: Element, colors: Colors): string | undefined {
  const stops = kids(kid(el, "gradientFill"), "stop").map((stop) => colorOf(kid(stop, "color"), colors) ?? "#ffffff");
  if (stops.length > 0) return stops.reduce((mix, color, i) => blend(color, mix, 1 / (i + 1)));
  const pattern = kid(el, "patternFill");
  const type = at(pattern, "patternType") ?? "none";
  if (type === "none") return undefined;
  const front = colorOf(kid(pattern, "fgColor"), colors);
  const back = colorOf(kid(pattern, "bgColor"), colors);
  if (type === "solid") return front ?? undefined;
  return blend(front ?? "#000000", back ?? "#ffffff", PATTERNS[type] ?? 0.4);
}

const LINES: Record<string, Pick<FlowLine, "width" | "dash">> = {
  thin: { width: 0.75 },
  hair: { width: 0.4, dash: "dot" },
  dotted: { width: 0.75, dash: "dot" },
  dashed: { width: 0.75, dash: "dash" },
  dashDot: { width: 0.75, dash: "dash" },
  dashDotDot: { width: 0.75, dash: "dash" },
  medium: { width: 1.5 },
  mediumDashed: { width: 1.5, dash: "dash" },
  mediumDashDot: { width: 1.5, dash: "dash" },
  mediumDashDotDot: { width: 1.5, dash: "dash" },
  slantDashDot: { width: 1.5, dash: "dash" },
  thick: { width: 2.25 },
  double: { width: 2 },
};

function borderOf(el: Element, colors: Colors): Partial<Record<Side, FlowLine>> | undefined {
  const out: Partial<Record<Side, FlowLine>> = {};
  for (const side of SIDES) {
    const line = kid(el, side) ?? (side === "left" ? kid(el, "start") : side === "right" ? kid(el, "end") : null);
    const look = LINES[at(line, "style") ?? ""];
    if (look) out[side] = { color: colorOf(kid(line, "color"), colors) ?? "#000000", ...look };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const ALIGNS: Record<string, FlowAlign> = {
  left: "left",
  fill: "left",
  center: "center",
  centerContinuous: "center",
  distributed: "center",
  right: "right",
  justify: "justify",
};

const yes = (value: string | null) => value === "1" || value === "true";
const no = (value: string | null) => value === "0" || value === "false";

async function relsOf(pack: Pack, path: string): Promise<Map<string, Rel>> {
  const cut = path.lastIndexOf("/") + 1;
  const root = await pack.xml(`${path.slice(0, cut)}_rels/${path.slice(cut)}.rels`);
  const out = new Map<string, Rel>();
  for (const el of kids(root, "Relationship")) {
    const external = at(el, "TargetMode") === "External";
    const target = at(el, "Target") ?? "";
    const type = (at(el, "Type") ?? "").split("/").pop() ?? "";
    out.set(at(el, "Id") ?? "", { type, target: external ? target : resolvePath(path, target), external });
  }
  return out;
}

async function themeOf(root: Element | null): Promise<string[]> {
  const scheme = dig(root, "themeElements", "clrScheme");
  const slots = "lt1 dk1 lt2 dk2 accent1 accent2 accent3 accent4 accent5 accent6 hlink folHlink".split(" ");
  return slots.map((slot, i) => {
    const color = kids(kid(scheme, slot))[0];
    const hex = at(color, "lastClr") ?? at(color, "val") ?? "";
    return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : THEME[i];
  });
}

/** The codes of the formats, by number. */
function codesOf(styles: Element | null): Map<number, string> {
  const codes = new Map<number, string>(Object.entries(BUILT_IN).map(([id, code]) => [Number(id), code]));
  codes.set(14, shortDate());
  codes.set(22, `${shortDate()} h:mm`);
  // Brackets around negative numbers are for the United States; elsewhere these have a minus.
  if (here().tag !== "en-US")
    for (const id of [37, 38, 39, 40]) codes.set(id, BUILT_IN[id].replace(/_\)/g, "").replace(/\(([^)]*)\)/, "-$1"));
  for (const el of kids(kid(styles, "numFmts"), "numFmt"))
    codes.set(Number(at(el, "numFmtId")), at(el, "formatCode") ?? "General");
  return codes;
}

async function readBook(pack: Pack, path: string, root: Element): Promise<Book> {
  const rels = [...(await relsOf(pack, path)).values()];
  const part = async (type: string) => {
    const rel = rels.find((one) => one.type === type && !one.external);
    return rel ? pack.xml(rel.target) : null;
  };
  const styles = await part("styles");
  const palette = kids(dig(styles, "colors", "indexedColors"), "rgbColor").map(
    (el) => `#${(at(el, "rgb") ?? "000000").slice(-6).toLowerCase()}`,
  );
  const colors: Colors = { theme: await themeOf(await part("theme")), palette };
  const fontEls = kids(kid(styles, "fonts"), "font");
  const base = fontOf(fontEls[0] ?? null, { font: "Calibri", size: 11 }, colors);
  const fonts = fontEls.map((el) => {
    const color = kid(el, "color");
    const dark = at(color, "theme") === "1" && !Number(at(color, "tint") ?? 0);
    const bare = !color || yes(at(color, "auto")) || dark || at(color, "indexed") === "64";
    return { style: fontOf(el, base, colors), bare };
  });
  const fills = kids(kid(styles, "fills"), "fill").map((el) => fillOf(el, colors));
  const borders = kids(kid(styles, "borders"), "border").map((el) => borderOf(el, colors));
  const codes = codesOf(styles);
  const looks = kids(kid(styles, "cellXfs"), "xf").map((xf): Look => {
    const font = fonts[Number(at(xf, "fontId") ?? 0)];
    const alignment = kid(xf, "alignment");
    const vertical = at(alignment, "vertical");
    const horizontal = at(alignment, "horizontal") ?? "";
    return {
      style: font?.style ?? base,
      bare: font?.bare ?? true,
      code: codes.get(Number(at(xf, "numFmtId") ?? 0)) ?? "General",
      align: ALIGNS[horizontal],
      valign: vertical === "top" ? "top" : vertical === "center" || vertical === "distributed" ? "middle" : "bottom",
      wrap: yes(at(alignment, "wrapText")) || /^(justify|distributed)$/.test(horizontal),
      across: horizontal === "centerContinuous",
      indent: Number(at(alignment, "indent") ?? 0) * 6.75,
      fill: fills[Number(at(xf, "fillId") ?? 0)],
      border: borders[Number(at(xf, "borderId") ?? 0)],
    };
  });
  const digits: FlowRun = { text: "0000000000", style: { font: base.font, size: ((base.size ?? 11) * 4) / 3 } };
  return {
    ...colors,
    pack,
    base,
    looks,
    strings: kids(await part("sharedStrings"), "si"),
    from1904: yes(at(kid(root, "workbookPr"), "date1904")),
    digit: Math.max(4, Math.round(widthOf([digits]) / 10) || 7),
  };
}

// ---------------------------------------------------------------- workbooks: "Format as Table"

type Band = { fill?: string; bold?: boolean; color?: string; line?: Partial<Record<Side | "inside", FlowLine>> };
type TableLook = { whole: Band; head: Band; stripe: Band; total: Band };

/** The looks tables have to choose from. Every family of seven comes in black and the six accents. */
function tableLook(name: string, theme: readonly string[]): TableLook | null {
  const found = /^TableStyle(Light|Medium|Dark)(\d+)$/.exec(name);
  if (!found) return null;
  const n = Number(found[2]) - 1;
  const family = found[1] + (found[1] === "Dark" && n > 6 ? 1 : found[1] === "Dark" ? 0 : Math.floor(n / 7));
  const accent = n % 7;
  const [white, black] = theme;
  const color = accent === 0 ? black : theme[3 + accent];
  const line = (hex: string, width = 0.75): FlowLine => ({ color: hex, width });
  /** A lighter kind of the colour. Black turns grey. */
  const light = (share: number) => (accent === 0 ? tinted(white, (share - 1) * 0.75) : tinted(color, share));
  const round = (hex: string) => ({ top: line(hex), right: line(hex), bottom: line(hex), left: line(hex) });
  const grid = (hex: string) => ({ ...round(hex), inside: line(hex) });
  const rows = (hex: string) => ({ top: line(hex), bottom: line(hex) });
  const head: Band = { fill: color, bold: true, color: white };
  const total: Band = { bold: true, line: { top: line(color, 1.5) } };
  switch (family) {
    case "Light0":
      return {
        whole: { line: rows(color), color: accent === 0 ? undefined : tinted(color, -0.25) },
        head: { bold: true, line: { bottom: line(color) } },
        stripe: { fill: light(0.8) },
        total: { bold: true, line: { top: line(color) } },
      };
    case "Light1":
      return { whole: { line: round(color) }, head, stripe: { line: rows(color) }, total };
    case "Light2": {
      const bold: Band = { bold: true, line: { bottom: line(color, 1.5) } };
      return { whole: { line: grid(color) }, head: bold, stripe: { fill: light(0.8) }, total };
    }
    case "Medium0": {
      const soft = light(0.4);
      return { whole: { line: round(soft) }, head, stripe: { fill: light(0.8), line: rows(soft) }, total };
    }
    case "Medium1":
      return {
        whole: { fill: light(0.8), line: grid(white) },
        head: { ...head, line: { bottom: line(white, 2.25) } },
        stripe: { fill: light(0.6) },
        total: { ...head, line: { top: line(white, 2.25) } },
      };
    case "Medium2":
      return {
        whole: { line: { top: line(black, 1.5), bottom: line(black, 1.5) } },
        head: { ...head, line: { bottom: line(black, 1.5) } },
        stripe: { fill: tinted(white, -0.15) },
        total: { bold: true, line: { top: line(black, 1.5) } },
      };
    case "Medium3":
      return {
        whole: { fill: light(0.8), line: grid(light(0.4)) },
        head: { bold: true },
        stripe: { fill: light(0.6) },
        total,
      };
    case "Dark0":
      return {
        whole: { fill: accent === 0 ? "#737373" : color, color: white },
        head: { fill: black, bold: true, color: white, line: { bottom: line(white, 1.5) } },
        stripe: { fill: accent === 0 ? "#404040" : tinted(color, -0.25) },
        total: { fill: accent === 0 ? "#262626" : tinted(color, -0.5), bold: true, color: white },
      };
    default: {
      // These come in pairs of accents: one for the rows, the next for the head.
      const own = n === 7 ? black : theme[4 + (n - 8) * 2];
      const pale = (share: number) => (n === 7 ? tinted(white, (share - 1) * 0.75) : tinted(own, share));
      return {
        whole: { fill: pale(0.8) },
        head: { fill: n === 7 ? black : theme[5 + (n - 8) * 2], bold: true, color: white },
        stripe: { fill: pale(0.6) },
        total: { bold: true, line: { top: line(black, 1.5) } },
      };
    }
  }
}

type RawRow = { h: number; hidden: boolean; cells: (Cell | null | undefined)[] };

/** Gives the cells of a table the looks of its style, where they have none of their own. */
function dress(rows: RawRow[], looks: ReadonlyMap<Cell, Look>, table: Element, book: Book) {
  const info = kid(table, "tableStyleInfo");
  const look = tableLook(at(info, "name") ?? "", book.theme);
  const range = rangeOf(at(table, "ref"));
  if (!look || !range) return;
  const { r0, c0, r1, c1 } = range;
  const heads = Number(at(table, "headerRowCount") ?? 1);
  const totals = Number(at(table, "totalsRowCount") ?? 0);
  const striped = yes(at(info, "showRowStripes"));
  for (let r = r0; r <= Math.min(r1, rows.length - 1); r += 1) {
    const bands = [look.whole];
    if (r < r0 + heads) bands.push(look.head);
    else if (r > r1 - totals) bands.push(look.total);
    else if (striped && (r - r0 - heads) % 2 === 0) bands.push(look.stripe);
    for (let c = c0; c <= Math.min(c1, MAX_COLS - 1); c += 1) {
      const cell = rows[r].cells[c] === undefined ? (rows[r].cells[c] = { runs: [] }) : rows[r].cells[c];
      if (!cell) continue;
      const border: Partial<Record<Side, FlowLine>> = {};
      let { fill } = cell;
      let color: string | undefined;
      let bold = false;
      for (const band of bands) {
        const { line = {} } = band;
        const inRow = band !== look.whole;
        const put = (side: Side, edge: boolean) => {
          const value = edge || (inRow && (side === "top" || side === "bottom")) ? line[side] : line.inside;
          if (value) border[side] = value;
        };
        put("top", r === r0);
        put("bottom", r === r1);
        put("left", c === c0);
        put("right", c === c1);
        if (!cell.fill && band.fill) fill = band.fill;
        color = band.color ?? color;
        bold ||= band.bold ?? false;
      }
      Object.assign(border, cell.border);
      if (fill) cell.fill = fill;
      if (Object.keys(border).length > 0) cell.border = border;
      const bare = looks.get(cell)?.bare ?? true;
      cell.runs = cell.runs.map((run) =>
        run.text === undefined
          ? run
          : { text: run.text, style: { ...run.style, ...(bold ? { bold } : {}), ...(color && bare ? { color } : {}) } },
      );
    }
  }
}

// ---------------------------------------------------------------- workbooks: sheets

/** Excel writes letters XML cannot hold by their codes. */
const plainText = (text: string) =>
  text
    .replace(/_x([0-9a-f]{4})_/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** A string with its own looks: `t`, or runs of `r`. */
function richText(el: Element | null, look: Look, book: Book): FlowRun[] {
  const runs: FlowRun[] = [];
  for (const child of kids(el)) {
    if (child.localName === "t") runs.push({ text: plainText(child.textContent ?? ""), style: look.style });
    else if (child.localName === "r") {
      const rPr = kid(child, "rPr");
      const style = rPr ? fontOf(rPr, look.style, book) : look.style;
      runs.push({ text: plainText(kid(child, "t")?.textContent ?? ""), style });
    }
  }
  return joinRuns(runs);
}

/** "BC12" as column 54, row 11. */
function refOf(ref: string): { r: number; c: number } | null {
  const found = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(ref.trim());
  if (!found) return null;
  let c = 0;
  for (const letter of found[1].toUpperCase()) c = c * 26 + letter.charCodeAt(0) - 64;
  return { r: Number(found[2]) - 1, c: c - 1 };
}

type Range = { r0: number; c0: number; r1: number; c1: number };

function rangeOf(ref: string | null): Range | null {
  const [from, to] = (ref ?? "").split(":");
  const a = refOf(from);
  const b = refOf(to ?? from);
  if (!a || !b) return null;
  return { r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) };
}

/** Days since 1900 of a date that is written out. */
function dayOf(text: string, from1904: boolean): number {
  const time = Date.parse(/[zt]|:/i.test(text) ? text : `${text}T00:00Z`);
  return time / 86400000 + 25569 - (from1904 ? 1462 : 0);
}

function cellOf(c: Element, look: Look, book: Book, room: number, zeros: boolean): Cell {
  const type = at(c, "t") ?? "n";
  const value = kid(c, "v")?.textContent ?? "";
  const cell: Cell = { runs: [], valign: look.valign };
  const say = (text: string, color?: string) => {
    if (text.trim() !== "") cell.runs = [{ text, style: color ? { ...look.style, color } : look.style }];
    else cell.runs = [];
  };
  let own: FlowAlign | undefined;
  if (type === "s" || type === "inlineStr") {
    cell.runs = richText(type === "s" ? (book.strings[Number(value)] ?? null) : kid(c, "is"), look, book);
    const text = runsText(cell.runs);
    const shown = writeText(text, look.code);
    if (shown !== text) say(shown);
  } else if (type === "str") say(writeText(plainText(value), look.code));
  else if (type === "b" || type === "e") {
    say(type === "e" ? value : yes(value.trim()) ? "TRUE" : "FALSE");
    own = "center";
  } else if (value.trim() !== "") {
    const number = type === "d" ? dayOf(value, book.from1904) : Number(value);
    if (Number.isFinite(number)) {
      const code = type === "d" && look.code === "General" ? shortDate() : look.code;
      const { text, color } = writeValue(number, code, book.from1904, room);
      if (zeros || number !== 0) say(text, color);
      own = code === "@" ? undefined : "right";
      cell.solid = !look.wrap;
    } else say(value);
  }
  const align = look.align ?? own;
  if (align) cell.align = align;
  if (look.wrap) cell.wrap = true;
  if (look.across) cell.across = true;
  if (look.indent && align !== "center") cell.indent = look.indent;
  if (look.fill) cell.fill = look.fill;
  if (look.border) cell.border = look.border;
  return cell;
}

/** Leaves out the end of a long sheet before it is taken apart, which would need a great deal of memory. */
function cutRows(xml: string, most: number): { xml: string; more: number } {
  const starts = /<(?:\w+:)?row[\s>/]/g;
  let cut = -1;
  let more = 0;
  for (let n = 1, found = starts.exec(xml); found; n += 1) {
    const from = found.index;
    found = starts.exec(xml);
    if (n <= most) continue;
    if (cut < 0) cut = from;
    if (/<(?:\w+:)?(?:v|is)>/.test(xml.slice(from, found?.index ?? from + 4000))) more += 1;
  }
  const end = cut < 0 ? -1 : xml.slice(cut).search(/<\/(?:\w+:)?sheetData>/);
  return end < 0 ? { xml, more: 0 } : { xml: xml.slice(0, cut) + xml.slice(cut + end), more };
}

/** How many rows and columns are repeated: the print titles, or what is frozen on screen. */
function repeated(view: Element | null, titles: string, filter: Range | null): { head: number; key: number } {
  const pane = kid(view, "pane");
  const frozen = (at(pane, "state") ?? "").startsWith("frozen");
  const split = (name: string) => (frozen ? Math.round(Number(at(pane, name) ?? 0)) : 0);
  const rows = /\$1:\$(\d+)/.exec(titles);
  const cols = /\$A:\$([A-Z]+)(?![A-Z\d$])/.exec(titles);
  const head = rows ? Number(rows[1]) : split("ySplit") || (filter?.r0 === 0 ? 1 : 0);
  const key = cols ? (refOf(`${cols[1]}1`)?.c ?? -1) + 1 : split("xSplit");
  return { head: head <= 10 ? head : 0, key: key <= 5 ? key : 0 };
}

/** Joins cells: the first takes the room of all, and the lines along their far sides. */
function merge(rows: RawRow[], { r0, c0, r1, c1 }: Range) {
  if (r0 >= rows.length || c0 >= MAX_COLS || (r0 === r1 && c0 === c1)) return;
  const lastRow = Math.min(r1, rows.length - 1);
  const lastCol = Math.min(c1, MAX_COLS - 1);
  const first = (rows[r0].cells[c0] ??= { runs: [] });
  const right = rows[r0].cells[lastCol]?.border?.right;
  const bottom = rows[lastRow].cells[c0]?.border?.bottom;
  const border = { ...first.border, ...(right ? { right } : {}), ...(bottom ? { bottom } : {}) };
  if (Object.keys(border).length > 0) first.border = border;
  first.cols = lastCol - c0 + 1;
  first.rows = lastRow - r0 + 1;
  for (let r = r0; r <= lastRow; r += 1)
    for (let c = c0; c <= lastCol; c += 1) if (r !== r0 || c !== c0) rows[r].cells[c] = null;
}

async function readSheet(book: Book, path: string, name: string, titles: string): Promise<Sheet | null> {
  const { pack } = book;
  const bytes = await pack.bytes(path);
  const cut = bytes ? cutRows(new TextDecoder().decode(bytes), MAX_ROWS + 2000) : null;
  const root = cut ? parseXml(cut.xml) : null;
  if (!cut || root?.localName !== "worksheet") return null;
  const rels = await relsOf(pack, path);

  const format = kid(root, "sheetFormatPr");
  const points = (chars: number) =>
    Math.trunc(((256 * chars + Math.trunc(128 / book.digit)) / 256) * book.digit) * 0.75;
  const usualChars = Number(at(format, "defaultColWidth")) || Number(at(format, "baseColWidth") ?? 8) + 8 / book.digit;
  const usual = points(usualChars);
  const height = Number(at(format, "defaultRowHeight")) || 15;
  const noRows = yes(at(format, "zeroHeight"));
  const colEls = kids(kid(root, "cols"), "col").map((el) => ({
    from: Number(at(el, "min")) - 1,
    to: Number(at(el, "max")) - 1,
    w: at(el, "width") === null ? usual : points(Number(at(el, "width"))),
    hidden: yes(at(el, "hidden")) || Number(at(el, "width") ?? 1) === 0,
  }));
  const colAt = (c: number) => colEls.find(({ from, to }) => c >= from && c <= to);
  const widthAt = (c: number) => colAt(c)?.w ?? usual;
  const view = kid(kid(root, "sheetViews"), "sheetView");
  const zeros = !no(at(view, "showZeros"));

  const links = new Map<string, string>();
  for (const el of kids(kid(root, "hyperlinks"), "hyperlink")) {
    const rel = rels.get(at(el, "id") ?? "");
    const target = rel?.external ? outsideLink(rel.target) : null;
    const range = rangeOf(at(el, "ref"));
    if (!target || !range) continue;
    for (let r = range.r0; r <= Math.min(range.r1, range.r0 + 200); r += 1)
      for (let c = range.c0; c <= Math.min(range.c1, range.c0 + 50); c += 1) links.set(`${r} ${c}`, target);
  }
  const merges = kids(kid(root, "mergeCells"), "mergeCell").flatMap((el) => rangeOf(at(el, "ref")) ?? []);
  const spans = new Map(merges.map((range) => [`${range.r0} ${range.c0}`, range]));

  const rows: RawRow[] = [];
  const looks = new Map<Cell, Look>();
  const plain: Look = {
    style: book.base,
    bare: true,
    code: "General",
    valign: "bottom",
    wrap: false,
    across: false,
    indent: 0,
  };
  let { more } = cut;
  let shown = 0;
  let next = 0;
  for (const el of kids(kid(root, "sheetData"), "row")) {
    const r = Number(at(el, "r") ?? next + 1) - 1;
    next = r + 1;
    const cellEls = kids(el, "c");
    const hidden = yes(at(el, "hidden")) || at(el, "ht") === "0";
    if (shown >= MAX_ROWS || r >= MAX_ROWS * 4) {
      if (!hidden && cellEls.some((c) => kid(c, "v") ?? kid(c, "is"))) more += 1;
      continue;
    }
    while (rows.length < r) rows.push({ h: height, hidden: noRows, cells: [] });
    const row: RawRow = { h: Number(at(el, "ht")) || height, hidden, cells: [] };
    rows[r] = row;
    if (!hidden) shown += 1;
    let nextCol = 0;
    for (const c of cellEls) {
      const col = refOf(at(c, "r") ?? "")?.c ?? nextCol;
      nextCol = col + 1;
      if (col >= MAX_COLS) continue;
      const look = book.looks[Number(at(c, "s") ?? 0)] ?? plain;
      const span = spans.get(`${r} ${col}`);
      let width = widthAt(col);
      for (let i = col + 1; span && i <= Math.min(span.c1, col + 50); i += 1) width += widthAt(i);
      const cell = cellOf(c, look, book, (width / 0.75 - 5) / book.digit, zeros);
      const link = links.get(`${r} ${col}`);
      if (link)
        cell.runs = cell.runs.map((run) =>
          run.text === undefined ? run : { text: run.text, style: { ...run.style, link } },
        );
      row.cells[col] = cell;
      looks.set(cell, look);
    }
  }

  const tables: Element[] = [];
  for (const el of kids(kid(root, "tableParts"), "tablePart")) {
    const rel = rels.get(at(el, "id") ?? "");
    const table = rel ? await pack.xml(rel.target) : null;
    if (table) tables.push(table);
  }
  for (const table of tables) dress(rows, looks, table, book);
  for (const range of merges) merge(rows, range);

  const count = rows.reduce((most, { cells }) => Math.max(most, cells.length), 0);
  const cols = Array.from({ length: count }, (_, c) => ({ w: widthAt(c), hidden: colAt(c)?.hidden ?? false }));
  const filter = rangeOf(at(kid(root, "autoFilter") ?? (tables.length === 1 ? tables[0] : null), "ref"));
  const { head, key } = repeated(view, titles, filter);
  return {
    name,
    ...visible(rows, cols),
    head: rows.slice(0, head).filter((row) => !row.hidden).length,
    key: cols.slice(0, key).filter((col) => !col.hidden).length,
    lines: yes(at(kid(root, "printOptions"), "gridLines"))
      ? "print"
      : no(at(view, "showGridLines"))
        ? "none"
        : "screen",
    more,
  };
}

export async function readXlsx(bytes: Uint8Array): Promise<FlowDoc> {
  const pack = await openPack(bytes, "an Excel workbook");
  if (pack.has("xl/workbook.bin"))
    throw new ConvertError("This is a binary Excel workbook. Save it as .xlsx in Excel and try again.");
  const main = [...(await relsOf(pack, "")).values()].find((rel) => rel.type === "officeDocument");
  const path = main?.target ?? "xl/workbook.xml";
  const root = await pack.xml(path);
  if (root?.localName !== "workbook") throw new ConvertError("This is not an Excel workbook.");
  const book = await readBook(pack, path, root);
  const rels = await relsOf(pack, path);
  const titles = new Map<number, string>();
  for (const el of kids(kid(root, "definedNames"), "definedName"))
    if (/print_titles$/i.test(at(el, "name") ?? "")) titles.set(Number(at(el, "localSheetId")), el.textContent ?? "");
  const sheets: Sheet[] = [];
  for (const [i, el] of kids(kid(root, "sheets"), "sheet").entries()) {
    const rel = rels.get(at(el, "id") ?? "");
    if (rel?.type !== "worksheet" || /hidden$/i.test(at(el, "state") ?? "")) continue;
    const sheet = await readSheet(book, rel.target, at(el, "name") ?? "", titles.get(i) ?? "");
    if (sheet) sheets.push(sheet);
  }
  const doc = docOf(sheets);
  const core = await pack.xml("docProps/core.xml");
  const title = kid(core, "title")?.textContent?.trim();
  const author = kid(core, "creator")?.textContent?.trim();
  return { ...doc, ...(title ? { title } : {}), ...(author ? { author } : {}) };
}

// ---------------------------------------------------------------- OpenDocument spreadsheets

/** What a style says, its parents' words included: "font-weight" and so on. */
type Props = Record<string, string>;

type OdsStyles = { named: Map<string, Element>; usual: Map<string, Element>; done: Map<string, Props> };

const FAMILY_PARTS = /^(text|paragraph|table-cell|table-column|table-row|table)-properties$/;

function propsOf(family: string, name: string | null, styles: OdsStyles): Props {
  const key = `${family} ${name ?? ""}`;
  const known = styles.done.get(key);
  if (known) return known;
  const el = name ? styles.named.get(key) : undefined;
  const parent = at(el, "parent-style-name");
  // A style that names itself as its parent must not go round in circles.
  styles.done.set(key, {});
  const out: Props = { ...propsOfParent(family, name, parent, styles) };
  const own = el ?? (name ? undefined : styles.usual.get(family));
  for (const part of kids(own))
    if (FAMILY_PARTS.test(part.localName))
      for (const attr of Array.from(part.attributes)) out[attr.localName] = attr.value;
  styles.done.set(key, out);
  return out;
}

const propsOfParent = (family: string, name: string | null, parent: string | null, styles: OdsStyles): Props =>
  parent ? propsOf(family, parent, styles) : name ? propsOf(family, null, styles) : {};

async function readOdsStyles(pack: Pack, content: Element): Promise<OdsStyles> {
  const out: OdsStyles = { named: new Map(), usual: new Map(), done: new Map() };
  const roots = [kid(await pack.xml("styles.xml"), "styles"), kid(content, "styles"), kid(content, "automatic-styles")];
  for (const root of roots)
    for (const el of kids(root)) {
      const family = at(el, "family") ?? "";
      if (el.localName === "style") out.named.set(`${family} ${at(el, "name")}`, el);
      if (el.localName === "default-style") out.usual.set(family, el);
    }
  return out;
}

const hexIn = (text: string | undefined) => (/^#[0-9a-f]{6}$/i.test(text ?? "") ? text?.toLowerCase() : undefined);

function odsText(props: Props, base: FlowStyle): FlowStyle {
  const style: FlowStyle = { ...base };
  const font = props["font-name"] ?? props["font-family"];
  const size = lengthOf(props["font-size"]);
  const color = hexIn(props.color);
  if (font)
    style.font =
      font
        .replace(/^['"]|['"]$/g, "")
        .replace(/\d+$/, "")
        .trim() || style.font;
  if (size) style.size = neat(size);
  if (color) style.color = color;
  if (props["font-weight"]) style.bold = /^(bold|[6-9]00)$/.test(props["font-weight"]);
  if (props["font-style"]) style.italic = /italic|oblique/.test(props["font-style"]);
  const under = props["text-underline-style"];
  if (under) style.underline = under !== "none";
  const strike = props["text-line-through-style"] ?? props["text-line-through-type"];
  if (strike) style.strike = strike !== "none";
  const place = props["text-position"] ?? "";
  if (/^(super|[1-9])/.test(place)) style.script = "super";
  if (/^(sub|-)/.test(place)) style.script = "sub";
  return style;
}

const WIDTHS: Record<string, number> = { thin: 0.75, medium: 1.5, thick: 2.25 };

function odsLine(text: string | undefined): FlowLine | undefined {
  const found = /^\s*([\d.]+\w*|thin|medium|thick)\s+(\S+)\s+(#[0-9a-f]{6})/i.exec(text ?? "");
  const width = WIDTHS[found?.[1] ?? ""] ?? lengthOf(found?.[1]);
  if (!found || !width || found[2] === "none" || found[2] === "hidden") return undefined;
  const dash = /dash/.test(found[2]) ? "dash" : /dot/.test(found[2]) ? "dot" : undefined;
  return { color: found[3].toLowerCase(), width: neat(Math.max(0.4, width)), ...(dash ? { dash } : {}) };
}

/** The words of a cell: its paragraphs, with the looks of the spans in them. */
function odsRuns(cell: Element, style: FlowStyle, styles: OdsStyles): FlowRun[] {
  const runs: FlowRun[] = [];
  const walk = (node: Node, look: FlowStyle) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/\s+/g, " ");
        if (text) runs.push({ text, style: look });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        switch (el.localName) {
          case "s":
            runs.push({ text: " ".repeat(clamp(Number(at(el, "c") ?? 1), 1, 200)), style: look });
            break;
          case "tab":
            runs.push({ text: "\t", style: look });
            break;
          case "line-break":
            runs.push({ text: "\n", style: look });
            break;
          case "span":
            walk(el, odsText(propsOf("text", at(el, "style-name"), styles), look));
            break;
          case "a": {
            const link = outsideLink(at(el, "href"));
            walk(el, link ? { ...look, link } : look);
            break;
          }
          case "annotation":
          case "ruby-text":
            break;
          default:
            walk(el, look);
        }
      }
    }
  };
  kids(cell, "p").forEach((p, i) => {
    if (i > 0) runs.push({ text: "\n", style });
    walk(p, style);
  });
  return joinRuns(runs);
}

const VERTICAL: Record<string, "top" | "middle" | "bottom"> = { top: "top", middle: "middle", bottom: "bottom" };
const SIDEWAYS: Record<string, FlowAlign> = {
  start: "left",
  left: "left",
  center: "center",
  end: "right",
  right: "right",
  justify: "justify",
};

/** What is in a cell, from programs that do not write how it shows. */
function odsValue(el: Element): string {
  const time = /^PT(\d+)H(\d+)M(\d+)/.exec(at(el, "time-value") ?? "");
  if (time) return time.slice(1).join(":");
  const value = at(el, "value") ?? "";
  if (at(el, "value-type") === "percentage" && value) return `${general(Number(value) * 100)}%`;
  return at(el, "string-value") ?? at(el, "date-value")?.replace("T", " ") ?? at(el, "boolean-value") ?? value;
}

function odsCell(el: Element, name: string | null, base: FlowStyle, styles: OdsStyles): Cell {
  const props = propsOf("table-cell", name, styles);
  const type = at(el, "value-type") ?? "";
  const number = /^(float|currency|percentage|date|time)$/.test(type);
  const look = odsText(props, base);
  const cell: Cell = { runs: odsRuns(el, look, styles), valign: VERTICAL[props["vertical-align"]] ?? "bottom" };
  const value = kid(el, "p") ? "" : odsValue(el);
  if (value) cell.runs = [{ text: value, style: look }];
  // Alignment "from the value type" leaves the choice to what is in the cell.
  const align = props["text-align-source"] === "value-type" ? undefined : SIDEWAYS[props["text-align"] ?? ""];
  const own = align ?? (number ? "right" : type === "boolean" ? "center" : undefined);
  if (own) cell.align = own;
  const fill = hexIn(props["background-color"]);
  if (fill) cell.fill = fill;
  const border: Partial<Record<Side, FlowLine>> = {};
  for (const side of SIDES) {
    const line = odsLine(props[`border-${side}`] ?? props.border);
    if (line) border[side] = line;
  }
  if (Object.keys(border).length > 0) cell.border = border;
  if (props["wrap-option"] === "wrap") cell.wrap = true;
  else if (number) cell.solid = true;
  const indent = lengthOf(props["margin-left"]);
  if (indent && own !== "center" && own !== "right") cell.indent = neat(indent);
  const cols = Number(at(el, "number-columns-spanned") ?? 1);
  const rows = Number(at(el, "number-rows-spanned") ?? 1);
  if (cols > 1) cell.cols = cols;
  if (rows > 1) cell.rows = rows;
  return cell;
}

/** Columns and rows may lie in groups and heads. */
function* inTable(table: Element, name: string): Generator<{ el: Element; head: boolean }> {
  for (const child of kids(table)) {
    if (child.localName === name) yield { el: child, head: false };
    else if (/^table-(header-)?(rows|columns)$|^table-(row|column)-group$/.test(child.localName))
      for (const inner of inTable(child, name))
        yield { el: inner.el, head: inner.head || child.localName.startsWith("table-header") };
  }
}

/** How many rows and columns a program keeps in view. */
type Frozen = { head: number; key: number };

async function odsFrozen(pack: Pack): Promise<Map<string, Frozen>> {
  const out = new Map<string, Frozen>();
  const settings = await pack.xml("settings.xml").catch(() => null);
  for (const map of Array.from(settings?.getElementsByTagNameNS("*", "config-item-map-named") ?? [])) {
    if (at(map, "name") !== "Tables") continue;
    for (const entry of kids(map, "config-item-map-entry")) {
      const said = new Map(kids(entry, "config-item").map((el) => [at(el, "name"), el.textContent?.trim()]));
      const split = (way: string) =>
        said.get(`${way}SplitMode`) === "2" ? Number(said.get(`${way}SplitPosition`)) || 0 : 0;
      out.set(at(entry, "name") ?? "", { head: split("Vertical"), key: split("Horizontal") });
    }
  }
  return out;
}

function odsSheet(table: Element, base: FlowStyle, styles: OdsStyles, frozen: Frozen | undefined): Sheet {
  const hiddenNow = (el: Element) => /^(collapse|filter)$/.test(at(el, "visibility") ?? "");
  const cols: { w: number; hidden: boolean; look: string | null }[] = [];
  let key = 0;
  for (const { el, head } of inTable(table, "table-column")) {
    const props = propsOf("table-column", at(el, "style-name"), styles);
    const look = at(el, "default-cell-style-name");
    const w = lengthOf(props["column-width"]) ?? 64;
    const times = Math.min(Number(at(el, "number-columns-repeated") ?? 1), MAX_COLS - cols.length);
    for (let i = 0; i < times; i += 1) cols.push({ w, hidden: hiddenNow(el), look });
    if (head && key === cols.length - times) key = cols.length;
  }
  const rows: RawRow[] = [];
  let heads = 0;
  let more = 0;
  let shown = 0;
  for (const { el, head } of inTable(table, "table-row")) {
    const times = Number(at(el, "number-rows-repeated") ?? 1);
    const props = propsOf("table-row", at(el, "style-name"), styles);
    const cells: (Cell | null | undefined)[] = [];
    for (const child of kids(el)) {
      if (child.localName !== "table-cell" && child.localName !== "covered-table-cell") continue;
      const many = Number(at(child, "number-columns-repeated") ?? 1);
      const wide = Math.min(many, MAX_COLS - cells.length);
      for (let i = 0; i < wide; i += 1) {
        const c = cells.length;
        const name = at(child, "style-name") ?? at(el, "default-cell-style-name") ?? cols[c]?.look ?? null;
        // The endless rest of a row has nothing in it.
        if (many > 200 && !child.firstElementChild) break;
        cells.push(child.localName === "covered-table-cell" ? null : odsCell(child, name, base, styles));
      }
    }
    const row: RawRow = { h: lengthOf(props["row-height"]) ?? 12.8, hidden: hiddenNow(el), cells };
    const words = cells.some(hasWords);
    for (let i = 0; i < times; i += 1) {
      if (times > 500 && !words) break;
      if (shown >= MAX_ROWS) {
        if (words && !row.hidden) more += times - i;
        break;
      }
      rows.push(i === 0 ? row : { ...row, cells: cells.map((cell) => cell && { ...cell }) });
      if (!row.hidden) shown += 1;
    }
    if (head && !row.hidden && heads === shown - 1) heads = shown;
  }
  const shows = ({ hidden }: { hidden: boolean }) => !hidden;
  const keptRows = frozen && frozen.head <= 10 ? rows.slice(0, frozen.head).filter(shows).length : 0;
  const keptCols = frozen && frozen.key <= 5 ? cols.slice(0, frozen.key).filter(shows).length : 0;
  return {
    name: at(table, "name") ?? "",
    ...visible(rows, cols),
    head: heads || keptRows,
    key: (key <= 5 && key) || keptCols,
    lines: "screen",
    more,
  };
}

export async function readOds(bytes: Uint8Array): Promise<FlowDoc> {
  const pack = await openPack(bytes, "an OpenDocument spreadsheet");
  const manifest = await pack.xml("META-INF/manifest.xml");
  if (manifest && find(manifest, "encryption-data")) throw new ConvertError(LOCKED);
  const content = await pack.xml("content.xml");
  const body = dig(content, "body", "spreadsheet");
  if (!content || !body) throw new ConvertError("This is not an OpenDocument spreadsheet.");
  const styles = await readOdsStyles(pack, content);
  const base = odsText(propsOf("table-cell", null, styles), { font: "Arial", size: 10, color: "#000000" });
  const frozen = await odsFrozen(pack);
  const sheets = kids(body, "table")
    .filter((table) => propsOf("table", at(table, "style-name"), styles).display !== "false")
    .map((table) => odsSheet(table, base, styles, frozen.get(at(table, "name") ?? "")));
  const doc = docOf(sheets);
  const meta = dig(await pack.xml("meta.xml"), "meta");
  const title = kid(meta, "title")?.textContent?.trim();
  const author = (kid(meta, "creator") ?? kid(meta, "initial-creator"))?.textContent?.trim();
  return { ...doc, ...(title ? { title } : {}), ...(author ? { author } : {}) };
}

// ---------------------------------------------------------------- delimited text

/** In the order they are preferred when they fit equally well. */
const SEPARATORS = ["\t", ";", "|", ","];

/** Splits text into records. Quotes may hold separators and line ends; a doubled quote is one. */
function records(text: string, separator: string, most = Infinity): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const { length } = text;
  while (i < length && out.length < most) {
    let field = "";
    let close = text[i] === '"' ? i + 1 : -1;
    while (close >= 0) {
      close = text.indexOf('"', close);
      if (close < 0 || text[close + 1] !== '"') break;
      close += 2;
    }
    // A quote that is never closed is just a sign.
    if (close >= 0) {
      field = text.slice(i + 1, close).replace(/""/g, '"');
      i = close + 1;
    }
    let end = i;
    while (end < length && text[end] !== separator && text[end] !== "\n" && text[end] !== "\r") end += 1;
    row.push(field + text.slice(i, end));
    i = end;
    if (text[i] === separator) {
      i += 1;
      // The text ends with a separator: there is one more field, with nothing in it.
      if (i >= length) row.push("");
      else continue;
    } else if (text[i] === "\r" && text[i + 1] === "\n") i += 2;
    else i += 1;
    out.push(row);
    row = [];
  }
  return out;
}

/** The sign that cuts most lines into equally many pieces. */
function separatorOf(text: string): string {
  const sample = text.slice(0, 200000);
  // Where most lines have none of these signs, there is only one column.
  let best = { separator: "", share: 0 };
  for (const separator of SEPARATORS) {
    const counts = new Map<number, number>();
    let lines = 0;
    for (const row of records(sample, separator, 100)) {
      if (row.length === 1 && row[0] === "") continue;
      lines += 1;
      counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    }
    if ((counts.get(1) ?? 0) >= lines / 2) continue;
    const share = Math.max(...[...counts].map(([size, count]) => (size > 1 ? count / lines : 0)));
    if (share > best.share + 1e-9) best = { separator, share };
  }
  return best.separator;
}

export function parseDelimited(text: string): string[][] {
  const source = text.replace(/^\ufeff/, "");
  // Excel's own way to say which sign it is.
  const told = /^sep=(.)(?:\r\n?|\n)/i.exec(source);
  const body = told ? source.slice(told[0].length) : source;
  return records(body, told ? told[1] : separatorOf(body));
}

const CSV_STYLE: FlowStyle = { font: "lib:arimo", size: 10, color: "#000000" };
const NUMERIC = /^[-+(−]?\s?[$€£¥₹]?\s?[-−]?\d[\d.,\s\u00a0']*\s?[%€$£¥₹]?\)?$/;

export function readCsv(text: string): FlowDoc {
  const all = parseDelimited(text);
  while (all.length > 0 && all[all.length - 1].every((field) => field.trim() === "")) all.pop();
  const taken = all.slice(0, MAX_ROWS);
  const count = Math.min(
    MAX_COLS,
    taken.reduce((most, row) => Math.max(most, row.length), 0),
  );
  const [first = [], ...rest] = taken;
  const named = (field: string) => field.trim() !== "" && !NUMERIC.test(field.trim());
  const head = rest.length > 0 && first.length > 1 && first.every(named);
  const rows = taken.map((row, r) => ({
    h: 15,
    cells: row.slice(0, count).map((field): Cell | undefined => {
      const value = field.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
      if (value.trim() === "") return undefined;
      const bold = head && r === 0;
      const cell: Cell = {
        runs: [{ text: value, style: bold ? { ...CSV_STYLE, bold } : CSV_STYLE }],
        wrap: true,
        valign: "top",
      };
      if (!bold && value.length < 30 && NUMERIC.test(value.trim())) {
        cell.align = "right";
        cell.solid = true;
      }
      return cell;
    }),
  }));
  const cols = Array.from({ length: count }, (_, c) => {
    const widest = rows.slice(0, 500).reduce((most, { cells }) => Math.max(most, widthOf(cells[c]?.runs ?? [])), 0);
    return clamp(widest + PAD.left + PAD.right + 6, 36, 220);
  });
  return docOf([
    { name: "", cols, rows, head: head ? 1 : 0, key: 0, lines: "screen", more: all.length - taken.length },
  ]);
}
