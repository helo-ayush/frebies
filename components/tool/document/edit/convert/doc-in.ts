import {
  bitmapFile,
  cleanLink,
  decodeText,
  flatten,
  hexOf,
  isBlank,
  mixColors,
  placeTabs,
  plain,
  readHtml,
  readPlainText,
  round,
  symbolText,
  tidyRuns,
  type Stop,
} from "./html-in";
import {
  buildTable,
  codePage,
  columnWidth,
  Counter,
  countText,
  drawnShape,
  finishAll,
  hangMark,
  headBlocks,
  joinSections,
  makeRoom,
  OFFICE_SHAPES,
  officeColor,
  paintOf,
  readRtf,
  ruledRows,
  scriptOf,
  settlePictures,
  shade,
  splitFirst,
  stretch,
  turned,
  wordLine,
  type Drawing,
  type Edge,
  type Heads,
  type Known,
  type Level,
  type RuledCell,
  type RuledRow,
  type Wraps,
} from "./rtf-in";
import { isCompound, isWebArchive, openCompound } from "./sniff";
import {
  ConvertError,
  type FlowAlign,
  type FlowBlock,
  type FlowBox,
  type FlowDoc,
  type FlowImage,
  type FlowLine,
  type FlowPara,
  type FlowRun,
  type FlowSection,
  type FlowStyle,
} from "./flow";

/**
 * Word's old binary files (.doc). All text stands in one row of characters, cut
 * into pieces; what it looks like is kept beside it as lists of changes ("sprms")
 * to a style, by place in the file.
 */

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const i16 = (b: Uint8Array, at: number) => (u16(b, at) << 16) >> 16;
const i32 = (b: Uint8Array, at: number) => u16(b, at) | (u16(b, at + 2) << 16);
const u32 = (b: Uint8Array, at: number) => i32(b, at) >>> 0;
const utf16 = (b: Uint8Array) => new TextDecoder("utf-16le", { ignoreBOM: true }).decode(b);
const NONE = new Uint8Array(0);

// ---------------------------------------------------------------- what the file is

/**
 * What a file named .doc really holds. Programs save RTF, web pages and new Word
 * files under that name. `readDoc` hands these over to their own readers.
 */
export function docContent(bytes: Uint8Array): "doc" | "docx" | "rtf" | "html" | "text" | "unknown" {
  if (isCompound(bytes)) return "doc";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return "docx";
  const start = decodeText(bytes.subarray(0, 8192)).replace(/^[\s\ufeff]+/, "");
  if (start.startsWith("{\\rtf")) return "rtf";
  // Two bytes a letter is text as well; other zeros are not.
  const wide = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (!wide && bytes.subarray(0, 8192).includes(0)) return "unknown";
  const page = /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(!doctype\s+html|html|head|body|meta|table|div|p)\b/i;
  if (page.test(start) || isWebArchive(start)) return "html";
  return /<(w:wordDocument|pkg:package)\b/.test(start) ? "unknown" : "text";
}

export async function readDoc(bytes: Uint8Array): Promise<FlowDoc> {
  const kind = docContent(bytes);
  if (kind === "rtf") return readRtf(bytes);
  if (kind === "html") return readHtml(decodeText(bytes));
  if (kind === "text") return readPlainText(decodeText(bytes));
  if (kind === "docx") return (await import("./docx-in")).readDocx(bytes);
  const file = openCompound(bytes);
  if (!file)
    throw new ConvertError("This Word file is too old or damaged. Open it in Word, save it as .docx and try again.");
  if (file.names.includes("EncryptedPackage")) throw new ConvertError(LOCKED);
  const main = file.read("WordDocument");
  if (!main || main.length < 512) throw new ConvertError("There is no Word document in this file.");
  if (u16(main, 10) & 0x100) throw new ConvertError(LOCKED);
  const info = properties(file.read("\u0005SummaryInformation"));
  try {
    if (u16(main, 0) !== 0xa5ec) return readOld(main, info);
    const table = file.read(u16(main, 10) & 0x200 ? "1Table" : "0Table") ?? file.read("1Table") ?? file.read("0Table");
    if (!table) throw new ConvertError("This Word file is damaged. Open it in Word, save it again and try once more.");
    const doc = await new Word(main, table, file.read("Data") ?? NONE).read();
    return { ...doc, ...info };
  } catch (error) {
    if (error instanceof ConvertError) throw error;
    throw new ConvertError("This Word file is damaged. Open it in Word, save it again and try once more.");
  }
}

const LOCKED = "This file is locked with a password. Open it in Word, remove the password, save it and try again.";

/** Title and author. */
function properties(stream: Uint8Array | null): Pick<FlowDoc, "title" | "author"> {
  const out: Pick<FlowDoc, "title" | "author"> = {};
  if (!stream || stream.length < 48) return out;
  const base = u32(stream, 44);
  const count = Math.min(60, u32(stream, base + 4));
  const places = new Map<number, number>();
  for (let i = 0; i < count; i += 1) places.set(u32(stream, base + 8 + i * 8), base + u32(stream, base + 12 + i * 8));
  const page = places.has(1) ? u16(stream, (places.get(1) as number) + 4) : 1252;
  const text = (id: number) => {
    const at = places.get(id);
    if (at === undefined || at + 8 > stream.length) return "";
    const length = u32(stream, at + 4);
    const type = u16(stream, at);
    if (type === 0x1f) return utf16(stream.subarray(at + 8, at + 8 + length * 2)).replace(/\0[\s\S]*$/, "");
    if (type !== 0x1e) return "";
    const raw = stream.subarray(at + 8, at + 8 + length);
    if (page === 1200) return utf16(raw).replace(/\0[\s\S]*$/, "");
    return new TextDecoder(codePage(page)).decode(raw).replace(/\0[\s\S]*$/, "");
  };
  const title = plain(text(2)).trim();
  const author = plain(text(4)).trim();
  if (title) out.title = title;
  if (author) out.author = author;
  return out;
}

// ---------------------------------------------------------------- lists of changes

const OPERANDS = [1, 1, 2, 4, 2, 2, 0, 3];

/** Goes through a list of changes: the code of each, and where its value stands. */
function eachSprm(list: Uint8Array, use: (code: number, at: number, size: number) => void) {
  let at = 0;
  while (at + 2 < list.length) {
    const code = u16(list, at);
    at += 2;
    let size = OPERANDS[code >> 13];
    if (code >> 13 === 6) {
      // Long values say how long they are. Two of them have rules of their own.
      if (code === 0xd608) size = u16(list, at) + 1;
      else if (code === 0xc615 && list[at] === 255) {
        const gone = list[at + 1];
        size = 3 + gone * 4 + list[at + 2 + gone * 4] * 3;
      } else size = list[at] + 1;
    }
    if (at + size > list.length) return;
    use(code, at, size);
    at += size;
  }
}

const COLORS = (
  ",#000000,#0000ff,#00ffff,#00ff00,#ff00ff,#ff0000,#ffff00,#ffffff," +
  "#000080,#008080,#008000,#800080,#800000,#808000,#808080,#c0c0c0"
).split(",");
const numbered = (index: number): string | undefined => COLORS[index] || undefined;
/** A colour as Word writes it; undefined when it is "automatic". */
const colorAt = (b: Uint8Array, at: number) => (b[at + 3] === 0xff ? undefined : hexOf(b[at], b[at + 1], b[at + 2]));
const shadeAt = (b: Uint8Array, at: number) => shade(colorAt(b, at), colorAt(b, at + 4), u16(b, at + 8));

function oldShade(value: number): string | undefined {
  if (value === 0xffff) return undefined;
  return shade(numbered(value & 31), numbered((value >> 5) & 31), value >> 10);
}

const lineAt = (b: Uint8Array, at: number): Edge =>
  u32(b, at + 4) === 0xffffffff || b[at + 5] === 0xff
    ? null
    : u16(b, at + 4) === 0
      ? undefined
      : wordLine(b[at + 5], b[at + 4], colorAt(b, at));
const oldLineAt = (b: Uint8Array, at: number): Edge =>
  u32(b, at) === 0xffffffff ? null : u16(b, at) === 0 ? undefined : wordLine(b[at + 1], b[at], numbered(b[at + 2]));

// ---------------------------------------------------------------- characters

type Chp = {
  /** Fonts by number: for plain letters, other ones, East Asian and complex scripts. */
  ascii: number;
  other: number;
  east: number;
  complex: number;
  /** In half points. */
  size: number;
  sizeC: number;
  bold: boolean;
  boldC: boolean;
  italic: boolean;
  italicC: boolean;
  underline: boolean;
  strike: boolean;
  double: boolean;
  caps: boolean;
  small: boolean;
  hidden: boolean;
  deleted: boolean;
  color?: string;
  marker?: string;
  fill?: string;
  script: number;
  tracking: number;
  /** Not text: stands for a picture, a number and the like. */
  special: boolean;
  data: boolean;
  object: boolean;
  picture: number;
  symbol: [number, number] | null;
  /** All letters take the looks of complex scripts. */
  asComplex: boolean;
  rtl: boolean;
};

const CHP: Chp = {
  ascii: 0,
  other: 0,
  east: 0,
  complex: 0,
  size: 20,
  sizeC: 20,
  bold: false,
  boldC: false,
  italic: false,
  italicC: false,
  underline: false,
  strike: false,
  double: false,
  caps: false,
  small: false,
  hidden: false,
  deleted: false,
  script: 0,
  tracking: 0,
  special: false,
  data: false,
  object: false,
  picture: -1,
  symbol: null,
  asComplex: false,
  rtl: false,
};

/** `style` is what switches are measured against: some only say "the other way round". */
function applyChp(chp: Chp, list: Uint8Array, style: Chp) {
  eachSprm(list, (code, at) => {
    const value = list[at];
    const flag = (was: boolean) => (value === 0x80 ? was : value === 0x81 ? !was : value !== 0);
    switch (code) {
      case 0x0800:
        chp.deleted = flag(style.deleted);
        break;
      case 0x6a03:
        chp.picture = u32(list, at);
        break;
      case 0x0806:
        chp.data = flag(style.data);
        break;
      case 0x6a09:
        chp.symbol = [u16(list, at), u16(list, at + 2)];
        break;
      case 0x080a:
        chp.object = flag(style.object);
        break;
      case 0x2a0c:
        chp.marker = numbered(value);
        break;
      case 0x2a33:
        Object.assign(chp, style);
        break;
      case 0x0835:
        chp.bold = flag(style.bold);
        break;
      case 0x0836:
        chp.italic = flag(style.italic);
        break;
      case 0x0837:
        chp.strike = flag(style.strike);
        break;
      case 0x083a:
        chp.small = flag(style.small);
        break;
      case 0x083b:
        chp.caps = flag(style.caps);
        break;
      case 0x083c:
        chp.hidden = flag(style.hidden);
        break;
      case 0x2a3e:
        chp.underline = value !== 0 && value !== 5;
        break;
      case 0x8840:
        chp.tracking = i16(list, at) / 20;
        break;
      case 0x2a42:
        chp.color = numbered(value);
        break;
      case 0x4a43:
        if (u16(list, at) > 1) chp.size = u16(list, at);
        break;
      case 0x2a48:
        chp.script = value;
        break;
      case 0x4a4f:
        chp.ascii = u16(list, at);
        break;
      case 0x4a50:
        chp.east = u16(list, at);
        break;
      case 0x4a51:
        chp.other = u16(list, at);
        break;
      case 0x2a53:
        chp.double = value !== 0;
        break;
      case 0x0855:
        chp.special = flag(style.special);
        break;
      case 0x085c:
        chp.boldC = flag(style.boldC);
        break;
      case 0x085d:
        chp.italicC = flag(style.italicC);
        break;
      case 0x4a5e:
        chp.complex = u16(list, at);
        break;
      case 0x4a61:
        if (u16(list, at) > 1) chp.sizeC = u16(list, at);
        break;
      case 0x4866:
        chp.fill = oldShade(u16(list, at));
        break;
      case 0x6870:
        chp.color = colorAt(list, at);
        break;
      case 0xca71:
        chp.fill = shadeAt(list, at + 1);
        break;
      case 0x0882:
        chp.asComplex = flag(style.asComplex);
        break;
      case 0x085a:
        chp.rtl = flag(style.rtl);
        break;
    }
  });
}

// ---------------------------------------------------------------- paragraphs

type Pap = {
  style: number;
  align: number;
  /** The alignment counts from where the text starts, not from the left. */
  logical: boolean;
  rtl: boolean;
  /** In twentieths of a point. */
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
  /** Which list, and how deep. */
  list: number;
  level: number;
  /** The numbering of files that come from Word 6. */
  oldList: Uint8Array | null;
  tabs: Map<number, number>;
  fill?: string;
  border: { top?: Edge; left?: Edge; bottom?: Edge; right?: Edge; between?: Edge };
  inTable: boolean;
  rowEnd: boolean;
  depth: number;
  innerCell: boolean;
  innerRow: boolean;
  drop: number;
  frame: number | null;
  /** Everything said about the row a paragraph ends. */
  row: Uint8Array[];
};

const PAP: Pap = {
  style: 0,
  align: 0,
  logical: true,
  rtl: false,
  left: 0,
  right: 0,
  first: 0,
  before: 0,
  after: 0,
  autoBefore: false,
  autoAfter: false,
  contextual: false,
  line: 240,
  multiple: true,
  keepNext: false,
  pageBreak: false,
  outline: 9,
  list: 0,
  level: 0,
  oldList: null,
  tabs: new Map(),
  border: {},
  inTable: false,
  rowEnd: false,
  depth: 0,
  innerCell: false,
  innerRow: false,
  drop: 0,
  frame: null,
  row: [],
};

const copyPap = (pap: Pap): Pap => ({ ...pap, tabs: new Map(pap.tabs), border: { ...pap.border }, row: [...pap.row] });

function applyPap(pap: Pap, list: Uint8Array, data: Uint8Array) {
  let hasRow = false;
  let sides = false;
  eachSprm(list, (code, at) => {
    const value = list[at];
    switch (code) {
      case 0x2403:
        pap.align = value;
        pap.logical = false;
        break;
      case 0x2461:
        pap.align = value;
        pap.logical = true;
        break;
      case 0x2406:
        pap.keepNext = value !== 0;
        break;
      case 0x2407:
        pap.pageBreak = value !== 0;
        break;
      case 0x2602:
        pap.level = Math.max(0, Math.min(8, pap.level + ((value << 24) >> 24)));
        break;
      case 0x260a:
        pap.level = value;
        break;
      case 0x460b:
        pap.list = u16(list, at);
        break;
      case 0xc63e:
        pap.oldList = list.subarray(at + 1, at + 1 + list[at]);
        break;
      case 0x840e:
        sides = true;
        pap.right = i16(list, at);
        break;
      case 0x840f:
        sides = true;
        pap.left = i16(list, at);
        break;
      case 0x845d:
        pap.right = i16(list, at);
        break;
      case 0x845e:
        pap.left = i16(list, at);
        break;
      case 0x4610:
      case 0x465f:
        pap.left = Math.max(0, pap.left + i16(list, at));
        break;
      case 0x8411:
      case 0x8460:
        pap.first = i16(list, at);
        break;
      case 0x6412:
        pap.line = i16(list, at);
        pap.multiple = u16(list, at + 2) !== 0;
        break;
      case 0xa413:
        pap.before = u16(list, at);
        break;
      case 0xa414:
        pap.after = u16(list, at);
        break;
      case 0x245b:
        pap.autoBefore = value !== 0;
        break;
      case 0x245c:
        pap.autoAfter = value !== 0;
        break;
      case 0x246d:
        pap.contextual = value !== 0;
        break;
      case 0xc60d:
      case 0xc615: {
        let place = at + 1;
        const gone = list[place];
        const wide = code === 0xc615 ? 4 : 2;
        for (let i = 0; i < gone; i += 1) {
          const tab = i16(list, place + 1 + i * 2);
          const near = code === 0xc615 ? Math.max(25, i16(list, place + 1 + gone * 2 + i * 2)) : 25;
          for (const known of [...pap.tabs.keys()]) if (Math.abs(known - tab) <= near) pap.tabs.delete(known);
        }
        place += 1 + gone * wide;
        const added = list[place];
        for (let i = 0; i < added; i += 1) pap.tabs.set(i16(list, place + 1 + i * 2), list[place + 1 + added * 2 + i]);
        break;
      }
      case 0x2416:
        pap.inTable = value !== 0;
        break;
      case 0x2417:
        pap.rowEnd = value !== 0;
        break;
      case 0x6649:
        pap.depth = i32(list, at);
        break;
      case 0x664a:
        pap.depth += i32(list, at);
        break;
      case 0x244b:
        pap.innerCell = value !== 0;
        break;
      case 0x244c:
        pap.innerRow = value !== 0;
        break;
      case 0x8418:
        pap.frame = i16(list, at);
        break;
      case 0x442c:
        pap.drop = u16(list, at) & 7;
        break;
      case 0x2640:
        pap.outline = value;
        break;
      case 0x2441:
        // The old indents are for the left and right, the new ones for the start and end of a line.
        if (value !== 0 && sides) [pap.left, pap.right] = [pap.right, pap.left];
        pap.rtl = value !== 0;
        break;
      case 0x442d:
        pap.fill = oldShade(u16(list, at));
        break;
      case 0xc64d:
        pap.fill = shadeAt(list, at + 1);
        break;
      case 0x6424:
        pap.border.top = oldLineAt(list, at);
        break;
      case 0x6425:
        pap.border.left = oldLineAt(list, at);
        break;
      case 0x6426:
        pap.border.bottom = oldLineAt(list, at);
        break;
      case 0x6427:
        pap.border.right = oldLineAt(list, at);
        break;
      case 0x6428:
        pap.border.between = oldLineAt(list, at);
        break;
      case 0xc64e:
        pap.border.top = lineAt(list, at + 1);
        break;
      case 0xc64f:
        pap.border.left = lineAt(list, at + 1);
        break;
      case 0xc650:
        pap.border.bottom = lineAt(list, at + 1);
        break;
      case 0xc651:
        pap.border.right = lineAt(list, at + 1);
        break;
      case 0xc652:
        pap.border.between = lineAt(list, at + 1);
        break;
      case 0x6645:
      case 0x6646: {
        // Too long to stand here: the list goes on in the Data stream.
        const place = u32(list, at);
        if (place + 2 <= data.length) applyPap(pap, data.subarray(place + 2, place + 2 + u16(data, place)), data);
        break;
      }
      case 0xd608:
        hasRow = true;
        break;
      case 0x646b: {
        const place = u32(list, at);
        if (place + 2 <= data.length) pap.row.push(data.subarray(place + 2, place + 2 + u16(data, place)));
        break;
      }
    }
  });
  // The row as older versions need it is complete; the other copy is only for when that is missing.
  if (hasRow) pap.row = [list];
}

// ---------------------------------------------------------------- table rows

type Cell = { merge: number; down: number; valign: number; border: Edge[]; fill?: string };
type Row = {
  edges: number[];
  cells: Cell[];
  /** Half the space between the words of two cells. */
  gap: number;
  align: number;
  height: number;
  head: boolean;
  rtl: boolean;
  /** Top, left, bottom, right, between rows, between columns. */
  lines: Edge[];
  pad: { top: number; left: number; bottom: number; right: number };
  /** How wide the table wants to be, in points or (negative) as a share, and where its words start. */
  width: number;
  indent: number | null;
};

const newCell = (): Cell => ({ merge: 0, down: 0, valign: 0, border: [undefined, undefined, undefined, undefined] });
const SIDES4 = [1, 2, 4, 8];

function applyRow(row: Row, list: Uint8Array) {
  const cells = (from: number, to: number) => row.cells.slice(from, Math.max(from, to));
  const shades = (at: number, from: number) => {
    for (let i = 0; i * 10 + 10 <= list[at]; i += 1) {
      const cell = row.cells[from + i];
      if (cell) cell.fill = shadeAt(list, at + 1 + i * 10);
    }
  };
  const shift = (by: number) => {
    row.edges = row.edges.map((edge) => edge + by);
  };
  eachSprm(list, (code, at, size) => {
    const value = list[at];
    switch (code) {
      case 0x5400:
      case 0x548a:
        row.align = u16(list, at);
        break;
      case 0x9601:
        if (row.edges.length > 0) shift(i16(list, at) - row.edges[0] - row.gap);
        else row.edges = [i16(list, at)];
        break;
      case 0x9602: {
        const gap = i16(list, at);
        if (row.edges.length > 0) shift(row.gap - gap);
        row.gap = gap;
        break;
      }
      case 0x3404:
        row.head = value !== 0;
        break;
      case 0x9407:
        row.height = i16(list, at);
        break;
      case 0x560b:
      case 0x5664:
        row.rtl = u16(list, at) !== 0;
        break;
      case 0xd605:
        for (let i = 0; i < 6 && i * 4 + 4 <= value; i += 1) row.lines[i] = oldLineAt(list, at + 1 + i * 4);
        break;
      case 0xd613:
        for (let i = 0; i < 6 && i * 8 + 8 <= value; i += 1) row.lines[i] = lineAt(list, at + 1 + i * 8);
        break;
      case 0xd608: {
        const count = list[at + 2];
        row.edges = [];
        row.cells = [];
        for (let i = 0; i <= count; i += 1) row.edges.push(i16(list, at + 3 + i * 2));
        const start = at + 3 + (count + 1) * 2;
        for (let i = 0; i < count; i += 1) {
          const cell = newCell();
          const place = start + i * 20;
          if (place + 20 <= at + size) {
            const flags = u16(list, place);
            cell.merge = flags & 3;
            cell.down = (flags >> 5) & 3;
            cell.valign = (flags >> 7) & 3;
            for (let side = 0; side < 4; side += 1) cell.border[side] = oldLineAt(list, place + 4 + side * 4);
          }
          row.cells.push(cell);
        }
        break;
      }
      case 0xd609:
        for (let i = 0; i * 2 + 2 <= value; i += 1)
          if (row.cells[i]) row.cells[i].fill = oldShade(u16(list, at + 1 + i * 2));
        break;
      case 0xd612:
        shades(at, 0);
        break;
      case 0xd616:
        shades(at, 22);
        break;
      case 0xd60c:
        shades(at, 44);
        break;
      case 0xd61a:
      case 0xd61b:
      case 0xd61c:
      case 0xd61d: {
        // Colours of the lines the cells have on one side.
        const side = [0, 1, 2, 3][code - 0xd61a];
        for (let i = 0; i * 4 + 4 <= value; i += 1) {
          const line = row.cells[i]?.border[side];
          const color = u32(list, at + 1 + i * 4) === 0xffffffff ? undefined : colorAt(list, at + 1 + i * 4);
          if (line && color) row.cells[i].border[side] = { ...line, color };
        }
        break;
      }
      case 0xd620:
      case 0xd62f: {
        const line = code === 0xd620 ? oldLineAt(list, at + 4) : lineAt(list, at + 4);
        for (const cell of cells(list[at + 1], list[at + 2]))
          SIDES4.forEach((bit, side) => {
            if (list[at + 3] & bit) cell.border[side] = line ?? null;
          });
        break;
      }
      case 0x7621: {
        const [from, count, width] = [list[at], list[at + 1], u16(list, at + 2)];
        if (row.edges.length === 0) row.edges = [0];
        for (let i = 0; i < count && row.cells.length < 64; i += 1) {
          const place = Math.min(from + i, row.cells.length);
          row.cells.splice(place, 0, newCell());
          row.edges.splice(place + 1, 0, row.edges[place]);
          for (let k = place + 1; k < row.edges.length; k += 1) row.edges[k] += width;
        }
        break;
      }
      case 0x5622: {
        const [from, to] = [list[at], Math.min(list[at + 1], row.cells.length)];
        const width = (row.edges[to] ?? 0) - (row.edges[from] ?? 0);
        row.cells.splice(from, Math.max(0, to - from));
        row.edges.splice(from + 1, Math.max(0, to - from));
        for (let k = from + 1; k < row.edges.length; k += 1) row.edges[k] -= width;
        break;
      }
      case 0x7623: {
        const width = u16(list, at + 2);
        for (let i = list[at]; i < list[at + 1] && i + 1 < row.edges.length; i += 1) {
          const by = width - (row.edges[i + 1] - row.edges[i]);
          for (let k = i + 1; k < row.edges.length; k += 1) row.edges[k] += by;
        }
        break;
      }
      case 0x5624:
        cells(list[at], list[at + 1]).forEach((cell, i) => {
          cell.merge = i === 0 ? 2 : 1;
        });
        break;
      case 0x5625:
        for (const cell of cells(list[at], list[at + 1])) cell.merge = 0;
        break;
      case 0xd62b:
        if (row.cells[list[at + 1]]) row.cells[list[at + 1]].down = list[at + 2] & 3;
        break;
      case 0xd62c:
        for (const cell of cells(list[at + 1], list[at + 2])) cell.valign = list[at + 3];
        break;
      case 0xd62d:
        for (const cell of cells(list[at + 1], list[at + 2])) cell.fill = shadeAt(list, at + 3);
        break;
      case 0xf614:
        if (value === 3) row.width = u16(list, at + 1) / 20;
        else if (value === 2) row.width = -u16(list, at + 1) / 5000;
        break;
      case 0xf661:
        if (value === 3) row.indent = i16(list, at + 1) / 20;
        break;
      case 0xd634:
        // Room inside the cells of the whole row.
        if (list[at + 4] === 3 || list[at + 4] === 0) {
          const room = u16(list, at + 5) / 20;
          if (list[at + 3] & 1) row.pad.top = room;
          if (list[at + 3] & 2) row.pad.left = room;
          if (list[at + 3] & 4) row.pad.bottom = room;
          if (list[at + 3] & 8) row.pad.right = room;
        }
        break;
    }
  });
}

// ---------------------------------------------------------------- styles and lists

type Style = { kind: number; base: number; id: number; name: string; para: Uint8Array; text: Uint8Array };
type WordLevel = Level & { para: Uint8Array; chars: Uint8Array };
type Override = { starts: Map<number, number>; levels: Map<number, WordLevel> };

type Piece = { cp: number; end: number; fc: number; wide: boolean; prm: number };
type Bin = { from: number; to: number; style: number; list: Uint8Array };
type Span = { from: number; to: number; list: Uint8Array; prm: number; id: number };
type Para = { from: number; to: number; mark: number; pap: Pap };
type Field = { code: string; result: boolean; hide: boolean; link?: string; put?: string; box?: string };
type Story = {
  where: "main" | "head" | "note" | "box";
  base: number;
  fields: Field[];
  notes?: string[];
  width: number;
};
type Section = { from: number; to: number; list: Uint8Array };

/** What a short change kept in a piece stands for. */
// prettier-ignore
const SHORT: Record<number, number> = {
  0x04: 0x2602, 0x05: 0x2403, 0x07: 0x2405, 0x08: 0x2406, 0x09: 0x2407, 0x0c: 0x260a, 0x18: 0x2416, 0x19: 0x2417,
  0x41: 0x0800, 0x42: 0x0801, 0x43: 0x0802, 0x4d: 0x2a0c, 0x53: 0x2a33, 0x55: 0x0835, 0x56: 0x0836, 0x57: 0x0837,
  0x58: 0x0838, 0x59: 0x0839, 0x5a: 0x083a, 0x5b: 0x083b, 0x5c: 0x083c, 0x5e: 0x2a3e, 0x62: 0x2a42, 0x68: 0x2a48,
  0x73: 0x2a53, 0x75: 0x0855, 0x78: 0x2640,
};

// ---------------------------------------------------------------- drawings

type Shape = {
  id: number;
  type: number;
  flags: number;
  props: Map<number, number>;
  long: Map<number, Uint8Array>;
  text: number;
  kids: Shape[];
  /** A group's own measures, and where a shape stands in its group. */
  space: number[] | null;
  place: number[] | null;
};
type Anchor = { id: number; rect: number[]; flags: number };

/** Goes through the records of a drawing. */
function eachRecord(
  b: Uint8Array,
  from: number,
  to: number,
  use: (type: number, at: number, end: number, extra: number) => void,
) {
  let at = from;
  while (at + 8 <= to) {
    const end = Math.min(to, at + 8 + u32(b, at + 4));
    use(u16(b, at + 2), at + 8, end, u16(b, at) >> 4);
    at = Math.max(end, at + 8);
  }
}

/** A picture record. Drawings made of instructions (EMF, WMF, PICT) are left out. */
function pictureRecord(b: Uint8Array, at: number): { bytes: Uint8Array; mime: string } | null {
  const mime = {
    0xf01d: "image/jpeg",
    0xf02a: "image/jpeg",
    0xf01e: "image/png",
    0xf01f: "image/bmp",
    0xf029: "image/tiff",
  }[u16(b, at + 2)];
  const end = at + 8 + u32(b, at + 4);
  if (!mime || end > b.length + 8) return null;
  // One or two fingerprints and a mark stand before the picture.
  const start = at + 8 + (u16(b, at) & 0x10 ? 32 : 16) + 1;
  const bytes = b.subarray(start, Math.min(end, b.length));
  return bytes.length < 16 ? null : { bytes: mime === "image/bmp" ? bitmapFile(bytes) : bytes, mime };
}

/** An entry of the picture list, with its picture in it or elsewhere in the document. */
function pictureEntry(b: Uint8Array, at: number, main: Uint8Array): { bytes: Uint8Array; mime: string } | null {
  if (u16(b, at + 2) !== 0xf007) return pictureRecord(b, at);
  const body = at + 8;
  const inside = body + 36 + b[body + 33];
  if (inside + 8 < at + 8 + u32(b, at + 4)) return pictureRecord(b, inside);
  const place = u32(b, body + 28);
  return place !== 0xffffffff && place + 8 < main.length ? pictureRecord(main, place) : null;
}

/** The properties of shapes that are lists. */
const LISTS = new Set([0x145, 0x146, 0x151, 0x152, 0x155, 0x156, 0x157, 0x197, 0x1cf, 0x383]);

/** A list among the properties of a shape: pairs of numbers, or single ones. */
function listed(b: Uint8Array | undefined): [number, number][] {
  if (!b || b.length < 6) return [];
  const size = u16(b, 4);
  // Corners in short: two bytes for each number.
  const wide = size === 0xfff0 ? 4 : size;
  const read = (at: number): [number, number] =>
    wide === 8 ? [i32(b, at), i32(b, at + 4)] : wide === 4 ? [i16(b, at), i16(b, at + 2)] : [i16(b, at), 0];
  const count = Math.min(u16(b, 0), wide > 1 ? Math.floor((b.length - 6) / wide) : 0);
  return Array.from({ length: count }, (_, i) => read(6 + i * wide));
}

function readShape(b: Uint8Array, from: number, to: number): Shape {
  const shape: Shape = {
    id: 0,
    type: 0,
    flags: 0,
    props: new Map(),
    long: new Map(),
    text: 0,
    kids: [],
    space: null,
    place: null,
  };
  eachRecord(b, from, to, (type, at, end, extra) => {
    if (type === 0xf00a) {
      shape.type = extra;
      shape.id = u32(b, at);
      shape.flags = u32(b, at + 4);
    } else if (type === 0xf00b || type === 0xf121 || type === 0xf122) {
      let rest = at + extra * 6;
      for (let i = 0; i < extra; i += 1) {
        const code = u16(b, at + i * 6);
        const id = code & 0x3fff;
        const value = u32(b, at + i * 6 + 2);
        shape.props.set(id, value);
        if (code & 0x8000) {
          // The six bytes in front of a list are not always counted.
          const each = LISTS.has(id) && rest + 6 <= end ? u16(b, rest + 4) : 0;
          const size = each && u16(b, rest) * (each === 0xfff0 ? 4 : each) === value ? value + 6 : value;
          shape.long.set(id, b.subarray(rest, Math.min(end, rest + size)));
          rest += size;
        }
      }
    } else if (type === 0xf00d) shape.text = u16(b, at + 2);
    else if (type === 0xf009) shape.space = [0, 4, 8, 12].map((k) => i32(b, at + k));
    else if (type === 0xf00f) shape.place = [0, 4, 8, 12].map((k) => i32(b, at + k));
  });
  return shape;
}

function readShapes(b: Uint8Array, from: number, to: number, into: Shape[]) {
  eachRecord(b, from, to, (type, at, end) => {
    if (type === 0xf004) into.push(readShape(b, at, end));
    else if (type === 0xf003) {
      const kids: Shape[] = [];
      readShapes(b, at, end, kids);
      const [group, ...rest] = kids;
      // The first shape of a group is the group itself; the outermost one only holds the page's shapes.
      if (group && group.flags & 4) into.push(...rest);
      else if (group) into.push({ ...group, kids: rest });
    } else if (type === 0xf002) readShapes(b, at, end, into);
  });
}

// ---------------------------------------------------------------- the document

class Word {
  private text = "";
  private pieces: Piece[] = [];
  private spans: Span[] = [];
  private paps: Bin[] = [];
  private changes: Uint8Array[] = [];
  private styles: (Style | null)[] = [];
  private fonts: string[] = [];
  private chpBase: Chp = { ...CHP };
  private papBase = NONE;
  private lists = new Map<number, WordLevel[]>();
  private uses: { list: number; over: Override }[] = [];
  private sections: Section[] = [];
  private counter = new Counter();
  private known: Known = { info: new Map(), counts: new Map(), larger: false };
  private chpCache = new Map<string, Chp>();
  private styleCache = new Map<string, Chp>();
  private papCache = new Map<string, Pap>();
  private flowStyles = new Map<string, FlowStyle>();
  private shapes = new Map<number, Shape>();
  private blips: ({ bytes: Uint8Array; mime: string } | null)[] = [];
  private images: FlowImage[] = [];
  private wraps: Wraps = new Map();
  private notes = new Map<number, { mark: string; kind: "foot" | "end"; index: number }>();
  /** Lengths of the stories: text, footnotes, headers, comments, endnotes, boxes, boxes of headers. */
  private ccp: Record<"text" | "foot" | "head" | "note" | "end" | "box" | "headBox", number>;
  private fib: number;

  constructor(
    private main: Uint8Array,
    private table: Uint8Array,
    private data: Uint8Array,
  ) {
    const longs = 34 + u16(main, 32) * 2 + 2;
    const long = (i: number) => Math.max(0, i32(main, longs + i * 4));
    this.ccp = {
      text: long(3),
      foot: long(4),
      head: long(5),
      note: long(7),
      end: long(8),
      box: long(9),
      headBox: long(10),
    };
    this.fib = longs + u16(main, longs - 2) * 4;
  }

  /** A part of the table stream, by its number in the file's directory. */
  private part(index: number): Uint8Array {
    if (index >= u16(this.main, this.fib)) return NONE;
    const at = this.fib + 2 + index * 8;
    const start = u32(this.main, at);
    const length = u32(this.main, at + 4);
    return length === 0 || start >= this.table.length ? NONE : this.table.subarray(start, start + length);
  }

  async read(): Promise<FlowDoc> {
    const settings = this.part(31);
    this.known.larger = settings.length >= 516 && (settings[512] & 4) === 0;
    this.readPieces();
    this.readFonts();
    this.readStyles();
    this.readLists();
    this.readRuns();
    this.readSections();
    this.readNotes();
    this.readDrawings();

    const built = this.sections.map((section, i) => {
      const page = this.page(section);
      const width = columnWidth(page.section);
      const story: Story = { where: "main", base: 0, fields: i === 0 ? [] : this.open, notes: [], width };
      this.open = story.fields;
      const blocks = this.blocks(section.from, section.to, story, page.section);
      page.section.blocks = makeRoom(blocks, this.wraps, width);
      return { ...page, heads: this.headers(i, page.section, page.firstOwn) };
    });
    if (built.length === 0) throw new Error("empty");
    const sections = joinSections(
      built.flatMap(({ section, goesOn, heads }) =>
        splitFirst(section, heads).map((one, i) => ({ section: one, goesOn: goesOn && i === 0 })),
      ),
    );
    this.addNotes(sections[sections.length - 1]);
    for (const section of sections)
      for (const blocks of [section.blocks, section.header, section.footer]) if (blocks) finishAll(blocks, this.known);
    await settlePictures(sections, this.images);
    return { kind: "flow", sections };
  }

  private open: Field[] = [];

  // ---------------------------------------------------------------- reading the parts

  private readPieces() {
    const clx = this.part(33);
    let at = 0;
    while (at + 3 <= clx.length && clx[at] === 1) {
      const size = i16(clx, at + 1);
      this.changes.push(clx.subarray(at + 3, at + 3 + Math.max(0, size)));
      at += 3 + Math.max(0, size);
    }
    const total = Object.values(this.ccp).reduce((sum, one) => sum + one, 0) + 1;
    if (clx[at] === 2) {
      const table = clx.subarray(at + 5, at + 5 + u32(clx, at + 1));
      const count = Math.floor((table.length - 4) / 12);
      for (let i = 0; i < count; i += 1) {
        const place = (count + 1) * 4 + i * 8;
        const raw = u32(table, place + 2);
        const wide = (raw & 0x40000000) === 0;
        const start = raw & 0x3fffffff;
        const piece = {
          cp: u32(table, i * 4),
          end: u32(table, i * 4 + 4),
          fc: wide ? start : start >> 1,
          wide,
          prm: u16(table, place + 6),
        };
        if (piece.end > piece.cp && piece.cp === (this.pieces[this.pieces.length - 1]?.end ?? 0))
          this.pieces.push(piece);
      }
    }
    if (this.pieces.length === 0) this.pieces.push({ cp: 0, end: total, fc: u32(this.main, 24), wide: false, prm: 0 });
    const parts: string[] = [];
    for (const piece of this.pieces) {
      const length = piece.end - piece.cp;
      const raw = this.main.subarray(piece.fc, piece.fc + length * (piece.wide ? 2 : 1));
      const text = piece.wide
        ? utf16(raw.length % 2 ? raw.subarray(0, raw.length - 1) : raw)
        : new TextDecoder("windows-1252").decode(raw);
      // Every place must hold one character, or all that follow move.
      parts.push(text.length >= length ? text.slice(0, length) : text.padEnd(length, "\0"));
    }
    this.text = parts.join("");
  }

  private readFonts() {
    const list = this.part(15);
    const count = u16(list, 0);
    let at = 4;
    for (let i = 0; i < count && at < list.length; i += 1) {
      const size = list[at];
      const name = utf16(list.subarray(at + 40, at + 1 + size - ((size - 39) % 2)));
      this.fonts.push(name.split("\0")[0]);
      at += 1 + size;
    }
  }

  private readStyles() {
    const sheet = this.part(1);
    const size = u16(sheet, 0);
    const head = sheet.subarray(2, 2 + size);
    const count = u16(head, 0);
    const fixed = u16(head, 2);
    const base = this.chpBase;
    base.ascii = u16(head, 12);
    base.east = u16(head, 14);
    base.other = u16(head, 16);
    base.complex = head.length >= 20 ? u16(head, 18) : 0;
    // What the whole document starts from stands after a list about hidden styles.
    const latent = 22 + u16(head, 6) * u16(head, 20);
    if (head.length > latent + 4) {
      const chars = u32(head, latent);
      if (latent + 4 + chars <= head.length) {
        applyChp(base, head.subarray(latent + 4, latent + 4 + chars), { ...base });
        const paras = u32(head, latent + 4 + chars);
        this.papBase = head.subarray(latent + 8 + chars, Math.min(head.length, latent + 8 + chars + paras));
      }
    }
    let at = 2 + size;
    for (let i = 0; i < count && at + 2 <= sheet.length; i += 1) {
      const length = u16(sheet, at);
      at += 2;
      if (length === 0) {
        this.styles.push(null);
        continue;
      }
      const std = sheet.subarray(at, at + length);
      at += length;
      const kind = u16(std, 2) & 15;
      const style: Style = { kind, base: u16(std, 2) >> 4, id: u16(std, 0) & 0xfff, name: "", para: NONE, text: NONE };
      const letters = u16(std, fixed);
      style.name = utf16(std.subarray(fixed + 2, fixed + 2 + letters * 2));
      let place = fixed + 2 + letters * 2 + 2;
      const parts: Uint8Array[] = [];
      for (let k = 0; k < (u16(std, 4) & 15) && place + 2 <= std.length; k += 1) {
        place += place % 2;
        const long = u16(std, place);
        parts.push(std.subarray(place + 2, place + 2 + long));
        place += 2 + long;
      }
      // The first two bytes of paragraph formatting only repeat the style's number.
      if (kind === 1) [style.para, style.text] = [(parts[0] ?? NONE).subarray(2), parts[1] ?? NONE];
      else if (kind === 2) style.text = parts[0] ?? NONE;
      this.styles.push(style);
    }
  }

  private readLevel(b: Uint8Array, at: number): [WordLevel, number] {
    const chars = b[at + 24];
    const paras = b[at + 25];
    const flags = b[at + 5];
    const para = b.subarray(at + 28, at + 28 + paras);
    const look = b.subarray(at + 28 + paras, at + 28 + paras + chars);
    const place = at + 28 + paras + chars;
    const letters = u16(b, place);
    let font: string | undefined;
    eachSprm(look, (code, where) => {
      if (code === 0x4a4f || (code === 0x4a51 && font === undefined)) font = this.fonts[u16(look, where)];
    });
    const level: WordLevel = {
      kind: b[at + 4],
      start: i32(b, at),
      text: utf16(b.subarray(place + 2, place + 2 + letters * 2)),
      font,
      follow: b[at + 15],
      side: flags & 3,
      legal: (flags & 4) !== 0,
      restart: flags & 8 ? b[at + 26] : 9,
      para,
      chars: look,
    };
    return [level, place + 2 + letters * 2];
  }

  private readLists() {
    const start = u32(this.main, this.fib + 2 + 73 * 8);
    if (this.part(73).length >= 2) {
      // The levels follow the list of lists, past its stated end.
      const b = this.table.subarray(start);
      const count = u16(b, 0);
      let at = 2 + count * 28;
      for (let i = 0; i < count; i += 1) {
        const levels: WordLevel[] = [];
        const many = b[2 + i * 28 + 26] & 1 ? 1 : 9;
        for (let k = 0; k < many && at + 28 <= b.length; k += 1) {
          const [level, next] = this.readLevel(b, at);
          level.restart = Math.min(level.restart, k);
          levels.push(level);
          at = next;
        }
        this.lists.set(u32(b, 2 + i * 28), levels);
      }
    }
    const uses = this.part(74);
    const count = u32(uses, 0);
    let at = 4 + count * 16;
    for (let i = 0; i < count && 4 + i * 16 + 16 <= uses.length; i += 1) {
      const over: Override = { starts: new Map(), levels: new Map() };
      at += 4;
      for (let k = 0; k < uses[4 + i * 16 + 12] && at + 8 <= uses.length; k += 1) {
        const flags = u32(uses, at + 4);
        if (flags & 16) over.starts.set(flags & 15, i32(uses, at));
        at += 8;
        if (flags & 32) {
          const [level, next] = this.readLevel(uses, at);
          level.restart = Math.min(level.restart, flags & 15);
          over.levels.set(flags & 15, level);
          if (flags & 16) over.starts.set(flags & 15, level.start);
          at = next;
        }
      }
      this.uses.push({ list: u32(uses, 4 + i * 16), over });
    }
  }

  private levels(list: number): WordLevel[] | null {
    const use = this.uses[list - 1];
    const levels = use && this.lists.get(use.list);
    if (!levels) return null;
    if (use.over.levels.size === 0) return levels;
    return levels.map((level, i) => use.over.levels.get(i) ?? level);
  }

  /** The formatting kept by pages of 512 bytes. */
  private bins(index: number, paragraphs: boolean): Bin[] {
    const list = this.part(index);
    const count = Math.max(0, Math.floor((list.length - 4) / 8));
    const out: Bin[] = [];
    for (let i = 0; i < count; i += 1) {
      const page = this.main.subarray((u32(list, (count + 1) * 4 + i * 4) & 0x3fffff) * 512).subarray(0, 512);
      const runs = page[511];
      if (page.length < 512) continue;
      for (let k = 0; k < runs; k += 1) {
        const bin: Bin = { from: u32(page, k * 4), to: u32(page, k * 4 + 4), style: 0, list: NONE };
        const place = page[(runs + 1) * 4 + k * (paragraphs ? 13 : 1)] * 2;
        if (place > 0 && place < 511) {
          if (!paragraphs) bin.list = page.subarray(place + 1, place + 1 + page[place]);
          else {
            const short = page[place] === 0;
            const start = short ? place + 2 : place + 1;
            const size = short ? page[place + 1] * 2 : page[place] * 2 - 1;
            bin.style = u16(page, start);
            bin.list = page.subarray(start + 2, start + size);
          }
        }
        if (bin.to > bin.from) out.push(bin);
      }
    }
    return out.sort((a, b) => a.from - b.from);
  }

  private find(bins: Bin[], fc: number): number {
    let low = 0;
    let high = bins.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (bins[mid].to <= fc) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private readRuns() {
    this.paps = this.bins(13, true);
    const bins = this.bins(12, false);
    for (const piece of this.pieces) {
      const step = piece.wide ? 2 : 1;
      const last = piece.fc + (piece.end - piece.cp) * step;
      let fc = piece.fc;
      for (let i = this.find(bins, fc); fc < last; i += 1) {
        const bin = bins[i];
        const from = fc;
        if (!bin || bin.from > fc) fc = bin ? Math.min(last, bin.from) : last;
        else fc = Math.min(last, bin.to);
        const span = {
          from: piece.cp + Math.floor((from - piece.fc) / step),
          to: piece.cp + Math.ceil((fc - piece.fc) / step),
          list: bin && bin.from <= from ? bin.list : NONE,
          prm: piece.prm,
          id: this.spans.length,
        };
        if (bin && bin.from > from) i -= 1;
        if (span.to > span.from) this.spans.push(span);
      }
    }
  }

  private spanAt(cp: number): number {
    let low = 0;
    let high = this.spans.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.spans[mid].to <= cp) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private pieceAt(cp: number): Piece | undefined {
    let low = 0;
    let high = this.pieces.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.pieces[mid].end <= cp) low = mid + 1;
      else high = mid;
    }
    return this.pieces[low];
  }

  /** The change a piece makes to all its text. */
  private change(prm: number): Uint8Array {
    if (prm === 0) return NONE;
    if (prm & 1) return this.changes[prm >> 1] ?? NONE;
    const code = SHORT[(prm >> 1) & 0x7f];
    return code === undefined ? NONE : new Uint8Array([code & 255, code >> 8, prm >> 8]);
  }

  private readSections() {
    const list = this.part(6);
    const count = Math.max(0, Math.floor((list.length - 4) / 16));
    for (let i = 0; i < count; i += 1) {
      const from = u32(list, i * 4);
      const to = Math.min(u32(list, i * 4 + 4), this.ccp.text);
      const place = u32(list, (count + 1) * 4 + i * 12 + 2);
      const known = place !== 0xffffffff && place + 2 < this.main.length;
      const sep = known ? this.main.subarray(place + 2, place + 2 + Math.max(0, i16(this.main, place))) : NONE;
      if (to > from) this.sections.push({ from, to, list: sep });
    }
    if (this.sections.length === 0) this.sections.push({ from: 0, to: this.ccp.text, list: NONE });
  }

  // ---------------------------------------------------------------- looks

  /** A style with everything it is based on. */
  private chain(index: number): Style[] {
    const out: Style[] = [];
    for (let i = index; i !== 0xfff && out.length < 12;) {
      const style = this.styles[i];
      if (!style || out.includes(style)) break;
      out.unshift(style);
      i = style.base;
    }
    return out;
  }

  private styleChp(index: number): Chp {
    const key = String(index);
    const known = this.styleCache.get(key);
    if (known) return known;
    const chp = { ...this.chpBase };
    for (const style of this.chain(index)) if (style.kind === 1) applyChp(chp, style.text, { ...chp });
    this.styleCache.set(key, chp);
    return chp;
  }

  private chpOf(style: number, span: Span): Chp {
    const key = `${style} ${span.id}`;
    const known = this.chpCache.get(key);
    if (known) return known;
    const chp = { ...this.styleChp(style) };
    const change = this.change(span.prm);
    let own = -1;
    for (const list of [span.list, change])
      eachSprm(list, (code, at) => {
        if (code === 0x4a30) own = u16(list, at);
      });
    if (own >= 0) for (const one of this.chain(own)) if (one.kind === 2) applyChp(chp, one.text, { ...chp });
    const measured = { ...chp };
    applyChp(chp, span.list, measured);
    if (change.length > 0) applyChp(chp, change, measured);
    if (this.chpCache.size > 20000) this.chpCache.clear();
    this.chpCache.set(key, chp);
    return chp;
  }

  private stylePap(index: number, withList: boolean): Pap {
    const key = `${index} ${withList}`;
    const known = this.papCache.get(key);
    if (known) return known;
    const pap = copyPap(PAP);
    applyPap(pap, this.papBase, this.data);
    for (const style of this.chain(index)) {
      if (style.kind !== 1) continue;
      if (withList) this.listIndent(pap, style.para);
      applyPap(pap, style.para, this.data);
      if (style.id >= 1 && style.id <= 9 && pap.outline === 9) pap.outline = style.id - 1;
    }
    pap.style = index;
    this.papCache.set(key, pap);
    return pap;
  }

  /** A list brings its own indents, which what is said next to it may change. */
  private listIndent(pap: Pap, list: Uint8Array) {
    let use = -1;
    let level = -1;
    eachSprm(list, (code, at) => {
      if (code === 0x460b) use = u16(list, at);
      else if (code === 0x260a) level = list[at];
    });
    if (use < 0 && level < 0) return;
    const levels = this.levels(use >= 0 ? use : pap.list);
    const one = levels?.[Math.min(level >= 0 ? level : pap.level, levels.length - 1)];
    if (one) applyPap(pap, one.para, this.data);
  }

  private papAt(cp: number): Pap {
    const piece = this.pieceAt(cp);
    if (!piece) return copyPap(PAP);
    const fc = piece.fc + (cp - piece.cp) * (piece.wide ? 2 : 1);
    const bin = this.paps[this.find(this.paps, fc)];
    let style = bin && bin.from <= fc ? bin.style : 0;
    let list = bin && bin.from <= fc ? bin.list : NONE;
    const change = this.change(piece.prm);
    eachSprm(change, (code, at) => {
      // Another style, with nothing left of what was set by hand.
      if (code === 0x4600) [style, list] = [u16(change, at), NONE];
    });
    let off = false;
    eachSprm(list, (code, at) => {
      if (code === 0x460b && u16(list, at) === 0) off = true;
    });
    const pap = copyPap(this.stylePap(style, !off));
    if (!off) this.listIndent(pap, list);
    applyPap(pap, list, this.data);
    if (change.length > 0) applyPap(pap, change, this.data);
    pap.depth = pap.inTable ? Math.max(1, Math.min(8, pap.depth)) : 0;
    return pap;
  }

  private font(index: number): string | undefined {
    return this.fonts[index] || undefined;
  }

  /** How letters of a script look. The same looks share one object. */
  private lookOf(chp: Chp, script: number, link: string | undefined, small: boolean): FlowStyle {
    const complex = script === 3 || chp.asComplex || chp.rtl;
    const font = this.font(complex ? chp.complex : script === 2 ? chp.east : script === 1 ? chp.other : chp.ascii);
    const size = ((complex ? chp.sizeC : chp.size) / 2) * (small ? 0.8 : 1);
    const bold = complex ? chp.boldC : chp.bold;
    const italic = complex ? chp.italicC : chp.italic;
    const back = chp.marker ?? chp.fill;
    const drawn = [chp.underline, chp.strike || chp.double, chp.script, chp.tracking];
    const key = [font, size, bold, italic, ...drawn, chp.color, back, link].join("|");
    const known = this.flowStyles.get(key);
    if (known) return known;
    const style: FlowStyle = { size };
    if (font) style.font = font;
    if (bold) style.bold = true;
    if (italic) style.italic = true;
    if (chp.underline) style.underline = true;
    if (chp.strike || chp.double) style.strike = true;
    if (chp.color) style.color = chp.color;
    if (back && back !== "#ffffff") style.highlight = back;
    if (chp.script === 1) style.script = "super";
    else if (chp.script === 2) style.script = "sub";
    if (chp.tracking) style.tracking = chp.tracking;
    if (link) style.link = link;
    this.flowStyles.set(key, style);
    return style;
  }

  // ---------------------------------------------------------------- pages

  private page(section: Section): { section: FlowSection; goesOn: boolean; firstOwn: boolean } {
    const at = {
      w: 12240,
      h: 15840,
      left: 1800,
      right: 1800,
      top: 1440,
      bottom: 1440,
      gutter: 0,
      head: 720,
      foot: 720,
      cols: 1,
      gap: 720,
    };
    let kind = 2;
    let own = false;
    const { list } = section;
    eachSprm(list, (code, place) => {
      const value = i16(list, place);
      if (code === 0x3009) kind = list[place];
      else if (code === 0x300a) own = list[place] !== 0;
      else if (code === 0x500b) at.cols = u16(list, place) + 1;
      else if (code === 0x900c) at.gap = u16(list, place);
      else if (code === 0xb017) at.head = u16(list, place);
      else if (code === 0xb018) at.foot = u16(list, place);
      else if (code === 0xb01f) at.w = u16(list, place);
      else if (code === 0xb020) at.h = u16(list, place);
      else if (code === 0xb021) at.left = u16(list, place);
      else if (code === 0xb022) at.right = u16(list, place);
      else if (code === 0x9023) at.top = Math.abs(value);
      else if (code === 0x9024) at.bottom = Math.abs(value);
      else if (code === 0xb025) at.gutter = u16(list, place);
    });
    if (at.w < 720 || at.h < 720) [at.w, at.h] = [12240, 15840];
    if (at.left + at.gutter + at.right > at.w - 360) [at.left, at.right, at.gutter] = [720, 720, 0];
    if (at.top + at.bottom > at.h - 360) [at.top, at.bottom] = [720, 720];
    const out: FlowSection = {
      w: at.w / 20,
      h: at.h / 20,
      margin: { top: at.top / 20, right: at.right / 20, bottom: at.bottom / 20, left: (at.left + at.gutter) / 20 },
      blocks: [],
      headerAt: at.head / 20,
      footerAt: at.foot / 20,
    };
    if (at.cols > 1) {
      out.columns = Math.min(8, at.cols);
      out.gap = at.gap / 20;
    }
    return { section: out, goesOn: kind === 0 || kind === 1, firstOwn: own };
  }

  /** Where the header stories of every section stand. */
  private headStory(section: number, kind: number): [number, number] | null {
    const list = this.part(11);
    const base = this.ccp.text + this.ccp.foot;
    for (let i = section; i >= 0; i -= 1) {
      const at = (6 + i * 6 + kind) * 4;
      if (at + 8 > list.length) continue;
      const [from, to] = [u32(list, at), u32(list, at + 4)];
      // Nothing of its own: it goes on with the section before.
      if (to > from && to <= this.ccp.head) return [base + from, base + to - 1];
    }
    return null;
  }

  private headers(index: number, section: FlowSection, firstOwn: boolean): Heads | undefined {
    const make = (kind: number): FlowBlock[] | undefined => {
      const place = this.headStory(index, kind);
      if (!place) return undefined;
      const width = section.w - section.margin.left - section.margin.right;
      const story: Story = { where: "head", base: this.ccp.text + this.ccp.foot, fields: [], width };
      return headBlocks(this.blocks(place[0], place[1], story, section));
    };
    const [header, footer] = [make(1), make(3)];
    if (header) section.header = header;
    if (footer) section.footer = footer;
    if (!firstOwn) return undefined;
    const first: Heads = { header: make(4), footer: make(5) };
    return first.header || first.footer || header || footer ? first : undefined;
  }

  // ---------------------------------------------------------------- notes

  private readNotes() {
    const take = (refs: Uint8Array, kind: "foot" | "end") => {
      const count = Math.max(0, Math.floor((refs.length - 4) / 6));
      let number = 0;
      for (let i = 0; i < count; i += 1) {
        const automatic = u16(refs, (count + 1) * 4 + i * 2) !== 0;
        if (automatic) number += 1;
        const mark = automatic ? (kind === "foot" ? String(number) : countText(2, number)) : "";
        this.notes.set(u32(refs, i * 4), { mark, kind, index: i });
      }
    };
    take(this.part(2), "foot");
    take(this.part(46), "end");
  }

  private addNotes(section: FlowSection) {
    const sets = [
      { kind: "foot" as const, places: this.part(3), base: this.ccp.text },
      {
        kind: "end" as const,
        places: this.part(47),
        base: this.ccp.text + this.ccp.foot + this.ccp.head + this.ccp.note,
      },
    ];
    const width = columnWidth(section);
    for (const { kind, places, base } of sets) {
      const marks = [...this.notes.values()].filter((note) => note.kind === kind);
      if (marks.length === 0 || places.length < 8) continue;
      section.blocks.push({ kind: "rule", color: "#808080", width: 0.5 });
      for (const { index, mark } of marks) {
        const [from, to] = [u32(places, index * 4), u32(places, index * 4 + 4)];
        if (!(to > from)) continue;
        const story: Story = { where: "note", base, fields: [], notes: [mark], width };
        section.blocks.push(...this.blocks(base + from, base + to, story, section));
      }
    }
  }

  // ---------------------------------------------------------------- blocks

  private paragraphs(from: number, to: number): Para[] {
    const out: Para[] = [];
    let start = from;
    for (let cp = from; cp < to; cp += 1) {
      const code = this.text.charCodeAt(cp);
      // Only at the end of a section does a page mark end its paragraph.
      if (code !== 13 && code !== 7 && !(code === 12 && cp === to - 1)) continue;
      out.push({ from: start, to: cp, mark: code, pap: this.papAt(cp) });
      start = cp + 1;
    }
    if (start < to) out.push({ from: start, to, mark: 0, pap: this.papAt(to - 1) });
    return out;
  }

  private blocks(from: number, to: number, story: Story, section: FlowSection): FlowBlock[] {
    return this.build(this.paragraphs(from, Math.min(to, this.text.length)), 0, story, section);
  }

  private build(paras: Para[], depth: number, story: Story, section: FlowSection): FlowBlock[] {
    const out: FlowBlock[] = [];
    let rows: { cells: Para[][]; pap: Pap }[] = [];
    let cells: Para[][] = [];
    let cell: Para[] = [];
    const flush = () => {
      if (cell.length > 0) cells.push(cell);
      if (cells.length > 0) rows.push({ cells, pap: cell[cell.length - 1]?.pap ?? cells[0][0].pap });
      if (rows.length > 0) out.push(...this.tableOf(rows, depth, story, section));
      [rows, cells, cell] = [[], [], []];
    };
    let dropped: Para | null = null;
    for (const para of paras) {
      const { pap, mark } = para;
      if (pap.depth <= depth) {
        flush();
        // A large first letter in a frame belongs to the words after it.
        if (pap.drop > 0 && para.to > para.from && para.to - para.from < 12) {
          dropped = para;
          continue;
        }
        out.push(...this.paraOf(para, story, section, dropped));
        dropped = null;
        continue;
      }
      const own = pap.depth === depth + 1;
      if (own && (depth === 0 ? mark === 7 && pap.rowEnd : pap.innerRow)) {
        if (cell.length > 0) cells.push(cell);
        rows.push({ cells, pap });
        [cells, cell] = [[], []];
        continue;
      }
      cell.push(para);
      if (own && (depth === 0 ? mark === 7 : pap.innerCell)) {
        cells.push(cell);
        cell = [];
      }
    }
    flush();
    return out;
  }

  private tableOf(
    rows: { cells: Para[][]; pap: Pap }[],
    depth: number,
    story: Story,
    section: FlowSection,
  ): FlowBlock[] {
    const read = rows.map(({ cells, pap }) => {
      const row: Row = {
        edges: [],
        cells: [],
        gap: 0,
        align: 0,
        height: 0,
        head: false,
        rtl: false,
        lines: [],
        pad: { top: 0, left: -1, bottom: 0, right: -1 },
        width: 0,
        indent: null,
      };
      for (const list of pap.row) applyRow(row, list);
      // A row that says nothing about itself gets columns of one width.
      for (let i = row.cells.length; i < cells.length; i += 1) {
        row.cells.push(newCell());
        if (row.edges.length === 0) row.edges.push(0);
        const last = row.edges[row.edges.length - 1];
        row.edges.push(last + (story.width * 20) / Math.max(1, cells.length));
      }
      return { row, cells, pap };
    });
    const [first] = read;
    const gap = first.row.gap / 20 || 5.4;
    const pad = {
      top: round(first.row.pad.top),
      right: round(first.row.pad.right >= 0 ? first.row.pad.right : gap),
      bottom: round(first.row.pad.bottom),
      left: round(first.row.pad.left >= 0 ? first.row.pad.left : gap),
    };
    // Tables in tables become lines of text, but not when the outer one only holds them.
    const deeper = (cell: Para[]) => cell.some((para) => para.pap.depth > depth + 1);
    if (depth === 0 && read.every(({ row }) => row.cells.length === 1) && read.some(({ cells }) => cells.some(deeper)))
      return read.flatMap(({ cells }) => cells.flatMap((cell) => this.build(cell, depth + 1, story, section)));

    const ruled: RuledRow[] = read.map(({ row, cells }) => ({
      lines: row.lines,
      h: row.height / 20,
      head: row.head,
      cells: row.cells.map((cell, c) => {
        const x0 = row.edges[c] / 20;
        const x1 = row.edges[c + 1] / 20;
        const inner: Story = { ...story, width: Math.max(10, x1 - x0 - pad.left - pad.right) };
        const blocks = cells[c] ? flatten(this.build(cells[c], depth + 1, inner, section)) : [];
        for (const block of blocks) delete block.breakBefore;
        const one: RuledCell = {
          x0,
          x1,
          blocks,
          joined: cell.merge === 1,
          border: cell.border,
          valign: cell.valign === 1 ? "middle" : cell.valign === 2 ? "bottom" : "top",
        };
        if (cell.fill) one.fill = cell.fill;
        if (cell.down) one.down = cell.down === 1 ? "more" : "start";
        return one;
      }),
    }));
    const out = ruledRows(ruled);
    const table = buildTable(out, pad);
    if (!table) return [];
    stretch(table, first.row.width < 0 ? -first.row.width * story.width : first.row.width);
    // The indent says where the words of the first cell start; its edge stands further left.
    const start =
      first.row.indent !== null
        ? first.row.indent - pad.left
        : Math.min(...out.flatMap((row) => row.cells.map((cell) => cell.x0)));
    if (first.row.align === 1) table.align = "center";
    else if (first.row.align === 2) table.align = "right";
    else if (depth === 0 && Math.abs(start) > 0.01) table.left = round(start);
    return [table];
  }

  // ---------------------------------------------------------------- paragraphs

  private paraOf(para: Para, story: Story, section: FlowSection, dropped: Para | null): FlowBlock[] {
    const { pap } = para;
    const head = dropped ? this.runsOf(dropped, story, section) : null;
    const body = this.runsOf(para, story, section);
    const out: FlowBlock[] = [...(head?.boxes ?? []), ...body.boxes];
    if (head && head.parts[0].length > 0) {
      // The big letter takes the size of the words it belongs to.
      const size = body.parts[0].find((piece) => piece.text)?.style?.size;
      const letter = head.parts[0].map((piece) =>
        piece.image ? piece : { ...piece, style: { ...piece.style, size: size ?? piece.style.size } },
      );
      body.parts[0].unshift(...letter);
    }
    if (!body.shown && !body.broken) return out;
    // The mark that ends a section, or follows a page break, is no line of its own.
    const last = body.parts.length - 1;
    const empty = (runs: FlowRun[]) => runs.every((piece) => !piece.image && piece.text === "");
    const block = pap.depth === 0;
    body.parts.forEach((runs, i) => {
      if (i > 0 && block && story.where === "main" && !body.quiet.has(i)) out.push({ kind: "break" });
      const idle = empty(runs) && (para.mark === 12 || body.broken);
      if (idle && (i < last || body.parts.length > 1 || para.mark === 12)) return;
      const made = this.dress(para, runs, body.blank, i, story);
      out.push(made);
    });
    return out;
  }

  private dress(para: Para, source: FlowRun[], blank: FlowStyle, part: number, story: Story): FlowPara {
    const { pap } = para;
    const out: FlowPara = { kind: "para", runs: [] };
    let runs = source;
    let align = pap.align;
    if (pap.rtl && (pap.logical || pap.align === 0) && (align === 0 || align === 2)) align = 2 - align;
    if (story.where === "head" && pap.frame !== null && align === 0)
      align = pap.frame === -4 ? 1 : pap.frame === -8 ? 2 : 0;
    const names: FlowAlign[] = ["left", "center", "right", "justify", "justify", "justify"];
    if (align > 0 && align < 10) out.align = names[align] ?? "justify";
    const [left, right, first] = [pap.left / 20, pap.right / 20, pap.first / 20];
    if (pap.rtl) {
      if (right) out.left = round(right);
      if (left) out.right = round(left);
    } else {
      if (left) out.left = round(left);
      if (right) out.right = round(right);
    }
    if (first && part === 0) out.first = round(first);
    out.before = part > 0 ? 0 : pap.autoBefore ? 14 : pap.before / 20;
    out.after = pap.autoAfter ? 14 : pap.after / 20;
    if (pap.multiple) out.line = { times: round(Math.max(1, pap.line || 240) / 240) };
    else if (pap.line < 0) out.line = { points: -pap.line / 20 };
    else if (pap.line > 0) out.line = { points: pap.line / 20, atLeast: true };
    else out.line = { times: 1 };
    if (pap.outline < 9 && pap.depth === 0 && story.where === "main")
      out.heading = Math.min(6, pap.outline + 1) as FlowPara["heading"];
    if (pap.pageBreak && pap.depth === 0 && part === 0 && story.where === "main") out.breakBefore = true;
    if (pap.keepNext) out.keepNext = true;
    if (pap.fill && pap.fill !== "#ffffff") out.fill = pap.fill;
    const border: FlowPara["border"] = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const line = pap.border[side];
      if (line) border[side] = line;
    }
    if (Object.keys(border).length > 0) out.border = border;

    const mark = part === 0 ? this.markOf(pap) : null;
    if (mark) {
      if (mark.list) {
        out.list = mark.list;
        this.known.counts.set(out, mark.count);
      } else if (mark.lead) {
        // Numbers like "1.2.3" are letters here: the editor counts one level only.
        const style = { ...blank, ...this.markLook(para) };
        runs = [{ text: mark.lead, style }, ...runs];
      }
    }
    if (pap.list === 0 && (pap.autoBefore || pap.autoAfter) && para.mark === 7) {
      if (pap.autoBefore) out.before = 0;
      if (pap.autoAfter) out.after = 0;
    }
    out.runs = tidyRuns(runs, blank);
    const stops: Stop[] = [...pap.tabs].flatMap(([at, how]) => {
      const kind = ["left", "center", "right", "decimal"][how & 7];
      return kind ? [{ at: at / 20, kind: kind as Stop["kind"] }] : [];
    });
    placeTabs(out, stops, story.width);
    if (mark?.list) hangMark(out, mark, stops);
    const listed = pap.list > 0 && pap.list < 0x7ff;
    this.known.info.set(out, {
      style: String(pap.style),
      // Word leaves the space between paragraphs in cells alone.
      contextual: (pap.contextual && pap.depth === 0) || (listed && pap.autoBefore && pap.autoAfter),
      ...(pap.border.between ? { between: pap.border.between } : {}),
    });
    return out;
  }

  // ---------------------------------------------------------------- list marks

  private markOf(pap: Pap) {
    if (pap.list === 0x7ff && pap.oldList) return this.oldMark(pap);
    if (pap.list <= 0 || pap.list >= 0x7ff) return null;
    const levels = this.levels(pap.list);
    const use = this.uses[pap.list - 1];
    if (!levels || !use) return null;
    const level = Math.min(pap.level, levels.length - 1);
    return this.counter.next(String(use.list), levels, level, `${pap.list}`, use.over.starts);
  }

  /** How the number itself looks, where it differs from the words. */
  private markLook(para: Para): FlowStyle {
    const { pap } = para;
    const levels = this.levels(pap.list);
    const level = levels?.[Math.min(pap.level, levels.length - 1)];
    const span = this.spans[this.spanAt(para.to)];
    if (!level || !span) return {};
    const chp = { ...this.chpOf(pap.style, span) };
    applyChp(chp, level.chars, { ...chp });
    return { ...this.lookOf(chp, 0, undefined, false), underline: chp.underline };
  }

  /** Lists of files that come from Word 6: everything stands in the paragraph itself. */
  private oldMark(pap: Pap) {
    const b = pap.oldList as Uint8Array;
    if (b.length < 20) return null;
    const [kind, before, after] = [b[0], b[1], b[2]];
    const letters = utf16(b.subarray(20, Math.min(b.length, 84)));
    const font = this.font(u16(b, 6));
    if (kind === 255 || pap.level === 11) {
      const text = symbolText(font, letters.slice(0, Math.max(1, before))) ?? letters.slice(0, Math.max(1, before));
      const mark = plain(text).trim();
      return mark ? { list: { type: "bullet" as const, mark, level: 0 }, count: 0 } : null;
    }
    const text = `${letters.slice(0, before)}\0${letters.slice(before, before + after)}`;
    const level: Level = { kind, start: Math.max(1, u16(b, 10)), text, follow: 0, legal: false, restart: 0 };
    return this.counter.next(`old${pap.style}`, [level], 0);
  }

  // ---------------------------------------------------------------- words

  private runsOf(para: Para, story: Story, section: FlowSection) {
    const { pap } = para;
    const parts: FlowRun[][] = [[]];
    const boxes: FlowBox[] = [];
    /** Parts that start a new column, not a page. */
    const quiet = new Set<number>();
    let shown = false;
    let broken = false;
    let last = 0;
    const { fields } = story;
    const runs = () => parts[parts.length - 1];
    const hidden = () => fields.some((field) => !field.result || field.hide);
    const linkNow = () => {
      for (let i = fields.length - 1; i >= 0; i -= 1) if (fields[i].link) return fields[i].link;
      return undefined;
    };
    const put = (text: string, chp: Chp) => {
      if (text === "") return;
      shown = true;
      const link = linkNow();
      let at = 0;
      while (at < text.length) {
        // Letters of one script, with the spaces between them.
        let script = scriptOf(text.charCodeAt(at));
        let end = at + 1;
        for (; end < text.length; end += 1) {
          const next = scriptOf(text.charCodeAt(end));
          if (next < 0 || (next === 1 && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff)) continue;
          if (script < 0) script = next;
          const same = next === script || (next < 2 && script < 2 && script >= 0 && chp.ascii === chp.other);
          if (!same) break;
        }
        if (script < 0) script = last;
        last = script;
        this.letters(runs(), text.slice(at, end), chp, script, link);
        at = end;
      }
    };
    const finishField = (field: Field, chp: Chp) => {
      if (field.put && !hidden()) put(field.put, chp);
      field.put = undefined;
    };

    for (let i = this.spanAt(para.from); i < this.spans.length; i += 1) {
      const span = this.spans[i];
      if (span.from >= para.to) break;
      const chp = this.chpOf(pap.style, span);
      const text = this.text.slice(Math.max(span.from, para.from), Math.min(span.to, para.to));
      if (chp.deleted) continue;
      const base = Math.max(span.from, para.from);
      let words = "";
      const flush = () => {
        if (words !== "") put(words, chp);
        words = "";
      };
      for (let k = 0; k < text.length; k += 1) {
        const code = text.charCodeAt(k);
        if (code === 0x13) {
          flush();
          fields.push({ code: "", result: false, hide: false });
          continue;
        }
        const field = fields[fields.length - 1];
        if (code === 0x14 && field) {
          flush();
          field.result = true;
          this.startResult(field, story);
          if (field.box && !hidden()) put(field.box, chp);
          continue;
        }
        if (code === 0x15 && field) {
          flush();
          fields.pop();
          if (!field.result) this.startResult(field, story);
          if (!field.result && field.box && !hidden()) put(field.box, chp);
          finishField(field, chp);
          continue;
        }
        if (fields.length > 0 && hidden()) {
          // What is written here only says what the field does.
          let open: Field | undefined;
          for (let f = fields.length - 1; f >= 0 && !open; f -= 1) if (!fields[f].result) open = fields[f];
          if (open && code >= 0x20) open.code += text[k];
          else if (open && code === 1 && chp.data) open.box = this.formBox(chp.picture, open.code) ?? open.box;
          continue;
        }
        if (chp.hidden) continue;
        if (field?.put !== undefined) {
          // The number shown now gives way to the one of every page.
          flush();
          const what = field.put;
          field.put = undefined;
          field.hide = true;
          const keep = field.hide;
          field.hide = false;
          put(what, chp);
          field.hide = keep;
          continue;
        }
        if (chp.symbol && code === 0x28) {
          flush();
          const [font, sign] = chp.symbol;
          const shownAs = symbolText(this.font(font), String.fromCharCode(sign));
          put(shownAs ?? plain(String.fromCharCode(sign)), chp);
          continue;
        }
        if (code >= 0x20) {
          words += text[k];
          continue;
        }
        if (code === 9) words += "\t";
        else if (code === 10 || code === 11) words += "\n";
        else if (code === 0x1e) words += "‑";
        else if (code === 12) {
          flush();
          broken = true;
          if (pap.depth === 0) parts.push([]);
        } else if (code === 14) {
          // The next column, or where there is only one the next page.
          flush();
          if (pap.depth === 0) {
            broken = true;
            parts.push([]);
            if ((section.columns ?? 1) > 1) quiet.add(parts.length - 1);
          }
        } else if (code === 1 && !chp.data && !chp.object && chp.picture >= 0) {
          flush();
          const image = this.inlinePicture(chp.picture);
          if (image) {
            runs().push({ image });
            shown = true;
          }
        } else if (code === 2 && chp.special) {
          flush();
          const note = story.where === "main" ? this.notes.get(base + k)?.mark : story.notes?.[0];
          if (note) put(note, { ...chp, script: chp.script || 1 });
        } else if (code === 8) {
          flush();
          const made = this.anchored(base + k - story.base, story, section);
          boxes.push(...made.boxes);
          runs().push(...made.runs);
          if (made.runs.length > 0) shown = true;
        }
      }
      flush();
    }
    const end = this.spans[this.spanAt(Math.min(para.to, this.text.length - 1))];
    const ends = end ? this.chpOf(pap.style, end) : CHP;
    // A line whose end is hidden or crossed out, with nothing left on it, is gone.
    if (!shown && !((ends.hidden || ends.deleted) && para.to > para.from))
      shown = fields.every((field) => field.result) || para.to === para.from;
    if (!shown && para.to === para.from && (ends.deleted || (ends.hidden && pap.depth === 0))) shown = false;
    return { parts, quiet, boxes, shown, broken, blank: this.lookOf(ends, 0, undefined, false) };
  }

  /** Adds letters of one script to a paragraph. */
  private letters(runs: FlowRun[], source: string, chp: Chp, script: number, link: string | undefined) {
    const complex = script === 3 || chp.asComplex || chp.rtl;
    const font = this.font(complex ? chp.complex : script === 2 ? chp.east : script === 1 ? chp.other : chp.ascii);
    const symbols = symbolText(font, source);
    let text = plain(symbols ?? source).replace(/\r/g, "");
    if (text === "") return;
    let style = this.lookOf(chp, script, link, false);
    if (symbols !== null && /^(symbol|wingdings|webdings)/i.test(font ?? "")) {
      style = { ...style };
      delete style.font;
    }
    if (chp.caps) text = text.toUpperCase();
    else if (chp.small) {
      const small = this.lookOf(chp, script, link, true);
      for (const part of text.match(/\p{Ll}+|\P{Ll}+/gu) ?? []) {
        const low = /^\p{Ll}/u.test(part);
        runs.push({ text: low ? part.toUpperCase() : part, style: low ? small : style });
      }
      return;
    }
    const before = runs[runs.length - 1];
    if (before && !before.image && before.style === style) before.text += text;
    else runs.push({ text, style });
  }

  /** Decides what a field shows once it is known what it does. */
  private startResult(field: Field, story: Story) {
    const code = field.code.trim();
    const name = /^\S*/.exec(code)?.[0].toUpperCase() ?? "";
    if (name === "HYPERLINK") {
      const rest = code.slice(9);
      const address = /^\s*(?:"((?:[^"\\]|\\.)*)"|([^\s\\"][^\s"]*))/.exec(rest);
      const part = /\\l\s+"([^"]*)"/i.exec(rest)?.[1];
      const url = (address?.[1] ?? address?.[2] ?? "").replace(/\\\\/g, "\\").replace(/\\"/g, '"');
      field.link = url ? cleanLink(part && !url.includes("#") ? `${url}#${part}` : url) : undefined;
    } else if ((name === "PAGE" || name === "NUMPAGES" || name === "SECTIONPAGES") && story.where === "head")
      field.put = name === "PAGE" ? "{page}" : "{pages}";
    else if (name === "SYMBOL") {
      const sign = /^SYMBOL\s+(0x[0-9a-f]+|\d+)/i.exec(code);
      const font = /\\f\s+(?:"([^"]*)"|(\S+))/i.exec(code);
      if (sign && !field.result) {
        const letter = String.fromCharCode(Number(sign[1]));
        field.put = symbolText(font?.[1] ?? font?.[2], letter) ?? letter;
      }
    } else if (name === "MACROBUTTON" || name === "GOTOBUTTON") {
      if (!field.result) field.put = code.replace(/^\S+\s+\S+\s*/, "");
    } else if (/^(XE|TC|TA|RD|SET|ASK|PRIVATE|ADVANCE)$/.test(name)) field.hide = true;
  }

  /** A box to tick or a list to choose from, as it was left. */
  private formBox(place: number, code: string): string | null {
    const b = this.data;
    if (!/^\s*FORM(CHECKBOX|DROPDOWN)/i.test(code) || place < 0 || place + 80 > b.length) return null;
    const at = place + u16(b, place + 4);
    const flags = u16(b, at + 4);
    const kind = flags & 3;
    const chosen = (flags >> 2) & 31;
    let next = at + 10;
    const text = () => {
      const size = u16(b, next);
      const out = utf16(b.subarray(next + 2, next + 2 + size * 2));
      next += 2 + size * 2 + 2;
      return out;
    };
    text();
    if (kind === 1 || /FORMCHECKBOX/i.test(code)) {
      const usual = u16(b, next);
      return (chosen === 25 ? usual : chosen) === 1 ? "☒" : "☐";
    }
    if (kind !== 2) return null;
    const usual = u16(b, next);
    next += 2;
    for (let i = 0; i < 5; i += 1) text();
    if (u16(b, next) !== 0xffff) return null;
    const count = u32(b, next + 2);
    next += 8;
    const items: string[] = [];
    for (let i = 0; i < Math.min(count, 60); i += 1) {
      const size = u16(b, next);
      items.push(utf16(b.subarray(next + 2, next + 2 + size * 2)));
      next += 2 + size * 2;
    }
    return items[chosen === 25 ? usual : chosen] ?? null;
  }

  // ---------------------------------------------------------------- pictures and drawings

  private opened = new Map<string, { bytes: Uint8Array; mime: string } | null>();

  private inlinePicture(place: number): FlowImage | null {
    const b = this.data;
    if (place + 68 > b.length) return null;
    const size = u32(b, place);
    const head = u16(b, place + 4);
    const mode = u16(b, place + 6);
    const end = Math.min(b.length, place + size);
    if (size < head || (mode !== 0x64 && mode !== 0x66)) return null;
    const scale = (value: number) => (value || 1000) / 1000;
    const w = (u16(b, place + 28) * scale(u16(b, place + 32))) / 20;
    const h = (u16(b, place + 30) * scale(u16(b, place + 34))) / 20;
    let at = place + head;
    if (mode === 0x66) at += 1 + b[at];
    let shape: Shape | null = null;
    let found: { bytes: Uint8Array; mime: string } | null = null;
    eachRecord(b, at, end, (type, from, to) => {
      if (type === 0xf004) shape = readShape(b, from, to);
      else if (!found) {
        const key = `d${from}`;
        if (!this.opened.has(key)) this.opened.set(key, pictureEntry(b, from - 8, this.main));
        found = this.opened.get(key) ?? null;
      }
    });
    return found ? this.imageOf(found, w, h, shape) : null;
  }

  private imageOf(
    source: { bytes: Uint8Array; mime: string },
    w: number,
    h: number,
    shape: Shape | null,
  ): FlowImage | null {
    if (!(w > 0.5 && h > 0.5)) return null;
    const image: FlowImage = { bytes: source.bytes, mime: source.mime, w: round(w), h: round(h) };
    if (shape) {
      const part = (id: number) => ((shape.props.get(id) ?? 0) | 0) / 65536;
      const [top, bottom, left, right] = [part(0x100), part(0x101), part(0x102), part(0x103)];
      if (
        (top || bottom || left || right) &&
        left + right < 0.99 &&
        top + bottom < 0.99 &&
        Math.min(top, bottom, left, right) > -0.01
      )
        image.crop = { x: round4(left), y: round4(top), w: round4(1 - left - right), h: round4(1 - top - bottom) };
      const angle = ((shape.props.get(4) ?? 0) | 0) / 65536;
      if (angle) image.angle = round(angle);
      const alt = shape.long.get(0x381);
      const words = alt ? plain(utf16(alt)).trim() : "";
      if (words) image.alt = words;
    }
    this.images.push(image);
    return image;
  }

  private readDrawings() {
    const b = this.part(50);
    if (b.length < 8) return;
    let at = 8 + u32(b, 4);
    eachRecord(b, 8, Math.min(at, b.length), (type, from, to) => {
      if (type === 0xf001)
        eachRecord(b, from, to, (_, place) => this.blips.push(pictureEntry(b, place - 8, this.main)));
    });
    // One drawing for the pages, one for the headers.
    while (at + 9 < b.length) {
      const all: Shape[] = [];
      const end = at + 9 + u32(b, at + 5);
      readShapes(b, at + 1, Math.min(end, b.length), all);
      for (const shape of all) this.shapes.set(shape.id, shape);
      at = end;
    }
  }

  private places = new Map<boolean, Map<number, Anchor>>();

  /** What floats, by the character it hangs on. */
  private anchors(head: boolean): Map<number, Anchor> {
    const known = this.places.get(head);
    if (known) return known;
    const list = this.part(head ? 41 : 40);
    const count = Math.max(0, Math.floor((list.length - 4) / 30));
    const out = new Map<number, Anchor>();
    for (let i = 0; i < count; i += 1) {
      const at = (count + 1) * 4 + i * 26;
      const rect = [4, 8, 12, 16].map((k) => i32(list, at + k) / 20);
      out.set(u32(list, i * 4), { id: u32(list, at), rect, flags: u16(list, at + 20) });
    }
    this.places.set(head, out);
    return out;
  }

  /** What floats by the words at a place: pictures go with the words, the rest stands on its own. */
  private anchored(cp: number, story: Story, section: FlowSection): { runs: FlowRun[]; boxes: FlowBox[] } {
    const runs: FlowRun[] = [];
    const boxes: FlowBox[] = [];
    if (story.where !== "main" && story.where !== "head") return { runs, boxes };
    const anchor = this.anchors(story.where === "head").get(cp);
    const shape = anchor && this.shapes.get(anchor.id);
    if (!anchor || !shape || shape.flags & 8) return { runs, boxes };
    let [x, y] = anchor.rect;
    const [w, h] = [anchor.rect[2] - anchor.rect[0], anchor.rect[3] - anchor.rect[1]];
    const across = (anchor.flags >> 1) & 3;
    const down = (anchor.flags >> 3) & 3;
    const wrap = (anchor.flags >> 5) & 15;
    const behind = wrap === 3 && (anchor.flags & 0x4000) !== 0;
    const { margin } = section;
    const room = section.w - margin.left - margin.right;

    // Where it is measured from, unless it keeps to a side or the middle.
    const sideX = shape.props.get(911) ?? 0;
    const fromX = shape.props.get(912) ?? [0, 1, 2, 2][across];
    const left = fromX === 1 ? 0 : margin.left;
    const wide = fromX === 1 ? section.w : room;
    let pageX =
      sideX === 2
        ? left + (wide - w) / 2
        : sideX === 3 || sideX === 5
          ? left + wide - w
          : sideX > 0
            ? left
            : x + (across === 1 ? 0 : margin.left);
    const sideY = shape.props.get(913) ?? 0;
    const fromY = shape.props.get(914) ?? [0, 1, 2, 2][down];
    const onPage = sideY > 0 ? fromY < 2 : down < 2;
    if (onPage) {
      const top = fromY === 1 ? 0 : margin.top;
      const high = fromY === 1 ? section.h : section.h - margin.top - margin.bottom;
      y =
        sideY === 2
          ? top + (high - h) / 2
          : sideY === 3 || sideY === 5
            ? top + high - h
            : sideY > 0
              ? top
              : y + (down === 1 ? 0 : margin.top);
    }
    pageX = Math.max(-w + 10, pageX);
    x = onPage ? pageX : pageX - margin.left;
    this.drawn(shape, { x, y, w, h }, onPage ? "page" : "para", behind, wrap === 3, story, section, runs, boxes);
    if (wrap !== 3 && story.where === "main")
      for (const thing of [...runs.map((piece) => piece.image), ...boxes])
        if (thing) this.wraps.set(thing, wrap === 1 ? "apart" : "around");
    return { runs, boxes };
  }

  private drawn(
    shape: Shape,
    frame: { x: number; y: number; w: number; h: number },
    from: "page" | "para",
    behind: boolean,
    loose: boolean,
    story: Story,
    section: FlowSection,
    runs: FlowRun[],
    boxes: FlowBox[],
  ) {
    if (shape.kids.length > 0) {
      const space = shape.space ?? [0, 0, 1, 1];
      const [kx, ky] = [frame.w / Math.max(1, space[2] - space[0]), frame.h / Math.max(1, space[3] - space[1])];
      for (const kid of shape.kids) {
        const place = kid.place ?? space;
        const inner = {
          x: frame.x + (place[0] - space[0]) * kx,
          y: frame.y + (place[1] - space[1]) * ky,
          w: (place[2] - place[0]) * kx,
          h: (place[3] - place[1]) * ky,
        };
        this.drawn(kid, inner, from, behind, loose, story, section, runs, boxes);
      }
      return;
    }
    const at = turned(frame, ((shape.props.get(4) ?? 0) | 0) / 65536);
    const blip = shape.props.get(0x104);
    const picture = blip ? this.blips[blip - 1] : null;
    if (picture) {
      const image = this.imageOf(picture, at.w, at.h, shape);
      if (!image) return;
      image.float = { x: round(at.x), y: round(at.y), from };
      if (behind) image.float.behind = true;
      runs.push({ image });
      return;
    }
    if (shape.type === 75) return;
    const { props, long } = shape;
    const number = (id: number, usual: number) => (props.has(id) ? (props.get(id) ?? 0) | 0 : usual);
    const on = (id: number, bit: number, usual: boolean) => {
      const value = props.get(id) ?? 0;
      return value & (bit << 16) ? (value & bit) !== 0 : usual;
    };
    // Paper shows through what is not solid.
    const seen = (color: string, id: number) =>
      mixColors(color, "#ffffff", Math.max(0, Math.min(1, number(id, 65536) / 65536)));
    const fill = officeColor(props.get(0x181), "#ffffff");
    const dash = number(0x1ce, 0);
    const stroke: FlowLine = {
      color: seen(officeColor(props.get(0x1c0), "#000000", fill), 0x1c1),
      width: round(Math.max(0.25, number(0x1cb, 9525) / 12700)),
      ...(dash === 2 || dash === 5 ? { dash: "dot" } : dash > 0 ? { dash: "dash" } : {}),
    };
    const words = (id: number) => plain(utf16(long.get(id) ?? new Uint8Array())).trim();
    const corners = long.get(0x145);
    const upright = number(135, 0);
    const drawing: Drawing = {
      type: shape.type,
      frame: at,
      angle: number(4, 0) / 65536,
      flipH: (shape.flags & 0x40) !== 0,
      flipV: (shape.flags & 0x80) !== 0,
      fill: on(0x1bf, 16, true)
        ? paintOf({
            kind: number(0x180, 0),
            color: seen(fill, 0x182),
            back: seen(officeColor(props.get(0x183), "#ffffff", fill), 0x184),
            angle: number(0x18b, 0) / 65536,
            focus: number(0x18c, 0),
            stops: listed(long.get(0x197)).map(([color, place]) => [
              place / 65536,
              officeColor(color >>> 0, "#ffffff", fill),
            ]),
          })
        : null,
      stroke: on(0x1ff, 8, true) ? stroke : null,
      start: number(0x1d0, 0) > 0,
      end: number(0x1d1, 0) > 0,
      bends: [0x147, 0x148, 0x149].map((id) => number(id, 10800) / 21600),
      outline:
        corners && !OFFICE_SHAPES[shape.type]
          ? {
              points: listed(corners).map(([x, y]) => ({ x, y })),
              steps: listed(long.get(0x146)).map(([step]) => step & 0xffff),
              box: [number(0x140, 0), number(0x141, 0), number(0x142, 21600), number(0x143, 21600)],
              kind: number(0x144, 1),
            }
          : null,
      art: words(192)
        ? { words: words(192), font: words(197) || "Arial", bold: on(0xff, 32, false), italic: on(0xff, 16, false) }
        : null,
      blocks: shape.text > 0 ? this.boxText(shape.text, story, section, at.w) : [],
      valign: upright === 1 || upright === 4 ? "middle" : upright === 2 || upright === 5 ? "bottom" : "top",
    };
    const { image, box } = drawnShape(drawing, { from, behind, loose });
    if (image) runs.push({ image });
    if (box) boxes.push(box);
  }

  private boxText(index: number, story: Story, section: FlowSection, w: number): FlowPara[] {
    const head = story.where === "head";
    const list = this.part(head ? 58 : 56);
    const at = (index - 1) * 4;
    if (at + 8 > list.length) return [];
    let base = this.ccp.text + this.ccp.foot + this.ccp.head + this.ccp.note + this.ccp.end;
    if (head) base += this.ccp.box;
    const [from, to] = [u32(list, at), u32(list, at + 4)];
    if (!(to > from)) return [];
    const inner: Story = { where: head ? "head" : "box", base, fields: [], width: Math.max(10, w - 14.4) };
    const blocks = flatten(this.blocks(base + from, base + to, { ...inner, where: "box" }, section));
    // The last mark only closes the box.
    if (blocks.length > 1 && isBlank(blocks[blocks.length - 1])) blocks.pop();
    return blocks;
  }
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;

// ---------------------------------------------------------------- Word 6 and 95

/** Code pages of the languages Word 6 was sold in. */
const PAGES: [number[], string][] = [
  [[0x05, 0x0e, 0x15, 0x18, 0x1a, 0x1b, 0x1c, 0x24], "windows-1250"],
  [[0x02, 0x19, 0x22, 0x23, 0x2f], "windows-1251"],
  [[0x08], "windows-1253"],
  [[0x1f, 0x2c], "windows-1254"],
  [[0x0d], "windows-1255"],
  [[0x01, 0x20, 0x29], "windows-1256"],
  [[0x25, 0x26, 0x27], "windows-1257"],
  [[0x2a], "windows-1258"],
  [[0x1e], "windows-874"],
  [[0x11], "shift_jis"],
  [[0x04], "gbk"],
  [[0x12], "euc-kr"],
];

/** Files from before Word 97: their words, without the looks. */
function readOld(main: Uint8Array, info: Pick<FlowDoc, "title" | "author">): FlowDoc {
  const id = u16(main, 0);
  const version = u16(main, 2);
  if (id !== 0xa5dc || version < 101 || version > 105)
    throw new ConvertError("This Word file is too old to be read. Open it in Word, save it as .docx and try again.");
  const language = u16(main, 6) & 0x3ff;
  const label = PAGES.find(([list]) => list.includes(language))?.[1] ?? "windows-1252";
  const letters = u32(main, 52);
  const complex = (u16(main, 10) & 4) !== 0;
  const chunks: Uint8Array[] = [];
  if (complex) {
    let at = u32(main, 0x160);
    const end = Math.min(main.length, at + u32(main, 0x164));
    while (at + 3 < end && main[at] === 1) at += 3 + u16(main, at + 1);
    if (main[at] === 2) {
      const table = main.subarray(at + 5, at + 5 + u32(main, at + 1));
      const count = Math.floor((table.length - 4) / 12);
      for (let i = 0; i < count; i += 1) {
        const [from, to] = [u32(table, i * 4), Math.min(letters, u32(table, i * 4 + 4))];
        const place = u32(table, (count + 1) * 4 + i * 8 + 2);
        if (to > from) chunks.push(main.subarray(place, place + to - from));
      }
    }
  } else chunks.push(main.subarray(u32(main, 24), u32(main, 24) + letters));
  const text = chunks.map((chunk) => new TextDecoder(label).decode(chunk)).join("");
  if (text.trim() === "")
    throw new ConvertError("No text was found in this old Word file. Save it as .docx in Word and try again.");

  // What fields do is left out; what they show stays.
  let deep = 0;
  const open: boolean[] = [];
  let shown = "";
  for (const sign of text) {
    if (sign === "\x13") {
      open.push(false);
      deep += 1;
    } else if (sign === "\x14" && open.length > 0) {
      if (!open[open.length - 1]) deep -= 1;
      open[open.length - 1] = true;
    } else if (sign === "\x15" && open.length > 0) {
      if (!open.pop()) deep -= 1;
    } else if (deep === 0) shown += sign;
  }
  const blocks: FlowBlock[] = [];
  const style: FlowStyle = { font: "Times New Roman", size: 11 };
  const pages = shown
    .replace(/\x07\x07/g, "\r")
    .replace(/\x07/g, "\t")
    .replace(/\x0b/g, "\n")
    .replace(/\x1e/g, "‑")
    .split("\f");
  pages.forEach((page, p) => {
    if (p > 0) blocks.push({ kind: "break" });
    const lines = page.split("\r");
    if (lines[lines.length - 1] === "") lines.pop();
    for (const line of lines) {
      const words = plain(line).replace(/[\x0e-\x1f]/g, "");
      blocks.push({
        kind: "para",
        runs: [{ text: words, style: { ...style } }],
        before: 0,
        after: 4,
        line: { times: 1 },
      });
    }
  });
  return {
    kind: "flow",
    ...info,
    sections: [{ w: 595.28, h: 841.89, margin: { top: 72, right: 72, bottom: 72, left: 72 }, blocks }],
  };
}
