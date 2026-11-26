import type { Rules } from "./paragraphs";
import type { Box, Point } from "./matrix";
import type { Cmd } from "./shapes";

/**
 * The lines and shapes a page draws. Every painting instruction is one path;
 * here they are put together the way a person sees them: a line of a table is
 * one line however many pieces it was drawn in, and the table is one drawing.
 */

export type VectorPath = {
  /** Its place among the page's painting instructions. */
  op: number;
  /** In page space. */
  path: Cmd[];
  box: Box;
  stroke: string | null;
  fill: string | null;
  width: number;
  dash: number[];
  cap: 0 | 1 | 2;
  join: 0 | 1 | 2;
  evenOdd: boolean;
  alpha: number;
  /** Painted with a pattern or a gradient: it can be taken away, but not drawn again as it was. */
  pattern: boolean;
};

export type Stripe = { x0: number; y0: number; x1: number; y1: number; width: number; color: string; dash: number[] };

/** Something that can be picked: a line, or one shape. */
export type Unit = {
  key: string;
  /** The paths it is made of. */
  ops: number[];
  box: Box;
  line: Stripe | null;
  paths: VectorPath[];
};

const near = (a: number, b: number, by: number) => Math.abs(a - b) <= by;

/** The straight line a path amounts to: a stroke from one point to another, or a rectangle too thin to be one. */
export function stripeOf(path: VectorPath): Stripe | null {
  if (path.pattern) return null;
  const { box } = path;
  if (path.fill && !path.stroke) {
    const thin = Math.min(box.w, box.h);
    const long = Math.max(box.w, box.h);
    if (thin > 3.2 || long < thin * 2.2 || path.path.some((cmd) => cmd[0] === "C")) return null;
    const points = path.path.filter((cmd) => cmd[0] === "M" || cmd[0] === "L").length;
    if (points < 2 || points > 5) return null;
    return box.w >= box.h
      ? {
          x0: box.x,
          y0: box.y + box.h / 2,
          x1: box.x + box.w,
          y1: box.y + box.h / 2,
          width: Math.max(0.1, box.h),
          color: path.fill,
          dash: [],
        }
      : {
          x0: box.x + box.w / 2,
          y0: box.y,
          x1: box.x + box.w / 2,
          y1: box.y + box.h,
          width: Math.max(0.1, box.w),
          color: path.fill,
          dash: [],
        };
  }
  if (!path.stroke) return null;
  const points: Point[] = [];
  for (const cmd of path.path) {
    if (cmd[0] === "C") return null;
    if (
      cmd[0] === "M" &&
      points.length > 0 &&
      !(near(points[points.length - 1].x, cmd[1], 0.01) && near(points[points.length - 1].y, cmd[2], 0.01))
    )
      return null;
    if (cmd[0] !== "Z") points.push({ x: cmd[1], y: cmd[2] });
  }
  if (points.length < 2) return null;
  const a = points[0];
  const b = points.reduce(
    (best, p) => (Math.hypot(p.x - a.x, p.y - a.y) > Math.hypot(best.x - a.x, best.y - a.y) ? p : best),
    points[1],
  );
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 0.5) return null;
  // Every other point has to lie on it.
  for (const p of points)
    if (Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length > 0.4) return null;
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, width: Math.max(0.1, path.width), color: path.stroke, dash: path.dash };
}

const upright = (line: Stripe) => near(line.x0, line.x1, 0.3);
const level = (line: Stripe) => near(line.y0, line.y1, 0.3);

/** The straight lines of a page, for telling table cells apart. */
export function rulesOf(paths: readonly VectorPath[]): Rules {
  const rules: Rules = { x: [], y: [] };
  const add = (list: { at: number; from: number; to: number }[], at: number, from: number, to: number) =>
    list.push({ at, from: Math.min(from, to), to: Math.max(from, to) });
  for (const path of paths) {
    const line = stripeOf(path);
    if (line) {
      if (upright(line) && Math.abs(line.y1 - line.y0) > 5) add(rules.x, line.x0, line.y0, line.y1);
      else if (level(line) && Math.abs(line.x1 - line.x0) > 5) add(rules.y, line.y0, line.x0, line.x1);
      continue;
    }
    // Boxes, filled or drawn around.
    const { box } = path;
    if (box.w < 8 || box.h < 6 || path.path.some((cmd) => cmd[0] === "C")) continue;
    if (!path.stroke && (!path.fill || path.fill === "#ffffff")) continue;
    add(rules.x, box.x, box.y, box.y + box.h);
    add(rules.x, box.x + box.w, box.y, box.y + box.h);
    add(rules.y, box.y, box.x, box.x + box.w);
    add(rules.y, box.y + box.h, box.x, box.x + box.w);
  }
  return rules;
}

/** What can be picked on a page, in the order it is painted. */
export function unitsOf(paths: readonly VectorPath[], page: { w: number; h: number }): Unit[] {
  const units: Unit[] = [];
  const lines: { unit: Unit; line: Stripe }[] = [];
  const squares: VectorPath[] = [];
  for (const path of paths) {
    const { box } = path;
    if (!path.stroke && !path.fill && !path.pattern) continue;
    if (path.alpha < 0.02) continue;
    if (box.x > page.w || box.y > page.h || box.x + box.w < 0 || box.y + box.h < 0) continue;
    // The paper itself.
    if (box.w > page.w * 0.96 && box.h > page.h * 0.96) continue;
    if (box.w < 0.05 && box.h < 0.05) continue;
    const line = stripeOf(path);
    if (line && (upright(line) || level(line))) {
      // Table lines come in pieces: the ones that go on from each other are one.
      const flat = level(line);
      const mate = lines.find(({ line: other }) => {
        if (level(other) !== flat || other.color !== line.color || !near(other.width, line.width, 0.35)) return false;
        if (other.dash.join() !== line.dash.join()) return false;
        if (flat) {
          if (!near(other.y0, line.y0, 0.45)) return false;
          const reach = Math.max(1.2, line.width * 2);
          return (
            Math.min(line.x0, line.x1) <= Math.max(other.x0, other.x1) + reach &&
            Math.max(line.x0, line.x1) >= Math.min(other.x0, other.x1) - reach
          );
        }
        if (!near(other.x0, line.x0, 0.45)) return false;
        const reach = Math.max(1.2, line.width * 2);
        return (
          Math.min(line.y0, line.y1) <= Math.max(other.y0, other.y1) + reach &&
          Math.max(line.y0, line.y1) >= Math.min(other.y0, other.y1) - reach
        );
      });
      if (mate) {
        const other = mate.line;
        if (flat) {
          const from = Math.min(other.x0, other.x1, line.x0, line.x1);
          const to = Math.max(other.x0, other.x1, line.x0, line.x1);
          mate.line = { ...other, x0: from, x1: to };
        } else {
          const from = Math.min(other.y0, other.y1, line.y0, line.y1);
          const to = Math.max(other.y0, other.y1, line.y0, line.y1);
          mate.line = { ...other, y0: from, y1: to };
        }
        mate.unit.ops.push(path.op);
        mate.unit.paths.push(path);
        mate.unit.line = mate.line;
        mate.unit.box = boxOf(mate.line);
        continue;
      }
      const unit: Unit = { key: `v${path.op}`, ops: [path.op], box: boxOf(line), line, paths: [path] };
      units.push(unit);
      lines.push({ unit, line });
      continue;
    }
    if (box.w < 3.2 && box.h < 3.2 && path.fill && !path.stroke) {
      squares.push(path);
      continue;
    }
    units.push({ key: `v${path.op}`, ops: [path.op], box: line ? boxOf(line) : box, line, paths: [path] });
  }
  // The little squares where table lines meet belong to the line they sit on.
  for (const path of squares) {
    const cx = path.box.x + path.box.w / 2;
    const cy = path.box.y + path.box.h / 2;
    const home = lines.find(({ line }) =>
      level(line)
        ? near(line.y0, cy, 0.8) && cx >= Math.min(line.x0, line.x1) - 1.5 && cx <= Math.max(line.x0, line.x1) + 1.5
        : near(line.x0, cx, 0.8) && cy >= Math.min(line.y0, line.y1) - 1.5 && cy <= Math.max(line.y0, line.y1) + 1.5,
    );
    if (home && path.fill === home.line.color) {
      home.unit.ops.push(path.op);
      home.unit.paths.push(path);
      home.unit.line = home.line;
    } else units.push({ key: `v${path.op}`, ops: [path.op], box: path.box, line: null, paths: [path] });
  }
  for (const { unit, line } of lines) {
    unit.line = line;
    unit.box = boxOf(line);
  }
  return units;
}

function boxOf(line: Stripe): Box {
  return {
    x: Math.min(line.x0, line.x1),
    y: Math.min(line.y0, line.y1),
    w: Math.abs(line.x1 - line.x0),
    h: Math.abs(line.y1 - line.y0),
  };
}

/** Drawn around something without filling it: what is inside is not part of it. */
const hollow = (unit: Unit) =>
  !unit.line && Math.min(unit.box.w, unit.box.h) > 6 && unit.paths.every((path) => !path.fill && !path.pattern);

/** Points along what can be seen of a unit. */
function samples(unit: Unit): Point[] {
  const out: Point[] = [];
  const along = (a: Point, b: Point) => {
    const steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 18)));
    for (let i = 0; i <= steps; i += 1)
      out.push({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
  };
  if (unit.line) {
    along({ x: unit.line.x0, y: unit.line.y0 }, { x: unit.line.x1, y: unit.line.y1 });
    return out;
  }
  for (const path of unit.paths) {
    let from: Point | null = null;
    let start: Point | null = null;
    for (const cmd of path.path) {
      if (cmd[0] === "M") from = start = { x: cmd[1], y: cmd[2] };
      else if (cmd[0] === "L" && from) {
        const to = { x: cmd[1], y: cmd[2] };
        along(from, to);
        from = to;
      } else if (cmd[0] === "C" && from) {
        for (let i = 1; i <= 4; i += 1) out.push(onCurve(from, cmd, i / 4));
        from = { x: cmd[5], y: cmd[6] };
      } else if (cmd[0] === "Z" && from && start) {
        along(from, start);
        from = start;
      }
      if (out.length > 600) return out;
    }
  }
  return out;
}

function meets(a: Unit, b: Unit): boolean {
  const reach = Math.max(1.5, a.line?.width ?? 0, b.line?.width ?? 0);
  const p = a.box;
  const q = b.box;
  if (p.x > q.x + q.w + reach || q.x > p.x + p.w + reach || p.y > q.y + q.h + reach || q.y > p.y + p.h + reach)
    return false;
  const frame = hollow(a) ? a : hollow(b) ? b : null;
  if (!frame) return true;
  const other = frame === a ? b : a;
  return (
    samples(other).some((point) => distanceTo(frame, point) <= reach) ||
    samples(frame).some((point) => distanceTo(other, point) <= reach)
  );
}

/** A background: most of the page lies on it. */
export const isPanel = (unit: Unit, page: { w: number; h: number }) =>
  !unit.line && !hollow(unit) && unit.box.w * unit.box.h > page.w * page.h * 0.4;

/** Everything that touches, directly or through others: a whole table, or a whole drawing. */
export function touching(units: readonly Unit[], from: Unit, page: { w: number; h: number }): Unit[] {
  if (isPanel(from, page)) return [from];
  const out = new Set<Unit>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const unit = queue.pop() as Unit;
    for (const other of units) {
      if (out.has(other) || isPanel(other, page) || !meets(unit, other)) continue;
      out.add(other);
      queue.push(other);
    }
  }
  return units.filter((unit) => out.has(unit));
}

/** How far a point is from what can be seen of a unit. 0 inside a filled shape. */
export function distanceTo(unit: Unit, p: Point): number {
  if (unit.line) return Math.max(0, toSegment(p, unit.line) - unit.line.width / 2);
  const { box } = unit;
  if (p.x < box.x - 12 || p.y < box.y - 12 || p.x > box.x + box.w + 12 || p.y > box.y + box.h + 12) return Infinity;
  let best = Infinity;
  for (const path of unit.paths) {
    if (path.fill || path.pattern) {
      if (insidePath(path, p)) return 0;
    }
    let from: Point | null = null;
    let start: Point | null = null;
    for (const cmd of path.path) {
      if (cmd[0] === "M") {
        from = { x: cmd[1], y: cmd[2] };
        start = from;
      } else if (cmd[0] === "L" && from) {
        best = Math.min(best, toSegment(p, { x0: from.x, y0: from.y, x1: cmd[1], y1: cmd[2] }) - path.width / 2);
        from = { x: cmd[1], y: cmd[2] };
      } else if (cmd[0] === "C" && from) {
        let last = from;
        for (let i = 1; i <= 8; i += 1) {
          const next = onCurve(from, cmd, i / 8);
          best = Math.min(best, toSegment(p, { x0: last.x, y0: last.y, x1: next.x, y1: next.y }) - path.width / 2);
          last = next;
        }
        from = { x: cmd[5], y: cmd[6] };
      } else if (cmd[0] === "Z" && from && start) {
        best = Math.min(best, toSegment(p, { x0: from.x, y0: from.y, x1: start.x, y1: start.y }) - path.width / 2);
        from = start;
      }
    }
  }
  return Math.max(0, best);
}

function onCurve(from: Point, cmd: ["C", number, number, number, number, number, number], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * cmd[1] + c * cmd[3] + d * cmd[5],
    y: a * from.y + b * cmd[2] + c * cmd[4] + d * cmd[6],
  };
}

function toSegment(p: Point, line: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = line.x1 - line.x0;
  const dy = line.y1 - line.y0;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - line.x0) * dx + (p.y - line.y0) * dy) / length));
  return Math.hypot(p.x - line.x0 - t * dx, p.y - line.y0 - t * dy);
}

function insidePath(path: VectorPath, p: Point): boolean {
  let crossings = 0;
  let winding = 0;
  const edge = (a: Point, b: Point) => {
    if (a.y > p.y === b.y > p.y) return;
    if (p.x >= ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) return;
    crossings += 1;
    winding += b.y > a.y ? 1 : -1;
  };
  let from: Point | null = null;
  let start: Point | null = null;
  const close = () => {
    if (from && start) edge(from, start);
  };
  for (const cmd of path.path) {
    if (cmd[0] === "M") {
      close();
      from = start = { x: cmd[1], y: cmd[2] };
    } else if (cmd[0] === "L" && from) {
      const to = { x: cmd[1], y: cmd[2] };
      edge(from, to);
      from = to;
    } else if (cmd[0] === "C" && from) {
      let last: Point = from;
      for (let i = 1; i <= 8; i += 1) {
        const next = onCurve(from, cmd, i / 8);
        edge(last, next);
        last = next;
      }
      from = { x: cmd[5], y: cmd[6] };
    } else if (cmd[0] === "Z") {
      close();
      from = start;
    }
  }
  close();
  return path.evenOdd ? crossings % 2 === 1 : winding !== 0;
}

// ---------------------------------------------------------------- ruled tables

export type Grid = {
  xs: number[];
  ys: number[];
  /** Which cell lies under which, when lines are missing between them. */ owner: number[][];
};

/** The grid a set of lines makes, if it makes one: at least one cell with all four sides. */
export function gridOf(units: readonly Unit[]): Grid | null {
  const h: Stripe[] = [];
  const v: Stripe[] = [];
  for (const unit of units) {
    if (unit.line) {
      if (level(unit.line)) h.push(unit.line);
      else if (upright(unit.line)) v.push(unit.line);
      continue;
    }
    for (const path of unit.paths) {
      const { box } = path;
      if (!path.stroke || path.path.some((cmd) => cmd[0] === "C") || box.w < 4 || box.h < 4) continue;
      const base = { width: path.width, color: path.stroke, dash: path.dash };
      h.push({ x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y, ...base });
      h.push({ x0: box.x, y0: box.y + box.h, x1: box.x + box.w, y1: box.y + box.h, ...base });
      v.push({ x0: box.x, y0: box.y, x1: box.x, y1: box.y + box.h, ...base });
      v.push({ x0: box.x + box.w, y0: box.y, x1: box.x + box.w, y1: box.y + box.h, ...base });
    }
  }
  if (h.length < 2 || v.length < 2) return null;
  const gather = (values: number[]) => {
    const out: number[] = [];
    for (const value of [...values].sort((a, b) => a - b)) {
      if (out.length > 0 && value - out[out.length - 1] < 2.5) continue;
      out.push(value);
    }
    return out;
  };
  const xs = gather(v.map((line) => line.x0));
  const ys = gather(h.map((line) => line.y0));
  if (xs.length < 2 || ys.length < 2 || xs.length > 60 || ys.length > 200) return null;
  const covers = (lines: Stripe[], flat: boolean, at: number, from: number, to: number) => {
    let done = from + 2;
    const parts = lines
      .filter((line) => near(flat ? line.y0 : line.x0, at, 2.5))
      .map((line) =>
        flat
          ? [Math.min(line.x0, line.x1), Math.max(line.x0, line.x1)]
          : [Math.min(line.y0, line.y1), Math.max(line.y0, line.y1)],
      )
      .sort((a, b) => a[0] - b[0]);
    for (const [a, b] of parts) {
      if (a > done + 2.5) break;
      done = Math.max(done, b);
      if (done >= to - 2.5) return true;
    }
    return done >= to - 2.5;
  };
  const rows = ys.length - 1;
  const cols = xs.length - 1;
  const owner = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (__, c) => r * cols + c));
  const root = (i: number): number => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return owner[r][c] === i ? i : root(owner[r][c]);
  };
  const join = (a: number, b: number) => {
    const ra = root(a);
    const rb = root(b);
    if (ra === rb) return;
    const [low, high] = ra < rb ? [ra, rb] : [rb, ra];
    owner[Math.floor(high / cols)][high % cols] = low;
  };
  let walls = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (c + 1 < cols) {
        if (covers(v, false, xs[c + 1], ys[r], ys[r + 1])) walls += 1;
        else join(r * cols + c, r * cols + c + 1);
      }
      if (r + 1 < rows) {
        if (covers(h, true, ys[r + 1], xs[c], xs[c + 1])) walls += 1;
        else join(r * cols + c, (r + 1) * cols + c);
      }
    }
  }
  const whole =
    covers(h, true, ys[0], xs[0], xs[cols]) &&
    covers(h, true, ys[rows], xs[0], xs[cols]) &&
    covers(v, false, xs[0], ys[0], ys[rows]) &&
    covers(v, false, xs[cols], ys[0], ys[rows]);
  if (!whole || (walls === 0 && rows * cols > 1)) return null;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) owner[r][c] = root(r * cols + c);
  // Joined cells have to be rectangles, or this is not a table.
  for (let i = 0; i < rows * cols; i += 1) {
    const mine: [number, number][] = [];
    owner.forEach((row, r) => row.forEach((value, c) => value === i && mine.push([r, c])));
    if (mine.length < 2) continue;
    const r0 = Math.min(...mine.map(([r]) => r));
    const r1 = Math.max(...mine.map(([r]) => r));
    const c0 = Math.min(...mine.map(([, c]) => c));
    const c1 = Math.max(...mine.map(([, c]) => c));
    if ((r1 - r0 + 1) * (c1 - c0 + 1) !== mine.length) return null;
  }
  return { xs, ys, owner };
}
