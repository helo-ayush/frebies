import type { PDFPageProxy } from "pdfjs-dist";
import type { Align, GlyphRange, Run, Style } from "../model";
import { tidyRuns } from "../model";
import { IDENTITY, apply, mul, type Matrix } from "./matrix";
import type { ShowInfo } from "./content";
import { registerPdfFont, type PdfFontObject } from "./fonts";

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

type Fragment = {
  angle: number;
  size: number;
  /** In the frame turned by `angle`. */
  x0: number;
  x1: number;
  y: number;
  glyphs: { glyph: Glyph; x: number; rise: number; before: string }[];
  /** A second copy drawn on top, as some programs do for bold. */
  extra: Glyph[];
  /** Letters that stack and reorder, so baselines wander. */
  odd: boolean;
  /** Holds letters the PDF gives no text for: left alone. */
  broken: boolean;
};

export type Block = {
  key: string;
  angle: number;
  /** Top-left corner in page space, with the block's own width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** One entry per line, with its width in points. */
  lines: { runs: Run[]; x: number; width: number }[];
  align: Align;
  size: number;
  leading: number;
  /** Local y of the first baseline below the top edge. */
  ascent: number;
  alpha: number;
  ranges: GlyphRange[];
  text: string;
  /** Where each line sits, in the frame turned by `angle`, with the left edge of every letter and the line's end. */
  rows: { x0: number; x1: number; y: number; size: number; stops: number[] }[];
};

export type PageText = { shows: ShowInfo[]; glyphs: Glyph[]; blocks: Block[] };

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
  };
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
        break;
      case OPS.setStrokeRGBColor:
        s.stroke = hexColor(args[0], "#000000");
        break;
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
            const value = item.unicode ?? "";
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

  return { shows, glyphs, blocks: findBlocks(glyphs) };
}

// ---------------------------------------------------------------- lines and paragraphs

const turn = (angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
};

/** Page space to the frame where the text runs left to right. */
function localOf(x: number, y: number, t: { cos: number; sin: number }) {
  return { x: x * t.cos + y * t.sin, y: -x * t.sin + y * t.cos };
}

function pageOfLocal(x: number, y: number, t: { cos: number; sin: number }) {
  return { x: x * t.cos - y * t.sin, y: x * t.sin + y * t.cos };
}

/** Scripts whose letters stack and reorder, so their baselines wander. */
const stacked = (text: string) => /[֐-ࣿऀ-໿က-႟ក-៿]/.test(text);
const readable = (text: string) => text !== "" && !/[\u0000-\u0008-�]/.test(text);

function findBlocks(glyphs: readonly Glyph[]): Block[] {
  // 1. letters that follow each other
  const fragments: Fragment[] = [];
  let open: Fragment | null = null;
  let gapText = "";
  let pending: Glyph[] = [];

  for (const glyph of glyphs) {
    if (glyph.size < 0.8) continue;
    const t = turn(glyph.angle);
    const p = localOf(glyph.x, glyph.y, t);
    if (glyph.space) {
      if (open) {
        gapText += glyph.text || " ";
        pending.push(glyph);
      }
      continue;
    }
    const broken = !readable(glyph.text);
    const odd = broken || stacked(glyph.text);
    const gap: number = open ? p.x - open.x1 : 0;
    const drop: number = open ? p.y - open.y : 0;
    const reach = open ? Math.max(open.size, glyph.size) : 0;
    const loose = open !== null && odd && open.odd;
    const level = open !== null && Math.abs(drop) < open.size * (loose ? 0.6 : 0.12);
    const script =
      open !== null &&
      !level &&
      Math.abs(drop) < open.size * 0.62 &&
      (glyph.size < open.size * 0.86 || Math.abs(drop) < open.size * 0.3);
    const joins =
      open !== null &&
      open.odd === odd &&
      Math.abs(((glyph.angle - open.angle + 540) % 360) - 180) < 0.6 &&
      (level || script) &&
      gap > -reach * (loose ? 1.6 : 0.4) &&
      gap < reach * (gapText ? 1.6 : script ? 0.5 : 0.95) &&
      glyph.size < open.size * 2.2;
    if (open && joins) {
      const before = gapText !== "" ? gapText.replace(/[^ ]/g, " ") : gap > reach * 0.17 ? " " : "";
      for (const space of pending) open.extra.push(space);
      open.glyphs.push({ glyph, x: p.x, rise: script && !loose ? -drop : 0, before });
      open.x1 = Math.max(open.x1, p.x + glyph.w);
      open.broken ||= broken;
    } else {
      open = {
        angle: glyph.angle,
        size: glyph.size,
        x0: p.x,
        x1: p.x + glyph.w,
        y: p.y,
        glyphs: [{ glyph, x: p.x, rise: 0, before: "" }],
        extra: [],
        odd,
        broken,
      };
      fragments.push(open);
    }
    gapText = "";
    pending = [];
  }

  // 2. the same line, drawn in pieces or out of order
  fragments.sort((a, b) => a.angle - b.angle || a.y - b.y || a.x0 - b.x0);
  const text = (fragment: Fragment) => fragment.glyphs.map((item) => item.before + item.glyph.text).join("");
  const lines: Fragment[] = [];
  for (const fragment of fragments) {
    let target: Fragment | null = null;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (Math.abs(line.angle - fragment.angle) > 0.6) break;
      if (fragment.y - line.y > Math.max(line.size, fragment.size) * 0.6) break;
      if (line.odd !== fragment.odd) continue;
      if (Math.abs(fragment.y - line.y) > Math.min(line.size, fragment.size) * (line.odd ? 0.5 : 0.14)) continue;
      const reach = Math.max(line.size, fragment.size);
      if (
        Math.abs(fragment.x0 - line.x0) < reach * 0.16 &&
        Math.abs(fragment.x1 - line.x1) < reach * 0.2 &&
        text(fragment) === text(line)
      ) {
        line.extra.push(...fragment.glyphs.map((item) => item.glyph), ...fragment.extra);
        target = line;
        break;
      }
      const gap = fragment.x0 - line.x1;
      const ratio = line.size / fragment.size;
      if (gap > -reach * 0.3 && gap < reach * 0.62 && ratio > 0.5 && ratio < 2) {
        const first = fragment.glyphs[0];
        line.glyphs.push(
          { ...first, before: first.before || (gap > reach * 0.17 ? " " : "") },
          ...fragment.glyphs.slice(1),
        );
        line.extra.push(...fragment.extra);
        line.broken ||= fragment.broken;
        line.x1 = Math.max(line.x1, fragment.x1);
        line.size = Math.max(line.size, fragment.size);
        target = line;
        break;
      }
    }
    if (!target) lines.push({ ...fragment, glyphs: [...fragment.glyphs], extra: [...fragment.extra] });
  }

  // 3. lines that make a paragraph
  const face = (line: Fragment) => {
    const count = new Map<string, number>();
    for (const { glyph } of line.glyphs) count.set(glyph.font, (count.get(glyph.font) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const firstWord = (line: Fragment) => {
    let end = line.x0;
    for (const item of line.glyphs) {
      if (item.before && item !== line.glyphs[0]) break;
      end = item.x + item.glyph.w;
    }
    return end - line.x0;
  };
  type Group = { lines: Fragment[]; leading: number };
  const groups: Group[] = [];
  for (const line of lines) {
    let home: Group | null = null;
    for (let i = groups.length - 1; i >= 0 && i > groups.length - 60; i -= 1) {
      const group = groups[i];
      const last = group.lines[group.lines.length - 1];
      if (Math.abs(last.angle - line.angle) > 0.6) continue;
      const step = line.y - last.y;
      if (step < line.size * 0.82 || step > line.size * 2.05) continue;
      if (line.broken || last.broken || line.odd !== last.odd) continue;
      if (Math.abs(last.size - line.size) > line.size * 0.06) continue;
      if (group.leading && Math.abs(step - group.leading) > group.leading * 0.08) continue;
      if (face(last) !== face(group.lines[0]) && face(line) !== face(last)) continue;
      const overlap = Math.min(last.x1, line.x1) - Math.max(last.x0, line.x0);
      if (overlap < Math.min(last.x1 - last.x0, line.x1 - line.x0) * 0.5) continue;
      const first = group.lines[0];
      const body = group.lines[1] ?? last;
      const left =
        Math.abs(line.x0 - body.x0) < line.size * 0.5 ||
        (group.lines.length === 1 && Math.abs(line.x0 - first.x0) < line.size * 3.2);
      const center = Math.abs((line.x0 + line.x1) / 2 - (last.x0 + last.x1) / 2) < line.size * 0.5;
      const right = Math.abs(line.x1 - last.x1) < line.size * 0.5;
      if (!left && !center && !right) continue;
      // Something else between them would break the paragraph.
      const blocked = lines.some(
        (other) =>
          other !== line &&
          other !== last &&
          Math.abs(other.angle - line.angle) < 0.6 &&
          other.y > last.y + line.size * 0.3 &&
          other.y < line.y - line.size * 0.3 &&
          Math.min(other.x1, line.x1) - Math.max(other.x0, line.x0) > line.size,
      );
      if (blocked) continue;
      home = group;
      if (!group.leading) group.leading = step;
      break;
    }
    if (home) home.lines.push(line);
    else groups.push({ lines: [line], leading: 0 });
  }

  // 4. a line that stops early ends its paragraph
  const paragraphs: Group[] = [];
  for (const group of groups) {
    if (group.lines.length === 1) {
      paragraphs.push(group);
      continue;
    }
    const x0 = Math.min(...group.lines.map((line) => line.x0));
    const x1 = Math.max(...group.lines.map((line) => line.x1));
    let part: Fragment[] = [group.lines[0]];
    for (let i = 1; i < group.lines.length; i += 1) {
      const last = group.lines[i - 1];
      const line = group.lines[i];
      const centered =
        Math.abs((last.x0 + last.x1) / 2 - (x0 + x1) / 2) < last.size * 0.4 && Math.abs(last.x0 - x0) > last.size * 0.6;
      const room = centered ? x1 - x0 - (last.x1 - last.x0) : x1 - last.x1;
      const fits = firstWord(line) + last.size * 0.24 < room * 0.98;
      const narrow = x1 - x0 < last.size * 9;
      const indented = line.x0 - x0 > line.size * 0.9 && last.x0 - x0 < line.size * 0.5 && !centered && i > 1;
      if (fits || narrow || indented) {
        paragraphs.push({ lines: part, leading: group.leading });
        part = [line];
      } else part.push(line);
    }
    paragraphs.push({ lines: part, leading: group.leading });
  }

  // 5. as blocks
  return paragraphs
    .filter((group) => !group.lines.some((line) => line.broken))
    .map((group, index) => blockOf(group.lines, group.leading, index))
    .filter((block): block is Block => block !== null);
}

function runsOf(line: Fragment): Run[] {
  const runs: Run[] = [];
  for (const item of line.glyphs) {
    const { glyph } = item;
    const style: Style = {
      font: glyph.font,
      size: Math.round(glyph.size * 100) / 100,
      color: glyph.color,
      bold: false,
      italic: glyph.slant,
      underline: false,
      strike: false,
      tracking: 0,
      rise: Math.abs(item.rise) > 0.05 ? Math.round(item.rise * 100) / 100 : 0,
    };
    if (item.before) runs.push({ text: item.before, style: runs[runs.length - 1]?.style ?? style });
    runs.push({ text: glyph.text, style });
  }
  return tidyRuns(runs);
}

function blockOf(lines: Fragment[], leading: number, index: number): Block | null {
  const angle = lines[0].angle;
  const t = turn(angle);
  const size = Math.max(...lines.map((line) => line.size));
  const x0 = Math.min(...lines.map((line) => line.x0));
  const x1 = Math.max(...lines.map((line) => line.x1));
  const line = leading || size * 1.2;
  const ascent = firstBaseline(size, line);
  const top = lines[0].y - ascent;
  const corner = pageOfLocal(x0, top, t);

  let align: Align = "left";
  if (lines.length > 1) {
    const full = lines.slice(0, -1);
    const near = (a: number, b: number, k: number) => Math.abs(a - b) < size * k;
    const lefts = lines.every((item, i) => near(item.x0, x0, 0.4) || (i === 0 && item.x0 - x0 < size * 3.2));
    const rights = full.every((item) => near(item.x1, x1, 0.12));
    const centers = lines.every((item) => near((item.x0 + item.x1) / 2, (x0 + x1) / 2, 0.4));
    if (lefts) align = rights && full.length > 1 ? "justify" : "left";
    else if (centers) align = "center";
    else if (lines.every((item) => near(item.x1, x1, 0.4))) align = "right";
  }

  const byOp = new Map<number, Set<number>>();
  const note = (glyph: Glyph) => {
    let set = byOp.get(glyph.op);
    if (!set) byOp.set(glyph.op, (set = new Set()));
    set.add(glyph.at);
  };
  for (const item of lines) {
    item.glyphs.forEach(({ glyph }) => note(glyph));
    item.extra.forEach(note);
  }
  const ranges: GlyphRange[] = [];
  for (const [op, set] of byOp) {
    const at = [...set].sort((a, b) => a - b);
    let from = at[0];
    for (let i = 1; i <= at.length; i += 1) {
      if (at[i] === at[i - 1] + 1) continue;
      ranges.push([op, from, at[i - 1] + 1]);
      from = at[i];
    }
  }

  const out = lines.map((item) => ({ runs: runsOf(item), x: item.x0 - x0, width: item.x1 - item.x0 }));
  const text = out.map((item) => item.runs.map((run) => run.text).join("")).join("\n");
  if (text.trim() === "") return null;
  return {
    key: `b${index}`,
    angle: Math.abs(angle) < 0.05 ? 0 : angle,
    x: corner.x,
    y: corner.y,
    w: x1 - x0,
    h: line * lines.length,
    lines: out,
    align,
    size,
    leading: line,
    ascent,
    alpha: lines[0].glyphs[0].glyph.alpha,
    ranges,
    text,
    rows: lines.map((item) => ({
      x0: item.x0,
      x1: item.x1,
      y: item.y,
      size: item.size,
      stops: [...item.glyphs.map((glyph) => glyph.x), item.x1],
    })),
  };
}
