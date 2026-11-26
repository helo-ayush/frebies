import {
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFPageLeaf,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";
import { readPage, type PageTree } from "./content";
import { pacer, unpredict } from "./crypt";
import { bounds, corners, mul, type Matrix } from "./matrix";

/**
 * Makes a PDF smaller: pictures get no more pixels than their size on the page
 * needs, and what is there twice, uncompressed or of no use goes.
 */

export type ShrinkLevel = "light" | "medium" | "strong";

const LEVELS: Record<ShrinkLevel, { dpi: number; quality: number }> = {
  light: { dpi: 220, quality: 0.85 },
  medium: { dpi: 150, quality: 0.72 },
  strong: { dpi: 100, quality: 0.55 },
};

type Rest = () => Promise<void>;

const N = (name: string) => PDFName.of(name);
const IMAGE = N("Image");
const XOBJECT = N("XObject");
const scratch = PDFContext.create();

const numberAt = (dict: PDFDict, key: string): number | null => {
  const value = dict.lookup(N(key));
  return value instanceof PDFNumber ? value.asNumber() : null;
};
const nameAt = (dict: PDFDict, key: string): string | null => {
  const value = dict.lookup(N(key));
  return value instanceof PDFName ? value.asString().slice(1) : null;
};
const numbersAt = (dict: PDFDict, key: string): number[] | null => {
  const value = dict.lookup(N(key));
  if (!(value instanceof PDFArray)) return null;
  return value.asArray().map((_, i) => {
    const item = value.lookup(i);
    return item instanceof PDFNumber ? item.asNumber() : 0;
  });
};

// ---------------------------------------------------------------- filters

type Coding = { name: string; parms: PDFDict | null };

/** The filters of a stream, the outermost first. Null when they make no sense. */
function codings(dict: PDFDict): Coding[] | null {
  const filter = dict.lookup(N("Filter"));
  const parms = dict.lookup(N("DecodeParms"));
  if (filter === undefined) return [];
  if (filter instanceof PDFName)
    return [{ name: filter.asString().slice(1), parms: parms instanceof PDFDict ? parms : null }];
  if (!(filter instanceof PDFArray)) return null;
  const out: Coding[] = [];
  for (let i = 0; i < filter.size(); i += 1) {
    const name = filter.lookup(i);
    if (!(name instanceof PDFName)) return null;
    const own = parms instanceof PDFArray ? parms.lookup(i) : filter.size() === 1 ? parms : undefined;
    out.push({ name: name.asString().slice(1), parms: own instanceof PDFDict ? own : null });
  }
  return out;
}

const ASCII = new Set(["ASCII85Decode", "ASCIIHexDecode"]);
const PLAIN = new Set([...ASCII, "FlateDecode", "LZWDecode", "RunLengthDecode"]);

async function piped(data: Uint8Array, through: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(through)).arrayBuffer());
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return scratch.flateStream(data).contents;
  return piped(data, new CompressionStream("deflate"));
}

/** Takes one filter off, but leaves its prediction on. */
async function uncode(data: Uint8Array, { name, parms }: Coding): Promise<Uint8Array> {
  if (name === "FlateDecode" && typeof DecompressionStream !== "undefined") {
    try {
      return await piped(data, new DecompressionStream("deflate"));
    } catch {
      // The browser is strict about the last bytes, which are wrong in some files.
    }
  }
  const early = parms ? (numberAt(parms, "EarlyChange") ?? 1) : 1;
  const dict = scratch.obj({ Filter: name, DecodeParms: { EarlyChange: early } });
  return decodePDFRawStream(PDFRawStream.of(dict, data)).decode();
}

async function decode(data: Uint8Array, list: readonly Coding[]): Promise<Uint8Array> {
  let out = data;
  for (const coding of list) {
    out = await uncode(out, coding);
    const { name, parms } = coding;
    if (!parms || (name !== "FlateDecode" && name !== "LZWDecode")) continue;
    const n = (key: string, normal: number) => numberAt(parms, key) ?? normal;
    out = unpredict(out, n("Predictor", 1), n("Colors", 1), n("BitsPerComponent", 8), n("Columns", 1));
  }
  return out;
}

function setFilter(dict: PDFDict, list: readonly Coding[]) {
  const { context } = dict;
  dict.delete(N("Filter"));
  dict.delete(N("DecodeParms"));
  if (list.length === 0) return;
  dict.set(N("Filter"), list.length === 1 ? N(list[0].name) : context.obj(list.map(({ name }) => name)));
  if (!list.some(({ parms }) => parms)) return;
  dict.set(
    N("DecodeParms"),
    list.length === 1 && list[0].parms ? list[0].parms : context.obj(list.map((c) => c.parms)),
  );
}

// ---------------------------------------------------------------- where pictures are drawn

/** In inches, at the largest place. */
type Use = { w: number; h: number };

const INCH: Matrix = [1 / 72, 0, 0, 1 / 72, 0, 0];

class Uses {
  readonly known = new Map<PDFRef, Use>();
  /** Lists of pictures and forms whose drawing has been looked at. */
  private followed = new Set<PDFDict>();

  constructor(readonly doc: PDFDocument) {}

  private dict(object: PDFObject | undefined): PDFDict | undefined {
    const value = this.doc.context.lookup(object);
    return value instanceof PDFDict ? value : undefined;
  }

  /** Whether there is any picture to be found, without reading the drawing. */
  private holds(resources: PDFDict | undefined, seen: Set<PDFDict>): boolean {
    if (!resources || seen.has(resources)) return false;
    seen.add(resources);
    for (const kind of ["XObject", "Pattern"]) {
      for (const item of this.dict(resources.get(N(kind)))?.values() ?? []) {
        const object = this.doc.context.lookup(item);
        if (!(object instanceof PDFStream)) continue;
        if (object.dict.lookup(N("Subtype")) === IMAGE) return true;
        if (this.holds(this.dict(object.dict.get(N("Resources"))), seen)) return true;
      }
    }
    return false;
  }

  page(page: PDFPage) {
    const unit = numberAt(page.node, "UserUnit") ?? 1;
    const scale: Matrix = [INCH[0] * unit, 0, 0, INCH[3] * unit, 0, 0];
    if (this.holds(page.node.Resources(), new Set())) this.follow(readPage(page), scale, 0);

    const notes = page.node.lookup(N("Annots"));
    if (!(notes instanceof PDFArray)) return;
    for (let i = 0; i < notes.size(); i += 1) {
      const note = notes.lookup(i);
      if (!(note instanceof PDFDict)) continue;
      const looks = note.lookup(N("AP"));
      const place = numbersAt(note, "Rect");
      if (!(looks instanceof PDFDict) || place?.length !== 4) continue;
      for (const look of looks.values()) {
        const object = this.doc.context.lookup(look);
        const states = object instanceof PDFDict ? object.values() : [look];
        for (const state of states) this.look(this.doc.context.lookup(state), place, scale);
      }
    }
  }

  /** What an annotation looks like is stretched over its place. */
  private look(stream: PDFObject | undefined, place: number[], scale: Matrix) {
    if (!(stream instanceof PDFRawStream)) return;
    const box = numbersAt(stream.dict, "BBox");
    if (box?.length !== 4) return;
    const own = (numbersAt(stream.dict, "Matrix") ?? [1, 0, 0, 1, 0, 0]) as Matrix;
    const area = bounds(corners(own, { x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1] }));
    if (!area.w || !area.h) return;
    const stretch: Matrix = [
      Math.abs(place[2] - place[0]) / area.w,
      0,
      0,
      Math.abs(place[3] - place[1]) / area.h,
      0,
      0,
    ];
    this.inside(stream, mul(mul(own, stretch), scale), 1);
  }

  /** Reads the drawing of a form, as if it were a page. */
  private inside(stream: PDFRawStream, base: Matrix, depth: number) {
    const resources = this.dict(stream.dict.get(N("Resources")));
    if (!resources || !this.holds(resources, new Set())) return;
    const leaf = PDFPageLeaf.fromMapWithContext(new Map(), this.doc.context, false);
    leaf.set(N("Contents"), stream);
    leaf.set(N("Resources"), resources);
    this.follow(readPage(PDFPage.of(leaf, PDFRef.of(0), this.doc)), base, depth);
  }

  private follow(tree: PageTree, base: Matrix, depth: number) {
    for (const { xobject, ctm } of tree.pictures) {
      if (!(xobject instanceof PDFRef)) continue;
      const m = mul(ctm, base);
      const old = this.known.get(xobject);
      const w = Math.max(old?.w ?? 0, Math.hypot(m[0], m[1]));
      const h = Math.max(old?.h ?? 0, Math.hypot(m[2], m[3]));
      this.known.set(xobject, { w, h });
    }
    const nodes = [tree.root];
    for (const node of nodes) {
      nodes.push(...node.children);
      const list = this.dict(node.resources?.get(XOBJECT));
      if (list) this.followed.add(list);
    }
    // Pictures that fill shapes. Where a form fills a shape, its scale is not known here.
    if (depth > 2) return;
    for (const item of this.dict(tree.root.resources?.get(N("Pattern")))?.values() ?? []) {
      const pattern = this.doc.context.lookup(item);
      if (!(pattern instanceof PDFRawStream)) continue;
      const own = (numbersAt(pattern.dict, "Matrix") ?? [1, 0, 0, 1, 0, 0]) as Matrix;
      this.inside(pattern, mul(own, base), depth + 1);
    }
  }

  /** Pictures that are drawn where nobody has looked as well, so their size is not known. */
  elsewhere(): Set<PDFRef> {
    const out = new Set<PDFRef>();
    const visit = (object: PDFObject) => {
      if (object instanceof PDFStream) visit(object.dict);
      else if (object instanceof PDFArray) for (let i = 0; i < object.size(); i += 1) visit(object.get(i));
      else if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {
          if (!(value instanceof PDFRef)) visit(value);
          if (key !== XOBJECT) continue;
          const list = this.dict(value);
          if (!list || this.followed.has(list)) continue;
          for (const item of list.values()) if (item instanceof PDFRef) out.add(item);
        }
      }
    };
    for (const [, object] of this.doc.context.enumerateIndirectObjects()) visit(object);
    return out;
  }
}

// ---------------------------------------------------------------- reading pictures

type Pixels = Uint8Array | Uint8ClampedArray;

type Source = {
  w: number;
  h: number;
  /** Values of a pixel: grey, or red, green and blue. */
  n: 1 | 3;
  /** What those values mean. */
  space: PDFObject;
  lossless: boolean;
  /** Hands out every row: its pixels start at `at` and are `step` apart. */
  rows: (each: (px: Pixels, at: number, step: number, y: number) => void, rest: Rest) => Promise<void>;
};

/** Kind of colour, or null for those that are left alone. */
function spaceOf(
  context: PDFContext,
  object: PDFObject | undefined,
): { n: 1 | 3; palette?: Uint8Array; base: PDFObject } | null {
  const space = context.lookup(object);
  if (!space || !object) return null;
  const name = space instanceof PDFName ? space : space instanceof PDFArray ? space.lookup(0) : null;
  if (!(name instanceof PDFName)) return null;
  const list = space instanceof PDFArray ? space : null;
  switch (name.asString()) {
    case "/DeviceGray":
    case "/CalGray":
    case "/G":
      return { n: 1, base: object };
    case "/DeviceRGB":
    case "/CalRGB":
    case "/RGB":
      return { n: 3, base: object };
    case "/ICCBased": {
      const profile = list?.lookup(1);
      const n = profile instanceof PDFStream ? numberAt(profile.dict, "N") : null;
      return n === 1 || n === 3 ? { n, base: object } : null;
    }
    case "/Separation":
      // One value too, whatever its ink.
      return list ? { n: 1, base: object } : null;
    case "/Indexed":
    case "/I": {
      const base = list ? spaceOf(context, list.get(1)) : null;
      const table = list?.lookup(3);
      if (!base || base.palette) return null;
      let palette: Uint8Array | null = null;
      if (table instanceof PDFString || table instanceof PDFHexString) palette = table.asBytes();
      else if (table instanceof PDFRawStream) palette = decodePDFRawStream(table).decode();
      return palette ? { ...base, palette } : null;
    }
    default:
      return null;
  }
}

/** What the Decode entry makes of each value, when it makes something else of it. */
function tables(values: number[] | null, n: number): Uint8Array[] | null {
  if (!values || values.length < n * 2) return null;
  if (values.every((value, i) => value === i % 2)) return null;
  return Array.from({ length: n }, (_, i) => {
    const [low, high] = [values[i * 2], values[i * 2 + 1]];
    return Uint8Array.from({ length: 256 }, (__, v) =>
      Math.max(0, Math.min(255, Math.round((low + (v / 255) * (high - low)) * 255))),
    );
  });
}

type Jpeg = { bytes: Uint8Array; w: number; h: number; n: number; adobe: boolean };

/** A JPEG without its notes: a browser would turn it as the camera says, and change its colours. */
function cleanJpeg(b: Uint8Array): Jpeg | null {
  const start = b.indexOf(0xff);
  if (start < 0 || b[start + 1] !== 0xd8) return null;
  const parts = [b.subarray(start, start + 2)];
  let found: { w: number; h: number; n: number; ids: string } | null = null;
  let adobe = false;
  let jfif = false;
  for (let at = start + 2; at + 4 <= b.length;) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xda) {
      if (!found) return null;
      // Red, green and blue without a word about it: readers do not agree on those.
      if (found.n === 3 && !adobe && !jfif && found.ids !== "1,2,3" && found.ids !== "0,1,2") return null;
      parts.push(b.subarray(at));
      const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let to = 0;
      for (const part of parts) {
        bytes.set(part, to);
        to += part.length;
      }
      return { bytes, w: found.w, h: found.h, n: found.n, adobe };
    }
    const size = (b[at + 2] << 8) | b[at + 3];
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) {
      // Plain and progressive ones of eight bits, as every browser reads them.
      if (marker > 0xc2 || b[at + 4] !== 8) return null;
      const n = b[at + 9];
      const ids = Array.from({ length: n }, (_, i) => b[at + 10 + i * 3]).join();
      found = { h: (b[at + 5] << 8) | b[at + 6], w: (b[at + 7] << 8) | b[at + 8], n, ids };
    }
    if (marker === 0xee) adobe = true;
    if (marker === 0xe0) jfif = true;
    const note = (marker >= 0xe1 && marker <= 0xef && marker !== 0xee) || marker === 0xfe;
    if (!note) parts.push(b.subarray(at, at + 2 + size));
    at += 2 + size;
  }
  return null;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Drawing = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function canvasOf(w: number, h: number): { canvas: Canvas; draw: Drawing } {
  let canvas: Canvas;
  if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(w, h);
  else {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
  }
  const draw = canvas.getContext("2d", { willReadFrequently: true }) as Drawing | null;
  if (!draw) throw new Error("No canvas.");
  return { canvas, draw };
}

/** Some browsers give made-up pixels back, against being recognised. Pictures must not go through those. */
function canvasIsTrue(): boolean {
  try {
    const { draw } = canvasOf(16, 16);
    const given = draw.createImageData(16, 16);
    for (let i = 0; i < 256; i += 1) given.data.set([i, (i * 7) & 255, 255 - i, 255], i * 4);
    draw.putImageData(given, 0, 0);
    const back = draw.getImageData(0, 0, 16, 16).data;
    return back.every((value, i) => Math.abs(value - given.data[i]) <= 4);
  } catch {
    return false;
  }
}

async function readPicture(stream: PDFRawStream): Promise<Source | null> {
  const { dict, contents } = stream;
  const { context } = dict;
  const w = numberAt(dict, "Width") ?? 0;
  const h = numberAt(dict, "Height") ?? 0;
  const list = codings(dict);
  const space = spaceOf(context, dict.get(N("ColorSpace")));
  if (!list || !space || w < 1 || h < 1 || w > 30000 || h > 30000) return null;
  const { n, palette, base } = space;
  const values = numbersAt(dict, "Decode");

  const last = list[list.length - 1];
  if (last?.name === "DCTDecode") {
    if (palette || w > 16000 || !list.slice(0, -1).every(({ name }) => PLAIN.has(name))) return null;
    const jpeg = cleanJpeg(await decode(contents, list.slice(0, -1)));
    // Four values are CMYK, upside down in some files and not in others.
    if (!jpeg || jpeg.n !== n || jpeg.w !== w || jpeg.h !== h) return null;
    // The file says its colours are stored as they are, and the JPEG does not: a browser would not know.
    const stored = last.parms !== null && numberAt(last.parms, "ColorTransform") === 0;
    if (n === 3 && stored && !jpeg.adobe) return null;
    const maps = tables(values, n);
    return {
      w,
      h,
      n,
      space: base,
      lossless: false,
      rows: async (each, rest) => {
        const bitmap = await createImageBitmap(new Blob([jpeg.bytes], { type: "image/jpeg" }), {
          colorSpaceConversion: "none",
        });
        try {
          if (bitmap.width !== w || bitmap.height !== h) throw new Error("Not the size it should be.");
          const band = Math.max(8, Math.min(h, Math.floor(2_000_000 / w)));
          const { draw } = canvasOf(w, band);
          for (let y = 0; y < h; y += band) {
            const rows = Math.min(band, h - y);
            draw.drawImage(bitmap, 0, y, w, rows, 0, 0, w, rows);
            const { data } = draw.getImageData(0, 0, w, rows);
            if (maps) for (let i = 0; i < data.length; i += 1) if ((i & 3) < n) data[i] = maps[i & 3][data[i]];
            for (let r = 0; r < rows; r += 1) each(data, r * w * 4, 4, y + r);
            await rest();
          }
        } finally {
          bitmap.close();
        }
      },
    };
  }

  const bits = numberAt(dict, "BitsPerComponent") ?? 8;
  if (![2, 4, 8, 16].includes(bits) || (palette && bits === 16) || !list.every(({ name }) => PLAIN.has(name)))
    return null;
  const per = palette ? 1 : n;
  const row = (w * per * bits + 7) >> 3;
  if (row * h > 600_000_000) return null;
  const data = await decode(contents, list);
  if (data.length < row * h) return null;
  const top = 2 ** bits - 1;
  const maps = palette ? null : tables(values, n);
  // The colour of each place in the palette, through the Decode entry if there is one.
  const colours = palette ? new Uint8Array(256 * n) : null;
  if (palette && colours) {
    const [low, high] = values && values.length >= 2 ? values : [0, top];
    for (let v = 0; v <= top; v += 1) {
      const place = Math.max(0, Math.round(low + (v * (high - low)) / top));
      for (let i = 0; i < n; i += 1) colours[v * n + i] = palette[place * n + i] ?? 0;
    }
  }
  return {
    w,
    h,
    n,
    space: base,
    lossless: true,
    rows: async (each, rest) => {
      const direct = bits === 8 && !palette && !maps;
      const line = new Uint8Array(w * n);
      for (let y = 0; y < h; y += 1) {
        const from = y * row;
        if ((y & 63) === 63) await rest();
        if (direct) {
          each(data, from, n, y);
          continue;
        }
        for (let x = 0; x < w * per; x += 1) {
          let value: number;
          if (bits === 8) value = data[from + x];
          else if (bits === 16) value = data[from + x * 2];
          else value = (data[from + ((x * bits) >> 3)] >> (8 - bits - ((x * bits) & 7))) & top;
          if (colours) for (let i = 0; i < n; i += 1) line[x * n + i] = colours[value * n + i];
          else {
            if (bits < 8) value = (value * 255) / top;
            line[x] = maps ? maps[x % n][value] : value;
          }
        }
        each(line, 0, n, y);
      }
    },
  };
}

// ---------------------------------------------------------------- fewer pixels

/** Averages what lies under each of fewer pixels, row by row. */
class Averager {
  readonly out: Uint8Array;
  /** How much of each pixel can be seen, where a mask hides some. */
  readonly seen: Uint8Array | null;
  private readonly c: number;
  private readonly sx: number;
  private readonly sy: number;
  private readonly to: Uint32Array;
  private readonly part: Float32Array;
  private readonly line: Float32Array;
  private now: Float32Array;
  private next: Float32Array;
  private y = 0;
  private made = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly W: number,
    readonly H: number,
    readonly n: number,
    masked: boolean,
  ) {
    this.c = n + (masked ? 1 : 0);
    this.sx = w / W;
    this.sy = h / H;
    this.out = new Uint8Array(W * H * n);
    this.seen = masked ? new Uint8Array(W * H) : null;
    this.to = new Uint32Array(w);
    this.part = new Float32Array(w);
    for (let x = 0; x < w; x += 1) {
      const t = Math.min(W - 1, Math.floor(x / this.sx));
      this.to[x] = t * this.c;
      // The share that falls into this pixel; what is left falls into the next one.
      this.part[x] = t === W - 1 ? 1 : Math.min(1, (t + 1) * this.sx - x);
    }
    this.line = new Float32Array(W * this.c);
    this.now = new Float32Array(W * this.c);
    this.next = new Float32Array(W * this.c);
  }

  row(px: Pixels, at: number, step: number, mask: Uint8Array | null) {
    this.line.fill(0);
    if (mask) this.masked(px, at, step, mask);
    else this.plain(px, at, step);
    const { line } = this;
    const bottom = (this.made + 1) * this.sy;
    const here = this.made === this.H - 1 ? 1 : Math.min(1, bottom - this.y);
    const { now, next } = this;
    for (let i = 0; i < line.length; i += 1) {
      now[i] += line[i] * here;
      if (here < 1) next[i] += line[i] * (1 - here);
    }
    this.y += 1;
    if (this.made < this.H - 1 ? this.y >= bottom - 1e-6 : this.y === this.h) this.finish();
  }

  /** What each pixel of a row adds to those below it. Written out, for there are millions of them. */
  private plain(px: Pixels, at: number, step: number) {
    const { w, n, line, to, part } = this;
    for (let x = 0, p = at; x < w; x += 1, p += step) {
      const t = to[x];
      const share = part[x];
      line[t] += px[p] * share;
      if (n === 3) {
        line[t + 1] += px[p + 1] * share;
        line[t + 2] += px[p + 2] * share;
      }
      if (share === 1) continue;
      const left = 1 - share;
      line[t + n] += px[p] * left;
      if (n === 3) {
        line[t + 4] += px[p + 1] * left;
        line[t + 5] += px[p + 2] * left;
      }
    }
  }

  /** The same, where a pixel counts as much as it can be seen. */
  private masked(px: Pixels, at: number, step: number, mask: Uint8Array) {
    const { w, n, c, line, to, part } = this;
    const from = this.y * w;
    for (let x = 0, p = at; x < w; x += 1, p += step) {
      const alpha = mask[from + x];
      if (alpha === 0) continue;
      const t = to[x];
      const share = part[x];
      for (let i = 0; i <= n; i += 1) {
        const value = i < n ? px[p + i] * alpha : alpha;
        line[t + i] += value * share;
        if (share < 1) line[t + c + i] += value * (1 - share);
      }
    }
  }

  private finish() {
    const { W, n, c, now, out, seen, sx, sy } = this;
    const area = sx * sy;
    for (let x = 0; x < W; x += 1) {
      const whole = seen ? now[x * c + n] : area;
      const to = (this.made * W + x) * n;
      for (let i = 0; i < n; i += 1) out[to + i] = whole > 0 ? Math.min(255, now[x * c + i] / whole + 0.5) : 0;
      if (seen) seen[this.made * W + x] = whole > 0 ? Math.max(1, whole / area) : 0;
    }
    this.made += 1;
    this.now = this.next;
    this.next = now.fill(0);
  }
}

/** Gives what is hidden the colour of what is beside it, or it would show at the edges of a JPEG. */
function coverHidden(px: Uint8Array, seen: Uint8Array, w: number, h: number, n: number) {
  const mean = new Float32Array(n).fill(255);
  for (let top = 0; top < h; top += 16) {
    for (let left = 0; left < w; left += 16) {
      let count = 0;
      const sum = new Float32Array(n);
      const each = (visit: (at: number) => void) => {
        for (let y = top; y < Math.min(h, top + 16); y += 1)
          for (let x = left; x < Math.min(w, left + 16); x += 1) visit(y * w + x);
      };
      each((at) => {
        if (!seen[at]) return;
        count += 1;
        for (let i = 0; i < n; i += 1) sum[i] += px[at * n + i];
      });
      if (count > 0) for (let i = 0; i < n; i += 1) mean[i] = sum[i] / count;
      each((at) => {
        if (!seen[at]) for (let i = 0; i < n; i += 1) px[at * n + i] = mean[i];
      });
    }
  }
}

// ---------------------------------------------------------------- writing pictures

/** Natural place of each coefficient in the order they are written. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47,
  55, 62, 63,
];
/** How little the eye minds each of them. */
const COARSE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const SCALES = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

/** Cosine transform of one line of eight, scaled as the division afterwards expects (Arai, Agui, Nakajima). */
function transform(d: Float32Array, at: number, step: number) {
  const a0 = d[at] + d[at + 7 * step];
  const a7 = d[at] - d[at + 7 * step];
  const a1 = d[at + step] + d[at + 6 * step];
  const a6 = d[at + step] - d[at + 6 * step];
  const a2 = d[at + 2 * step] + d[at + 5 * step];
  const a5 = d[at + 2 * step] - d[at + 5 * step];
  const a3 = d[at + 3 * step] + d[at + 4 * step];
  const a4 = d[at + 3 * step] - d[at + 4 * step];
  const b0 = a0 + a3;
  const b3 = a0 - a3;
  const b1 = a1 + a2;
  const b2 = a1 - a2;
  const z1 = (b2 + b3) * 0.707106781;
  d[at] = b0 + b1;
  d[at + 4 * step] = b0 - b1;
  d[at + 2 * step] = b3 + z1;
  d[at + 6 * step] = b3 - z1;
  const c0 = a4 + a5;
  const c1 = a5 + a6;
  const c2 = a6 + a7;
  const z5 = (c0 - c2) * 0.382683433;
  const z2 = 0.5411961 * c0 + z5;
  const z4 = 1.306562965 * c2 + z5;
  const z3 = c1 * 0.707106781;
  const e0 = a7 + z3;
  const e1 = a7 - z3;
  d[at + 5 * step] = e1 + z2;
  d[at + 3 * step] = e1 - z2;
  d[at + step] = e0 + z4;
  d[at + 7 * step] = e0 - z4;
}

/** The shortest codes for how often each symbol comes, none longer than sixteen bits. */
function huffman(counts: Uint32Array): { bits: number[]; symbols: number[]; code: Uint16Array; size: Uint8Array } {
  const freq = Array.from(counts);
  // One more, so that no code is all ones.
  freq[256] = 1;
  const length = new Array<number>(257).fill(0);
  const chain = new Array<number>(257).fill(-1);
  for (;;) {
    let a = -1;
    let b = -1;
    for (let i = 0; i <= 256; i += 1) {
      if (!freq[i]) continue;
      if (a < 0 || freq[i] <= freq[a]) {
        b = a;
        a = i;
      } else if (b < 0 || freq[i] <= freq[b]) b = i;
    }
    if (b < 0) break;
    freq[a] += freq[b];
    freq[b] = 0;
    let end = a;
    for (length[end] += 1; chain[end] >= 0; length[end] += 1) end = chain[end];
    chain[end] = b;
    for (end = b, length[end] += 1; chain[end] >= 0; length[end] += 1) end = chain[end];
  }
  const bits = new Array<number>(300).fill(0);
  for (const size of length) if (size) bits[size] += 1;
  for (let i = 299; i > 16; i -= 1) {
    while (bits[i] > 0) {
      let j = i - 2;
      while (bits[j] === 0) j -= 1;
      bits[i] -= 2;
      bits[i - 1] += 1;
      bits[j + 1] += 2;
      bits[j] -= 1;
    }
  }
  let longest = 16;
  while (bits[longest] === 0) longest -= 1;
  bits[longest] -= 1;
  const symbols: number[] = [];
  for (let size = 1; size < 300; size += 1) for (let i = 0; i < 256; i += 1) if (length[i] === size) symbols.push(i);
  const code = new Uint16Array(256);
  const size = new Uint8Array(256);
  for (let i = 1, next = 0, at = 0; i <= 16; i += 1, next <<= 1) {
    for (let k = 0; k < bits[i]; k += 1) {
      code[symbols[at]] = next;
      size[symbols[at]] = i;
      next += 1;
      at += 1;
    }
  }
  return { bits: bits.slice(1, 17), symbols, code, size };
}

/** A grey JPEG. A canvas makes coloured ones only, and then the picture's own kind of grey would be lost. */
async function greyJpeg(px: Uint8Array, w: number, h: number, quality: number, rest: Rest): Promise<Uint8Array> {
  const percent = Math.max(1, Math.min(100, quality * 100));
  const scale = percent < 50 ? 5000 / percent : 200 - 2 * percent;
  const quant = COARSE.map((value) => Math.max(1, Math.min(255, Math.floor((value * scale + 50) / 100))));
  const divide = Float32Array.from(quant, (q, i) => 1 / (q * SCALES[i >> 3] * SCALES[i & 7] * 8));

  // First the symbols, to count them: steady values with their table above them, and the bits that follow.
  let symbols = new Uint16Array(Math.max(1024, (w * h) >> 2));
  let values = new Uint16Array(symbols.length);
  let count = 0;
  const steady = new Uint32Array(257);
  const moving = new Uint32Array(257);
  const block = new Float32Array(64);
  const order = new Int32Array(64);
  const put = (table: number, run: number, value: number) => {
    const size = value === 0 ? 0 : 32 - Math.clz32(Math.abs(value));
    const symbol = (run << 4) | size;
    (table === 0 ? steady : moving)[symbol] += 1;
    symbols[count] = (table << 8) | symbol;
    values[count] = value < 0 ? value + (1 << size) - 1 : value;
    count += 1;
  };
  let before = 0;
  for (let top = 0; top < h; top += 8) {
    if (count + w * 10 > symbols.length) {
      const more = new Uint16Array(Math.max(symbols.length * 2, count + w * 10));
      more.set(symbols);
      symbols = more;
      const others = new Uint16Array(more.length);
      others.set(values);
      values = others;
    }
    for (let left = 0; left < w; left += 8) {
      for (let y = 0; y < 8; y += 1) {
        const from = Math.min(h - 1, top + y) * w;
        for (let x = 0; x < 8; x += 1) block[y * 8 + x] = px[from + Math.min(w - 1, left + x)] - 128;
      }
      for (let y = 0; y < 8; y += 1) transform(block, y * 8, 1);
      for (let x = 0; x < 8; x += 1) transform(block, x, 8);
      let end = 0;
      for (let i = 0; i < 64; i += 1) {
        const place = ZIGZAG[i];
        order[i] = Math.round(block[place] * divide[place]);
        if (order[i] !== 0) end = i;
      }
      put(0, 0, order[0] - before);
      before = order[0];
      let run = 0;
      for (let i = 1; i <= end; i += 1) {
        if (order[i] === 0) {
          run += 1;
          continue;
        }
        for (; run > 15; run -= 16) put(1, 15, 0);
        put(1, run, order[i]);
        run = 0;
      }
      if (end < 63) put(1, 0, 0);
    }
    if ((top & 63) === 0) await rest();
  }

  const codes = [huffman(steady), huffman(moving)];
  const out: number[] = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  out.push(0xff, 0xdb, 0, 67, 0, ...ZIGZAG.map((place) => quant[place]));
  out.push(0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0);
  codes.forEach((one, i) => {
    out.push(0xff, 0xc4, 0, 19 + one.symbols.length, i << 4, ...one.bits, ...one.symbols);
  });
  out.push(0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0);
  // No symbol takes more than sixteen bits and as many behind it, and any byte may be followed by a zero.
  let bytes = new Uint8Array(out.length + count * 2 + 64);
  bytes.set(out);
  let at = out.length;
  let held = 0;
  let have = 0;
  const send = (value: number, size: number) => {
    held = (held << size) | value;
    have += size;
    while (have >= 8) {
      have -= 8;
      const byte = (held >> have) & 255;
      bytes[at++] = byte;
      if (byte === 255) bytes[at++] = 0;
    }
    held &= (1 << have) - 1;
  };
  for (let i = 0; i < count; i += 1) {
    if (at + 16 > bytes.length) {
      const more = new Uint8Array(bytes.length * 2);
      more.set(bytes);
      bytes = more;
    }
    const { code, size } = codes[symbols[i] >> 8];
    const symbol = symbols[i] & 255;
    send(code[symbol], size[symbol]);
    if (symbol & 15) send(values[i], symbol & 15);
    if ((i & 0xffff) === 0) await rest();
  }
  if (have > 0) send((1 << (8 - have)) - 1, 8 - have);
  bytes[at++] = 0xff;
  bytes[at++] = 0xd9;
  return bytes.slice(0, at);
}

async function colourJpeg(
  px: Uint8Array,
  w: number,
  h: number,
  quality: number,
  rest: Rest,
): Promise<Uint8Array | null> {
  const { canvas, draw } = canvasOf(w, h);
  const band = Math.max(1, Math.min(h, Math.floor(1_000_000 / w)));
  for (let y = 0; y < h; y += band) {
    const rows = Math.min(band, h - y);
    const image = draw.createImageData(w, rows);
    const { data } = image;
    for (let i = 0, from = y * w * 3; i < data.length; i += 4, from += 3) {
      data[i] = px[from];
      data[i + 1] = px[from + 1];
      data[i + 2] = px[from + 2];
      data[i + 3] = 255;
    }
    draw.putImageData(image, 0, y);
    await rest();
  }
  // A canvas too large for the device stays empty without saying so.
  if (draw.getImageData(w - 1, h - 1, 1, 1).data[3] !== 255) return null;
  const blob = await ("convertToBlob" in canvas
    ? canvas.convertToBlob({ type: "image/jpeg", quality })
    : new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)));
  return blob?.type === "image/jpeg" ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** Deflated without loss, each row as its difference from what is around it, as in a PNG. */
async function flat(px: Uint8Array, w: number, h: number, n: number, rest: Rest): Promise<Uint8Array> {
  const row = w * n;
  const out = new Uint8Array((row + 1) * h);
  const tries = [0, 1, 2, 4].map((kind) => ({ kind, line: new Uint8Array(row) }));
  for (let y = 0; y < h; y += 1) {
    const from = y * row;
    let best = tries[0];
    let least = Infinity;
    for (const one of tries) {
      const { kind, line } = one;
      let sum = 0;
      for (let x = 0; x < row; x += 1) {
        const left = x >= n ? px[from + x - n] : 0;
        const up = y > 0 ? px[from + x - row] : 0;
        let guess = 0;
        if (kind === 1) guess = left;
        else if (kind === 2) guess = up;
        else if (kind === 4) {
          const corner = x >= n && y > 0 ? px[from + x - row - n] : 0;
          const pl = Math.abs(up - corner);
          const pu = Math.abs(left - corner);
          const pc = Math.abs(left + up - 2 * corner);
          guess = pl <= pu && pl <= pc ? left : pu <= pc ? up : corner;
        }
        const value = (px[from + x] - guess) & 255;
        line[x] = value;
        sum += value < 128 ? value : 256 - value;
      }
      if (sum < least) {
        least = sum;
        best = one;
      }
      if (sum === 0) break;
    }
    out[y * (row + 1)] = best.kind;
    out.set(best.line, y * (row + 1) + 1);
    if ((y & 31) === 0) await rest();
  }
  return deflate(out);
}

// ---------------------------------------------------------------- one picture

type Fit = { W: number; H: number; smaller: boolean };

/** The pixels it should have. Not worth it for a few per cent, nor for one that is drawn with no size at all. */
function fit(w: number, h: number, use: Use, dpi: number): Fit {
  const ratio = Math.min(w / (use.w * dpi), h / (use.h * dpi));
  if (!(ratio > 1.15) || use.w * dpi < 2 || use.h * dpi < 2) return { W: w, H: h, smaller: false };
  return { W: Math.max(1, Math.round(w / ratio)), H: Math.max(1, Math.round(h / ratio)), smaller: true };
}

async function resample(
  source: Source,
  { W, H, smaller }: Fit,
  mask: Uint8Array | null,
  rest: Rest,
): Promise<{ px: Uint8Array; seen: Uint8Array | null }> {
  const { w, n } = source;
  if (smaller) {
    const averager = new Averager(w, source.h, W, H, n, mask !== null);
    await source.rows((px, at, step) => averager.row(px, at, step, mask), rest);
    return { px: averager.out, seen: averager.seen };
  }
  const px = new Uint8Array(w * H * n);
  await source.rows((line, at, step, y) => {
    if (step === n) px.set(line.subarray(at, at + w * n), y * w * n);
    else
      for (let x = 0; x < w; x += 1) for (let i = 0; i < n; i += 1) px[(y * w + x) * n + i] = line[at + x * step + i];
  }, rest);
  return { px, seen: mask };
}

/** A soft mask as one value for every pixel. Null when it cannot be read. */
async function readMask(object: PDFObject | undefined, rest: Rest): Promise<{ source: Source; px: Uint8Array } | null> {
  if (!(object instanceof PDFRawStream) || numberAt(object.dict, "BitsPerComponent") === 1) return null;
  const source = await readPicture(object);
  if (!source || source.n !== 1) return null;
  const { px } = await resample(source, { W: source.w, H: source.h, smaller: false }, null, rest);
  return { source, px };
}

/** The one value of each pixel, when all of them are grey. */
function greyOf(px: Uint8Array): Uint8Array | null {
  for (let i = 0; i < px.length; i += 3) if (px[i] !== px[i + 1] || px[i] !== px[i + 2]) return null;
  const out = new Uint8Array(px.length / 3);
  for (let i = 0; i < out.length; i += 1) out[i] = px[i * 3];
  return out;
}

function replace(
  ref: PDFRef,
  stream: PDFRawStream,
  bytes: Uint8Array,
  { W, H }: Fit,
  space: PDFObject,
  coding: Coding,
) {
  const { context } = stream.dict;
  const dict = stream.dict.clone();
  dict.set(N("Width"), PDFNumber.of(W));
  dict.set(N("Height"), PDFNumber.of(H));
  dict.set(N("BitsPerComponent"), PDFNumber.of(8));
  dict.set(N("ColorSpace"), space);
  dict.delete(N("Decode"));
  setFilter(dict, [coding]);
  context.assign(ref, PDFRawStream.of(dict, bytes));
}

const prediction = (context: PDFContext, n: number, w: number) =>
  context.obj({ Predictor: 15, Colors: n, BitsPerComponent: 8, Columns: w }) as PDFDict;

/** Whether it is better off as it is. */
function leaveAlone(dict: PDFDict, size: number): boolean {
  const pixels = (numberAt(dict, "Width") ?? 0) * (numberAt(dict, "Height") ?? 0);
  return (
    dict.lookup(N("ImageMask")) === PDFBool.True ||
    numberAt(dict, "BitsPerComponent") === 1 ||
    // Colours that stand for "nothing here" would no longer be exactly those.
    dict.lookup(N("Mask")) instanceof PDFArray ||
    pixels < 64 * 64 ||
    size < 2000
  );
}

async function shrinkPicture(
  context: PDFContext,
  ref: PDFRef,
  use: Use,
  level: { dpi: number; quality: number },
  rest: Rest,
): Promise<boolean> {
  const stream = context.lookup(ref);
  if (!(stream instanceof PDFRawStream) || leaveAlone(stream.dict, stream.contents.length)) return false;
  const old = stream.contents.length;
  const soft = stream.dict.lookup(N("SMask"));
  // Mixed with a colour beforehand: the mask and the picture only fit together.
  if (soft instanceof PDFStream && soft.dict.has(N("Matte"))) return false;
  const source = await readPicture(stream);
  if (!source) return false;
  const size = fit(source.w, source.h, use, level.dpi);
  const mask = await readMask(soft, rest);
  let changed = false;
  if (mask?.px.every((value) => value === 255)) {
    stream.dict.delete(N("SMask"));
    changed = true;
  }
  const hides = changed || mask?.source.w !== source.w || mask.source.h !== source.h ? null : (mask?.px ?? null);
  const made = await resample(source, size, hides, rest);
  let { n, space } = source;
  let { px } = made;
  await rest();
  const grey = n === 3 && context.lookup(space) === N("DeviceRGB") ? greyOf(px) : null;
  if (grey) {
    px = grey;
    n = 1;
    space = N("DeviceGray");
  }
  if (made.seen) coverHidden(px, made.seen, size.W, size.H, n);
  await rest();

  const { W, H } = size;
  const jpeg =
    n === 1 ? await greyJpeg(px, W, H, level.quality, rest) : await colourJpeg(px, W, H, level.quality, rest);
  let best: { bytes: Uint8Array; coding: Coding } | null = jpeg && {
    bytes: jpeg,
    coding: { name: "DCTDecode", parms: null },
  };
  // Drawings and screenshots are often smaller, and always sharper, without loss.
  if (source.lossless && old < source.w * source.h * source.n * 0.3) {
    const bytes = await flat(px, W, H, n, rest);
    if (!best || bytes.length <= best.bytes.length * 1.1)
      best = { bytes, coding: { name: "FlateDecode", parms: prediction(context, n, W) } };
  }
  // A JPEG made again loses a little more, so it has to pay.
  const enough = source.lossless || size.smaller ? 0.95 : 0.8;
  if (!best || best.bytes.length >= old * enough) return changed;
  replace(ref, stream, best.bytes, size, space, best.coding);
  return true;
}

async function shrinkMask(context: PDFContext, ref: PDFRef, use: Use, dpi: number, rest: Rest): Promise<boolean> {
  const stream = context.lookup(ref);
  if (!(stream instanceof PDFRawStream) || leaveAlone(stream.dict, stream.contents.length)) return false;
  if (stream.dict.has(N("Matte"))) return false;
  const mask = await readMask(stream, rest);
  if (!mask) return false;
  const size = fit(mask.source.w, mask.source.h, use, dpi);
  const { px } = size.smaller ? await resample(mask.source, size, null, rest) : mask;
  const bytes = await flat(px, size.W, size.H, 1, rest);
  if (bytes.length >= stream.contents.length * 0.95) return false;
  const coding = { name: "FlateDecode", parms: prediction(context, 1, size.W) };
  replace(ref, stream, bytes, size, N("DeviceGray"), coding);
  return true;
}

// ---------------------------------------------------------------- everything else

/** Takes the room for later changes out of a metadata packet. */
function unpadded(data: Uint8Array): Uint8Array {
  const word = "<?xpacket end";
  let end = -1;
  for (let at = data.length - word.length; at >= 0 && end < 0; at -= 1) {
    let i = 0;
    while (i < word.length && data[at + i] === word.charCodeAt(i)) i += 1;
    if (i === word.length) end = at;
  }
  if (end < 0) return data;
  let from = end;
  while (from > 0 && [9, 10, 13, 32].includes(data[from - 1])) from -= 1;
  if (end - from < 40) return data;
  const out = new Uint8Array(data.length - (end - from) + 1);
  out.set(data.subarray(0, from));
  out[from] = 10;
  out.set(data.subarray(end), from + 1);
  return out;
}

/** Deflates what is not compressed, and takes codings off that only make it longer. */
async function tighten(context: PDFContext, rest: Rest) {
  for (const [ref, stream] of context.enumerateIndirectObjects()) {
    await rest();
    if (!(stream instanceof PDFRawStream) || stream.dict.has(N("F"))) continue;
    const list = codings(stream.dict);
    if (!list) continue;
    try {
      let data = stream.contents;
      let left = list;
      if (nameAt(stream.dict, "Type") === "Metadata") {
        // Stays readable, for programs that look for it without reading the file.
        if (!list.every(({ name }) => PLAIN.has(name))) continue;
        const text = await decode(data, list);
        const shorter = unpadded(text);
        if (shorter === text) continue;
        data = list.length === 0 ? shorter : await deflate(shorter);
        left = list.length === 0 ? [] : [{ name: "FlateDecode", parms: null }];
      } else {
        while (left.length > 0 && ASCII.has(left[0].name)) {
          const size = data.length;
          data = await uncode(data, left[0]);
          // Text of this kind is never much longer than what it stands for.
          if (data.length < size * 0.4) throw new Error("Broken off.");
          left = left.slice(1);
        }
        const [first] = left;
        if (left.length === 0 && data.length > 60) {
          data = await deflate(data);
          left = [{ name: "FlateDecode", parms: null }];
        } else if (left.length === 1 && (first.name === "LZWDecode" || first.name === "RunLengthDecode")) {
          data = await deflate(await uncode(data, first));
          const parms = first.parms?.clone() ?? null;
          parms?.delete(N("EarlyChange"));
          left = [{ name: "FlateDecode", parms: first.name === "LZWDecode" ? parms : null }];
        }
      }
      if (data.length >= stream.contents.length) continue;
      const dict = stream.dict.clone();
      setFilter(dict, left);
      context.assign(ref, PDFRawStream.of(dict, data));
    } catch {
      // Not to be decoded here, so it stays as it is.
    }
  }
}

/** Small pictures of pages, and what other programs keep for themselves. */
function dropExtras(context: PDFContext) {
  for (const [, object] of context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : null;
    if (!dict) continue;
    const type = nameAt(dict, "Type");
    if (type === "Page") dict.delete(N("Thumb"));
    if (type === "Page" || type === "Catalog" || nameAt(dict, "Subtype") === "Form") dict.delete(N("PieceInfo"));
  }
}

const same = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

/** One spelling for equal values. */
function spell(object: PDFObject): string {
  if (object instanceof PDFDict) {
    const pairs = object.entries().filter(([key]) => key !== PDFName.Length);
    return `<<${pairs
      .map(([key, value]) => `${key.asString()} ${spell(value)}`)
      .sort()
      .join(" ")}>>`;
  }
  if (object instanceof PDFArray) return `[${object.asArray().map(spell).join(" ")}]`;
  return object.toString();
}

/** Points every reference to something that is there twice at the first of it. */
async function dropTwins(context: PDFContext, rest: Rest) {
  // Streams that differ in their masks only can turn out equal once the masks are.
  for (let round = 0; round < 4; round += 1) {
    const groups = new Map<string, [PDFRef, PDFRawStream][]>();
    for (const [ref, object] of context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      const key = `${object.contents.length} ${spell(object.dict)}`;
      const group = groups.get(key);
      if (group) group.push([ref, object]);
      else groups.set(key, [[ref, object]]);
    }
    const twins = new Map<PDFRef, PDFRef>();
    for (const group of groups.values()) {
      const firsts: [PDFRef, PDFRawStream][] = [];
      for (const [ref, stream] of group) {
        const twin = firsts.find(([, other]) => same(other.contents, stream.contents));
        if (twin) twins.set(ref, twin[0]);
        else firsts.push([ref, stream]);
      }
      await rest();
    }
    if (twins.size === 0) return;
    const point = (object: PDFObject) => {
      if (object instanceof PDFStream) point(object.dict);
      else if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {
          const twin = value instanceof PDFRef ? twins.get(value) : undefined;
          if (twin) object.set(key, twin);
          else if (!(value instanceof PDFRef)) point(value);
        }
      } else if (object instanceof PDFArray) {
        for (let i = 0; i < object.size(); i += 1) {
          const value = object.get(i);
          const twin = value instanceof PDFRef ? twins.get(value) : undefined;
          if (twin) object.set(i, twin);
          else if (!(value instanceof PDFRef)) point(value);
        }
      }
    };
    for (const [, object] of context.enumerateIndirectObjects()) point(object);
    for (const ref of twins.keys()) context.delete(ref);
  }
}

/** Drops everything nothing points at. */
function sweep(context: PDFContext) {
  const seen = new Set<PDFRef>();
  const { Root, Info, Encrypt, ID } = context.trailerInfo;
  const stack = [Root, Info, Encrypt, ID].filter((object): object is PDFObject => object !== undefined);
  for (let object = stack.pop(); object; object = stack.pop()) {
    if (object instanceof PDFRef) {
      if (seen.has(object)) continue;
      seen.add(object);
      const value = context.lookup(object);
      if (value) stack.push(value);
    } else if (object instanceof PDFDict) for (const value of object.values()) stack.push(value);
    else if (object instanceof PDFArray) for (let i = 0; i < object.size(); i += 1) stack.push(object.get(i));
    else if (object instanceof PDFStream) stack.push(object.dict);
  }
  for (const [ref] of context.enumerateIndirectObjects()) if (!seen.has(ref)) context.delete(ref);
}

function weigh(context: PDFContext): number {
  let sum = 0;
  for (const [, object] of context.enumerateIndirectObjects())
    if (object instanceof PDFStream) sum += object.getContentsSize();
  return sum;
}

/** Works on the document itself. Comes last, right before it is saved: what nothing points at by then is dropped. */
export async function shrinkPdf(
  doc: PDFDocument,
  level: ShrinkLevel,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pictures: number; saved: number }> {
  const { context } = doc;
  const rest = pacer();
  await doc.flush();
  const before = weigh(context);
  // First, so that no picture is worked on twice.
  dropExtras(context);
  sweep(context);
  await dropTwins(context, rest);

  const pages = doc.getPages();
  const uses = new Uses(doc);
  const pictures = context
    .enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFStream && object.dict.lookup(N("Subtype")) === IMAGE).length;
  const total = pages.length + pictures + 1;
  let done = 0;
  const step = () => onProgress?.((done += 1), total);
  for (const page of pages) {
    try {
      uses.page(page);
    } catch {
      // A page that cannot be read: its pictures stay as they are.
    }
    step();
    await rest();
  }

  const unsure = uses.elsewhere();
  const jobs = canvasIsTrue() ? [...uses.known].filter(([ref]) => !unsure.has(ref)) : [];
  const masks = new Map<PDFRef, Use & { of: PDFRef[] }>();
  // Those that are left alone are done already.
  done += pictures - jobs.length;
  const changed = new Set<PDFRef>();
  const { dpi, quality } = LEVELS[level];
  for (const [ref, use] of jobs) {
    try {
      if (await shrinkPicture(context, ref, use, { dpi, quality }, rest)) changed.add(ref);
    } catch {
      // Unreadable here, though perhaps not elsewhere: it stays as it is.
    }
    const stream = context.lookup(ref);
    const soft = stream instanceof PDFStream ? stream.dict.get(N("SMask")) : undefined;
    if (soft instanceof PDFRef) {
      const old = masks.get(soft);
      masks.set(soft, {
        w: Math.max(old?.w ?? 0, use.w),
        h: Math.max(old?.h ?? 0, use.h),
        of: [...(old?.of ?? []), ref],
      });
    }
    step();
    await rest();
  }
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    // A mask that a picture of unknown size uses as well is left alone.
    const soft = object instanceof PDFStream ? object.dict.get(N("SMask")) : undefined;
    if (soft instanceof PDFRef && !masks.get(soft)?.of.includes(ref)) masks.delete(soft);
  }
  for (const [ref, use] of masks) {
    try {
      if (await shrinkMask(context, ref, use, dpi, rest)) use.of.forEach((one) => changed.add(one));
    } catch {
      // As above.
    }
    await rest();
  }

  await tighten(context, rest);
  await dropTwins(context, rest);
  sweep(context);
  step();
  return { pictures: changed.size, saved: Math.max(0, before - weigh(context)) };
}
