import type { Page } from "./model";
import { plainText } from "./model";
import { apply, placement, type Box, type Point } from "./engine/matrix";
import type { Block } from "./engine/paragraphs";
import { linesOf } from "./engine/text-dom";
import type { PageText } from "./engine/extract";
import { rulesOf } from "./engine/vectors";
import type { EditorStore } from "./store";

type Line = { x0: number; x1: number; y: number; size: number; stops: number[] };

/** The lines of text between two points, as boxes to mark. */
export function markRects(blocks: readonly Block[], page: Page, store: EditorStore, a: Point, b: Point): Box[] {
  const lines: Line[] = [];
  for (const block of blocks) {
    if (block.angle !== 0 || page.cuts[block.key]) continue;
    for (const row of block.rows)
      lines.push({
        ...row,
        stops: row.cells.flatMap(([, left], i) => (i === row.cells.length - 1 ? [left, row.cells[i][2]] : [left])),
      });
  }
  // Text typed or changed here can be marked too.
  for (const id of page.objects) {
    const object = store.doc.objects[id];
    if (object?.type !== "text" || object.angle !== 0 || plainText(object.runs) === "") continue;
    const size = object.runs[0]?.style.size ?? 12;
    for (const line of linesOf(object))
      lines.push({
        x0: object.x,
        x1: object.x + object.w,
        y: object.y + (line.top + line.bottom) / 2 + size * 0.32,
        size,
        stops: [],
      });
  }
  const middle = (line: Line) => line.y - line.size * 0.32;
  const nearest = (p: Point) => {
    let best: Line | null = null;
    let score = Infinity;
    for (const line of lines) {
      const dx = Math.max(0, line.x0 - p.x, p.x - line.x1);
      const dy = Math.max(0, Math.abs(p.y - middle(line)) - line.size * 0.6);
      const d = dx * 0.6 + dy * 2;
      if (d < score) {
        score = d;
        best = line;
      }
    }
    return score < 60 ? best : null;
  };
  let from = nearest(a);
  let to = nearest(b);
  if (!from || !to) {
    const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    return box.w > 3 && box.h > 3 ? [box] : [];
  }
  let start = a;
  let end = b;
  const same = from === to || Math.abs(from.y - to.y) < 1;
  if ((!same && from.y > to.y) || (same && a.x > b.x)) {
    [from, to] = [to, from];
    [start, end] = [end, start];
  }
  const snapTo = (line: Line, x: number) => {
    if (line.stops.length === 0) return Math.min(Math.max(x, line.x0), line.x1);
    return line.stops.reduce((best, stop) => (Math.abs(stop - x) < Math.abs(best - x) ? stop : best), line.stops[0]);
  };
  const rect = (line: Line, x0: number, x1: number): Box => ({
    x: x0,
    y: line.y - line.size * 0.86,
    w: x1 - x0,
    h: line.size * 1.12,
  });
  if (same) {
    const x0 = snapTo(from, start.x);
    const x1 = snapTo(to, end.x);
    return x1 - x0 > 0.5 ? [rect(from, x0, x1)] : [];
  }
  const span = { x0: Math.min(from.x0, to.x0), x1: Math.max(from.x1, to.x1) };
  const out: Box[] = [];
  for (const line of lines) {
    if (line.y < from.y - 1 || line.y > to.y + 1) continue;
    if (line !== from && line !== to && Math.min(line.x1, span.x1) - Math.max(line.x0, span.x0) < line.size) continue;
    const x0 = line === from ? snapTo(line, start.x) : line.x0;
    const x1 = line === to ? snapTo(line, end.x) : line.x1;
    if (line !== from && line !== to && (Math.abs(line.y - from.y) < 1 || Math.abs(line.y - to.y) < 1)) continue;
    if (x1 - x0 > 0.5) out.push(rect(line, x0, x1));
  }
  return out;
}

/** The word of the page a point is on, as a box. */
export function wordAt(block: Block, p: Point): Box | null {
  if (block.angle !== 0) return null;
  let start = 0;
  for (let i = 0; i < block.rows.length; i += 1) {
    const row = block.rows[i];
    const text = block.lines[i].runs.map((run) => run.text).join("");
    start += text.length + 1;
    if (p.y < row.y - row.size || p.y > row.y + row.size * 0.4) continue;
    const at = row.cells.findIndex(([, left, right]) => p.x >= left - 0.5 && p.x <= right + 0.5);
    if (at < 0) continue;
    const word = (k: number) => /[^\s]/.test(text[row.cells[k][0]] ?? " ");
    if (!word(at)) return null;
    let from = at;
    let to = at;
    while (from > 0 && word(from - 1)) from -= 1;
    while (to < row.cells.length - 1 && word(to + 1)) to += 1;
    return {
      x: row.cells[from][1],
      y: row.y - row.size * 0.86,
      w: row.cells[to][2] - row.cells[from][1],
      h: row.size * 1.12,
    };
  }
  return null;
}

/** The ruled cell around a point of the page: a box closed on all four sides by lines. Null on open paper. */
export function ruledCell(text: PageText, page: Page, p: Point): Box | null {
  const paths = text.paths.filter((path) => !page.pathCuts.includes(path.op));
  const rules = rulesOf(paths);
  const beside = (list: { at: number; from: number; to: number }[], at: number, along: number) => {
    let low = -Infinity;
    let high = Infinity;
    for (const rule of list) {
      if (along < rule.from - 1 || along > rule.to + 1) continue;
      if (rule.at <= at) low = Math.max(low, rule.at);
      else high = Math.min(high, rule.at);
    }
    return [low, high];
  };
  const [x0, x1] = beside(rules.x, p.x, p.y);
  const [y0, y1] = beside(rules.y, p.y, p.x);
  if (![x0, x1, y0, y1].every(Number.isFinite)) return null;
  if (x1 - x0 < 18 || y1 - y0 < 9 || x1 - x0 > page.w * 0.92) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Where a text typed into a ruled cell goes, so that it stands like the words beside it. */
export function cellSpot(cell: Box, size: number, leading: number): { box: Box; y: number } {
  const pad = Math.min(5, cell.w * 0.08);
  const box = { x: cell.x + pad, y: cell.y + 1, w: cell.w - pad * 2, h: cell.h - 2 };
  // One line stands in the middle; a tall cell starts at the top.
  const tall = cell.h > leading * 2.6;
  void size;
  return { box, y: tall ? box.y + 3 + leading / 2 : cell.y + cell.h / 2 };
}

export const boxOfSpot = (spot: { x: number; y: number; w: number; h: number; angle: number }) => {
  const at = apply(placement(spot.x, spot.y, spot.angle), 0, 0);
  return { ...spot, x: at.x, y: at.y };
};
