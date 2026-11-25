import type { Run, Style, TextObject } from "../model";
import { DEFAULT_STYLE, sameStyle, tidyRuns } from "../model";
import { firstBaseline } from "./extract";
import { faceCss, loadFaces, splitByFace, type Face } from "./fonts";

/**
 * One way to lay text out, on screen and in the saved file: the browser sets the
 * lines, and the file puts every word exactly where the browser did.
 */

type Laid = Pick<TextObject, "runs" | "align" | "leading" | "wrap" | "w" | "indent" | "hang">;

const styles = new WeakMap<Element, Style[]>();

export function strutSize(runs: readonly Run[]): number {
  return Math.max(1, ...runs.map((run) => run.style.size));
}

/** Size, line height and wrapping of the box itself. */
export function boxCss(text: Laid): Partial<CSSStyleDeclaration> {
  return {
    font: `400 ${strutSize(text.runs)}px "fb-arimo"`,
    lineHeight: `${text.leading}px`,
    whiteSpace: text.wrap ? "pre-wrap" : "pre",
    overflowWrap: text.wrap ? "anywhere" : "normal",
    textAlign: text.align,
    width: text.wrap ? `${Math.max(4, text.w)}px` : "max-content",
    minWidth: "2px",
    boxSizing: "border-box",
    paddingLeft: text.hang ? `${text.hang}px` : "0",
    textIndent: text.indent ? `${text.indent}px` : "0",
    letterSpacing: "0",
    textRendering: "geometricPrecision",
    fontKerning: "normal",
    fontVariantLigatures: "none",
    tabSize: "4",
  };
}

function dressSpan(span: HTMLElement, style: Style, face: Face) {
  const css = faceCss(face);
  span.style.fontFamily = css.family;
  span.style.fontWeight = String(css.weight);
  span.style.fontStyle = css.style;
  span.style.fontSize = `${style.size}px`;
  span.style.lineHeight = "0";
  span.style.color = style.color;
  span.style.letterSpacing = style.tracking ? `${style.tracking}px` : "0";
  if (style.rise) {
    span.style.position = "relative";
    span.style.top = `${-style.rise}px`;
  }
  const lines = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (lines) {
    span.style.textDecorationLine = lines;
    span.style.textDecorationThickness = `${Math.max(0.5, style.size * 0.06)}px`;
    span.style.textUnderlineOffset = `${style.size * 0.12}px`;
    span.style.textDecorationSkipInk = "none";
  }
}

/** Fills `root` with the text. Each run is a span that remembers its style. */
export function renderText(root: HTMLElement, text: Laid) {
  Object.assign(root.style, boxCss(text));
  root.replaceChildren();
  const table: Style[] = [];
  for (const run of text.runs) {
    const at = table.push(run.style) - 1;
    for (const part of splitByFace(run.text, run.style)) {
      const span = document.createElement("span");
      span.dataset.s = String(at);
      dressSpan(span, run.style, part.face);
      span.textContent = part.text;
      root.append(span);
    }
  }
  if (root.textContent === "" || root.textContent?.endsWith("\n")) {
    // A line with nothing on it still needs somewhere for the caret.
    const tail = document.createElement("br");
    tail.dataset.tail = "1";
    root.append(tail);
  }
  styles.set(root, table);
}

/** The runs as they are in the page now, after typing. */
export function readText(root: HTMLElement, fallback: Style): Run[] {
  const table = styles.get(root) ?? [fallback];
  const runs: Run[] = [];
  let last = table[0] ?? fallback;
  const walk = (node: Node) => {
    if (node instanceof Text) {
      const span = node.parentElement?.closest<HTMLElement>("[data-s]");
      if (span && root.contains(span)) last = table[Number(span.dataset.s)] ?? last;
      runs.push({ text: node.data.replace(/ /g, " "), style: last });
      return;
    }
    if (node instanceof HTMLBRElement) {
      if (!node.dataset.tail && node.nextSibling) runs.push({ text: "\n", style: last });
      return;
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  const out = tidyRuns(runs);
  return out.length > 0 ? out : [{ text: "", style: last }];
}

// ---------------------------------------------------------------- caret

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  while (walker.nextNode()) out.push(walker.currentNode as Text);
  return out;
}

export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

export function getSelection(root: HTMLElement): { from: number; to: number } | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    from: offsetOf(root, range.startContainer, range.startOffset),
    to: offsetOf(root, range.endContainer, range.endOffset),
  };
}

function pointAt(root: HTMLElement, offset: number): [Node, number] {
  let left = offset;
  const nodes = textNodes(root);
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (left < node.length || (left === node.length && (i === nodes.length - 1 || !node.data.endsWith("\n"))))
      return [node, left];
    left -= node.length;
  }
  return [root, root.childNodes.length > 0 && left >= 0 ? Math.max(0, root.childNodes.length - 1) : 0];
}

export function setSelection(root: HTMLElement, from: number, to: number) {
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const [a, ai] = pointAt(root, from);
  const [b, bi] = pointAt(root, to);
  range.setStart(a, ai);
  range.setEnd(b, bi);
  selection.removeAllRanges();
  selection.addRange(range);
}

// ---------------------------------------------------------------- measuring

let bench: HTMLDivElement | null = null;
function onBench<T>(text: Laid, read: (root: HTMLElement) => T): T {
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
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.left = "0";
  root.style.top = "0";
  bench.append(root);
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

const shifts = new Map<string, number>();

/**
 * Browsers round a line's metrics to whole pixels. This is how far the first
 * baseline is off because of it, so the text can be put back where it belongs.
 */
export function baselineShift(text: Laid): number {
  const size = strutSize(text.runs);
  const key = `${size}|${text.leading}`;
  const known = shifts.get(key);
  if (known !== undefined) return known;
  const runs = [{ text: "x", style: { ...DEFAULT_STYLE, size } }];
  const shift = onBench({ runs, align: "left", leading: text.leading, wrap: false, w: 0 }, (root) => {
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0";
    root.prepend(probe);
    return (
      firstBaseline(size, text.leading) - (probe.getBoundingClientRect().bottom - root.getBoundingClientRect().top)
    );
  });
  if (document.fonts.check('400 16px "fb-arimo"')) shifts.set(key, shift);
  return shift;
}

/** The text in an element that is seen: rendered, with its baseline where the file has it. */
export function showText(root: HTMLElement, text: Laid) {
  renderText(root, text);
  root.style.position = "relative";
  root.style.top = `${baselineShift(text)}px`;
}

/** Typed letters that need another font than the one around them. */
export const needsSplit = (runs: readonly Run[]) => runs.some((run) => splitByFace(run.text, run.style).length > 1);

/** A piece of one line, drawn by one font. x and baseline are from the box's top-left corner. */
export type Piece = { text: string; style: Style; face: Face; x: number; width: number; baseline: number };

/**
 * Word by word, where the browser put it. `split` can break a word up further,
 * for characters that need another font.
 */
export function layText(
  text: Laid,
  split?: (part: string, face: Face, style: Style) => { text: string; face: Face }[],
): Piece[] {
  return onBench(text, (root) => {
    const table = styles.get(root) ?? [];
    const origin = root.getBoundingClientRect();
    const first = firstBaseline(strutSize(text.runs), text.leading);
    const pieces: Piece[] = [];
    const range = document.createRange();
    for (const node of textNodes(root)) {
      const span = node.parentElement as HTMLElement;
      const style = table[Number(span.dataset.s)];
      if (!style) continue;
      const face = splitByFace(node.data.replace(/\n/g, "") || "a", style)[0].face;
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
        const middle = (rects[0].top + rects[0].bottom) / 2 - origin.top + style.rise;
        const line = Math.max(0, Math.floor(middle / text.leading + 0.02));
        pieces.push({
          text: node.data.slice(from, to),
          style,
          face,
          x: left - origin.left,
          width: right - left,
          baseline: first + line * text.leading - style.rise,
        });
      };
      const word = /[^\s]+[^\S\n]*|[^\S\n]+/g;
      let match: RegExpExecArray | null;
      while ((match = word.exec(node.data))) {
        const parts = split ? split(match[0], face, style) : null;
        if (!parts || parts.length < 2) {
          const before = pieces.length;
          add(match.index, match.index + match[0].length);
          if (parts?.[0]) for (let i = before; i < pieces.length; i += 1) pieces[i].face = parts[0].face;
          continue;
        }
        let at = match.index;
        for (const part of parts) {
          const before = pieces.length;
          add(at, at + part.text.length);
          for (let i = before; i < pieces.length; i += 1) pieces[i].face = part.face;
          at += part.text.length;
        }
      }
    }
    return pieces;
  });
}

// ---------------------------------------------------------------- opening a block of the PDF

export type SourceLines = { runs: Run[]; x: number; width: number }[];

/**
 * Turns the lines of a paragraph into text that flows, if flowing gives back
 * exactly the same lines. Otherwise every line keeps its own end.
 */
export async function flowLines(
  lines: SourceLines,
  box: { w: number; align: TextObject["align"]; leading: number; size: number },
): Promise<Pick<TextObject, "runs" | "wrap" | "w" | "indent" | "hang">> {
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
  const letters = known.reduce((sum, gap) => sum + gap.count, 0);
  const mean = letters > 0 ? known.reduce((sum, gap) => sum + gap.each * gap.count, 0) / letters : 0;
  const uneven = known.some((gap) => Math.abs(gap.each - mean) > box.size * 0.02);
  const tuned = lines.map((line, index) => {
    const each = uneven ? (gaps[index]?.each ?? 0) : mean;
    const tracking = Math.abs(each) < 0.004 ? 0 : Math.round(each * 1000) / 1000;
    return line.runs.map((run): Run => (tracking ? { ...run, style: { ...run.style, tracking } } : run));
  });

  if (lines.length === 1) return { runs: tidyRuns(tuned[0]), wrap: false, w: lines[0].width };

  // First line pushed in, or the others (a list).
  let indent = 0;
  let hang = 0;
  if (box.align === "left" || box.align === "justify") {
    const rest = Math.min(...lines.slice(1).map((line) => line.x));
    const shift = lines[0].x - rest;
    if (Math.abs(shift) > box.size * 0.3) {
      indent = shift;
      hang = shift < 0 ? rest : 0;
    }
  }

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
  for (const width of [box.w + 0.6, box.w + box.size * 0.12, box.w + box.size * 0.3, box.w + box.size * 0.6]) {
    const pieces = layText({ runs, align: box.align, leading: box.leading, wrap: true, w: width, indent, hang });
    const rows: string[] = [];
    const first = firstBaseline(strutSize(runs), box.leading);
    for (const piece of pieces) {
      const row = Math.round((piece.baseline + piece.style.rise - first) / box.leading);
      rows[row] = (rows[row] ?? "") + piece.text;
    }
    if (rows.length === starts.length && rows.every((row, i) => (row ?? "").trim() === starts[i]))
      return { runs, wrap: true, w: width, indent, hang };
  }

  const held: Run[] = [];
  tuned.forEach((line, index) => {
    held.push(...line);
    if (index < tuned.length - 1) held.push({ text: "\n", style: line[line.length - 1].style });
  });
  return { runs: tidyRuns(held), wrap: false, w: box.w, indent: hang ? 0 : indent, hang: 0 };
}

export const stylesOf = (runs: readonly Run[]): Style[] => {
  const out: Style[] = [];
  for (const run of runs) if (!out.some((style) => sameStyle(style, run.style))) out.push(run.style);
  return out;
};
