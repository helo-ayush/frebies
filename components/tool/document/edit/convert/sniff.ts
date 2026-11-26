/**
 * What a file really is, whatever its name says: the bytes are asked first, the
 * name and the browser's own guess only when the bytes do not tell.
 */

export type FileKind =
  | "pdf"
  | "docx"
  | "doc"
  | "odt"
  | "rtf"
  | "html"
  | "markdown"
  | "text"
  | "pptx"
  | "odp"
  | "xlsx"
  | "xls"
  | "ods"
  | "csv"
  | "epub"
  | "image"
  | "zip"
  | "unknown";

// ---------------------------------------------------------------- compound files

/** The small file system inside .doc, .xls and .ppt files. */
export type Compound = {
  /** Streams and storages of the top level. */
  names: string[];
  /** A top-level stream's bytes; null when there is none. */
  read: (name: string) => Uint8Array | null;
};

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
export const isCompound = (bytes: Uint8Array) => bytes.length >= 512 && OLE.every((byte, i) => bytes[i] === byte);

/** Sector numbers from here on mean "end", "free" and the like. */
const SPECIAL = 0xfffffffa;

export function openCompound(bytes: Uint8Array): Compound | null {
  if (!isCompound(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const shift = view.getUint16(30, true);
  const miniShift = view.getUint16(32, true);
  if (shift < 7 || shift > 16 || miniShift > shift) return null;
  const size = 1 << shift;
  const mini = 1 << miniShift;
  const cutoff = view.getUint32(56, true);
  const last = Math.ceil(bytes.length / size);
  const at = (sector: number) => (sector + 1) * size;

  const tables: number[] = [];
  for (let i = 0; i < 109; i += 1) {
    const sector = view.getUint32(76 + i * 4, true);
    if (sector < SPECIAL && sector < last) tables.push(sector);
  }
  let more = view.getUint32(68, true);
  for (let guard = 0; more < last && at(more) + size <= bytes.length && guard < last; guard += 1) {
    for (let i = 0; i < size / 4 - 1; i += 1) {
      const sector = view.getUint32(at(more) + i * 4, true);
      if (sector < SPECIAL && sector < last) tables.push(sector);
    }
    more = view.getUint32(at(more) + size - 4, true);
  }
  const fat = new Uint32Array((tables.length * size) / 4).fill(0xffffffff);
  tables.forEach((sector, k) => {
    for (let i = 0; i < size / 4 && at(sector) + i * 4 + 4 <= bytes.length; i += 1)
      fat[(k * size) / 4 + i] = view.getUint32(at(sector) + i * 4, true);
  });

  /** The numbers of a chain, stopping where a damaged one would go round in circles. */
  const chain = (start: number, table: Uint32Array, most: number): number[] => {
    const out: number[] = [];
    for (let sector = start; sector < table.length && out.length < most; sector = table[sector]) out.push(sector);
    return out;
  };
  const gather = (from: Uint8Array, sectors: number[], step: number, offset: number, length: number): Uint8Array => {
    const out = new Uint8Array(Math.min(length, sectors.length * step));
    sectors.forEach((sector, i) => {
      const start = offset + sector * step;
      const piece = from.subarray(start, Math.min(start + step, from.length, start + out.length - i * step));
      if (piece.length > 0) out.set(piece, i * step);
    });
    return out;
  };
  const big = (start: number, length = Infinity) =>
    gather(bytes, chain(start, fat, Math.min(last, Math.ceil(length / size))), size, size, length);

  const directory = big(view.getUint32(48, true));
  const list = new DataView(directory.buffer);
  const count = Math.floor(directory.length / 128);
  if (count === 0) return null;
  const entry = (i: number) => {
    const base = i * 128;
    const letters = Math.max(0, Math.min(62, list.getUint16(base + 64, true) - 2)) / 2;
    let name = "";
    for (let k = 0; k < letters; k += 1) name += String.fromCharCode(list.getUint16(base + k * 2, true));
    return {
      name,
      type: directory[base + 66],
      left: list.getUint32(base + 68, true),
      right: list.getUint32(base + 72, true),
      child: list.getUint32(base + 76, true),
      start: list.getUint32(base + 116, true),
      size: list.getUint32(base + 120, true),
    };
  };
  const root = entry(0);
  const found = new Map<string, ReturnType<typeof entry>>();
  const seen = new Set<number>();
  const todo = [root.child];
  while (todo.length > 0) {
    const i = todo.pop() as number;
    if (i >= count || seen.has(i)) continue;
    seen.add(i);
    const item = entry(i);
    if (item.type === 1 || item.type === 2) found.set(item.name, item);
    todo.push(item.left, item.right);
  }

  let small: { data: Uint8Array; table: Uint32Array } | null = null;
  const minis = () => {
    if (small) return small;
    const raw = big(view.getUint32(60, true));
    const cells = new DataView(raw.buffer);
    const table = new Uint32Array(raw.length / 4).map((_, i) => cells.getUint32(i * 4, true));
    small = { data: big(root.start, root.size), table };
    return small;
  };
  return {
    names: [...found.keys()],
    read(name) {
      const item = found.get(name);
      if (!item || item.type !== 2) return null;
      if (item.size === 0) return new Uint8Array(0);
      if (item.size >= cutoff) return big(item.start, item.size);
      const { data, table } = minis();
      return gather(data, chain(item.start, table, Math.ceil(item.size / mini)), mini, 0, item.size);
    },
  };
}

// ---------------------------------------------------------------- archives

const ascii = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
};

async function part(file: Blob, from: number, to: number): Promise<Uint8Array> {
  const start = Math.max(0, from);
  return new Uint8Array(await file.slice(start, Math.max(start, Math.min(file.size, to))).arrayBuffer());
}

/** Names inside a ZIP, without unpacking it. */
async function zipNames(file: Blob, head: Uint8Array): Promise<string[]> {
  const names: string[] = [];
  const tail = await part(file, file.size - 66000, file.size);
  const ends = new DataView(tail.buffer);
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (ends.getUint32(i, true) !== 0x06054b50) continue;
    const length = ends.getUint32(i + 12, true);
    const start = Math.min(ends.getUint32(i + 16, true), Math.max(0, file.size - tail.length + i - length));
    const list = await part(file, start, start + Math.min(length, 1 << 24));
    const view = new DataView(list.buffer);
    for (let at = 0; at + 46 <= list.length && view.getUint32(at, true) === 0x02014b50;) {
      const letters = view.getUint16(at + 28, true);
      names.push(ascii(list.subarray(at + 46, at + 46 + letters)));
      at += 46 + letters + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    break;
  }
  if (names.length === 0) {
    // Cut off, or too big for the old directory: the entries themselves carry their names too.
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    for (let at = 0; at + 30 <= head.length && view.getUint32(at, true) === 0x04034b50;) {
      const letters = view.getUint16(at + 26, true);
      names.push(ascii(head.subarray(at + 30, at + 30 + letters)));
      at += 30 + letters + view.getUint16(at + 28, true) + view.getUint32(at + 18, true);
    }
  }
  return names.map((name) => name.replace(/\\/g, "/").replace(/^\/+/, ""));
}

async function zipKind(file: Blob, head: Uint8Array, extension: string): Promise<FileKind> {
  const names = await zipNames(file, head);
  const has = (start: string) => names.some((name) => name.startsWith(start));
  if (has("word/") || (extension === "docx" && has("[Content_Types].xml"))) return "docx";
  if (has("ppt/")) return "pptx";
  // The binary workbook (.xlsb) keeps the same folders but none of the same files.
  if (has("xl/")) return has("xl/workbook.bin") ? "unknown" : "xlsx";
  let type = "";
  if (names[0] === "mimetype" && head.length > 38) {
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    type = ascii(head.subarray(start, start + Math.min(90, view.getUint32(18, true) || 90)));
  }
  if (type.includes("epub+zip") || has("META-INF/container.xml")) return "epub";
  if (type.includes("opendocument.text")) return "odt";
  if (type.includes("opendocument.presentation")) return "odp";
  if (type.includes("opendocument.spreadsheet")) return "ods";
  if (has("content.xml") && has("META-INF/manifest.xml")) {
    if (/^(odt|ott)$/.test(extension)) return "odt";
    if (/^(odp|otp)$/.test(extension)) return "odp";
    if (/^(ods|ots)$/.test(extension)) return "ods";
    return "unknown";
  }
  // Apple's own documents are archives as well, but nothing in them can be read.
  if (has("Index/Document.iwa") || has("Index.zip") || has("index.apxl") || has("Index/Tables/")) return "unknown";
  return "zip";
}

// ---------------------------------------------------------------- pictures and text

function isImage(head: Uint8Array): boolean {
  const text = ascii(head.subarray(0, 32));
  return (
    text.startsWith("\x89PNG") ||
    text.startsWith("\xff\xd8\xff") ||
    text.startsWith("GIF8") ||
    (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") ||
    text.startsWith("II*\0") ||
    text.startsWith("MM\0*") ||
    (text.startsWith("BM") && head.length > 26 && head[14] >= 12 && head[15] === 0 && head[16] === 0) ||
    (text.slice(4, 8) === "ftyp" && /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif|avis)/.test(text.slice(8, 12))) ||
    text.startsWith("\0\0\x01\0") ||
    text.startsWith("\xff\x0a") ||
    text.startsWith("\0\0\0\x0cJXL ") ||
    text.startsWith("\0\0\0\x0cjP  ")
  );
}

/** The start of the file as text, or null when it holds bytes no text has. */
function textOf(head: Uint8Array): string | null {
  if (head[0] === 0xff && head[1] === 0xfe) return new TextDecoder("utf-16le").decode(head);
  if (head[0] === 0xfe && head[1] === 0xff) return new TextDecoder("utf-16be").decode(head);
  let even = 0;
  let odd = 0;
  let control = 0;
  for (let i = 0; i < head.length; i += 1) {
    if (head[i] === 0) {
      if (i % 2 === 0) even += 1;
      else odd += 1;
    } else if (head[i] < 32 && head[i] !== 9 && head[i] !== 10 && head[i] !== 12 && head[i] !== 13 && head[i] !== 27)
      control += 1;
  }
  if (control > head.length / 200) return null;
  if (even + odd === 0) return new TextDecoder("utf-8").decode(head);
  // Two bytes a letter, without saying so: one of each pair is nearly always zero.
  if (odd > head.length * 0.35 && even < head.length * 0.02) return new TextDecoder("utf-16le").decode(head);
  if (even > head.length * 0.35 && odd < head.length * 0.02) return new TextDecoder("utf-16be").decode(head);
  return null;
}

const IMAGES = /^(png|apng|jpe?g|jfif|gif|webp|bmp|svg|avif|heic|heif|tiff?|ico|jxl)$/;

const NAMES: [RegExp, FileKind][] = [
  [/^(md|markdown|mdown|mkdn?|mdwn|mdtxt)$/, "markdown"],
  [/^(csv|tsv|tab)$/, "csv"],
  [/^(html?|xhtml|xht|shtml|mht|mhtml)$/, "html"],
  [/^(txt|text|log)$/, "text"],
];

const TYPES: [RegExp, FileKind][] = [
  [/^text\/(x-)?markdown/, "markdown"],
  [/^text\/(csv|tab-separated-values|comma-separated-values)/, "csv"],
  [/^(text\/html|application\/xhtml\+xml|multipart\/related|message\/rfc822)/, "html"],
  [/^text\/plain/, "text"],
];

/** A page saved whole, as Word and some web programs do under the name of a .doc. */
export const isWebArchive = (text: string) =>
  /^(?:[\w-]+:[^\n]*\r?\n(?:[ \t][^\n]*\r?\n)*)*?content-type:\s*multipart\/(related|alternative|mixed)/i.test(
    text.replace(/^\s+/, "").slice(0, 4000),
  );

export async function sniff(file: File): Promise<FileKind> {
  const extension = /\.([^.]+)$/.exec(file.name.toLowerCase())?.[1] ?? "";
  const named = NAMES.find(([test]) => test.test(extension))?.[1] ?? null;
  const typed = TYPES.find(([test]) => test.test(file.type.toLowerCase()))?.[1] ?? null;
  const head = await part(file, 0, 65536);
  if (head.length === 0) return named ?? typed ?? "unknown";

  if (ascii(head.subarray(0, 1024)).includes("%PDF-")) return "pdf";
  if (isCompound(head)) {
    const names = openCompound(new Uint8Array(await file.arrayBuffer()))?.names ?? [];
    if (names.includes("WordDocument")) return "doc";
    if (names.includes("Workbook") || names.includes("Book")) return "xls";
    // There is no reader for the old slides.
    if (names.includes("PowerPoint Document")) return "unknown";
    // New Office files lose their ZIP when they get a password.
    if (names.includes("EncryptedPackage"))
      return /^(xls|ods)/.test(extension) ? "xlsx" : /^(ppt|pot|odp)/.test(extension) ? "pptx" : "docx";
    return /^(doc|dot)$/.test(extension) ? "doc" : "unknown";
  }
  if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7))
    return zipKind(file, head, extension);
  if (isImage(head)) return "image";

  const text = textOf(head);
  if (text !== null) {
    const start = text.replace(/^[\s\ufeff]+/, "");
    if (start.startsWith("{\\rtf")) return "rtf";
    const bare = start.replace(/^(<\?[^>]*\?>|<!--[\s\S]*?-->|\s+)+/, "").slice(0, 4096);
    if (/^(<!doctype\s+svg[^>]*(\[[\s\S]*?\])?[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(bare)) return "image";
    if (/^(<!doctype\s+html|<html[\s>])/i.test(bare)) return "html";
    if (named !== "markdown" && /^<(head|body|title|meta|style|table|div|p|h[1-6]|span|font|center)[\s>]/i.test(bare))
      if (named !== "text" && named !== "csv") return "html";
    if (named !== "markdown" && isWebArchive(start)) return "html";
    if (/<office:document\b/.test(bare) || /<(w:wordDocument|pkg:package)\b/.test(bare)) return "unknown";
    return named ?? typed ?? (IMAGES.test(extension) ? "image" : "text");
  }
  if (IMAGES.test(extension) || file.type.startsWith("image/")) return "image";
  // Word files older than Office 95 are no compound files.
  if (/^(doc|dot)$/.test(extension)) return "doc";
  return "unknown";
}
