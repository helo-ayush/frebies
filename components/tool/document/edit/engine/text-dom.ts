import type { Para, Run, Style, TextBody } from "../model";
import {
  DEFAULT_STYLE,
  allParas,
  drawnRise,
  drawnSize,
  listMarks,
  paraOf,
  sameStyle,
  splitParas,
  tidyParas,
  tidyRuns,
  type BodyEdit,
} from "../model";
import { firstBaseline } from "./extract";
import { faceCss, loadFaces, splitByFace, type Face } from "./fonts";

/**
 * One way to lay text out, on screen and in the saved file: the browser sets the
 * lines, and the file puts every word exactly where the browser did.
 */

export type Laid = Pick<TextBody, "runs" | "paras" | "align" | "leading"> & {
  wrap: boolean;
  w: number;
  /** Where a box that grows with its text starts to wrap. */
  max?: number;
};

type Kept = { styles: Style[]; paras: Para[] };
const kept = new WeakMap<Element, Kept>();

/** A line end inside a paragraph. Shown as "\n" in the page. */
export const SOFT = "\u2028";
const toDom = (text: string) => text.replace(/\u2028/g, "\n");
const fromDom = (text: string) =>
  text
    .replace(/\n/g, SOFT)
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "");

export const paraSize = (runs: readonly Run[]): number => Math.max(1, ...runs.map((run) => run.style.size));

/** Tabs stop every half inch. */
const TAB = 36;

function rootCss(text: Laid): Partial<CSSStyleDeclaration> {
  const bound = text.wrap || text.max !== undefined;
  return {
    font: `400 10px "fb-arimo"`,
    whiteSpace: bound ? "pre-wrap" : "pre",
    overflowWrap: bound ? "anywhere" : "normal",
    width: text.wrap ? `${Math.max(4, text.w)}px` : "max-content",
    maxWidth: !text.wrap && text.max !== undefined ? `${Math.max(4, text.max)}px` : "none",
    minWidth: "2px",
    boxSizing: "border-box",
    letterSpacing: "0",
    textRendering: "geometricPrecision",
    fontKerning: "normal",
    fontVariantLigatures: "none",
    tabSize: `${TAB}px`,
  };
}

function dressSpan(span: HTMLElement, style: Style, face: Face) {
  const css = faceCss(face);
  const rise = drawnRise(style);
  const size = drawnSize(style);
  span.style.fontFamily = css.family;
  span.style.fontWeight = String(css.weight);
  span.style.fontStyle = css.style;
  span.style.fontSize = `${size}px`;
  span.style.lineHeight = "0";
  span.style.color = style.color;
  span.style.letterSpacing = style.tracking ? `${style.tracking}px` : "0";
  if (style.back) span.style.backgroundColor = style.back;
  if (rise) {
    span.style.position = "relative";
    span.style.top = `${-rise}px`;
  }
  const lines = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (lines) {
    span.style.textDecorationLine = lines;
    span.style.textDecorationThickness = `${Math.max(0.5, size * 0.06)}px`;
    span.style.textUnderlineOffset = `${size * 0.12}px`;
    span.style.textDecorationSkipInk = "none";
  }
}

// ---------------------------------------------------------------- marks in front of paragraphs

/** How a bullet or number looks: like the words it stands before. */
export function markStyle(runs: readonly Run[], mark: string): Style {
  const base = runs[0]?.style ?? DEFAULT_STYLE;
  const plain: Style = {
    ...base,
    underline: false,
    strike: false,
    tracking: 0,
    rise: 0,
    back: undefined,
    script: undefined,
    link: undefined,
  };
  const point = mark.codePointAt(0) ?? 0;
  // Bullets are drawn by the symbol font, so they look alike next to every text font.
  return point > 0x2020 ? { ...plain, font: "lib:symbols", bold: false, italic: false } : plain;
}

// ---------------------------------------------------------------- rendering

/** Fills `root` with the text: a block for every paragraph, a span for every run. */
export function renderText(root: HTMLElement, text: Laid, seen = false) {
  Object.assign(root.style, rootCss(text));
  root.replaceChildren();
  const styles: Style[] = [];
  const groups = splitParas(text.runs);
  const marks = text.paras ? listMarks(text) : [];
  const paras = groups.map((_, i) => paraOf(text, i));
  groups.forEach((runs, i) => {
    const para = paras[i];
    const size = paraSize(runs);
    const leading = para.leading ?? text.leading;
    const block = document.createElement("div");
    block.dataset.p = String(i);
    const s = block.style;
    s.position = "relative";
    s.font = `400 ${size}px "fb-arimo"`;
    s.lineHeight = `${leading}px`;
    s.minHeight = `${leading}px`;
    s.textAlign = para.align ?? text.align;
    if (para.left) s.paddingLeft = `${para.left}px`;
    if (para.right) s.paddingRight = `${para.right}px`;
    if (para.first && !para.list) s.textIndent = `${para.first}px`;
    if (para.before) s.paddingTop = `${para.before}px`;
    if (para.after) s.paddingBottom = `${para.after}px`;
    if (para.fill) s.backgroundColor = para.fill;
    if (seen) s.top = `${baselineShift(size, leading)}px`;
    for (const run of runs) {
      if (run.text === "") continue;
      const at = styles.push(run.style) - 1;
      for (const part of splitByFace(run.text, run.style)) {
        const span = document.createElement("span");
        span.dataset.s = String(at);
        dressSpan(span, run.style, part.face);
        span.textContent = toDom(part.text);
        block.append(span);
      }
    }
    const words = block.textContent ?? "";
    if (words === "" || words.endsWith("\n")) {
      // A line with nothing on it still needs somewhere for the caret.
      const tail = document.createElement("br");
      tail.dataset.tail = String(styles.push(runs[runs.length - 1].style) - 1);
      block.append(tail);
    }
    const mark = marks[i];
    if (mark && para.list) {
      const style = markStyle(runs, mark);
      const css = faceCss(splitByFace(mark, style)[0].face);
      const own = `${css.style} ${css.weight} ${style.size}px ${css.family}`;
      block.dataset.mark = mark;
      s.setProperty("--mf", own);
      s.setProperty("--mh", `${leading}px`);
      s.setProperty("--mc", style.color);
      s.setProperty("--ml", `${(para.left ?? 0) - para.list.gap}px`);
      s.setProperty(
        "--mt",
        `${(para.before ?? 0) + baselineIn(`400 ${size}px "fb-arimo"`, leading) - baselineIn(own, leading)}px`,
      );
    }
    root.append(block);
  });
  kept.set(root, { styles, paras });
}

const blocksOf = (root: HTMLElement): HTMLElement[] =>
  [...root.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node.tagName === "DIV");

/** The text as it is in the page now, after typing the editor could not do itself. */
export function readText(root: HTMLElement, fallback: Style): BodyEdit {
  const { styles, paras } = kept.get(root) ?? { styles: [fallback], paras: [] };
  const runs: Run[] = [];
  const out: Para[] = [];
  let last = styles[0] ?? fallback;
  const walk = (node: Node) => {
    if (node instanceof Text) {
      const span = node.parentElement?.closest<HTMLElement>("[data-s]");
      if (span && root.contains(span)) last = styles[Number(span.dataset.s)] ?? last;
      runs.push({ text: fromDom(node.data), style: last });
    } else if (node instanceof HTMLBRElement) {
      if (node.dataset.tail !== undefined) last = styles[Number(node.dataset.tail)] ?? last;
    } else node.childNodes.forEach(walk);
  };
  const blocks = blocksOf(root);
  if (blocks.length === 0) {
    walk(root);
    out.push(paras[0] ?? {});
  }
  blocks.forEach((block, i) => {
    if (i > 0) runs.push({ text: "\n", style: last });
    walk(block);
    out.push(paras[Number(block.dataset.p ?? 0)] ?? {});
  });
  const tidy = tidyRuns(runs);
  return { runs: tidy.length > 0 ? tidy : [{ text: "", style: last }], paras: tidyParas(out) };
}

// ---------------------------------------------------------------- caret

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  while (walker.nextNode()) out.push(walker.currentNode as Text);
  return out;
}

const lengthOf = (node: Node) => textNodes(node).reduce((sum, item) => sum + item.length, 0);

export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const within = (box: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(box);
    try {
      range.setEnd(node, offset);
    } catch {
      return 0;
    }
    return range.toString().length;
  };
  const blocks = blocksOf(root);
  if (blocks.length === 0) return within(root);
  let at = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (node === root && offset <= i) return at;
    if (block === node || block.contains(node)) return at + within(block);
    at += lengthOf(block) + 1;
  }
  return Math.max(0, at - 1);
}

export function rangeOffsets(root: HTMLElement, range: AbstractRange): { from: number; to: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    from: offsetOf(root, range.startContainer, range.startOffset),
    to: offsetOf(root, range.endContainer, range.endOffset),
  };
}

export function getSelection(root: HTMLElement): { from: number; to: number } | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return rangeOffsets(root, selection.getRangeAt(0));
}

function pointAt(root: HTMLElement, offset: number): [Node, number] {
  const blocks = blocksOf(root);
  let left = Math.max(0, offset);
  for (let i = 0; i < blocks.length; i += 1) {
    const length = lengthOf(blocks[i]);
    if (left > length && i < blocks.length - 1) {
      left -= length + 1;
      continue;
    }
    for (const node of textNodes(blocks[i])) {
      if (left <= node.length) return [node, left];
      left -= node.length;
    }
    return [blocks[i], 0];
  }
  return [root, 0];
}

export function setSelection(root: HTMLElement, from: number, to: number) {
  const selection = document.getSelection();
  if (!selection) return;
  const [a, ai] = pointAt(root, from);
  const [b, bi] = pointAt(root, to);
  selection.setBaseAndExtent(a, ai, b, bi);
}

/** Where the caret is on screen. */
export function caretRect(root: HTMLElement, offset: number): DOMRect | null {
  const [node, at] = pointAt(root, offset);
  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];
  return node instanceof HTMLElement ? node.getBoundingClientRect() : null;
}

// ---------------------------------------------------------------- measuring

let bench: HTMLDivElement | null = null;
function benchRoot(): HTMLDivElement {
  if (!bench) {
    bench = document.createElement("div");
    bench.setAttribute("aria-hidden", "true");
    Object.assign(bench.style, {
      position: "fixed",
      left: "0",
      top: "-20000px",
      visibility: "hidden",
      pointerEvents: "none",
      zIndex: "-1",
    });
    document.body.append(bench);
  }
  return bench;
}

function onBench<T>(text: Laid, read: (root: HTMLElement) => T): T {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.left = "0";
  root.style.top = "0";
  benchRoot().append(root);
  renderText(root, text);
  const out = read(root);
  root.remove();
  return out;
}

export function measureBox(text: Laid): { w: number; h: number } {
  return onBench(text, (root) => {
    const box = root.getBoundingClientRect();
    return { w: text.wrap ? text.w : box.width, h: box.height };
  });
}

function fontsReady(runs: readonly Run[]): boolean {
  return runs.every((run) => {
    const { face } = splitByFace(run.text.slice(0, 1) || "a", run.style)[0];
    const css = faceCss(face);
    return document.fonts.check(`${css.style} ${css.weight} 16px ${css.family.split(",")[0]}`);
  });
}

const heights = new WeakMap<readonly Run[], Map<string, number>>();

/** Height of a wrapped text. Remembered, because tables ask for it all the time. */
export function heightOf(body: TextBody, w: number): number {
  let map = heights.get(body.runs);
  if (!map) heights.set(body.runs, (map = new Map()));
  const key = `${w.toFixed(2)}|${body.align}|${body.leading}|${body.paras ? JSON.stringify(body.paras) : ""}`;
  const known = map.get(key);
  if (known !== undefined) return known;
  const { h } = measureBox({ ...body, wrap: true, w });
  if (fontsReady(body.runs)) map.set(key, h);
  return h;
}

const baselines = new Map<string, number>();

/** From the top of a line to its baseline, as this browser sets it. */
function baselineIn(font: string, leading: number): number {
  const key = `${font}|${leading}`;
  const known = baselines.get(key);
  if (known !== undefined) return known;
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "absolute",
    left: "0",
    top: "0",
    font,
    lineHeight: `${leading}px`,
    whiteSpace: "pre",
  });
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0";
  root.append(probe, "x");
  benchRoot().append(root);
  const at = probe.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
  root.remove();
  if (document.fonts.check(font.split(",")[0])) baselines.set(key, at);
  return at;
}

/**
 * Browsers round a line's metrics to whole pixels. This is how far the first
 * baseline is off because of it, so the text can be put back where it belongs.
 */
function baselineShift(size: number, leading: number): number {
  return firstBaseline(size, leading) - baselineIn(`400 ${size}px "fb-arimo"`, leading);
}

/** The text in an element that is seen: with its baselines where the file has them. */
export function showText(root: HTMLElement, text: Laid) {
  renderText(root, text, true);
}

/** Typed letters that need another font than the one around them. */
export const needsSplit = (runs: readonly Run[]) => runs.some((run) => splitByFace(run.text, run.style).length > 1);

// ---------------------------------------------------------------- reading the layout back

/** A piece of one line, drawn by one font. x and baseline are from the box's top-left corner. */
export type Piece = {
  text: string;
  style: Style;
  face: Face;
  x: number;
  width: number;
  baseline: number;
  para: number;
  /** Place of its first letter in the text. */
  at: number;
  /** A bullet or number, not part of the words. */
  mark?: boolean;
};

/**
 * Word by word, where the browser put it. `split` can break a word up further,
 * for characters that need another font.
 */
export function layText(
  text: Laid,
  split?: (part: string, face: Face, style: Style) => { text: string; face: Face }[],
): Piece[] {
  const groups = splitParas(text.runs);
  const marks = text.paras ? listMarks(text) : [];
  return onBench(text, (root) => {
    const { styles } = kept.get(root) ?? { styles: [] };
    const origin = root.getBoundingClientRect();
    const pieces: Piece[] = [];
    const range = document.createRange();
    let start = 0;
    blocksOf(root).forEach((block, index) => {
      const para = paraOf(text, index);
      const top = block.getBoundingClientRect().top - origin.top + (para.before ?? 0);
      const leading = para.leading ?? text.leading;
      const first = top + firstBaseline(paraSize(groups[index]), leading);
      const put = (
        piece: string,
        style: Style,
        face: Face,
        x: number,
        width: number,
        line: number,
        at: number,
        mark?: boolean,
      ) => {
        const baseline = first + line * leading - drawnRise(style);
        pieces.push({ text: piece, style, face, x, width, baseline, para: index, at, mark });
      };

      const mark = marks[index];
      if (mark && para.list) {
        const style = markStyle(groups[index], mark);
        const faces = splitByFace(mark, style);
        const parts = split ? faces.flatMap((part) => split(part.text, part.face, style)) : faces;
        let x = (para.left ?? 0) - para.list.gap;
        for (const part of parts) {
          const width = textWidth(part.text, style, part.face);
          put(part.text, style, part.face, x, width, 0, start, true);
          x += width;
        }
      }

      let before = start;
      for (const node of textNodes(block)) {
        const span = node.parentElement as HTMLElement;
        const style = styles[Number(span.dataset.s)];
        const here = before;
        before += node.length;
        if (!style) continue;
        const { face } = splitByFace(node.data.replace(/\n/g, "") || "a", style)[0];
        const add = (from: number, to: number) => {
          range.setStart(node, from);
          range.setEnd(node, to);
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0.001);
          if (rects.length === 0) return;
          if (rects.length > 1 && to - from > 1 && rects.some((rect) => Math.abs(rect.top - rects[0].top) > 1)) {
            // A long word folded over two lines.
            for (let i = from; i < to; i += 1) add(i, i + 1);
            return;
          }
          const left = Math.min(...rects.map((rect) => rect.left));
          const right = Math.max(...rects.map((rect) => rect.right));
          const middle = (rects[0].top + rects[0].bottom) / 2 - origin.top + drawnRise(style);
          const line = Math.max(0, Math.floor((middle - top) / leading + 0.02));
          put(node.data.slice(from, to), style, face, left - origin.left, right - left, line, here + from);
        };
        const word = /[^\s]+[^\S\n]*|[^\S\n]+/g;
        let match: RegExpExecArray | null;
        while ((match = word.exec(node.data))) {
          const parts = split ? split(match[0], face, style) : null;
          if (!parts || parts.length < 2) {
            const count = pieces.length;
            add(match.index, match.index + match[0].length);
            if (parts?.[0]) for (let i = count; i < pieces.length; i += 1) pieces[i].face = parts[0].face;
            continue;
          }
          let at = match.index;
          for (const part of parts) {
            const count = pieces.length;
            add(at, at + part.text.length);
            for (let i = count; i < pieces.length; i += 1) pieces[i].face = part.face;
            at += part.text.length;
          }
        }
      }
      start = before + 1;
    });
    return pieces;
  });
}

let pen: CanvasRenderingContext2D | null = null;
export function textWidth(text: string, style: Style, face: Face): number {
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return text.length * style.size * 0.5;
  const css = faceCss(face);
  pen.font = `${css.style} ${css.weight} ${drawnSize(style)}px ${css.family}`;
  return pen.measureText(text).width + style.tracking * text.length;
}

/** How far a font's letters may reach above and below the line: what a colour behind them covers. */
export function reachOf(style: Style, face: Face): { up: number; down: number } {
  pen ??= document.createElement("canvas").getContext("2d");
  const size = drawnSize(style);
  if (!pen) return { up: size * 0.905, down: size * 0.212 };
  const css = faceCss(face);
  pen.font = `${css.style} ${css.weight} ${size}px ${css.family}`;
  const box = pen.measureText("Hg");
  return { up: box.fontBoundingBoxAscent ?? size * 0.905, down: box.fontBoundingBoxDescent ?? size * 0.212 };
}

export type Line = { from: number; to: number; top: number; bottom: number; para: number };

/** The lines of a text and the characters on them. */
export function linesOf(text: Laid): Line[] {
  return onBench(text, (root) => {
    const origin = root.getBoundingClientRect();
    const out: Line[] = [];
    const range = document.createRange();
    let start = 0;
    blocksOf(root).forEach((block, index) => {
      const para = paraOf(text, index);
      const leading = para.leading ?? text.leading;
      const rect = block.getBoundingClientRect();
      const top = rect.top - origin.top + (para.before ?? 0);
      const count = Math.max(1, Math.round((rect.height - (para.before ?? 0) - (para.after ?? 0)) / leading));
      const nodes = textNodes(block);
      const length = nodes.reduce((sum, node) => sum + node.length, 0);
      const lineAt = (offset: number): number => {
        let left = offset;
        for (const node of nodes) {
          if (left < node.length) {
            range.setStart(node, left);
            range.setEnd(node, left + 1);
            const rects = range.getClientRects();
            const box = rects[rects.length - 1];
            if (!box) return -1;
            const middle = (box.top + box.bottom) / 2 - origin.top;
            return Math.min(count - 1, Math.max(0, Math.floor((middle - top) / leading + 0.02)));
          }
          left -= node.length;
        }
        return count - 1;
      };
      let from = 0;
      for (let line = 0; line < count; line += 1) {
        // The first character that is on a later line.
        let low = from;
        let high = length;
        if (line < count - 1) {
          while (low < high) {
            const middle = (low + high) >> 1;
            if (lineAt(middle) <= line) low = middle + 1;
            else high = middle;
          }
        } else low = length;
        const at = top + line * leading;
        out.push({ from: start + from, to: start + low, top: at, bottom: at + leading, para: index });
        from = low;
      }
      start += length + 1;
    });
    return out;
  });
}

// ---------------------------------------------------------------- opening a block of the PDF

export type SourceLines = { runs: Run[]; x: number; width: number }[];

/**
 * Turns the lines of a paragraph into text that flows, if flowing gives back
 * exactly the same lines. Otherwise every line keeps its own end. `room` is the
 * width up to the edge of the column.
 */
export async function flowLines(
  lines: SourceLines,
  box: { w: number; align: TextBody["align"]; leading: number; size: number; room?: number },
): Promise<Pick<Laid, "runs" | "paras" | "wrap" | "w" | "max">> {
  const all = lines.flatMap((line) => line.runs);
  await loadFaces(
    all.map((run) => run.style),
    all.map((run) => run.text).join(""),
  );

  // Letter spacing that gives each line the width it has in the PDF.
  const limit = box.size * 0.22;
  const gaps = lines.map((line, index) => {
    if (box.align === "justify" && index < lines.length - 1) return null;
    const width = measureBox({ runs: line.runs, align: "left", leading: box.leading, wrap: false, w: 0 }).w;
    const count = line.runs.reduce((sum, run) => sum + run.text.length, 0);
    if (width <= 0 || count < 2) return null;
    const each = (line.width - width) / count;
    return Math.abs(each) > limit ? null : { each, count };
  });
  const known = gaps.filter((gap): gap is { each: number; count: number } => gap !== null);
  const total = known.reduce((sum, gap) => sum + gap.count, 0);
  const mean = total > 0 ? known.reduce((sum, gap) => sum + gap.each * gap.count, 0) / total : 0;
  const uneven = known.some((gap) => Math.abs(gap.each - mean) > box.size * 0.02);
  // Justified lines that were squeezed to fit: the same squeeze for all of them.
  let squeeze = 0;
  if (box.align === "justify") {
    lines.slice(0, -1).forEach((line) => {
      const width = measureBox({ runs: line.runs, align: "left", leading: box.leading, wrap: false, w: 0 }).w;
      const count = line.runs.reduce((sum, run) => sum + run.text.length, 0);
      if (count > 1) squeeze = Math.min(squeeze, (line.width - width - 0.3) / count);
    });
    if (squeeze < -limit) squeeze = 0;
  }
  const tuned = lines.map((line, index) => {
    const each = squeeze < 0 ? squeeze : uneven ? (gaps[index]?.each ?? 0) : mean;
    const tracking = Math.abs(each) < 0.004 ? 0 : Math.round(each * 1000) / 1000;
    return line.runs.map((run): Run => (tracking ? { ...run, style: { ...run.style, tracking } } : run));
  });

  const room = box.room !== undefined && box.room > box.w + 0.5 ? box.room : undefined;
  if (lines.length === 1) return { runs: tidyRuns(tuned[0]), wrap: false, w: lines[0].width, max: room };

  // First line pushed in, or the others (a list).
  let first = 0;
  let left = 0;
  if (box.align === "left" || box.align === "justify") {
    const rest = Math.min(...lines.slice(1).map((line) => line.x));
    const shift = lines[0].x - rest;
    if (Math.abs(shift) > box.size * 0.3) {
      first = shift;
      left = shift < 0 ? rest : 0;
    }
  }
  const paras = tidyParas([{ left: left || undefined, first: first || undefined }]);

  const flowing: Run[] = [];
  tuned.forEach((runs, index) => {
    flowing.push(...runs);
    if (index === tuned.length - 1) return;
    const last = runs[runs.length - 1];
    if (!/[-‐–—/]$/.test(last.text) && !/\s$/.test(last.text)) flowing.push({ text: " ", style: last.style });
  });
  const runs = tidyRuns(flowing);
  const starts: string[] = tuned.map((line) =>
    line
      .map((run) => run.text)
      .join("")
      .trim(),
  );
  // The column's own width first: words added later then wrap where the page's other lines do.
  const widths = [box.w + 0.6, box.w + box.size * 0.12, box.w + box.size * 0.3, box.w + box.size * 0.6];
  if (room !== undefined && box.align === "left") widths.unshift(room, (room + box.w) / 2);
  const base = firstBaseline(paraSize(runs), box.leading);
  for (const width of widths) {
    const pieces = layText({ runs, paras, align: box.align, leading: box.leading, wrap: true, w: width });
    const rows: string[] = [];
    for (const piece of pieces) {
      const at = Math.round((piece.baseline + drawnRise(piece.style) - base) / box.leading);
      rows[at] = (rows[at] ?? "") + piece.text;
    }
    if (rows.length === starts.length && rows.every((row, i) => (row ?? "").trim() === starts[i]))
      return { runs, paras, wrap: true, w: width };
  }

  const held: Run[] = [];
  tuned.forEach((line, index) => {
    held.push(...line);
    if (index < tuned.length - 1) held.push({ text: "\n", style: line[line.length - 1].style });
  });
  const own = lines.map((line): Para => {
    if (box.align !== "left" && box.align !== "justify") return {};
    return line.x > box.size * 0.3 ? { left: line.x } : {};
  });
  return { runs: tidyRuns(held), paras: tidyParas(own), wrap: false, w: box.w, max: room };
}

export const stylesOf = (runs: readonly Run[]): Style[] => {
  const out: Style[] = [];
  for (const run of runs) if (!out.some((style) => sameStyle(style, run.style))) out.push(run.style);
  return out;
};

/** The styles a text needs fonts for, its bullets included. */
export function bodyStyles(body: Pick<TextBody, "runs" | "paras">): Style[] {
  const styles = stylesOf(body.runs);
  const symbols =
    body.paras && allParas(body).some((para) => para.list && (para.list.mark.codePointAt(0) ?? 0) > 0x2020);
  return symbols ? [...styles, { ...styles[0], font: "lib:symbols", bold: false, italic: false }] : styles;
}

export const bodyText = (body: Pick<TextBody, "runs" | "paras">) =>
  body.runs.map((run) => run.text).join("") + (body.paras ? listMarks(body).join("") : "");

/** Every font a text needs, loaded. */
export const loadBody = (body: Pick<TextBody, "runs" | "paras">) => loadFaces(bodyStyles(body), bodyText(body));

/** Changes when other fonts are needed. */
export const bodyFonts = (body: Pick<TextBody, "runs" | "paras">): string =>
  bodyStyles(body)
    .map((style) => `${style.font}${style.bold ? "b" : ""}${style.italic ? "i" : ""}`)
    .join();
