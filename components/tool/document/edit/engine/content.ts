import {
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";
import { IDENTITY, apply, bounds, corners, intersect, mul, num, type Box, type Matrix, type Point } from "./matrix";

/**
 * Reads and rewrites the drawing instructions of a page, so text and pictures
 * can be taken out of a PDF instead of being painted over.
 */

// ---------------------------------------------------------------- reading tokens

type Token =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "str"; v: Uint8Array }
  | { t: "arr"; v: Token[] }
  | { t: "other" };

const isSpace = (c: number) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDelim = (c: number) =>
  c === 40 ||
  c === 41 ||
  c === 60 ||
  c === 62 ||
  c === 91 ||
  c === 93 ||
  c === 123 ||
  c === 125 ||
  c === 47 ||
  c === 37;
const hex = (c: number) =>
  c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;

class Reader {
  at = 0;
  constructor(readonly b: Uint8Array) {}

  skip() {
    const { b } = this;
    for (;;) {
      while (this.at < b.length && isSpace(b[this.at])) this.at += 1;
      if (b[this.at] !== 37) return;
      while (this.at < b.length && b[this.at] !== 10 && b[this.at] !== 13) this.at += 1;
    }
  }

  word() {
    const from = this.at;
    while (this.at < this.b.length && !isSpace(this.b[this.at]) && !isDelim(this.b[this.at])) this.at += 1;
    let out = "";
    for (let i = from; i < this.at; i += 1) out += String.fromCharCode(this.b[i]);
    return out;
  }

  string(): Uint8Array {
    const { b } = this;
    const out: number[] = [];
    let depth = 1;
    this.at += 1;
    while (this.at < b.length) {
      let c = b[this.at++];
      if (c === 92) {
        c = b[this.at++];
        if (c === 110) out.push(10);
        else if (c === 114) out.push(13);
        else if (c === 116) out.push(9);
        else if (c === 98) out.push(8);
        else if (c === 102) out.push(12);
        else if (c >= 48 && c <= 55) {
          let v = c - 48;
          for (let i = 0; i < 2 && b[this.at] >= 48 && b[this.at] <= 55; i += 1) v = v * 8 + b[this.at++] - 48;
          out.push(v & 255);
        } else if (c === 13) {
          if (b[this.at] === 10) this.at += 1;
        } else if (c !== 10 && c !== undefined) out.push(c);
        continue;
      }
      if (c === 40) depth += 1;
      else if (c === 41) {
        depth -= 1;
        if (depth === 0) break;
      }
      out.push(c);
    }
    return Uint8Array.from(out);
  }

  hexString(): Uint8Array {
    const { b } = this;
    const out: number[] = [];
    let high = -1;
    this.at += 1;
    while (this.at < b.length) {
      const c = b[this.at++];
      if (c === 62) break;
      const v = hex(c);
      if (v < 0) continue;
      if (high < 0) high = v;
      else {
        out.push(high * 16 + v);
        high = -1;
      }
    }
    if (high >= 0) out.push(high * 16);
    return Uint8Array.from(out);
  }

  /** An operand, or the operator's name. Null at the end. */
  next(): Token | string | null {
    this.skip();
    const { b } = this;
    if (this.at >= b.length) return null;
    const c = b[this.at];
    if (c === 40) return { t: "str", v: this.string() };
    if (c === 60) {
      if (b[this.at + 1] === 60) {
        this.at += 2;
        for (;;) {
          this.skip();
          if (this.at >= b.length) break;
          if (b[this.at] === 62 && b[this.at + 1] === 62) {
            this.at += 2;
            break;
          }
          if (this.next() === null) break;
        }
        return { t: "other" };
      }
      return { t: "str", v: this.hexString() };
    }
    if (c === 91) {
      this.at += 1;
      const items: Token[] = [];
      for (;;) {
        this.skip();
        if (this.at >= b.length) break;
        if (b[this.at] === 93) {
          this.at += 1;
          break;
        }
        const item = this.next();
        if (item === null) break;
        if (typeof item !== "string") items.push(item);
      }
      return { t: "arr", v: items };
    }
    if (c === 47) {
      this.at += 1;
      const raw = this.word();
      return {
        t: "name",
        v: raw.replace(/#([0-9a-fA-F]{2})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16))),
      };
    }
    if (c === 41 || c === 62 || c === 93 || c === 123 || c === 125) {
      this.at += 1;
      return { t: "other" };
    }
    const word = this.word();
    if (word === "") {
      this.at += 1;
      return { t: "other" };
    }
    const first = word.charCodeAt(0);
    if ((first >= 48 && first <= 57) || first === 43 || first === 45 || first === 46) {
      const value = parseFloat(word.replace(/^(-)-+/, "$1"));
      if (Number.isFinite(value)) return { t: "num", v: value };
      return { t: "num", v: 0 };
    }
    if (word === "true" || word === "false" || word === "null") return { t: "other" };
    return word;
  }

  /** Called right after `BI`: moves past the matching `EI`. */
  inlineImage() {
    const { b } = this;
    for (;;) {
      const token = this.next();
      if (token === null) return;
      if (token === "ID") break;
    }
    this.at += 1;
    for (let i = this.at; i < b.length - 1; i += 1) {
      if (b[i] !== 69 || b[i + 1] !== 73 || !isSpace(b[i - 1])) continue;
      if (i + 2 < b.length && !isSpace(b[i + 2])) continue;
      let plain = true;
      for (let k = i + 2; k < Math.min(b.length, i + 16); k += 1) {
        const c = b[k];
        if (c > 126 || (c < 32 && !isSpace(c))) {
          plain = false;
          break;
        }
      }
      if (!plain) continue;
      this.at = i + 2;
      return;
    }
    this.at = b.length;
  }
}

// ---------------------------------------------------------------- walking a page

export type StreamNode = {
  bytes: Uint8Array;
  resources: PDFDict | undefined;
  ownResources: boolean;
  /** Where the parent calls this form. */
  call: { parent: StreamNode; name: string; start: number; end: number } | null;
  form: PDFRawStream | null;
  children: StreamNode[];
  /** Saves left open at the end. */
  open: number;
  /** Restores with nothing to restore. */
  extra: number;
};

export type Show = {
  node: StreamNode;
  start: number;
  end: number;
  /** What has to stay in front of the rewritten text. */
  lead: string;
  parts: (number | Uint8Array)[];
  font: PDFObject | undefined;
};

export type Picture = {
  node: StreamNode;
  start: number;
  end: number;
  /** The picture's unit square to PDF space. */
  ctm: Matrix;
  clip: Box | null;
  xobject: PDFObject | null;
  inline: boolean;
};

export type PageTree = { root: StreamNode; shows: Show[]; pictures: Picture[] };

export function streamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (stream instanceof PDFContentStream) return stream.getUnencodedContents();
  return stream.getContents();
}

function pageBytes(page: PDFPage): Uint8Array {
  const { context } = page.doc;
  const raw = page.node.get(PDFName.of("Contents"));
  const contents = raw instanceof PDFRef ? context.lookup(raw) : raw;
  const parts: Uint8Array[] = [];
  const add = (object: PDFObject | undefined) => {
    const stream = object instanceof PDFRef ? context.lookup(object) : object;
    if (!(stream instanceof PDFStream)) return;
    try {
      parts.push(streamBytes(stream));
    } catch {
      // An unreadable part draws nothing, here as in a viewer.
    }
  };
  if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i += 1) add(contents.get(i));
  else add(contents);
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    out[at + part.length] = 10;
    at += part.length + 1;
  }
  return out;
}

const dictOf = (context: PDFContext, object: PDFObject | undefined): PDFDict | undefined => {
  const value = object instanceof PDFRef ? context.lookup(object) : object;
  return value instanceof PDFDict ? value : undefined;
};

function matrixOf(context: PDFContext, object: PDFObject | undefined): Matrix {
  const value = object instanceof PDFRef ? context.lookup(object) : object;
  if (!(value instanceof PDFArray) || value.size() !== 6) return IDENTITY;
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const item = value.lookup(i);
    out.push(item instanceof PDFNumber ? item.asNumber() : IDENTITY[i]);
  }
  return out as Matrix;
}

function boxOf(context: PDFContext, object: PDFObject | undefined): Box | null {
  const value = object instanceof PDFRef ? context.lookup(object) : object;
  if (!(value instanceof PDFArray) || value.size() !== 4) return null;
  const n = [0, 1, 2, 3].map((i) => {
    const item = value.lookup(i);
    return item instanceof PDFNumber ? item.asNumber() : 0;
  });
  return { x: Math.min(n[0], n[2]), y: Math.min(n[1], n[3]), w: Math.abs(n[2] - n[0]), h: Math.abs(n[3] - n[1]) };
}

type State = { ctm: Matrix; clip: Box | null; font: PDFObject | undefined };

export function readPage(page: PDFPage): PageTree {
  const { context } = page.doc;
  const shows: Show[] = [];
  const pictures: Picture[] = [];
  const root: StreamNode = {
    bytes: pageBytes(page),
    resources: page.node.Resources(),
    ownResources: true,
    call: null,
    form: null,
    children: [],
    open: 0,
    extra: 0,
  };

  const walk = (node: StreamNode, start: State, depth: number, seen: PDFObject[]) => {
    const reader = new Reader(node.bytes);
    const find = (kind: string, name: string) =>
      dictOf(context, node.resources?.get(PDFName.of(kind)))?.get(PDFName.of(name));
    let state = start;
    const stack: State[] = [];
    let args: Token[] = [];
    let from = -1;
    let path: Point[] = [];
    let clipping = false;

    const n = (i: number) => {
      const token = args[i];
      return token?.t === "num" ? token.v : 0;
    };
    const point = (x: number, y: number) => path.push(apply(state.ctm, x, y));

    for (;;) {
      reader.skip();
      const at = reader.at;
      const token = reader.next();
      if (token === null) break;
      if (typeof token !== "string") {
        if (args.length === 0) from = at;
        args.push(token);
        continue;
      }
      const begin = args.length > 0 ? from : at;
      switch (token) {
        case "q":
          stack.push(state);
          break;
        case "Q": {
          const back = stack.pop();
          if (back) state = back;
          else node.extra += 1;
          break;
        }
        case "cm":
          state = { ...state, ctm: mul([n(0), n(1), n(2), n(3), n(4), n(5)], state.ctm) };
          break;
        case "m":
        case "l":
          point(n(0), n(1));
          break;
        case "c":
          point(n(0), n(1));
          point(n(2), n(3));
          point(n(4), n(5));
          break;
        case "v":
        case "y":
          point(n(0), n(1));
          point(n(2), n(3));
          break;
        case "re":
          path.push(...corners(state.ctm, { x: n(0), y: n(1), w: n(2), h: n(3) }));
          break;
        case "W":
        case "W*":
          clipping = true;
          break;
        case "n":
        case "f":
        case "F":
        case "f*":
        case "S":
        case "s":
        case "B":
        case "B*":
        case "b":
        case "b*":
          if (clipping && path.length > 0) {
            const box = bounds(path);
            state = { ...state, clip: state.clip ? intersect(state.clip, box) : box };
          }
          clipping = false;
          path = [];
          break;
        case "Tf": {
          const name = args[0];
          if (name?.t === "name") state = { ...state, font: find("Font", name.v) ?? PDFName.of("missing") };
          break;
        }
        case "gs": {
          const name = args[0];
          if (name?.t !== "name") break;
          const font = dictOf(context, find("ExtGState", name.v))?.get(PDFName.of("Font"));
          const value = font instanceof PDFRef ? context.lookup(font) : font;
          if (value instanceof PDFArray) state = { ...state, font: value.get(0) };
          break;
        }
        case "Tj":
        case "'": {
          const text = args[args.length - 1];
          if (text?.t !== "str" || !state.font) break;
          shows.push({
            node,
            start: begin,
            end: reader.at,
            lead: token === "'" ? "T* " : "",
            parts: [text.v],
            font: state.font,
          });
          break;
        }
        case '"': {
          const text = args[args.length - 1];
          if (args.length < 3 || text?.t !== "str" || !state.font) break;
          shows.push({
            node,
            start: begin,
            end: reader.at,
            lead: `${num(n(0))} Tw ${num(n(1))} Tc T* `,
            parts: [text.v],
            font: state.font,
          });
          break;
        }
        case "TJ": {
          const list = args[args.length - 1];
          if (list?.t !== "arr" || !state.font) break;
          const parts: (number | Uint8Array)[] = [];
          for (const item of list.v) {
            if (item.t === "num") parts.push(item.v);
            else if (item.t === "str") parts.push(item.v);
          }
          shows.push({ node, start: begin, end: reader.at, lead: "", parts, font: state.font });
          break;
        }
        case "BI":
          reader.inlineImage();
          pictures.push({
            node,
            start: begin,
            end: reader.at,
            ctm: state.ctm,
            clip: state.clip,
            xobject: null,
            inline: true,
          });
          break;
        case "Do": {
          const name = args[0];
          if (name?.t !== "name") break;
          const raw = find("XObject", name.v);
          const object = raw instanceof PDFRef ? context.lookup(raw) : raw;
          if (!(object instanceof PDFRawStream)) break;
          const kind = object.dict.lookup(PDFName.of("Subtype"));
          if (kind === PDFName.of("Image")) {
            pictures.push({
              node,
              start: begin,
              end: reader.at,
              ctm: state.ctm,
              clip: state.clip,
              xobject: raw ?? null,
              inline: false,
            });
            break;
          }
          if (kind !== PDFName.of("Form") || depth > 14 || seen.includes(object)) break;
          let bytes: Uint8Array;
          try {
            bytes = streamBytes(object);
          } catch {
            break;
          }
          const own = dictOf(context, object.dict.get(PDFName.of("Resources")));
          const child: StreamNode = {
            bytes,
            resources: own ?? node.resources,
            ownResources: Boolean(own),
            call: { parent: node, name: name.v, start: begin, end: reader.at },
            form: object,
            children: [],
            open: 0,
            extra: 0,
          };
          node.children.push(child);
          const ctm = mul(matrixOf(context, object.dict.get(PDFName.of("Matrix"))), state.ctm);
          const bbox = boxOf(context, object.dict.get(PDFName.of("BBox")));
          const area = bbox ? bounds(corners(ctm, bbox)) : null;
          walk(
            child,
            { ctm, clip: area ? (state.clip ? intersect(state.clip, area) : area) : state.clip, font: state.font },
            depth + 1,
            [...seen, object],
          );
          break;
        }
        default:
          break;
      }
      args = [];
    }
    node.open = stack.length;
  };

  walk(root, { ctm: IDENTITY, clip: null, font: undefined }, 0, []);
  return { root, shows, pictures };
}

// ---------------------------------------------------------------- taking things out

/** What pdf.js worked out about one text operator. */
export type ShowInfo = {
  /** Kerning numbers and glyphs, in the operator's order. */
  items: (number | { w: number; space: boolean })[];
  /** Signed font size. */
  size: number;
  tc: number;
  tw: number;
  vertical: boolean;
};

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/** The operator again without the cut glyphs, leaving the gap they took. */
function rewriteShow(show: Show, info: ShowInfo, cut: (glyph: number) => boolean): string | null {
  const { size } = info;
  if (!size) return null;
  const gap = (glyph: { w: number; space: boolean }) =>
    info.vertical
      ? -(glyph.w - ((info.tc + (glyph.space ? info.tw : 0)) * 1000) / size)
      : -(glyph.w + ((info.tc + (glyph.space ? info.tw : 0)) * 1000) / size);

  const glyphs = info.items.filter((item): item is { w: number; space: boolean } => typeof item !== "number");
  let all = true;
  for (let i = 0; i < glyphs.length; i += 1) {
    if (!cut(i)) {
      all = false;
      break;
    }
  }
  if (all) {
    let total = 0;
    for (const item of info.items) total += typeof item === "number" ? item : gap(item);
    return `${show.lead}[${num(total)}] TJ`;
  }

  const bytes = show.parts.reduce<number>((sum, part) => sum + (typeof part === "number" ? 0 : part.length), 0);
  const per = bytes / Math.max(1, glyphs.length);
  if (per !== 1 && per !== 2) return null;

  const out: string[] = [];
  let kept = "";
  let shift = 0;
  let index = 0;
  const flushShift = () => {
    if (Math.abs(shift) > 1e-6) out.push(num(shift));
    shift = 0;
  };
  const flushKept = () => {
    if (kept) out.push(`<${kept}>`);
    kept = "";
  };
  for (const part of show.parts) {
    if (typeof part === "number") {
      flushKept();
      shift += part;
      continue;
    }
    for (let at = 0; at < part.length; at += per) {
      const glyph = glyphs[index];
      if (cut(index)) {
        flushKept();
        shift += gap(glyph);
      } else {
        if (!kept) flushShift();
        for (let k = 0; k < per; k += 1) kept += HEX[part[at + k]];
      }
      index += 1;
    }
  }
  flushKept();
  flushShift();
  return `${show.lead}[${out.join(" ")}] TJ`;
}

export type Cuts = {
  /** Glyphs to drop, by text operator. */
  text: Map<number, Set<number>>;
  pictures: Set<number>;
};

let names = 0;
export function freshName(dict: PDFDict, prefix: string): PDFName {
  for (;;) {
    names += 1;
    const name = PDFName.of(`${prefix}${names}`);
    if (!dict.has(name)) return name;
  }
}

/** The named part of a resource dictionary, made if missing. */
export function resourceDict(context: PDFContext, resources: PDFDict, kind: string): PDFDict {
  const key = PDFName.of(kind);
  const found = dictOf(context, resources.get(key));
  if (found) return found;
  const made = context.obj({}) as PDFDict;
  resources.set(key, made);
  return made;
}

/** Resources of a page, as a dictionary that belongs to it. */
export function pageResources(page: PDFPage): PDFDict {
  const found = page.node.Resources();
  if (found && page.node.has(PDFName.of("Resources"))) return found;
  const made = found ? found.clone(page.doc.context) : (page.doc.context.obj({}) as PDFDict);
  page.node.set(PDFName.of("Resources"), made);
  return made;
}

const latin = (text: string) => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 255;
  return out;
};

/**
 * The page's own drawing without the cut parts. `infos` must line up with the
 * page's text operators. Operators that could not be cut are reported.
 */
export function cutPage(
  page: PDFPage,
  tree: PageTree,
  infos: readonly ShowInfo[],
  cuts: Cuts,
): { bytes: Uint8Array; failed: Set<number> } {
  const { context } = page.doc;
  const failed = new Set<number>();
  const aligned = infos.length === tree.shows.length;
  if (!aligned) for (const op of cuts.text.keys()) failed.add(op);

  const rebuild = (node: StreamNode): Uint8Array | null => {
    const edits: { start: number; end: number; text: string }[] = [];
    tree.shows.forEach((show, index) => {
      if (show.node !== node) return;
      const set = cuts.text.get(index);
      const info = aligned ? infos[index] : undefined;
      if (!set || !info) return;
      const text = rewriteShow(show, info, (glyph) => set.has(glyph));
      if (text === null) failed.add(index);
      else edits.push({ start: show.start, end: show.end, text });
    });
    tree.pictures.forEach((picture, index) => {
      if (picture.node === node && cuts.pictures.has(index))
        edits.push({ start: picture.start, end: picture.end, text: "" });
    });
    for (const child of node.children) {
      const bytes = rebuild(child);
      if (!bytes || !child.call || !child.form) continue;
      // A form can be drawn in several places, so the changed one is a copy.
      const dict = child.form.dict.clone(context);
      dict.delete(PDFName.of("Filter"));
      dict.delete(PDFName.of("DecodeParms"));
      if (child.ownResources && child.resources) dict.set(PDFName.of("Resources"), child.resources);
      const stream = PDFRawStream.of(dict, bytes);
      dict.set(PDFName.of("Length"), PDFNumber.of(bytes.length));
      const ref = context.register(stream);
      const home = node.resources ?? pageResources(page);
      const xobjects = resourceDict(context, home, "XObject");
      const name = freshName(xobjects, "FbX");
      xobjects.set(name, ref);
      edits.push({ start: child.call.start, end: child.call.end, text: `${name.asString()} Do` });
    }
    if (edits.length === 0) return null;
    edits.sort((a, b) => a.start - b.start);
    const pieces: Uint8Array[] = [];
    let at = 0;
    for (const edit of edits) {
      pieces.push(node.bytes.subarray(at, edit.start), latin(` ${edit.text} `));
      at = edit.end;
    }
    pieces.push(node.bytes.subarray(at));
    const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
    let offset = 0;
    for (const piece of pieces) {
      out.set(piece, offset);
      offset += piece.length;
    }
    return out;
  };

  const bytes = rebuild(tree.root) ?? tree.root.bytes;
  return { bytes, failed };
}

/** Puts drawing on a page: its own, closed off so nothing leaks, then ours. */
export function setContents(page: PDFPage, own: Uint8Array, root: StreamNode, ours: string, compress: boolean) {
  const { context } = page.doc;
  const head = latin("q\n".repeat(1 + root.extra));
  const tail = latin(`\n${"Q ".repeat(1 + root.open)}\n${ours}`);
  const bytes = new Uint8Array(head.length + own.length + tail.length);
  bytes.set(head, 0);
  bytes.set(own, head.length);
  bytes.set(tail, head.length + own.length);
  const stream = compress ? context.flateStream(bytes) : context.stream(bytes);
  page.node.set(PDFName.of("Contents"), context.register(stream));
}
