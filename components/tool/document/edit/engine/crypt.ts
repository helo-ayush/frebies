import { PDFContext, PDFRawStream, decodePDFRawStream } from "pdf-lib";

/**
 * Opens protected PDFs for people who have the password, and protects PDFs.
 * pdf-lib does neither, and it takes object streams apart while they are still
 * scrambled, so the file is read here, byte by byte, and written out anew.
 */

export type LockInfo = {
  /** Cannot even be read without a password. */
  needsPassword: boolean;
  /** Opens without one, but its owner does not allow changes. */
  restricted: boolean;
  method: string;
};

export type Unlocked = {
  bytes: Uint8Array;
  role: "user" | "owner";
  /** The owner lets readers change it. */
  mayChange: boolean;
};

export type Allow = { print: boolean; copy: boolean; change: boolean; comment: boolean; fill: boolean };

// ---------------------------------------------------------------- bytes

function latin(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 255;
  return out;
}

function textOf(b: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let i = from; i < to; i += 1) out += String.fromCharCode(b[i]);
  return out;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const startsWith = (b: Uint8Array, start: Uint8Array, count = start.length): boolean => {
  if (b.length < count) return false;
  for (let i = 0; i < count; i += 1) if (b[i] !== start[i]) return false;
  return true;
};

function matches(b: Uint8Array, at: number, word: string): boolean {
  for (let i = 0; i < word.length; i += 1) if (b[at + i] !== word.charCodeAt(i)) return false;
  return true;
}

function find(b: Uint8Array, word: string, from = 0): number {
  const first = word.charCodeAt(0);
  for (let at = b.indexOf(first, from); at >= 0; at = b.indexOf(first, at + 1)) if (matches(b, at, word)) return at;
  return -1;
}

function findLast(b: Uint8Array, word: string): number {
  const first = word.charCodeAt(0);
  for (let at = b.lastIndexOf(first); at >= 0; at = at === 0 ? -1 : b.lastIndexOf(first, at - 1)) {
    if (matches(b, at, word)) return at;
  }
  return -1;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function hexString(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length * 2 + 2);
  out[0] = 60;
  for (let i = 0; i < data.length; i += 1) {
    const pair = HEX[data[i]];
    out[i * 2 + 1] = pair.charCodeAt(0);
    out[i * 2 + 2] = pair.charCodeAt(1);
  }
  out[out.length - 1] = 62;
  return out;
}

/** A string in round brackets. A bare line break in one may be changed by a reader, so it is spelled out. */
function literalString(data: Uint8Array): Uint8Array {
  const out: number[] = [40];
  for (const c of data) {
    if (c === 40 || c === 41 || c === 92) out.push(92, c);
    else if (c === 13) out.push(92, 114);
    else if (c === 10) out.push(92, 110);
    else out.push(c);
  }
  out.push(41);
  return Uint8Array.from(out);
}

/** Lets the page breathe during long work. */
export function pacer(): () => Promise<void> {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < 24) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    since = performance.now();
  };
}

// ---------------------------------------------------------------- hashes and ciphers

const TURNS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const SINES = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

function md5(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array((((data.length + 8) >> 6) + 1) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (data.length << 3) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(data.length / 2 ** 29), true);
  const sum = Int32Array.of(0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476);
  const w = new Int32Array(16);
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getInt32(at + i * 4, true);
    let [a, b, c, d] = sum;
    for (let i = 0; i < 64; i += 1) {
      let mix: number;
      let pick: number;
      if (i < 16) {
        mix = (b & c) | (~b & d);
        pick = i;
      } else if (i < 32) {
        mix = (d & b) | (~d & c);
        pick = (5 * i + 1) & 15;
      } else if (i < 48) {
        mix = b ^ c ^ d;
        pick = (3 * i + 5) & 15;
      } else {
        mix = c ^ (b | ~d);
        pick = (7 * i) & 15;
      }
      const x = (a + mix + SINES[i] + w[pick]) | 0;
      const turn = TURNS[((i >> 4) << 2) | (i & 3)];
      a = d;
      d = c;
      c = b;
      b = (b + ((x << turn) | (x >>> (32 - turn)))) | 0;
    }
    sum[0] += a;
    sum[1] += b;
    sum[2] += c;
    sum[3] += d;
  }
  const out = new Uint8Array(16);
  const result = new DataView(out.buffer);
  for (let i = 0; i < 4; i += 1) result.setInt32(i * 4, sum[i], true);
  return out;
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) s[i] = i;
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 255;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k += 1) {
    i = (i + 1) & 255;
    const t = s[i];
    j = (j + t) & 255;
    s[i] = s[j];
    s[j] = t;
    out[k] = data[k] ^ s[(s[i] + t) & 255];
  }
  return out;
}

function subtle(): SubtleCrypto {
  const found = globalThis.crypto?.subtle;
  if (!found) throw new Error("Protected files need a secure (https) connection.");
  return found;
}

const NONE = new Uint8Array(0);
const ZERO = new Uint8Array(16);

const random = (count: number) => globalThis.crypto.getRandomValues(new Uint8Array(count));

const sha = async (bits: 256 | 384 | 512, data: Uint8Array) =>
  new Uint8Array(await subtle().digest(`SHA-${bits}`, data));

const aesKey = (raw: Uint8Array) => subtle().importKey("raw", raw, "AES-CBC", false, ["encrypt", "decrypt"]);

const aesEncrypt = async (key: CryptoKey, iv: Uint8Array, data: Uint8Array) =>
  new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv }, key, data));

const aesDecrypt = async (key: CryptoKey, iv: Uint8Array, data: Uint8Array) =>
  new Uint8Array(await subtle().decrypt({ name: "AES-CBC", iv }, key, data));

/** Whole blocks without padding. WebCrypto always pads, so its last block is cut off. */
const aesEncryptRaw = async (key: CryptoKey, iv: Uint8Array, data: Uint8Array) =>
  (await aesEncrypt(key, iv, data)).subarray(0, data.length);

/** Whole blocks without padding: a block that decrypts to padding is put on for WebCrypto to take off. */
async function aesDecryptRaw(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) return NONE;
  const padding = await aesEncrypt(key, data.subarray(data.length - 16), NONE);
  return aesDecrypt(key, iv, join([data, padding]));
}

/** A string or stream: sixteen bytes to start with, then padded blocks. */
async function aesOpen(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  // Too short to have been encrypted at all.
  if (data.length < 16) return data;
  const iv = data.subarray(0, 16);
  const body = data.subarray(16, data.length - (data.length % 16));
  if (body.length === 0) return NONE;
  try {
    return await aesDecrypt(key, iv, body);
  } catch {
    // The padding is wrong in some files. What comes before it is still good.
    return aesDecryptRaw(key, iv, body);
  }
}

async function aesSeal(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = random(16);
  return join([iv, await aesEncrypt(key, iv, data)]);
}

// ---------------------------------------------------------------- PDF syntax

type Span = { s: number; e: number };
type Pair = { key: string; raw: string; value: Node };
/** `broken`: not closed, or with junk in it, so its text cannot be copied as it is. */
type Dict = Span & { t: "dict"; v: Pair[]; broken: boolean };
type List = Span & { t: "arr"; v: Node[]; broken: boolean };
type Str = Span & { t: "str"; v: Uint8Array; hex: boolean };
type Node =
  | Dict
  | List
  | Str
  | (Span & { t: "name"; v: string })
  | (Span & { t: "num"; v: number })
  | (Span & { t: "ref"; n: number; g: number })
  /** true, false, null, and anything that does not belong. */
  | (Span & { t: "word"; v: string })
  /** Text put in here. */
  | (Span & { t: "raw"; v: string });

const PLAIN = 0;
const SPACE = 1;
const MARK = 2;
const KIND = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) KIND[c] = SPACE;
for (const c of "()<>[]{}/%") KIND[c.charCodeAt(0)] = MARK;

const isDigit = (c: number) => c >= 48 && c <= 57;
const hexValue = (c: number) => (isDigit(c) ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);

const nameText = (raw: string) =>
  raw.includes("#")
    ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    : raw;

const get = (dict: Dict, key: string): Node | undefined => {
  // The last one counts when a key is there twice.
  for (let i = dict.v.length - 1; i >= 0; i -= 1) if (dict.v[i].key === key) return dict.v[i].value;
  return undefined;
};
const nameOf = (node: Node | null | undefined) => (node?.t === "name" ? node.v : null);
const numberOf = (node: Node | null | undefined) => (node?.t === "num" ? node.v : null);
const bytesOf = (node: Node | null | undefined) => (node?.t === "str" ? node.v : NONE);
const rawNode = (v: string): Node => ({ t: "raw", v, s: 0, e: 0 });

class Parser {
  constructor(
    readonly b: Uint8Array,
    public at: number,
  ) {}

  skip() {
    const { b } = this;
    for (;;) {
      while (this.at < b.length && KIND[b[this.at]] === SPACE) this.at += 1;
      if (b[this.at] !== 37) return;
      while (this.at < b.length && b[this.at] !== 10 && b[this.at] !== 13) this.at += 1;
    }
  }

  match(word: string): boolean {
    this.skip();
    if (!matches(this.b, this.at, word)) return false;
    this.at += word.length;
    return true;
  }

  /** A whole number, or -1 when there is none. */
  int(): number {
    this.skip();
    const from = this.at;
    let value = 0;
    while (isDigit(this.b[this.at])) {
      value = value * 10 + this.b[this.at] - 48;
      this.at += 1;
    }
    return this.at > from ? value : -1;
  }

  /** Reads "12 0 obj". */
  header(): { num: number; gen: number } | null {
    const num = this.int();
    const gen = num < 0 ? -1 : this.int();
    return gen >= 0 && this.match("obj") ? { num, gen } : null;
  }

  /** Right after a dictionary: where the data of its stream starts, or -1. */
  stream(): number {
    if (!this.match("stream")) return -1;
    const { b } = this;
    let at = this.at;
    while (b[at] === 32 || b[at] === 9) at += 1;
    if (b[at] === 13) this.at = b[at + 1] === 10 ? at + 2 : at + 1;
    else if (b[at] === 10) this.at = at + 1;
    return this.at;
  }

  private word(): string {
    const from = this.at;
    while (this.at < this.b.length && KIND[this.b[this.at]] === PLAIN) this.at += 1;
    return textOf(this.b, from, this.at);
  }

  /** The next value. Null at the end. */
  value(depth = 0): Node | null {
    this.skip();
    const { b } = this;
    const s = this.at;
    if (s >= b.length) return null;
    if (depth > 300) throw new Error("This PDF is nested too deeply.");
    const c = b[s];
    if (c === 47) {
      this.at += 1;
      const v = nameText(this.word());
      return { t: "name", v, s, e: this.at };
    }
    if (c === 40) {
      const v = this.literal();
      return { t: "str", v, hex: false, s, e: this.at };
    }
    if (c === 60) {
      if (b[s + 1] === 60) return this.dict(depth);
      const v = this.hex();
      return { t: "str", v, hex: true, s, e: this.at };
    }
    if (c === 91) return this.list(depth);
    if (isDigit(c) || c === 43 || c === 45 || c === 46) return this.number();
    if (KIND[c] === MARK) {
      this.at += 1;
      return { t: "word", v: String.fromCharCode(c), s, e: this.at };
    }
    const v = this.word();
    return { t: "word", v, s, e: this.at };
  }

  private number(): Node {
    const { b } = this;
    const s = this.at;
    let whole = true;
    for (; this.at < b.length; this.at += 1) {
      const c = b[this.at];
      if (isDigit(c)) continue;
      if (c !== 43 && c !== 45 && c !== 46) break;
      whole = false;
    }
    const e = this.at;
    const v = parseFloat(textOf(b, s, e)) || 0;
    if (whole) {
      const g = this.int();
      if (g >= 0) {
        this.skip();
        if (b[this.at] === 82 && (this.at + 1 >= b.length || KIND[b[this.at + 1]] !== PLAIN)) {
          this.at += 1;
          return { t: "ref", n: v, g, s, e: this.at };
        }
      }
      this.at = e;
    }
    return { t: "num", v, s, e };
  }

  private literal(): Uint8Array {
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

  private hex(): Uint8Array {
    const { b } = this;
    const out: number[] = [];
    let high = -1;
    this.at += 1;
    while (this.at < b.length) {
      const c = b[this.at++];
      if (c === 62) break;
      const v = hexValue(c);
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

  private list(depth: number): List {
    const { b } = this;
    const s = this.at;
    const v: Node[] = [];
    this.at += 1;
    for (;;) {
      this.skip();
      if (b[this.at] === 93) {
        this.at += 1;
        return { t: "arr", v, s, e: this.at, broken: false };
      }
      const item = this.value(depth + 1);
      if (item?.t === "word" && (item.v === "endobj" || item.v === ">")) this.at = item.s;
      if (!item || this.at === item.s) return { t: "arr", v, s, e: this.at, broken: true };
      v.push(item);
    }
  }

  private dict(depth: number): Dict {
    const { b } = this;
    const s = this.at;
    const v: Pair[] = [];
    let broken = false;
    this.at += 2;
    for (;;) {
      this.skip();
      if (b[this.at] === 62 && b[this.at + 1] === 62) {
        this.at += 2;
        return { t: "dict", v, s, e: this.at, broken };
      }
      if (b[this.at] !== 47) {
        // Not a key. Stepped over, unless the dictionary was never closed.
        broken = true;
        const junk = this.value(depth + 1);
        if (junk?.t === "word" && (junk.v === "endobj" || junk.v === "stream")) this.at = junk.s;
        if (!junk || this.at === junk.s) return { t: "dict", v, s, e: this.at, broken };
        continue;
      }
      this.at += 1;
      const raw = this.word();
      this.skip();
      if (b[this.at] === 62 && b[this.at + 1] === 62) {
        broken = true;
        continue;
      }
      const value = this.value(depth + 1);
      if (value?.t === "word" && value.v === "endobj") this.at = value.s;
      if (!value || this.at === value.s) return { t: "dict", v, s, e: this.at, broken: true };
      v.push({ key: nameText(raw), raw, value });
    }
  }
}

// ---------------------------------------------------------------- filters

/** Takes the prediction of PNG and TIFF off, which pdf-lib leaves on. */
export function unpredict(
  data: Uint8Array,
  predictor: number,
  colors: number,
  bits: number,
  columns: number,
): Uint8Array {
  if (predictor < 2) return data;
  const step = Math.max(1, (colors * bits + 7) >> 3);
  const row = (columns * colors * bits + 7) >> 3;
  if (row <= 0) return data;
  if (predictor === 2) {
    const out = data.slice();
    for (let from = 0; from < out.length; from += row) {
      const end = Math.min(out.length, from + row);
      if (bits === 8) for (let i = from + colors; i < end; i += 1) out[i] += out[i - colors];
      else if (bits === 16) {
        for (let i = from + colors * 2; i + 1 < end; i += 2) {
          const sum = (out[i] << 8) + out[i + 1] + (out[i - colors * 2] << 8) + out[i - colors * 2 + 1];
          out[i] = sum >> 8;
          out[i + 1] = sum;
        }
      } else {
        const mask = (1 << bits) - 1;
        const last = new Uint8Array(colors);
        for (let x = 0; x < columns * colors; x += 1) {
          const at = from + ((x * bits) >> 3);
          if (at >= end) break;
          const shift = 8 - bits - ((x * bits) & 7);
          const value = (((out[at] >> shift) & mask) + last[x % colors]) & mask;
          last[x % colors] = value;
          out[at] = (out[at] & ~(mask << shift)) | (value << shift);
        }
      }
    }
    return out;
  }
  const rows = Math.ceil(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  let length = 0;
  for (let y = 0; y < rows; y += 1) {
    const from = y * (row + 1);
    const kind = data[from];
    const count = Math.min(row, data.length - from - 1);
    const to = y * row;
    for (let x = 0; x < count; x += 1) {
      const left = x >= step ? out[to + x - step] : 0;
      const up = y > 0 ? out[to + x - row] : 0;
      let guess = 0;
      if (kind === 1) guess = left;
      else if (kind === 2) guess = up;
      else if (kind === 3) guess = (left + up) >> 1;
      else if (kind === 4) {
        const corner = x >= step && y > 0 ? out[to + x - row - step] : 0;
        const p = left + up - corner;
        const pl = Math.abs(p - left);
        const pu = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        guess = pl <= pu && pl <= pc ? left : pu <= pc ? up : corner;
      }
      out[to + x] = data[from + 1 + x] + guess;
    }
    length += Math.max(0, count);
  }
  return out.subarray(0, length);
}

type Filter = { name: string; parms: Dict | null };

const scratch = PDFContext.create();

function unfilter(data: Uint8Array, filters: readonly Filter[]): Uint8Array {
  let out = data;
  for (const { name, parms } of filters) {
    if (name === "Crypt") continue;
    const n = (key: string, normal: number) => (parms ? (numberOf(get(parms, key)) ?? normal) : normal);
    const dict = scratch.obj({ Filter: name, DecodeParms: { EarlyChange: n("EarlyChange", 1) } });
    out = decodePDFRawStream(PDFRawStream.of(dict, out)).decode();
    if (name === "FlateDecode" || name === "LZWDecode")
      out = unpredict(out, n("Predictor", 1), n("Colors", 1), n("BitsPerComponent", 8), n("Columns", 1));
  }
  return out;
}

// ---------------------------------------------------------------- the file

/** Where an object is: at a place in the file, or the nth of an object stream. Null when it was deleted. */
type Entry = { at: number } | { home: number; index: number } | null;

type Item = {
  num: number;
  gen: number;
  /** What the node's positions refer to. */
  b: Uint8Array;
  node: Node;
  /** A stream's data as it is in the file. */
  data: Uint8Array | null;
  /** Out of an object stream, so encrypted with it and not by itself. */
  packed: boolean;
};

type Box = { b: Uint8Array; list: { num: number; at: number }[] };
/** What is in the file: where each object starts, which ones matter, and the trailers from the last one on. */
type Found = { objects: Map<number, number>; boxes: number[]; catalogs: number[]; trailers: Dict[] };

const WINDOW = 1 << 16;

class PdfFile {
  readonly entries = new Map<number, Entry>();
  readonly trailer = new Map<string, Node>();
  /** Opens object streams. Null while the file is locked, or when it has no lock. */
  open: ((data: Uint8Array, item: Item) => Promise<Uint8Array>) | null = null;

  /** Offsets count from the header, which some files have junk in front of. */
  private base: number;
  private found: Found | null = null;
  private rebuilt = false;
  private boxes = new Map<number, Promise<Box | null>>();

  constructor(readonly b: Uint8Array) {
    this.base = Math.max(0, find(b.subarray(0, 1024), "%PDF-"));
    const word = findLast(b, "startxref");
    const start = word < 0 ? -1 : new Parser(b, word + 9).int();
    const queue = start > 0 ? [start] : [];
    const seen = new Set<number>();
    let whole = queue.length > 0;
    for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
      if (seen.has(at)) continue;
      seen.add(at);
      if (!this.section(at, queue)) whole = false;
    }
    if (!whole || !this.trailer.has("Root")) this.rebuild();
  }

  get version(): string {
    return /^%PDF-(\d\.\d)/.exec(textOf(this.b, this.base, this.base + 8))?.[1] ?? "1.7";
  }

  // -------------------------------------------------------------- table of contents

  private add(num: number, entry: Entry) {
    // Sections are read from the newest to the oldest.
    if (!this.entries.has(num)) this.entries.set(num, entry);
  }

  private learn(dict: Dict) {
    for (const { key, value } of dict.v) if (!this.trailer.has(key)) this.trailer.set(key, value);
  }

  private section(start: number, queue: number[]): boolean {
    for (const at of new Set([start, start + this.base])) {
      const parser = new Parser(this.b, at);
      try {
        if (parser.match("xref")) return this.table(parser, queue);
        if (!parser.header()) continue;
        const dict = parser.value();
        if (dict?.t === "dict" && nameOf(get(dict, "Type")) === "XRef") return this.xrefStream(parser, dict, queue);
      } catch {
        return false;
      }
    }
    return false;
  }

  private table(parser: Parser, queue: number[]): boolean {
    const free: number[] = [];
    for (;;) {
      let first = parser.int();
      if (first < 0) break;
      const count = parser.int();
      for (let i = 0; i < count; i += 1) {
        const mark = parser.at;
        const at = parser.int();
        const gen = parser.int();
        parser.skip();
        const kind = this.b[parser.at];
        if (at < 0 || gen < 0 || (kind !== 110 && kind !== 102)) {
          parser.at = mark;
          break;
        }
        parser.at += 1;
        // A common mistake: counting from one.
        if (i === 0 && first === 1 && kind === 102 && gen === 65535) first = 0;
        if (kind === 102) free.push(first + i);
        else this.add(first + i, { at });
      }
    }
    const dict = parser.match("trailer") ? parser.value() : null;
    if (dict?.t !== "dict") return false;
    this.learn(dict);
    // Objects that are "free" here can still be listed in the stream beside it.
    const beside = numberOf(get(dict, "XRefStm"));
    if (beside !== null) this.section(beside, []);
    for (const num of free) this.add(num, null);
    const before = numberOf(get(dict, "Prev"));
    if (before !== null) queue.push(before);
    return true;
  }

  private xrefStream(parser: Parser, dict: Dict, queue: number[]): boolean {
    const start = parser.stream();
    const widths = get(dict, "W");
    if (start < 0 || widths?.t !== "arr") return false;
    const filters: Filter[] = [];
    const names = get(dict, "Filter");
    const parms = get(dict, "DecodeParms");
    for (const [i, node] of (names?.t === "arr" ? names.v : names ? [names] : []).entries()) {
      const own = parms?.t === "arr" ? parms.v[i] : parms;
      filters.push({ name: nameOf(node) ?? "", parms: own?.t === "dict" ? own : null });
    }
    const data = unfilter(this.slice(start, numberOf(get(dict, "Length"))), filters);
    const [w0, w1, w2] = [0, 1, 2].map((i) => numberOf(widths.v[i]) ?? 0);
    if (w0 < 0 || w1 < 1 || w2 < 0) return false;
    const index = get(dict, "Index");
    const ranges =
      index?.t === "arr" ? index.v.map((node) => numberOf(node) ?? 0) : [0, numberOf(get(dict, "Size")) ?? 0];
    let at = 0;
    const field = (width: number, normal: number) => {
      if (width === 0) return normal;
      let value = 0;
      for (let i = 0; i < width; i += 1) value = value * 256 + data[at++];
      return value;
    };
    for (let r = 0; r + 1 < ranges.length; r += 2) {
      for (let i = 0; i < ranges[r + 1] && at + w0 + w1 + w2 <= data.length; i += 1) {
        const kind = field(w0, 1);
        const a = field(w1, 0);
        const b = field(w2, 0);
        this.add(ranges[r] + i, kind === 1 ? { at: a } : kind === 2 ? { home: a, index: b } : null);
      }
    }
    this.learn(dict);
    const before = numberOf(get(dict, "Prev"));
    if (before !== null) queue.push(before);
    return true;
  }

  /** Every object in the file, whatever its table of contents says. Of two with one number the later counts. */
  private scan(): Found {
    if (this.found) return this.found;
    const { b } = this;
    const found: Found = { objects: new Map(), boxes: [], catalogs: [], trailers: [] };
    const starts: { num: number; from: number; after: number }[] = [];
    for (let at = find(b, "obj"); at >= 0; at = find(b, "obj", at + 3)) {
      let from = at;
      const back = (test: (c: number) => boolean) => {
        const end = from;
        while (from > 0 && test(b[from - 1])) from -= 1;
        return from < end;
      };
      const space = (c: number) => KIND[c] === SPACE;
      if (!back(space) || !back(isDigit) || !back(space) || !back(isDigit)) continue;
      starts.push({ num: new Parser(b, from).int(), from, after: at + 3 });
    }
    /** What is there, but no further than the next one: something left open would run on to the end of the file. */
    const look = (at: number, next: number): { dict: Dict; parser: Parser } | null => {
      const parser = new Parser(b.subarray(0, Math.min(next, at + WINDOW)), at);
      try {
        const dict = parser.value();
        return dict?.t === "dict" ? { dict, parser } : null;
      } catch {
        return null;
      }
    };
    let past = 0;
    starts.forEach(({ num, from, after }, i) => {
      // In the data of a stream, which may well be another PDF.
      if (from < past) return;
      found.objects.set(num, from);
      const seen = look(after, starts[i + 1]?.from ?? b.length);
      if (!seen) return;
      const type = nameOf(get(seen.dict, "Type"));
      if (type === "Catalog") found.catalogs.push(num);
      const data = seen.parser.stream();
      if (data < 0) return;
      if (type === "ObjStm") found.boxes.push(num);
      if (type === "XRef") found.trailers.push(seen.dict);
      const length = numberOf(get(seen.dict, "Length"));
      if (length !== null && this.endsAt(data + length)) past = data + length;
    });
    for (let at = find(b, "trailer"); at >= 0;) {
      const next = find(b, "trailer", at + 7);
      const seen = look(at + 7, next < 0 ? b.length : next);
      if (seen) found.trailers.push(seen.dict);
      at = next;
    }
    found.trailers.sort((one, other) => other.s - one.s);
    this.found = found;
    return found;
  }

  private rebuild() {
    const found = this.scan();
    this.rebuilt = true;
    this.entries.clear();
    this.trailer.clear();
    this.boxes.clear();
    for (const [num, at] of found.objects) this.entries.set(num, { at });
    for (const dict of found.trailers) this.learn(dict);
  }

  /** Called once the lock is off: makes sure the pages can be reached. */
  async settle() {
    const root = this.trailer.get("Root");
    const catalog = root?.t === "ref" ? await this.get(root.n) : null;
    const pages = catalog?.node.t === "dict" ? await this.follow(get(catalog.node, "Pages")) : null;
    if (pages?.t === "dict" && !this.rebuilt) return;
    if (!this.rebuilt) this.rebuild();
    const { objects, boxes, catalogs } = this.scan();
    const maybe = [...catalogs];
    for (const home of new Set(boxes)) {
      const place = this.entries.get(home);
      const box = await this.box(home);
      if (!box || !place || !("at" in place)) continue;
      box.list.forEach(({ num }, index) => {
        const old = this.entries.get(num);
        const before = old ? ("at" in old ? old.at : objects.get(old.home)) : undefined;
        if (before !== undefined && before > place.at) return;
        this.entries.set(num, { home, index });
        maybe.push(num);
      });
    }
    if ((await this.follow(this.trailer.get("Root")))?.t === "dict") return;
    for (const num of maybe.reverse()) {
      const item = await this.get(num);
      if (item?.node.t !== "dict" || nameOf(get(item.node, "Type")) !== "Catalog") continue;
      this.trailer.set("Root", { t: "ref", n: num, g: item.gen, s: 0, e: 0 });
      return;
    }
    throw new Error("This PDF is damaged.");
  }

  // -------------------------------------------------------------- objects

  private endsAt(at: number): boolean {
    const { b } = this;
    if (at > b.length) return false;
    let end = at;
    while (KIND[b[end]] === SPACE) end += 1;
    return matches(b, end, "endstream");
  }

  /** The data of a stream. A wrong length is made good by looking for the end. */
  private slice(start: number, length: number | null): Uint8Array {
    const { b } = this;
    if (length !== null && length >= 0 && this.endsAt(start + length)) return b.subarray(start, start + length);
    let end = find(b, "endstream", start);
    if (end < 0) end = find(b, "endobj", start);
    if (end < 0) end = b.length;
    let trimmed = end;
    if (trimmed > start && b[trimmed - 1] === 10) trimmed -= 1;
    if (trimmed > start && b[trimmed - 1] === 13) trimmed -= 1;
    // Without a line break before the end word, the last byte may only look like one.
    return b.subarray(start, (end - start) % 16 === 0 && (trimmed - start) % 16 !== 0 ? end : trimmed);
  }

  /** Reads an object that is in the file itself, up to where its stream starts. */
  private place(num: number, at: number): { gen: number; node: Node; parser: Parser } | null {
    for (const look of [() => at, () => at + this.base, () => this.scan().objects.get(num)]) {
      const start = look();
      if (start === undefined) continue;
      const parser = new Parser(this.b, start);
      const head = parser.header();
      if (head?.num !== num) continue;
      const node = parser.value();
      return node && { gen: head.gen, node, parser };
    }
    return null;
  }

  private async plain(num: number, at: number, inner: boolean): Promise<Item | null> {
    const found = this.place(num, at);
    if (!found) return null;
    const { gen, node, parser } = found;
    const from = node.t === "dict" ? parser.stream() : -1;
    const length = node.t === "dict" && from >= 0 ? await this.follow(get(node, "Length"), inner) : null;
    return { num, gen, b: this.b, node, data: from < 0 ? null : this.slice(from, numberOf(length)), packed: false };
  }

  private async packed(num: number, entry: { home: number; index: number }): Promise<Item | null> {
    const box = await this.box(entry.home);
    if (!box) return null;
    const place = box.list[entry.index]?.num === num ? box.list[entry.index] : box.list.find((it) => it.num === num);
    const node = place ? new Parser(box.b, place.at).value() : null;
    return node && { num, gen: 0, b: box.b, node, data: null, packed: true };
  }

  async get(num: number): Promise<Item | null> {
    const entry = this.entries.get(num);
    if (!entry) return null;
    try {
      return "at" in entry ? await this.plain(num, entry.at, true) : await this.packed(num, entry);
    } catch {
      return null;
    }
  }

  /**
   * The value itself, when it is elsewhere in the file. Of a stream its dictionary only, so nothing ends up waiting
   * for itself. Not `inner`: what lies in object streams is not looked at, because one is being opened.
   */
  async follow(node: Node | undefined, inner = true): Promise<Node | null> {
    let value = node ?? null;
    for (let i = 0; i < 8 && value?.t === "ref"; i += 1) {
      const entry = this.entries.get(value.n);
      try {
        if (!entry) value = null;
        else if ("at" in entry) value = this.place(value.n, entry.at)?.node ?? null;
        else value = inner ? ((await this.packed(value.n, entry))?.node ?? null) : null;
      } catch {
        value = null;
      }
    }
    return value?.t === "ref" ? null : value;
  }

  async filters(dict: Dict, inner = true): Promise<Filter[]> {
    const names = await this.follow(get(dict, "Filter"), inner);
    const parms = await this.follow(get(dict, "DecodeParms"), inner);
    const out: Filter[] = [];
    for (const [i, node] of (names?.t === "arr" ? names.v : names ? [names] : []).entries()) {
      const own = await this.follow(parms?.t === "arr" ? parms.v[i] : (parms ?? undefined), inner);
      out.push({ name: nameOf(await this.follow(node, inner)) ?? "", parms: own?.t === "dict" ? own : null });
    }
    return out;
  }

  private box(home: number): Promise<Box | null> {
    let job = this.boxes.get(home);
    if (!job) this.boxes.set(home, (job = this.unpack(home).catch(() => null)));
    return job;
  }

  private async unpack(home: number): Promise<Box | null> {
    const entry = this.entries.get(home);
    const item = entry && "at" in entry ? await this.plain(home, entry.at, false) : null;
    if (!item?.data || item.node.t !== "dict" || nameOf(get(item.node, "Type")) !== "ObjStm") return null;
    const data = this.open ? await this.open(item.data, item) : item.data;
    const b = unfilter(data, await this.filters(item.node, false));
    const count = numberOf(await this.follow(get(item.node, "N"), false)) ?? 0;
    const first = numberOf(await this.follow(get(item.node, "First"), false)) ?? 0;
    const parser = new Parser(b, 0);
    const list: Box["list"] = [];
    for (let i = 0; i < count; i += 1) {
      const num = parser.int();
      const at = parser.int();
      if (num < 0 || at < 0) break;
      list.push({ num, at: first + at });
    }
    return { b, list };
  }
}

// ---------------------------------------------------------------- the lock

type Method = "none" | "rc4" | "aes" | "aes256";
const METHODS: Partial<Record<string, Method>> = { V2: "rc4", AESV2: "aes", AESV3: "aes256" };

type Lock = {
  v: number;
  r: number;
  p: number;
  /** Lengths the key may have, in bytes, the likely one first. */
  sizes: number[];
  o: Uint8Array;
  u: Uint8Array;
  oe: Uint8Array;
  ue: Uint8Array;
  perms: Uint8Array;
  id: Uint8Array;
  metadata: boolean;
  streams: Method;
  strings: Method;
  named: Map<string, Method>;
  label: string;
};

class UnknownLock extends Error {
  constructor(readonly label: string) {
    super("This PDF is protected in a way that cannot be opened here.");
  }
}

const sized = (data: Uint8Array, size: number) => {
  const out = new Uint8Array(size);
  out.set(data.subarray(0, size));
  return out;
};

async function readLock(file: PdfFile): Promise<Lock | null> {
  const place = file.trailer.get("Encrypt");
  if (!place || (place.t === "word" && place.v === "null")) return null;
  const dict = await file.follow(place);
  if (dict?.t !== "dict") throw new UnknownLock("Unknown");
  const read = (key: string) => file.follow(get(dict, key));
  const filter = nameOf(await read("Filter"));
  if (filter !== null && filter !== "Standard")
    throw new UnknownLock(/pub/i.test(filter) ? "Certificate" : filter || "Unknown");
  const v = numberOf(await read("V")) ?? 0;
  const r = numberOf(await read("R")) ?? 0;
  const length = numberOf(await read("Length"));
  const id = await file.follow(file.trailer.get("ID"));
  const strings = r >= 5 ? 48 : 32;
  const lock: Lock = {
    v,
    r,
    p: (numberOf(await read("P")) ?? 0) | 0,
    sizes: [],
    o: sized(bytesOf(await read("O")), strings),
    u: sized(bytesOf(await read("U")), strings),
    oe: sized(bytesOf(await read("OE")), 32),
    ue: sized(bytesOf(await read("UE")), 32),
    perms: sized(bytesOf(await read("Perms")), 16),
    id: id?.t === "arr" ? bytesOf(await file.follow(id.v[0])) : NONE,
    metadata: true,
    streams: "rc4",
    strings: "rc4",
    named: new Map(),
    label: "Unknown",
  };
  const known =
    v === 1 || v === 2 ? r === 2 || r === 3 || r === 4 : v === 4 ? r === 4 : v === 5 ? r === 5 || r === 6 : false;
  if (!known) throw new UnknownLock(`V${v} R${r}`);

  const bits: number[] = [];
  if (v === 1 || r === 2 || (v === 2 && length === null)) bits.push(40);
  if (v === 4) bits.push(128);
  if (length !== null) bits.push(length);
  if (v >= 4) {
    const metadata = await read("EncryptMetadata");
    lock.metadata = !(metadata?.t === "word" && metadata.v === "false");
    const filters = await read("CF");
    for (const pair of filters?.t === "dict" ? filters.v : []) {
      const own = await file.follow(pair.value);
      if (own?.t !== "dict") continue;
      const kind = nameOf(await file.follow(get(own, "CFM")));
      lock.named.set(pair.key, METHODS[kind ?? ""] ?? "none");
      const size = numberOf(await file.follow(get(own, "Length")));
      // In bytes by the book, in bits in many files.
      if (size !== null) bits.push(size < 40 ? size * 8 : size);
    }
    lock.named.set("Identity", "none");
    lock.streams = lock.named.get(nameOf(await read("StmF")) ?? "Identity") ?? "none";
    lock.strings = lock.named.get(nameOf(await read("StrF")) ?? "Identity") ?? "none";
  }
  bits.push(v === 1 ? 40 : 128, 40);
  lock.sizes = [...new Set(bits)].filter((n) => n >= 40 && n <= 128 && n % 8 === 0).map((n) => n / 8);

  const all = [lock.streams, lock.strings, ...lock.named.values()];
  const method = all.find((one) => one !== "none") ?? "none";
  lock.label = { none: "None", rc4: `RC4-${lock.sizes[0] * 8}`, aes: "AES-128", aes256: "AES-256" }[method];
  return lock;
}

// ---------------------------------------------------------------- passwords

const PADDING = Uint8Array.of(
  ...[0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08],
  ...[0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a],
);

/** Characters of PDFDocEncoding that are not where Latin-1 has them. */
const DOC_ENCODING = new Map<string, number>([
  ...[..."\u02d8\u02c7\u02c6\u02d9\u02dd\u02db\u02da\u02dc"].map((ch, i): [string, number] => [ch, 0x18 + i]),
  ...[
    ..."\u2022\u2020\u2021\u2026\u2014\u2013\u0192\u2044\u2039\u203a\u2212\u2030\u201e\u201c\u201d\u2018\u2019\u201a",
    ..."\u2122\ufb01\ufb02\u0141\u0152\u0160\u0178\u017d\u0131\u0142\u0153\u0161\u017e",
  ].map((ch, i): [string, number] => [ch, 0x80 + i]),
  ["\u20ac", 0xa0],
]);

/** Windows-1252 from 0x80 on, which careless programs use instead. */
const WINDOWS = [
  ..."\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f",
  ..."\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178",
];

const utf8 = (text: string) => new TextEncoder().encode(text);

function docEncoded(password: string): Uint8Array | null {
  const out: number[] = [];
  for (const ch of password) {
    const point = ch.codePointAt(0) ?? 0;
    const special = DOC_ENCODING.get(ch);
    if (special !== undefined) out.push(special);
    else if (point < 0x80 || (point > 0xa0 && point <= 0xff)) out.push(point);
    else return null;
  }
  return Uint8Array.from(out);
}

function windowsEncoded(password: string): Uint8Array | null {
  const out: number[] = [];
  for (const ch of password) {
    const point = ch.codePointAt(0) ?? 0;
    const special = WINDOWS.indexOf(ch);
    if (special >= 0) out.push(0x80 + special);
    else if (point <= 0xff) out.push(point);
    else return null;
  }
  return Uint8Array.from(out);
}

/** One spelling for what looks the same (SASLprep). */
const prepared = (password: string) =>
  password
    .replace(/[\u00ad\u034f\u1806\u180b-\u180d\u200b-\u200d\u2060\ufe00-\ufe0f\ufeff]/g, "")
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .normalize("NFKC");

const modern = (text: string) => utf8(text).subarray(0, 127);

/** The bytes a password may stand for, the proper spelling first. */
function spellings(password: string, r: number): Uint8Array[] {
  const all =
    r >= 5
      ? [modern(prepared(password)), modern(password), modern(password.normalize("NFC"))]
      : [docEncoded(password), windowsEncoded(password), utf8(password)];
  const seen = new Set<string>();
  return all.filter((bytes): bytes is Uint8Array => {
    if (!bytes || seen.has(bytes.join())) return false;
    seen.add(bytes.join());
    return true;
  });
}

const padded = (password: Uint8Array) => join([password, PADDING]).subarray(0, 32);

function legacyKey(lock: Lock, password: Uint8Array, size: number): Uint8Array {
  const p = Uint8Array.of(lock.p, lock.p >> 8, lock.p >> 16, lock.p >> 24);
  const tail = lock.r >= 4 && !lock.metadata ? Uint8Array.of(255, 255, 255, 255) : NONE;
  let key = md5(join([padded(password), lock.o, p, lock.id, tail]));
  if (lock.r >= 3) for (let i = 0; i < 50; i += 1) key = md5(key.subarray(0, size));
  return key.subarray(0, size);
}

const keyTurned = (key: Uint8Array, by: number) => key.map((c) => c ^ by);

function legacyUser(lock: Lock, password: Uint8Array, size: number): Uint8Array | null {
  const key = legacyKey(lock, password, size);
  if (lock.r === 2) return startsWith(rc4(key, PADDING), lock.u, 32) ? key : null;
  let check = md5(join([PADDING, lock.id]));
  for (let i = 0; i < 20; i += 1) check = rc4(keyTurned(key, i), check);
  return startsWith(check, lock.u, 16) ? key : null;
}

/** The owner's password only hides the user's: what it uncovers is tried as that. */
function legacyOwner(lock: Lock, password: Uint8Array, size: number): Uint8Array | null {
  let key = md5(padded(password));
  if (lock.r >= 3) for (let i = 0; i < 50; i += 1) key = md5(key);
  key = key.subarray(0, size);
  let user = lock.o;
  for (let i = lock.r === 2 ? 0 : 19; i >= 0; i -= 1) user = rc4(keyTurned(key, i), user);
  return legacyUser(lock, user, size);
}

/** The slow hash of PDF 2.0, or the quick one it replaced. */
async function hardHash(r: number, password: Uint8Array, salt: Uint8Array, extra: Uint8Array): Promise<Uint8Array> {
  let key = await sha(256, join([password, salt, extra]));
  if (r < 6) return key;
  for (let round = 1; ; round += 1) {
    const once = join([password, key, extra]);
    const many = new Uint8Array(once.length * 64);
    for (let i = 0; i < 64; i += 1) many.set(once, i * once.length);
    const mixed = await aesEncryptRaw(await aesKey(key.subarray(0, 16)), key.subarray(16, 32), many);
    let sum = 0;
    for (let i = 0; i < 16; i += 1) sum += mixed[i];
    key = await sha(([256, 384, 512] as const)[sum % 3], mixed);
    if (round >= 64 && mixed[mixed.length - 1] <= round - 32) return key.subarray(0, 32);
  }
}

async function modernKey(lock: Lock, password: Uint8Array, role: "user" | "owner"): Promise<Uint8Array | null> {
  const check = role === "user" ? lock.u : lock.o;
  const extra = role === "user" ? NONE : lock.u;
  if (!startsWith(await hardHash(lock.r, password, check.subarray(32, 40), extra), check, 32)) return null;
  const key = await aesKey(await hardHash(lock.r, password, check.subarray(40, 48), extra));
  return aesDecryptRaw(key, ZERO, role === "user" ? lock.ue : lock.oe);
}

type Pass = { key: Uint8Array; role: "user" | "owner" };

async function tryPassword(lock: Lock, password: string): Promise<Pass | null> {
  // Without a password one is a reader at most, even where the owner's was left empty.
  const roles = password === "" ? (["user"] as const) : (["owner", "user"] as const);
  for (const role of roles) {
    for (const bytes of spellings(password, lock.r)) {
      if (lock.r >= 5) {
        const key = await modernKey(lock, bytes, role);
        if (key) return { key, role };
        continue;
      }
      for (const size of lock.sizes) {
        const key = (role === "user" ? legacyUser : legacyOwner)(lock, bytes, size);
        if (key) return { key, role };
      }
    }
  }
  return null;
}

const MAY_CHANGE = 8;

async function mayChange(lock: Lock, pass: Pass): Promise<boolean> {
  if (pass.role === "owner") return true;
  if (lock.r < 5) return (lock.p & MAY_CHANGE) !== 0;
  // The permissions are there twice, once where they cannot be changed unseen.
  const sealed = await aesDecryptRaw(await aesKey(pass.key), ZERO, lock.perms);
  const p = textOf(sealed, 9, 12) === "adb" ? lock.p & sealed[0] : lock.p;
  return (p & MAY_CHANGE) !== 0;
}

// ---------------------------------------------------------------- opening what is encrypted

function objectKey(key: Uint8Array, num: number, gen: number, aes: boolean): Uint8Array {
  const own = Uint8Array.of(num, num >> 8, num >> 16, gen, gen >> 8);
  return md5(join(aes ? [key, own, latin("sAlT")] : [key, own])).subarray(0, Math.min(16, key.length + 5));
}

/** Whether a metadata stream was left readable, which some programs do without saying so. */
const isPlainXml = (data: Uint8Array) => /^(\xef\xbb\xbf)?\s*<[?xr]/.test(textOf(data, 0, Math.min(16, data.length)));
const isPlainFlate = (data: Uint8Array) => data[0] === 0x78 && ((data[0] << 8) | data[1]) % 31 === 0;

class Opener {
  private rest = pacer();
  private whole: Promise<CryptoKey> | null = null;
  private own: { num: number; gen: number; key: Promise<CryptoKey> } | null = null;

  constructor(
    readonly file: PdfFile,
    readonly lock: Lock,
    readonly key: Uint8Array,
    /** The document's own metadata. */
    readonly metadata: number,
  ) {}

  private aesKey(num: number, gen: number): Promise<CryptoKey> {
    if (this.own?.num !== num || this.own.gen !== gen)
      this.own = { num, gen, key: aesKey(objectKey(this.key, num, gen, true)) };
    return this.own.key;
  }

  private async run(method: Method, data: Uint8Array, { num, gen }: Item): Promise<Uint8Array> {
    if (method === "none") return data;
    if (method === "rc4") {
      if (data.length > 50_000) await this.rest();
      return rc4(objectKey(this.key, num, gen, false), data);
    }
    const key = method === "aes" ? this.aesKey(num, gen) : (this.whole ??= aesKey(this.key));
    return aesOpen(await key, data);
  }

  text(data: Uint8Array, item: Item): Promise<Uint8Array> {
    return this.run(this.lock.strings, data, item);
  }

  async data(data: Uint8Array, item: Item): Promise<Uint8Array> {
    if (item.node.t !== "dict") return data;
    const type = nameOf(get(item.node, "Type"));
    const inner = type !== "ObjStm";
    let method = this.lock.streams;
    const filters = await this.file.filters(item.node, inner);
    const own = filters.find((filter) => filter.name === "Crypt");
    if (own && this.lock.v >= 4) {
      const name = own.parms ? nameOf(await this.file.follow(get(own.parms, "Name"), inner)) : null;
      method = this.lock.named.get(name ?? "Identity") ?? "none";
    } else if (type === "Metadata") {
      const open = !this.lock.metadata;
      if (open && item.num === this.metadata) method = "none";
      else if (filters.length === 0 && isPlainXml(data)) method = "none";
      else if (open && filters[0]?.name === "FlateDecode" && isPlainFlate(data)) method = "none";
    }
    return this.run(method, data, item);
  }
}

// ---------------------------------------------------------------- writing

type Change = {
  text: (data: Uint8Array, item: Item) => Promise<Uint8Array>;
  data: (data: Uint8Array, item: Item) => Promise<Uint8Array>;
  /** Strings out of object streams are changed as well. */
  packed: boolean;
  /** Writes every changed string in hexadecimal. */
  hex: boolean;
};

/** The value of a signature is never encrypted: it covers the rest of the file. */
function isSignature(dict: Dict): boolean {
  const type = nameOf(get(dict, "Type"));
  return (
    get(dict, "Contents")?.t === "str" && (type === "Sig" || type === "DocTimeStamp" || Boolean(get(dict, "ByteRange")))
  );
}

/** The text of a value, with some parts of it exchanged. */
function writeNode(
  out: Uint8Array[],
  b: Uint8Array,
  node: Node,
  swaps: ReadonlyMap<Node, Uint8Array>,
  fresh: ReadonlySet<Node>,
) {
  const swap = swaps.get(node);
  if (swap) out.push(swap);
  else if (node.t === "raw") out.push(latin(node.v));
  else if ((node.t === "dict" || node.t === "arr") && fresh.has(node)) {
    out.push(latin(node.t === "dict" ? "<<" : "["));
    if (node.t === "dict") {
      for (const { raw, value } of node.v) {
        out.push(latin(`/${raw} `));
        writeNode(out, b, value, swaps, fresh);
        out.push(latin("\n"));
      }
    } else {
      node.v.forEach((item, i) => {
        if (i > 0) out.push(latin(" "));
        writeNode(out, b, item, swaps, fresh);
      });
    }
    out.push(latin(node.t === "dict" ? ">>" : "]"));
  } else if (node.t === "word" && !/^(true|false|null)$/.test(node.v)) out.push(latin("null"));
  else out.push(b.subarray(node.s, node.e));
}

type Written = { num: number; gen: number; parts: Uint8Array[]; refs: number[] };

const END = latin("\nendstream\nendobj\n");

async function writeItem(file: PdfFile, item: Item, change: Change): Promise<Written> {
  const { node, num, gen } = item;
  const strings: Str[] = [];
  const refs: number[] = [];
  const locked = change.packed || !item.packed;
  /** Lists and dictionaries that cannot be copied as they stand. */
  const fresh = new Set<Node>();
  const visit = (value: Node): boolean => {
    if (value.t === "str") {
      if (locked) strings.push(value);
      return locked;
    }
    if (value.t === "ref") refs.push(value.n);
    if (value.t === "raw") return true;
    if (value.t === "word") return !/^(true|false|null)$/.test(value.v);
    if (value.t !== "dict" && value.t !== "arr") return false;
    let hit = value.broken;
    if (value.t === "arr") {
      for (const one of value.v) hit = visit(one) || hit;
    } else {
      const signature = isSignature(value);
      for (const pair of value.v) if (!(signature && pair.key === "Contents")) hit = visit(pair.value) || hit;
    }
    if (hit) fresh.add(value);
    return hit;
  };

  let data: Uint8Array | null = null;
  if (item.data && node.t === "dict") {
    data = await change.data(item.data, item);
    await dropCrypt(file, node);
    node.v = node.v.filter((pair) => pair.key !== "Length");
    node.v.push({ key: "Length", raw: "Length", value: rawNode(String(data.length)) });
  }
  visit(node);

  const swaps = new Map<Node, Uint8Array>();
  const made = await Promise.all(strings.map((one) => change.text(one.v, item)));
  strings.forEach((one, i) => {
    if (made[i] !== one.v) swaps.set(one, change.hex || one.hex ? hexString(made[i]) : literalString(made[i]));
  });
  const text: Uint8Array[] = [latin(`${num} ${gen} obj\n`)];
  writeNode(text, item.b, node, swaps, fresh);
  text.push(latin(data ? "\nstream\n" : "\nendobj\n"));
  const parts = [join(text)];
  if (data) parts.push(data, END);
  return { num, gen, parts, refs };
}

/** Takes the crypt filter off a stream, which means nothing once the file is open. */
async function dropCrypt(file: PdfFile, dict: Dict) {
  const filters = await file.filters(dict);
  const kept = filters.filter((filter) => filter.name !== "Crypt");
  if (kept.length === filters.length) return;
  const parms = get(dict, "DecodeParms");
  dict.broken = true;
  dict.v = dict.v.filter((pair) => pair.key !== "Filter" && pair.key !== "DecodeParms");
  if (kept.length === 0) return;
  const names = kept.map((filter) => `/${filter.name}`).join(" ");
  dict.v.push({ key: "Filter", raw: "Filter", value: rawNode(`[${names}]`) });
  if (parms?.t !== "arr") return;
  const left = { ...parms, v: parms.v.filter((_, i) => filters[i]?.name !== "Crypt"), broken: true };
  dict.v.push({ key: "DecodeParms", raw: "DecodeParms", value: left });
}

/** Every object that can be reached, changed. What older states of the file left behind is not among them. */
async function writeAll(file: PdfFile, change: Change, adjust?: (item: Item) => void): Promise<Written[]> {
  const rest = pacer();
  const out: Written[] = [];
  const seen = new Set<number>();
  let next: number[] = [];
  const want = (num: number) => {
    if (num > 0 && !seen.has(num)) next.push(num);
    seen.add(num);
  };
  for (const key of ["Root", "Info"]) {
    const node = file.trailer.get(key);
    if (node?.t === "ref") want(node.n);
  }
  while (next.length > 0) {
    const nums = next;
    next = [];
    for (let i = 0; i < nums.length; i += 64) {
      const made = await Promise.all(
        nums.slice(i, i + 64).map(async (num) => {
          const item = await file.get(num);
          if (!item) return null;
          adjust?.(item);
          return writeItem(file, item, change);
        }),
      );
      for (const one of made) {
        if (!one) continue;
        out.push(one);
        one.refs.forEach(want);
      }
      await rest();
    }
  }
  return out.sort((one, other) => one.num - other.num);
}

function assemble(version: string, objects: readonly Written[], trailer: string): Uint8Array {
  const parts: Uint8Array[] = [latin(`%PDF-${version}\n%\xe2\xe3\xcf\xd3\n`)];
  let at = parts[0].length;
  const table: string[] = ["xref\n"];
  let run: string[] = ["0000000000 65535 f \n"];
  let first = 0;
  const close = () => table.push(`${first} ${run.length}\n`, run.join(""));
  for (const { num, gen, parts: own } of objects) {
    if (num !== first + run.length) {
      close();
      first = num;
      run = [];
    }
    run.push(`${String(at).padStart(10, "0")} ${String(gen).padStart(5, "0")} n \n`);
    for (const part of own) {
      parts.push(part);
      at += part.length;
    }
  }
  close();
  const size = (objects[objects.length - 1]?.num ?? 0) + 1;
  parts.push(latin(`${table.join("")}trailer\n<<\n/Size ${size}\n${trailer}>>\nstartxref\n${at}\n%%EOF\n`));
  return join(parts);
}

const refText = (node: Node | undefined) => (node?.t === "ref" ? `${node.n} ${node.g} R` : null);

function trailerText(file: PdfFile, id: string): string {
  const info = refText(file.trailer.get("Info"));
  return `/Root ${refText(file.trailer.get("Root"))}\n${info ? `/Info ${info}\n` : ""}${id}`;
}

const hexText = (data: Uint8Array) => textOf(hexString(data), 0, data.length * 2 + 2);

// ---------------------------------------------------------------- the way in

/** null when the file is not encrypted. */
export async function lockOf(bytes: Uint8Array): Promise<LockInfo | null> {
  // Never hidden: it is needed to read everything else.
  if (find(bytes, "/Encrypt") < 0) return null;
  try {
    const lock = await readLock(new PdfFile(bytes));
    if (!lock) return null;
    const pass = await tryPassword(lock, "");
    return { needsPassword: !pass, restricted: pass !== null && !(await mayChange(lock, pass)), method: lock.label };
  } catch (error) {
    if (error instanceof UnknownLock) return { needsPassword: true, restricted: false, method: error.label };
    throw error;
  }
}

/** null when the password is wrong. Accepts the password to open or the owner's. */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Unlocked | null> {
  const file = new PdfFile(bytes);
  const lock = await readLock(file);
  if (!lock) return { bytes, role: "owner", mayChange: true };
  const pass = await tryPassword(lock, password);
  if (!pass) return null;

  // Said now, not when half of the file is done.
  if (lock.label.startsWith("AES")) subtle();

  let opener = new Opener(file, lock, pass.key, -1);
  file.open = (data, item) => opener.data(data, item);
  await file.settle();
  if (!lock.metadata) {
    const catalog = await file.follow(file.trailer.get("Root"));
    const own = catalog?.t === "dict" ? get(catalog, "Metadata") : undefined;
    if (own?.t === "ref") opener = new Opener(file, lock, pass.key, own.n);
  }
  const objects = await writeAll(file, {
    text: (data, item) => opener.text(data, item),
    data: (data, item) => opener.data(data, item),
    packed: false,
    hex: false,
  });
  const id = await file.follow(file.trailer.get("ID"));
  const parts = id?.t === "arr" ? id.v.map((node) => (node.t === "str" ? hexText(node.v) : "<>")) : [];
  const trailer = trailerText(file, parts.length === 2 ? `/ID [${parts.join(" ")}]\n` : "");
  return {
    bytes: assemble(file.version, objects, trailer),
    role: pass.role,
    mayChange: await mayChange(lock, pass),
  };
}

// ---------------------------------------------------------------- the way out

function permissionBits(allow: Allow): number {
  // Reading aloud is always allowed. The rest of the fixed bits are as the format wants them.
  let p = 0xfffff2c0;
  if (allow.print) p |= 4 | 2048;
  if (allow.change) p |= 8 | 1024;
  if (allow.copy) p |= 16;
  if (allow.comment) p |= 32;
  if (allow.fill) p |= 256;
  return p | 0;
}

/** Says in the catalog that the file goes beyond PDF 1.7. */
async function markLevel(file: PdfFile): Promise<(item: Item) => void> {
  const level = "<</BaseVersion /1.7 /ExtensionLevel 8>>";
  const adobe = (dict: Dict) => {
    dict.v = dict.v.filter((pair) => pair.key !== "ADBE");
    dict.v.push({ key: "ADBE", raw: "ADBE", value: rawNode(level) });
    dict.broken = true;
  };
  const root = file.trailer.get("Root");
  const catalog = root?.t === "ref" ? await file.get(root.n) : null;
  const found = catalog?.node.t === "dict" ? get(catalog.node, "Extensions") : undefined;
  const elsewhere = found?.t === "ref" && (await file.follow(found))?.t === "dict" ? found.n : -1;
  return (item) => {
    if (item.node.t !== "dict") return;
    if (item.num === elsewhere) adobe(item.node);
    if (root?.t !== "ref" || item.num !== root.n || elsewhere >= 0) return;
    const own = get(item.node, "Extensions");
    if (own?.t === "dict") adobe(own);
    else {
      item.node.v = item.node.v.filter((pair) => pair.key !== "Extensions");
      item.node.v.push({ key: "Extensions", raw: "Extensions", value: rawNode(`<</ADBE ${level}>>`) });
      item.node.broken = true;
    }
  };
}

/** Encrypts with AES-256. Without a password to open, everyone can read it but only do what is allowed. */
export async function protectPdf(
  bytes: Uint8Array,
  options: { open?: string; owner: string; allow: Allow },
): Promise<Uint8Array> {
  const file = new PdfFile(bytes);
  if ((await file.follow(file.trailer.get("Encrypt")))?.t === "dict") throw new Error("This PDF is protected already.");
  await file.settle();

  const key = random(32);
  const user = modern(prepared(options.open ?? ""));
  // An empty owner's password would let anyone in as the owner, so then nobody knows it.
  const owner = options.owner ? modern(prepared(options.owner)) : random(32);
  const seal = async (password: Uint8Array, extra: Uint8Array) => {
    const salts = random(16);
    const hash = await hardHash(6, password, salts.subarray(0, 8), extra);
    const wrap = await aesKey(await hardHash(6, password, salts.subarray(8), extra));
    return { check: join([hash, salts]), key: await aesEncryptRaw(wrap, ZERO, key) };
  };
  const u = await seal(user, NONE);
  const o = await seal(owner, u.check);
  const p = permissionBits(options.allow);
  const perms = join([Uint8Array.of(p, p >> 8, p >> 16, p >> 24, 255, 255, 255, 255), latin("Tadb"), random(4)]);
  const own = await aesKey(key);
  const sealed = await aesEncryptRaw(own, ZERO, perms);

  const newer = Number(file.version) >= 2;
  const change: Change = {
    text: (data) => aesSeal(own, data),
    data: (data) => aesSeal(own, data),
    packed: true,
    hex: true,
  };
  const objects = await writeAll(file, change, newer ? undefined : await markLevel(file));
  const num = (objects[objects.length - 1]?.num ?? 0) + 1;
  const encrypt = [
    `${num} 0 obj\n<</Filter /Standard /V 5 /R 6 /Length 256 /P ${p} /EncryptMetadata true`,
    `/O ${hexText(o.check)} /U ${hexText(u.check)}`,
    `/OE ${hexText(o.key)} /UE ${hexText(u.key)} /Perms ${hexText(sealed)}`,
    "/CF <</StdCF <</AuthEvent /DocOpen /CFM /AESV3 /Length 32>>>> /StmF /StdCF /StrF /StdCF>>\nendobj\n",
  ].join("\n");
  objects.push({ num, gen: 0, parts: [latin(encrypt)], refs: [] });

  const id = await file.follow(file.trailer.get("ID"));
  const first = id?.t === "arr" ? bytesOf(id.v[0]) : NONE;
  const ids = `/ID [${hexText(first.length > 0 ? first : random(16))} ${hexText(random(16))}]\n`;
  return assemble(newer ? file.version : "1.7", objects, trailerText(file, `${ids}/Encrypt ${num} 0 R\n`));
}
