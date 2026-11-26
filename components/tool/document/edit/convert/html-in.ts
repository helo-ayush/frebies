import {
  ConvertError,
  type FlowAlign,
  type FlowBlock,
  type FlowCell,
  type FlowDoc,
  type FlowImage,
  type FlowLine,
  type FlowList,
  type FlowPara,
  type FlowRow,
  type FlowRun,
  type FlowSection,
  type FlowStyle,
  type FlowTable,
} from "./flow";
import { isWebArchive } from "./sniff";

/**
 * Web pages, Markdown and plain text, plus what the Word and RTF readers need
 * as well: old symbol fonts, pictures, list marks and the last touches to a
 * document.
 */

export const A4 = { w: 595.28, h: 841.89, margin: { top: 72, right: 72, bottom: 72, left: 72 } };

export const round = (value: number) => Math.round(value * 100) / 100;

const SIDES = ["top", "right", "bottom", "left"] as const;

// ---------------------------------------------------------------- letters

/** Text of a file, whatever it was written with. */
export function decodeText(bytes: Uint8Array): string {
  const as = (label: string, from = 0) => new TextDecoder(label).decode(bytes.subarray(from));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return as("utf-8", 3);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return as("utf-16le", 2);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return as("utf-16be", 2);
  // Two bytes a letter without saying so: in most scripts one of them is nearly always zero.
  let even = 0;
  let odd = 0;
  const look = Math.min(bytes.length, 4000);
  for (let i = 0; i < look; i += 1) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) even += 1;
    else odd += 1;
  }
  if (odd > look * 0.3 && even < look * 0.05) return as("utf-16le");
  if (even > look * 0.3 && odd < look * 0.05) return as("utf-16be");
  const start = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const said =
    /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(start) ?? /^<\?xml[^>]+encoding\s*=\s*["']([\w-]+)/i.exec(start);
  const label = said?.[1].toLowerCase() ?? "";
  // Seven bits only, but not plain letters: these hide behind escape codes.
  if (/^(iso-2022|hz-gb)/.test(label)) return safeDecode(bytes, label) ?? as("windows-1252");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return (/^utf-?8$/.test(label) ? null : safeDecode(bytes, label)) ?? as("windows-1252");
  }
}

export function safeDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return label ? new TextDecoder(label).decode(bytes) : null;
  } catch {
    return null;
  }
}

/** "41 Α 42 Β": codes of an old font and the characters they show. */
const codes = (text: string) =>
  new Map([...text.matchAll(/([0-9a-f]{2})(\S)/gu)].map((match) => [parseInt(match[1], 16), match[2]]));

const run = (from: number, text: string): [number, string][] => [...text].map((sign, i) => [from + i, sign]);

const SYMBOL = new Map([
  ...run(0x20, " !∀#∃%&∋()∗+,−./0123456789:;<=>?"),
  ...run(0x40, "≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_"),
  ...run(0x60, "‾αβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}∼"),
  ...run(0xa0, "€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…⏐⎯↵"),
  ...run(0xc0, "ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√⋅¬∧∨⇔⇐⇑⇒⇓"),
  ...run(0xe0, "◊⟨®©™∑⎛⎜⎝⎡⎢⎣⎧⎨⎩⎪"),
  ...run(0xf1, "⟩∫⌠⎮⌡⎞⎟⎠⎤⎥⎦⎫⎬⎭"),
]);

const WINGDINGS = codes(
  "21✏22✂23✂28☎29☎2a✉2b✉36⌛37⌨3e✇3f✍41✌45☜46☞47☝48☟4a☺4b☺4c☹4e☠4f⚐50⚑51✈52☼54❄55✝56✞57✟58✠59✡5a☪5b☯5cॐ5d☸" +
    "5e♈5f♉60♊61♋62♌63♍64♎65♏66♐67♑68♒69♓6a&6b&6c●6d❍6e■6f□70□71☐72☐73◆74◆75◆76❖77◆78☒79⌂7a⌘7b❀7c✿7d“7e”" +
    "80⓪81①82②83③84④85⑤86⑥87⑦88⑧89⑨8a⑩8b⓿8c❶8d❷8e❸8f❹90❺91❻92❼93❽94❾95❿9e·9f•a0▪a1○a2○a3○a4◉a5◎a6○a7▪a8☐" +
    "a9✦aa✦ab★ac✶ad✴ae✹af✵b0⌖b1⌖b2✧b3⌑b5✪b6✰d5⌫d6⌦d7◀d8➢d9▲da▼dc➲df←e0→e1↑e2↓e3↖e4↗e5↙e6↘e7←e8➔e9↑ea↓" +
    "eb↖ec↗ed↙ee↘ef⇦f0⇨f1⇧f2⇩f3⇔f4⇳f9▪fa▫fb✗fc✓fd☒fe☑ff⊞",
);
const WINGDINGS2 = codes("25✂50✓4f✗51☒52☑53☒54☒69⓪6a①6b②6c③6d④6e⑤6f⑥70⑦71⑧72⑨73⑩75⓿76❶77❷96•97●98●99●9a○a0▪a1■a2■a3☐");
const WINGDINGS3 = codes("66←67→68↑69↓6a↖6b↗6c↙6d↘70▲71▼72△73▽74◄75►76◁77▷7b◀7c◀7d▶7e▲7f▼");
const WEBDINGS = codes("33◀34▶35▲36▼37◀38▶59♥61✓63☐67■69ℹ6e●72✗73?98✉c8☎");

/**
 * What text in an old symbol font shows, as characters every font program
 * knows. Null when there is nothing to change.
 */
export function symbolText(font: string | undefined, text: string): string | null {
  const name = (font ?? "").toLowerCase().trim();
  const own = name.startsWith("symbol")
    ? SYMBOL
    : /^wingdings ?2/.test(name)
      ? WINGDINGS2
      : /^wingdings ?3/.test(name)
        ? WINGDINGS3
        : name.startsWith("wingdings")
          ? WINGDINGS
          : name.startsWith("webdings")
            ? WEBDINGS
            : null;
  if (!own && !/[\uf020-\uf0ff]/.test(text)) return null;
  let out = "";
  for (const sign of text) {
    const code = sign.charCodeAt(0);
    const hidden = code >= 0xf020 && code <= 0xf0ff;
    if (!hidden && (!own || code > 0xff || code <= 0x20 || code === 0xa0)) out += sign;
    else if (own) out += own.get(code & 0xff) ?? (own === SYMBOL ? sign : "▪");
    // A private character whose font is not known: the bullets people use most.
    else
      out +=
        code === 0xf0b7 ? "•" : code >= 0xf06c ? (WINGDINGS.get(code & 0xff) ?? "•") : String.fromCharCode(code & 0xff);
  }
  return out;
}

/** Characters a reader of old files must not let through: they mean nothing here. */
export const plain = (text: string) => text.replace(/[\u0000-\u0008\u000e-\u001f\u00ad\ufeff\ufffe\uffff]/g, "");

/** An address that may be followed, or undefined. Nothing that runs or opens files. */
export function cleanLink(address: string): string | undefined {
  const text = address.trim().replace(/[\u0000-\u001f]/g, "");
  if (/^(https?|ftp|mailto|tel|sms):./i.test(text)) return text;
  if (/^www\.[^\s/]+\.[^\s]+$/i.test(text)) return `http://${text}`;
  if (/^[^\s@/:]+@[^\s@/:]+\.[a-z]{2,}$/i.test(text)) return `mailto:${text}`;
  return undefined;
}

// ---------------------------------------------------------------- colours

let brush: CanvasRenderingContext2D | null = null;
const seen = new Map<string, [number, number, number, number] | null>();

/** Any colour CSS knows, as red, green, blue (0 to 255) and how solid it is. */
export function cssColor(value: string): [number, number, number, number] | null {
  const name = value.trim().toLowerCase();
  if (/^(auto|windowtext|text1|currentcolor|inherit|initial|none|canvastext|)$/.test(name)) return null;
  const known = seen.get(name);
  if (known !== undefined) return known;
  brush ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  let out: [number, number, number, number] | null = null;
  if (brush) {
    // What the canvas does not understand leaves the colour as it was.
    brush.fillStyle = "#000001";
    brush.fillStyle = name;
    const first = brush.fillStyle;
    brush.fillStyle = "#000002";
    brush.fillStyle = name;
    const parts = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(brush.fillStyle);
    if (parts) out = [Number(parts[1]), Number(parts[2]), Number(parts[3]), Number(parts[4])];
    else if (first === brush.fillStyle && /^#[0-9a-f]{6}$/.test(first)) {
      const all = parseInt(first.slice(1), 16);
      out = [all >> 16, (all >> 8) & 255, all & 255, 1];
    } else if (first === brush.fillStyle) {
      // Newer ways to write a colour: what it looks like when drawn.
      brush.clearRect(0, 0, 1, 1);
      brush.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = brush.getImageData(0, 0, 1, 1).data;
      out = [red, green, blue, alpha / 255];
    }
  }
  seen.set(name, out);
  return out;
}

export const hexOf = (r: number, g: number, b: number) =>
  `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;

const channels = (hex: string) => {
  const all = parseInt(hex.slice(1), 16);
  return [all >> 16, (all >> 8) & 255, all & 255];
};

/** `share` of one colour over another. */
export function mixColors(top: string, under: string, share: number): string {
  const a = channels(top);
  const b = channels(under);
  const at = (i: number) => a[i] * share + b[i] * (1 - share);
  return hexOf(at(0), at(1), at(2));
}

/** How light a colour looks, 0 to 1. */
export function lightness(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const part = value / 255;
    return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Word writes white on dark colours when the text has none of its own. */
export function whiteOnDark(blocks: readonly FlowPara[], fill: string | undefined) {
  if (!fill || lightness(fill) > 0.1) return;
  for (const para of blocks)
    for (const piece of para.runs)
      if (piece.text !== undefined && !piece.style.color && !piece.style.highlight) piece.style.color = "#ffffff";
}

// ---------------------------------------------------------------- pictures

export type Picture = { bytes: Uint8Array; mime: string; /** In pixels. */ w: number; h: number };

/** Size of a PNG or JPEG without opening it. */
function headSize(bytes: Uint8Array): { mime: string; w: number; h: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47)
    return { mime: "image/png", w: view.getUint32(16), h: view.getUint32(20) };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let at = 2; at + 9 < bytes.length;) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { mime: "image/jpeg", w: view.getUint16(at + 7), h: view.getUint16(at + 5) };
    at += marker === 0xff ? 1 : marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) ? 2 : 2 + view.getUint16(at + 2);
  }
  return null;
}

/** PNG and JPEG as they are, anything else the browser can open as PNG. Null for the rest. */
export async function openPicture(bytes: Uint8Array, mime = ""): Promise<Picture | null> {
  const head = headSize(bytes);
  if (head && head.w > 0 && head.h > 0) return { bytes, ...head };
  try {
    const { readImage } = await import("../engine/images");
    return await readImage(new Blob([bytes as BlobPart], { type: mime }));
  } catch {
    return null;
  }
}

/** A Windows bitmap without its file header, as Word and RTF keep it. */
export function bitmapFile(dib: Uint8Array): Uint8Array {
  const view = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const header = view.getUint32(0, true);
  const bits = header === 12 ? view.getUint16(10, true) : view.getUint16(14, true);
  let colors = header >= 40 ? view.getUint32(32, true) : 0;
  if (colors === 0 && bits <= 8) colors = 1 << bits;
  const masks = header === 40 && view.getUint32(16, true) === 3 ? 12 : 0;
  const out = new Uint8Array(14 + dib.length);
  const file = new DataView(out.buffer);
  file.setUint16(0, 0x424d);
  file.setUint32(2, out.length, true);
  file.setUint32(10, 14 + header + masks + colors * (header === 12 ? 3 : 4), true);
  out.set(dib, 14);
  return out;
}

// ---------------------------------------------------------------- measuring

let ruler: CanvasRenderingContext2D | null = null;

/** About how wide some letters are. */
export function textWidth(text: string, style: FlowStyle): number {
  const size = (style.size ?? 11) * (style.script ? 0.62 : 1);
  ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return text.length * size * 0.5;
  const family = style.font?.startsWith("lib:") ? `fb-${style.font.slice(4)}` : (style.font ?? "Arial");
  const look = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${size}px`;
  ruler.font = `${look} "${family.replace(/"/g, "")}", Arial, sans-serif`;
  return ruler.measureText(text).width + (style.tracking ?? 0) * text.length;
}

export function runsWidth(runs: readonly FlowRun[]): number {
  let width = 0;
  for (const piece of runs)
    width += piece.image
      ? piece.image.w
      : textWidth(piece.text.replace("{pages}", "00").replace("{page}", "0"), piece.style);
  return width;
}

// ---------------------------------------------------------------- tab stops

export type Stop = { at: number; kind: "left" | "center" | "right" | "decimal" };

/**
 * The editor's stops all put text on their right. Where Word centres it on a
 * stop or lets it end there, the text is measured and gets the place it starts at.
 */
export function placeTabs(para: FlowPara, stops: readonly Stop[], room: number) {
  const sorted = stops.filter((stop) => stop.at > 0).sort((a, b) => a.at - b.at);
  const hang = para.first !== undefined && para.first < 0 && !para.list ? (para.left ?? 0) : 0;
  const text = textOf(para);
  if (!text.includes("\t")) return;
  // The place a hanging line hangs from is a stop as well.
  if (hang > 0 && !sorted.some((stop) => Math.abs(stop.at - hang) < 0.5)) {
    sorted.push({ at: hang, kind: "left" });
    sorted.sort((a, b) => a.at - b.at);
  }
  if (sorted.length === 0) return;
  if (sorted.every((stop) => stop.kind === "left")) {
    para.tabs = sorted.map((stop) => round(stop.at));
    return;
  }
  // The parts of the first line that has tabs.
  const parts: FlowRun[][] = [[]];
  let done = false;
  for (const piece of para.runs) {
    if (piece.image) {
      if (!done) parts[parts.length - 1].push(piece);
      continue;
    }
    for (const bit of piece.text.split(/(\t|\n)/)) {
      if (done) break;
      if (bit === "\n") {
        if (parts.length > 1) done = true;
        else parts[0] = [];
      } else if (bit === "\t") parts.push([]);
      else if (bit) parts[parts.length - 1].push({ text: bit, style: piece.style });
    }
  }
  const out: number[] = [];
  let x = (para.left ?? 0) + (para.list ? 0 : (para.first ?? 0)) + runsWidth(parts[0]);
  for (let i = 1; i < parts.length; i += 1) {
    const stop = sorted.find((one) => one.at > x + 0.1) ?? { at: (Math.floor(x / 36 + 0.01) + 1) * 36, kind: "left" };
    const wide = runsWidth(parts[i]);
    const at = Math.min(stop.at, stop.kind === "left" ? stop.at : room - 0.5);
    let start = at;
    if (stop.kind === "right") start = at - wide;
    else if (stop.kind === "center") start = at - wide / 2;
    else if (stop.kind === "decimal") {
      const first = parts[i][0];
      const whole = first && first.text !== undefined ? (/^[^.,]*/.exec(first.text)?.[0] ?? "") : "";
      start = at - (first && first.text !== undefined ? textWidth(whole, first.style) : 0);
    }
    start = Math.max(x + 1, start);
    out.push(round(start));
    x = start + wide;
  }
  for (const stop of sorted)
    if (stop.kind === "left" && stop.at > (out[out.length - 1] ?? 0) + 1) out.push(round(stop.at));
  para.tabs = out;
}

// ---------------------------------------------------------------- lists

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

export function roman(value: number): string {
  let left = Math.max(1, Math.min(3999, value));
  let out = "";
  for (const [size, sign] of ROMAN) for (; left >= size; left -= size) out += sign;
  return out;
}

export function lettered(value: number): string {
  let out = "";
  for (let left = Math.max(1, value); left > 0; left = Math.floor((left - 1) / 26))
    out = String.fromCharCode(97 + ((left - 1) % 26)) + out;
  return out;
}

const unroman = (text: string) => {
  let total = 0;
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  for (let i = 0; i < text.length; i += 1) {
    const value = values[text[i]] ?? 0;
    total += (values[text[i + 1]] ?? 0) > value ? -value : value;
  }
  return roman(total) === text ? total : 0;
};

/**
 * The list a mark written out belongs to, with its number. `after` is the number
 * before it, which tells "i" after "h" from "i" as one.
 */
export function listOfMark(text: string, level: number, after = 0): { list: FlowList; count: number } | null {
  const mark = text.trim();
  if (!mark) return null;
  const parts = /^([([]?)(\d{1,4}|[a-z]{1,6}|[A-Z]{1,6})([.)\]:]{0,2})$/.exec(mark);
  if (parts && /^0\d/.test(parts[2])) return null;
  if (!parts || (!parts[1] && !parts[3] && !/^\d/.test(parts[2])))
    return mark.length > 3 || (/[A-Za-z0-9]/.test(mark) && mark !== "o")
      ? null
      : { list: { type: "bullet", mark: BULLET_LOOKS[mark] ?? mark, level }, count: 0 };
  const [, open, value, close] = parts;
  const small = value.toLowerCase();
  const asRoman = unroman(small);
  const asLetter =
    small.length === 1 || /^(.)\1*$/.test(small) ? (small.length - 1) * 26 + small.charCodeAt(0) - 96 : 0;
  let kind = "1";
  let count = Number(value);
  if (!/^\d/.test(value)) {
    const letter =
      asLetter > 0 && (asRoman === 0 || asLetter === after + 1 || (asRoman !== after + 1 && small !== "i"));
    if (!letter && asRoman === 0) return null;
    count = letter ? asLetter : asRoman;
    kind = letter ? "a" : "i";
    if (value !== small) kind = kind.toUpperCase();
  }
  return { list: { type: "number", mark: open + kind + close, level }, count };
}

/** Marks of old fonts and keyboards, as the bullets they stand for. */
const BULLET_LOOKS: Record<string, string> = {
  "·": "•",
  o: "◦",
  "*": "•",
  "□": "☐",
  "◻": "☐",
  "❑": "☐",
  "❒": "☐",
  "–": "–",
};
export const bulletLook = (mark: string) => BULLET_LOOKS[mark] ?? mark;

/**
 * Says where a list counts on from. The editor counts by itself, but starts over
 * after a paragraph without a mark, where Word and others go on.
 */
export function setStarts(blocks: readonly FlowBlock[], counts: ReadonlyMap<FlowPara, number>) {
  const now: number[] = [];
  const kinds: string[] = [];
  for (const block of blocks) {
    if (block.kind !== "para" || !block.list) {
      now.length = 0;
      kinds.length = 0;
      continue;
    }
    const { list } = block;
    const kind = `${list.type}${list.mark}`;
    now.length = Math.min(now.length, list.level + 1);
    kinds.length = Math.min(kinds.length, list.level + 1);
    const goes = now[list.level] !== undefined && kinds[list.level] === kind;
    const count = counts.get(block) ?? (goes ? now[list.level] + 1 : 1);
    delete list.start;
    if (list.type === "number" && count !== (goes ? now[list.level] + 1 : 1)) list.start = count;
    now[list.level] = list.type === "number" ? count : 0;
    kinds[list.level] = kind;
  }
}

// ---------------------------------------------------------------- last touches

const sameLine = (a: FlowLine | undefined, b: FlowLine | undefined) =>
  a?.color === b?.color && a?.width === b?.width && a?.dash === b?.dash;

/** Neighbours inside the same frame share it: no line between them. */
export function joinFrames(blocks: readonly FlowBlock[], between?: ReadonlyMap<FlowPara, FlowLine>) {
  const frames = blocks.map((block) => (block.kind === "para" ? block.border : undefined));
  for (let i = 1; i < blocks.length; i += 1) {
    const a = blocks[i - 1];
    const b = blocks[i];
    const one = frames[i - 1];
    const two = frames[i];
    if (a.kind !== "para" || b.kind !== "para" || !one || !two || b.breakBefore) continue;
    const same =
      sameLine(one.top, two.top) &&
      sameLine(one.right, two.right) &&
      sameLine(one.bottom, two.bottom) &&
      sameLine(one.left, two.left) &&
      (a.left ?? 0) + Math.min(0, a.first ?? 0) === (b.left ?? 0) + Math.min(0, b.first ?? 0) &&
      (a.right ?? 0) === (b.right ?? 0);
    if (!same) continue;
    a.border = { ...a.border, bottom: undefined };
    b.border = { ...b.border, top: between?.get(b) };
    // The space between two paragraphs belongs to the frame as well.
  }
  for (const block of blocks) {
    if (block.kind !== "para" || !block.border) continue;
    const { top, right, bottom, left } = block.border;
    if (!top && !right && !bottom && !left) delete block.border;
    else {
      block.border = {};
      if (top) block.border.top = top;
      if (right) block.border.right = right;
      if (bottom) block.border.bottom = bottom;
      if (left) block.border.left = left;
    }
  }
}

/** Joins neighbours that look the same, gives every run a style of its own and keeps one for empty lines. */
export function tidyRuns(runs: readonly FlowRun[], blank: FlowStyle): FlowRun[] {
  const out: FlowRun[] = [];
  let last = "";
  for (const piece of runs) {
    if (piece.image) {
      out.push(piece);
      last = "";
      continue;
    }
    if (piece.text === "") continue;
    const style = cleanStyle(piece.style);
    const key = JSON.stringify(style);
    const before = out[out.length - 1];
    if (
      before &&
      before.text !== undefined &&
      (key === last || (/^[ \u00a0]+$/.test(piece.text) && sameBlank(before.style, style)))
    ) {
      before.text += piece.text;
      continue;
    }
    out.push({ text: piece.text, style });
    last = key;
  }
  if (out.length === 0) out.push({ text: "", style: cleanStyle(blank) });
  return out;
}

/** Do spaces look alike in both? Their letters need not. */
const sameBlank = (a: FlowStyle, b: FlowStyle) =>
  a.size === b.size &&
  a.underline === b.underline &&
  a.strike === b.strike &&
  a.highlight === b.highlight &&
  a.link === b.link &&
  a.script === b.script &&
  a.tracking === b.tracking;

function cleanStyle(style: FlowStyle): FlowStyle {
  const out: FlowStyle = {};
  if (style.font) out.font = style.font;
  if (style.size) out.size = round(style.size);
  if (style.color) out.color = style.color;
  if (style.bold) out.bold = true;
  if (style.italic) out.italic = true;
  if (style.underline) out.underline = true;
  if (style.strike) out.strike = true;
  if (style.script) out.script = style.script;
  if (style.highlight) out.highlight = style.highlight;
  if (style.link) out.link = style.link;
  if (style.tracking) out.tracking = round(style.tracking);
  return out;
}

export const textOf = (para: FlowPara) => para.runs.map((piece) => piece.text ?? "").join("");
export const isBlank = (para: FlowPara) => para.runs.every((piece) => !piece.image && piece.text === "");

type Edge = FlowLine | null | undefined;

/** Two cells share an edge: a line wins over none, a wide line over a thin one. */
const stronger = (a: Edge, b: Edge): Edge => (!a ? (b ?? a) : b && b.width > a.width ? b : a);

/**
 * Gives both cells at an edge the same line. The line most cells have becomes
 * the table's own, and cells only say where they differ.
 */
export function settleBorders(table: FlowTable) {
  const { rows } = table;
  const placed: { cell: FlowCell; r: number; c: number; tall: number; wide: number }[] = [];
  const taken = rows.map(() => [] as boolean[]);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (taken[r][c]) c += 1;
      const tall = Math.min(rows.length - r, cell.rowSpan ?? 1);
      const wide = cell.colSpan ?? 1;
      for (let y = r; y < r + tall; y += 1) for (let x = c; x < c + wide; x += 1) taken[y][x] = true;
      placed.push({ cell, r, c, tall, wide });
      c += wide;
    }
  });
  const across: Edge[][] = Array.from({ length: rows.length + 1 }, () => []);
  const down: Edge[][] = rows.map(() => []);
  for (const { cell, r, c, tall, wide } of placed) {
    const border = cell.border ?? {};
    for (let x = c; x < c + wide; x += 1) {
      across[r][x] = stronger(across[r][x], border.top);
      across[r + tall][x] = stronger(across[r + tall][x], border.bottom);
    }
    for (let y = r; y < r + tall; y += 1) {
      down[y][c] = stronger(down[y][c], border.left);
      down[y][c + wide] = stronger(down[y][c + wide], border.right);
    }
  }
  const tally = new Map<string, { line: FlowLine | null; count: number }>();
  const key = (line: Edge) => JSON.stringify(line ?? null);
  for (const { cell, r, c, tall, wide } of placed) {
    const one = (parts: Edge[]) => (parts.every((part) => key(part) === key(parts[0])) ? (parts[0] ?? null) : null);
    const list = (count: number, part: (i: number) => Edge) => Array.from({ length: count }, (_, i) => part(i));
    cell.border = {
      top: one(list(wide, (i) => across[r][c + i])),
      right: one(list(tall, (i) => down[r + i][c + wide])),
      bottom: one(list(wide, (i) => across[r + tall][c + i])),
      left: one(list(tall, (i) => down[r + i][c])),
    };
    for (const line of Object.values(cell.border)) {
      const entry = tally.get(key(line)) ?? { line: line ?? null, count: 0 };
      entry.count += 1;
      tally.set(key(line), entry);
    }
  }
  const usual = [...tally.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  table.border = usual?.[1].line ?? null;
  for (const { cell } of placed) {
    const own: NonNullable<FlowCell["border"]> = {};
    for (const side of SIDES) if (key(cell.border?.[side]) !== usual?.[0]) own[side] = cell.border?.[side] ?? null;
    if (Object.keys(own).length > 0) cell.border = own;
    else delete cell.border;
  }
}

/** A cell holds paragraphs only: what else stands in it, as paragraphs. */
export function flatten(blocks: readonly FlowBlock[]): FlowPara[] {
  const out: FlowPara[] = [];
  for (const block of blocks) {
    if (block.kind === "para") out.push(block);
    else if (block.kind === "box") out.push(...block.blocks);
    else if (block.kind === "table") out.push(...tableLines(block));
    else if (block.kind === "rule") {
      const line = { color: block.color ?? "#a0a0a0", width: block.width ?? 0.75 };
      out.push({
        kind: "para",
        runs: [{ text: "", style: { size: 4 } }],
        before: 0,
        after: 0,
        border: { bottom: line },
      });
    }
  }
  return out;
}

/** A table inside a cell, as lines with its columns at tab stops. */
function tableLines(table: FlowTable): FlowPara[] {
  const out: FlowPara[] = [];
  for (const row of table.rows) {
    const deep = Math.max(1, ...row.cells.map((cell) => cell.blocks.length));
    for (let i = 0; i < deep; i += 1) {
      const runs: FlowRun[] = [];
      const tabs: number[] = [];
      let at = 0;
      let col = 0;
      let base: FlowPara | undefined;
      row.cells.forEach((cell, c) => {
        const para = cell.blocks[i];
        base ??= para;
        if (c > 0) {
          runs.push({ text: "\t", style: para?.runs.find((piece) => piece.text !== undefined)?.style ?? {} });
          tabs.push(round(at));
        }
        if (para) runs.push(...para.runs);
        for (let k = 0; k < (cell.colSpan ?? 1); k += 1) at += table.cols[col + k] ?? 0;
        col += cell.colSpan ?? 1;
      });
      while (runs.length > 0 && runs[runs.length - 1].text === "\t") runs.pop();
      const blank = base?.runs.find((piece) => piece.text !== undefined)?.style ?? {};
      const para: FlowPara = { kind: "para", runs: tidyRuns(runs, blank), before: 0, after: base?.after ?? 0 };
      if (base?.line) para.line = base.line;
      if (row.cells.length === 1 && base)
        Object.assign(para, { align: base.align, list: base.list, left: base.left, first: base.first });
      if (tabs.length > 0) para.tabs = tabs;
      out.push(para);
    }
  }
  return out;
}

// ---------------------------------------------------------------- web archives

type Archive = { html: string; find: (address: string) => { bytes: Uint8Array; mime: string } | null };

const latin = (text: string) => Uint8Array.from(text, (sign) => Math.min(255, sign.charCodeAt(0)));

/** Opens a page saved whole: the page itself and the pictures packed up with it. */
function openArchive(text: string): Archive | null {
  const parts: { type: string; charset: string; place: string; id: string; body: string; bytes: Uint8Array | null }[] =
    [];
  const read = (source: string, deep: number) => {
    const gap = /\r?\n\r?\n/.exec(source);
    if (!gap || deep > 5) return;
    const heads = new Map<string, string>();
    for (const line of source
      .slice(0, gap.index)
      .replace(/\r?\n[ \t]+/g, " ")
      .split(/\r?\n/)) {
      const at = line.indexOf(":");
      if (at > 0) heads.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
    }
    const body = source.slice(gap.index + gap[0].length);
    const type = heads.get("content-type") ?? "text/plain";
    const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
    if (/^multipart\//i.test(type) && boundary) {
      for (const piece of body.split(`--${boundary}`).slice(1))
        if (!piece.startsWith("--")) read(piece.replace(/^\r?\n/, ""), deep + 1);
      return;
    }
    const how = (heads.get("content-transfer-encoding") ?? "").toLowerCase();
    let bytes: Uint8Array | null = null;
    if (how === "base64") {
      try {
        bytes = latin(atob(body.replace(/[^A-Za-z0-9+/]/g, "")));
      } catch {
        bytes = null;
      }
    } else if (how === "quoted-printable")
      bytes = latin(
        body
          .replace(/=[ \t]*\r?\n/g, "")
          .replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
      );
    parts.push({
      type: type.split(";")[0].trim().toLowerCase(),
      charset: /charset="?([\w-]+)"?/i.exec(type)?.[1] ?? "",
      place: heads.get("content-location") ?? "",
      id: (heads.get("content-id") ?? "").replace(/[<>]/g, ""),
      body,
      bytes,
    });
  };
  read(text.replace(/^\s+/, ""), 0);
  const page = parts.find((part) => part.type === "text/html") ?? parts.find((part) => part.type === "text/plain");
  if (!page) return null;
  const html = page.bytes ? (safeDecode(page.bytes, page.charset) ?? decodeText(page.bytes)) : page.body;
  return {
    html,
    find(address) {
      const name = address.replace(/\\/g, "/");
      const id = /^cid:(.+)$/i.exec(name)?.[1];
      const found = parts.find((part) =>
        id
          ? part.id === id
          : part.place && (part.place === name || part.place.replace(/\\/g, "/").endsWith(`/${name}`)),
      );
      return found?.bytes && found.type.startsWith("image/") ? { bytes: found.bytes, mime: found.type } : null;
    },
  };
}

// ---------------------------------------------------------------- style sheets

type Css = Map<string, string>;
type Decl = [name: string, value: string, important: boolean];
type Rule = { selector: string; weight: number; decls: Decl[] };

const LINES = /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/;

/** Words of a value; what stands in brackets or quotes is one word. */
const words = (value: string): string[] => value.match(/(?:[^\s"'(]|"[^"]*"|'[^']*'|\([^)]*\))+/g) ?? [];

/** Writes a property out as the single ones it stands for. */
function spread(name: string, value: string, put: (name: string, value: string) => void) {
  const list = words(value);
  const four = (make: (side: string) => string) =>
    SIDES.forEach((side, i) => {
      const part = list[i] ?? list[i - 2] ?? list[0];
      if (part) put(make(side), part);
    });
  const border = /^border-(top|right|bottom|left)$/.exec(name);
  const exact = /^mso-border(?:-(top|right|bottom|left))?-alt$/.exec(name);
  if (exact) for (const side of exact[1] ? [exact[1]] : SIDES) put(`mso-line-${side}`, value);
  else if (name === "margin" || name === "padding") four((side) => `${name}-${side}`);
  else if (/^border-(width|style|color)$/.test(name)) four((side) => `border-${side}-${name.slice(7)}`);
  else if (name === "border" || border) {
    for (const side of border ? [border[1]] : SIDES) {
      put(`border-${side}-style`, list.find((word) => LINES.test(word.toLowerCase())) ?? "none");
      put(`border-${side}-width`, list.find((word) => /^(\.?\d|thin$|medium$|thick$)/i.test(word)) ?? "medium");
      const color = list.find(
        (word) => !LINES.test(word.toLowerCase()) && !/^(\.?\d|thin$|medium$|thick$)/i.test(word),
      );
      put(`border-${side}-color`, color ?? "");
    }
  } else if (name === "background")
    put(
      "background-color",
      list.find((word) => cssColor(word)) ?? list.find((word) => word.startsWith("var(")) ?? "transparent",
    );
  else if (name === "font") {
    const at = list.findIndex((word) =>
      /^(\.?\d[\w.%]*|xx?-small|small|medium|large|xx?x?-large|smaller|larger)(\/|$)/i.test(word),
    );
    if (at < 0) return;
    const before = list.slice(0, at).map((word) => word.toLowerCase());
    put("font-style", before.includes("italic") || before.includes("oblique") ? "italic" : "normal");
    put("font-weight", before.find((word) => /^(bold|bolder|lighter|[1-9]00)$/.test(word)) ?? "normal");
    if (before.includes("small-caps")) put("font-variant", "small-caps");
    const [size, line] = list[at].split("/");
    put("font-size", size);
    if (line) put("line-height", line);
    if (list.length > at + 1) put("font-family", list.slice(at + 1).join(" "));
  } else if (name === "text-decoration") put("text-decoration-line", value);
  else if (name === "list-style") {
    const type = list.find((word) => !/^(inside|outside|url\()/i.test(word));
    put("list-style-type", type ?? "disc");
    if (list.includes("inside")) put("list-style-position", "inside");
  } else put(name, value);
}

function readDecls(text: string): Decl[] {
  const out: Decl[] = [];
  for (const part of text.match(/(?:[^;"'(]|"[^"]*"|'[^']*'|\([^)]*\)|["'(])+/g) ?? []) {
    const at = part.indexOf(":");
    if (at < 1) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    let value = part.slice(at + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, "").trim();
    if (name && value) spread(name, value, (one, what) => out.push([one, what, important]));
  }
  return out;
}

/** How much a selector counts: ids over classes over tags. */
function weigh(selector: string): number {
  const bare = selector.replace(/\[[^\]]*\]/g, ".x").replace(/::[\w-]+/g, " x");
  const count = (test: RegExp) => bare.match(test)?.length ?? 0;
  return count(/#[\w-]+/g) * 10000 + count(/\.[\w-]+|:[\w-]+/g) * 100 + count(/(^|[\s>+~])[a-z][\w-]*/gi);
}

function readSheet(source: string, rules: Rule[], pages: Map<string, Css>) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--|-->/g, "");
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf("{", at);
    if (open < 0) return;
    const semicolon = text.indexOf(";", at);
    const head = text.slice(at, open).trim();
    if (head.startsWith("@") && semicolon >= 0 && semicolon < open) {
      at = semicolon + 1;
      continue;
    }
    let depth = 1;
    let end = open + 1;
    for (; end < text.length && depth > 0; end += 1) {
      if (text[end] === "{") depth += 1;
      else if (text[end] === "}") depth -= 1;
    }
    const body = text.slice(open + 1, end - 1);
    at = end;
    if (/^@media/i.test(head)) {
      // Rules for paper and screen alike; not those for a certain width.
      if (!/\(/.test(head) && /\b(all|print|screen)\b/i.test(head)) readSheet(body, rules, pages);
    } else if (/^@(supports|layer)/i.test(head)) readSheet(body, rules, pages);
    else if (/^@page/i.test(head)) {
      const name = /^@page\s*([\w-]*)/i.exec(head)?.[1] ?? "";
      const css = pages.get(name) ?? new Map<string, string>();
      for (const [one, value] of readDecls(body.replace(/@[\w-]+\s*\{[^}]*\}/g, ""))) css.set(one, value);
      pages.set(name, css);
    } else if (!head.startsWith("@")) {
      const decls = readDecls(body);
      if (decls.length === 0) continue;
      for (const selector of head.match(/(?:[^,([]|\([^)]*\)|\[[^\]]*\])+/g) ?? [])
        if (!/::|:(before|after|first-line|first-letter|hover|focus|active)/i.test(selector))
          rules.push({ selector: selector.trim(), weight: weigh(selector.trim()), decls });
    }
  }
}

const UNITS: Record<string, number> = { px: 0.75, pt: 1, pc: 12, in: 72, cm: 72 / 2.54, mm: 7.2 / 2.54, q: 1.8 / 2.54 };

/** What "rem" is of: the size of letters the page starts with. */
let rootSize = 11;

/** A length in points. `em` is the size of the letters, `whole` what a percentage is of. */
function measure(value: string | undefined, em: number, whole?: number): number | null {
  const parts = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|in|cm|mm|q|em|rem|ex|ch|%)?$/i.exec((value ?? "").trim());
  if (!parts) return null;
  const n = Number(parts[1]);
  const unit = (parts[2] ?? "px").toLowerCase();
  if (unit === "%") return whole === undefined ? null : (n / 100) * whole;
  if (unit === "em") return n * em;
  if (unit === "rem") return n * rootSize;
  if (unit === "ex" || unit === "ch") return n * em * 0.5;
  return n * UNITS[unit];
}

// ---------------------------------------------------------------- from web page to paragraphs

type Look = {
  style: FlowStyle;
  align?: FlowAlign;
  line?: FlowPara["line"];
  indent: number;
  /** White space: "" runs together, "pre" stays, "line" only keeps line ends. */
  space: "" | "pre" | "line";
  caps: "" | "upper" | "lower" | "title" | "small";
  list?: string;
  inside?: boolean;
  /** Colour behind it, when the page itself is not white. */
  fill?: string;
  depth: number;
  /** Where tables stand in it. */
  place?: "center" | "right";
};

/** The mark of an item, which only its first paragraph gets. */
type Item = { list: FlowList; count: number; hang: number; used?: boolean };

/** Where paragraphs opened now go. */
type Spot = {
  left: number;
  right: number;
  first?: number;
  heading?: FlowPara["heading"];
  item?: Item;
  width: number;
  stops?: Stop[];
  keep?: boolean;
  /** Written in front of the first paragraph. */
  lead?: string;
};

type Holder = {
  out: FlowBlock[];
  open: { para: FlowPara; blank: FlowStyle; space: boolean; stops?: Stop[]; room: number } | null;
  /** Space the blocks around have asked for since the last paragraph. */
  gap: number;
  breakNext: boolean;
};

const HEADS = [20, 16, 13, 12, 11, 11];
const HEAD_BEFORE = [18, 14, 12, 10, 8, 8];
const set = (names: string) => new Set(names.split(" "));
const SKIP = set(
  "script style noscript template head title meta link iframe embed object audio video canvas map area base param " +
    "source track datalist xml",
);
const BLOCK = set(
  "html body address article aside blockquote center dd details dialog dir div dl dt fieldset figcaption figure " +
    "footer form h1 h2 h3 h4 h5 h6 header hgroup hr legend li main menu nav ol p pre search section summary table " +
    "ul caption optgroup option",
);
const GENERIC: Record<string, string> = {
  serif: "Times New Roman",
  "sans-serif": "Arial",
  monospace: "Courier New",
  "ui-monospace": "Courier New",
  "ui-serif": "Times New Roman",
  cursive: "Comic Sans MS",
};
const SIZES: Record<string, number> = {
  "xx-small": 6.6,
  "x-small": 8,
  small: 9.5,
  medium: 11,
  large: 13,
  "x-large": 16,
  "xx-large": 22,
  "xxx-large": 33,
};

/** Word's tab stops: "center 225pt right dotted 451pt". */
function stopsOf(css: Css): Stop[] | undefined {
  const value = css.get("tab-stops");
  if (!value) return undefined;
  const out: Stop[] = [];
  let kind: Stop["kind"] = "left";
  for (const word of value.toLowerCase().split(/\s+/)) {
    const at = measure(word, 11);
    if (at !== null) {
      out.push({ at, kind });
      kind = "left";
    } else if (word === "center" || word === "right" || word === "decimal") kind = word;
  }
  return out.length > 0 ? out : undefined;
}

/** The first font of a list that says something. */
function family(value: string): string | undefined {
  for (const part of value.split(",")) {
    const name = part.trim().replace(/^["']|["']$/g, "");
    if (!name || /^(-apple-system|blinkmacsystemfont|system-ui|ui-sans-serif|inherit|initial|unset|var\()/i.test(name))
      continue;
    return GENERIC[name.toLowerCase()] ?? name;
  }
  return undefined;
}

function* textNodes(root: Node): Generator<Node> {
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) yield node;
    else yield* textNodes(node);
  }
}

/** The line of a side, or undefined where nothing is said and null where there is none. */
function borderOf(css: Css, side: (typeof SIDES)[number], em: number, ink: string): FlowLine | null | undefined {
  // Word notes the line it means next to the one browsers can draw.
  const exact = css.has(`mso-line-${side}`);
  const own: Css = exact ? new Map(css) : css;
  if (exact) spread(`border-${side}`, css.get(`mso-line-${side}`) ?? "", (name, value) => own.set(name, value));
  const style = own.get(`border-${side}-style`)?.toLowerCase();
  if (style === undefined) return undefined;
  if (style === "none" || style === "hidden") return null;
  const wide = own.get(`border-${side}-width`)?.toLowerCase() ?? "medium";
  const width = { thin: 0.75, medium: 2.25, thick: 3.75 }[wide] ?? measure(wide, em) ?? 0.75;
  if (width <= 0) return null;
  const color = cssColor(own.get(`border-${side}-color`) ?? "");
  if (color && color[3] === 0) return null;
  const line: FlowLine = { color: color ? solid(color) : ink, width: round(width) };
  if (style === "dashed") line.dash = "dash";
  else if (style === "dotted") line.dash = "dot";
  return line;
}

const solid = (color: [number, number, number, number], under = "#ffffff") =>
  mixColors(hexOf(color[0], color[1], color[2]), under, color[3]);

class Page {
  private css = new Map<Element, Css>();
  private declared = new Map<Element, { weight: number; order: number; decls: Decl[] }[]>();
  private pictures = new Map<Element, Picture>();
  private counts = new Map<FlowPara, number>();
  private pages = new Map<string, Css>();
  /** Written by Word, which means its own line heights and lists. */
  private word: boolean;
  private darkPage = false;
  /** Paragraphs with the usual space after them. */
  private soft = new WeakSet<FlowPara>();
  private wordLists = new Map<string, { mark: string; count: number }>();
  /** Values the page gives names to. */
  private names = new Map<string, string>();

  constructor(
    private doc: Document,
    private archive: Archive | null,
  ) {
    const rules: Rule[] = [];
    for (const sheet of doc.querySelectorAll("style")) {
      const media = sheet.getAttribute("media") ?? "";
      if (!media || /\b(all|print|screen)\b/i.test(media)) readSheet(sheet.textContent ?? "", rules, this.pages);
    }
    this.word =
      /microsoft word/i.test(doc.querySelector("meta[name=Generator i]")?.getAttribute("content") ?? "") ||
      doc.documentElement.hasAttribute("xmlns:w");
    for (const { decls } of rules)
      for (const [name, value] of decls) if (name.startsWith("--")) this.names.set(name, value);
    rules.forEach((rule, order) => {
      let found: ArrayLike<Element> = [];
      try {
        found = doc.querySelectorAll(rule.selector);
      } catch {
        return;
      }
      for (let i = 0; i < found.length; i += 1) {
        const list = this.declared.get(found[i]) ?? [];
        list.push({ weight: rule.weight, order, decls: rule.decls });
        this.declared.set(found[i], list);
      }
    });
  }

  /** Opens the pictures that came with the page; those on the web stay there. */
  async load() {
    const jobs: Promise<void>[] = [];
    for (const el of this.doc.querySelectorAll("img, svg")) {
      if (el.parentElement?.closest("svg")) continue;
      jobs.push(
        (async () => {
          const source = this.source(el);
          const picture = source && (await openPicture(source.bytes, source.mime));
          if (picture) this.pictures.set(el, picture);
        })().catch(() => undefined),
      );
    }
    await Promise.all(jobs);
  }

  private source(el: Element): { bytes: Uint8Array; mime: string } | null {
    if (el.tagName.toLowerCase() === "svg") {
      const text = new XMLSerializer().serializeToString(el);
      return { bytes: new TextEncoder().encode(text), mime: "image/svg+xml" };
    }
    const address = (el.getAttribute("src") ?? "").trim();
    const data = /^data:([\w.+-]+\/[\w.+-]+)?([^,]*),([\s\S]*)$/i.exec(address);
    if (!data) return this.archive?.find(address) ?? null;
    const text = data[3].includes("%") ? decodeURIComponent(data[3]) : data[3];
    const bytes = /;\s*base64/i.test(data[2])
      ? latin(atob(text.replace(/[^A-Za-z0-9+/]/g, "")))
      : new TextEncoder().encode(text);
    return { bytes, mime: data[1] ?? "" };
  }

  // ---------------------------------------------------------------- looks

  private cssOf(el: Element): Css {
    const known = this.css.get(el);
    if (known) return known;
    const out: Css = new Map();
    const hint = (name: string, value: string | null) => {
      if (value) spread(name, value, (one, what) => out.set(one, what));
    };
    const tag = el.tagName.toLowerCase();
    const attr = (name: string) => el.getAttribute(name);
    if (attr("align") && tag !== "table" && tag !== "img") hint("text-align", attr("align"));
    hint("background-color", attr("bgcolor"));
    if (tag === "font" || tag === "basefont") {
      hint("color", attr("color"));
      hint("font-family", attr("face"));
      const size = attr("size")?.trim() ?? "";
      const n = /^[+-]/.test(size) ? 3 + Number(size) : Number(size);
      if (size && Number.isFinite(n))
        out.set("font-size", `${[7, 7, 9, 11, 12.5, 16.5, 22, 33][Math.max(1, Math.min(7, n))]}pt`);
    }
    if (tag === "body") hint("color", attr("text"));
    if (attr("valign")) out.set("vertical-align", attr("valign") ?? "");
    if (/^(td|th|table|col|colgroup|img|svg|hr|tr)$/.test(tag)) {
      const unit = (value: string | null) =>
        value && /^\d+(\.\d+)?$/.test(value.trim()) ? `${value.trim()}px` : value;
      hint("width", unit(attr("width")));
      hint("height", unit(attr("height")));
    }
    if (attr("nowrap") !== null && /^t[dh]$/.test(tag)) out.set("white-space", "nowrap");
    const list = [...(this.declared.get(el) ?? [])].sort((a, b) => a.weight - b.weight || a.order - b.order);
    const inline = attr("style") ? readDecls(attr("style") ?? "") : [];
    for (const pass of [false, true])
      for (const decls of [...list.map((one) => one.decls), inline])
        for (const [name, value, strong] of decls) {
          if (strong !== pass || name.startsWith("--")) continue;
          if (value.includes("var(")) spread(name, this.named(value), (one, what) => out.set(one, what));
          else out.set(name, value);
        }
    this.css.set(el, out);
    return out;
  }

  /** A value with the names in it looked up. */
  private named(value: string, deep = 0): string {
    if (deep > 6) return "";
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (_, name: string, other?: string) =>
      this.named(this.names.get(name) ?? other?.trim() ?? "", deep + 1),
    );
  }

  private lookOf(up: Look, el: Element, css: Css, block: boolean): Look {
    const tag = el.tagName.toLowerCase();
    const style: FlowStyle = { ...up.style };
    const look: Look = { ...up, style };
    if (block) {
      // A colour behind a block is not one behind its letters.
      delete style.highlight;
    }
    const head = /^h([1-6])$/.exec(tag);
    if (head) {
      style.size = HEADS[Number(head[1]) - 1];
      style.bold = true;
    }
    if (/^(b|strong|th|dt|summary|legend)$/.test(tag)) style.bold = true;
    if (/^(i|em|cite|dfn|var|address)$/.test(tag)) style.italic = true;
    if (/^(u|ins)$/.test(tag)) style.underline = true;
    if (/^(s|strike|del)$/.test(tag)) style.strike = true;
    if (tag === "sup") style.script = "super";
    if (tag === "sub") style.script = "sub";
    if (tag === "mark") style.highlight = "#ffff00";
    if (tag === "small") style.size = (style.size ?? 11) * 0.85;
    if (tag === "big") style.size = (style.size ?? 11) * 1.2;
    if (/^(code|kbd|samp|tt|pre|listing|xmp)$/.test(tag)) {
      style.font = "Courier New";
      if (up.style.font !== "Courier New") style.size = (style.size ?? 11) * 0.9;
    }
    if (tag === "a" && el.getAttribute("href")) {
      style.link = cleanLink(el.getAttribute("href") ?? "");
      if (style.link) {
        style.color = "#0563c1";
        style.underline = true;
      }
    }
    if (/^(th|caption|center)$/.test(tag)) look.align = "center";
    const side = tag === "center" ? "center" : block ? el.getAttribute("align")?.toLowerCase() : undefined;
    if (side === "center" || side === "right") look.place = side;
    else if (side) look.place = undefined;
    if (/^(pre|listing|xmp|textarea)$/.test(tag)) look.space = "pre";
    if (tag === "table") {
      look.indent = 0;
      // Old pages mean the table with their centring, not the words in it.
      if (this.doc.compatMode === "BackCompat") look.align = undefined;
    }

    const base = up.style.size ?? 11;
    const size = css.get("font-size")?.toLowerCase();
    if (size) {
      const points =
        SIZES[size] ??
        (size === "smaller" ? base / 1.2 : size === "larger" ? base * 1.2 : measure(size, base, base)) ??
        style.size;
      if (points !== undefined && points >= 1) style.size = Math.min(400, points);
    }
    const font = css.get("font-family");
    if (font) style.font = family(font) ?? style.font;
    const weight = css.get("font-weight")?.toLowerCase();
    if (weight) style.bold = /^(bold|bolder|[6-9]00)$/.test(weight) || (weight === "inherit" && up.style.bold);
    const slant = css.get("font-style")?.toLowerCase();
    if (slant) style.italic = /^(italic|oblique)/.test(slant) || (slant === "inherit" && up.style.italic);
    const drawn = css.get("text-decoration-line")?.toLowerCase();
    if (drawn) {
      style.underline = /underline/.test(drawn) || up.style.underline;
      style.strike = /line-through/.test(drawn) || up.style.strike || /^(s|strike|del)$/.test(tag);
      if (/^none/.test(drawn) && css.get("text-underline") === "none") style.underline = false;
    }
    const color = css.get("color");
    if (color) {
      const value = cssColor(color);
      if (value) style.color = solid(value);
      else if (/windowtext|auto|initial/i.test(color)) delete style.color;
      else if (/inherit/i.test(color)) style.color = up.style.color;
    }
    const back = cssColor(css.get("background-color") ?? "") ?? cssColor(css.get("mso-highlight") ?? "");
    if (back && back[3] > 0.05) {
      const fill = solid(back, look.fill ?? "#ffffff");
      look.fill = fill;
      if (!block && !/^t[dhr]$|^(thead|tbody|tfoot)$/.test(tag)) style.highlight = fill;
    }
    const place = css.get("vertical-align")?.toLowerCase();
    if (!block && place === "super") style.script = "super";
    else if (!block && place === "sub") style.script = "sub";
    else if (place === "baseline") delete style.script;
    const tracking = measure(css.get("letter-spacing"), style.size ?? 11);
    if (tracking !== null) style.tracking = tracking;
    else if (css.get("letter-spacing") === "normal") delete style.tracking;

    const align = css.get("text-align")?.toLowerCase().replace("-webkit-", "").replace("-moz-", "");
    if (align === "left" || align === "center" || align === "right" || align === "justify") look.align = align;
    else if (align === "middle") look.align = "center";
    else if (align === "start") look.align = "left";
    else if (align === "end") look.align = "right";
    const rtl = el.getAttribute("dir")?.toLowerCase() ?? css.get("direction");
    if (rtl === "rtl" && !align) look.align = "right";
    const indent = measure(css.get("text-indent"), style.size ?? 11, 450);
    if (indent !== null) look.indent = indent;
    const line = css.get("line-height")?.toLowerCase();
    if (line) look.line = this.lineOf(line, css, style.size ?? 11) ?? look.line;
    const space = css.get("white-space")?.toLowerCase();
    if (space === "pre" || space === "pre-wrap" || space === "break-spaces") look.space = "pre";
    else if (space === "pre-line") look.space = "line";
    else if (space === "normal" || space === "nowrap") look.space = "";
    const caps = css.get("text-transform")?.toLowerCase();
    if (caps)
      look.caps =
        caps === "uppercase" ? "upper" : caps === "lowercase" ? "lower" : caps === "capitalize" ? "title" : "";
    const variant = css.get("font-variant")?.toLowerCase() ?? css.get("font-variant-caps")?.toLowerCase();
    if (variant === "small-caps") look.caps = "small";
    const list = css.get("list-style-type");
    if (list) look.list = list;
    if (css.get("list-style-position")) look.inside = css.get("list-style-position") === "inside";
    return look;
  }

  private lineOf(value: string, css: Css, size: number): FlowPara["line"] {
    if (value === "normal") return { times: this.word ? 1 : 1.15 };
    const exact = css.get("mso-line-height-rule") === "exactly";
    const factor = /^\d*\.?\d+$/.test(value) ? Number(value) : /^\d*\.?\d+%$/.test(value) ? parseFloat(value) / 100 : 0;
    // Word counts in lines of the font; the web in the size of its letters, of which a line takes about 1.15.
    if (factor > 0) return { times: round(this.word ? factor : factor / 1.15) };
    const points = measure(value, size);
    if (points === null || points <= 0) return undefined;
    if (exact) return { points: round(points) };
    return /(em|ex)$/.test(value) ? { times: round(points / size / 1.15) } : { points: round(points), atLeast: true };
  }

  // ---------------------------------------------------------------- paragraphs

  private para(to: Holder, look: Look, spot: Spot) {
    if (to.open) return to.open;
    const { item } = spot;
    const left = spot.left;
    const para: FlowPara = { kind: "para", runs: [], line: look.line };
    if (look.align) para.align = look.align;
    if (left) para.left = round(left);
    if (spot.right) para.right = round(spot.right);
    if (item && !item.used) {
      para.list = item.list;
      para.first = -item.hang;
      this.counts.set(para, item.count);
      item.used = true;
    } else if (spot.first !== undefined || look.indent) para.first = round(spot.first ?? look.indent);
    if (spot.heading) {
      para.heading = spot.heading;
      para.keepNext = true;
    }
    const last = to.out[to.out.length - 1];
    para.before = round(Math.max(0, to.gap - (last?.kind === "para" ? (last.after ?? 0) : 0)));
    if (!last || last.kind === "break") para.before = 0;
    para.after = 0;
    to.gap = 0;
    if (to.breakNext) {
      if (to.out.length > 0) para.breakBefore = true;
      to.breakNext = false;
    }
    to.open = { para, blank: look.style, space: true, stops: spot.stops, room: spot.width };
    if (spot.keep) para.keepNext = true;
    if (spot.lead) {
      para.runs.push({ text: spot.lead, style: { ...look.style } });
      spot.lead = undefined;
      to.open.stops ??= [];
    }
    return to.open;
  }

  /** Ends the paragraph being filled. */
  private close(to: Holder) {
    const open = to.open;
    if (!open) return;
    to.open = null;
    const { runs } = open.para;
    // White space at the end of a line does not show, nor does one last line break.
    for (let i = runs.length - 1; i >= 0; i -= 1) {
      const piece = runs[i];
      if (piece.image) break;
      if (open.space) piece.text = piece.text.replace(/ +$/, "");
      const cut = piece.text.endsWith("\n");
      if (cut) piece.text = piece.text.slice(0, -1);
      if (cut || piece.text !== "") break;
    }
    open.para.runs = tidyRuns(runs, open.blank);
    if (this.word && !open.para.list && (open.para.first ?? 0) < 0) this.unwrite(open.para);
    if (open.stops) placeTabs(open.para, open.stops, open.room);
    // A paragraph kept open by a hard space is an empty line.
    if (/^[\u00a0 ]+$/.test(textOf(open.para)) && !open.para.runs.some((piece) => piece.image))
      open.para.runs = tidyRuns([], open.blank);
    if (open.para.breakBefore && isBlank(open.para) && !open.para.list) {
      // Only a page break stood on this line.
      to.breakNext = true;
      return;
    }
    to.out.push(open.para);
  }

  private text(to: Holder, source: string, look: Look, spot: Spot) {
    let text = source.replace(/[\u00ad\u200b\ufeff]/g, "").replace(/\r\n?/g, "\n");
    if (look.space === "pre") {
      text = text.replace(/\t/g, "    ");
      if (text === "") return;
      this.add(to, text, look, spot, false);
      return;
    }
    text =
      look.space === "line"
        ? text.replace(/[ \t\f]*\n[ \t\f]*/g, "\n").replace(/[ \t\f]+/g, " ")
        : text.replace(/[ \t\n\f]+/g, " ");
    if (!to.open && /^[ \n]*$/.test(text)) return;
    const open = this.para(to, look, spot);
    if (open.space) text = text.replace(/^ +/, "");
    if (text === "") return;
    this.add(to, text, look, spot, /[ \n]$/.test(text));
  }

  private add(to: Holder, source: string, look: Look, spot: Spot, space: boolean) {
    const open = this.para(to, look, spot);
    const style = { ...look.style };
    if (this.darkPage && !look.fill && style.color && lightness(style.color) > 0.45) delete style.color;
    let text = symbolText(style.font, source);
    if (text !== null && /^(symbol|wingdings|webdings)/i.test(style.font ?? "")) delete style.font;
    text ??= source;
    if (look.caps === "upper") text = text.toUpperCase();
    else if (look.caps === "lower") text = text.toLowerCase();
    else if (look.caps === "title")
      text = text.replace(/(^|[\s(“"'-])(\p{Ll})/gu, (_, before, sign) => before + sign.toUpperCase());
    else if (look.caps === "small") {
      for (const part of text.match(/\p{Ll}+|\P{Ll}+/gu) ?? []) {
        const small = /^\p{Ll}/u.test(part);
        open.para.runs.push({
          text: small ? part.toUpperCase() : part,
          style: small ? { ...style, size: (style.size ?? 11) * 0.8 } : style,
        });
      }
      open.space = space;
      return;
    }
    open.para.runs.push({ text, style });
    open.space = space;
  }

  // ---------------------------------------------------------------- walking

  private children(to: Holder, el: Element, look: Look, spot: Spot) {
    for (const node of el.childNodes) this.node(to, node, look, spot);
  }

  private node(to: Holder, node: Node, look: Look, spot: Spot) {
    if (node.nodeType === Node.TEXT_NODE) {
      this.text(to, node.nodeValue ?? "", look, spot);
      return;
    }
    if (!(node.nodeType === Node.ELEMENT_NODE)) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || (tag === "dialog" && !el.hasAttribute("open"))) return;
    const css = this.cssOf(el);
    const display = css.get("display")?.toLowerCase() ?? "";
    const hidden =
      display === "none" || /^(hidden|collapse)$/.test(css.get("visibility") ?? "") || css.get("mso-hide") === "all";
    if (hidden || el.hasAttribute("hidden")) return;
    if (/\bIgnore\b/i.test(css.get("mso-list") ?? "")) return;
    const wants = (name: string) => /^(always|page|left|right|recto|verso)$/.test(css.get(name)?.toLowerCase() ?? "");
    if (tag === "br") {
      if (wants("page-break-before") || wants("break-before")) {
        this.close(to);
        to.breakNext = true;
        return;
      }
      const open = this.para(to, look, spot);
      open.para.runs.push({ text: "\n", style: { ...look.style } });
      open.space = true;
      return;
    }
    if (tag === "img" || tag === "svg") return this.image(to, el, css, look, spot);
    const block = display ? /^(block|flex|grid|list-item|table|flow-root|-webkit-box)/.test(display) : BLOCK.has(tag);
    if (!block) return this.inline(to, el, tag, css, look, spot);
    this.close(to);
    if (wants("page-break-before") || wants("break-before")) to.breakNext = true;
    this.block(to, el, tag, css, look, spot);
    this.close(to);
    if (wants("page-break-after") || wants("break-after")) to.breakNext = true;
  }

  private inline(to: Holder, el: Element, tag: string, css: Css, up: Look, spot: Spot) {
    const look = this.lookOf(up, el, css, false);
    const tabs = Number(css.get("mso-tab-count") ?? 0);
    if (tabs > 0 && tabs < 20) this.add(to, "\t".repeat(tabs), look, spot, false);
    else if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      const value = el.getAttribute("value") ?? "";
      if (type === "checkbox") this.add(to, el.hasAttribute("checked") ? "☑" : "☐", look, spot, false);
      else if (type === "radio") this.add(to, el.hasAttribute("checked") ? "●" : "○", look, spot, false);
      else if (type !== "hidden" && type !== "image" && type !== "file")
        this.add(to, value || "__________", look, spot, false);
    } else if (tag === "select") {
      const option = el.querySelector("option[selected]") ?? el.querySelector("option");
      this.text(to, option?.textContent ?? "", look, spot);
    } else if (tag === "q") {
      this.add(to, "“", look, spot, false);
      this.children(to, el, look, spot);
      this.add(to, "”", look, spot, false);
    } else if (tag === "wbr") return;
    else this.children(to, el, look, spot);
  }

  private image(to: Holder, el: Element, css: Css, up: Look, spot: Spot) {
    const picture = this.pictures.get(el);
    if (!picture) return;
    const em = up.style.size ?? 11;
    let w = measure(css.get("width"), em, spot.width);
    let h = measure(css.get("height"), em);
    const ratio = picture.h / picture.w;
    if (w === null && h === null) w = picture.w * 0.75;
    if (w === null) w = (h ?? 0) / ratio;
    if (h === null) h = w * ratio;
    const room = Math.max(20, spot.width - spot.left - spot.right);
    const most = Math.min(1, room / w, 640 / h);
    const image: FlowImage = { bytes: picture.bytes, mime: picture.mime, w: round(w * most), h: round(h * most) };
    if (!(image.w > 0.5 && image.h > 0.5)) return;
    const alt = el.getAttribute("alt");
    if (alt) image.alt = alt;
    const display = css.get("display");
    const auto = css.get("margin-left") === "auto" && css.get("margin-right") === "auto";
    if (display === "block" || auto) {
      this.close(to);
      const open = this.para(to, auto ? { ...up, align: "center", indent: 0 } : up, spot);
      open.para.runs.push({ image });
      this.close(to);
      return;
    }
    const open = this.para(to, up, spot);
    open.para.runs.push({ image });
    open.space = false;
  }

  private block(to: Holder, el: Element, tag: string, css: Css, up: Look, spot: Spot) {
    const look = this.lookOf(up, el, css, true);
    const size = look.style.size ?? 11;
    const em = up.style.size ?? 11;
    const head = /^h([1-6])$/.exec(tag);
    const inList = tag === "li" || /^(ul|ol|menu|dir)$/.test(tag);
    // What browsers give these tags on their own, a little closer together.
    let [before, after, left, right] = [0, 0, 0, 0];
    if (tag === "p") after = 8;
    else if (head) [before, after] = [HEAD_BEFORE[Number(head[1]) - 1], 4];
    else if (/^(ul|ol|menu|dir|dl)$/.test(tag)) after = look.depth > 0 ? 0 : 8;
    else if (tag === "li") after = 2;
    else if (tag === "blockquote") [left, after] = [18, 8];
    else if (tag === "pre" || tag === "figure") [before, after] = [4, 8];
    else if (tag === "dd") left = 30;
    else if (tag === "fieldset") [before, after] = [4, 8];
    else if (tag === "figcaption" || tag === "caption") [before, after] = [2, 4];
    const side = (name: string, usual: number) =>
      measure(css.get(name), size, spot.width) ?? (css.get(name) ? 0 : usual);
    before = Math.max(0, side("margin-top", before));
    after = Math.max(0, side("margin-bottom", after));
    if (!inList || tag === "li") {
      left = side("margin-left", left);
      right = side("margin-right", right);
    }
    const pad = { top: 0, right: 0, bottom: 0, left: 0 };
    if (tag !== "table" && !inList)
      for (const one of SIDES)
        pad[one] =
          Math.max(0, measure(css.get(`padding-${one}`), size, spot.width) ?? 0) +
          (borderOf(css, one, size, "#000000")?.width ?? 0);
    to.gap = Math.max(to.gap, before);

    if (tag === "table" || css.get("display") === "table") {
      if (
        tag === "table" &&
        this.table(to, el as HTMLTableElement, css, look, { ...spot, left: spot.left + left, item: undefined })
      )
        to.gap = Math.max(to.gap, after || (this.word ? 0 : 8));
      return;
    }
    if (tag === "hr") {
      const color = cssColor(
        css.get("border-top-color") ??
          css.get("background-color") ??
          css.get("color") ??
          el.getAttribute("color") ??
          "",
      );
      const width = measure(css.get("border-top-width"), em) ?? measure(css.get("height"), em) ?? 0.75;
      if (css.get("page-break-after") === "always" || css.get("page-break-before") === "always") {
        to.breakNext = true;
        return;
      }
      to.out.push({
        kind: "rule",
        color: color ? solid(color) : "#a0a0a0",
        width: round(Math.max(0.25, Math.min(6, width || 0.75))),
      });
      to.gap = Math.max(6, after);
      return;
    }
    const start = to.out.length;
    const inner: Spot = { ...spot, heading: undefined, first: undefined, stops: stopsOf(css) ?? spot.stops };
    if (css.get("page-break-after") === "avoid" || css.get("break-after") === "avoid") inner.keep = true;
    inner.left = Math.max(0, spot.left + left + pad.left);
    inner.right = Math.max(0, spot.right + right + pad.right);
    if (head) inner.heading = Number(head[1]) as FlowPara["heading"];
    if (tag === "li") this.item(to, el, css, look, inner);
    else if (inList) this.list(to, el, tag, css, look, spot);
    else if (tag === "pre" || (look.space === "pre" && el.children.length === 0)) this.pre(to, el, look, inner);
    else {
      const mark = /\bl\d+\s+level(\d)/i.exec(css.get("mso-list") ?? "");
      if (mark) this.wordItem(el, css, Number(mark[1]) - 1, look, inner);
      this.children(to, el, look, inner);
    }
    this.close(to);

    // What stands around the block goes to the paragraphs in it.
    const fill = cssColor(css.get("background-color") ?? "");
    let box = fill && fill[3] > 0.05 ? look.fill : undefined;
    const lines: FlowPara["border"] = {};
    for (const one of SIDES) {
      const line = borderOf(css, one, size, look.style.color ?? "#000000");
      if (line) lines[one] = line;
    }
    if (tag === "pre" && !box) box = "#f4f4f5";
    if (tag === "blockquote" && !css.get("border-left-style")) lines.left = { color: "#c8c8c8", width: 2.25 };
    if (/^(body|html)$/.test(tag)) box = undefined;
    const made = to.out.slice(start);
    made.forEach((one, i) => {
      if (one.kind !== "para") return;
      if (box && !one.fill) one.fill = box;
      const border = { ...one.border };
      if (lines.left && !border.left && !one.list) border.left = lines.left;
      if (lines.right && !border.right) border.right = lines.right;
      if (lines.top && i === 0) border.top = lines.top;
      if (lines.bottom && i === made.length - 1) border.bottom = lines.bottom;
      if (Object.keys(border).length > 0) one.border = border;
    });
    const last = to.out[to.out.length - 1];
    if (made.length > 0 && last.kind === "para") {
      last.after = round(Math.max(last.after ?? 0, after + pad.bottom));
      if (!css.has("margin-bottom") && pad.bottom === 0) this.soft.add(last);
      else this.soft.delete(last);
    } else to.gap = Math.max(to.gap, after);
    if (made.length > 0 && made[0].kind === "para" && pad.top > 0)
      made[0].before = round((made[0].before ?? 0) + pad.top);
  }

  // ---------------------------------------------------------------- lists

  private list(to: Holder, el: Element, tag: string, css: Css, up: Look, spot: Spot) {
    const size = up.style.size ?? 11;
    const level = up.depth;
    const ordered = tag === "ol";
    const kinds: Record<string, string> = {
      "1": "decimal",
      a: "lower-alpha",
      A: "upper-alpha",
      i: "lower-roman",
      I: "upper-roman",
    };
    const type = el.getAttribute("type") ?? "";
    const own =
      css.get("list-style-type") ??
      kinds[type] ??
      (/^(disc|circle|square)$/i.test(type) ? type.toLowerCase() : undefined);
    const look: Look = {
      ...up,
      depth: level + 1,
      indent: 0,
      list: own ?? (ordered ? "decimal" : ["disc", "circle", "square"][Math.min(level, 2)]),
    };
    const room = measure(css.get("padding-left"), size, spot.width);
    const out = measure(css.get("margin-left"), size, spot.width) ?? 0;
    const step = room === null && css.get("padding-left") === undefined ? 30 + out : (room ?? 0) + out;
    const items = [...el.children].filter((child) => child.tagName.toLowerCase() === "li");
    const start = Number(el.getAttribute("start") ?? "1");
    let count = Number.isFinite(start) ? start : 1;
    const back = el.hasAttribute("reversed");
    if (back && !el.hasAttribute("start")) count = items.length;
    const longest = String(Math.max(count, count + items.length)).length;
    const inner: Spot = { ...spot, left: spot.left + Math.max(step, 0), first: undefined, item: undefined };
    const last = to.out[to.out.length - 1];
    if (level > 0 && last?.kind === "para") last.after = Math.max(last.after ?? 0, 2);
    for (const child of el.childNodes) {
      if (!(child.nodeType === Node.ELEMENT_NODE) || (child as Element).tagName.toLowerCase() !== "li") {
        this.node(to, child, look, { ...inner });
        continue;
      }
      const li = child as Element;
      const value = Number(li.getAttribute("value") ?? "NaN");
      if (Number.isFinite(value)) count = value;
      const spotOf: Spot = { ...inner };
      this.node(
        to,
        li,
        { ...look, list: kinds[li.getAttribute("type") ?? ""] ?? look.list },
        {
          ...spotOf,
          item: { list: { type: "number", mark: "1.", level }, count, hang: longest > 2 ? 12 + longest * 6 : 18 },
        },
      );
      count += back ? -1 : 1;
    }
    this.close(to);
  }

  private item(to: Holder, el: Element, css: Css, look: Look, spot: Spot) {
    const item = spot.item;
    const kind = (look.list ?? "disc").replace(/^["']|["']$/g, "");
    const box = this.checkbox(el);
    const marks: Record<string, string> = {
      decimal: "1.",
      "decimal-leading-zero": "1.",
      "lower-alpha": "a.",
      "lower-latin": "a.",
      "upper-alpha": "A.",
      "upper-latin": "A.",
      "lower-roman": "i.",
      "upper-roman": "I.",
    };
    const bullets: Record<string, string> = {
      disc: "•",
      circle: "◦",
      square: "▪",
      "disclosure-closed": "▸",
      "disclosure-open": "▾",
    };
    const quoted = /^["'].*["']$/.test(look.list ?? "");
    const depth = Math.max(0, look.depth - 1);
    const none = !box && !quoted && kind === "none";
    if (!item || none) {
      // A list without marks is only a set of lines.
      spot.item = undefined;
      if (none && css.get("padding-left") === undefined) spot.left = Math.max(0, spot.left);
    } else {
      const mark = box ?? (quoted ? kind.trim() || "•" : (bullets[kind] ?? marks[kind] ?? "1."));
      const type = box || quoted || bullets[kind] ? "bullet" : "number";
      item.list = { type, mark, level: Math.min(8, depth) };
      spot.item = item;
      spot.left = Math.max(spot.left, item.hang);
    }
    const before = to.out.length;
    // A list inside an item comes after its words; with none, the mark has nothing to stand before.
    const first = [...el.childNodes].find(
      (node) => node.nodeType !== Node.COMMENT_NODE && (node.nodeValue ?? "x").trim() !== "",
    );
    if (first?.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((first as Element).tagName)) spot.item = undefined;
    this.children(to, el, { ...look, indent: 0 }, spot);
    if (to.out.length === before && !to.open && spot.item && !spot.item.used) this.para(to, look, spot);
  }

  /** A box at the start of an item is its mark. */
  private checkbox(el: Element): string | null {
    const input = el.querySelector("input[type=checkbox i]");
    if (!input || input.closest("li") !== el) return null;
    for (let node: Node | null = input; node && node !== el; node = node.parentNode)
      for (let before = node.previousSibling; before; before = before.previousSibling)
        if ((before.textContent ?? "").trim() !== "") return null;
    const mark = input.hasAttribute("checked") ? "☑" : "☐";
    input.remove();
    return mark;
  }

  /** A list item of Word's, which is a paragraph with its mark written in front. */
  private wordItem(el: Element, css: Css, level: number, look: Look, spot: Spot) {
    const ignored = [...el.querySelectorAll("span")].find((span) =>
      /\bIgnore\b/i.test(this.cssOf(span).get("mso-list") ?? ""),
    );
    const source = ignored?.textContent?.replace(/[\s\u00a0]+/g, " ").trim() ?? "";
    if (!ignored || !source) return;
    // The font of the mark itself, which any of the elements around it may name.
    let font = "";
    let node: Node | null = [...textNodes(ignored)].find((one) => (one.nodeValue ?? "").trim() !== "") ?? null;
    for (node = node?.parentNode ?? null; node && node !== el && !font; node = node.parentNode)
      font = family(this.cssOf(node as Element).get("font-family") ?? "") ?? "";
    const shown = symbolText(font, source) ?? source;
    const key = `${/\bl\d+/.exec(css.get("mso-list") ?? "")?.[0]} ${level}`;
    const was = this.wordLists.get(key);
    const found = listOfMark(shown, level, was?.count ?? 0);
    if (!found) {
      // "1.2.3" and the like: letters here, as the editor counts one level only.
      spot.lead = `${shown}\t`;
      return;
    }
    for (const other of [...this.wordLists.keys()])
      if (other.startsWith(`${key.split(" ")[0]} `) && Number(other.split(" ")[1]) > level)
        this.wordLists.delete(other);
    this.wordLists.set(key, { mark: found.list.mark, count: found.count });
    spot.item = { list: found.list, count: found.count, hang: look.indent < 0 ? round(-look.indent) : 18 };
    if (look.indent >= 0) spot.left += 18;
  }

  /** Word's smaller pages write marks out as letters, with tiny spaces up to the words. */
  private unwrite(para: FlowPara) {
    const [mark, gap, ...rest] = para.runs;
    if (mark?.text === undefined || gap?.text === undefined || rest.length === 0) return;
    if (gap.style.size !== 7 || !/^[\u00a0 ]+$/.test(gap.text) || !/^\S{1,14}$/.test(mark.text)) return;
    const level = Math.max(0, Math.min(8, Math.round((para.left ?? 0) / 36) - 1));
    const key = `written ${level}`;
    const found = listOfMark(mark.text, level, this.wordLists.get(key)?.count ?? 0);
    if (!found) {
      para.runs = [{ text: `${mark.text}\t`, style: mark.style }, ...rest];
      placeTabs(para, [], 450);
      return;
    }
    for (const other of [...this.wordLists.keys()])
      if (other.startsWith("written ") && Number(other.slice(8)) > level) this.wordLists.delete(other);
    this.wordLists.set(key, { mark: found.list.mark, count: found.count });
    para.list = found.list;
    para.runs = rest;
    this.counts.set(para, found.count);
  }

  /** Lines that stay as they are typed. */
  private pre(to: Holder, el: Element, look: Look, spot: Spot) {
    const part: Holder = { out: [], open: null, gap: 0, breakNext: false };
    const inside: Look = {
      ...look,
      space: "pre",
      line: this.cssOf(el).has("line-height") ? look.line : { times: 1 },
      indent: 0,
    };
    this.children(part, el, inside, { ...spot, item: undefined });
    this.close(part);
    const gap = to.gap;
    let first = true;
    for (const block of part.out) {
      if (block.kind !== "para") {
        to.out.push(block);
        continue;
      }
      // One paragraph a line, so that long listings can go on over the page.
      const lines: FlowRun[][] = [[]];
      for (const piece of block.runs) {
        if (piece.image) {
          lines[lines.length - 1].push(piece);
          continue;
        }
        piece.text.split("\n").forEach((text, i) => {
          if (i > 0) lines.push([]);
          lines[lines.length - 1].push({ text, style: { ...piece.style } });
        });
      }
      if (lines.length > 1 && lines[0].every((piece) => piece.text === "")) lines.shift();
      while (lines.length > 1 && lines[lines.length - 1].every((piece) => piece.text === "")) lines.pop();
      for (const line of lines) {
        to.gap = first ? gap : 0;
        const { para } = this.para(to, inside, first ? spot : { ...spot, item: undefined });
        to.open = null;
        para.runs = tidyRuns(line, inside.style);
        to.out.push(para);
        first = false;
      }
    }
    to.gap = 0;
  }

  // ---------------------------------------------------------------- tables

  /** False when the table only arranges things below each other: its cells come out as they are. */
  private table(to: Holder, el: HTMLTableElement, css: Css, look: Look, spot: Spot): boolean {
    const gone = (one: Element) => this.cssOf(one).get("display") === "none" || one.hasAttribute("hidden");
    const rows = [...el.rows].filter((row) => !gone(row) && !(row.parentElement && gone(row.parentElement)));
    if (rows.length === 0) return false;
    const single = rows.every((row) => row.cells.length <= 1);
    if (single && rows.every((row) => [...row.cells].every((cell) => this.bare(cell))) && this.bare(el)) {
      for (const row of rows) for (const cell of row.cells) if (!gone(cell)) this.walkCell(to, cell, look, spot);
      return true;
    }
    const size = look.style.size ?? 11;
    const caption = el.caption;
    if (caption) {
      this.close(to);
      this.block(to, caption, "caption", this.cssOf(caption), look, spot);
    }
    const room = Math.max(40, spot.width - spot.left - spot.right);
    const ruled =
      Number(el.getAttribute("border") ?? "0") > 0 || (el.hasAttribute("border") && el.getAttribute("border") === "");
    const table: FlowTable = { kind: "table", cols: [], rows: [] };
    const taken: number[] = [];
    const placed: { cell: FlowCell; col: number; css: Css; nowrap: boolean }[] = [];
    let cols = 0;
    rows.forEach((row, r) => {
      const group = row.parentElement && row.parentElement !== el ? row.parentElement : null;
      const groupLook = group ? this.lookOf(look, group, this.cssOf(group), true) : look;
      const rowCss = this.cssOf(row);
      const rowLook = this.lookOf(groupLook, row, rowCss, true);
      const flowRow: FlowRow = { cells: [] };
      const high = measure(rowCss.get("height"), size);
      if (high) flowRow.h = round(high);
      if (group?.tagName.toLowerCase() === "thead") flowRow.head = true;
      let col = 0;
      for (const cellEl of row.cells) {
        if (gone(cellEl)) continue;
        while ((taken[col] ?? 0) > r) col += 1;
        const wide = Math.max(1, Math.min(60, cellEl.colSpan || 1));
        const tall =
          cellEl.rowSpan === 0 ? rows.length - r : Math.max(1, Math.min(rows.length - r, cellEl.rowSpan || 1));
        const cellCss = this.cssOf(cellEl);
        const cellLook = this.lookOf(rowLook, cellEl, cellCss, true);
        const inner: Holder = { out: [], open: null, gap: 0, breakNext: false };
        this.children(inner, cellEl, { ...cellLook, indent: 0 }, { left: 0, right: 0, width: room });
        this.close(inner);
        const blocks = flatten(inner.out);
        if (blocks.length === 0)
          blocks.push({ kind: "para", runs: tidyRuns([], cellLook.style), line: cellLook.line, before: 0, after: 0 });
        // Space the page did not ask for is not needed below the last paragraph: the cell has its own.
        if (this.soft.has(blocks[blocks.length - 1])) blocks[blocks.length - 1].after = 0;
        blocks[0].before = 0;
        for (const block of blocks) delete block.breakBefore;
        const cell: FlowCell = { blocks };
        if (wide > 1) cell.colSpan = wide;
        if (tall > 1) cell.rowSpan = tall;
        if (cellLook.fill && cellLook.fill !== look.fill) cell.fill = cellLook.fill;
        const upright = (cellCss.get("vertical-align") ?? rowCss.get("vertical-align") ?? "middle").toLowerCase();
        cell.valign = upright === "top" || upright === "baseline" ? "top" : upright === "bottom" ? "bottom" : "middle";
        cell.border = {};
        for (const side of SIDES) {
          let line = borderOf(cellCss, side, size, cellLook.style.color ?? "#000000");
          if (line === undefined && (side === "top" || side === "bottom"))
            line = borderOf(rowCss, side, size, "#000000");
          cell.border[side] = line === undefined && ruled ? { color: "#808080", width: 0.75 } : (line ?? null);
        }
        flowRow.cells.push(cell);
        placed.push({ cell, col, css: cellCss, nowrap: cellCss.get("white-space") === "nowrap" });
        for (let c = col; c < col + wide; c += 1) taken[c] = Math.max(taken[c] ?? 0, r + tall);
        col += wide;
        cols = Math.max(cols, col);
      }
      table.rows.push(flowRow);
    });
    if (cols === 0) return false;

    // Lines around the table itself.
    let at = 0;
    table.rows.forEach((row, r) => {
      for (const cell of row.cells) {
        const { col } = placed[at];
        at += 1;
        const border = cell.border ?? {};
        if (r === 0) border.top ??= borderOf(css, "top", size, "#000000") ?? null;
        if (r + (cell.rowSpan ?? 1) >= table.rows.length)
          border.bottom ??= borderOf(css, "bottom", size, "#000000") ?? null;
        if (col === 0) border.left ??= borderOf(css, "left", size, "#000000") ?? null;
        if (col + (cell.colSpan ?? 1) >= cols) border.right ??= borderOf(css, "right", size, "#000000") ?? null;
      }
    });

    const padding = measure(placed[0]?.css.get("padding-left"), size);
    const padTop = measure(placed[0]?.css.get("padding-top"), size);
    const given = el.hasAttribute("cellpadding") ? Number(el.getAttribute("cellpadding")) * 0.75 : null;
    const x = Math.max(1, Math.min(24, padding ?? given ?? 4));
    const y = Math.max(0, Math.min(24, padTop ?? given ?? 2));
    table.pad = { top: round(y), right: round(x), bottom: round(y), left: round(x) };
    table.cols = this.columns(el, css, placed, cols, room, x * 2, size);
    for (const { cell, col } of placed) {
      const width = table.cols.slice(col, col + (cell.colSpan ?? 1)).reduce((sum, one) => sum + one, 0) - x * 2;
      for (const block of cell.blocks)
        for (const piece of block.runs)
          if (piece.image && piece.image.w > width && width > 4) {
            piece.image.h = round((piece.image.h * width) / piece.image.w);
            piece.image.w = round(width);
          }
      whiteOnDark(cell.blocks, cell.fill);
    }
    const align = el.getAttribute("align")?.toLowerCase();
    const auto = css.get("margin-left") === "auto" && css.get("margin-right") === "auto";
    const place = align ?? (auto ? "center" : css.get("margin-left") === "auto" ? "right" : look.place);
    if (place === "center" || place === "right") table.align = place;
    if (spot.left && !table.align) table.left = round(spot.left);
    settleBorders(table);
    this.close(to);
    const last = to.out[to.out.length - 1];
    if (last?.kind === "para") last.after = round(Math.max(last.after ?? 0, to.gap));
    else if (last?.kind === "table")
      to.out.push({ kind: "para", runs: [{ text: "", style: { size: 6 } }], line: { points: 8 }, before: 0, after: 0 });
    to.gap = 0;
    if (to.breakNext) {
      if (to.out.length > 0) to.out.push({ kind: "break" });
      to.breakNext = false;
    }
    to.out.push(table);
    return true;
  }

  /** Nothing is drawn around or behind it. */
  private bare(el: Element): boolean {
    const css = this.cssOf(el);
    const fill = cssColor(css.get("background-color") ?? "");
    if (el.hasAttribute("border") && el.getAttribute("border") !== "0") return false;
    return !(fill && fill[3] > 0.05) && SIDES.every((side) => !borderOf(css, side, 11, "#000000"));
  }

  private walkCell(to: Holder, cell: Element, look: Look, spot: Spot) {
    const inner = this.lookOf(look, cell, this.cssOf(cell), true);
    this.close(to);
    this.children(to, cell, inner, { ...spot });
    this.close(to);
  }

  /** Widths as a browser shares them out: what is asked for, then by how much there is to show. */
  private columns(
    el: HTMLTableElement,
    css: Css,
    placed: { cell: FlowCell; col: number; css: Css; nowrap: boolean }[],
    count: number,
    room: number,
    pad: number,
    size: number,
  ): number[] {
    const least = Array<number>(count).fill(8 + pad);
    const most = Array<number>(count).fill(8 + pad);
    const asked = Array<number | null>(count).fill(null);
    const parts = Array<number | null>(count).fill(null);
    const ask = (col: number, value: string | undefined) => {
      if (!value || col >= count) return;
      if (/%$/.test(value)) parts[col] = Math.max(parts[col] ?? 0, parseFloat(value) / 100);
      else asked[col] = Math.max(asked[col] ?? 0, measure(value, size) ?? 0) || null;
    };
    let at = 0;
    for (const colEl of el.querySelectorAll("col")) {
      if (colEl.closest("table") !== el) continue;
      for (let i = 0; i < Math.max(1, (colEl as HTMLTableColElement).span || 1); i += 1) {
        ask(at, this.cssOf(colEl).get("width"));
        at += 1;
      }
    }
    for (const { cell, col, css: own, nowrap } of placed) {
      if ((cell.colSpan ?? 1) > 1) continue;
      ask(col, own.get("width"));
      for (const block of cell.blocks) {
        const inset = (block.left ?? 0) + (block.right ?? 0) + pad;
        let line: FlowRun[] = [];
        const take = () => {
          const width = runsWidth(line) + inset + 1;
          most[col] = Math.max(most[col], width);
          if (nowrap) least[col] = Math.max(least[col], width);
          line = [];
        };
        for (const piece of block.runs) {
          if (piece.image) {
            line.push(piece);
            least[col] = Math.max(least[col], Math.min(piece.image.w, room / 2) + inset);
            continue;
          }
          piece.text.split("\n").forEach((text, i) => {
            if (i > 0) take();
            line.push({ text, style: piece.style });
          });
          let longest = "";
          for (const word of piece.text.split(/[\s\u200b-]+/)) if (word.length > longest.length) longest = word;
          least[col] = Math.max(least[col], Math.min(room / 2, textWidth(longest, piece.style) + inset + 1));
        }
        take();
      }
    }
    // Cells over several columns stretch them when they need more.
    for (const { cell, col } of placed) {
      const wide = cell.colSpan ?? 1;
      if (wide < 2) continue;
      const need = Math.max(...cell.blocks.map((block) => runsWidth(block.runs) + pad));
      const have = most.slice(col, col + wide).reduce((sum, one) => sum + one, 0);
      if (need > have)
        for (let c = col; c < Math.min(count, col + wide); c += 1) most[c] += (Math.min(need, room) - have) / wide;
    }
    const sum = (list: number[]) => list.reduce((total, one) => total + one, 0);
    const wanted = css.get("width");
    const full = measure(wanted, size, room);
    for (let c = 0; c < count; c += 1) {
      if (asked[c] !== null) most[c] = Math.max(asked[c] ?? 0, Math.min(least[c], room / count));
      most[c] = Math.max(most[c], 10);
      least[c] = Math.min(least[c], most[c]);
    }
    let total = full !== null && full > 0 ? Math.min(room, full) : Math.min(room, sum(most));
    if (full === null && parts.some((part) => part !== null)) total = room;
    const out = [...most];
    let left = total;
    let share = 0;
    for (let c = 0; c < count; c += 1) {
      const part = parts[c];
      if (part === null) share += most[c];
      else {
        out[c] = Math.max(10, part * total);
        left -= out[c];
      }
    }
    const free = out.map((_, c) => parts[c] === null);
    const firm = free.map(
      (is, c) => is && asked[c] !== null && asked.some((one, k) => one === null && parts[k] === null),
    );
    const have = sum(out.filter((_, c) => free[c]));
    if (share > 0 && have > left) {
      // Too little room: everyone keeps the longest word, the rest is cut evenly.
      const floor = sum(least.filter((_, c) => free[c]));
      const spare = Math.max(0, left - floor);
      const extra = sum(most.map((one, c) => (free[c] ? one - least[c] : 0)));
      for (let c = 0; c < count; c += 1)
        if (free[c])
          out[c] =
            floor >= left
              ? (least[c] / floor) * left
              : least[c] + (extra > 0 ? ((most[c] - least[c]) / extra) * spare : 0);
    } else if (share > 0 && have < left) {
      const soft = sum(out.filter((_, c) => free[c] && !firm[c])) || 1;
      for (let c = 0; c < count; c += 1) if (free[c] && !firm[c]) out[c] += (out[c] / soft) * (left - have);
    }
    const now = sum(out);
    return out.map((one) => round(now > room + 0.5 ? (one / now) * room : one));
  }

  // ---------------------------------------------------------------- the whole page

  private section(css: Css | undefined): FlowSection {
    const page: FlowSection = { w: A4.w, h: A4.h, margin: { ...A4.margin }, blocks: [] };
    if (!css) return page;
    const known: Record<string, [number, number]> = {
      a3: [841.89, 1190.55],
      a4: [595.28, 841.89],
      a5: [419.53, 595.28],
      letter: [612, 792],
      legal: [612, 1008],
      ledger: [792, 1224],
    };
    const size = (css.get("size") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const named = size.map((word) => known[word]).find(Boolean);
    const lengths = size.map((word) => measure(word, 11)).filter((one): one is number => one !== null);
    if (named) [page.w, page.h] = named;
    else if (lengths.length > 0) [page.w, page.h] = [lengths[0], lengths[1] ?? lengths[0]];
    if (size.includes("landscape") && page.w < page.h) [page.w, page.h] = [page.h, page.w];
    for (const side of SIDES) {
      const margin = measure(css.get(`margin-${side}`), 11, page.w);
      if (margin !== null) page.margin[side] = round(margin >= 12 ? margin : 36);
    }
    const columns = /^(\d)/.exec(css.get("mso-columns") ?? "");
    if (columns && Number(columns[1]) > 1) {
      page.columns = Number(columns[1]);
      page.gap = measure(words(css.get("mso-columns") ?? "").pop(), 11) ?? 36;
    }
    const head = measure(css.get("mso-header-margin"), 11);
    const foot = measure(css.get("mso-footer-margin"), 11);
    if (head !== null) page.headerAt = round(head);
    if (foot !== null) page.footerAt = round(foot);
    if (!(page.w > 100 && page.h > 100) || page.w - page.margin.left - page.margin.right < 72)
      Object.assign(page, { w: A4.w, h: A4.h, margin: { ...A4.margin } });
    return page;
  }

  sections(): FlowSection[] {
    const { body } = this.doc;
    const start: Look = {
      style: { size: 11 },
      line: { times: this.word ? 1 : 1.15 },
      indent: 0,
      space: "",
      caps: "",
      depth: 0,
    };
    const htmlCss = this.cssOf(this.doc.documentElement);
    const bodyCss = this.cssOf(body);
    const paper = cssColor(bodyCss.get("background-color") ?? htmlCss.get("background-color") ?? "");
    this.darkPage = paper !== null && paper[3] > 0.5 && lightness(solid(paper)) < 0.3;
    rootSize = 11;
    const outer = this.lookOf(start, this.doc.documentElement, htmlCss, true);
    rootSize = outer.style.size ?? 11;
    let look = this.lookOf(outer, body, bodyCss, true);
    // The page's own frame: its space around the text is the paper's margin here.
    look = { ...look, fill: undefined, indent: 0 };
    let root: Element = body;
    for (let deep = 0; deep < 12; deep += 1) {
      const inner = [...root.children].filter((child) => !SKIP.has(child.tagName.toLowerCase()));
      const words = [...root.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? "").trim() !== "",
      );
      const only = inner.length === 1 && !words ? inner[0] : null;
      if (!only || !/^(div|main|article|section|center|form)$/i.test(only.tagName)) break;
      const css = this.cssOf(only);
      if (css.get("page") || this.cssOf(only).get("display") === "none") break;
      look = this.lookOf(look, only, css, true);
      if (only.tagName === "CENTER") look.align = "center";
      root = only;
    }
    const pieces: { nodes: Node[]; page: Css | undefined }[] = [];
    for (const node of root.childNodes) {
      const name = node.nodeType === Node.ELEMENT_NODE ? this.cssOf(node as Element).get("page") : undefined;
      const last = pieces[pieces.length - 1];
      if (name !== undefined && this.pages.has(name))
        pieces.push({ nodes: [...node.childNodes], page: this.pages.get(name) });
      else if (last && (last.page === undefined || (node.textContent ?? "").trim() === "")) last.nodes.push(node);
      else if ((node.textContent ?? "").trim() !== "" || node.nodeType === Node.ELEMENT_NODE)
        pieces.push({ nodes: [node], page: last?.page });
    }
    const out: FlowSection[] = [];
    for (const { nodes, page } of pieces) {
      const section = this.section(page ?? this.pages.get(""));
      const to: Holder = { out: section.blocks, open: null, gap: 0, breakNext: false };
      const width = section.w - section.margin.left - section.margin.right;
      for (const node of nodes) this.node(to, node, look, { left: 0, right: 0, width });
      this.close(to);
      this.finish(section);
      if (section.blocks.length > 0 || out.length === 0) out.push(section);
    }
    if (out.length === 0) out.push(this.section(this.pages.get("")));
    return out;
  }

  private finish(section: FlowSection) {
    const { blocks } = section;
    const strip = (para: FlowPara) => {
      if (!para.left) delete para.left;
      if (!para.right) delete para.right;
      if (!para.first) delete para.first;
    };
    for (const block of blocks) {
      if (block.kind === "para") {
        strip(block);
        whiteOnDark([block], block.fill);
      } else if (block.kind === "table")
        for (const row of block.rows)
          for (const cell of row.cells) {
            cell.blocks.forEach(strip);
            joinFrames(cell.blocks);
            setStarts(cell.blocks, this.counts);
          }
    }
    joinFrames(blocks);
    setStarts(blocks, this.counts);
  }
}

export async function readHtml(html: string, options: { title?: string } = {}): Promise<FlowDoc> {
  const archive = isWebArchive(html) ? openArchive(html) : null;
  const doc = new DOMParser().parseFromString(archive?.html ?? html, "text/html");
  const page = new Page(doc, archive);
  await page.load();
  const out: FlowDoc = { kind: "flow", sections: page.sections() };
  if (out.sections.every((section) => section.blocks.length === 0) && doc.querySelector("script"))
    throw new ConvertError(
      "This page only shows something while its scripts run. Open it in a browser, print it to PDF and open that.",
    );
  const title = doc.title.trim() || options.title;
  if (title) out.title = title;
  const author = doc.querySelector("meta[name=author i]")?.getAttribute("content")?.trim();
  if (author) out.author = author;
  return out;
}

// ---------------------------------------------------------------- Markdown

type Md =
  | { kind: "p" | "html"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "code"; text: string }
  | { kind: "quote"; inner: Md[] }
  | { kind: "list"; start: number | null; tight: boolean; items: Md[][] }
  | { kind: "hr" }
  | { kind: "table"; align: string[]; rows: string[][] };

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PUNCT = "!\"#$%&'()*+,\\-./:;<=>?@\\[\\]\\\\^_`{|}~";
const unescape = (text: string) => text.replace(new RegExp(`\\\\([${PUNCT}])`, "g"), "$1");

const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\n]*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])(?:( +)(.*)|)$/;
const ROW = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const TITLE = `(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\([^()]*\\))`;
const DEFINITION = new RegExp(
  `^ {0,3}\\[((?:[^[\\]\\\\]|\\\\.)+)\\]:[ \\t]*(?:<([^<>\\n]*)>|(\\S+))(?:[ \\t]+${TITLE})?[ \\t]*$`,
);
const NOTE = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;
const HTML_TAGS = new RegExp(
  "^ {0,3}</?(?:address|article|aside|base|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|" +
    "dt|fieldset|figcaption|figure|footer|form|frame|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|" +
    "menuitem|nav|noframes|ol|optgroup|option|p|param|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|" +
    "ul)(?:\\s|/?>|$)",
  "i",
);
/** The attributes of a tag. */
const ATTRS = `(?:\\s+[\\w:.-]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?)*`;
const HTML_ALONE = new RegExp(`^ {0,3}</?[a-z][\\w-]*${ATTRS}\\s*/?>\\s*$`, "i");
const HTML_INLINE = new RegExp(
  `^<(?:/[a-z][\\w-]*\\s*|[a-z][\\w-]*${ATTRS}\\s*/?|!--[\\s\\S]*?--|\\?[\\s\\S]*?\\?)>`,
  "i",
);
/** Where a link goes, in brackets: "(address "title")". */
const TARGET = new RegExp(
  `^\\(\\s*(?:<((?:[^<>\\n\\\\]|\\\\.)*)>|((?:[^\\s()\\\\]|\\\\.|\\((?:[^\\s()\\\\]|\\\\.|\\([^\\s()]*\\))*\\))*))` +
    `(?:\\s+${TITLE})?\\s*\\)`,
);

const labelOf = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Stands before a line that only goes on with the paragraph above, whatever it looks like. */
const LAZY = "\u0002";

class Markdown {
  private links = new Map<string, string>();
  private notes = new Map<string, string>();
  private used: string[] = [];

  render(source: string): string {
    // Settings some programs write before the text.
    const text = source.replace(
      /^\ufeff?---[ \t]*\n(?=[\s#]*[\w"'-][^\n]*:)[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/,
      "",
    );
    const lines = text.split("\n").map((line) => line.replace(/^[ \t]+/, (space) => spaces(space)));
    const tree = this.parse(lines);
    let out = this.html(tree, false);
    if (this.used.length > 0) {
      const items = this.used.map((id) => `<li>${this.inline(this.notes.get(id) ?? "")}</li>`);
      out += `<hr><ol>${items.join("")}</ol>`;
    }
    return out;
  }

  /** Does a line end the paragraph before it? */
  private breaks(line: string): boolean {
    if (line.startsWith(LAZY)) return false;
    const item = ITEM.exec(line);
    return (
      line.trim() === "" ||
      RULE.test(line) ||
      ATX.test(line) ||
      QUOTE.test(line) ||
      FENCE.test(line) ||
      HTML_TAGS.test(line) ||
      /^ {0,3}<(?:!--|\?|![a-z]|script|pre|style|textarea)/i.test(line) ||
      (item !== null && Boolean(item[4]?.trim()) && (/^[-+*]/.test(item[2]) || /^1[.)]$/.test(item[2])))
    );
  }

  private parse(lines: string[]): Md[] {
    const out: Md[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        i += 1;
        continue;
      }
      if (/^ {4}/.test(line)) {
        const code: string[] = [];
        while (i < lines.length && (/^ {4}/.test(lines[i]) || lines[i].trim() === "")) {
          code.push(lines[i].slice(4));
          i += 1;
        }
        while (code.length > 0 && code[code.length - 1].trim() === "") code.pop();
        out.push({ kind: "code", text: code.join("\n") });
        continue;
      }
      const fence = FENCE.exec(line);
      if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
        const [, indent, mark] = fence;
        const code: string[] = [];
        const end = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}[ \\t]*$`);
        i += 1;
        while (i < lines.length && !end.test(lines[i])) {
          code.push(lines[i].replace(new RegExp(`^ {0,${indent.length}}`), ""));
          i += 1;
        }
        i += 1;
        out.push({ kind: "code", text: code.join("\n") });
        continue;
      }
      const head = ATX.exec(line);
      if (head) {
        out.push({ kind: "h", level: head[1].length, text: (head[2] ?? "").trim() });
        i += 1;
        continue;
      }
      if (RULE.test(line)) {
        out.push({ kind: "hr" });
        i += 1;
        continue;
      }
      if (QUOTE.test(line)) {
        const inner: string[] = [];
        while (i < lines.length) {
          const before = inner[inner.length - 1] ?? "";
          if (QUOTE.test(lines[i])) inner.push(lines[i].replace(QUOTE, ""));
          else if (
            before.trim() !== "" &&
            !/^ {4}/.test(before) &&
            !this.breaks(lines[i]) &&
            (!ITEM.test(lines[i]) || lines[i].startsWith(LAZY))
          )
            inner.push(LAZY + lines[i].replace(LAZY, "").trimStart());
          else break;
          i += 1;
        }
        // Notes in GitHub's manner: the word in brackets is their title.
        const call = /^\[!(note|tip|important|warning|caution)\]\s*$/i.exec(inner[0] ?? "");
        if (call) inner[0] = `**${call[1][0].toUpperCase()}${call[1].slice(1).toLowerCase()}**\\`;
        out.push({ kind: "quote", inner: this.parse(inner) });
        continue;
      }
      const item = ITEM.exec(line);
      if (item) {
        const [node, next] = this.list(lines, i);
        out.push(node);
        i = next;
        continue;
      }
      const html = this.htmlBlock(lines, i);
      if (html > i) {
        out.push({ kind: "html", text: lines.slice(i, html).join("\n") });
        i = html;
        continue;
      }
      const note = NOTE.exec(line);
      if (note) {
        const parts = [note[2]];
        i += 1;
        while (i < lines.length && lines[i].trim() !== "" && !NOTE.test(lines[i])) {
          parts.push(lines[i].trim());
          i += 1;
        }
        if (!this.notes.has(note[1])) this.notes.set(note[1], parts.join("\n"));
        continue;
      }
      const link = DEFINITION.exec(line);
      if (link) {
        const label = labelOf(link[1]);
        if (!this.links.has(label)) this.links.set(label, unescape(link[2] ?? link[3] ?? ""));
        i += 1;
        // A title may stand on a line of its own.
        if (i < lines.length && /^\s+(?:"[^"]*"|'[^']*'|\([^()]*\))\s*$/.test(lines[i])) i += 1;
        continue;
      }
      if (line.includes("|") && i + 1 < lines.length && ROW.test(lines[i + 1])) {
        const heads = cellsOf(line);
        const marks = cellsOf(lines[i + 1]);
        if (heads.length === marks.length) {
          const rows = [heads];
          i += 2;
          while (i < lines.length && !this.breaks(lines[i])) {
            const row = cellsOf(lines[i]).slice(0, heads.length);
            while (row.length < heads.length) row.push("");
            rows.push(row);
            i += 1;
          }
          const align = marks.map((mark) =>
            /^:.*:$/.test(mark) ? "center" : mark.endsWith(":") ? "right" : mark.startsWith(":") ? "left" : "",
          );
          out.push({ kind: "table", align, rows });
          continue;
        }
      }
      const text: string[] = [line.replace(LAZY, "").trimStart()];
      i += 1;
      let level = 0;
      while (i < lines.length) {
        if (lines[i].startsWith(LAZY)) {
          text.push(lines[i].slice(1));
          i += 1;
          continue;
        }
        const under = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i]);
        if (under) {
          level = under[1][0] === "=" ? 1 : 2;
          i += 1;
          break;
        }
        if (this.breaks(lines[i])) break;
        if (
          lines[i].includes("|") &&
          i + 1 < lines.length &&
          ROW.test(lines[i + 1]) &&
          cellsOf(lines[i]).length === cellsOf(lines[i + 1]).length
        )
          break;
        text.push(lines[i].trimStart());
        i += 1;
      }
      const whole = text.join("\n").replace(/[ \t]+$/, "");
      out.push(level > 0 ? { kind: "h", level, text: whole } : { kind: "p", text: whole });
    }
    return out;
  }

  private list(lines: string[], from: number): [Md, number] {
    const first = ITEM.exec(lines[from]) as RegExpExecArray;
    const kind = first[2].slice(-1);
    const items: Md[][] = [];
    let loose = false;
    let i = from;
    let gap = false;
    while (i < lines.length) {
      const item = ITEM.exec(lines[i]);
      if (!item || item[2].slice(-1) !== kind || RULE.test(lines[i])) break;
      if (gap && items.length > 0) loose = true;
      gap = false;
      const pad = item[3]?.length ?? 0;
      const inset = item[1].length + item[2].length + (pad === 0 || pad > 4 ? 1 : pad);
      const inner = [pad > 4 ? " ".repeat(pad - 1) + item[4] : (item[4] ?? "")];
      i += 1;
      let blank = false;
      while (i < lines.length) {
        const line = lines[i];
        if (line.trim() === "") {
          // An item that starts empty ends with the next empty line.
          if (inner.length === 1 && inner[0] === "") break;
          blank = true;
          inner.push("");
          i += 1;
          continue;
        }
        const depth = /^ */.exec(line)?.[0].length ?? 0;
        if (depth >= inset) inner.push(line.slice(inset));
        else if (!blank && !this.breaks(line) && !ITEM.test(line) && inner[inner.length - 1].trim() !== "")
          inner.push(LAZY + line.replace(LAZY, "").trimStart());
        else break;
        blank = false;
        i += 1;
      }
      let end = inner.length;
      while (end > 0 && inner[end - 1] === "") end -= 1;
      gap = end < inner.length && inner.length > 1;
      const parsed = this.parse(inner.slice(0, end));
      if (loosely(inner.slice(0, end)) && parsed.length > 1) loose = true;
      items.push(parsed);
    }
    const start = /\d/.test(first[2]) ? parseInt(first[2], 10) : null;
    return [{ kind: "list", start, tight: !loose, items }, i];
  }

  /** One past the last line of raw HTML that starts here, or the same place. */
  private htmlBlock(lines: string[], from: number): number {
    const line = lines[from];
    const until = (test: RegExp) => {
      for (let i = from; i < lines.length; i += 1) if (test.test(lines[i])) return i + 1;
      return lines.length;
    };
    if (/^ {0,3}<(script|pre|style|textarea)(\s|>|$)/i.test(line)) return until(/<\/(script|pre|style|textarea)>/i);
    if (/^ {0,3}<!--/.test(line)) return until(/-->/);
    if (/^ {0,3}<\?/.test(line)) return until(/\?>/);
    if (/^ {0,3}<!\[CDATA\[/.test(line)) return until(/\]\]>/);
    if (/^ {0,3}<![a-z]/i.test(line)) return until(/>/);
    if (!HTML_TAGS.test(line) && !HTML_ALONE.test(line)) return from;
    let i = from;
    while (i < lines.length && lines[i].trim() !== "") i += 1;
    return i;
  }

  private html(tree: Md[], tight: boolean): string {
    let out = "";
    for (const node of tree) {
      if (node.kind === "p") out += tight ? `<div>${this.inline(node.text)}</div>` : `<p>${this.inline(node.text)}</p>`;
      else if (node.kind === "h") out += `<h${node.level}>${this.inline(node.text)}</h${node.level}>`;
      else if (node.kind === "code") out += `<pre><code>${node.text ? `${escapeHtml(node.text)}\n` : ""}</code></pre>`;
      else if (node.kind === "html") out += `${node.text}\n`;
      else if (node.kind === "hr") out += "<hr>";
      else if (node.kind === "quote") out += `<blockquote>${this.html(node.inner, false)}</blockquote>`;
      else if (node.kind === "table") {
        const row = (cells: string[], tag: string) =>
          `<tr>${cells
            .map((cell, c) => {
              const align = node.align[c] || (tag === "th" ? "left" : "");
              return `<${tag}${align ? ` style="text-align:${align}"` : ""}>${this.inline(cell)}</${tag}>`;
            })
            .join("")}</tr>`;
        const [head, ...body] = node.rows;
        const rows = body.map((cells) => row(cells, "td")).join("");
        out += `<table class="frebies-md"><thead>${row(head, "th")}</thead><tbody>${rows}</tbody></table>`;
      } else if (node.kind === "list") {
        const items = node.items.map((item) => {
          const task = item[0]?.kind === "p" ? /^\[([ xX])\][ \t\n]+/.exec(item[0].text) : null;
          let box = "";
          if (task && item[0].kind === "p") {
            item[0].text = item[0].text.slice(task[0].length);
            box = `<input type="checkbox"${task[1] === " " ? "" : " checked"}>`;
          }
          return `<li>${box}${this.html(item, node.tight)}</li>`;
        });
        const tag = node.start === null ? "ul" : "ol";
        const start = node.start !== null && node.start !== 1 ? ` start="${node.start}"` : "";
        out += `<${tag}${start}>${items.join("")}</${tag}>`;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- inside a paragraph

  private inline(text: string): string {
    type Part = { html: string; mark?: string; count?: number; opens?: boolean; closes?: boolean; was?: number };
    const parts: Part[] = [];
    const brackets: { part: number; image: boolean; from: number; live: boolean }[] = [];
    const put = (html: string) => parts.push({ html });
    let at = 0;
    while (at < text.length) {
      const sign = text[at];
      const rest = text.slice(at);
      if (sign === "\\") {
        const next = text[at + 1];
        if (next === "\n") {
          put("<br>");
          at += 2;
          while (text[at] === " ") at += 1;
        } else if (next && new RegExp(`[${PUNCT}]`).test(next)) {
          put(escapeHtml(next));
          at += 2;
        } else {
          put("\\");
          at += 1;
        }
        continue;
      }
      if (sign === "`") {
        const open = (/^`+/.exec(rest) as RegExpExecArray)[0];
        const close = new RegExp(`(?<!\`)${open}(?!\`)`).exec(text.slice(at + open.length));
        if (close) {
          let code = text.slice(at + open.length, at + open.length + close.index).replace(/\n/g, " ");
          if (/^ .* $/.test(code) && code.trim() !== "") code = code.slice(1, -1);
          put(`<code>${escapeHtml(code)}</code>`);
          at += open.length * 2 + close.index;
        } else {
          put(open);
          at += open.length;
        }
        continue;
      }
      if (sign === "<") {
        const link = /^<([a-z][a-z0-9+.-]{1,31}:[^\s<>]*)>/i.exec(rest);
        const mail = /^<([\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9](?:[\w.-]*[a-z0-9])?)>/i.exec(rest);
        const tag = HTML_INLINE.exec(rest);
        if (link || mail) {
          const found = (link ?? mail) as RegExpExecArray;
          put(`<a href="${mail && !link ? "mailto:" : ""}${escapeHtml(found[1])}">${escapeHtml(found[1])}</a>`);
          at += found[0].length;
        } else if (tag) {
          put(tag[0]);
          at += tag[0].length;
        } else {
          put("&lt;");
          at += 1;
        }
        continue;
      }
      if (sign === "&") {
        const entity = /^&(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/i.exec(rest);
        put(entity ? entity[0] : "&amp;");
        at += entity ? entity[0].length : 1;
        continue;
      }
      if (sign === "\n") {
        const hard = /  +$/.test(text.slice(0, at));
        while (parts.length > 0 && parts[parts.length - 1].html === " ") parts.pop();
        put(hard ? "<br>" : "\n");
        at += 1;
        while (text[at] === " ") at += 1;
        continue;
      }
      if (sign === "*" || sign === "_" || sign === "~") {
        const mark = (/^(\*+|_+|~+)/.exec(rest) as RegExpExecArray)[0];
        const before = at > 0 ? text[at - 1] : " ";
        const after = text[at + mark.length] ?? " ";
        const space = (one: string) => /\s/u.test(one);
        const point = (one: string) => /[\p{P}\p{S}]/u.test(one);
        const left = !space(after) && (!point(after) || space(before) || point(before));
        const right = !space(before) && (!point(before) || space(after) || point(after));
        if (sign === "~" && mark.length > 2) put(mark);
        else
          parts.push({
            html: mark,
            mark: sign,
            count: mark.length,
            was: mark.length,
            opens: sign === "_" ? left && (!right || point(before)) : left,
            closes: sign === "_" ? right && (!left || point(after)) : right,
          });
        at += mark.length;
        continue;
      }
      if (sign === "[" || (sign === "!" && text[at + 1] === "[")) {
        const note = sign === "[" ? /^\[\^([^\]\s]+)\]/.exec(rest) : null;
        if (note && this.notes.has(note[1])) {
          if (!this.used.includes(note[1])) this.used.push(note[1]);
          put(`<sup>${this.used.indexOf(note[1]) + 1}</sup>`);
          at += note[0].length;
          continue;
        }
        const image = sign === "!";
        at += image ? 2 : 1;
        brackets.push({ part: parts.length, image, from: at, live: true });
        put(image ? "![" : "[");
        continue;
      }
      if (sign === "]") {
        const open = brackets.pop();
        if (!open) {
          put("]");
          at += 1;
          continue;
        }
        const label = text.slice(open.from, at);
        const found = open.live ? this.target(text, at + 1, label) : null;
        if (!found) {
          put("]");
          at += 1;
          continue;
        }
        const inside = parts.splice(open.part).slice(1);
        this.emphasis(inside);
        const inner = inside.map((part) => part.html).join("");
        if (open.image) put(`<img src="${escapeHtml(found.url)}" alt="${escapeHtml(label.replace(/[*_`[\]]/g, ""))}">`);
        else {
          put(`<a href="${escapeHtml(found.url)}">${inner}</a>`);
          // No link inside a link.
          for (const bracket of brackets) if (!bracket.image) bracket.live = false;
        }
        at = found.end;
        continue;
      }
      // Plain words, up to the next sign that may mean something. Addresses in them become links.
      const word = /^(?:https?:\/\/|www\.)[^\s<]+/i.exec(rest);
      const start = at === 0 || /[\s*_~(]/.test(text[at - 1]);
      if (word && start && brackets.every((bracket) => !bracket.live || bracket.image)) {
        let address = word[0].replace(/[?!.,:*_~'"]+$/, "");
        while (address.endsWith(")") && (address.match(/\)/g)?.length ?? 0) > (address.match(/\(/g)?.length ?? 0))
          address = address.slice(0, -1);
        address = address.replace(/&[a-z0-9]+;$/i, "");
        if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(address)) {
          put(`<a href="${/^www/i.test(address) ? "http://" : ""}${escapeHtml(address)}">${escapeHtml(address)}</a>`);
          at += address.length;
          continue;
        }
      }
      const mail = start ? /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w@])/.exec(rest) : null;
      if (mail && !/[-_]$/.test(mail[0]) && brackets.every((bracket) => !bracket.live || bracket.image)) {
        put(`<a href="mailto:${mail[0]}">${mail[0]}</a>`);
        at += mail[0].length;
        continue;
      }
      const step = /^(?:[\p{L}\p{N}]+|[^\\`<&\n*_~![\]])/u.exec(rest)?.[0] ?? sign;
      put(escapeHtml(step));
      at += step.length;
    }
    this.emphasis(parts);
    return parts.map((part) => part.html).join("");
  }

  /** Turns pairs of stars, lines and waves into tags. */
  private emphasis(
    parts: { html: string; mark?: string; count?: number; opens?: boolean; closes?: boolean; was?: number }[],
  ) {
    for (let close = 0; close < parts.length; close += 1) {
      const end = parts[close];
      while (end.mark && end.closes && (end.count ?? 0) > 0) {
        let open = close - 1;
        for (; open >= 0; open -= 1) {
          const start = parts[open];
          if (start.mark !== end.mark || !start.opens || (start.count ?? 0) === 0) continue;
          if (end.mark === "~") {
            if (start.count === end.count) break;
            continue;
          }
          // Three and one do not pair with each other when either could both open and close.
          const odd = (start.closes || end.opens) && ((start.was ?? 0) + (end.was ?? 0)) % 3 === 0;
          if (!odd || ((start.was ?? 0) % 3 === 0 && (end.was ?? 0) % 3 === 0)) break;
        }
        if (open < 0) break;
        const start = parts[open];
        const two = end.mark === "~" ? (end.count ?? 1) : (start.count ?? 0) >= 2 && (end.count ?? 0) >= 2 ? 2 : 1;
        const tag = end.mark === "~" ? "del" : two === 2 ? "strong" : "em";
        // What lies between and was not paired stays as it is written.
        for (let k = open + 1; k < close; k += 1) if (parts[k].mark) parts[k].mark = undefined;
        start.count = (start.count ?? 0) - two;
        end.count = (end.count ?? 0) - two;
        const signs = (part: (typeof parts)[number]) => (part.mark ?? "").repeat(part.count ?? 0);
        parts.splice(open + 1, 0, { html: `<${tag}>` });
        close += 1;
        parts.splice(close, 0, { html: `</${tag}>` });
        close += 1;
        start.html = signs(start);
        end.html = signs(end);
      }
    }
  }

  /** Where a link goes whose words end before `at`, and where what says so ends. */
  private target(text: string, at: number, label: string): { url: string; end: number } | null {
    if (text[at] === "(") {
      const rest = text.slice(at);
      const found = TARGET.exec(rest);
      if (found) return { url: unescape(found[1] ?? found[2] ?? ""), end: at + found[0].length };
    }
    const ref = /^\[((?:[^[\]\\]|\\.)*)\]/.exec(text.slice(at));
    const name = ref && ref[1].trim() ? ref[1] : label;
    const url = this.links.get(labelOf(name));
    return url === undefined ? null : { url, end: at + (ref ? ref[0].length : 0) };
  }
}

/** Tabs at the start of a line stand for columns of four. */
function spaces(text: string): string {
  let out = "";
  for (const sign of text) out += sign === "\t" ? " ".repeat(4 - (out.length % 4)) : sign;
  return out;
}

/** Is there an empty line between the parts of an item, outside of code? */
function loosely(lines: string[]): boolean {
  let fence = "";
  for (const line of lines) {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1] ?? "";
    if (mark && !fence) fence = mark;
    else if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = "";
    else if (!fence && line.trim() === "") return true;
  }
  return false;
}

function cellsOf(line: string): string[] {
  const text = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(^|[^\\])\|$/, "$1");
  return text.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export async function readMarkdown(text: string): Promise<FlowDoc> {
  const body = new Markdown().render(text.replace(/\r\n?/g, "\n"));
  const style =
    ".frebies-md td,.frebies-md th{border:0.75pt solid #cfcfcf;padding:3pt 6pt;vertical-align:top}" +
    ".frebies-md th{background:#f3f3f4}";
  const doc = await readHtml(`<!doctype html><html><head><style>${style}</style></head><body>${body}</body></html>`);
  const head = doc.sections[0]?.blocks.find((block) => block.kind === "para" && block.heading === 1);
  if (head?.kind === "para" && !doc.title) doc.title = textOf(head).trim();
  return doc;
}

// ---------------------------------------------------------------- plain text

const BULLET_LINE = /^([ \t]*)([-*•●▪◦○‣–+]|\[[ xX]?\]|[☐☑☒✓])[ \t]+(?=\S)/;
const NUMBER_LINE = /^([ \t]*)(\(?)(\d{1,3}|[a-z])([.)])[ \t]+(?=\S)/;

type Found = { kind: "bullet" | "number"; mark: string; count: number; indent: number; level: number; length: number };

/** Lines that are list items, when at least two follow each other. */
function listLines(lines: string[]): (Found | null)[] {
  const all: (Found | null)[] = lines.map((line) => {
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      const sign = bullet[2];
      let mark = /^\[[ ]?\]$/.test(sign) ? "☐" : /^\[[xX]\]$/.test(sign) ? "☑" : sign;
      let { length } = bullet[0];
      // "- [ ] task": the box is the mark.
      const box = /^\[([ xX])\][ \t]+(?=\S)/.exec(line.slice(length));
      if (box && /^[-*+]$/.test(sign)) {
        mark = box[1] === " " ? "☐" : "☑";
        length += box[0].length;
      } else if (/^[-*+–]$/.test(sign)) mark = sign === "-" || sign === "–" ? "–" : "•";
      return { kind: "bullet", mark, count: 0, indent: spaces(bullet[1]).length, level: 0, length };
    }
    const number = NUMBER_LINE.exec(line);
    if (!number) return null;
    const digits = /\d/.test(number[3]);
    return {
      kind: "number",
      mark: number[2] + (digits ? "1" : "a") + number[4],
      count: digits ? Number(number[3]) : number[3].charCodeAt(0) - 96,
      indent: spaces(number[1]).length,
      level: 0,
      length: number[0].length,
    };
  });
  const box = (mark: string) => /[☐☑☒✓]/.test(mark);
  /** Do two neighbours belong together? One empty line between items is nothing unusual. */
  const pair = (one: Found, two: Found, apart: boolean) => {
    if (one.indent !== two.indent) return !apart;
    if (one.kind !== two.kind) return false;
    if (one.kind === "number") return one.mark === two.mark && two.count === one.count + 1;
    return one.mark === two.mark || (box(one.mark) && box(two.mark));
  };
  const kept = new Set<number>();
  let before = -1;
  all.forEach((one, i) => {
    if (!one) {
      // Any other line ends the list, unless it only goes on with the item above.
      if (before >= 0 && lines[i].trim() !== "" && !/^[ \t]{2}/.test(lines[i])) before = -1;
      return;
    }
    const last = before >= 0 ? all[before] : null;
    const gap = last ? lines.slice(before + 1, i).filter((line) => line.trim() === "").length : 0;
    if (last && gap < 2 && pair(last, one, gap > 0)) {
      kept.add(before);
      kept.add(i);
    }
    before = i;
  });
  // How deep each stands, by the indents above it.
  const steps: number[] = [];
  return all.map((one, i) => {
    if (!one || !kept.has(i)) {
      if (lines[i].trim() !== "" && !one) steps.length = 0;
      return null;
    }
    while (steps.length > 0 && one.indent < steps[steps.length - 1]) steps.pop();
    if (steps.length === 0 || one.indent > steps[steps.length - 1] + 1) steps.push(one.indent);
    one.level = Math.min(8, steps.length - 1);
    return one;
  });
}

/** Text that only makes sense when every letter is as wide as the next. */
function needsColumns(lines: string[]): boolean {
  const full = lines.filter((line) => line.trim() !== "");
  if (full.length < 3) return false;
  const code = full.filter(
    (line) =>
      /[;{}]\s*$|^\s*(\/\/|\/\*|#include|import |from \S+ import|def |class |function |const |let |var )/.test(line) ||
      /^\s*(return\b|if\s*\(|for\s*\(|while\s*\(|public |private |<\/?[a-z][\w-]*[^>]*>|[\w.]+\s*=\s*\S+;?$|\$ )/.test(
        line,
      ),
  ).length;
  if (code / full.length > 0.4) return true;
  // Columns: gaps at the same place on several lines, or signs that draw a table.
  const drawn = full.filter((line) => /^\s*[+|].*[+|]\s*$|[─│┌┐└┘├┤┬┴┼═║]/.test(line)).length;
  if (drawn / full.length > 0.3) return true;
  let aligned = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const stops = (line: string) =>
      [...line.matchAll(/\S[ ]{2,}(?=\S)/g)].map((match) => (match.index ?? 0) + match[0].length);
    const here = stops(lines[i]);
    if (here.length > 0 && stops(lines[i - 1]).some((stop) => here.includes(stop))) aligned += 1;
  }
  return aligned >= 3 && aligned / full.length > 0.35;
}

export async function readPlainText(text: string): Promise<FlowDoc> {
  const section: FlowSection = { w: A4.w, h: A4.h, margin: { ...A4.margin }, blocks: [] };
  const counts = new Map<FlowPara, number>();
  const pages = text
    .replace(/\r\n?|\u2028|\u2029|\u0085/g, "\n")
    .replace(/\n+$/, "")
    .split("\f");
  const all = pages.join("\n").split("\n");
  const fixed = needsColumns(all);
  const widest = all.reduce((most, line) => Math.max(most, line.length), 1);
  const size = fixed ? Math.max(6.5, Math.min(10, round(451 / widest / 0.6))) : 11;
  const style: FlowStyle = fixed ? { font: "Courier New", size } : { size };
  pages.forEach((page, p) => {
    if (p > 0) section.blocks.push({ kind: "break" });
    const lines = page.replace(/^\n+(?=\n)/, p > 0 ? "" : "$&").split("\n");
    const lists = fixed ? lines.map(() => null) : listLines(lines);
    lines.forEach((source, i) => {
      const line = plain(source).replace(/\s+$/, "");
      const last = section.blocks[section.blocks.length - 1];
      if (line === "" && !fixed) {
        // An empty line is the space between two paragraphs.
        if (last?.kind === "para") last.after = (last.after ?? 0) + 10;
        return;
      }
      const para: FlowPara = { kind: "para", runs: [], line: { times: fixed ? 1 : 1.15 }, before: 0, after: 0 };
      const found = lists[i];
      let shown = line;
      if (found) {
        shown = line.slice(found.length);
        para.list = { type: found.kind, mark: found.mark, level: found.level };
        para.left = 30 + found.level * 24;
        para.first = -18;
        if (found.kind === "number") counts.set(para, found.count);
      } else if (fixed) {
        let wide = "";
        for (const sign of line) wide += sign === "\t" ? " ".repeat(8 - (wide.length % 8)) : sign;
        shown = wide;
      }
      para.runs.push({ text: shown, style: { ...style } });
      section.blocks.push(para);
    });
  });
  if (section.blocks.length === 0) section.blocks.push({ kind: "para", runs: [{ text: "", style: { ...style } }] });
  setStarts(section.blocks, counts);
  return { kind: "flow", sections: [section] };
}
