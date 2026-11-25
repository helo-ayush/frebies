import "./regenerator";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
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
  mixes,
  type Asset,
  type DocState,
  type EditObject,
  type FieldObject,
  type LinkObject,
  type Page,
  type Source,
  type Style,
  type TextObject,
} from "../model";
import { cutPage, freshName, pageResources, readPage, resourceDict, setContents, type PageTree } from "./content";
import { cutsOf, hasCuts } from "./cuts";
import type { PageText } from "./extract";
import { faceCss, fallbackFace, libraryBytes, libraryFace, loadFaces, pdfFont, userFont, type Face } from "./fonts";
import { bounds, invert, mat, mul, num, objectCorners, placement, apply, type Matrix } from "./matrix";
import { inkPath, outlineFill, shapeOutlines, toPdf } from "./shapes";
import { layText, stylesOf, type Piece } from "./text-dom";

export class EditError extends Error {}

export type ExportInput = {
  doc: DocState;
  sources: ReadonlyMap<string, Source>;
  assets: ReadonlyMap<string, Asset>;
  /** The file this started from. */
  primary: string | null;
  textOf: (source: string, index: number) => Promise<PageText>;
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
    const font = await this.doc.embedFont(await bytes(), { subset: true, features: FEATURES });
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
  const { size } = piece.style;
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

async function drawText(painter: PagePainter, object: TextObject, book: FontBook) {
  const { doc } = painter.page;
  await loadFaces(stylesOf(object.runs), object.runs.map((run) => run.text).join(""));
  for (const style of stylesOf(object.runs)) await book.prepare(style);

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
    if (other.kind === "lib") chain.push(other, { ...other, id: "lib:arimo" }, { ...other, id: "lib:devanagari" });
    for (const item of chain) {
      const pick = libraryFace(item.id, item.bold, item.italic);
      const font = book.get(`lib:${pick.file}`);
      if (font?.fk.hasGlyphForCodePoint(point)) {
        return { kind: "font", key: `lib:${pick.file}`, fakeBold: pick.fakeBold, fakeItalic: pick.fakeItalic };
      }
    }
    return { kind: "raster" };
  };

  const text = object.runs.map((run) => run.text).join("");
  if (/[ऀ-ॿ꣠-ꣿ]/.test(text)) {
    for (const style of stylesOf(object.runs))
      await book.library({ id: "lib:devanagari", bold: style.bold, italic: style.italic });
  }

  const drawn = new Map<Face, Drawn>();
  const pieces = layText(object, (part, face, style) => {
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

  const lines: string[] = [];
  const marks: string[] = [];
  for (const piece of pieces) {
    const { style } = piece;
    const how = drawn.get(piece.face) ?? choose(piece.text.trim()[0] ?? "a", piece.face, style);
    const trimmed = piece.text.replace(/\n/g, "");
    if (style.underline || style.strike) {
      const thick = Math.max(0.5, style.size * 0.06);
      const ys = [];
      if (style.underline) ys.push(piece.baseline + style.size * 0.12);
      if (style.strike) ys.push(piece.baseline - style.size * 0.28);
      for (const y of ys)
        marks.push(`${rgbOf(style.color)} rg ${num(piece.x)} ${num(y)} ${num(piece.width)} ${num(thick)} re f`);
    }
    if (trimmed.trim() === "") continue;
    if (how.kind === "raster") {
      const picture = await rasterText(doc, { ...piece, text: trimmed.trimEnd() });
      if (picture) {
        const name = painter.image(picture.image.ref);
        lines.push(
          `q ${num(picture.w)} 0 0 ${num(-picture.h)} ${num(piece.x - style.size * 0.3)} ${num(piece.baseline - picture.up + picture.h)} cm ${name} Do Q`,
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
        `BT ${colour} rg ${painter.font(font.ref)} ${num(style.size)} Tf ${num(style.tracking)} Tc ${tm} <${codes}> Tj ET`,
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
        ops.push(`${num((rise / 1000) * style.size)} Ts`);
      }
      push(shift + at.xOffset * unit);
      kept += encoded.slice(i * 4, i * 4 + 4);
      shift = (at.xAdvance - glyph.advanceWidth - at.xOffset) * unit;
    });
    emit();
    const bold = how.fakeBold ? `2 Tr ${num(style.size * 0.032)} w ${colour} RG ` : "";
    lines.push(
      `BT ${colour} rg ${bold}${painter.font(font.font.ref)} ${num(style.size)} Tf ${num(style.tracking)} Tc ${tm} ${ops.join(" ")}${how.fakeBold ? " 0 Tr" : ""}${rise ? " 0 Ts" : ""} ET`,
    );
  }
  painter.out.push(
    `q ${mat(placement(object.x, object.y, object.angle))} cm\n${painter.state(object.opacity)}${lines.join("\n")}\n${marks.join("\n")}\nQ`,
  );
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
    if (id !== primary && pdf.catalog.getAcroForm()) {
      try {
        pdf.getForm().flatten();
      } catch {
        // Left as they look.
      }
    }
  }

  // Fonts of the originals are read before any page changes.
  for (const object of Object.values(doc.objects)) {
    if (object.type === "text") for (const style of stylesOf(object.runs)) await book.prepare(style);
  }
  const pictures = new Map<string, PDFObject>();
  for (const object of Object.values(doc.objects)) {
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
  for (let i = 0; i < doc.pages.length; i += 1) {
    await paintPage(doc.pages[i], made[i]);
    input.onProgress?.(i + 1, doc.pages.length);
    if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  await addFields();

  async function paintPage(page: Page, target: PDFPage) {
    const all = page.objects.map((id) => doc.objects[id]).filter((object): object is EditObject => Boolean(object));
    // Highlights mix with what is under them, so they go on last.
    const objects = [...all.filter((object) => !mixes(object)), ...all.filter(mixes)];
    const painter = new PagePainter(target, page.view);
    let tree: PageTree | null = null;
    let own: Uint8Array | null = null;
    if (page.source !== null) {
      const text = await input.textOf(page.source, page.index);
      const cuts = cutsOf(page, doc.objects, text);
      if (hasCuts(cuts)) {
        tree = readPage(target);
        const cut = cutPage(target, tree, text.shows, cuts);
        own = cut.bytes;
        const cover = coverOps(page, text, cut.failed);
        if (cover) painter.out.push(cover);
      }
    }
    cutLinks(target, page.linkCuts);

    for (const object of objects) {
      switch (object.type) {
        case "text":
          await drawText(painter, object, book);
          break;
        case "image": {
          let ref = images.get(object.asset);
          if (!ref) {
            const asset = assets.get(object.asset);
            if (!asset) break;
            const image =
              asset.mime === "image/png" ? await base.embedPng(asset.bytes) : await base.embedJpg(asset.bytes);
            ref = image.ref;
            images.set(object.asset, ref);
          }
          const crop = object.crop ?? { x: 0, y: 0, w: 1, h: 1 };
          const w = object.w / crop.w;
          const h = object.h / crop.h;
          let place: Matrix = [w, 0, 0, -h, -crop.x * w, (1 - crop.y) * h];
          if (object.flipX) place = mul(place, [-1, 0, 0, 1, object.w, 0]);
          if (object.flipY) place = mul(place, [1, 0, 0, -1, 0, object.h]);
          const clip = object.crop ? `0 0 ${num(object.w)} ${num(object.h)} re W n ` : "";
          painter.out.push(
            `q ${mat(placement(object.x, object.y, object.angle))} cm\n${painter.state(object.opacity)}${clip}${mat(place)} cm ${painter.image(ref)} Do Q`,
          );
          break;
        }
        case "shape": {
          const lines: string[] = [];
          for (const outline of shapeOutlines(object)) {
            const fill = outline.paint === "stroke" ? null : outlineFill(object);
            const stroke = outline.paint === "fill" ? null : object.stroke;
            if (!fill && !(stroke && object.width > 0)) continue;
            const ops: string[] = [];
            if (fill) ops.push(`${rgbOf(fill)} rg`);
            if (stroke && object.width > 0) {
              ops.push(`${rgbOf(stroke)} RG ${num(object.width)} w`);
              ops.push(object.dash ? `[${num(object.width * 3)} ${num(object.width * 2)}] 0 d` : "[] 0 d");
              if (object.kind === "check" || object.kind === "cross") ops.push("1 J 1 j");
            }
            ops.push(toPdf(outline.path));
            ops.push(fill && stroke && object.width > 0 ? "B" : fill ? "f" : "S");
            lines.push(ops.join("\n"));
          }
          painter.out.push(
            `q ${mat(placement(object.x, object.y, object.angle))} cm\n${painter.state(object.opacity)}${lines.join("\n")}\nQ`,
          );
          break;
        }
        case "ink":
          painter.out.push(
            `q ${mat(placement(object.x, object.y, object.angle))} cm\n${painter.state(object.opacity, object.marker)}${rgbOf(object.stroke)} RG ${num(object.width)} w 1 J 1 j\n${toPdf(inkPath(object))}\nS\nQ`,
          );
          break;
        case "mark": {
          const rects = object.rects.map(([x, y, w, h]) => {
            if (object.kind === "highlight") return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
            const thick = Math.max(0.6, h * 0.06);
            const top = object.kind === "underline" ? y + h * 0.93 : y + h * 0.54;
            return `${num(x)} ${num(top)} ${num(w)} ${num(thick)} re`;
          });
          painter.out.push(
            `q ${mat(placement(object.x, object.y, object.angle))} cm\n${painter.state(object.opacity, object.kind === "highlight")}${rgbOf(object.color)} rg\n${rects.join("\n")}\nf\nQ`,
          );
          break;
        }
        case "link": {
          const annotation = linkAnnotation(
            target,
            page.view,
            object,
            object.page ? (pageById.get(object.page) ?? null) : null,
          );
          if (annotation) addAnnotation(target, annotation);
          break;
        }
        default:
          break;
      }
    }

    if (painter.out.length > 0 || own) {
      tree ??= readPage(target);
      const ours = painter.out.length > 0 ? `q ${mat(invert(page.view))} cm\n${painter.out.join("\n")}\nQ\n` : "";
      setContents(target, own ?? tree.root.bytes, tree.root, ours, true);
    }
    if (page.rotate !== 0) {
      const angle = (((target.getRotation().angle + page.rotate) % 360) + 360) % 360;
      target.setRotation(degrees(angle));
    }
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
    for (const { page, target, field } of all) {
      let name = (field.name || "Field").replace(/\./g, " ").trim() || "Field";
      for (let i = 2; names.has(name); i += 1) name = `${field.name || "Field"} ${i}`;
      names.add(name);
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
      if (field.kind === "check") form.createCheckBox(name).addToPage(target, place);
      else if (field.kind === "list") {
        const list = form.createDropdown(name);
        list.addOptions(field.options.length > 0 ? field.options : ["Option 1"]);
        list.addToPage(target, { ...place, font });
      } else {
        const text = form.createTextField(name);
        if (field.kind === "multiline") text.enableMultiline();
        text.addToPage(target, { ...place, font });
        text.setFontSize(Math.max(6, Math.min(14, field.kind === "multiline" ? 11 : field.h * 0.6)));
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
  return base.save({ updateFieldAppearances: false });
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
