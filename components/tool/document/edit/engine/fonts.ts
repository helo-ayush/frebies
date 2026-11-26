import type { Style } from "../model";

/**
 * Three kinds of font: the open ones that ship with the editor, the ones inside
 * the PDF, and any the visitor adds. All three draw on screen through FontFace
 * and go into the saved file.
 */

export type FaceName = "regular" | "bold" | "italic" | "bolditalic";

export type LibFamily = {
  id: string;
  name: string;
  /** The well-known font it stands in for. */
  like?: string;
  group: "Sans" | "Serif" | "Typewriter" | "Handwriting" | "Hindi" | "Symbols";
  faces: FaceName[];
};

const ALL: FaceName[] = ["regular", "bold", "italic", "bolditalic"];

export const LIBRARY: LibFamily[] = [
  { id: "lib:arimo", name: "Arimo", like: "Arial, Helvetica", group: "Sans", faces: ALL },
  { id: "lib:carlito", name: "Carlito", like: "Calibri", group: "Sans", faces: ALL },
  { id: "lib:open-sans", name: "Open Sans", like: "Segoe, Verdana", group: "Sans", faces: ALL },
  { id: "lib:roboto", name: "Roboto", group: "Sans", faces: ALL },
  { id: "lib:inter", name: "Inter", group: "Sans", faces: ALL },
  { id: "lib:lato", name: "Lato", group: "Sans", faces: ALL },
  { id: "lib:montserrat", name: "Montserrat", group: "Sans", faces: ALL },
  { id: "lib:poppins", name: "Poppins", group: "Sans", faces: ALL },
  { id: "lib:oswald", name: "Oswald", group: "Sans", faces: ["regular", "bold"] },
  { id: "lib:tinos", name: "Tinos", like: "Times New Roman", group: "Serif", faces: ALL },
  { id: "lib:caladea", name: "Caladea", like: "Cambria", group: "Serif", faces: ALL },
  { id: "lib:gelasio", name: "Gelasio", like: "Georgia", group: "Serif", faces: ALL },
  { id: "lib:garamond", name: "EB Garamond", like: "Garamond", group: "Serif", faces: ALL },
  { id: "lib:playfair", name: "Playfair Display", group: "Serif", faces: ALL },
  { id: "lib:cousine", name: "Cousine", like: "Courier New", group: "Typewriter", faces: ALL },
  { id: "lib:dancing", name: "Dancing Script", group: "Handwriting", faces: ["regular", "bold"] },
  { id: "lib:caveat", name: "Caveat", group: "Handwriting", faces: ["regular", "bold"] },
  { id: "lib:vibes", name: "Great Vibes", group: "Handwriting", faces: ["regular"] },
  { id: "lib:symbols", name: "Symbols", group: "Symbols", faces: ["regular"] },
  { id: "lib:devanagari", name: "Noto Sans Devanagari", like: "Hindi", group: "Hindi", faces: ["regular", "bold"] },
];

const families = new Map(LIBRARY.map((family) => [family.id, family]));

const faceKey = (bold: boolean, italic: boolean): FaceName =>
  bold ? (italic ? "bolditalic" : "bold") : italic ? "italic" : "regular";

/** The file that draws a library style, and what has to be faked. */
export function libraryFace(id: string, bold: boolean, italic: boolean) {
  const family = families.get(id) ?? LIBRARY[0];
  const want = faceKey(bold, italic);
  if (family.faces.includes(want)) return { file: `${family.id.slice(4)}-${want}`, fakeBold: false, fakeItalic: false };
  const half =
    bold && family.faces.includes("bold") ? "bold" : italic && family.faces.includes("italic") ? "italic" : "regular";
  return {
    file: `${family.id.slice(4)}-${half}`,
    fakeBold: bold && half !== "bold",
    fakeItalic: italic && half !== "italic",
  };
}

const fileUrl = (file: string) => `/fonts/edit/${file}.ttf`;
const files = new Map<string, Promise<ArrayBuffer>>();

export function libraryBytes(file: string): Promise<ArrayBuffer> {
  let job = files.get(file);
  if (!job) {
    job = fetch(fileUrl(file)).then((response) => {
      if (!response.ok) throw new Error(`Font ${file} did not load`);
      return response.arrayBuffer();
    });
    job.catch(() => files.delete(file));
    files.set(file, job);
  }
  return job;
}

let registered = false;
/** Tells the browser about the library. A face is only fetched when something uses it. */
export function registerLibrary() {
  if (registered || typeof document === "undefined") return;
  registered = true;
  for (const family of LIBRARY) {
    for (const face of family.faces) {
      document.fonts.add(
        new FontFace(`fb-${family.id.slice(4)}`, `url(${fileUrl(`${family.id.slice(4)}-${face}`)})`, {
          weight: face.startsWith("bold") ? "700" : "400",
          style: face.endsWith("italic") ? "italic" : "normal",
        }),
      );
    }
  }
}

// ---------------------------------------------------------------- fonts inside the PDF

/** The parts of a pdf.js font the editor reads. */
export type PdfFontObject = {
  loadedName: string;
  name: string;
  data?: Uint8Array;
  bold?: boolean;
  black?: boolean;
  italic?: boolean;
  missingFile?: boolean;
  disableFontFace?: boolean;
  isType3Font?: boolean;
  isInvalidPDFjsFont?: boolean;
  isSerifFont?: boolean;
  isMonospace?: boolean;
  composite?: boolean;
  vertical?: boolean;
  fontMatrix?: number[];
  defaultVMetrics?: number[];
  fallbackName?: string;
  toUnicode?: { _map?: string[] | Record<string, string>; firstChar?: number; lastChar?: number };
  toFontChar?: number[];
};

export type PdfFont = {
  id: string;
  sourceId: string;
  /** Its name without the subset tag. */
  name: string;
  family: string;
  css: string;
  bold: boolean;
  italic: boolean;
  /** Characters it can draw, when its own drawing can be reused. */
  codes: Map<number, number> | null;
  composite: boolean;
  /** The library font closest to it. */
  match: string;
  /** Somewhere it is used: page and text operator. */
  page: number;
  op: number;
};

const pdfFonts = new Map<string, PdfFont>();
export const pdfFont = (id: string) => pdfFonts.get(id) ?? null;

export function pdfFontsOf(sourceId: string): PdfFont[] {
  return [...pdfFonts.values()].filter((font) => font.sourceId === sourceId);
}

/** What Word's symbol fonts mean by the private letters they use for bullets and boxes. */
const PRIVATE: Record<string, Record<number, string>> = {
  symbol: {
    0xb7: "•",
    0xa7: "▪",
    0xae: "→",
    0xac: "←",
    0xad: "↑",
    0xaf: "↓",
    0xb0: "°",
    0xb1: "±",
    0xb4: "×",
    0xb8: "÷",
    0xa3: "≤",
    0xb3: "≥",
    0xb9: "≠",
    0xbb: "≈",
    0xa5: "∞",
    0xd6: "√",
    0xe5: "∑",
    0xd5: "∏",
    0xf2: "∫",
    0xb6: "∂",
    0xd1: "∇",
    0xce: "∈",
    0xa8: "♦",
    0xa9: "♥",
    0xaa: "♠",
    0xd2: "®",
    0xd3: "©",
    0xd4: "™",
    0x61: "α",
    0x62: "β",
    0x67: "γ",
    0x64: "δ",
    0x65: "ε",
    0x71: "θ",
    0x6c: "λ",
    0x6d: "μ",
    0x70: "π",
    0x72: "ρ",
    0x73: "σ",
    0x74: "τ",
    0x66: "φ",
    0x77: "ω",
    0x44: "Δ",
    0x53: "Σ",
    0x57: "Ω",
    0x2d: "–",
    0x2a: "*",
    0x6f: "ο",
    0xde: "⇒",
    0xdc: "⇐",
    0xab: "↔",
    0xdb: "⇔",
    0xa1: "ϒ",
    0xc5: "⊕",
  },
  wingdings: {
    0x6c: "●",
    0x6d: "○",
    0x6e: "■",
    0x6f: "□",
    0x70: "□",
    0x71: "❑",
    0x72: "❒",
    0x73: "◆",
    0x74: "◆",
    0x75: "◆",
    0x76: "❖",
    0x77: "◆",
    0xa7: "▪",
    0xa8: "☐",
    0x9f: "•",
    0x9e: "·",
    0xfc: "✓",
    0xfb: "✗",
    0xfd: "☒",
    0xfe: "☑",
    0xd8: "➢",
    0xe0: "→",
    0xdf: "←",
    0xe1: "↑",
    0xe2: "↓",
    0xe8: "➔",
    0xf0: "⇒",
    0xab: "★",
    0xaa: "✦",
    0xad: "✶",
    0x4a: "☺",
    0x4c: "☹",
    0x28: "☎",
    0x29: "✆",
    0x2a: "✉",
    0x22: "✂",
    0x21: "✏",
    0xa6: "○",
    0xb6: "☆",
    0x46: "☞",
    0x7c: "○",
    0x80: "⓪",
    0x81: "①",
    0x82: "②",
    0x83: "③",
    0x84: "④",
    0x85: "⑤",
    0x86: "⑥",
    0x87: "⑦",
    0x88: "⑧",
    0x89: "⑨",
    0x8a: "⑩",
  },
  wingdings2: { 0x50: "✓", 0x4f: "✗", 0x52: "☑", 0x51: "☒", 0xa3: "☐", 0x97: "●", 0x98: "•", 0xa0: "■", 0x99: "•" },
  wingdings3: { 0x7d: "►", 0x75: "►", 0x67: "►", 0x22: "→", 0x66: "←", 0xc6: "▶" },
};

/** The letter a reader sees, for the ones symbol fonts keep in a private corner. */
export function symbolText(font: string, text: string): string {
  if (text.length !== 1) return text;
  const code = text.charCodeAt(0);
  const hidden = code >= 0xf000 && code <= 0xf0ff;
  if (!hidden && code >= 0x100) return text;
  const name = font
    .toLowerCase()
    .replace(/^[a-z]{6}\+/, "")
    .replace(/[^a-z0-9]/g, "");
  const table = name.startsWith("wingdings2")
    ? PRIVATE.wingdings2
    : name.startsWith("wingdings3")
      ? PRIVATE.wingdings3
      : name.startsWith("wingdings")
        ? PRIVATE.wingdings
        : name.startsWith("symbol")
          ? PRIVATE.symbol
          : null;
  if (!table) return hidden ? (PRIVATE.symbol[code & 0xff] ?? text) : text;
  if (!hidden) return name.startsWith("wingdings") ? (table[code] ?? text) : text;
  return table[code & 0xff] ?? text;
}

const ALIASES: [RegExp, string][] = [
  [/carlito|calibri|candara|corbel/, "lib:carlito"],
  [/caladea|cambria|rockwell/, "lib:caladea"],
  [/gelasio|georgia|constantia|sylfaen|bookman|schoolbook|^century($|[^g])|lucidabright|aptosserif/, "lib:gelasio"],
  [/garamond|goudy|californian|perpetua|centaur|bellmt|highertower|hightower/, "lib:garamond"],
  [/playfair|didot|bodoni/, "lib:playfair"],
  [/opensans|segoe|verdana|tahoma|notosans|dejavusans|lucidasans|frutiger|myriad|trebuchet/, "lib:open-sans"],
  [/roboto/, "lib:roboto"],
  [/(^|[^a-z])inter($|[^a-z])|sfpro|sanfrancisco|geist/, "lib:inter"],
  [/lato($|[^a-z])|^lato|gillsans|twcen/, "lib:lato"],
  [/montserrat|gotham|proximanova/, "lib:montserrat"],
  [/poppins|futura|centurygothic|avenir/, "lib:poppins"],
  [/oswald|impact|bebas|leaguegothic/, "lib:oswald"],
  [/courier|consolas|mono|menlo|typewriter|cousine|cmtt/, "lib:cousine"],
  [/mangal|devanagari|nirmala|kokila/, "lib:devanagari"],
  [/arial|helvet|arimo|liberationsans|nimbussan|swiss|univers/, "lib:arimo"],
  [
    /times|tinos|liberationserif|nimbusrom|roman|minion|palatino|bookantiqua|baskerville|serif|cmr|cmbx|cmti|lmroman|sfrm|utopia|charter/,
    "lib:tinos",
  ],
  [/script|brush|signature|vibes|cursive/, "lib:dancing"],
  [/hand|caveat|comic/, "lib:caveat"],
];

export function matchLibrary(name: string, hints: { serif?: boolean; mono?: boolean } = {}): string {
  const flat = name.toLowerCase().replace(/[\s_]/g, "");
  for (const [test, id] of ALIASES) {
    if (id === "lib:tinos" && /sansserif|sans-serif/.test(flat)) continue;
    if (test.test(flat)) return id;
  }
  if (hints.mono) return "lib:cousine";
  if (hints.serif) return "lib:tinos";
  return "lib:arimo";
}

/** Characters with a drawing in the font pdf.js built, read from its `cmap`. */
function drawable(data: Uint8Array): Set<number> {
  const out = new Set<number>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = view.getUint16(4);
  let cmap = 0;
  for (let i = 0; i < tables; i += 1)
    if (view.getUint32(12 + i * 16) === 0x636d6170) cmap = view.getUint32(12 + i * 16 + 8);
  if (!cmap) return out;
  const count = view.getUint16(cmap + 2);
  for (let i = 0; i < count; i += 1) {
    const at = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    const format = view.getUint16(at);
    if (format === 4) {
      const segments = view.getUint16(at + 6) / 2;
      for (let k = 0; k < segments; k += 1) {
        const end = view.getUint16(at + 14 + k * 2);
        const start = view.getUint16(at + 16 + segments * 2 + k * 2);
        const delta = view.getUint16(at + 16 + segments * 4 + k * 2);
        const offsetAt = at + 16 + segments * 6 + k * 2;
        const offset = view.getUint16(offsetAt);
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          let glyph: number;
          if (offset === 0) glyph = (c + delta) & 0xffff;
          else {
            const where = offsetAt + offset + (c - start) * 2;
            glyph = where + 1 < view.byteLength ? view.getUint16(where) : 0;
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) out.add(c);
        }
      }
    } else if (format === 12) {
      const rows = view.getUint32(at + 12);
      for (let k = 0; k < rows; k += 1) {
        const start = view.getUint32(at + 16 + k * 12);
        const end = view.getUint32(at + 20 + k * 12);
        for (let c = start; c <= end && c - start < 70000; c += 1) out.add(c);
      }
    }
  }
  return out;
}

const privateUse = (c: number) => (c >= 0xe000 && c <= 0xf8ff) || c >= 0xf0000;

/** Which character code draws each character. */
function codesOf(font: PdfFontObject): Map<number, number> | null {
  if (!font.data || font.missingFile || font.disableFontFace || font.isType3Font) return null;
  let can: Set<number>;
  try {
    can = drawable(font.data);
  } catch {
    return null;
  }
  const codes = new Map<number, number>();
  const note = (code: number, text: string | number | undefined) => {
    const points = typeof text === "number" ? [text] : text ? Array.from(text, (ch) => ch.codePointAt(0) ?? 0) : [];
    if (points.length !== 1) return;
    const point = points[0];
    if (privateUse(point) || !can.has(point) || codes.has(point)) return;
    codes.set(point, code);
  };
  const map = font.toUnicode;
  if (map?._map) {
    for (const [code, text] of Object.entries(map._map)) note(Number(code), text as string);
  } else if (map && typeof map.firstChar === "number" && typeof map.lastChar === "number") {
    for (let c = map.firstChar; c <= Math.min(map.lastChar, 0xffff); c += 1) note(c, c);
  }
  return codes.size > 0 ? codes : null;
}

/** `key` is pdf.js's own name for it: fonts that are not embedded can share a loaded name. */
export function registerPdfFont(sourceId: string, key: string, font: PdfFontObject, page: number, op: number): string {
  const id = `pdf:${sourceId}/${key}`;
  if (pdfFonts.has(id)) return id;
  const name = (font.name ?? "Font").replace(/^[A-Z]{6}\+/, "");
  const weight = /bold|black|heavy|semibold|demi|cmbx|-bd/i.test(name) || Boolean(font.bold || font.black);
  const slant = /italic|oblique|cmti|-it$/i.test(name) || Boolean(font.italic);
  pdfFonts.set(id, {
    id,
    sourceId,
    name,
    family:
      name
        .replace(/(PS)?(MT)?$/i, "")
        .replace(/[-,\s]*(bold|italic|oblique|regular|roman|medium|semibold|black|light|mt)+/gi, "")
        .replace(/[-,\s]+$/, "") || name,
    css: font.loadedName,
    bold: weight,
    italic: slant,
    codes: codesOf(font),
    composite: Boolean(font.composite),
    match: matchLibrary(name, { serif: font.isSerifFont, mono: font.isMonospace }),
    page,
    op,
  });
  return id;
}

export function forgetPdfFonts(sourceId: string) {
  for (const [id, font] of pdfFonts) if (font.sourceId === sourceId) pdfFonts.delete(id);
}

// ---------------------------------------------------------------- fonts the visitor adds

export type UserFont = { id: string; name: string; css: string; bytes: ArrayBuffer };
const userFonts = new Map<string, UserFont>();
let userCount = 0;
export const userFont = (id: string) => userFonts.get(id) ?? null;
export const userFontList = () => [...userFonts.values()];

export async function addUserFont(name: string, bytes: ArrayBuffer): Promise<UserFont> {
  for (const font of userFonts.values())
    if (font.name === name && font.bytes.byteLength === bytes.byteLength) return font;
  userCount += 1;
  const css = `fb-user-${userCount}`;
  const face = new FontFace(css, bytes.slice(0));
  await face.load();
  document.fonts.add(face);
  const font = { id: `user:${userCount}`, name, css, bytes };
  userFonts.set(font.id, font);
  return font;
}

// ---------------------------------------------------------------- drawing with them

export type Face =
  | { kind: "lib"; id: string; bold: boolean; italic: boolean }
  | { kind: "pdf"; id: string; italic: boolean }
  | { kind: "user"; id: string; bold: boolean; italic: boolean };

export function faceOf(style: Style): Face {
  if (style.font.startsWith("pdf:")) {
    const font = pdfFonts.get(style.font);
    if (font?.codes) return { kind: "pdf", id: font.id, italic: style.italic && !font.italic };
    const match = font?.match ?? "lib:arimo";
    return {
      kind: "lib",
      id: match,
      bold: style.bold || Boolean(font?.bold),
      italic: style.italic || Boolean(font?.italic),
    };
  }
  if (style.font.startsWith("user:") && userFonts.has(style.font)) {
    return { kind: "user", id: style.font, bold: style.bold, italic: style.italic };
  }
  return {
    kind: "lib",
    id: families.has(style.font) ? style.font : "lib:arimo",
    bold: style.bold,
    italic: style.italic,
  };
}

/** What draws a character the first choice has no drawing for. */
export function fallbackFace(style: Style): Face {
  const font = style.font.startsWith("pdf:") ? pdfFonts.get(style.font) : null;
  return {
    kind: "lib",
    id: font?.match ?? "lib:arimo",
    bold: style.bold || Boolean(font?.bold),
    italic: style.italic || Boolean(font?.italic),
  };
}

const SAFE = '"fb-arimo", "fb-devanagari", "fb-symbols", system-ui, sans-serif';

export function faceCss(face: Face): { family: string; weight: number; style: string } {
  if (face.kind === "pdf") {
    const font = pdfFonts.get(face.id);
    return {
      family: `"${font?.css}", "fb-${font?.match.slice(4)}", ${SAFE}`,
      weight: 400,
      style: face.italic ? "italic" : "normal",
    };
  }
  if (face.kind === "user") {
    return {
      family: `"${userFonts.get(face.id)?.css}", ${SAFE}`,
      weight: face.bold ? 700 : 400,
      style: face.italic ? "italic" : "normal",
    };
  }
  return {
    family: `"fb-${face.id.slice(4)}", ${SAFE}`,
    weight: face.bold ? 700 : 400,
    style: face.italic ? "italic" : "normal",
  };
}

/** Splits text where the font runs out of drawings. */
export function splitByFace(text: string, style: Style): { text: string; face: Face }[] {
  const face = faceOf(style);
  if (face.kind !== "pdf") return [{ text, face }];
  const codes = pdfFonts.get(face.id)?.codes;
  const other = fallbackFace(style);
  const out: { text: string; face: Face }[] = [];
  for (const ch of text) {
    const point = ch.codePointAt(0) ?? 0;
    // A subset often leaves the space out: it has nothing to draw.
    const mine = codes?.has(point) || ch === "\n" || (point === 0xa0 && codes?.has(0x20));
    const use = mine ? face : ch === " " && out.length > 0 ? out[out.length - 1].face : other;
    const last = out[out.length - 1];
    if (last && last.face === use) last.text += ch;
    else out.push({ text: ch, face: use });
  }
  return out;
}

/** Loads whatever the styles need, so measuring and drawing agree. */
export async function loadFaces(styles: readonly Style[], sample = "Aa"): Promise<void> {
  registerLibrary();
  const wanted = new Set<string>(['400 16px "fb-arimo"']);
  for (const style of styles) {
    for (const face of [faceOf(style), fallbackFace(style)]) {
      const css = faceCss(face);
      wanted.add(`${css.style} ${css.weight} 16px ${css.family.split(",")[0]}`);
    }
  }
  if (/[ऀ-ॿ]/.test(sample)) wanted.add('400 16px "fb-devanagari"').add('700 16px "fb-devanagari"');
  if (/[\u2030-\u2bff]/.test(sample)) wanted.add('400 16px "fb-symbols"');
  await Promise.all([...wanted].map((font) => document.fonts.load(font, sample).catch(() => undefined)));
}

/** Is the style shown bold / italic, whoever provides it. */
export const isBold = (style: Style) =>
  style.bold || Boolean(style.font.startsWith("pdf:") && pdfFonts.get(style.font)?.bold);
export const isItalic = (style: Style) =>
  style.italic || Boolean(style.font.startsWith("pdf:") && pdfFonts.get(style.font)?.italic);

/** Bold or italic on or off. A PDF font moves to its sibling, or to the closest library font. */
export function withEmphasis(style: Style, patch: { bold?: boolean; italic?: boolean }): Style {
  const bold = patch.bold ?? isBold(style);
  const italic = patch.italic ?? isItalic(style);
  const font = style.font.startsWith("pdf:") ? pdfFonts.get(style.font) : null;
  if (!font) return { ...style, bold, italic };
  if (font.bold === bold && font.italic === italic) return { ...style, bold: false, italic: false };
  for (const other of pdfFonts.values()) {
    if (
      other.sourceId === font.sourceId &&
      other.family === font.family &&
      other.codes &&
      other.bold === bold &&
      other.italic === italic
    ) {
      return { ...style, font: other.id, bold: false, italic: false };
    }
  }
  return { ...style, font: font.match, bold, italic, tracking: 0 };
}

/** "Arial-BoldItalicMT" as people know it: "Arial Bold Italic". */
function plainName(name: string): string {
  const text = name
    .replace(/(PSMT|PS|MT)(?=-|,|$)/g, "")
    .replace(/[-,_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bRegular\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || name;
}

export function fontLabel(id: string): string {
  if (id.startsWith("pdf:")) return plainName(pdfFonts.get(id)?.name ?? "Original");
  if (id.startsWith("user:")) return userFonts.get(id)?.name ?? "Your font";
  return families.get(id)?.name ?? "Arimo";
}

/** How a font's own name is written in the list: with the font itself, if it has every letter of it. */
export function labelCss(id: string): { fontFamily: string; fontWeight: number; fontStyle: string } {
  const font = id.startsWith("pdf:") ? pdfFonts.get(id) : null;
  const whole = !font || [...fontLabel(id)].every((ch) => ch === " " || font.codes?.has(ch.codePointAt(0) ?? 0));
  const style: Style = {
    font: whole ? id : (font?.match ?? "lib:arimo"),
    size: 16,
    color: "",
    bold: !whole && Boolean(font?.bold),
    italic: !whole && Boolean(font?.italic),
    underline: false,
    strike: false,
    tracking: 0,
    rise: 0,
  };
  const face = faceCss(faceOf(style));
  return { fontFamily: face.family, fontWeight: face.weight, fontStyle: face.style };
}
