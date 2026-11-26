import {
  ConvertError,
  type FlowBlock,
  type FlowBox,
  type FlowCell,
  type FlowImage,
  type FlowLine,
  type FlowMargin,
  type FlowPara,
  type FlowRun,
  type FlowStyle,
  type FlowTable,
} from "./flow";

/**
 * What the readers of zipped XML documents (.docx, .odt) share: the archive, a
 * walk through XML, measures, letters of symbol fonts, numbers as words, tabs,
 * and what paragraphs and cells do to their neighbours.
 */

// ---------------------------------------------------------------- the archive

export type Pack = {
  names: string[];
  has: (path: string) => boolean;
  bytes: (path: string) => Promise<Uint8Array | null>;
  /** The root element; null when the part is missing or cannot be read. */
  xml: (path: string) => Promise<Element | null>;
};

export const DAMAGED =
  "This document is damaged and could not be opened. Try saving it again in the program it came from.";
export const LOCKED =
  "This document is locked with a password. Take the password off in the program it came from, then open it again.";

const begins = (bytes: Uint8Array, head: readonly number[]) => head.every((byte, i) => bytes[i] === byte);

/** Looks for a word spelled with two bytes a letter, as the old containers name their parts. */
function holdsWide(bytes: Uint8Array, word: string): boolean {
  const end = bytes.length - word.length * 2;
  for (let at = 0; at <= end; at += 2) {
    let same = 0;
    while (same < word.length && bytes[at + same * 2] === word.charCodeAt(same) && bytes[at + same * 2 + 1] === 0)
      same += 1;
    if (same === word.length) return true;
  }
  return false;
}

const plainPath = (path: string) => path.replace(/\\/g, "/").replace(/^\/+/, "");

/** `what` is the name of the kind of file, as in "This is not a Word document." */
export async function openPack(bytes: Uint8Array, what: string): Promise<Pack> {
  if (bytes.length === 0) throw new ConvertError("This file is empty.");
  if (begins(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    if (holdsWide(bytes, "EncryptedPackage")) throw new ConvertError(LOCKED);
    throw new ConvertError(`This is not ${what}. It looks like a file from an older Office program.`);
  }
  if (!begins(bytes, [0x50, 0x4b])) throw new ConvertError(`This is not ${what}.`);
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes).catch((error: unknown) => {
    throw new ConvertError(/encrypt/i.test(String(error)) ? LOCKED : DAMAGED);
  });
  const files = new Map<string, (typeof zip.files)[string]>();
  const names: string[] = [];
  zip.forEach((name, file) => {
    if (file.dir) return;
    const path = plainPath(name);
    names.push(path);
    files.set(path.toLowerCase(), file);
  });
  const read = async (path: string) => {
    const file = files.get(plainPath(path).toLowerCase());
    if (!file) return null;
    try {
      return await file.async("uint8array");
    } catch {
      return null;
    }
  };
  return {
    names,
    has: (path) => files.has(plainPath(path).toLowerCase()),
    bytes: read,
    xml: async (path) => {
      const data = await read(path);
      return data ? parseXml(decode(data)) : null;
    },
  };
}

function decode(bytes: Uint8Array): string {
  const [a, b] = bytes;
  if ((a === 0xff && b === 0xfe) || (a === 0x3c && b === 0)) return new TextDecoder("utf-16le").decode(bytes);
  if ((a === 0xfe && b === 0xff) || (a === 0 && b === 0x3c)) return new TextDecoder("utf-16be").decode(bytes);
  const head = String.fromCharCode(...bytes.subarray(0, 120));
  const named = /encoding\s*=\s*["']([\w.-]+)["']/.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(/^utf-?16/i.test(named) ? "utf-8" : named).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export function parseXml(text: string): Element | null {
  const parse = (source: string) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    return doc.getElementsByTagName("parsererror").length > 0 ? null : doc.documentElement;
  };
  const source = text.replace(/^[\s﻿]+/, "");
  // Some programs leave control characters in the words, which XML does not allow.
  return (
    parse(source) ??
    parse(
      source
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
        .replace(/&#(x0*(?:[0-8bcef]|1[0-9a-f])|0*(?:[0-8]|1[124-9]|2\d|3[01]));/gi, ""),
    )
  );
}

/** `target` as seen from the part at `from`. */
export function resolvePath(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const steps = from.split("/").slice(0, -1);
  for (const step of target.split("/")) {
    if (step === "..") steps.pop();
    else if (step !== "." && step !== "") steps.push(step);
  }
  return steps.join("/");
}

// ---------------------------------------------------------------- elements

/** Names are compared without their prefix: programs do not agree on those. */
export function kid(el: Element | null | undefined, name: string): Element | null {
  for (let child = el?.firstElementChild ?? null; child; child = child.nextElementSibling)
    if (child.localName === name) return child;
  return null;
}

export function kids(el: Element | null | undefined, name?: string): Element[] {
  const out: Element[] = [];
  for (let child = el?.firstElementChild ?? null; child; child = child.nextElementSibling)
    if (!name || child.localName === name) out.push(child);
  return out;
}

/** Follows names down: dig(el, "a", "b") is the b in the a. */
export function dig(el: Element | null | undefined, ...names: string[]): Element | null {
  let here: Element | null = el ?? null;
  for (const name of names) here = kid(here, name);
  return here;
}

export const findAll = (el: Element, name: string): Element[] => Array.from(el.getElementsByTagNameNS("*", name));
export const find = (el: Element | null | undefined, name: string): Element | null =>
  el?.getElementsByTagNameNS("*", name)[0] ?? null;

export function at(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const { attributes } = el;
  for (let i = 0; i < attributes.length; i += 1) if (attributes[i].localName === name) return attributes[i].value;
  return null;
}

// ---------------------------------------------------------------- measures

const UNITS: Record<string, number> = {
  pt: 1,
  in: 72,
  inch: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pc: 12,
  pi: 12,
  px: 0.75,
};

export function numberOf(text: string | null | undefined): number | undefined {
  const value = text ? parseFloat(text) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

/** "2.5cm" in points. A number without a unit is multiplied by `bare`. */
export function lengthOf(text: string | null | undefined, bare = 0): number | undefined {
  const found = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(text ?? "");
  if (!found) return undefined;
  const unit = found[2] ? UNITS[found[2].toLowerCase()] : bare;
  return unit ? parseFloat(found[1]) * unit : found[1] === "0" ? 0 : undefined;
}

export const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

// ---------------------------------------------------------------- colours

export const isHex = (value: string | null | undefined): value is string => /^#?[0-9a-f]{6}$/i.test(value ?? "");
export const hexOf = (value: string) => `#${value.replace("#", "").toLowerCase()}`;

export function channels(color: string): [number, number, number] {
  const value = parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const fromChannels = (rgb: readonly number[]) =>
  `#${rgb
    .map((part) =>
      Math.max(0, Math.min(255, Math.round(part)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** `share` of `top` over `under`. */
export function blend(top: string, under: string, share: number): string {
  const a = channels(top);
  const b = channels(under);
  return fromChannels(a.map((part, i) => part * share + b[i] * (1 - share)));
}

/** Word turns automatic black letters white on backgrounds darker than this. */
export function isDark(color: string): boolean {
  const [r, g, b] = channels(color);
  return 0.299 * r + 0.587 * g + 0.114 * b < 59;
}

// ---------------------------------------------------------------- pictures

/** What kind of picture it is, or null for the kinds browsers cannot show (EMF, WMF and the like). */
export function pictureType(bytes: Uint8Array): string | null {
  const text = String.fromCharCode(...bytes.subarray(0, 64));
  if (text.startsWith("\x89PNG")) return "image/png";
  if (text.startsWith("\xff\xd8\xff")) return "image/jpeg";
  if (text.startsWith("GIF8")) return "image/gif";
  if (text.startsWith("BM")) return "image/bmp";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
  if (text.startsWith("II*\0") || text.startsWith("MM\0*")) return "image/tiff";
  if (text.startsWith("\0\0\x01\0")) return "image/x-icon";
  if (text.slice(4, 8) === "ftyp" && /^(avif|avis)/.test(text.slice(8, 12))) return "image/avif";
  if (text.slice(4, 8) === "ftyp" && /^(hei|hev|mif1|msf1)/.test(text.slice(8, 12))) return "image/heic";
  const start = new TextDecoder().decode(bytes.subarray(0, 1000)).replace(/^[\s﻿]+/, "");
  if (/^<svg[\s>]/.test(start) || (/^<(\?xml|!--|!doctype svg)/i.test(start) && /<svg[\s>]/.test(start)))
    return "image/svg+xml";
  return null;
}

/** Draws on a canvas in points and hands back a PNG. */
export function paintImage(w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void): FlowImage | null {
  const scale = Math.min(3, 2400 / Math.max(w, h, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  pen.scale(scale, scale);
  paint(pen);
  const data = atob(canvas.toDataURL("image/png").split(",")[1] ?? "");
  const bytes = Uint8Array.from(data, (letter) => letter.charCodeAt(0));
  return { bytes, mime: "image/png", w: round(w), h: round(h) };
}

export const dashOf = (stroke: FlowLine) =>
  stroke.dash === "dash"
    ? [stroke.width * 4, stroke.width * 3]
    : stroke.dash === "dot"
      ? [stroke.width, stroke.width * 2]
      : [];

export function strokeWith(pen: CanvasRenderingContext2D, stroke: FlowLine, outline: Path2D) {
  pen.strokeStyle = stroke.color;
  pen.lineWidth = stroke.width;
  pen.setLineDash(dashOf(stroke));
  pen.stroke(outline);
}

/** One colour for everything, and the colours it runs through when there are several. */
export type Paint = { color: string; stops?: [number, string][]; angle?: number; radial?: boolean };

/** Colours that run into each other, the first one first, and the one colour that comes closest to all of them. */
export function runThrough(stops: [number, string][], how: { angle?: number; radial?: boolean }): Paint | null {
  if (stops.length === 0) return null;
  const sum = [0, 0, 0];
  const reach: [number, string][] = [[0, stops[0][1]], ...stops, [1, stops[stops.length - 1][1]]];
  for (let i = 1; i < reach.length; i += 1) {
    const [a, b] = [channels(reach[i - 1][1]), channels(reach[i][1])];
    a.forEach((part, k) => (sum[k] += ((part + b[k]) / 2) * (reach[i][0] - reach[i - 1][0])));
  }
  const color = fromChannels(sum);
  // Shades nobody would tell apart are one colour.
  const plain = stops.every(([, one]) => channels(one).every((part, k) => Math.abs(part - sum[k]) < 14));
  return plain ? { color } : { color, stops, ...how };
}

export function fillStyle(pen: CanvasRenderingContext2D, paint: Paint, w: number, h: number): string | CanvasGradient {
  if (!paint.stops) return paint.color;
  const turn = ((paint.angle ?? 0) / 180) * Math.PI;
  const reach = (Math.abs(w * Math.cos(turn)) + Math.abs(h * Math.sin(turn))) / 2;
  const [x, y] = [Math.cos(turn) * reach, Math.sin(turn) * reach];
  const run = paint.radial
    ? pen.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
    : pen.createLinearGradient(w / 2 - x, h / 2 - y, w / 2 + x, h / 2 + y);
  for (const [place, color] of paint.stops) run.addColorStop(Math.max(0, Math.min(1, place)), color);
  return run;
}

/** Shapes a picture can be made of here. */
export const SIMPLE = /^(rect|roundRect|ellipse)$/;

/** A plain shape as a picture, for places that hold no shapes. */
export function shapeImage(
  shape: string,
  size: { w: number; h: number },
  paint: Paint | null,
  stroke: FlowLine | null,
): FlowImage | null {
  const w = Math.max(size.w, stroke?.width ?? 0.5);
  const h = Math.max(size.h, stroke?.width ?? 0.5);
  return paintImage(w, h, (pen) => {
    const edge = Math.min((stroke?.width ?? 0) / 2, w / 2, h / 2);
    const outline = new Path2D();
    if (shape === "ellipse") outline.ellipse(w / 2, h / 2, w / 2 - edge, h / 2 - edge, 0, 0, Math.PI * 2);
    else if (shape === "roundRect" && "roundRect" in outline)
      outline.roundRect(edge, edge, w - edge * 2, h - edge * 2, Math.min(w, h) / 6);
    else if (/^(line|straightConnector1)$/.test(shape)) {
      outline.moveTo(edge, edge);
      outline.lineTo(w - edge, h - edge);
    } else outline.rect(edge, edge, w - edge * 2, h - edge * 2);
    if (paint) {
      pen.fillStyle = fillStyle(pen, paint, w, h);
      pen.fill(outline);
    }
    if (stroke) strokeWith(pen, stroke, outline);
  });
}

export type Point = { x: number; y: number };
export type Frame = { x: number; y: number; w: number; h: number };

/** A line of one or more parts as a picture, with heads where it has them. It reaches over its box by `edge`. */
export function lineImage(
  corners: readonly Point[],
  stroke: FlowLine,
  { curved, start, end }: { curved?: boolean; start?: boolean; end?: boolean },
): { image: FlowImage; edge: number } | null {
  const edge = 4 + stroke.width * 3;
  const points = corners.map(({ x, y }) => ({ x: x + edge, y: y + edge }));
  const last = points.length - 1;
  const w = Math.max(...points.map(({ x }) => x)) + edge;
  const h = Math.max(...points.map(({ y }) => y)) + edge;
  const way = (from: Point, to: Point) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  };
  const ends = [
    { tip: points[0], u: way(points[1], points[0]), head: start },
    { tip: points[last], u: way(points[last - 1], points[last]), head: end },
  ];
  // The line ends inside its head, not at the tip of it.
  const neck = (index: number, by: number) => {
    const { tip, u, head } = ends[index];
    return head ? { x: tip.x - u.x * edge * by, y: tip.y - u.y * edge * by } : tip;
  };
  const image = paintImage(w, h, (pen) => {
    const outline = new Path2D();
    const path = [neck(0, 0.7), ...points.slice(1, last), neck(1, 0.7)];
    outline.moveTo(path[0].x, path[0].y);
    for (let i = 1; i <= last; i += 1) {
      const [a, b] = [path[i], path[i + 1]];
      if (!curved || i === last) {
        if (!curved || last === 1) outline.lineTo(a.x, a.y);
        continue;
      }
      // From the middle of one part to the middle of the next, by way of the corner.
      const to = i + 1 === last ? b : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      outline.quadraticCurveTo(a.x, a.y, to.x, to.y);
    }
    strokeWith(pen, stroke, outline);
    pen.fillStyle = stroke.color;
    ends.forEach(({ tip, u, head }, index) => {
      if (!head) return;
      const base = neck(index, 1);
      pen.beginPath();
      pen.moveTo(tip.x, tip.y);
      pen.lineTo(base.x - u.y * edge * 0.45, base.y + u.x * edge * 0.45);
      pen.lineTo(base.x + u.y * edge * 0.45, base.y - u.x * edge * 0.45);
      pen.fill();
    });
  });
  return image && { image, edge };
}

/** The corners of a line between shapes: straight, or with elbows. */
export function connectorCorners(kind: string, w: number, h: number, adjust: readonly number[] = []): Point[] {
  const [a = 0.5, b = 0.5, c = 0.5] = adjust;
  const at = (...pairs: [number, number][]) => pairs.map(([x, y]) => ({ x: x * w, y: y * h }));
  switch (kind.replace(/^\D+/, "")) {
    case "2":
      return at([0, 0], [1, 0], [1, 1]);
    case "3":
      return at([0, 0], [a, 0], [a, 1], [1, 1]);
    case "4":
      return at([0, 0], [a, 0], [a, b], [1, b], [1, 1]);
    case "5":
      return at([0, 0], [a, 0], [a, b], [c, b], [c, 1], [1, 1]);
    default:
      return at([0, 0], [1, 1]);
  }
}

type Flips = { flipH: boolean; flipV: boolean };

/** A line across a box, turned about the middle of it: the box it runs through then, and from which corner. */
export function turnLine(frame: Frame, { flipH, flipV }: Flips, degrees: number): { frame: Frame } & Flips {
  const turn = (degrees / 180) * Math.PI;
  const [x, y] = [((flipH ? -1 : 1) * frame.w) / 2, ((flipV ? -1 : 1) * frame.h) / 2];
  const dx = x * Math.cos(turn) - y * Math.sin(turn);
  const dy = x * Math.sin(turn) + y * Math.cos(turn);
  const [w, h] = [Math.abs(dx) * 2, Math.abs(dy) * 2];
  return {
    frame: { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h },
    flipH: dx < -0.01,
    flipV: dy < -0.01,
  };
}

const WAYS = ["rightArrow", "downArrow", "leftArrow", "upArrow"];

/** Arrows mirrored or turned by quarters are other arrows. */
export function turnedShape(shape: string, quarters: number, { flipH, flipV }: Flips): string {
  const way = WAYS.indexOf(shape);
  if (way < 0) return shape === "triangle" && (quarters === 2) !== flipV ? "flowChartMerge" : shape;
  const mirrored = way % 2 === 0 ? flipH : flipV;
  return WAYS[(way + (mirrored ? 2 : 0) + quarters) % 4];
}

/** How many quarters a turn is; null when it is none of them. */
export function quartersOf(degrees: number): number | null {
  const quarters = Math.round(degrees / 90);
  return Math.abs(degrees - quarters * 90) < 1 ? ((quarters % 4) + 4) % 4 : null;
}

/** The room between a box and its words. */
export type Pad = { l: number; t: number; r: number; b: number };

/** Words that run up or down a box. Nothing here does, so they come as a picture, turned. */
export function turnedWords(
  blocks: readonly FlowPara[],
  frame: Frame,
  pad: Pad,
  way: 90 | 270,
  valign: NonNullable<FlowBox["valign"]>,
): { image: FlowImage; x: number; y: number } | null {
  // A page number has to stay one, and pictures stay pictures.
  if (blocks.some((para) => para.runs.some((run) => run.image !== undefined || run.text.includes("{page"))))
    return null;
  const w = frame.h;
  const h = frame.w;
  const inner = way === 270 ? { l: pad.b, r: pad.t, t: pad.l, b: pad.r } : { l: pad.t, r: pad.b, t: pad.r, b: pad.l };
  const image = paintImage(w, h, (pen) => {
    type Word = { text: string; style: FlowStyle; w: number };
    const fontOf = (style: FlowStyle) =>
      `${style.italic ? "italic" : "normal"} ${style.bold ? 700 : 400} ${style.size ?? 11}px "${style.font ?? "Arial"}", Arial, sans-serif`;
    const lines: { words: Word[]; w: number; size: number; high: number; align: FlowPara["align"] }[] = [];
    for (const para of blocks) {
      const room = Math.max(10, w - inner.l - inner.r - (para.left ?? 0) - (para.right ?? 0));
      const times = para.line && "times" in para.line ? para.line.times : 1;
      const open = (size: number) => {
        lines.push({ words: [], w: 0, size, high: size * 1.22 * times, align: para.align });
        return lines[lines.length - 1];
      };
      let here = open(para.runs[0]?.style?.size ?? 11);
      for (const run of para.runs) {
        if (run.image !== undefined) continue;
        pen.font = fontOf(run.style);
        for (const text of run.text.match(/\n|[^\s]+\s*|\s+/g) ?? []) {
          const size = run.style.size ?? 11;
          const wide = pen.measureText(text).width + (run.style.tracking ?? 0) * text.length;
          if (text === "\n" || (here.words.length > 0 && here.w + wide > room + 0.5)) here = open(size);
          if (text === "\n") continue;
          here.words.push({ text, style: run.style, w: wide });
          here.w += wide;
          here.size = Math.max(here.size, size);
          here.high = Math.max(here.high, size * 1.22 * times);
        }
      }
    }
    const tall = lines.reduce((sum, one) => sum + one.high, 0);
    const spare = h - inner.t - inner.b - tall;
    let y = inner.t + (valign === "middle" ? spare / 2 : valign === "bottom" ? spare : 0);
    for (const one of lines) {
      const spareX = w - inner.l - inner.r - one.w;
      let x = inner.l + (one.align === "center" ? spareX / 2 : one.align === "right" ? spareX : 0);
      for (const word of one.words) {
        pen.font = fontOf(word.style);
        pen.fillStyle = word.style.color ?? "#000000";
        pen.letterSpacing = `${word.style.tracking ?? 0}px`;
        pen.fillText(word.text, x, y + one.high * 0.5 + one.size * 0.33);
        x += word.w;
      }
      y += one.high;
    }
  });
  if (!image) return null;
  const alt = blocks
    .map((para) => runsText(para.runs))
    .join(" ")
    .trim();
  return { image: { ...image, angle: way, alt }, x: (frame.w - w) / 2, y: (frame.h - h) / 2 };
}

/** The room around words, turned with their box by one quarter or by three. */
export const turnedPad = ({ l, t, r, b }: Pad, quarters: number): Pad =>
  quarters === 1 ? { l: b, t: l, r: t, b: r } : { l: t, t: r, r: b, b: l };

/**
 * Pictures that words run across, as if they were not there, are put behind the words: that is the only way to say
 * so. Where something filled lies beneath them they have to stay on top, or they would not be seen.
 */
export function settleDepth(
  runs: readonly FlowRun[],
  boxes: readonly { box: FlowBox; z: number }[],
  over: ReadonlyMap<FlowImage, number>,
) {
  for (const { image } of runs) {
    const float = image?.float;
    const z = image && over.get(image);
    if (!image || !float || z === undefined) continue;
    const meets = (box: FlowBox) =>
      box.from === float.from &&
      box.x < float.x + image.w &&
      box.x + box.w > float.x &&
      box.y < float.y + image.h &&
      box.y + box.h > float.y;
    const beneath = boxes.some(({ box, z: other }) => box.fill && other <= z && meets(box));
    const above = boxes.some(({ box, z: other }) => box.blocks.length > 0 && other > z && meets(box));
    if (beneath && !above) delete float.behind;
  }
}

/** How high paragraphs come out, roughly, in a box so wide. */
export function aboutHigh(blocks: readonly FlowPara[], width: number): number {
  return blocks.reduce((sum, para) => {
    const size = Math.max(6, ...para.runs.map((run) => run.style?.size ?? 0));
    const room = Math.max(size, width - (para.left ?? 0) - (para.right ?? 0));
    const rows = runsText(para.runs)
      .split("\n")
      .reduce((all, row) => all + Math.max(1, Math.ceil((row.length * size * 0.5) / room)), 0);
    const high = para.line && "points" in para.line ? para.line.points : size * 1.2 * (para.line?.times ?? 1);
    return sum + (para.before ?? 0) + rows * high + (para.after ?? 0);
  }, 0);
}

const NOTHING = new Uint8Array(0);

/**
 * Boxes push nothing aside when they are laid out, pictures do. So a box with words beside it comes with a picture
 * just as large that has nothing in it: the words keep clear of it, and no more of it is seen. "below" where there is
 * too little room beside it, null where it is not in the way, or no telling which words are beside it.
 */
export function spacerFor(
  ground: { at: number; width: number; top: number; high: number; first: boolean },
  spot: { x: number; y: number; from: "page" | "para" },
  w: number,
  h: number,
): FlowImage | "below" | null {
  const x = spot.from === "page" ? spot.x - ground.at : spot.x;
  if (x + w < 8 || x > ground.width - 8) return null;
  const take = (x < ground.width - x - w ? x + w : ground.width - x) + 8;
  if (take >= ground.width * 0.66) return "below";
  const first = ground.first && spot.y < ground.top + 60;
  const known = spot.from === "para" ? spot.y < 150 && spot.y + h > 4 : first || h > ground.high / 2;
  if (!known) return null;
  const float = { x: round(spot.x), y: round(spot.y), from: spot.from };
  return { bytes: NOTHING, mime: "image/png", w: round(w), h: round(h), float };
}

/** A box that lies on its side. */
export const onSide = ({ x, y, w, h }: Frame): Frame => ({ x: x + (w - h) / 2, y: y + (h - w) / 2, w: h, h: w });

// ---------------------------------------------------------------- letters of symbol fonts

const table = (from: number, letters: string): Record<number, string> =>
  Object.fromEntries(Array.from(letters, (letter, i) => [from + i, letter]));

const SYMBOL: Record<number, string> = {
  ...table(0x21, "!∀#∃%&∋()*+,−./0123456789:;<=>?≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_‾αβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}~"),
  ...table(0xa0, "€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…|—⏎ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√·¬∧∨⇔⇐⇑⇒⇓◊‹®©™∑⎛⎜⎝⎡⎢⎣⎧⎨⎩⎪"),
  ...table(0xf1, "›∫⌠⎮⌡⎞⎟⎠⎤⎥⎦⎫⎬⎭"),
};

const WINGDINGS: Record<number, string> = {
  ...table(
    0x21,
    "✏✂✁👓🔔📖🕯☎✆✉✉📪📫📬📭📁📂📄📄📑🗄⌛⌨🖱🖲💻🖴💾💾✇✍✍✌👌👍👎☜☞☝☟✋☺😐☹💣☠⚐⚐✈☼💧❄✝✞✝✠✡☪☯ॐ☸♈♉♊♋♌♍♎♏♐♑♒♓",
  ),
  ...table(0x6a, "&&●○■□□☐☐◆◆◆❖◆☒△⌘✸✸“”"),
  ...table(0x80, "⓪①②③④⑤⑥⑦⑧⑨⑩⓿❶❷❸❹❺❻❼❽❾❿❧❧❧❧❧❧❧❧·•▪○○○●○○▪☐✦✦★✶✴✸✳○○✧◇☐✪☆🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛"),
  ...table(0xd5, "⌫⌦◄➢▲▼⇐➔⇑⇓←→↑↓↖↗↙↘←➔↑↓↖↗↙↘⇐⇒⇑⇓⇔↕↗↖↙↘▪▫✗✓☒☑⊞"),
};

const WINGDINGS2: Record<number, string> = {
  ...table(0x4f, "✗✓☒☑☒☒☒⊘⊘"),
  ...table(0x69, "⓪①②③④⑤⑥⑦⑧⑨⑩⓿❶❷❸❹❺❻❼❽❾❿"),
  ...table(0x95, "·•●●○○○●○▪▪■□▫☐☐"),
  ...table(0xaa, "◆◇"),
};

const WINGDINGS3: Record<number, string> = {
  ...table(0x66, "←→↑↓↖↗↙↘↔↕▲▼△▽◄►◁▷◣◢◤◥◄►▲▼"),
  0x21: "→",
  0x22: "→",
  0xc6: "►",
};

const WEBDINGS: Record<number, string> = {
  ...table(0x33, "◄►▲▼"),
  0x3c: "■",
  0x48: "⌂",
  0x59: "♥",
  0x61: "✔",
  0x63: "□",
  0x67: "■",
  0x69: "ℹ",
  0x6e: "●",
  0x72: "✖",
  0x79: "⊘",
  0x80: "⊘",
};

/** For private letters whose font nobody named: the ones bullets are usually made of. */
const GUESS: Record<number, string> = {
  ...WINGDINGS,
  0xb7: "•",
  0xa7: "▪",
  0x2d: "–",
  0xae: "→",
  0xd2: "®",
  0xd3: "©",
  0xd4: "™",
};

function symbolTable(font: string | undefined): Record<number, string> | null {
  const name = (font ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (name === "symbol" || name === "symbolmt" || name === "standardsymbolsl" || name === "opensymbol")
    return name === "opensymbol" ? null : SYMBOL;
  if (/^wingdings2/.test(name)) return WINGDINGS2;
  if (/^wingdings3/.test(name)) return WINGDINGS3;
  if (/^wingdings/.test(name)) return WINGDINGS;
  return /^webdings/.test(name) ? WEBDINGS : null;
}

/** Fonts whose letters are pictures; every other font shows something else for them. */
export const isSymbolFont = (font: string | undefined) => symbolTable(font) !== null;

/** What a reader sees for text in a symbol font, and for private letters of any font. */
export function plainSymbols(text: string, font: string | undefined): string {
  const own = symbolTable(font);
  if (!own && !/[-]/.test(text)) return text;
  return Array.from(text, (letter) => {
    const code = letter.charCodeAt(0);
    if (code >= 0xf020 && code <= 0xf0ff) return (own ?? GUESS)[code & 255] ?? (own ? "•" : letter);
    return own && code > 0x20 && code < 0x100 ? (own[code] ?? letter) : letter;
  }).join("");
}

// ---------------------------------------------------------------- numbers as words

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

function roman(value: number): string {
  let left = value;
  let out = "";
  for (const [n, sign] of ROMAN) {
    while (left >= n) {
      out += sign;
      left -= n;
    }
  }
  return out;
}

/** Word goes on after z with aa, bb, cc. */
const lettered = (value: number) =>
  String.fromCharCode(97 + ((value - 1) % 26)).repeat(Math.min(20, Math.floor((value - 1) / 26) + 1));

const ONES =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const FIRSTS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
};

function spelled(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) return TENS[Math.floor(value / 10)] + (value % 10 ? `-${ONES[value % 10]}` : "");
  const rest = value % 100;
  return `${ONES[Math.floor(value / 100) % 20]} hundred${rest ? ` ${spelled(rest)}` : ""}`;
}

function spelledOrdinal(value: number): string {
  return spelled(value).replace(
    /[a-z]+$/,
    (word) => FIRSTS[word] ?? (word.endsWith("y") ? `${word.slice(0, -1)}ieth` : `${word}th`),
  );
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const digits = (value: number, zero: number) =>
  String(value).replace(/\d/g, (digit) => String.fromCharCode(zero + Number(digit)));
const cycle = (letters: string, value: number) => {
  const list = Array.from(letters);
  return list[(value - 1) % list.length].repeat(Math.floor((value - 1) / list.length) + 1);
};

/** A count written the way Word's number formats ask for. */
export function countText(format: string, value: number): string {
  if (format === "none") return "";
  if (value < 1 || value > 9999) return String(value);
  switch (format) {
    case "decimalZero":
      return String(value).padStart(2, "0");
    case "upperRoman":
      return roman(value).toUpperCase();
    case "lowerRoman":
      return roman(value);
    case "upperLetter":
      return lettered(value).toUpperCase();
    case "lowerLetter":
      return lettered(value);
    case "ordinal": {
      const tail = value % 100 >= 11 && value % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
      return value + tail;
    }
    case "cardinalText":
      return capital(spelled(value % 1000));
    case "ordinalText":
      return capital(spelledOrdinal(value % 1000));
    case "numberInDash":
      return `- ${value} -`;
    case "decimalEnclosedCircle":
    case "decimalEnclosedCircleChinese":
      return value <= 20 ? String.fromCharCode(0x245f + value) : String(value);
    case "decimalEnclosedParen":
      return value <= 20 ? String.fromCharCode(0x2473 + value) : `(${value})`;
    case "decimalEnclosedFullstop":
      return value <= 20 ? String.fromCharCode(0x2487 + value) : `${value}.`;
    case "chicago":
      return cycle("*†‡§", value);
    case "hindiNumbers":
      return digits(value, 0x966);
    case "hindiVowels":
      return cycle("अआइईउऊऋएऐओऔ", value);
    case "hindiConsonants":
      return cycle("कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह", value);
    case "thaiNumbers":
      return digits(value, 0xe50);
    case "arabicAbjad":
    case "arabicAlpha":
      return cycle("أبتثجحخدذرزسشصضطظعغفقكلمنهوي", value);
    case "russianLower":
      return cycle("абвгдежзиклмнопрстуфхцчшщыэюя", value);
    case "russianUpper":
      return cycle("абвгдежзиклмнопрстуфхцчшщыэюя", value).toUpperCase();
    case "decimalFullWidth":
      return digits(value, 0xff10);
    default:
      return String(value);
  }
}

/** The formats the editor's lists know, and the sign that stands for the count. */
export const KINDS: Record<string, string> = {
  decimal: "1",
  lowerLetter: "a",
  upperLetter: "A",
  lowerRoman: "i",
  upperRoman: "I",
};

// ---------------------------------------------------------------- letters and their fonts

/** Letters that come in fonts of their own. "plain" is ASCII, "ansi" the rest of the Latin-like ones. */
export type Script = "plain" | "ansi" | "east" | "indic" | "complex";

const EAST =
  /[\u1100-\u11ff\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u{20000}-\u{3ffff}]/u;
const INDIC = /[\u0900-\u0dff\u1cd0-\u1cff\ua8e0-\ua8ff]/;
const COMPLEX = /[\u0590-\u08ff\u0e00-\u109f\u1780-\u17ff\ufb1d-\ufdff\ufe70-\ufefc]/;
/** Signs that go with whatever letters stand before them. */
const NEUTRAL = /[\s\u00a0.,;:!?()[\]{}"'\-/\u2010-\u2027\u200b-\u200f\u2060\ufeff]/;
const INDIC_FONT =
  /mangal|nirmala|kokila|aparajita|utsaah|sanskrit|devanagari|unicode ms|hind\b|mukta|baloo|kalam|lohit|noto|akshar|tiro|martel|laila|khand|sarala|yatra|gargi|samyak|chandas|siddhanta|latha|vijaya|tunga|kartika|rupee|shonar|vrinda|raavi|shruti|gautami|iskoola/i;

/** Word shows Hindi and its neighbours in a font that has them, whatever font was asked for. */
export const drawsIndic = (font: string | undefined) => INDIC_FONT.test(font ?? "");

function scriptOf(letter: string): Script | null {
  if (NEUTRAL.test(letter)) return null;
  if (letter <= "\u007f") return "plain";
  if (INDIC.test(letter)) return "indic";
  if (EAST.test(letter)) return "east";
  return COMPLEX.test(letter) ? "complex" : "ansi";
}

/** Text in stretches of one script; those that look alike anyway stay together. */
export function splitScripts(
  text: string,
  alike: (a: Script, b: Script) => boolean,
): { text: string; script: Script }[] {
  if (text === "") return [];
  if (/^[\u0000-\u007f]*$/.test(text)) return [{ text, script: "plain" }];
  const out: { text: string; script: Script }[] = [];
  let part = "";
  let script: Script | null = null;
  for (const letter of text) {
    const own = scriptOf(letter);
    if (own && script && own !== script && !alike(own, script)) {
      out.push({ text: part, script });
      part = "";
      script = own;
    } else if (own && (!script || script === "plain")) script = own;
    part += letter;
  }
  out.push({ text: part, script: script ?? "plain" });
  return out;
}

/** Capitals and small capitals: what is written small is set as smaller capitals. */
export function capitals(
  text: string,
  caps: boolean | undefined,
  small: boolean | undefined,
): { text: string; scale: number }[] {
  if (caps) return [{ text: text.toUpperCase(), scale: 1 }];
  if (!small) return [{ text, scale: 1 }];
  return (text.match(/[^\p{Ll}]+|\p{Ll}+/gu) ?? []).map((piece) => ({
    text: piece.toUpperCase(),
    scale: /\p{Ll}/u.test(piece) ? 0.8 : 1,
  }));
}

// ---------------------------------------------------------------- links

/** The address as it can be opened, or null for places inside the file and on the author's own disk. */
export function outsideLink(target: string | null | undefined): string | null {
  const link = (target ?? "").trim();
  if (/^(https?|ftp|mailto|tel|sms|callto|skype|news|geo):/i.test(link)) return link;
  return /^www\.[^\s/]+\.[a-z]{2,}/i.test(link) ? `https://${link}` : null;
}

// ---------------------------------------------------------------- runs

export function sameLook(a: FlowStyle, b: FlowStyle): boolean {
  return (
    a.font === b.font &&
    a.size === b.size &&
    a.color === b.color &&
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    a.script === b.script &&
    a.highlight === b.highlight &&
    a.link === b.link &&
    (a.tracking ?? 0) === (b.tracking ?? 0)
  );
}

/** Joins neighbours that look the same; programs cut words up for reasons of their own. */
export function joinRuns(runs: readonly FlowRun[]): FlowRun[] {
  const out: FlowRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (run.image === undefined && last && last.image === undefined && sameLook(run.style, last.style))
      out[out.length - 1] = { text: last.text + run.text, style: last.style };
    else if (run.image !== undefined || run.text !== "") out.push(run);
  }
  return out;
}

export const runsText = (runs: readonly FlowRun[]) => runs.map((run) => run.text ?? "").join("");

/** Pieces of the runs between the places where `mark` stands. */
export function splitRuns(runs: readonly FlowRun[], mark: "\t" | "\n"): FlowRun[][] {
  const out: FlowRun[][] = [[]];
  for (const run of runs) {
    if (run.image !== undefined) {
      out[out.length - 1].push(run);
      continue;
    }
    run.text.split(mark).forEach((text, i) => {
      if (i > 0) out.push([]);
      if (text !== "") out[out.length - 1].push({ text, style: run.style });
    });
  }
  return out;
}

// ---------------------------------------------------------------- equations

/** Equations are set in one line: letters, with some of them raised or lowered. */
export type MathPart = { text: string; script?: "super" | "sub"; upright?: boolean };

export const mathText = (parts: readonly MathPart[]) => parts.map((part) => part.text).join("");

/** One letter or number needs no brackets around it. */
export const inBrackets = (parts: MathPart[]): MathPart[] =>
  /^([\p{N}.,]+|.|\([^()]*\))$/u.test(mathText(parts)) ? parts : [{ text: "(" }, ...parts, { text: ")" }];

export function raised(parts: MathPart[], script: "super" | "sub"): MathPart[] {
  if (parts.some((part) => part.script)) return [{ text: script === "super" ? "^(" : "_(" }, ...parts, { text: ")" }];
  return parts.map((part) => ({ ...part, script }));
}

/** Room around signs that stand between two things. */
function airy(text: string, before: string): string {
  let out = "";
  for (const letter of text) {
    const all = before + out;
    const inside = all.trim() !== "" && !/[([{=+\-−±<>≤≥≠≈,;]\s*$/.test(all);
    out += /[=<>≤≥≠≈≡→⇒⇔∈]/.test(letter) || (inside && /[+\-−±×÷·]/.test(letter)) ? ` ${letter} ` : letter;
  }
  return out.replace(/ {2,}/g, " ");
}

export function mathRuns(parts: readonly MathPart[], style: FlowStyle): FlowRun[] {
  const out: FlowRun[] = [];
  let text = "";
  for (const part of parts) {
    const spaced = part.script ? part.text : airy(part.text, text);
    text += spaced;
    // Letters lean, numbers and signs stand.
    for (const piece of spaced.match(/\p{L}+|[^\p{L}]+/gu) ?? []) {
      const lean = !part.upright && /^\p{L}/u.test(piece);
      out.push({
        text: piece,
        style: { ...style, ...(lean && { italic: true }), ...(part.script && { script: part.script }) },
      });
    }
  }
  return joinRuns(out);
}

// ---------------------------------------------------------------- tabs

export type TabStop = {
  at: number;
  kind: "left" | "center" | "right" | "decimal";
  /** Fills the way there. */ fill?: string;
};

/** What a paragraph's tabs mean. Kept aside until the widths of the words can be measured. */
export type TabPlan = {
  stops: TabStop[];
  /** Room between the margins, where the stops are counted from. */
  width: number;
  /** From one stop to the next where nobody set any. */
  step: number;
};

/** The editor's own distance between tab stops. */
const STEP = 36;

type Measure = (text: string, style: FlowStyle) => number;

/** Measures words in the fonts the editor will draw them with. */
async function measurer(paras: readonly FlowPara[]): Promise<Measure> {
  const pen = document.createElement("canvas").getContext("2d");
  const styles = new Set<FlowStyle>();
  let sample = "";
  for (const para of paras) {
    for (const run of para.runs) {
      if (run.image !== undefined) continue;
      styles.add(run.style);
      sample += run.text;
    }
  }
  let css = (style: FlowStyle) =>
    `${style.italic ? "italic" : "normal"} ${style.bold ? 700 : 400} 100px "${style.font ?? "Arial"}", Arial, sans-serif`;
  try {
    const [fonts, { DEFAULT_STYLE }] = await Promise.all([import("../engine/fonts"), import("../model")]);
    const own = (style: FlowStyle) => ({
      ...DEFAULT_STYLE,
      font: style.font?.startsWith("lib:") ? style.font : fonts.matchLibrary(style.font ?? ""),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic),
    });
    await fonts.loadFaces([...styles].map(own), Array.from(new Set(sample)).join("").slice(0, 400));
    css = (style) => {
      const face = fonts.faceCss(fonts.faceOf(own(style)));
      return `${face.style} ${face.weight} 100px ${face.family}`;
    };
  } catch {
    // Without the editor's fonts the widths are a little off, which a tab can live with.
  }
  const known = new Map<string, number>();
  return (text, style) => {
    const size = (style.size ?? 11) * (style.script ? 0.64 : 1);
    const font = css(style);
    const key = `${font}|${text}`;
    let width = known.get(key);
    if (width === undefined) {
      if (pen) pen.font = font;
      width = (pen ? pen.measureText(text).width : text.length * 50) / 100;
      known.set(key, width);
    }
    return width * size + (style.tracking ?? 0) * text.length;
  };
}

/** Page numbers are not known yet; two digits are room enough for most. */
const shown = (text: string) => text.replace(/\{pages?\}/g, "00");

/**
 * Stops that centre words or push them to the right cannot be said with plain
 * stops, so they are worked out here: a line that is nothing but one such part
 * becomes a centred or right-aligned paragraph, in any other the stop moves to
 * where the words begin. Dots on the way to a stop are typed out.
 */
export async function settleTabs(plans: ReadonlyMap<FlowPara, TabPlan>): Promise<void> {
  const hard: [FlowPara, TabPlan][] = [];
  for (const [para, plan] of plans) {
    const tabs = runsText(para.runs).split("\t").length - 1;
    const stops = [...plan.stops].sort((a, b) => a.at - b.at);
    if (tabs === 0) continue;
    if (stops.some((stop) => stop.kind !== "left" || stop.fill)) {
      if (!standsAlone(para, { ...plan, stops })) hard.push([para, { ...plan, stops }]);
      continue;
    }
    const places = stops.map((stop) => stop.at);
    const left = para.left ?? 0;
    // The edge of a hanging paragraph is a stop as well, and there are none before it.
    const hangs = (para.first ?? 0) < 0;
    if (hangs && left > 0 && !places.some((place) => Math.abs(place - left) < 0.5)) places.push(left);
    if (plan.step > 4 && (hangs || Math.abs(plan.step - STEP) > 0.01)) {
      const start = Math.max(0, ...places);
      let next = (Math.floor(start / plan.step + 1e-6) + 1) * plan.step;
      for (let i = 0; i < Math.max(tabs, 12) && next < plan.width; i += 1, next += plan.step) places.push(next);
    }
    places.sort((a, b) => a - b);
    if (places.length > 0) para.tabs = places.map((place) => round(place));
  }
  if (hard.length === 0) return;
  const measure = await measurer(hard.map(([para]) => para));
  for (const [para, plan] of hard) placeParts(para, plan, measure);
}

function nextStop(x: number, para: FlowPara, plan: TabPlan): TabStop {
  const own = plan.stops.find((stop) => stop.at > x + 0.5);
  const left = para.left ?? 0;
  // The edge of a hanging paragraph is a stop as well.
  if ((para.first ?? 0) < 0 && x < left - 0.5 && (!own || own.at > left)) return { at: left, kind: "left" };
  if (own) return own;
  return { at: (Math.floor((x + 0.5) / plan.step) + 1) * plan.step, kind: "left" };
}

/** Where a stop really is: those beyond the edge pull the words to the edge. */
const reach = (stop: TabStop, para: FlowPara, plan: TabPlan) =>
  stop.kind === "left" ? stop.at : Math.min(stop.at, Math.max(0, plan.width - (para.right ?? 0)));

/** Tabs at the start and one piece of text after them. */
function standsAlone(para: FlowPara, plan: TabPlan): boolean {
  const parts = splitRuns(para.runs, "\t");
  const last = parts.pop() ?? [];
  if (para.list || parts.some((part) => part.length > 0) || last.length === 0) return false;
  let x = Math.max(0, (para.left ?? 0) + (para.first ?? 0));
  let stop: TabStop | null = null;
  for (let i = 0; i < parts.length; i += 1) {
    stop = nextStop(x, para, plan);
    x = stop.at;
  }
  if (!stop || stop.kind === "left" || stop.kind === "decimal" || stop.fill) return false;
  const place = reach(stop, para, plan);
  para.runs = last;
  para.left = undefined;
  para.right = undefined;
  para.first = undefined;
  if (stop.kind === "right") {
    para.align = "right";
    if (plan.width - place > 0.5) para.right = round(plan.width - place);
  } else {
    para.align = "center";
    const off = round(2 * place - plan.width);
    if (off > 1) para.left = off;
    else if (off < -1) para.right = -off;
  }
  return true;
}

function placeParts(para: FlowPara, plan: TabPlan, measure: Measure) {
  const parts = splitRuns(para.runs, "\t");
  // The style of every tab, for the dots that may stand in for it.
  const tabStyles: FlowStyle[] = [];
  for (const run of para.runs)
    if (run.image === undefined) for (const letter of run.text) if (letter === "\t") tabStyles.push(run.style);
  const widthOf = (runs: readonly FlowRun[]) =>
    runs.reduce((sum, run) => {
      if (run.image) return sum + (run.image.float ? 0 : run.image.w);
      return sum + measure(shown(run.text), run.style);
    }, 0);
  let x = (para.left ?? 0) + (para.list ? 0 : (para.first ?? 0)) + widthOf(parts[0]);
  const places: number[] = [];
  const runs: FlowRun[] = [...parts[0]];
  for (let i = 1; i < parts.length; i += 1) {
    const stop = nextStop(x, para, plan);
    const part = parts[i];
    const style = tabStyles[i - 1];
    const wide = widthOf(part);
    let start = reach(stop, para, plan);
    if (stop.kind === "right") start -= wide + 0.4;
    else if (stop.kind === "center") start -= wide / 2;
    else if (stop.kind === "decimal") {
      const text = runsText(part);
      const point = text.search(/[.,](?=\d*\D*$)/);
      const head = point < 0 ? text : text.slice(0, point);
      start -= part[0]?.style ? measure(head, part[0].style) : 0;
    }
    start = Math.max(x, start);
    const one = stop.fill ? measure(stop.fill.repeat(20), style) / 20 || 1 : 0;
    const count = one > 0 ? Math.min(400, Math.floor((start - x - 1) / one)) : 0;
    if (stop.fill && count > 0) {
      // Dots right up to the words, the last of them a space as wide as it has to be; no tab is needed.
      const rest = part.length > 0 ? start - x - (count - 1) * one - measure(" ", style) : 0;
      runs.push({ text: stop.fill.repeat(part.length > 0 ? count - 1 : count), style });
      if (part.length > 0) runs.push({ text: " ", style: { ...style, tracking: Math.max(0, round(rest)) } }, ...part);
    } else {
      runs.push({ text: "\t", style }, ...part);
      places.push(round(start));
    }
    x = start + wide;
  }
  para.runs = joinRuns(runs);
  if (places.length > 0) para.tabs = Array.from(new Set(places)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------- paragraphs and their neighbours

export type Side = "top" | "right" | "bottom" | "left";
export const SIDES = ["top", "right", "bottom", "left"] as const;

/** What is known of a paragraph beyond how it looks. */
export type Trait = {
  /** The style it was made with: neighbours of one style may close up. */
  style: string;
  context: boolean;
  autoBefore: boolean;
  autoAfter: boolean;
  list: string;
  /** What the list's number is, counted as Word does. */
  value?: number;
  between?: FlowLine | null;
  edges: Partial<Record<Side | "between", FlowLine | null>>;
};

export type Traits = Map<FlowPara, Trait>;

/** What depends on the neighbours: spacing, and lines around several paragraphs. */
export function settleParas(
  blocks: readonly FlowBlock[],
  traits: Traits,
  { sums, cell }: { /** Spaces that meet add up by themselves. */ sums: boolean; cell: boolean },
) {
  const paras = blocks.filter((block) => block.kind !== "box");
  paras.forEach((a, i) => {
    if (a.kind !== "para") return;
    const own = traits.get(a);
    const b = paras[i + 1];
    const next = b?.kind === "para" ? traits.get(b) : undefined;
    if (!own) return;
    if (i === 0 && cell && own.autoBefore) a.before = 0;
    if (!b && cell && own.autoAfter) a.after = 0;
    if (b?.kind !== "para" || !next) return;
    if (own.style === next.style) {
      if (own.context) a.after = 0;
      if (next.context) b.before = 0;
    }
    if (own.list && own.list === next.list && own.autoAfter && next.autoBefore) {
      a.after = 0;
      b.before = 0;
    }
    // Of two spaces that meet, Word shows the larger one. Here they are added, so only what is missing stays.
    if (!sums && a.after && b.before) b.before = round(Math.max(0, b.before - a.after));
    const alike =
      sameEdges(own.edges, next.edges) &&
      Math.abs((a.left ?? 0) + Math.min(0, a.first ?? 0) - (b.left ?? 0) - Math.min(0, b.first ?? 0)) < 0.5 &&
      Math.abs((a.right ?? 0) - (b.right ?? 0)) < 0.5;
    // Neighbours with the same lines share one frame.
    if (alike && a.border && b.border) {
      a.border = { ...a.border, bottom: undefined };
      b.border = { ...b.border, top: own.between ?? undefined };
    }
  });
  for (const block of paras) {
    if (block.kind !== "para" || !block.border) continue;
    const { top, right, bottom, left } = block.border;
    block.border = top || right || bottom || left ? cleanEdges(block.border) : undefined;
    if (!block.border) delete block.border;
  }
}

export const cleanEdges = (edges: NonNullable<FlowPara["border"]>): NonNullable<FlowPara["border"]> =>
  Object.fromEntries(Object.entries(edges).filter(([, line]) => line));

export const lineKey = (line: FlowLine | null | undefined) =>
  line ? `${line.color}|${line.width}|${line.dash ?? "solid"}` : "";

const sameEdges = (a: Trait["edges"], b: Trait["edges"]) =>
  (["top", "right", "bottom", "left", "between"] as const).every((name) => lineKey(a[name]) === lineKey(b[name]));

/**
 * Says where numbers do not simply go on. Both for a reader that starts over
 * after every other paragraph and for one that keeps counting.
 */
export function numberLists(blocks: readonly FlowBlock[], traits: Traits) {
  type Count = { kind: string; value: number };
  let strict: (Count | undefined)[] = [];
  let loose: (Count | undefined)[] = [];
  const step = (counts: (Count | undefined)[], level: number, kind: string) => {
    counts.length = Math.min(counts.length, level + 1);
    const was = counts[level];
    return was?.kind === kind ? was.value + 1 : 1;
  };
  for (const block of blocks) {
    if (block.kind === "table")
      block.rows.forEach((row) => row.cells.forEach((cell) => numberLists(cell.blocks, traits)));
    if (block.kind === "box") numberLists(block.blocks, traits);
    if (block.kind !== "para" || !block.list) {
      strict = [];
      continue;
    }
    const { list } = block;
    const kind = list.type + list.mark;
    const value = list.type === "number" ? (traits.get(block)?.value ?? 1) : 0;
    const a = step(strict, list.level, kind);
    const b = step(loose, list.level, kind);
    if (list.type === "number" && (a !== value || b !== value)) block.list = { ...list, start: value };
    strict[list.level] = { kind, value };
    loose[list.level] = { kind, value };
  }
}

/** For places that hold nothing but paragraphs. */
export function onlyParas(traits: Traits, blocks: readonly FlowBlock[]): FlowPara[] {
  return blocks.flatMap((block): FlowPara[] => {
    if (block.kind === "para") return [block];
    if (block.kind === "box") {
      for (const para of block.blocks) if (block.fill && !para.fill) para.fill = block.fill;
      return block.blocks;
    }
    if (block.kind === "table") return flatTable(traits, block);
    if (block.kind === "rule") {
      const line: FlowLine = { color: block.color ?? "#000000", width: block.width ?? 0.75 };
      return [{ kind: "para", runs: [], border: { bottom: line } }];
    }
    return [];
  });
}

/** A table inside a table: every row one line (or several), the cells a tab apart. */
function flatTable(traits: Traits, table: FlowTable): FlowPara[] {
  const starts = table.cols.map((_, i) => round(table.cols.slice(0, i).reduce((sum, col) => sum + col, 0)));
  const taken: number[] = table.cols.map(() => 0);
  const out: FlowPara[] = [];
  const edge = (cell: FlowCell, side: Side) =>
    (cell.border && side in cell.border ? cell.border[side] : table.border) ?? null;
  for (const row of table.rows) {
    const placed: { cell: FlowCell; col: number }[] = [];
    let col = 0;
    for (const cell of row.cells) {
      while (taken[col] > 0) col += 1;
      placed.push({ cell, col });
      for (let i = 0; i < (cell.colSpan ?? 1); i += 1) if (col + i < taken.length) taken[col + i] = cell.rowSpan ?? 1;
      col += cell.colSpan ?? 1;
    }
    taken.forEach((rows, i) => (taken[i] = Math.max(0, rows - 1)));
    const filled = placed.filter(({ cell }) => !isBlank(cell.blocks));
    const made: FlowPara[] = [];
    if (filled.length <= 1) {
      const only = filled[0] ?? placed[0];
      for (const para of only?.cell.blocks ?? []) {
        if (starts[only.col] > 0 && filled.length > 0) para.left = round((para.left ?? 0) + starts[only.col]);
        if (only.cell.fill && !para.fill) para.fill = only.cell.fill;
        made.push(para);
      }
    } else {
      // Paragraphs and lines of the cells side by side, the first ones on the first line.
      const lines = placed.map(({ cell }) =>
        cell.blocks.flatMap((para) =>
          splitRuns(para.runs, "\n").map((runs, i) => ({
            para,
            runs,
            mark: i === 0 && para.list ? `${markText(traits, para)} ` : "",
          })),
        ),
      );
      const most = Math.max(...lines.map((cell) => cell.length));
      for (let i = 0; i < most; i += 1) {
        const runs: FlowRun[] = [];
        lines.forEach((cell, k) => {
          const line = cell[i];
          const style = line?.runs[0]?.style ?? line?.para.runs[0]?.style ?? cell[0]?.para.runs[0]?.style ?? {};
          if (k > 0) runs.push({ text: "\t", style });
          if (line?.mark) runs.push({ text: line.mark, style });
          for (const run of line?.runs ?? [])
            runs.push(run.image === undefined ? { text: run.text.replace(/\t/g, " "), style: run.style } : run);
        });
        const like = lines.map((cell) => cell[i]).find(Boolean);
        const { before, after, line, fill, keepNext } = like?.para ?? {};
        const same = fill && placed.every(({ cell }) => cell.fill === placed[0].cell.fill);
        made.push({
          kind: "para",
          runs: joinRuns(runs),
          before: i > 0 && lines.every((cell) => !cell[i] || cell[i].para === cell[i - 1]?.para) ? 0 : (before ?? 0),
          after:
            i < most - 1 && lines.every((cell) => !cell[i] || cell[i].para === cell[i + 1]?.para) ? 0 : (after ?? 0),
          line,
          tabs: placed.map((one) => starts[one.col]).filter((stop) => stop > 0),
          ...(same && { fill }),
          ...(keepNext && { keepNext }),
        });
      }
    }
    // A line all along the row can be had as one of its paragraphs.
    const first = made[0];
    const last = made[made.length - 1];
    if (
      first &&
      placed.every(({ cell }) => edge(cell, "top")) &&
      !(out.length > 0 && out[out.length - 1].border?.bottom)
    )
      first.border = { ...first.border, top: edge(placed[0].cell, "top") ?? undefined };
    if (last && placed.every(({ cell }) => edge(cell, "bottom")))
      last.border = { ...last.border, bottom: edge(placed[0].cell, "bottom") ?? undefined };
    out.push(...made);
  }
  return out;
}

/** The bullet or number of a paragraph, written out. */
function markText(traits: Traits, para: FlowPara): string {
  if (!para.list) return "";
  const { type, mark } = para.list;
  if (type === "bullet") return mark;
  const value = traits.get(para)?.value ?? 1;
  const format = Object.entries(KINDS).find(([, sign]) => mark.includes(sign));
  return format ? mark.replace(format[1], countText(format[0], value)) : mark;
}

/** A paragraph with line ends and aligned tabs, as one paragraph a line. */
export function splitLines(para: FlowPara, tabs: Map<FlowPara, TabPlan>, traits: Traits): FlowPara[] {
  const plan = tabs.get(para);
  const text = runsText(para.runs);
  if (!plan || !text.includes("\n") || !text.includes("\t")) return [para];
  if (!plan.stops.some((stop) => stop.kind !== "left" || stop.fill)) return [para];
  const lines = splitRuns(para.runs, "\n");
  const trait = traits.get(para);
  return lines.map((runs, i) => {
    const style = para.runs.find((run) => run.image === undefined)?.style ?? {};
    const part: FlowPara = { ...para, runs: runs.length > 0 ? runs : [{ text: "", style }] };
    if (i > 0) {
      part.before = 0;
      part.breakBefore = undefined;
      part.first = undefined;
      part.list = undefined;
    }
    if (i < lines.length - 1) part.after = 0;
    tabs.set(part, plan);
    if (trait) traits.set(part, { ...trait, context: false });
    return part;
  });
}

/** A picture with nothing beside it, as a paragraph of its own. */
export function standPara(
  { image, x, before, after }: { image: FlowImage; x: number; before: number; after: number },
  room: number,
): FlowPara {
  const para: FlowPara = {
    kind: "para",
    runs: [{ image }],
    before: round(Math.max(0, before)),
    after: round(after),
    line: { times: 1 },
  };
  const free = room - image.w;
  if (free > 4 && Math.abs(x - free / 2) < 6) para.align = "center";
  else if (free > 4 && Math.abs(x - free) < 6) para.align = "right";
  else if (x > 0.5) para.left = round(x);
  return para;
}

// ---------------------------------------------------------------- sections

/** As much of a section as it takes to know whether two can be one. */
type Ground = { w: number; h: number; margin: FlowMargin; cols: number; gap: number; kind: string };
export type Chunk<R extends Ground> = { room: R; blocks: FlowBlock[] };

const weightOf = (blocks: readonly FlowBlock[]): number =>
  blocks.reduce((sum, block) => {
    if (block.kind === "para") return sum + 20 + runsText(block.runs).length;
    if (block.kind === "table") return sum + block.rows.reduce((all, row) => all + row.cells.length * 20, 0);
    return sum;
  }, 0);

/**
 * A section can start in the middle of a page, with other columns or margins.
 * Pages here are the same from top to bottom, so such sections become one: other
 * margins turn into indents, and the columns of the longest part win.
 */
export function joinChunks<R extends Ground>(chunks: readonly Chunk<R>[]): Chunk<R>[] {
  const out: (Chunk<R> & { weights: Map<number, number> })[] = [];
  for (const { room, blocks } of chunks) {
    const last = out[out.length - 1];
    const goesOn = last && room.kind === "continuous" && room.w === last.room.w && room.h === last.room.h;
    if (!last || !goesOn) {
      out.push({ room, blocks: [...blocks], weights: new Map([[room.cols, weightOf(blocks)]]) });
      continue;
    }
    const left = room.margin.left - last.room.margin.left;
    const right = room.margin.right - last.room.margin.right;
    if (Math.abs(left) > 0.5 || Math.abs(right) > 0.5) {
      for (const block of blocks) {
        if (block.kind === "para") {
          block.left = round((block.left ?? 0) + left);
          block.right = round((block.right ?? 0) + right);
          block.tabs = block.tabs?.map((stop) => round(stop + left));
        } else if (block.kind === "table" && !block.align) block.left = round((block.left ?? 0) + left);
      }
    }
    last.blocks.push(...blocks);
    last.weights.set(room.cols, (last.weights.get(room.cols) ?? 0) + weightOf(blocks));
    const best = [...last.weights].sort((a, b) => b[1] - a[1])[0][0];
    if (best !== last.room.cols)
      last.room = { ...last.room, cols: best, gap: room.cols === best ? room.gap : last.room.gap };
  }
  return out;
}

/** A break right before something that starts a page anyway would leave a blank one. */

export function tidyBreaks(blocks: readonly FlowBlock[]) {
  let before: FlowBlock | null = null;
  for (const block of blocks) {
    if (block.kind === "box") continue;
    if (block.kind === "para" && block.breakBefore && (!before || before.kind === "break")) delete block.breakBefore;
    before = block;
  }
}

export const isBlank = (blocks: readonly FlowBlock[]): boolean =>
  blocks.every(
    (block) =>
      block.kind === "para" &&
      !block.border &&
      !block.fill &&
      block.runs.every((run) => (run.image ? run.image.bytes.length === 0 : run.text.trim() === "")),
  );

// ---------------------------------------------------------------- tables

function heavier(a: FlowLine | null, b: FlowLine | null): FlowLine | null {
  if (!a || !b) return a ?? b;
  if (a.width !== b.width) return a.width > b.width ? a : b;
  const light = (line: FlowLine) => channels(line.color).reduce((sum, part) => sum + part, 0);
  return light(b) < light(a) ? b : a;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Cells that touch agree on the line between them: the heavier one, and any rather than none. */
export function settleLines<
  S extends { row: number; col: number; rows: number; cols: number; lines: Record<Side, FlowLine | null> },
>(slots: readonly S[], grid: readonly (S | null)[][], rows: number, cols: number) {
  const before = new Map(slots.map((slot) => [slot, { ...slot.lines }]));
  for (const slot of slots) {
    const own = before.get(slot);
    if (!own) continue;
    for (const side of SIDES) {
      const facing = new Set<S>();
      const look = (r: number, c: number) => {
        const other = r >= 0 && r < rows && c >= 0 && c < cols ? grid[r][c] : null;
        if (other && other !== slot) facing.add(other);
      };
      if (side === "top" || side === "bottom")
        for (let c = slot.col; c < slot.col + slot.cols; c += 1)
          look(side === "top" ? slot.row - 1 : slot.row + slot.rows, c);
      else
        for (let r = slot.row; r < slot.row + slot.rows; r += 1)
          look(r, side === "left" ? slot.col - 1 : slot.col + slot.cols);
      const agreed = [...facing].map((other) => heavier(own[side], before.get(other)?.[OPPOSITE[side]] ?? null));
      if (agreed.length > 0 && agreed.every((line) => lineKey(line) === lineKey(agreed[0])))
        slot.lines[side] = agreed[0];
      else if (agreed.length > 0) slot.lines[side] = own[side];
    }
  }
}

/** How high a cell has to be for the pictures that stand in its lines. 0 when there are none. */
export function pictureHeight({ blocks }: FlowCell): number {
  const pictures = blocks.flatMap((para) =>
    para.runs.flatMap((run) => (run.image && !run.image.float ? [run.image] : [])),
  );
  if (pictures.length === 0) return 0;
  return blocks.reduce((sum, para) => {
    const size = Math.max(0, ...para.runs.map((run) => run.style?.size ?? 0));
    const high = Math.max(size * 1.2, ...para.runs.map((run) => (run.image && !run.image.float ? run.image.h : 0)));
    return sum + high + (para.before ?? 0) + (para.after ?? 0);
  }, 0);
}

/** What occurs most often. */
export function tally(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
