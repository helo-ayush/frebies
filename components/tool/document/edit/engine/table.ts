import type { Align, Cell, Edge, Side, Style, TableObject, TextBody } from "../model";
import { plainText } from "../model";
import type { Box } from "./matrix";
import { heightOf } from "./text-dom";

/** Tables: how they are measured, and everything that can be done to them. */

export type CellBox = { r: number; c: number; cell: Cell; box: Box; /** Where the words go. */ inner: Box };
export type TableLay = { xs: number[]; ys: number[]; w: number; h: number; cells: CellBox[] };
export type Area = { r0: number; c0: number; r1: number; c1: number };

const span = (cell: Cell) => ({ rows: Math.max(1, cell.rows ?? 1), cols: Math.max(1, cell.cols ?? 1) });

/** Sizes of everything. Rows grow with their text. */
export function layTable(table: TableObject): TableLay {
  const xs = [0];
  for (const w of table.cols) xs.push(xs[xs.length - 1] + w);
  const { pad } = table;
  const rows = table.cells.length;
  const heights = table.rows.map((h) => h);
  const need = new Map<string, number>();
  const innerWidth = (c: number, cols: number) =>
    Math.max(4, xs[Math.min(xs.length - 1, c + cols)] - xs[c] - pad.x * 2);
  const tall: { r: number; rows: number; h: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    table.cells[r].forEach((cell, c) => {
      if (cell.covered) return;
      const { rows: over, cols } = span(cell);
      const h = heightOf(cell, innerWidth(c, cols));
      need.set(`${r},${c}`, h);
      if (over === 1) heights[r] = Math.max(heights[r], h + pad.y * 2);
      else tall.push({ r, rows: over, h: h + pad.y * 2 });
    });
  }
  for (const { r, rows: over, h } of tall) {
    const last = Math.min(rows - 1, r + over - 1);
    let have = 0;
    for (let i = r; i <= last; i += 1) have += heights[i];
    if (have < h) heights[last] += h - have;
  }
  const ys = [0];
  for (const h of heights) ys.push(ys[ys.length - 1] + h);
  const cells: CellBox[] = [];
  for (let r = 0; r < rows; r += 1) {
    table.cells[r].forEach((cell, c) => {
      if (cell.covered) return;
      const { rows: over, cols } = span(cell);
      const box = {
        x: xs[c],
        y: ys[r],
        w: xs[Math.min(xs.length - 1, c + cols)] - xs[c],
        h: ys[Math.min(ys.length - 1, r + over)] - ys[r],
      };
      const text = need.get(`${r},${c}`) ?? 0;
      const free = Math.max(0, box.h - pad.y * 2 - text);
      const down = cell.valign === "middle" ? free / 2 : cell.valign === "bottom" ? free : 0;
      cells.push({
        r,
        c,
        cell,
        box,
        inner: { x: box.x + pad.x, y: box.y + pad.y + down, w: Math.max(4, box.w - pad.x * 2), h: text },
      });
    });
  }
  return { xs, ys, w: xs[xs.length - 1], h: ys[ys.length - 1], cells };
}

export type TableLine = { x0: number; y0: number; x1: number; y1: number; edge: Edge };

const same = (a: Edge, b: Edge) => a.color === b.color && a.width === b.width && a.dash === b.dash;

/** The lines between and around the cells, joined into as few as possible. */
export function tableLines(table: TableObject, lay: TableLay): TableLine[] {
  const rows = table.cells.length;
  const cols = table.cols.length;
  // Which cell lies on a square of the grid.
  const at: (CellBox | null)[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  for (const item of lay.cells) {
    const { rows: over, cols: wide } = span(item.cell);
    for (let r = item.r; r < Math.min(rows, item.r + over); r += 1)
      for (let c = item.c; c < Math.min(cols, item.c + wide); c += 1) at[r][c] = item;
  }
  const pick = (a: CellBox | null, sideA: Side, b: CellBox | null, sideB: Side): Edge | null => {
    if (a && a === b) return null;
    const own = a?.cell.edges?.[sideA];
    const other = b?.cell.edges?.[sideB];
    if (own === undefined && other === undefined) return table.edge;
    if (own && other) return own.width >= other.width ? own : other;
    if (own !== undefined && other !== undefined) return own ?? other;
    return (own !== undefined ? own : other) ?? null;
  };
  const out: TableLine[] = [];
  const push = (next: TableLine) => {
    const last = out[out.length - 1];
    if (last && same(last.edge, next.edge)) {
      if (last.y0 === next.y0 && last.y1 === next.y1 && last.y0 === last.y1 && Math.abs(last.x1 - next.x0) < 0.01) {
        last.x1 = next.x1;
        return;
      }
      if (last.x0 === next.x0 && last.x1 === next.x1 && last.x0 === last.x1 && Math.abs(last.y1 - next.y0) < 0.01) {
        last.y1 = next.y1;
        return;
      }
    }
    out.push(next);
  };
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const edge = pick(at[r - 1]?.[c] ?? null, "bottom", at[r]?.[c] ?? null, "top");
      if (edge) push({ x0: lay.xs[c], y0: lay.ys[r], x1: lay.xs[c + 1], y1: lay.ys[r], edge });
    }
  }
  for (let c = 0; c <= cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const edge = pick(at[r]?.[c - 1] ?? null, "right", at[r]?.[c] ?? null, "left");
      if (edge) push({ x0: lay.xs[c], y0: lay.ys[r], x1: lay.xs[c], y1: lay.ys[r + 1], edge });
    }
  }
  return out;
}

// ---------------------------------------------------------------- making

export const GRID_EDGE: Edge = { color: "#1d1c1f", width: 0.75, dash: "solid" };

export function emptyCell(style: Style, align: Align = "left"): Cell {
  return { runs: [{ text: "", style }], align, leading: Math.round(style.size * 1.22 * 10) / 10 };
}

/** A cell that looks like another, without its words. */
export function cellLike(cell: Cell): Cell {
  const style = cell.runs[cell.runs.length - 1].style;
  return {
    ...cell,
    runs: [{ text: "", style }],
    paras: cell.paras?.[0] ? [{ ...cell.paras[0], list: undefined }] : undefined,
    rows: undefined,
    cols: undefined,
    covered: undefined,
  };
}

export function newTable(rows: number, cols: number, w: number, style: Style): Omit<TableObject, "id" | "x" | "y"> {
  const each = w / cols;
  const h = Math.round((style.size * 1.22 + 8) * 10) / 10;
  return {
    type: "table",
    w,
    h: h * rows,
    angle: 0,
    opacity: 1,
    cols: Array.from({ length: cols }, () => each),
    rows: Array.from({ length: rows }, () => h),
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => emptyCell(style))),
    edge: GRID_EDGE,
    pad: { x: 5, y: 4 },
  };
}

// ---------------------------------------------------------------- finding one's way

/** The cell that shows on a square of the grid. */
export function ownerOf(table: TableObject, r: number, c: number): { r: number; c: number } {
  if (!table.cells[r]?.[c]?.covered) return { r, c };
  for (let i = r; i >= 0; i -= 1) {
    for (let k = c; k >= 0; k -= 1) {
      const cell = table.cells[i][k];
      if (cell.covered) continue;
      const { rows, cols } = span(cell);
      if (i + rows > r && k + cols > c) return { r: i, c: k };
    }
  }
  return { r, c };
}

/** Grows an area until no cell sticks out of it. */
export function wholeArea(table: TableObject, area: Area): Area {
  let { r0, c0, r1, c1 } = area;
  if (r0 > r1) [r0, r1] = [r1, r0];
  if (c0 > c1) [c0, c1] = [c1, c0];
  for (;;) {
    let grown = false;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const own = ownerOf(table, r, c);
        const { rows, cols } = span(table.cells[own.r][own.c]);
        const next = {
          r0: Math.min(r0, own.r),
          c0: Math.min(c0, own.c),
          r1: Math.max(r1, own.r + rows - 1),
          c1: Math.max(c1, own.c + cols - 1),
        };
        if (next.r0 !== r0 || next.c0 !== c0 || next.r1 !== r1 || next.c1 !== c1) {
          ({ r0, c0, r1, c1 } = next);
          grown = true;
        }
      }
    }
    if (!grown) return { r0, c0, r1, c1 };
  }
}

export const inArea = (area: Area | null, r: number, c: number) =>
  area !== null && r >= area.r0 && r <= area.r1 && c >= area.c0 && c <= area.c1;

/** The next cell that shows, in reading order. Null past the last one. */
export function nextCell(table: TableObject, r: number, c: number, by: 1 | -1): { r: number; c: number } | null {
  const cols = table.cols.length;
  let at = r * cols + c + by;
  while (at >= 0 && at < table.cells.length * cols) {
    const cell = { r: Math.floor(at / cols), c: at % cols };
    if (!table.cells[cell.r][cell.c].covered) return cell;
    at += by;
  }
  return null;
}

// ---------------------------------------------------------------- changing

type Patch = Pick<TableObject, "cols" | "rows" | "cells" | "w" | "h">;

function finish(table: TableObject, cols: number[], rows: number[], cells: Cell[][]): Patch {
  const next = { ...table, cols, rows, cells };
  const lay = layTable(next);
  return { cols, rows, cells, w: lay.w, h: lay.h };
}

/** Sizes after the text or the widths changed. */
export const resized = (table: TableObject): Pick<TableObject, "w" | "h"> => {
  const lay = layTable(table);
  return { w: lay.w, h: lay.h };
};

export function setCells(table: TableObject, area: Area, patch: (cell: Cell, r: number, c: number) => Cell): Patch {
  const cells = table.cells.map((row, r) =>
    row.map((cell, c) => (inArea(area, r, c) && !cell.covered ? patch(cell, r, c) : cell)),
  );
  return finish(table, table.cols, table.rows, cells);
}

export function setCell(table: TableObject, r: number, c: number, patch: Partial<Cell>): Patch {
  return setCells(table, { r0: r, c0: c, r1: r, c1: c }, (cell) => ({ ...cell, ...patch }));
}

/** New rows before row `at`, looking like the row next to them. */
export function insertRows(table: TableObject, at: number, count = 1): Patch {
  const cols = table.cols.length;
  const model = table.cells[Math.max(0, at - 1)] ?? table.cells[0];
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })));
  const fresh: Cell[][] = Array.from({ length: count }, () =>
    Array.from({ length: cols }, (_, c) => cellLike(model[c])),
  );
  // A cell that spans across the place grows, and lies over the new rows too.
  if (at > 0 && at < cells.length) {
    for (let c = 0; c < cols; c += 1) {
      if (!cells[at][c].covered) continue;
      const own = ownerOf(table, at, c);
      if (own.r >= at) continue;
      for (const row of fresh) row[c].covered = true;
      if (own.c === c) cells[own.r][own.c].rows = span(cells[own.r][own.c]).rows + count;
    }
  }
  cells.splice(at, 0, ...fresh);
  const rows = [...table.rows];
  rows.splice(at, 0, ...Array.from({ length: count }, () => table.rows[Math.max(0, at - 1)] ?? 20));
  return finish(table, table.cols, rows, cells);
}

export function insertCols(table: TableObject, at: number, count = 1, keepWidth = true): Patch {
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })));
  const cols = table.cols.length;
  cells.forEach((row, r) => {
    const model = row[Math.max(0, at - 1)] ?? row[0];
    const fresh = Array.from({ length: count }, () => cellLike(model));
    if (at > 0 && at < cols && table.cells[r][at].covered) {
      const own = ownerOf(table, r, at);
      if (own.c < at) {
        for (const cell of fresh) cell.covered = true;
        if (own.r === r) cells[own.r][own.c].cols = span(cells[own.r][own.c]).cols + count;
      }
    }
    row.splice(at, 0, ...fresh);
  });
  const width = table.cols[Math.max(0, at - 1)] ?? 60;
  let widths = [...table.cols];
  widths.splice(at, 0, ...Array.from({ length: count }, () => width));
  if (keepWidth) {
    const total = table.cols.reduce((sum, w) => sum + w, 0);
    const now = widths.reduce((sum, w) => sum + w, 0);
    widths = widths.map((w) => (w * total) / now);
  }
  return finish(table, widths, table.rows, cells);
}

/** Null when nothing would be left. */
export function removeRows(table: TableObject, from: number, to: number): Patch | null {
  const count = to - from + 1;
  if (count >= table.cells.length) return null;
  const cells = unspan(table, { r0: from, c0: 0, r1: to, c1: table.cols.length - 1 }, "rows");
  cells.splice(from, count);
  const rows = [...table.rows];
  rows.splice(from, count);
  return finish(table, table.cols, rows, cells);
}

export function removeCols(table: TableObject, from: number, to: number): Patch | null {
  const count = to - from + 1;
  if (count >= table.cols.length) return null;
  const cells = unspan(table, { r0: 0, c0: from, r1: table.cells.length - 1, c1: to }, "cols");
  for (const row of cells) row.splice(from, count);
  const cols = [...table.cols];
  cols.splice(from, count);
  return finish(table, cols, table.rows, cells);
}

/** Cells that span into rows or columns that go away shrink, or hand their words on. */
function unspan(table: TableObject, gone: Area, way: "rows" | "cols"): Cell[][] {
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })));
  table.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.covered) return;
      const { rows, cols } = span(cell);
      if (way === "rows" && rows > 1) {
        const inside = Math.min(gone.r1, r + rows - 1) - Math.max(gone.r0, r) + 1;
        if (inside <= 0) return;
        if (r >= gone.r0 && r <= gone.r1 && r + rows - 1 > gone.r1) {
          const heir = cells[gone.r1 + 1][c];
          Object.assign(heir, { ...cell, rows: rows - inside, covered: undefined });
        } else cells[r][c].rows = rows - inside;
      }
      if (way === "cols" && cols > 1) {
        const inside = Math.min(gone.c1, c + cols - 1) - Math.max(gone.c0, c) + 1;
        if (inside <= 0) return;
        if (c >= gone.c0 && c <= gone.c1 && c + cols - 1 > gone.c1) {
          const heir = cells[r][gone.c1 + 1];
          Object.assign(heir, { ...cell, cols: cols - inside, covered: undefined });
        } else cells[r][c].cols = cols - inside;
      }
    }),
  );
  return cells;
}

/** One cell out of many; its words are those of all of them. */
export function mergeCells(table: TableObject, part: Area): Patch {
  const area = wholeArea(table, part);
  const words: TextBody[] = [];
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })));
  for (let r = area.r0; r <= area.r1; r += 1) {
    for (let c = area.c0; c <= area.c1; c += 1) {
      const cell = cells[r][c];
      if (!cell.covered && plainText(cell.runs).trim() !== "") words.push(cell);
      if (r === area.r0 && c === area.c0) continue;
      cells[r][c] = { ...cellLike(cell), covered: true };
    }
  }
  const head = cells[area.r0][area.c0];
  const runs =
    words.length === 0
      ? head.runs
      : words.flatMap((body, i) => (i === 0 ? body.runs : [{ text: "\n", style: body.runs[0].style }, ...body.runs]));
  cells[area.r0][area.c0] = {
    ...head,
    covered: undefined,
    runs,
    paras: words.length === 1 ? words[0].paras : undefined,
    rows: area.r1 - area.r0 + 1,
    cols: area.c1 - area.c0 + 1,
  };
  return finish(table, table.cols, table.rows, cells);
}

/** Every spanning cell of an area back into single ones. */
export function splitCells(table: TableObject, part: Area): Patch {
  const area = wholeArea(table, part);
  const cells = table.cells.map((row) => row.map((cell) => ({ ...cell })));
  for (let r = area.r0; r <= area.r1; r += 1) {
    for (let c = area.c0; c <= area.c1; c += 1) {
      const cell = table.cells[r][c];
      if (cell.covered) continue;
      const { rows, cols } = span(cell);
      if (rows === 1 && cols === 1) continue;
      cells[r][c] = { ...cell, rows: undefined, cols: undefined };
      for (let i = r; i < Math.min(table.cells.length, r + rows); i += 1)
        for (let k = c; k < Math.min(table.cols.length, c + cols); k += 1)
          if (i !== r || k !== c) cells[i][k] = { ...cellLike(cell), covered: undefined };
    }
  }
  return finish(table, table.cols, table.rows, cells);
}

/** Cuts one cell in two, side by side or one over the other. */
export function divideCell(table: TableObject, r: number, c: number, way: "cols" | "rows"): Patch {
  const cell = table.cells[r][c];
  const { rows, cols } = span(cell);
  if ((way === "cols" ? cols : rows) > 1) {
    // It spans already: give half of it back.
    const cells = table.cells.map((row) => row.map((item) => ({ ...item })));
    const keep = Math.floor((way === "cols" ? cols : rows) / 2);
    if (way === "cols") {
      cells[r][c].cols = keep;
      cells[r][c + keep] = { ...cellLike(cell), rows: cell.rows, cols: cols - keep };
    } else {
      cells[r][c].rows = keep;
      cells[r + keep][c] = { ...cellLike(cell), cols: cell.cols, rows: rows - keep };
    }
    return finish(table, table.cols, table.rows, cells);
  }
  // Every other cell of the column (or row) is stretched over the new one.
  if (way === "cols") {
    const widths = [...table.cols];
    widths.splice(c, 1, table.cols[c] / 2, table.cols[c] / 2);
    const cells = table.cells.map((row, i) => {
      const next = row.map((item) => ({ ...item }));
      const own = ownerOf(table, i, c);
      const fresh = cellLike(table.cells[own.r][own.c]);
      if (own.r === r && own.c === c && i >= r && i < r + rows) {
        next.splice(c + 1, 0, i === r ? { ...fresh, rows: cell.rows } : { ...fresh, covered: true });
      } else {
        next.splice(c + 1, 0, { ...fresh, covered: true });
        if (own.r === i) next[own.c].cols = span(next[own.c]).cols + 1;
      }
      return next;
    });
    return finish(table, widths, table.rows, cells);
  }
  const heights = [...table.rows];
  heights.splice(r, 1, table.rows[r] / 2, table.rows[r] / 2);
  const cells = table.cells.map((row) => row.map((item) => ({ ...item })));
  const fresh: Cell[] = table.cols.map((_, k) => {
    const own = ownerOf(table, r, k);
    const like = cellLike(table.cells[own.r][own.c]);
    if (own.r === r && own.c === c && k >= c && k < c + cols)
      return k === c ? { ...like, cols: cell.cols } : { ...like, covered: true };
    if (own.c === k) cells[own.r][own.c].rows = span(cells[own.r][own.c]).rows + 1;
    return { ...like, covered: true };
  });
  cells.splice(r + 1, 0, fresh);
  return finish(table, table.cols, heights, cells);
}

/** Moves the line right of column `c`: the neighbour gives way, or the table grows. */
export function dragCol(table: TableObject, c: number, by: number, grow: boolean): Patch {
  const cols = [...table.cols];
  const min = table.pad.x * 2 + 6;
  if (grow || c === cols.length - 1) cols[c] = Math.max(min, cols[c] + by);
  else {
    const room = cols[c] + cols[c + 1];
    cols[c] = Math.max(min, Math.min(room - min, cols[c] + by));
    cols[c + 1] = room - cols[c];
  }
  return finish(table, cols, table.rows, table.cells);
}

export function dragRow(table: TableObject, r: number, to: number): Patch {
  const rows = [...table.rows];
  rows[r] = Math.max(table.pad.y * 2 + 4, to);
  return finish(table, table.cols, rows, table.cells);
}

/** The whole table wider or narrower, or a row and column evened out. */
export function scaleTable(table: TableObject, kx: number, ky: number): Patch {
  const min = table.pad.x * 2 + 4;
  return finish(
    table,
    table.cols.map((w) => Math.max(min, w * kx)),
    table.rows.map((h) => Math.max(6, h * ky)),
    table.cells,
  );
}

export function evenCols(table: TableObject, area: Area | null): Patch {
  const from = area?.c0 ?? 0;
  const to = area && area.c1 > area.c0 ? area.c1 : table.cols.length - 1;
  const start = area && area.c1 > area.c0 ? from : 0;
  const total = table.cols.slice(start, to + 1).reduce((sum, w) => sum + w, 0);
  const each = total / (to - start + 1);
  return finish(
    table,
    table.cols.map((w, c) => (c >= start && c <= to ? each : w)),
    table.rows,
    table.cells,
  );
}

export function evenRows(table: TableObject, area: Area | null): Patch {
  const lay = layTable(table);
  const many = area && area.r1 > area.r0;
  const start = many ? area.r0 : 0;
  const to = many ? area.r1 : table.cells.length - 1;
  const total = lay.ys[to + 1] - lay.ys[start];
  const each = total / (to - start + 1);
  return finish(
    table,
    table.cols,
    table.rows.map((h, r) => (r >= start && r <= to ? each : h)),
    table.cells,
  );
}

/** As narrow as the words allow, within a width. */
export function moveRows(table: TableObject, from: number, to: number): Patch {
  const cells = [...table.cells];
  const rows = [...table.rows];
  const [row] = cells.splice(from, 1);
  const [h] = rows.splice(from, 1);
  cells.splice(to, 0, row);
  rows.splice(to, 0, h);
  return finish(table, table.cols, rows, cells);
}

export type Sort = { col: number; up: boolean; head: boolean };

/** Rows in the order of one column: numbers as numbers, the rest by the alphabet. */
export function sortRows(table: TableObject, { col, up, head }: Sort): Patch | null {
  if (table.cells.some((row) => row.some((cell) => cell.covered || (cell.rows ?? 1) > 1))) return null;
  const start = head ? 1 : 0;
  const value = (r: number) => plainText(table.cells[r][col].runs).trim();
  const number = (text: string) => {
    const clean = text.replace(/[^\d.,\-]/g, "").replace(/,(?=\d{3})/g, "");
    return /\d/.test(clean) ? Number.parseFloat(clean) : Number.NaN;
  };
  const order = table.cells.map((_, r) => r).slice(start);
  const all = order.every((r) => value(r) === "" || Number.isFinite(number(value(r))));
  order.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === "" || y === "") return x === y ? a - b : x === "" ? 1 : -1;
    const by = all ? number(x) - number(y) : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
    return (up ? by : -by) || a - b;
  });
  const index = [...Array.from({ length: start }, (_, i) => i), ...order];
  return finish(
    table,
    table.cols,
    index.map((r) => table.rows[r]),
    index.map((r) => table.cells[r]),
  );
}

/** The sum of the numbers above (or left of) a cell, for the quick total. */
export function totalAbove(table: TableObject, r: number, c: number): number | null {
  let sum = 0;
  let any = false;
  for (let i = r - 1; i >= 0; i -= 1) {
    const text = plainText(table.cells[i][c].runs).trim();
    const clean = text.replace(/[^\d.,\-]/g, "").replace(/,(?=\d{2,3})/g, "");
    if (!/\d/.test(clean)) {
      if (any) break;
      continue;
    }
    sum += Number.parseFloat(clean);
    any = true;
  }
  return any ? Math.round(sum * 1e6) / 1e6 : null;
}

// ---------------------------------------------------------------- looks

export type TableLook = { id: string; label: string };
export const LOOKS: readonly TableLook[] = [
  { id: "grid", label: "Grid" },
  { id: "head", label: "Dark heading" },
  { id: "coral", label: "Coral heading" },
  { id: "blue", label: "Blue heading" },
  { id: "stripes", label: "Stripes" },
  { id: "lines", label: "Lines only" },
  { id: "soft", label: "Soft grid" },
  { id: "plain", label: "No lines" },
];

/** A ready-made look: lines, fills and the heading's letters. */
export function applyLook(table: TableObject, id: string): Pick<TableObject, "edge" | "cells" | "head" | "w" | "h"> {
  const ink = "#1d1c1f";
  const look: {
    edge: Edge | null;
    head?: { fill: string | null; color: string; bold: boolean };
    stripe?: string;
    flat?: boolean;
    line?: Edge;
  } =
    id === "head"
      ? { edge: { color: "#c9c8c4", width: 0.75, dash: "solid" }, head: { fill: ink, color: "#ffffff", bold: true } }
      : id === "coral"
        ? {
            edge: { color: "#e6c6bb", width: 0.75, dash: "solid" },
            head: { fill: "#d8431b", color: "#ffffff", bold: true },
          }
        : id === "blue"
          ? {
              edge: { color: "#b9c6dc", width: 0.75, dash: "solid" },
              head: { fill: "#1e3a8a", color: "#ffffff", bold: true },
            }
          : id === "stripes"
            ? { edge: null, head: { fill: "#dcdbd7", color: ink, bold: true }, stripe: "#f2f1ee" }
            : id === "lines"
              ? {
                  edge: null,
                  head: { fill: null, color: ink, bold: true },
                  flat: true,
                  line: { color: "#9b9a97", width: 0.6, dash: "solid" },
                }
              : id === "soft"
                ? {
                    edge: { color: "#d4d3cf", width: 0.6, dash: "solid" },
                    head: { fill: "#f0efec", color: ink, bold: true },
                  }
                : id === "plain"
                  ? { edge: null }
                  : { edge: GRID_EDGE };
  const rows = table.cells.length;
  const cells = table.cells.map((row, r) =>
    row.map((cell): Cell => {
      const head = r === 0 && look.head;
      const dark = (color: string) => color.toLowerCase() === "#ffffff";
      return {
        ...cell,
        fill: head ? look.head?.fill : look.stripe && r % 2 === 0 ? look.stripe : null,
        edges:
          look.flat && look.line
            ? {
                top: r === 0 ? { ...look.line, width: 1.2 } : look.line,
                bottom:
                  r === 0 ? { ...look.line, width: 1 } : r === rows - 1 ? { ...look.line, width: 1.2 } : look.line,
                left: null,
                right: null,
              }
            : undefined,
        runs: cell.runs.map((run) => ({
          ...run,
          style: head
            ? { ...run.style, color: look.head?.color ?? ink, bold: look.head?.bold ?? run.style.bold }
            : r === 0
              ? { ...run.style, color: dark(run.style.color) ? ink : run.style.color, bold: false }
              : run.style,
        })),
      };
    }),
  );
  const next = { ...table, edge: look.edge, cells, head: Boolean(look.head) };
  return { edge: look.edge, cells, head: Boolean(look.head), ...resized(next) };
}

// ---------------------------------------------------------------- from elsewhere

/** Plain rows of words (a pasted sheet, a CSV) as a table. */
export function tableFromRows(
  rows: string[][],
  w: number,
  style: Style,
  bold?: boolean[][],
): Omit<TableObject, "id" | "x" | "y"> {
  const cols = Math.max(1, ...rows.map((row) => row.length));
  const table = newTable(Math.max(1, rows.length), cols, w, style);
  // Columns as wide as their words ask for, all together as wide as there is room.
  const asks = Array.from({ length: cols }, (_, c) =>
    Math.min(
      60,
      Math.max(4, ...rows.map((row) => (row[c] ?? "").split("\n").reduce((m, l) => Math.max(m, l.length), 0))),
    ),
  );
  const total = asks.reduce((sum, n) => sum + n, 0);
  const natural = asks.map((n) => n * style.size * 0.52 + table.pad.x * 2 + 4);
  const sum = natural.reduce((a, b) => a + b, 0);
  table.cols = sum < w ? natural : asks.map((n) => (w * n) / total);
  table.cells = table.cells.map((row, r) =>
    row.map((cell, c) => ({
      ...cell,
      runs: [{ text: rows[r]?.[c] ?? "", style: bold?.[r]?.[c] ? { ...style, bold: true } : style }],
      align: /^[\s₹$€£¥(+\-]*[\d.,]+[\s%)]*$/.test(rows[r]?.[c] ?? "") && r > 0 ? ("right" as const) : cell.align,
    })),
  );
  const lay = layTable({ ...table, id: "", x: 0, y: 0 });
  return { ...table, w: lay.w, h: lay.h };
}

/** The rows of a copied table: from Excel, Sheets, Word or a web page. Null when it holds none. */
export function rowsFromHtml(html: string): { rows: string[][]; bold: boolean[][] } | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows: string[][] = [];
  const bold: boolean[][] = [];
  for (const row of table.querySelectorAll("tr")) {
    const words: string[] = [];
    const heavy: boolean[] = [];
    for (const cell of row.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th")) {
      for (const br of cell.querySelectorAll("br")) br.replaceWith("\n");
      const text = (cell.textContent ?? "")
        .replace(/[ \t\r\f\v]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .trim();
      words.push(text);
      heavy.push(
        cell.tagName === "TH" ||
          cell.querySelector("b, strong") !== null ||
          /font-weight:\s*(bold|[6-9]00)/.test(cell.getAttribute("style") ?? ""),
      );
      for (let i = 1; i < cell.colSpan; i += 1) {
        words.push("");
        heavy.push(false);
      }
    }
    if (words.length > 0) {
      rows.push(words);
      bold.push(heavy);
    }
  }
  return rows.length > 0 ? { rows, bold } : null;
}

/** Tab-separated rows, as copied from a sheet. Null when the text is not a table. */
export function rowsFromText(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  if (!lines.some((line) => line.includes("\t"))) return null;
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
}

/** A table as tab-separated text, for the clipboard. */
export const tableText = (table: TableObject) =>
  table.cells
    .map((row) => row.map((cell) => (cell.covered ? "" : plainText(cell.runs).replace(/[\t\n]+/g, " "))).join("\t"))
    .join("\n");
