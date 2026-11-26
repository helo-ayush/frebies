import { FRESH_DECOR } from "../engine/decor";
import { faceOf, loadFaces, matchLibrary, splitByFace } from "../engine/fonts";
import { SOFT, heightOf, layText, linesOf, measureBox, paraSize, textWidth, type Laid } from "../engine/text-dom";
import { layTable } from "../engine/table";
import { shapeDef } from "../engine/shape-kinds";
import {
  DEFAULT_STYLE,
  allParas,
  listStep,
  paraAt,
  plainText,
  sliceRuns,
  tidyParas,
  tidyRuns,
  uid,
  type Align,
  type Asset,
  type Cell,
  type Dash,
  type Decor,
  type Edge,
  type EditObject,
  type ImageObject,
  type Margin,
  type Mark,
  type Page,
  type Para,
  type Run,
  type ShapeObject,
  type Side,
  type Style,
  type TableObject,
  type TextBody,
  type TextObject,
} from "../model";
import type {
  AnyDoc,
  FixedDoc,
  FixedItem,
  FlowBlock,
  FlowBox,
  FlowDoc,
  FlowImage,
  FlowLine,
  FlowPara,
  FlowRun,
  FlowSection,
  FlowStyle,
  FlowTable,
} from "./flow";

/** Puts a document from another program on pages: text that goes on from page to page, tables, pictures, boxes. */

export type LaidOut = {
  pages: Page[];
  objects: Record<string, EditObject>;
  decor?: Decor;
  outline?: Mark[];
};

type MakeAsset = (blob: Blob) => Promise<Asset>;
type Options = {
  blank: (w: number, h: number) => Page;
  makeAsset: MakeAsset;
  /** Headers and footers as the document's own, instead of on every page. */
  decor: boolean;
};

// ---------------------------------------------------------------- words

/** How high a line of a font is by itself, for a size of 1. */
const NATURAL: Record<string, number> = {
  "lib:arimo": 1.15,
  "lib:tinos": 1.15,
  "lib:carlito": 1.22,
  "lib:caladea": 1.17,
  "lib:cousine": 1.13,
  "lib:gelasio": 1.14,
};
export const natural = (font: string) => NATURAL[font] ?? 1.2;

const colorOf = (value: string | undefined, other: string) =>
  value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : other;

function styleOf(style: FlowStyle | undefined): Style {
  const font = style?.font ? (style.font.startsWith("lib:") ? style.font : matchLibrary(style.font)) : "lib:carlito";
  return {
    ...DEFAULT_STYLE,
    font,
    size: Math.max(1, Math.round((style?.size ?? 11) * 100) / 100),
    color: colorOf(style?.color, "#000000"),
    bold: Boolean(style?.bold),
    italic: Boolean(style?.italic),
    underline: Boolean(style?.underline),
    strike: Boolean(style?.strike),
    tracking: style?.tracking ? Math.round(style.tracking * 100) / 100 : 0,
    back: style?.highlight ? colorOf(style.highlight, "#ffff00") : undefined,
    script: style?.script,
    link: style?.link,
  };
}

const NBSP = String.fromCharCode(160);

const softly = (text: string) => text.replace(/\r\n?/g, "\n").split("\n").join(SOFT);

/** A picture that stands in a line of words, until it is known where that is. */
type Inline = { image: FlowImage; at: number };

type Piece = { runs: Run[]; para: Para; inline: Inline[]; align: Align; heading?: number };

/** Small pictures stay in their line. */
const inLine = (image: FlowImage, size: number) => image.h <= size * 1.9 && image.w <= 160;

const widthOf = (text: string, style: Style) =>
  splitByFace(text, style).reduce((sum, part) => sum + textWidth(part.text, style, part.face), 0);

/** Tabs as spaces that reach to where the paragraph's own stops are. */
function tabbed(runs: readonly Run[], tabs: readonly number[] | undefined, from: number, left: number): Run[] {
  // The usual stops are the editor's own, as long as they are counted from the same place.
  if ((!tabs || tabs.length === 0) && left === 0 && from === 0) return [...runs];
  const stops = tabs ?? [];
  const out: Run[] = [];
  let x = from;
  for (const run of runs) {
    for (const part of run.text.split(/(\t)/)) {
      if (part === "") continue;
      if (part === "\t") {
        const next = stops.find((stop) => stop > x + 0.6) ?? (Math.floor(x / 36 + 0.01) + 1) * 36;
        const space = widthOf(NBSP, run.style);
        out.push({
          text: NBSP,
          style: {
            ...run.style,
            underline: false,
            strike: false,
            tracking: Math.round((next - x - space) * 100) / 100,
          },
        });
        x = next;
        continue;
      }
      out.push({ text: part, style: run.style });
      const lines = part.split(SOFT);
      if (lines.length > 1) x = left;
      x += widthOf(lines[lines.length - 1], run.style);
    }
  }
  return out;
}

function pieceOf(para: FlowPara, runs: readonly FlowRun[]): Piece {
  const out: Run[] = [];
  const inline: Inline[] = [];
  let length = 0;
  const base = styleOf(runs.find((run) => run.style)?.style ?? para.runs.find((run) => run.style)?.style);
  for (const run of runs) {
    if (run.image) {
      // A space as wide as the picture keeps its place.
      const space = textWidth(" ", base, faceOf(base));
      out.push({ text: " ", style: { ...base, tracking: Math.max(0, run.image.w - space) } });
      inline.push({ image: run.image, at: length });
      length += 1;
      continue;
    }
    const text = softly(run.text);
    if (text === "") continue;
    out.push({ text, style: styleOf(run.style) });
    length += text.length;
  }
  if (out.length === 0) out.push({ text: "", style: base });
  if (out.some((run) => run.text.includes("\t"))) {
    const from = para.list ? (para.left ?? 0) : Math.max(0, (para.left ?? 0) + (para.first ?? 0));
    out.splice(0, out.length, ...tabbed(out, para.tabs, from, para.left ?? 0));
  }
  const size = paraSize(out);
  const big = out.reduce((best, run) => (run.style.size > best.style.size ? run : best), out[0]);
  const own = natural(big.style.font) * size;
  const leading =
    !para.line || "times" in para.line
      ? own * (para.line && "times" in para.line ? Math.max(0.5, para.line.times) : 1)
      : para.line.atLeast
        ? Math.max(own, para.line.points)
        : para.line.points;
  const made: Para = {
    align: para.align && para.align !== "left" ? para.align : undefined,
    right: para.right && para.right > 0 ? para.right : undefined,
    before: para.before ? Math.max(0, para.before) : undefined,
    after: para.after ? Math.max(0, para.after) : undefined,
    leading: Math.round(leading * 100) / 100,
    fill: para.fill,
  };
  if (para.list) {
    const step = listStep(size);
    const hang = para.first !== undefined && para.first < 0 ? -para.first : Math.min(step, para.left ?? step);
    const left = para.left ?? step * (para.list.level + 1);
    made.left = left;
    made.list = {
      type: para.list.type,
      mark: para.list.mark || "•",
      level: para.list.level,
      start: para.list.start,
      gap: Math.max(6, Math.min(left, hang || step)),
    };
  } else {
    made.left = para.left && para.left !== 0 ? Math.max(0, para.left) : undefined;
    made.first = para.first || undefined;
  }
  return { runs: out, para: made, inline, align: para.align ?? "left", heading: para.heading };
}

/** Pieces one under the other as one text. */
function bodyOf(pieces: readonly Piece[]): TextBody {
  const runs: Run[] = [];
  pieces.forEach((piece, i) => {
    if (i > 0) runs.push({ text: "\n", style: pieces[i - 1].runs[pieces[i - 1].runs.length - 1].style });
    runs.push(...piece.runs);
  });
  const leading = pieces[0]?.para.leading ?? 14;
  const paras = pieces.map((piece): Para => ({
    ...piece.para,
    leading: Math.abs((piece.para.leading ?? leading) - leading) > 0.05 ? piece.para.leading : undefined,
  }));
  return { runs: tidyRuns(runs), paras: tidyParas(paras), align: "left", leading };
}

/** Paragraphs of a cell or a box. */
function bodyFrom(blocks: readonly FlowPara[]): TextBody {
  const pieces = blocks.map((para) =>
    pieceOf(
      para,
      para.runs.filter((run) => !run.image),
    ),
  );
  if (pieces.length === 0) return { runs: [{ text: "", style: styleOf(undefined) }], align: "left", leading: 13.4 };
  return bodyOf(pieces);
}

/** All the same on one side: one setting for the text instead of one for every paragraph. */
function simpler(body: TextBody): TextBody {
  const all = allParas(body);
  const align = all[0]?.align ?? body.align;
  if (!all.every((para) => (para.align ?? body.align) === align)) return body;
  return { ...body, align, paras: tidyParas(all.map((para) => ({ ...para, align: undefined }))) };
}

function eachStyle(doc: AnyDoc, visit: (style: Style, text: string) => void) {
  const paras = (blocks: readonly FlowPara[]) => {
    for (const para of blocks) {
      for (const run of para.runs) if (run.text !== undefined) visit(styleOf(run.style), run.text);
      if (para.list) visit({ ...styleOf(para.runs[0]?.style), font: "lib:symbols" }, para.list.mark);
    }
  };
  const blocks = (list: readonly FlowBlock[]) => {
    for (const block of list) {
      if (block.kind === "para") paras([block]);
      else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) paras(cell.blocks);
      else if (block.kind === "box") paras(block.blocks);
    }
  };
  if (doc.kind === "flow")
    for (const section of doc.sections)
      blocks([...section.blocks, ...(section.header ?? []), ...(section.footer ?? [])]);
  else
    for (const page of doc.pages)
      for (const item of page.items) {
        if (item.kind === "text") paras(item.blocks);
        else if (item.kind === "table") blocks([item.table]);
      }
}

async function loadAll(doc: AnyDoc) {
  const styles = new Map<string, Style>();
  let sample = "Aa";
  eachStyle(doc, (style, text) => {
    styles.set(`${style.font}${style.bold}${style.italic}`, style);
    if (/[ऀ-ॿ]/.test(text) && !sample.includes("क")) sample += "क";
    if ((text.codePointAt(0) ?? 0) > 0x2030 && !sample.includes("•")) sample += "•";
  });
  styles.set("base", styleOf(undefined));
  await loadFaces([...styles.values()], sample);
}

// ---------------------------------------------------------------- tables

const edgeOf = (line: FlowLine | null | undefined): Edge | null | undefined =>
  line === undefined
    ? undefined
    : line === null
      ? null
      : {
          color: colorOf(line.color, "#000000"),
          width: Math.max(0.1, line.width),
          dash: (line.dash ?? "solid") as Dash,
        };

function tableOf(table: FlowTable, room: number): Omit<TableObject, "id" | "x" | "y"> {
  const count = Math.max(
    1,
    table.cols.length,
    ...table.rows.map((row) => row.cells.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0)),
  );
  const given = Array.from({ length: count }, (_, i) => (table.cols[i] > 0 ? table.cols[i] : 0));
  const known = given.filter((w) => w > 0);
  const each = known.length > 0 ? known.reduce((sum, w) => sum + w, 0) / known.length : room / count;
  let cols = given.map((w) => (w > 0 ? w : each));
  const sum = cols.reduce((total, w) => total + w, 0);
  if (sum > room) cols = cols.map((w) => (w * room) / sum);
  const blankStyle = styleOf(undefined);
  const empty = (): Cell => ({ runs: [{ text: "", style: blankStyle }], align: "left", leading: 13.4, covered: true });
  const grid: (Cell | null)[][] = table.rows.map(() => Array.from({ length: count }, () => null));
  table.rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (c < count && grid[r][c]) c += 1;
      if (c >= count) break;
      const rows = Math.min(table.rows.length - r, Math.max(1, cell.rowSpan ?? 1));
      const wide = Math.min(count - c, Math.max(1, cell.colSpan ?? 1));
      const edges: Cell["edges"] = {};
      for (const side of ["top", "right", "bottom", "left"] as Side[]) {
        const edge = edgeOf(cell.border?.[side]);
        if (edge !== undefined) edges[side] = edge;
      }
      for (let i = r; i < r + rows; i += 1) for (let k = c; k < c + wide; k += 1) grid[i][k] = empty();
      grid[r][c] = {
        ...simpler(bodyFrom(cell.blocks)),
        fill: cell.fill,
        valign: cell.valign,
        rows: rows > 1 ? rows : undefined,
        cols: wide > 1 ? wide : undefined,
        edges: Object.keys(edges).length > 0 ? edges : undefined,
      };
      c += wide;
    }
  });
  const cells = grid.map((row) => row.map((cell): Cell => cell ?? { ...empty(), covered: undefined }));
  const pad = table.pad ?? { top: 2, right: 5, bottom: 2, left: 5 };
  const made: Omit<TableObject, "id" | "x" | "y"> = {
    type: "table",
    w: 0,
    h: 0,
    angle: 0,
    opacity: 1,
    cols,
    rows: table.rows.map((row) => Math.max(6, row.h ?? 8)),
    cells,
    edge: edgeOf(table.border) ?? null,
    pad: { x: Math.max(0, (pad.left + pad.right) / 2), y: Math.max(0, (pad.top + pad.bottom) / 2) },
    head: table.rows[0]?.head || undefined,
  };
  const lay = layTable({ ...made, id: "", x: 0, y: 0 });
  return { ...made, w: lay.w, h: lay.h };
}

/** Rows from one place to another as a table of their own. */
function rowsOf(
  table: Omit<TableObject, "id" | "x" | "y">,
  from: number,
  to: number,
  head: boolean,
): Omit<TableObject, "id" | "x" | "y"> {
  const cells = [...(head ? [table.cells[0]] : []), ...table.cells.slice(from, to)].map((row) =>
    row.map((cell) => ({ ...cell })),
  );
  const rows = [...(head ? [table.rows[0]] : []), ...table.rows.slice(from, to)];
  // A cell that began on the page before is closed there and goes on here.
  const shift = head ? 1 : 0;
  table.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      const span = cell.rows ?? 1;
      if (cell.covered || span < 2) return;
      if (r < from && r + span > from) {
        const left = r + span - from;
        const at = cells[shift]?.[c];
        if (at)
          Object.assign(at, {
            ...cell,
            runs: [{ text: "", style: cell.runs[0].style }],
            paras: undefined,
            covered: undefined,
            rows: left > 1 ? Math.min(left, to - from) : undefined,
          });
      } else if (r >= from && r < to && r + span > to) {
        const at = cells[shift + r - from]?.[c];
        if (at) at.rows = to - r > 1 ? to - r : undefined;
      }
    }),
  );
  const next = { ...table, cells, rows };
  const lay = layTable({ ...next, id: "", x: 0, y: 0 });
  return { ...next, w: lay.w, h: lay.h };
}

// ---------------------------------------------------------------- documents that flow

const bordered = (para: FlowPara) =>
  Boolean(para.border && (para.border.top || para.border.bottom || para.border.left || para.border.right));

/** One frame around both: nothing between them, the same on the sides. */
function sameFrame(a: FlowPara, b: FlowPara): boolean {
  if (!bordered(a) || !bordered(b) || b.breakBefore || a.border?.bottom || b.border?.top) return false;
  const side = (line: FlowLine | undefined) => (line ? `${line.color}${line.width}${line.dash ?? ""}` : "");
  const plain = (para: FlowPara) => para.runs.every((run) => !run.image);
  return (
    plain(a) &&
    plain(b) &&
    side(a.border?.left) === side(b.border?.left) &&
    side(a.border?.right) === side(b.border?.right)
  );
}

class Flower {
  pages: Page[] = [];
  objects: Record<string, EditObject> = {};
  outline: Mark[] = [];
  private column = 0;
  private y = 0;
  private section: FlowSection;
  private waiting: Piece[] = [];
  /** Pictures that stand beside the text: what is next to them keeps clear. */
  private beside: { side: "left" | "right"; w: number; page: string; column: number; from: number; until: number }[] =
    [];
  private assets = new Map<Uint8Array, Promise<Asset | null>>();

  constructor(
    section: FlowSection,
    private readonly options: Options,
  ) {
    this.section = section;
  }

  get page(): Page {
    return this.pages[this.pages.length - 1];
  }
  private get columns() {
    return Math.max(1, Math.min(6, this.section.columns ?? 1));
  }
  private get width() {
    const { w, margin } = this.section;
    const gap = this.section.gap ?? 24;
    return Math.max(40, (w - margin.left - margin.right - gap * (this.columns - 1)) / this.columns);
  }
  private get left() {
    return this.section.margin.left + this.column * (this.width + (this.section.gap ?? 24));
  }
  private get top() {
    return this.section.margin.top;
  }
  private get foot() {
    return this.section.h - this.section.margin.bottom;
  }

  startSection(section: FlowSection) {
    this.section = section;
    this.newPage();
  }

  newPage() {
    const { w, h, margin } = this.section;
    const page = { ...this.options.blank(w, h), margin: { ...margin } as Margin };
    this.pages.push(page);
    this.column = 0;
    this.y = this.top;
  }

  /** The next column, or the next page. */
  private next() {
    if (this.column + 1 < this.columns) {
      this.column += 1;
      this.y = this.top;
    } else this.newPage();
  }

  put(object: EditObject, page = this.page, under = false) {
    this.objects[object.id] = object;
    if (under) page.objects.unshift(object.id);
    else page.objects.push(object.id);
  }

  asset(bytes: Uint8Array, mime: string): Promise<Asset | null> {
    let job = this.assets.get(bytes);
    if (!job) {
      job = this.options.makeAsset(new Blob([bytes as BlobPart], { type: mime })).catch(() => null);
      this.assets.set(bytes, job);
    }
    return job;
  }

  async image(image: FlowImage, x: number, y: number, w: number, h: number, page = this.page, under = false) {
    const asset = await this.asset(image.bytes, image.mime);
    if (!asset) return;
    const object: ImageObject = {
      id: uid("i"),
      type: "image",
      asset: asset.id,
      x,
      y,
      w,
      h,
      angle: 0,
      opacity: 1,
      crop: image.crop,
    };
    if (image.angle) {
      const rad = (image.angle * Math.PI) / 180;
      object.angle = image.angle;
      object.x = x + w / 2 - (Math.cos(rad) * w - Math.sin(rad) * h) / 2;
      object.y = y + h / 2 - (Math.sin(rad) * w + Math.cos(rad) * h) / 2;
    }
    this.put(object, page, under);
  }

  // ---------------------------------------------------------- text

  add(piece: Piece) {
    this.waiting.push(piece);
  }

  /** Puts down the paragraphs gathered so far, over as many pages as they need. */
  async flush() {
    if (this.waiting.length === 0) return;
    let pieces = this.waiting;
    this.waiting = [];
    // Next to a picture only a few paragraphs at a time, each as narrow as it has to be.
    while (pieces.length > 0) {
      const [first, ...rest] = pieces;
      const ahead = this.besideNow(Infinity);
      if (!ahead) break;
      const beside = this.besideNow(this.y + (first.para.before ?? 0) + heightOf(bodyOf([first]), this.width));
      if (!beside) {
        // Still above it.
        pieces = rest;
        await this.text([first]);
        continue;
      }
      const narrow: Piece = {
        ...first,
        para: {
          ...first.para,
          ...(beside.side === "left"
            ? { left: (first.para.left ?? 0) + beside.w }
            : { right: (first.para.right ?? 0) + beside.w }),
        },
      };
      pieces = rest;
      await this.text([narrow]);
    }
    if (pieces.length > 0) await this.text(pieces);
  }

  /** What stands beside the text between here and `down`. */
  private besideNow(down: number) {
    this.beside = this.beside.filter(
      (item) => item.page === this.page.id && item.column === this.column && item.until > this.y + 4,
    );
    return this.beside.filter((item) => item.from < down - 3).pop() ?? null;
  }

  /** The text beside something keeps clear of it. False when there is no room beside it. */
  private keepClear(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.max(this.left, x);
    const x1 = Math.min(this.left + this.width, x + w);
    if (x1 - x0 < 8 || y + h < this.y || y > this.foot) return true;
    const left = x - this.left < this.left + this.width - (x + w);
    const take = (left ? x + w - this.left : this.left + this.width - x) + 8;
    if (take >= this.width * 0.72) return false;
    this.beside.push({
      side: left ? "left" : "right",
      w: take,
      page: this.page.id,
      column: this.column,
      from: y,
      until: y + h,
    });
    return true;
  }

  private async text(pieces: Piece[]) {
    const flow = uid("f");
    let body = bodyOf(pieces);
    let cont = false;
    let starts = pieceStarts(pieces);
    const frames: TextObject[] = [];
    for (let guard = 0; guard < 3000; guard += 1) {
      // Space before the first paragraph of a page is left out, as elsewhere.
      if (this.y <= this.top + 0.1 && this.pages.length > 1 && body.paras?.[0]?.before && !cont && frames.length > 0)
        body = {
          ...body,
          paras: tidyParas(allParas(body).map((para, i) => (i === 0 ? { ...para, before: undefined } : para))),
        };
      const laid: Laid = { ...body, wrap: true, w: this.width };
      const room = this.foot - this.y;
      const lines = linesOf(laid);
      let count = lines.findIndex((line) => line.bottom > room + 0.5);
      if (count < 0) count = lines.length;
      if (count === 0) {
        if (this.y > this.top + 1) {
          this.next();
          continue;
        }
        count = 1;
      }
      // No single line of a paragraph alone at the foot or the head of a page.
      if (count < lines.length && count > 1) {
        const cutPara = lines[count].para;
        const own = lines.filter((line) => line.para === cutPara);
        const here = own.filter((line) => lines.indexOf(line) < count).length;
        if (here === 1 && own.length > 2) count -= 1;
        else if (own.length - here === 1 && here > 2) count -= 1;
      }
      const split = count < lines.length ? lines[count] : null;
      const inside = split ? split.para === lines[count - 1].para : false;
      const part = split ? cut(body, 0, inside ? split.from : split.from - 1, false) : body;
      const h = measureBox({ ...part, wrap: true, w: this.width }).h;
      const object: TextObject = {
        id: uid("t"),
        type: "text",
        x: this.left,
        y: this.y,
        w: this.width,
        h,
        angle: 0,
        opacity: 1,
        ...part,
        wrap: true,
        flow,
        cont: cont || undefined,
      };
      this.put(object);
      frames.push(object);
      await this.place(object, starts, split ? split.from : Infinity);
      if (!split) {
        this.y += h;
        break;
      }
      body = cut(body, split.from, plainText(body.runs).length, inside);
      starts = starts
        .map((start) => ({ ...start, at: start.at - split.from }))
        .filter((start) => start.at + start.length >= 0);
      cont = inside;
      this.next();
    }
    if (frames.length === 1) delete frames[0].flow;
  }

  /** Pictures that stand in the words, and the headings, now that their place is known. */
  private async place(object: TextObject, starts: PieceStart[], end: number) {
    const pictures = starts.flatMap((start) =>
      start.piece.inline.map((inline) => ({ inline, at: start.at + inline.at })),
    );
    const here = pictures.filter(({ at }) => at >= 0 && at < end);
    const heads = starts.filter((start) => start.piece.heading && start.at >= 0 && start.at < end);
    if (here.length === 0 && heads.length === 0) return;
    const page = this.page;
    const laid: Laid = { ...object, wrap: true, w: object.w };
    const spots = layText(laid);
    for (const { inline, at } of here) {
      const spot = spots.find((piece) => piece.at <= at && at < piece.at + piece.text.length);
      if (!spot) continue;
      const before = textWidth(spot.text.slice(0, at - spot.at), spot.style, spot.face);
      const { image } = inline;
      await this.image(
        image,
        object.x + spot.x + before,
        object.y + spot.baseline - image.h + 1,
        image.w,
        image.h,
        page,
      );
    }
    for (const { piece, at } of heads) {
      const title = plainText(piece.runs).split(SOFT).join(" ").replace(/ /g, " ").trim();
      if (title === "") continue;
      const spot = spots.find((item) => !item.mark && item.at >= at);
      const y = spot ? object.y + spot.baseline - spot.style.size : object.y;
      this.outline.push({
        id: uid("m"),
        title: title.slice(0, 160),
        page: page.id,
        y: Math.max(0, y),
        level: Math.max(0, (piece.heading ?? 1) - 1),
      });
    }
  }

  // ---------------------------------------------------------- everything else

  async block(block: FlowBlock) {
    switch (block.kind) {
      case "para":
        await this.para(block);
        break;
      case "table":
        await this.flush();
        await this.table(block);
        break;
      case "box":
        await this.flush();
        this.box(block);
        break;
      case "rule": {
        await this.flush();
        if (this.y + 12 > this.foot) this.next();
        this.line(this.left, this.y + 6, this.width, 0, block.color ?? "#a5a4a2", block.width ?? 0.75);
        this.y += 12;
        break;
      }
      case "break":
        await this.flush();
        this.newPage();
        break;
    }
  }

  private line(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    width: number,
    dash: Dash = "solid",
    page = this.page,
  ) {
    const object: ShapeObject = {
      id: uid("g"),
      type: "shape",
      kind: "line",
      x,
      y,
      w,
      h,
      angle: 0,
      opacity: 1,
      stroke: colorOf(color, "#000000"),
      fill: null,
      width: Math.max(0.1, width),
      dash,
    };
    this.put(object, page);
  }

  private async para(para: FlowPara) {
    if (para.breakBefore && (this.y > this.top + 1 || this.waiting.length > 0)) {
      await this.flush();
      this.newPage();
    }
    const size = Math.max(6, ...para.runs.map((run) => run.style?.size ?? 0));
    // Pictures that stand on their own.
    const parts: (FlowRun[] | FlowImage)[] = [[]];
    const floats: FlowImage[] = [];
    for (const run of para.runs) {
      if (!run.image) (parts[parts.length - 1] as FlowRun[]).push(run);
      else if (run.image.float) floats.push(run.image);
      else if (inLine(run.image, size)) (parts[parts.length - 1] as FlowRun[]).push(run);
      else {
        parts.push(run.image);
        parts.push([]);
      }
    }
    if (floats.length > 0) {
      await this.flush();
      for (const image of floats) await this.float(image, para);
    }
    const words = (runs: FlowRun[]) => runs.some((run) => run.image || run.text.trim() !== "");
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (Array.isArray(part)) {
        if (parts.length > 1 && !words(part)) continue;
        const first = i === 0;
        const last = i === parts.length - 1;
        const own: FlowPara = {
          ...para,
          before: first ? para.before : 0,
          after: last ? para.after : 0,
          list: first ? para.list : undefined,
        };
        if (bordered(para)) await this.frame([{ ...own, runs: part }]);
        else this.add(pieceOf(own, part));
      } else {
        await this.flush();
        await this.picture(part, para);
      }
    }
  }

  /** Paragraphs with lines around all of them. */
  async frame(list: readonly FlowPara[]) {
    await this.flush();
    const pieces = list.map((para) =>
      pieceOf(
        para,
        para.runs.filter((run) => !run.image || inLine(run.image, run.style?.size ?? 11)),
      ),
    );
    const first = pieces[0].para;
    const last = pieces[pieces.length - 1].para;
    const before = first.before ?? 0;
    const after = last.after ?? 0;
    const inner = pieces.map((piece, i) => ({
      ...piece,
      para: {
        ...piece.para,
        before: i === 0 ? undefined : piece.para.before,
        after: i === pieces.length - 1 ? undefined : piece.para.after,
      },
    }));
    const h = heightOf(bodyOf(inner), this.width);
    if (this.y + before + h > this.foot && this.y > this.top + 1) this.next();
    else this.y += before;
    const page = this.page;
    const at = page.objects.length;
    const top = this.y;
    const border = list[0].border ?? {};
    const bottomLine = list[list.length - 1].border?.bottom;
    const indent = Math.min(
      ...list.map((para) => (para.list ? 0 : Math.max(0, (para.left ?? 0) + Math.min(0, para.first ?? 0)))),
    );
    const x0 = this.left + indent - (border.left ? 4 : 0);
    const x1 =
      this.left + this.width - Math.max(0, Math.min(...list.map((para) => para.right ?? 0))) + (border.right ? 4 : 0);
    const { fill } = list[0];
    const shared = Boolean(border.left && border.right && fill && list.every((para) => para.fill === fill));
    await this.text(shared ? inner.map((piece) => ({ ...piece, para: { ...piece.para, fill: undefined } })) : inner);
    const bottom = this.page === page ? this.y : this.foot;
    if (shared) {
      // The colour reaches to the lines.
      const back: ShapeObject = {
        id: uid("g"),
        type: "shape",
        kind: "rect",
        x: x0,
        y: top - 1,
        w: x1 - x0,
        h: bottom - top + 2,
        angle: 0,
        opacity: 1,
        stroke: null,
        fill: colorOf(fill, "#ffffff"),
        width: 0,
        dash: "solid",
      };
      this.objects[back.id] = back;
      page.objects.splice(at, 0, back.id);
    }
    const put = (line: FlowLine | undefined, x: number, y: number, w: number, high: number) => {
      if (line) this.line(x, y, w, high, line.color, line.width, line.dash ?? "solid", page);
    };
    put(border.top, x0, top - 1, x1 - x0, 0);
    put(bottomLine, x0, bottom + 1, x1 - x0, 0);
    put(border.left, x0, top - 1, 0, bottom - top + 2);
    put(border.right, x1, top - 1, 0, bottom - top + 2);
    this.y += 1 + after;
  }

  private async picture(image: FlowImage, para: FlowPara) {
    const k = Math.min(1, this.width / Math.max(1, image.w), (this.foot - this.top) / Math.max(1, image.h));
    const w = image.w * k;
    const h = image.h * k;
    if (this.y + h > this.foot + 0.5 && this.y > this.top + 1) this.next();
    else this.y += Math.min(12, para.before ?? 0);
    const free = this.width - w;
    const x =
      this.left +
      (para.align === "center"
        ? free / 2
        : para.align === "right"
          ? free
          : Math.min(free, Math.max(0, para.left ?? 0)));
    await this.image(image, x, this.y, w, h);
    this.y += h + Math.max(4, para.after ?? 4);
  }

  private async float(image: FlowImage, para: FlowPara) {
    const float = image.float;
    if (!float) return;
    const k = Math.min(1, this.section.w / Math.max(1, image.w));
    const w = image.w * k;
    const h = image.h * k;
    // As wide as the text: it stands between the lines.
    if (!float.behind && float.from === "para" && w > this.width * 0.72) {
      await this.picture(image, para);
      return;
    }
    if (float.from === "para" && !float.behind && this.y + float.y + h > this.foot + 2 && this.y > this.top + 1)
      this.next();
    const x = float.from === "page" ? float.x : this.left + float.x;
    const y = float.from === "page" ? float.y : this.y + float.y;
    await this.image(image, x, Math.max(0, Math.min(this.section.h - h, y)), w, h, this.page, float.behind);
    if (float.behind) return;
    if (!this.keepClear(x, y, w, h)) this.y = Math.max(this.y, y + h + 4);
  }

  private async table(block: FlowTable) {
    // Pictures in cells are put over them once their place is known.
    const made = tableOf(block, Math.max(40, this.section.w - this.left - Math.min(this.section.margin.right, 18)));
    const free = Math.max(0, this.width - made.w);
    const x = this.left + (block.align === "center" ? free / 2 : block.align === "right" ? free : (block.left ?? 0));
    let from = 0;
    const total = made.cells.length;
    while (from < total) {
      const head = from > 0 && Boolean(made.head);
      const room = this.foot - this.y;
      let to = total;
      let part = rowsOf(made, from, to, head);
      if (part.h > room + 0.5) {
        const lay = layTable({ ...part, id: "", x: 0, y: 0 });
        const shift = head ? 1 : 0;
        let fit = 0;
        while (fit < total - from && lay.ys[fit + shift + 1] <= room + 0.5) fit += 1;
        if (fit === 0) {
          if (this.y > this.top + 1) {
            this.next();
            continue;
          }
          fit = 1;
        }
        to = from + fit;
        part = rowsOf(made, from, to, head);
      }
      const object: TableObject = { ...part, id: uid("b"), x, y: this.y };
      this.put(object);
      await this.cellPictures(block, object, from, to, head);
      this.y += part.h;
      from = to;
      if (from < total) this.next();
    }
    this.y += 4;
  }

  private async cellPictures(block: FlowTable, table: TableObject, from: number, to: number, head: boolean) {
    const any = block.rows.some((row) =>
      row.cells.some((cell) => cell.blocks.some((para) => para.runs.some((run) => run.image))),
    );
    if (!any) return;
    const lay = layTable(table);
    const shift = head ? 1 : 0;
    const page = this.page;
    for (let r = from; r < to; r += 1) {
      let c = -1;
      const shown = table.cells[r - from + shift].map((cell, i) => (cell.covered ? -1 : i)).filter((i) => i >= 0);
      for (const cell of block.rows[r].cells) {
        c += 1;
        const box = lay.cells.find((item) => item.r === r - from + shift && item.c === shown[c]);
        if (!box) continue;
        let y = box.box.y + table.pad.y;
        for (const para of cell.blocks) {
          for (const run of para.runs) {
            if (!run.image) continue;
            const k = Math.min(1, (box.box.w - table.pad.x * 2) / run.image.w, (box.box.h - 4) / run.image.h);
            const w = run.image.w * k;
            const free = box.box.w - table.pad.x * 2 - w;
            const x =
              box.box.x + table.pad.x + (para.align === "center" ? free / 2 : para.align === "right" ? free : 0);
            await this.image(run.image, table.x + x, table.y + y, w, run.image.h * k, page);
            y += run.image.h * k + 2;
          }
        }
      }
    }
  }

  private box(block: FlowBox) {
    const x = block.from === "page" ? block.x : this.left + block.x;
    const y = block.from === "page" ? block.y : this.y + block.y;
    const words = block.blocks.some((para) => para.runs.some((run) => run.text));
    const body = words ? simpler(bodyFrom(block.blocks)) : null;
    const line = block.shape === "line" || block.shape?.endsWith("Connector1");
    const object: ShapeObject = {
      id: uid("g"),
      type: "shape",
      kind: line ? "line" : block.shape && shapeDef(block.shape) ? block.shape : "rect",
      x,
      y,
      w: Math.max(0, block.w),
      h: Math.max(0, block.h),
      angle: 0,
      opacity: 1,
      stroke: block.stroke ? colorOf(block.stroke.color, "#000000") : line ? "#000000" : null,
      fill: block.fill ? colorOf(block.fill, "#ffffff") : null,
      width: block.stroke?.width ?? (line ? 0.75 : 0),
      dash: (block.stroke?.dash ?? "solid") as Dash,
      text: body ? { ...body, valign: block.valign ?? "top", pad: 5 } : undefined,
    };
    // A coloured area without words is what the text lies on.
    const under = !body && Boolean(object.fill) && block.w * block.h > this.section.w * this.section.h * 0.12;
    this.put(object, this.page, under);
    if (!under && !line && (body || object.fill)) this.keepClear(x, y, block.w, block.h);
  }
}

type PieceStart = { piece: Piece; at: number; length: number };

function pieceStarts(pieces: readonly Piece[]): PieceStart[] {
  let at = 0;
  return pieces.map((piece) => {
    const length = plainText(piece.runs).length;
    const start = { piece, at, length };
    at += length + 1;
    return start;
  });
}

/** Some letters of a text with their paragraphs. */
function cut(body: TextBody, from: number, to: number, inside: boolean): TextBody {
  const runs = sliceRuns(body.runs, from, to);
  const style = runs[0]?.style ?? body.runs[0].style;
  const own = runs.length > 0 ? tidyRuns(runs) : [{ text: "", style }];
  if (!body.paras) return { ...body, runs: own };
  const first = paraAt(body.runs, from).index;
  const last = paraAt(body.runs, to).index;
  const all = allParas(body);
  const paras = all.slice(first, last + 1);
  if (inside && paras[0]) paras[0] = { ...paras[0], first: undefined, before: undefined, list: undefined };
  if (from > 0) {
    // Numbers go on where they were.
    const next = paras.findIndex((para) => para.list?.type === "number");
    const list = next >= 0 ? paras[next].list : undefined;
    if (list && list.start === undefined) {
      const value = countAt(all, first + next);
      if (value > 1) paras[next] = { ...paras[next], list: { ...list, start: value, resume: true } };
    }
  }
  return { ...body, runs: own, paras: tidyParas(paras) };
}

/** The number a paragraph of a list has. */
function countAt(all: readonly Para[], index: number): number {
  const own = all[index].list;
  if (!own) return 1;
  let count = 1;
  for (let i = index - 1; i >= 0; i -= 1) {
    const list = all[i].list;
    if (!list || list.level < own.level) break;
    if (list.level > own.level) continue;
    if (list.type !== own.type || list.mark !== own.mark) break;
    if (list.start !== undefined) return list.start + count;
    count += 1;
  }
  return count;
}

/** Header or footer that is only words, one line each: these can be the document's own. */
function bandOf(
  blocks: readonly FlowBlock[] | undefined,
): { left: string; center: string; right: string; style: FlowStyle | undefined } | null {
  if (!blocks || blocks.length === 0) return null;
  const band = { left: "", center: "", right: "", style: undefined as FlowStyle | undefined };
  for (const block of blocks) {
    if (block.kind !== "para") return null;
    if (block.runs.some((run) => run.image)) return null;
    const text = block.runs.map((run) => run.text ?? "").join("");
    if (text.includes("\n")) return null;
    if (text.trim() === "") continue;
    band.style ??= block.runs.find((run) => run.text?.trim())?.style;
    // Word's own way: left, a tab, the middle, a tab, the right.
    const parts = text.split("\t").map((part) => part.trim());
    if (parts.length > 3) return null;
    const put = (side: "left" | "center" | "right", words: string) => {
      if (words === "") return true;
      if (band[side]) return false;
      band[side] = words;
      return true;
    };
    const sides: ("left" | "center" | "right")[] =
      parts.length > 1
        ? parts.length === 2
          ? ["left", "right"]
          : ["left", "center", "right"]
        : [block.align === "center" ? "center" : block.align === "right" ? "right" : "left"];
    if (!parts.every((part, i) => put(sides[i], part))) return null;
  }
  return band.left || band.center || band.right ? band : null;
}

async function layFlow(doc: FlowDoc, options: Options): Promise<LaidOut> {
  const sections =
    doc.sections.length > 0
      ? doc.sections
      : [{ w: 595.28, h: 841.89, margin: { top: 72, right: 72, bottom: 72, left: 72 }, blocks: [] }];
  const flower = new Flower(sections[0], options);
  const ranges: { section: FlowSection; from: number; to: number }[] = [];
  for (const section of sections) {
    const from = flower.pages.length;
    flower.startSection(section);
    for (let i = 0; i < section.blocks.length; i += 1) {
      const block = section.blocks[i];
      if (block.kind === "para" && bordered(block)) {
        const frame = [block];
        for (
          let next = section.blocks[i + 1];
          next?.kind === "para" && sameFrame(frame[frame.length - 1], next);
          next = section.blocks[i + 1]
        ) {
          frame.push(next);
          i += 1;
        }
        if (frame.length > 1) {
          await flower.frame(frame);
          continue;
        }
      }
      await flower.block(block);
    }
    await flower.flush();
    ranges.push({ section, from, to: flower.pages.length });
  }
  // A break at the very end leaves nothing but an empty page.
  const last = flower.pages[flower.pages.length - 1];
  if (flower.pages.length > 1 && last.objects.length === 0) flower.pages.pop();

  let decor: Decor | undefined;
  const heads = ranges.map(({ section }) => bandOf(section.header));
  const feet = ranges.map(({ section }) => bandOf(section.footer));
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const plain = ranges.every(
    ({ section }, i) =>
      (heads[i] || !section.header?.length) &&
      (feet[i] || !section.footer?.length) &&
      same(heads[i], heads[0]) &&
      same(feet[i], feet[0]),
  );
  if (options.decor && plain && (heads[0] || feet[0])) {
    const style = styleOf(heads[0]?.style ?? feet[0]?.style);
    const { section } = ranges[0];
    const strip = (band: NonNullable<ReturnType<typeof bandOf>>) => ({
      left: band.left,
      center: band.center,
      right: band.right,
    });
    decor = {
      ...FRESH_DECOR,
      bandStyle: { ...style, link: undefined },
      bandAt: Math.max(8, Math.round((heads[0] ? section.headerAt : section.footerAt) ?? 36)),
      header: heads[0] ? strip(heads[0]) : undefined,
      footer: feet[0] ? strip(feet[0]) : undefined,
    };
  } else {
    for (const { section, from, to } of ranges) {
      for (let i = from; i < Math.min(to, flower.pages.length); i += 1) {
        await bandObjects(flower, section, flower.pages[i], i + 1, flower.pages.length, options);
      }
    }
  }
  return {
    pages: flower.pages,
    objects: flower.objects,
    decor,
    outline: flower.outline.length > 0 ? flower.outline : undefined,
  };
}

/** Header and footer as things of their own on one page. */
async function bandObjects(
  flower: Flower,
  section: FlowSection,
  page: Page,
  number: number,
  count: number,
  options: Options,
) {
  const filled = (blocks: readonly FlowBlock[]): FlowBlock[] =>
    blocks.map((block) =>
      block.kind === "para"
        ? {
            ...block,
            runs: block.runs.map((run) =>
              run.image
                ? run
                : { ...run, text: run.text.replace(/\{page\}/g, String(number)).replace(/\{pages\}/g, String(count)) },
            ),
          }
        : block,
    );
  for (const [blocks, foot] of [
    [section.header, false],
    [section.footer, true],
  ] as const) {
    if (!blocks || blocks.length === 0) continue;
    // Laid out on a page of its own first, to know how high it is.
    const bench = new Flower(
      { ...section, columns: 1, margin: { ...section.margin, top: 0, bottom: 0 }, w: section.w, h: 4000, blocks: [] },
      options,
    );
    bench.newPage();
    for (const block of filled(blocks)) await bench.block(block);
    await bench.flush();
    const made = Object.values(bench.objects);
    if (made.length === 0) continue;
    const bottom = Math.max(...made.map((object) => object.y + object.h));
    const dy = foot ? section.h - (section.footerAt ?? 36) - bottom : (section.headerAt ?? 36);
    for (const object of made) {
      const moved = { ...object, id: uid("h"), y: object.y + dy } as EditObject;
      if (moved.type === "text") delete moved.flow;
      flower.put(moved, page, true);
    }
  }
}

// ---------------------------------------------------------------- pages where everything has its place

async function layFixed(doc: FixedDoc, options: Options): Promise<LaidOut> {
  const objects: Record<string, EditObject> = {};
  const pages: Page[] = [];
  const assets = new Map<Uint8Array, Promise<Asset | null>>();
  for (const slide of doc.pages) {
    const page = {
      ...options.blank(slide.w, slide.h),
      paper: slide.fill && slide.fill !== "#ffffff" ? slide.fill : undefined,
    };
    pages.push(page);
    for (const item of slide.items) {
      const object = await fixedObject(item, assets, options);
      if (!object) continue;
      objects[object.id] = object;
      page.objects.push(object.id);
    }
  }
  return { pages, objects };
}

/** Turned about the middle there, about the corner here. */
function corner(item: { x: number; y: number; w: number; h: number; angle?: number }): {
  x: number;
  y: number;
  angle: number;
} {
  const angle = item.angle ?? 0;
  if (!angle) return { x: item.x, y: item.y, angle: 0 };
  const rad = (angle * Math.PI) / 180;
  return {
    angle,
    x: item.x + item.w / 2 - (Math.cos(rad) * item.w - Math.sin(rad) * item.h) / 2,
    y: item.y + item.h / 2 - (Math.sin(rad) * item.w + Math.cos(rad) * item.h) / 2,
  };
}

async function fixedObject(
  item: FixedItem,
  assets: Map<Uint8Array, Promise<Asset | null>>,
  options: Options,
): Promise<EditObject | null> {
  switch (item.kind) {
    case "image": {
      let job = assets.get(item.bytes);
      if (!job)
        assets.set(
          item.bytes,
          (job = options.makeAsset(new Blob([item.bytes as BlobPart], { type: item.mime })).catch(() => null)),
        );
      const asset = await job;
      if (!asset) return null;
      return {
        id: uid("i"),
        type: "image",
        asset: asset.id,
        ...corner(item),
        w: item.w,
        h: item.h,
        opacity: item.opacity ?? 1,
        crop: item.crop,
        flipX: item.flipX || undefined,
        flipY: item.flipY || undefined,
      };
    }
    case "shape": {
      const line =
        item.shape === "line" || item.shape === "lineInv" || /^straightConnector|Connector1$/.test(item.shape);
      const stroke = item.stroke ? colorOf(item.stroke.color, "#000000") : line ? "#000000" : null;
      const inverse = (Boolean(item.flipX) !== Boolean(item.flipY)) !== (item.shape === "lineInv");
      return {
        id: uid("g"),
        type: "shape",
        kind: line ? "line" : shapeDef(item.shape) ? item.shape : "rect",
        ...corner(item),
        w: item.w,
        h: item.h,
        opacity: item.opacity ?? 1,
        stroke,
        fill: line ? null : item.fill ? colorOf(item.fill, "#ffffff") : null,
        width: item.stroke?.width ?? (line ? 1 : 0),
        dash: (item.stroke?.dash ?? "solid") as Dash,
        ...(line
          ? { flip: inverse || undefined, back: item.flipX || undefined, start: item.start, end: item.end }
          : { flipX: item.flipX || undefined, flipY: item.flipY || undefined, adj: item.adj }),
      };
    }
    case "table": {
      const made = tableOf(item.table, Math.max(item.w, 40));
      return { ...made, id: uid("b"), x: item.x, y: item.y };
    }
    case "text": {
      const body = simpler(bodyFrom(item.blocks));
      const pad = item.pad ?? { top: 3.6, right: 7.2, bottom: 3.6, left: 7.2 };
      const bare = !item.fill && !item.stroke && (!item.shape || item.shape === "rect");
      const inner = Math.max(8, item.w - pad.left - pad.right);
      if (bare && !item.angle) {
        // Only words: a text box, standing where they stand.
        const laid: Laid = { ...body, wrap: !item.noWrap, w: inner };
        const size = measureBox(laid);
        const free = item.h - pad.top - pad.bottom - size.h;
        const down = item.valign === "middle" ? free / 2 : item.valign === "bottom" ? free : 0;
        const slack = item.noWrap ? inner - size.w : 0;
        const across = body.align === "center" ? slack / 2 : body.align === "right" ? slack : 0;
        return {
          id: uid("t"),
          type: "text",
          x: item.x + pad.left + across,
          y: item.y + pad.top + down,
          w: item.noWrap ? size.w : inner,
          h: size.h,
          angle: 0,
          opacity: item.opacity ?? 1,
          ...body,
          wrap: !item.noWrap,
        };
      }
      const words = plainText(body.runs) !== "";
      return {
        id: uid("g"),
        type: "shape",
        kind: item.shape && shapeDef(item.shape) ? item.shape : "rect",
        ...corner(item),
        w: item.w,
        h: item.h,
        opacity: item.opacity ?? 1,
        stroke: item.stroke ? colorOf(item.stroke.color, "#000000") : null,
        fill: item.fill ? colorOf(item.fill, "#ffffff") : null,
        width: item.stroke?.width ?? 0,
        dash: (item.stroke?.dash ?? "solid") as Dash,
        adj: item.adj,
        flipX: item.flipX || undefined,
        flipY: item.flipY || undefined,
        text: words ? { ...body, valign: item.valign ?? "top", pad: Math.max(0, (pad.left + pad.top) / 2) } : undefined,
      };
    }
  }
}

export async function layDocument(doc: AnyDoc, options: Options): Promise<LaidOut> {
  await loadAll(doc);
  return doc.kind === "flow" ? layFlow(doc, options) : layFixed(doc, options);
}
