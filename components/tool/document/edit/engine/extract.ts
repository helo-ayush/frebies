import type { PDFPageProxy } from "pdfjs-dist";
import { IDENTITY, apply, bounds, intersect, mul, type Box, type Matrix, type Point } from "./matrix";
import type { ShowInfo } from "./content";
import { registerPdfFont, symbolText, type PdfFontObject } from "./fonts";
import { findBlocks, type Block } from "./paragraphs";
import type { Cmd } from "./shapes";
import { rulesOf, type VectorPath } from "./vectors";

export type { Block };

/**
 * Finds the text of a page: what it says, where each letter sits and which
 * drawing instruction put it there, gathered into lines and paragraphs.
 */

export type Glyph = {
  op: number;
  at: number;
  text: string;
  /** Baseline start, in page space. */
  x: number;
  y: number;
  /** Advance along the line. */
  w: number;
  size: number;
  /** Degrees, clockwise on screen. */
  angle: number;
  font: string;
  color: string;
  alpha: number;
  slant: boolean;
  space: boolean;
};

export type PageText = {
  shows: ShowInfo[];
  glyphs: Glyph[];
  blocks: Block[];
  /** Lines and shapes, and how many painting instructions there are in all. */
  paths: VectorPath[];
  paints: number;
};

/** Arimo's, which sets the rhythm of every text box. */
export const STRUT_ASCENT = 1854 / 2048;
export const STRUT_DESCENT = 434 / 2048;

/** From the top of a text box to its first baseline. */
export function firstBaseline(size: number, leading: number): number {
  return (leading - (STRUT_ASCENT + STRUT_DESCENT) * size) / 2 + STRUT_ASCENT * size;
}

type PdfGlyph = {
  unicode: string;
  width: number;
  isSpace: boolean;
  originalCharCode: number;
  vmetric?: number[] | null;
};

type TextState = {
  ctm: Matrix;
  tm: Matrix;
  x: number;
  y: number;
  lineX: number;
  lineY: number;
  font: PdfFontObject | null;
  fontKey: string;
  size: number;
  tc: number;
  tw: number;
  hscale: number;
  leading: number;
  rise: number;
  mode: number;
  fill: string;
  stroke: string;
  alpha: number;
  strokeAlpha: number;
  /** Painted with a pattern instead of a colour. */
  fillPattern: boolean;
  strokePattern: boolean;
  lineWidth: number;
  lineCap: 0 | 1 | 2;
  lineJoin: 0 | 1 | 2;
  dash: number[];
  clip: Box | null;
};

const EPS = 1e-6;

function commonObject<T>(page: PDFPageProxy, name: string): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      page.commonObjs.get(name, (value: T) => {
        clearTimeout(timer);
        resolve(value);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

const hexColor = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

export async function readText(page: PDFPageProxy, sourceId: string, pageIndex: number): Promise<PageText> {
  const pdfjs = await import("pdfjs-dist");
  const { OPS } = pdfjs;
  const list = await page.getOperatorList({ intent: "display", annotationMode: pdfjs.AnnotationMode.DISABLE });
  const viewport = page.getViewport({ scale: 1 });
  const STROKES = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const FILLS = new Set<number>([
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const EVEN_ODD = new Set<number>([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke]);

  const wanted = new Set<string>();
  list.fnArray.forEach((fn: number, i: number) => {
    const args = list.argsArray[i];
    if (fn === OPS.setFont) wanted.add(args[0]);
    if (fn === OPS.setGState)
      for (const [key, value] of args[0] as [string, unknown][]) if (key === "Font") wanted.add((value as [string])[0]);
  });
  const fonts = new Map<string, PdfFontObject>();
  await Promise.all(
    [...wanted].map(async (name) => {
      const font = await commonObject<PdfFontObject>(page, name);
      if (font) fonts.set(name, font);
    }),
  );

  const shows: ShowInfo[] = [];
  const glyphs: Glyph[] = [];
  let s: TextState = {
    ctm: viewport.transform as Matrix,
    tm: IDENTITY,
    x: 0,
    y: 0,
    lineX: 0,
    lineY: 0,
    font: null,
    fontKey: "",
    size: 0,
    tc: 0,
    tw: 0,
    hscale: 1,
    leading: 0,
    rise: 0,
    mode: 0,
    fill: "#000000",
    stroke: "#000000",
    alpha: 1,
    strokeAlpha: 1,
    fillPattern: false,
    strokePattern: false,
    lineWidth: 1,
    lineCap: 0,
    lineJoin: 0,
    dash: [],
    clip: null,
  };
  const paths: VectorPath[] = [];
  let paints = 0;
  let clipping = false;
  const stack: TextState[] = [];
  /** Inside a soft mask nothing is text to a reader, and the page's own list does not count it. */
  let masked = 0;
  const groups: boolean[] = [];

  const save = () => stack.push({ ...s });
  const restore = () => {
    const back = stack.pop();
    if (back) s = back;
  };
  const move = (x: number, y: number) => {
    s.x = s.lineX += x;
    s.y = s.lineY += y;
  };

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    switch (fn) {
      case OPS.save:
        save();
        break;
      case OPS.restore:
        restore();
        break;
      case OPS.transform:
        s.ctm = mul(args as Matrix, s.ctm);
        break;
      case OPS.paintFormXObjectBegin:
        save();
        if (args[0]) s.ctm = mul(Array.from(args[0] as ArrayLike<number>) as Matrix, s.ctm);
        break;
      case OPS.paintFormXObjectEnd:
        restore();
        break;
      case OPS.beginGroup: {
        const isMask = Boolean((args[0] as { smask?: unknown }).smask);
        groups.push(isMask);
        if (isMask) masked += 1;
        save();
        break;
      }
      case OPS.endGroup:
        if (groups.pop()) masked -= 1;
        restore();
        break;
      case OPS.beginText:
        s.tm = IDENTITY;
        s.x = s.y = s.lineX = s.lineY = 0;
        break;
      case OPS.setCharSpacing:
        s.tc = args[0];
        break;
      case OPS.setWordSpacing:
        s.tw = args[0];
        break;
      case OPS.setHScale:
        s.hscale = args[0] / 100;
        break;
      case OPS.setLeading:
        s.leading = -args[0];
        break;
      case OPS.setTextRise:
        s.rise = args[0];
        break;
      case OPS.setTextRenderingMode:
        s.mode = args[0];
        break;
      case OPS.setFont:
        s.font = fonts.get(args[0]) ?? null;
        s.fontKey = args[0];
        s.size = args[1];
        break;
      case OPS.setGState:
        for (const [key, value] of args[0] as [string, unknown][]) {
          if (key === "ca") s.alpha = Number(value);
          else if (key === "CA") s.strokeAlpha = Number(value);
          else if (key === "LW") s.lineWidth = Number(value);
          else if (key === "LC") s.lineCap = capOf(value);
          else if (key === "LJ") s.lineJoin = capOf(value);
          else if (key === "D") s.dash = [...((value as [number[], number])[0] ?? [])];
          else if (key === "Font") {
            const [name, size] = value as [string, number];
            s.font = fonts.get(name) ?? null;
            s.fontKey = name;
            s.size = size;
          }
        }
        break;
      case OPS.setFillRGBColor:
        s.fill = hexColor(args[0], "#000000");
        s.fillPattern = false;
        break;
      case OPS.setStrokeRGBColor:
        s.stroke = hexColor(args[0], "#000000");
        s.strokePattern = false;
        break;
      case OPS.setFillColorN:
        s.fillPattern = true;
        break;
      case OPS.setStrokeColorN:
        s.strokePattern = true;
        break;
      case OPS.setLineWidth:
        s.lineWidth = args[0];
        break;
      case OPS.setLineCap:
        s.lineCap = capOf(args[0]);
        break;
      case OPS.setLineJoin:
        s.lineJoin = capOf(args[0]);
        break;
      case OPS.setDash:
        s.dash = Array.from((args[0] ?? []) as ArrayLike<number>);
        break;
      case OPS.clip:
      case OPS.eoClip:
        clipping = true;
        break;
      case OPS.constructPath: {
        if (masked > 0) break;
        const op = paints;
        paints += 1;
        const [how, data] = args as [number, [ArrayLike<number> | null]];
        const path = pageSpace(data?.[0] ?? null, s.ctm);
        if (path.length > 0) {
          const box = boundsOf(path);
          const stroked = STROKES.has(how);
          const filled = FILLS.has(how);
          const scale = Math.sqrt(Math.abs(s.ctm[0] * s.ctm[3] - s.ctm[1] * s.ctm[2]));
          const seen = s.clip ? intersect(s.clip, { x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }) : box;
          if ((stroked || filled) && (seen.w > 0 || seen.h > 0 || !s.clip)) {
            paths.push({
              op,
              path,
              // What is cut off by a frame around it is not there to be picked.
              box: s.clip && filled && !stroked ? intersect(s.clip, box) : box,
              stroke: stroked && !s.strokePattern ? s.stroke : null,
              fill: filled && !s.fillPattern ? s.fill : null,
              width: stroked ? Math.max(0.05, s.lineWidth * scale) : 0,
              dash: s.dash.map((value) => value * scale),
              cap: s.lineCap,
              join: s.lineJoin,
              evenOdd: EVEN_ODD.has(how),
              alpha: filled ? s.alpha : s.strokeAlpha,
              pattern: (filled && s.fillPattern) || (stroked && s.strokePattern),
            });
          }
          if (clipping) s.clip = s.clip ? intersect(s.clip, box) : box;
        }
        clipping = false;
        break;
      }
      case OPS.moveText:
        move(args[0], args[1]);
        break;
      case OPS.setLeadingMoveText:
        s.leading = args[1];
        move(args[0], args[1]);
        break;
      case OPS.setTextMatrix:
        s.tm = Array.from((args.length === 1 ? args[0] : args) as ArrayLike<number>) as Matrix;
        s.x = s.y = s.lineX = s.lineY = 0;
        break;
      case OPS.nextLine:
        move(0, s.leading);
        break;
      case OPS.showText: {
        if (masked > 0) break;
        const items = args[0] as (number | PdfGlyph)[];
        const font = s.font;
        const unit = (font?.fontMatrix ?? [0.001])[0];
        const vertical = Boolean(font?.vertical);
        const op = shows.length;
        const info: ShowInfo = { items: [], size: s.size, tc: s.tc, tw: s.tw, vertical };
        shows.push(info);
        const abs = Math.abs(s.size);
        const dir = s.size < 0 ? -1 : 1;
        const scaleX = s.hscale * dir;
        const readable = font && !font.isType3Font && !vertical && s.mode !== 3 && s.mode !== 7;
        const fontId = font && readable ? registerPdfFont(sourceId, s.fontKey, font, pageIndex, op) : null;

        const text = mul(s.tm, s.ctm);
        // Where the line runs, and how tall a unit stands.
        const along = { x: text[0] * Math.sign(scaleX || 1), y: text[1] * Math.sign(scaleX || 1) };
        const up = { x: text[2] * dir, y: text[3] * dir };
        const alongLength = Math.hypot(along.x, along.y) || EPS;
        const upLength = Math.hypot(up.x, up.y) || EPS;
        const size = abs * upLength;
        const angle = (Math.atan2(along.y, along.x) * 180) / Math.PI;
        // Screen y grows downward, so "up" leans back when it has a forward part.
        const lean = (along.x * up.x + along.y * up.y) / (alongLength * upLength);

        let x = 0;
        let at = 0;
        for (const item of items) {
          if (typeof item === "number") {
            info.items.push(item);
            x += ((vertical ? 1 : -1) * item * abs) / 1000;
            continue;
          }
          const spacing = (item.isSpace ? s.tw : 0) + s.tc;
          const glyphWidth = vertical ? -((item.vmetric ?? font?.defaultVMetrics)?.[0] ?? -1000) : item.width;
          info.items.push({ w: glyphWidth * unit * 1000, space: item.isSpace });
          const advance = vertical ? glyphWidth * abs * unit - spacing * dir : glyphWidth * abs * unit + spacing * dir;
          if (fontId && !vertical) {
            const from = apply(text, s.x + x * scaleX, s.y + s.rise);
            const value = symbolText(font?.name ?? "", item.unicode ?? "");
            glyphs.push({
              op,
              at,
              text: value,
              x: from.x,
              y: from.y,
              w: advance * Math.abs(scaleX) * alongLength,
              size,
              angle,
              font: fontId,
              color: s.mode === 1 ? s.stroke : s.fill,
              alpha: s.alpha,
              slant: lean > 0.12,
              space: value.trim() === "",
            });
          }
          x += advance;
          at += 1;
        }
        if (vertical) s.y -= x;
        else s.x += x * scaleX;
        break;
      }
      default:
        break;
    }
  }

  return {
    shows,
    glyphs,
    blocks: findBlocks(glyphs, rulesOf(paths), { w: viewport.width, h: viewport.height }),
    paths,
    paints,
  };
}

const capOf = (value: unknown): 0 | 1 | 2 => (value === 1 ? 1 : value === 2 ? 2 : 0);

/** A path as pdf.js keeps it (0 move, 1 line, 2 curve, 3 close), in page space. */
function pageSpace(data: ArrayLike<number> | null, m: Matrix): Cmd[] {
  const out: Cmd[] = [];
  if (!data) return out;
  const at = (i: number): Point => apply(m, data[i], data[i + 1]);
  for (let i = 0; i < data.length;) {
    const kind = data[i];
    i += 1;
    if (kind === 0 || kind === 1) {
      const p = at(i);
      out.push([kind === 0 ? "M" : "L", p.x, p.y]);
      i += 2;
    } else if (kind === 2) {
      const a = at(i);
      const b = at(i + 2);
      const c = at(i + 4);
      out.push(["C", a.x, a.y, b.x, b.y, c.x, c.y]);
      i += 6;
    } else out.push(["Z"]);
  }
  return out;
}

export function boundsOf(path: readonly Cmd[]): Box {
  const points: Point[] = [];
  let from: Point = { x: 0, y: 0 };
  for (const cmd of path) {
    if (cmd[0] === "M" || cmd[0] === "L") {
      from = { x: cmd[1], y: cmd[2] };
      points.push(from);
    } else if (cmd[0] === "C") {
      // Close enough: points along the curve.
      for (let i = 1; i <= 10; i += 1) {
        const t = i / 10;
        const u = 1 - t;
        points.push({
          x: u * u * u * from.x + 3 * u * u * t * cmd[1] + 3 * u * t * t * cmd[3] + t * t * t * cmd[5],
          y: u * u * u * from.y + 3 * u * u * t * cmd[2] + 3 * u * t * t * cmd[4] + t * t * t * cmd[6],
        });
      }
      from = { x: cmd[5], y: cmd[6] };
    }
  }
  return points.length > 0 ? bounds(points) : { x: 0, y: 0, w: 0, h: 0 };
}
