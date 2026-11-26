import "./regenerator";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFObjectCopier,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  PDFString,
  PDFTextField,
  degrees,
  rgb,
  type PDFContext,
  type PDFFont,
  type PDFImage,
  type PDFObject,
} from "pdf-lib";
import {
  allParas,
  dashArray,
  drawnSize,
  isCover,
  mixes,
  plainText,
  type Asset,
  type DocState,
  type EditObject,
  type FieldObject,
  type ImageObject,
  type LinkObject,
  type NoteObject,
  type Page,
  type ShapeObject,
  type Source,
  type Style,
  type TextBody,
} from "../model";
import { cutPage, freshName, pageResources, readPage, resourceDict, setContents, type PageTree } from "./content";
import { cutsOf, hasCuts } from "./cuts";
import { decorOf, decorStyles } from "./decor";
import type { PageText } from "./extract";
import { evenGlyphs } from "./font-file";
import { faceCss, fallbackFace, libraryBytes, libraryFace, loadFaces, pdfFont, userFont, type Face } from "./fonts";
import {
  bounds,
  corners,
  invert,
  mat,
  mul,
  num,
  objectCorners,
  placement,
  apply,
  type Box,
  type Matrix,
  type Point,
} from "./matrix";
import { writeBookmarks } from "./outline";
import { renderClear } from "./render";
import { wordsBox } from "./shape-text";
import { inkParts, markParts, pathParts, roundPath, shapeParts, toPdf, type Painted } from "./shapes";
import { shrinkPdf, type ShrinkLevel } from "./shrink";
import { layTable, tableLines } from "./table";
import {
  bodyStyles,
  bodyText,
  layText,
  linesOf,
  loadBody,
  measureBox,
  reachOf,
  textWidth,
  type Laid,
  type Piece,
} from "./text-dom";

export class EditError extends Error {}

export type ExportInput = {
  /** What to write: perhaps only some of the pages. */
  doc: DocState;
  /** Every page there is, for page numbers. */
  all: readonly Page[];
  /** The file's name, for headers that show it. */
  name: string;
  sources: ReadonlyMap<string, Source>;
  assets: ReadonlyMap<string, Asset>;
  /** The file this started from. */
  primary: string | null;
  textOf: (source: string, index: number) => Promise<PageText>;
  /** Forms and their answers become part of the page. */
  flatten?: boolean;
  shrink?: ShrinkLevel;
  onProgress?: (done: number, total: number) => void;
};

type FkGlyph = { advanceWidth: number };
type FkFont = {
  unitsPerEm: number;
  hasGlyphForCodePoint: (point: number) => boolean;
  layout: (
    text: string,
    features?: object,
  ) => {
    glyphs: FkGlyph[];
    positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[];
  };
};

const FEATURES = { liga: false, clig: false, dlig: false };
const SOFT = "\u2028";
/** Arrows, bullets, ticks and the like: the text fonts have few of them. */
const SYMBOL_TEXT = /[\u2030-\u2bff]/;

// ---------------------------------------------------------------- fonts

class FontBook {
  private faces = new Map<string, { font: PDFFont; fk: FkFont }>();
  private pdf = new Map<string, { ref: PDFObject; codes: Map<number, number>; composite: boolean } | null>();

  constructor(
    private doc: PDFDocument,
    private loadDoc: (source: string) => Promise<PDFDocument>,
  ) {}

  private async embed(key: string, bytes: () => Promise<ArrayBuffer>) {
    const found = this.faces.get(key);
    if (found) return found;
    const font = await this.doc.embedFont(evenGlyphs(await bytes()), { subset: true, features: FEATURES });
    const fk = (font as unknown as { embedder: { font: FkFont } }).embedder.font;
    const made = { font, fk };
    this.faces.set(key, made);
    return made;
  }

  /** Everything a style may need, ready before drawing starts. */
  async prepare(style: Style) {
    const faces: Face[] = [
      fallbackFace(style),
      { kind: "lib", id: "lib:arimo", bold: style.bold, italic: style.italic },
    ];
    if (style.font.startsWith("user:")) await this.user(style.font);
    else if (style.font.startsWith("pdf:")) await this.original(style.font);
    else faces.unshift({ kind: "lib", id: style.font, bold: style.bold, italic: style.italic });
    for (const face of faces) if (face.kind === "lib") await this.library(face);
  }

  async library(face: { id: string; bold: boolean; italic: boolean }) {
    const pick = libraryFace(face.id, face.bold, face.italic);
    return this.embed(`lib:${pick.file}`, () => libraryBytes(pick.file));
  }

  async user(id: string) {
    const font = userFont(id);
    if (!font) return null;
    try {
      return await this.embed(id, async () => font.bytes);
    } catch {
      return null;
    }
  }

  /** The font as it is in the PDF, when its codes are plain enough to write. */
  async original(id: string) {
    if (this.pdf.has(id)) return this.pdf.get(id) ?? null;
    this.pdf.set(id, null);
    const font = pdfFont(id);
    if (!font?.codes) return null;
    try {
      const source = await this.loadDoc(font.sourceId);
      const show = readPage(source.getPage(font.page)).shows[font.op];
      if (!show?.font) return null;
      const dict = show.font instanceof PDFRef ? source.context.lookup(show.font) : show.font;
      if (!(dict instanceof PDFDict)) return null;
      const composite = dict.lookup(PDFName.of("Subtype")) === PDFName.of("Type0");
      if (composite) {
        const encoding = dict.lookup(PDFName.of("Encoding"));
        if (!(encoding instanceof PDFName) || !encoding.asString().startsWith("/Identity")) return null;
      }
      const ref =
        source === this.doc
          ? show.font
          : PDFObjectCopier.for(source.context, this.doc.context).copy(show.font as PDFDict);
      const made = { ref, codes: font.codes, composite };
      this.pdf.set(id, made);
      return made;
    } catch {
      return null;
    }
  }

  get(key: string) {
    return this.faces.get(key) ?? null;
  }
  getPdf(id: string) {
    return this.pdf.get(id) ?? null;
  }
}

type Drawn =
  | { kind: "font"; key: string; fakeBold: boolean; fakeItalic: boolean }
  | { kind: "pdf"; id: string; fakeItalic: boolean }
  | { kind: "raster" };

// ---------------------------------------------------------------- one page

class PagePainter {
  out: string[] = [];
  private fonts = new Map<PDFObject, string>();
  private images = new Map<PDFObject, string>();
  private states = new Map<string, string>();
  readonly resources: PDFDict;

  constructor(
    readonly page: PDFPage,
    readonly view: Matrix,
  ) {
    this.resources = pageResources(page);
  }

  private name(kind: string, prefix: string, ref: PDFObject, store: Map<PDFObject, string>) {
    const found = store.get(ref);
    if (found) return found;
    const dict = resourceDict(this.page.doc.context, this.resources, kind);
    const name = freshName(dict, prefix);
    dict.set(name, ref);
    const text = name.asString();
    store.set(ref, text);
    return text;
  }

  font(ref: PDFObject) {
    return this.name("Font", "FbF", ref, this.fonts);
  }
  image(ref: PDFObject) {
    return this.name("XObject", "FbI", ref, this.images);
  }
  /**
   * Several drawings that are seen through as one: without this, what lies over
   * something else inside them would show twice.
   */
  group(ops: string, box: Box): string {
    const { context } = this.page.doc;
    const key = PDFName.of("Resources");
    // Shared with the page, so it has to have a place of its own.
    let ref = this.page.node.get(key);
    if (!(ref instanceof PDFRef)) {
      ref = context.register(this.resources);
      this.page.node.set(key, ref);
    }
    const stream = context.flateStream(ops, {
      Type: "XObject",
      Subtype: "Form",
      BBox: [box.x, box.y, box.x + box.w, box.y + box.h],
      Group: { Type: "Group", S: "Transparency" },
    });
    stream.dict.set(key, ref);
    return `${this.image(context.register(stream))} Do`;
  }
  state(opacity: number, multiply = false): string {
    if (opacity >= 0.999 && !multiply) return "";
    const key = `${num(opacity)}${multiply ? "m" : ""}`;
    let name = this.states.get(key);
    if (!name) {
      const { context } = this.page.doc;
      const dict = resourceDict(context, this.resources, "ExtGState");
      const made = freshName(dict, "FbG");
      dict.set(
        made,
        context.obj({ Type: "ExtGState", ca: opacity, CA: opacity, ...(multiply ? { BM: "Multiply" } : {}) }),
      );
      name = made.asString();
      this.states.set(key, name);
    }
    return `${name} gs\n`;
  }
}

const channel = (hex: string, at: number) => num(parseInt(hex.slice(at, at + 2), 16) / 255);
const rgbOf = (hex: string) => {
  const full = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  return `${channel(full, 1)} ${channel(full, 3)} ${channel(full, 5)}`;
};

/** Text that no font here can draw, as a picture. */
async function rasterText(
  doc: PDFDocument,
  piece: Piece,
): Promise<{ image: PDFImage; w: number; h: number; up: number } | null> {
  const scale = 4;
  const size = drawnSize(piece.style);
  const pad = size * 0.3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((piece.width + pad * 2) * scale));
  canvas.height = Math.max(1, Math.ceil(size * 2 * scale));
  const c = canvas.getContext("2d");
  if (!c) return null;
  const css = faceCss(piece.face);
  c.scale(scale, scale);
  c.font = `${css.style} ${css.weight} ${size}px ${css.family}`;
  c.fillStyle = piece.style.color;
  c.fillText(piece.text, pad, size * 1.4);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const image = await doc.embedPng(await blob.arrayBuffer());
  return { image, w: canvas.width / scale, h: canvas.height / scale, up: size * 1.4 };
}

/** The words of one text as drawing instructions, from the corner of its box. */
type Ink = { ops: string[]; links: { url: string; box: Box }[] };

/** The parts of a piece that are not hidden, letter by letter. */
function uncovered(piece: Piece, hidden: (p: Point) => boolean): Piece[] {
  const whole = textWidth(piece.text, piece.style, piece.face) || 1;
  const scale = piece.width / whole;
  const out: Piece[] = [];
  let open: Piece | null = null;
  let text = "";
  let from = 0;
  for (const ch of piece.text) {
    const before = textWidth(text, piece.style, piece.face) * scale;
    text += ch;
    const after = textWidth(text, piece.style, piece.face) * scale;
    const gone = hidden({ x: piece.x + (before + after) / 2, y: piece.baseline - piece.style.size * 0.3 });
    if (gone) open = null;
    else if (open) {
      open.text += ch;
      open.width = piece.x + after - open.x;
    } else {
      open = { ...piece, text: ch, x: piece.x + before, width: after - before, at: piece.at + from };
      out.push(open);
    }
    from += ch.length;
  }
  return out;
}

async function inkOf(
  painter: PagePainter,
  laid: Laid,
  book: FontBook,
  hidden: ((p: Point) => boolean) | null,
): Promise<Ink> {
  const { doc } = painter.page;
  await loadBody(laid);
  const styles = bodyStyles(laid);
  for (const style of styles) await book.prepare(style);

  const choose = (ch: string, face: Face, style: Style): Drawn => {
    const point = ch.codePointAt(0) ?? 0;
    if (face.kind === "pdf") {
      const font = book.getPdf(face.id);
      if (font && (font.codes.has(point) || /\s/.test(ch)))
        return { kind: "pdf", id: face.id, fakeItalic: face.italic };
    }
    if (face.kind === "user") {
      const font = book.get(face.id);
      if (font?.fk.hasGlyphForCodePoint(point))
        return { kind: "font", key: face.id, fakeBold: face.bold, fakeItalic: face.italic };
    }
    const chain: { id: string; bold: boolean; italic: boolean }[] = [];
    if (face.kind === "lib") chain.push(face);
    const other = fallbackFace(style);
    if (other.kind === "lib")
      chain.push(
        other,
        { ...other, id: "lib:arimo" },
        { ...other, id: "lib:devanagari" },
        { ...other, id: "lib:symbols" },
      );
    for (const item of chain) {
      const pick = libraryFace(item.id, item.bold, item.italic);
      const font = book.get(`lib:${pick.file}`);
      if (font?.fk.hasGlyphForCodePoint(point)) {
        return { kind: "font", key: `lib:${pick.file}`, fakeBold: pick.fakeBold, fakeItalic: pick.fakeItalic };
      }
    }
    return { kind: "raster" };
  };

  const text = bodyText(laid);
  if (/[ऀ-ॿ꣠-ꣿ]/.test(text)) {
    for (const style of styles) await book.library({ id: "lib:devanagari", bold: style.bold, italic: style.italic });
  }
  if (SYMBOL_TEXT.test(text)) await book.library({ id: "lib:symbols", bold: false, italic: false });

  const drawn = new Map<Face, Drawn>();
  let pieces = layText(laid, (part, face, style) => {
    const out: { text: string; face: Face }[] = [];
    let last: Drawn | null = null;
    for (const ch of part) {
      const isMark = /\p{M}|[‌‍]/u.test(ch);
      const pick: Drawn = (isMark || /\s/.test(ch)) && last ? last : choose(ch, face, style);
      const same = last !== null && JSON.stringify(last) === JSON.stringify(pick);
      if (same) out[out.length - 1].text += ch;
      else {
        // Its own object, so the piece can be traced back to how it is drawn.
        const tag: Face = { ...face };
        drawn.set(tag, pick);
        out.push({ text: ch, face: tag });
      }
      last = pick;
    }
    return out;
  });
  if (hidden) pieces = pieces.flatMap((piece) => uncovered(piece, hidden));

  const fills: string[] = [];
  const lines: string[] = [];
  const marks: string[] = [];
  const links: Ink["links"] = [];

  if (laid.paras?.some((para) => para.fill)) {
    const all = linesOf(laid);
    const w = laid.wrap ? laid.w : measureBox(laid).w;
    allParas(laid).forEach((para, i) => {
      const own = all.filter((line) => line.para === i);
      if (!para.fill || own.length === 0) return;
      const top = own[0].top - (para.before ?? 0);
      const bottom = own[own.length - 1].bottom + (para.after ?? 0);
      fills.push(`${rgbOf(para.fill)} rg 0 ${num(top)} ${num(w)} ${num(bottom - top)} re f`);
    });
  }

  for (const piece of pieces) {
    const { style } = piece;
    const size = drawnSize(style);
    const how = drawn.get(piece.face) ?? choose(piece.text.trim()[0] ?? "a", piece.face, style);
    const trimmed = piece.text
      .replace(/[\n\t]/g, "")
      .split(SOFT)
      .join("");
    if (style.back) {
      const reach = reachOf(style, piece.face);
      fills.push(
        `${rgbOf(style.back)} rg ${num(piece.x)} ${num(piece.baseline - reach.up)} ${num(piece.width)} ${num(reach.up + reach.down)} re f`,
      );
    }
    if (style.underline || style.strike) {
      const thick = Math.max(0.5, size * 0.06);
      const ys = [];
      if (style.underline) ys.push(piece.baseline + size * 0.12);
      if (style.strike) ys.push(piece.baseline - size * 0.28);
      for (const y of ys)
        marks.push(`${rgbOf(style.color)} rg ${num(piece.x)} ${num(y)} ${num(piece.width)} ${num(thick)} re f`);
    }
    if (style.link && trimmed !== "") {
      const box = { x: piece.x, y: piece.baseline - size * 0.92, w: piece.width, h: size * 1.18 };
      const last = links[links.length - 1];
      if (
        last &&
        last.url === style.link &&
        Math.abs(last.box.y - box.y) < 1 &&
        Math.abs(last.box.x + last.box.w - box.x) < size
      )
        last.box.w = box.x + box.w - last.box.x;
      else links.push({ url: style.link, box });
    }
    if (trimmed.trim() === "") continue;
    if (how.kind === "raster") {
      const picture = await rasterText(doc, { ...piece, text: trimmed.trimEnd() });
      if (picture) {
        const name = painter.image(picture.image.ref);
        lines.push(
          `q ${num(picture.w)} 0 0 ${num(-picture.h)} ${num(piece.x - size * 0.3)} ${num(piece.baseline - picture.up + picture.h)} cm ${name} Do Q`,
        );
      }
      continue;
    }

    const lean = how.fakeItalic ? 0.21 : 0;
    const tm = `1 0 ${num(lean)} -1 ${num(piece.x)} ${num(piece.baseline)} Tm`;
    const colour = rgbOf(style.color);
    if (how.kind === "pdf") {
      const font = book.getPdf(how.id);
      if (!font) continue;
      let codes = "";
      for (const ch of trimmed) {
        const code = font.codes.get(ch.codePointAt(0) ?? 0);
        if (code !== undefined) codes += code.toString(16).padStart(font.composite ? 4 : 2, "0");
      }
      lines.push(
        `BT ${colour} rg ${painter.font(font.ref)} ${num(size)} Tf ${num(style.tracking)} Tc ${tm} <${codes}> Tj ET`,
      );
      continue;
    }

    const font = book.get(how.key);
    if (!font) continue;
    const { fk } = font;
    const encoded = font.font.encodeText(trimmed).asString();
    const run = fk.layout(trimmed, FEATURES);
    const unit = 1000 / fk.unitsPerEm;
    const array: string[] = [];
    let kept = "";
    let shift = 0;
    let rise = 0;
    const ops: string[] = [];
    const flush = () => {
      if (kept) array.push(`<${kept}>`);
      kept = "";
    };
    const emit = () => {
      flush();
      if (array.length > 0) ops.push(`[${array.join(" ")}] TJ`);
      array.length = 0;
    };
    const push = (amount: number) => {
      if (Math.abs(amount) < 0.5) return;
      flush();
      array.push(num(-amount));
    };
    run.glyphs.forEach((glyph, i) => {
      const at = run.positions[i];
      if (Math.abs(at.yOffset * unit - rise) > 0.5) {
        emit();
        rise = at.yOffset * unit;
        ops.push(`${num((rise / 1000) * size)} Ts`);
      }
      push(shift + at.xOffset * unit);
      kept += encoded.slice(i * 4, i * 4 + 4);
      shift = (at.xAdvance - glyph.advanceWidth - at.xOffset) * unit;
    });
    emit();
    const bold = how.fakeBold ? `2 Tr ${num(size * 0.032)} w ${colour} RG ` : "";
    lines.push(
      `BT ${colour} rg ${bold}${painter.font(font.font.ref)} ${num(size)} Tf ${num(style.tracking)} Tc ${tm} ${ops.join(" ")}${how.fakeBold ? " 0 Tr" : ""}${rise ? " 0 Ts" : ""} ET`,
    );
  }
  return { ops: [...fills, ...lines, ...marks], links };
}

// ---------------------------------------------------------------- shapes

/** Drawing instructions of painted paths. */
function partOps(parts: readonly Painted[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const stroke = part.stroke !== null && part.width > 0;
    if (!part.fill && !stroke) continue;
    const ops: string[] = [];
    if (part.fill) ops.push(`${rgbOf(part.fill)} rg`);
    if (stroke && part.stroke)
      ops.push(
        `${rgbOf(part.stroke)} RG ${num(part.width)} w [${part.dash.map((value) => num(value)).join(" ")}] 0 d ${part.cap} J ${part.join} j`,
      );
    ops.push(toPdf(part.path));
    const odd = part.evenOdd ? "*" : "";
    ops.push(part.fill && stroke ? `B${odd}` : part.fill ? `f${odd}` : "S");
    out.push(ops.join("\n"));
  }
  return out;
}

// ---------------------------------------------------------------- pictures

async function canvasOf(blob: Blob): Promise<HTMLCanvasElement | null> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

async function pngOf(canvas: HTMLCanvasElement): Promise<ArrayBuffer | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? blob.arrayBuffer() : null;
}

/** Light, contrast and colour, the way the browser shows them. */
function relight(canvas: HTMLCanvasElement, look: NonNullable<ImageObject["look"]>) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const { bright, contrast, color } = look;
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const lit = Math.min(255, i * bright);
    curve[i] = Math.max(0, Math.min(255, (lit - 127.5) * contrast + 127.5));
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = curve[data[i]];
    const g = curve[data[i + 1]];
    const b = curve[data[i + 2]];
    const grey = 0.213 * r + 0.715 * g + 0.072 * b;
    data[i] = grey + (r - grey) * color;
    data[i + 1] = grey + (g - grey) * color;
    data[i + 2] = grey + (b - grey) * color;
  }
  context.putImageData(image, 0, 0);
}

/** Paints over parts of a picture for good. The parts are in fractions of it, y down. */
function burn(canvas: HTMLCanvasElement, areas: readonly { points: Point[]; color: string }[]) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  for (const { points, color } of areas) {
    context.beginPath();
    points.forEach((p, i) => {
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = color;
    context.fill();
    // Not a pixel of the edge is left between the old and the new.
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
  }
}

/** A picture of the file itself, as pixels. */
async function pixelsOf(source: PDFDocument, xobject: PDFObject): Promise<HTMLCanvasElement | null> {
  const dict = xobject instanceof PDFRef ? source.context.lookup(xobject) : xobject;
  const own = dict instanceof PDFStream ? dict.dict : null;
  const size = (key: string) =>
    Number((own?.lookup(PDFName.of(key)) as { asNumber?: () => number } | undefined)?.asNumber?.() ?? 0);
  const form = own?.lookup(PDFName.of("Subtype")) === PDFName.of("Form");
  const w = Math.max(16, Math.min(4000, form ? 1600 : size("Width") || 800));
  const h = Math.max(16, Math.min(4000, form ? 1600 : size("Height") || 800));
  const bytes = await pictureDocument(source, xobject, w, h);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await renderClear(page, canvas, viewport).promise;
    return canvas;
  } finally {
    void pdf.destroy();
  }
}

/** Where a word could not be taken out, its place is painted over instead. */
export function coverOps(page: Page, text: PageText, failed: ReadonlySet<number>): string {
  if (failed.size === 0) return "";
  const out: string[] = [];
  for (const block of text.blocks) {
    const ranges = page.cuts[block.key];
    if (!ranges || !ranges.some(([op]) => failed.has(op))) continue;
    out.push(
      `q ${mat(placement(block.x, block.y, block.angle))} cm ${rgbOf(page.covers[block.key] ?? "#ffffff")} rg ${num(-1)} 0 ${num(block.w + 2)} ${num(block.h)} re f Q`,
    );
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- the whole file

/** Drops everything nothing points at, so what was deleted is really gone. */
function sweep(doc: PDFDocument) {
  const { context } = doc;
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  const { Root, Info, Encrypt, ID } = context.trailerInfo;
  for (const object of [Root, Info, Encrypt, ID]) if (object) stack.push(object);
  while (stack.length > 0) {
    const object = stack.pop() as PDFObject;
    if (object instanceof PDFRef) {
      if (seen.has(object.tag)) continue;
      seen.add(object.tag);
      const value = context.lookup(object);
      if (value) stack.push(value);
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) stack.push(value);
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i += 1) stack.push(object.get(i));
    } else if (object instanceof PDFStream) {
      stack.push(object.dict);
    }
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!seen.has(ref.tag)) context.delete(ref);
}

const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"];

function settle(page: PDFPage) {
  for (const key of INHERITED) {
    const name = PDFName.of(key);
    if (page.node.has(name)) continue;
    const value = page.node.getInheritableAttribute(name);
    if (value) page.node.set(name, value);
  }
}

async function loadPdf(source: Source): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(source.bytes, { updateMetadata: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new EditError(
      /encrypt/i.test(message)
        ? `${source.name} is protected, so its pages cannot be saved. Remove the protection and open it again.`
        : `${source.name} is damaged in a way that stops it from being saved.`,
    );
  }
}

const pdfRect = (view: Matrix, object: { x: number; y: number; w: number; h: number; angle: number }) => {
  const back = invert(view);
  const box = bounds(objectCorners(object).map((p) => apply(back, p.x, p.y)));
  return [box.x, box.y, box.x + box.w, box.y + box.h];
};

function addAnnotation(page: PDFPage, annotation: PDFDict) {
  const { context } = page.doc;
  const ref = context.register(annotation);
  const key = PDFName.of("Annots");
  const found = page.node.lookup(key);
  if (found instanceof PDFArray) found.push(ref);
  else page.node.set(key, context.obj([ref]));
}

function linkAnnotation(page: PDFPage, view: Matrix, link: LinkObject, target: PDFPage | null): PDFDict | null {
  const { context } = page.doc;
  const base = { Type: "Annot", Subtype: "Link", Rect: pdfRect(view, link), Border: [0, 0, 0], F: 4 };
  if (link.page) {
    if (!target) return null;
    const dict = context.obj(base) as PDFDict;
    dict.set(PDFName.of("Dest"), context.obj([target.ref, "Fit"]));
    return dict;
  }
  const url = link.url.trim();
  if (!url) return null;
  const dict = context.obj(base) as PDFDict;
  dict.set(PDFName.of("A"), context.obj({ S: "URI", URI: PDFString.of(normalUrl(url)) }));
  return dict;
}

export function normalUrl(url: string): string {
  const text = url.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `mailto:${text}`;
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return `tel:${text.replace(/[^\d+]/g, "")}`;
  return `https://${text}`;
}

function cutLinks(page: PDFPage, places: readonly number[]) {
  if (places.length === 0) return;
  const key = PDFName.of("Annots");
  const list = page.node.lookup(key);
  if (!(list instanceof PDFArray)) return;
  const drop = new Set(places);
  const kept = page.doc.context.obj([]) as PDFArray;
  for (let i = 0; i < list.size(); i += 1) if (!drop.has(i)) kept.push(list.get(i));
  page.node.set(key, kept);
}

/** The words every object holds. */
function bodiesOf(object: EditObject): TextBody[] {
  if (object.type === "text") return [object];
  if (object.type === "shape") return object.text ? [object.text] : [];
  if (object.type === "table") return object.cells.flatMap((row) => row.filter((cell) => !cell.covered));
  return [];
}

/** The whole PDF, as edited. */
export async function exportPdf(input: ExportInput): Promise<Uint8Array> {
  const { doc, sources, assets } = input;
  if (doc.pages.length === 0) throw new EditError("There are no pages left to save.");

  const loaded = new Map<string, Promise<PDFDocument>>();
  const loadDoc = (id: string) => {
    let job = loaded.get(id);
    if (!job) {
      const source = sources.get(id);
      if (!source) throw new EditError("A file this document uses is missing.");
      loaded.set(id, (job = loadPdf(source)));
    }
    return job;
  };

  const used = new Set(doc.pages.map((page) => page.source).filter((id): id is string => id !== null));
  const primary = input.primary && used.has(input.primary) ? input.primary : null;
  const base = primary ? await loadDoc(primary) : await PDFDocument.create();
  base.registerFontkit(fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);
  const book = new FontBook(base, loadDoc);

  // Form answers, while every field is still where its file put it.
  const answers = new Map<string, [string, string | boolean][]>();
  for (const [key, value] of Object.entries(doc.values)) {
    const at = key.indexOf(":");
    const id = key.slice(0, at);
    const list = answers.get(id) ?? [];
    list.push([key.slice(at + 1), value]);
    answers.set(id, list);
  }
  for (const id of used) {
    const list = answers.get(id) ?? [];
    const pdf = await loadDoc(id);
    if (list.length > 0) await fillForm(pdf, list);
    // Fields of a file that is added to another one would lose their form.
    if ((id !== primary || input.flatten) && pdf.catalog.getAcroForm()) {
      try {
        pdf.getForm().flatten();
      } catch {
        // Left as they look.
      }
    }
  }

  // Fonts of the originals are read before any page changes.
  const wanted = new Set(doc.pages.flatMap((page) => page.objects));
  const drawn = Object.values(doc.objects).filter((object) => wanted.has(object.id));
  for (const object of drawn)
    for (const body of bodiesOf(object)) for (const style of bodyStyles(body)) await book.prepare(style);
  for (const style of decorStyles(doc.decor)) await book.prepare(style);
  await loadFaces(decorStyles(doc.decor));
  const pictures = new Map<string, PDFObject>();
  for (const object of drawn) {
    if (object.type !== "image" || pictures.has(object.asset)) continue;
    const origin = assets.get(object.asset)?.origin;
    if (!origin) continue;
    const pdf = await loadDoc(origin.source);
    const picture = readPage(pdf.getPage(origin.page)).pictures[origin.picture];
    if (!picture?.xobject) continue;
    pictures.set(
      object.asset,
      pdf === base ? picture.xobject : PDFObjectCopier.for(pdf.context, base.context).copy(picture.xobject as PDFDict),
    );
  }

  // Every page as an object of the output, untouched for now.
  const taken = new Set<number>();
  const made: PDFPage[] = [];
  for (const page of doc.pages) {
    if (page.source === null) {
      const blank = PDFPage.create(base);
      blank.setSize(page.w, page.h);
      made.push(blank);
    } else if (page.source === primary && !taken.has(page.index)) {
      taken.add(page.index);
      made.push(base.getPage(page.index));
    } else {
      const from = await loadDoc(page.source);
      const [copy] = await base.copyPages(from, [page.index]);
      made.push(copy);
    }
  }

  const originals = base.getPages();
  const reordered = originals.length !== made.length || made.some((page, i) => originals[i]?.ref !== page.ref);
  if (reordered) {
    made.forEach(settle);
    const gone = originals.filter((page) => !made.some((item) => item.ref === page.ref));
    for (let i = base.getPageCount() - 1; i >= 0; i -= 1) base.removePage(i);
    for (const page of made) base.addPage(page);
    // Bookmarks may still point at a deleted page: leave nothing on it.
    for (const page of gone) for (const key of ["Contents", "Resources", "Annots"]) page.node.delete(PDFName.of(key));
  }

  const images = new Map<string, PDFObject>(pictures);
  const pageById = new Map(doc.pages.map((page, i) => [page.id, made[i]]));
  const places = new Map(input.all.map((page, i) => [page.id, i]));
  const total = doc.pages.length + (input.shrink ? Math.ceil(doc.pages.length / 2) : 0);
  for (let i = 0; i < doc.pages.length; i += 1) {
    await paintPage(doc.pages[i], made[i]);
    input.onProgress?.(i + 1, total);
    if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  await addFields();

  if (doc.outline) {
    writeBookmarks(
      base,
      doc.outline.flatMap((mark) => {
        const page = pageById.get(mark.page);
        return page ? [{ title: mark.title, page, y: mark.y, level: mark.level }] : [];
      }),
    );
  }
  if (doc.meta) {
    base.setTitle(doc.meta.title);
    base.setAuthor(doc.meta.author);
    base.setSubject(doc.meta.subject);
    base.setKeywords(
      doc.meta.keywords
        .split(/[,;]/)
        .map((word) => word.trim())
        .filter(Boolean),
    );
  }

  async function paintPage(page: Page, target: PDFPage) {
    const all = page.objects.map((id) => doc.objects[id]).filter((object): object is EditObject => Boolean(object));
    // Highlights mix with what is under them, so they go on last.
    const objects = [...all.filter((object) => !mixes(object)), ...all.filter(mixes)];
    const painter = new PagePainter(target, page.view);
    const covers = all.filter(isCover);
    const links: LinkObject[] = [];
    let tree: PageTree | null = null;
    let own: Uint8Array | null = null;
    if (page.source !== null) {
      const text = await input.textOf(page.source, page.index);
      const cuts = cutsOf(page, doc.objects, text);
      const black = covers.filter((cover) => cover.kind === "redact");
      if (hasCuts(cuts) || black.length > 0) {
        tree = readPage(target);
        if (black.length > 0) cuts.swaps = await burned(page, tree, black, cuts.pictures);
        const cut = cutPage(target, tree, text, cuts);
        own = cut.bytes;
        const cover = coverOps(page, text, cut.failed);
        if (cover) painter.out.push(cover);
      }
      if (black.length > 0) hideAnnotations(target, page.view, black);
    }
    cutLinks(target, page.linkCuts);

    for (let i = 0; i < objects.length; i += 1) {
      const object = objects[i];
      // What lies over it and takes it away.
      const above = isCover(object) ? [] : all.slice(all.indexOf(object) + 1).filter(isCover);
      if (above.some((cover) => hides(cover, object))) continue;
      await paintObject(painter, page, object, above, links);
    }
    await paintDecor(painter, page);

    for (const link of links) {
      const annotation = linkAnnotation(target, page.view, link, link.page ? (pageById.get(link.page) ?? null) : null);
      if (annotation) addAnnotation(target, annotation);
    }
    if (!input.flatten)
      for (const object of objects)
        if (object.type === "note") addAnnotation(target, noteAnnotation(target, page.view, object));

    const under = page.paper && page.paper !== "#ffffff" ? paperOps(page) : "";
    if (painter.out.length > 0 || own || under) {
      tree ??= readPage(target);
      const ours = painter.out.length > 0 ? `q ${mat(invert(page.view))} cm\n${painter.out.join("\n")}\nQ\n` : "";
      setContents(target, own ?? tree.root.bytes, tree.root, ours, true, under);
    }
    if (page.box) {
      const [x0, y0, x1, y1] = pdfRect(page.view, { ...page.box, angle: 0 });
      const rect = base.context.obj([x0, y0, x1, y1]);
      for (const key of ["MediaBox", "CropBox"]) target.node.set(PDFName.of(key), rect);
      for (const key of ["TrimBox", "BleedBox", "ArtBox"]) target.node.delete(PDFName.of(key));
    }
    if (page.rotate !== 0) {
      const angle = (((target.getRotation().angle + page.rotate) % 360) + 360) % 360;
      target.setRotation(degrees(angle));
    }
  }

  function paperOps(page: Page): string {
    const box = page.box ?? { x: 0, y: 0, w: page.w, h: page.h };
    return `q ${mat(invert(page.view))} cm ${rgbOf(page.paper ?? "#ffffff")} rg ${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)} re f Q\n`;
  }

  async function paintObject(
    painter: PagePainter,
    page: Page,
    object: EditObject,
    above: ShapeObject[],
    links: LinkObject[],
  ) {
    const place = placement(object.x, object.y, object.angle);
    const state = painter.state(object.opacity, mixes(object));
    const wrap = (ops: readonly string[]) => {
      if (ops.length === 0) return;
      const layered = object.opacity < 0.999 && !mixes(object) && object.type !== "image" && object.type !== "ink";
      const pad = Math.max(object.w, object.h) + 60;
      const inner = layered
        ? painter.group(ops.join("\n"), { x: -pad, y: -pad, w: object.w + pad * 2, h: object.h + pad * 2 })
        : ops.join("\n");
      painter.out.push(`q ${mat(place)} cm\n${state}${inner}\nQ`);
    };
    /** Is a point of this object under something that takes the words away? */
    const hiddenAt = (dx: number, dy: number) => {
      if (above.length === 0) return null;
      const backs = above.map((cover) => ({ cover, back: invert(placement(cover.x, cover.y, cover.angle)) }));
      return (p: Point) => {
        const at = apply(place, p.x + dx, p.y + dy);
        return backs.some(({ cover, back }) => {
          const q = apply(back, at.x, at.y);
          return q.x >= 0 && q.x <= cover.w && q.y >= 0 && q.y <= cover.h;
        });
      };
    };
    /** The words of a text, put at a place inside the object. */
    const words = async (laid: Laid, dx: number, dy: number): Promise<string[]> => {
      if (plainText(laid.runs) === "" && !laid.paras) return [];
      const ink = await inkOf(painter, laid, book, hiddenAt(dx, dy));
      for (const { url, box } of ink.links) {
        const at = apply(place, box.x + dx, box.y + dy);
        links.push({
          id: "",
          type: "link",
          x: at.x,
          y: at.y,
          w: box.w,
          h: box.h,
          angle: object.angle,
          opacity: 1,
          ...linkTarget(url),
        });
      }
      if (ink.ops.length === 0) return [];
      return dx === 0 && dy === 0 ? ink.ops : [`q 1 0 0 1 ${num(dx)} ${num(dy)} cm`, ...ink.ops, "Q"];
    };

    switch (object.type) {
      case "text": {
        const ops: string[] = [];
        if (object.fill) {
          const pad = object.pad ?? 0;
          await loadBody(object);
          const size = measureBox(object);
          ops.push(
            `${rgbOf(object.fill)} rg ${num(-pad)} ${num(-pad)} ${num((object.wrap ? object.w : size.w) + pad * 2)} ${num(size.h + pad * 2)} re f`,
          );
        }
        ops.push(...(await words(object, 0, 0)));
        wrap(ops);
        break;
      }
      case "image":
        wrap(await imageOps(painter, object, above, place));
        break;
      case "shape": {
        const ops = partOps(shapeParts(object));
        if (object.text) {
          await loadBody(object.text);
          const box = wordsBox(object, object.text);
          ops.push(...(await words({ ...object.text, wrap: true, w: box.w }, box.x, box.y)));
        }
        wrap(ops);
        break;
      }
      case "path":
        wrap(partOps(pathParts(object)));
        break;
      case "ink":
        wrap(partOps(inkParts(object)));
        break;
      case "mark":
        wrap(partOps(markParts(object)));
        break;
      case "table": {
        for (const body of bodiesOf(object)) await loadBody(body);
        const lay = layTable(object);
        const ops: string[] = [];
        for (const { cell, box } of lay.cells)
          if (cell.fill)
            ops.push(`${rgbOf(cell.fill)} rg ${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)} re f`);
        for (const { cell, inner } of lay.cells)
          ops.push(...(await words({ ...cell, wrap: true, w: inner.w }, inner.x, inner.y)));
        for (const line of tableLines(object, lay)) {
          const { edge } = line;
          const dash = dashArray(edge.dash, edge.width)
            .map((value) => num(value))
            .join(" ");
          ops.push(
            `${rgbOf(edge.color)} RG ${num(edge.width)} w [${dash}] 0 d ${edge.dash === "solid" ? 2 : 0} J ${num(line.x0)} ${num(line.y0)} m ${num(line.x1)} ${num(line.y1)} l S`,
          );
        }
        wrap(ops);
        break;
      }
      case "link":
        links.push(object);
        break;
      default:
        break;
    }
    void page;
  }

  async function imageOps(
    painter: PagePainter,
    object: ImageObject,
    above: ShapeObject[],
    place: Matrix,
  ): Promise<string[]> {
    const black = above.filter((cover) => cover.kind === "redact");
    const changed = object.look !== undefined || black.length > 0;
    let ref = changed ? undefined : images.get(object.asset);
    if (!ref) {
      const asset = assets.get(object.asset);
      if (!asset) return [];
      if (changed) {
        const canvas = await canvasOf(new Blob([asset.bytes as BlobPart], { type: asset.mime }));
        if (!canvas) return [];
        if (object.look) relight(canvas, object.look);
        if (black.length > 0) {
          // From the page into the picture's own fractions.
          const crop = object.crop ?? { x: 0, y: 0, w: 1, h: 1 };
          const back = invert(place);
          burn(
            canvas,
            black.map((cover) => ({
              color: cover.fill ?? "#000000",
              points: corners(placement(cover.x, cover.y, cover.angle), { x: 0, y: 0, w: cover.w, h: cover.h }).map(
                (p) => {
                  const q = apply(back, p.x, p.y);
                  const u = object.flipX ? 1 - q.x / object.w : q.x / object.w;
                  const v = object.flipY ? 1 - q.y / object.h : q.y / object.h;
                  return { x: crop.x + u * crop.w, y: crop.y + v * crop.h };
                },
              ),
            })),
          );
        }
        const bytes = await pngOf(canvas);
        if (!bytes) return [];
        ref = (await base.embedPng(bytes)).ref;
      } else {
        const image = asset.mime === "image/png" ? await base.embedPng(asset.bytes) : await base.embedJpg(asset.bytes);
        ref = image.ref;
        images.set(object.asset, ref);
      }
    }
    const crop = object.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const w = object.w / crop.w;
    const h = object.h / crop.h;
    let inner: Matrix = [w, 0, 0, -h, -crop.x * w, (1 - crop.y) * h];
    if (object.flipX) inner = mul(inner, [-1, 0, 0, 1, object.w, 0]);
    if (object.flipY) inner = mul(inner, [1, 0, 0, -1, 0, object.h]);
    const clip = object.radius
      ? `${toPdf(roundPath(object.w, object.h, object.radius))} W n\n`
      : object.crop
        ? `0 0 ${num(object.w)} ${num(object.h)} re W n `
        : "";
    const ops = [`q ${clip}${mat(inner)} cm ${painter.image(ref)} Do Q`];
    if (object.stroke && object.width)
      ops.push(
        ...partOps([
          {
            path: roundPath(object.w, object.h, object.radius ?? 0),
            fill: null,
            stroke: object.stroke,
            width: object.width,
            dash: [],
            cap: 0,
            join: 0,
          },
        ]),
      );
    return ops;
  }

  async function paintDecor(painter: PagePainter, page: Page) {
    if (!doc.decor) return;
    const index = places.get(page.id) ?? 0;
    for (const item of decorOf(doc, page, { index, count: input.all.length, name: input.name }, assets)) {
      const head = `q ${mat(placement(item.x, item.y, item.angle))} cm\n${painter.state(item.opacity)}`;
      if (item.kind === "text") {
        const ink = await inkOf(painter, item.laid, book, null);
        if (ink.ops.length > 0) painter.out.push(`${head}${ink.ops.join("\n")}\nQ`);
        continue;
      }
      let ref = images.get(item.asset);
      if (!ref) {
        const asset = assets.get(item.asset);
        if (!asset) continue;
        ref = (asset.mime === "image/png" ? await base.embedPng(asset.bytes) : await base.embedJpg(asset.bytes)).ref;
        images.set(item.asset, ref);
      }
      painter.out.push(`${head}${num(item.w)} 0 0 ${num(-item.h)} 0 ${num(item.h)} cm ${painter.image(ref)} Do\nQ`);
    }
  }

  /** Pictures of the page with what lies under a black box painted over in them. */
  async function burned(
    page: Page,
    tree: PageTree,
    black: ShapeObject[],
    gone: ReadonlySet<number>,
  ): Promise<Map<number, PDFObject>> {
    const out = new Map<number, PDFObject>();
    for (let i = 0; i < tree.pictures.length; i += 1) {
      const picture = tree.pictures[i];
      if (gone.has(i) || (!picture.xobject && !picture.inline)) continue;
      const at = mul(picture.ctm, page.view);
      const back = invert(at);
      const areas = black
        .map((cover) => ({
          color: cover.fill ?? "#000000",
          points: corners(placement(cover.x, cover.y, cover.angle), { x: 0, y: 0, w: cover.w, h: cover.h }).map((p) => {
            const q = apply(back, p.x, p.y);
            return { x: q.x, y: 1 - q.y };
          }),
        }))
        .filter(({ points }) => {
          const box = bounds(points);
          return box.x < 1 && box.y < 1 && box.x + box.w > 0 && box.y + box.h > 0;
        });
      if (areas.length === 0) continue;
      const canvas = picture.xobject ? await pixelsOf(base, picture.xobject).catch(() => null) : null;
      const bytes = canvas ? (burn(canvas, areas), await pngOf(canvas)) : null;
      // A picture that cannot be read is taken out whole, rather than left readable.
      if (!bytes) (gone as Set<number>).add(i);
      else out.set(i, (await base.embedPng(bytes)).ref);
    }
    return out;
  }

  async function addFields() {
    const all: { page: Page; target: PDFPage; field: FieldObject }[] = [];
    doc.pages.forEach((page, i) => {
      for (const id of page.objects) {
        const object = doc.objects[id];
        if (object?.type === "field") all.push({ page, target: made[i], field: object });
      }
    });
    if (all.length === 0) return;
    const form = base.getForm();
    const names = new Set(form.getFields().map((field) => field.getName()));
    const font = (await book.library({ id: "lib:arimo", bold: false, italic: false })).font;
    const groups = new Map<string, { group: ReturnType<typeof form.createRadioGroup>; values: Set<string> }>();
    const fresh = (wanted: string) => {
      const clean = (wanted || "Field").replace(/\./g, " ").trim() || "Field";
      let name = clean;
      for (let i = 2; names.has(name); i += 1) name = `${clean} ${i}`;
      names.add(name);
      return name;
    };
    for (const { page, target, field } of all) {
      const [x0, y0, x1, y1] = pdfRect(page.view, field);
      const place = {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
        borderWidth: 1,
        borderColor: rgb(0.65, 0.64, 0.64),
        backgroundColor: rgb(1, 1, 1),
      };
      if (field.kind === "radio") {
        let found = groups.get(field.name);
        if (!found) {
          found = { group: form.createRadioGroup(fresh(field.name)), values: new Set() };
          groups.set(field.name, found);
        }
        const wantedValue = (field.value ?? "").trim() || `Option ${found.values.size + 1}`;
        let value = wantedValue;
        for (let i = 2; found.values.has(value); i += 1) value = `${wantedValue} ${i}`;
        found.values.add(value);
        found.group.addOptionToPage(value, target, place);
        if (field.required) found.group.enableRequired();
        continue;
      }
      const name = fresh(field.name);
      if (field.kind === "sign") {
        const { context } = base;
        const dict = context.obj({
          Type: "Annot",
          Subtype: "Widget",
          FT: "Sig",
          T: PDFHexString.fromText(name),
          Rect: [x0, y0, x1, y1],
          F: 4,
          P: target.ref,
          MK: { BC: [0.85, 0.26, 0.11], BG: [0.99, 0.93, 0.91] },
          BS: { W: 1, S: "S" },
        }) as PDFDict;
        const ref = context.register(dict);
        form.acroForm.addField(ref);
        const key = PDFName.of("Annots");
        const found = target.node.lookup(key);
        if (found instanceof PDFArray) found.push(ref);
        else target.node.set(key, context.obj([ref]));
        continue;
      }
      if (field.kind === "check") {
        const box = form.createCheckBox(name);
        box.addToPage(target, place);
        if (field.required) box.enableRequired();
      } else if (field.kind === "list") {
        const list = form.createDropdown(name);
        list.addOptions(field.options.length > 0 ? field.options : ["Option 1"]);
        list.addToPage(target, { ...place, font });
        if (field.required) list.enableRequired();
      } else {
        const text = form.createTextField(name);
        if (field.kind === "multiline") text.enableMultiline();
        text.addToPage(target, { ...place, font });
        text.setFontSize(Math.max(6, Math.min(14, field.kind === "multiline" ? 11 : field.h * 0.6)));
        if (field.required) text.enableRequired();
      }
    }
  }

  async function fillForm(pdf: PDFDocument, list: [string, string | boolean][]) {
    pdf.registerFontkit(fontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);
    const form = pdf.getForm();
    const font = await pdf.embedFont(await libraryBytes("arimo-regular"), { subset: true, features: FEATURES });
    for (const [name, value] of list) {
      try {
        const field = form.getFieldMaybe(name);
        if (field instanceof PDFTextField) {
          field.setText(String(value));
          field.updateAppearances(font);
        } else if (field instanceof PDFCheckBox) {
          if (value) field.check();
          else field.uncheck();
        } else if (field instanceof PDFRadioGroup) {
          if (typeof value === "string" && field.getOptions().includes(value)) field.select(value);
        } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
          if (value) field.select(String(value));
          field.updateAppearances(font);
        }
      } catch {
        // A field the library cannot write keeps its old answer.
      }
    }
  }

  await base.flush();
  sweep(base);
  if (input.shrink) {
    const pages = doc.pages.length;
    await shrinkPdf(base, input.shrink, (done, of) =>
      input.onProgress?.(pages + (done / Math.max(1, of)) * (total - pages), total),
    );
  }
  return base.save({ updateFieldAppearances: false });
}

/** Wholly under a cover: nothing of it is left to draw. */
function hides(cover: ShapeObject, object: EditObject): boolean {
  if (object.type === "note" || object.type === "field") return false;
  const back = invert(placement(cover.x, cover.y, cover.angle));
  return objectCorners(object).every((p) => {
    const q = apply(back, p.x, p.y);
    return q.x >= -0.01 && q.x <= cover.w + 0.01 && q.y >= -0.01 && q.y <= cover.h + 0.01;
  });
}

/** Links and answers under a black box go as well. */
function hideAnnotations(page: PDFPage, view: Matrix, black: readonly ShapeObject[]) {
  const key = PDFName.of("Annots");
  const list = page.node.lookup(key);
  if (!(list instanceof PDFArray)) return;
  const kept = page.doc.context.obj([]) as PDFArray;
  for (let i = 0; i < list.size(); i += 1) {
    const item = list.get(i);
    const dict = page.doc.context.lookup(item);
    const rect = dict instanceof PDFDict ? dict.lookup(PDFName.of("Rect")) : null;
    const values = rect instanceof PDFArray ? rect.asRectangle() : null;
    const middle = values ? apply(view, values.x + values.width / 2, values.y + values.height / 2) : null;
    const under =
      middle &&
      black.some((cover) => {
        const q = apply(invert(placement(cover.x, cover.y, cover.angle)), middle.x, middle.y);
        return q.x >= 0 && q.x <= cover.w && q.y >= 0 && q.y <= cover.h;
      });
    if (!under || !(dict instanceof PDFDict)) {
      kept.push(item);
      continue;
    }
    for (const name of ["V", "AP", "Contents", "A", "DV"]) dict.delete(PDFName.of(name));
    const parent = dict.lookup(PDFName.of("Parent"));
    if (parent instanceof PDFDict) for (const name of ["V", "DV"]) parent.delete(PDFName.of(name));
  }
  page.node.set(key, kept);
}

/** "#page:p1" leads to a page of this document. */
const linkTarget = (url: string): Pick<LinkObject, "url" | "page"> =>
  url.startsWith("#page:") ? { url: "", page: url.slice(6) } : { url };

function noteAnnotation(page: PDFPage, view: Matrix, note: NoteObject): PDFDict {
  const { context } = page.doc;
  const channel = (at: number) => parseInt(note.color.slice(at, at + 2), 16) / 255;
  const when = new Date(note.date);
  const two = (value: number) => String(value).padStart(2, "0");
  const stamp = Number.isNaN(when.getTime())
    ? undefined
    : `D:${when.getUTCFullYear()}${two(when.getUTCMonth() + 1)}${two(when.getUTCDate())}${two(when.getUTCHours())}${two(when.getUTCMinutes())}${two(when.getUTCSeconds())}Z`;
  const dict = context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: pdfRect(view, note),
    Contents: PDFHexString.fromText(note.text),
    T: PDFHexString.fromText(note.author || "Comment"),
    C: [channel(1), channel(3), channel(5)],
    Name: "Comment",
    F: 28,
  }) as PDFDict;
  if (stamp) dict.set(PDFName.of("M"), PDFString.of(stamp));
  return dict;
}

// ---------------------------------------------------------------- one page without its cut parts

/** A one-page PDF of what is left of the original, for the screen. */
export async function bareDocument(source: PDFDocument, index: number): Promise<{ doc: PDFDocument; page: PDFPage }> {
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(source, [index]);
  doc.addPage(page);
  return { doc, page };
}

/** One picture of a page on its own, upright, as a small PDF. */
export async function pictureDocument(
  source: PDFDocument,
  xobject: PDFObject,
  w: number,
  h: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([w, h]);
  const copy = PDFObjectCopier.for(source.context, doc.context).copy(xobject as PDFDict) as PDFObject;
  const context: PDFContext = doc.context;
  const resources = pageResources(page);
  const dict = resourceDict(context, resources, "XObject");
  const name = freshName(dict, "FbI");
  dict.set(name, copy);
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.stream(`${num(w)} 0 0 ${num(h)} 0 0 cm ${name.asString()} Do`)),
  );
  return doc.save({ useObjectStreams: false });
}
