import type { Box, Point } from "./matrix";
import type { Cmd } from "./shapes";

/**
 * The shapes one can put on a page. They are the preset shapes of Office, with its names, formulas and
 * adjust values, so a drawing can go to PowerPoint and come back unchanged. As there, an arc, a chord, a
 * block arc, a circular arrow and a gear leave part of their box empty: stretching them would show.
 */

export type ShapePart = {
  path: Cmd[];
  paint: "both" | "fill" | "stroke";
  /** Lighter (+) or darker (-) than the fill, -1..1: the sides of a cube, the lid of a can. */
  shade?: number;
  evenOdd?: boolean;
};

export type ShapeAdjust = {
  value: number;
  min: number;
  max: number;
  /** Where its yellow handle sits. Values that share one (a bubble's tail) are dragged one after the other. */
  handle: (w: number, h: number, adj: readonly number[]) => Point;
  /** The value for a handle dragged to a point. */
  drag: (w: number, h: number, adj: readonly number[], at: Point) => number;
};

export type ShapeGroup = "Basic" | "Arrows" | "Stars and banners" | "Callouts" | "Flowchart" | "Brackets";

export type ShapeDef = {
  kind: string;
  label: string;
  group: ShapeGroup;
  parts: (w: number, h: number, adj: readonly number[]) => ShapePart[];
  adjust: ShapeAdjust[];
  /** Room for text inside. */
  text: (w: number, h: number, adj: readonly number[]) => Box;
  /** Natural width / height when placed with a click. */
  ratio: number;
};

// ---------------------------------------------------------------- numbers

const cos = (degrees: number) => Math.cos((degrees * Math.PI) / 180);
const sin = (degrees: number) => Math.sin((degrees * Math.PI) / 180);
const angleOf = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
const pin = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value));
/** 0 to 360. */
const turn = (degrees: number) => ((degrees % 360) + 360) % 360;
/** How far it is clockwise from one angle to another. To the same angle it is all the way round. */
const sweepOf = (start: number, end: number) => turn(end - start) || 360;

/** The angle that draws the point where a ray meets an ellipse. They differ unless it is a circle. */
function drawnAngle(angle: number, rx: number, ry: number): number {
  // Straight up, down and across they are the same, also when the ellipse is flat.
  if (angle % 90 === 0) return angle;
  const drawn = angleOf(ry * cos(angle), rx * sin(angle));
  return drawn - 360 * Math.round((drawn - angle) / 360);
}

/** Where a ray from the middle meets an ellipse. */
function meet(cx: number, cy: number, rx: number, ry: number, angle: number): Point {
  const drawn = drawnAngle(angle, rx, ry);
  return { x: cx + rx * cos(drawn), y: cy + ry * sin(drawn) };
}

// ---------------------------------------------------------------- paths

type Pair = readonly [x: number, y: number];
type Curve = readonly [Point, Point, Point, Point];

/** Where a curve turns back, going by one of its coordinates. */
function turnsOf(a: number, b: number, c: number, d: number): number[] {
  const square = d - 3 * c + 3 * b - a;
  const half = c - 2 * b + a;
  const root = Math.sqrt(half * half - square * (b - a));
  const sum = half < 0 ? root - half : -root - half;
  return [sum / square, (b - a) / sum].filter((t) => t > 0.001 && t < 0.999);
}

function cutCurve([a, b, c, d]: Curve, t: number): [Curve, Curve] {
  const mix = (p: Point, q: Point): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const [ab, bc, cd] = [mix(a, b), mix(b, c), mix(c, d)];
  const [abc, bcd] = [mix(ab, bc), mix(bc, cd)];
  const middle = mix(abc, bcd);
  return [
    [a, ab, abc, middle],
    [middle, bcd, cd, d],
  ];
}

/** Draws a path. Angles are in degrees, clockwise from the right, as they look on the page. */
class Pen {
  readonly path: Cmd[] = [];
  private x = 0;
  private y = 0;

  constructor(
    private readonly sx: number,
    private readonly sy: number,
  ) {}

  move(x: number, y: number) {
    this.path.push(["M", x * this.sx, y * this.sy]);
    return this.at(x, y);
  }

  line(...points: Pair[]) {
    for (const [x, y] of points) {
      this.path.push(["L", x * this.sx, y * this.sy]);
      this.at(x, y);
    }
    return this;
  }

  /** Parted where it is furthest out: in a thin shape a sharp turn in the middle of a curve comes out jagged. */
  curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    const turns = [...turnsOf(this.x, x1, x2, x), ...turnsOf(this.y, y1, y2, y)].sort((a, b) => a - b);
    let rest: Curve = [
      { x: this.x, y: this.y },
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      { x, y },
    ];
    let done = 0;
    for (const turn of turns) {
      const t = (turn - done) / (1 - done);
      if (t < 0.001) continue;
      const [first, second] = cutCurve(rest, t);
      this.piece(first);
      rest = second;
      done = turn;
    }
    return this.piece(rest);
  }

  /** A curve with one control point. */
  bend(x1: number, y1: number, x: number, y: number) {
    const part = (from: number, to: number) => from + (2 / 3) * (to - from);
    return this.curve(part(this.x, x1), part(this.y, y1), part(x, x1), part(y, y1), x, y);
  }

  /** On along an ellipse. The pen is already on it, where a ray at `start` meets it. */
  arc(rx: number, ry: number, start: number, sweep: number) {
    if (rx === 0 && ry === 0) return this;
    const from = drawnAngle(start, rx, ry);
    const to = drawnAngle(start + sweep, rx, ry);
    const cx = this.x - rx * cos(from);
    const cy = this.y - ry * sin(from);
    const way = to < from ? -1 : 1;
    for (let a = from; Math.abs(to - a) > 1e-9;) {
      // For the same reason it is drawn in quarters.
      const quarter = way * 90 * (Math.floor((way * a) / 90 + 1e-6) + 1);
      const b = way * (to - quarter) > 1e-4 ? quarter : to;
      const k = (4 / 3) * Math.tan(((b - a) * Math.PI) / 720);
      const p = { x: this.x, y: this.y };
      const q = { x: cx + rx * cos(b), y: cy + ry * sin(b) };
      this.piece([
        p,
        { x: p.x - k * rx * sin(a), y: p.y + k * ry * cos(a) },
        { x: q.x + k * rx * sin(b), y: q.y - k * ry * cos(b) },
        q,
      ]);
      a = b;
    }
    return this;
  }

  oval(cx: number, cy: number, rx: number, ry: number, sweep = 360) {
    return this.move(cx - rx, cy)
      .arc(rx, ry, 180, sweep)
      .close();
  }

  close() {
    this.path.push(["Z"]);
    return this;
  }

  private piece([, b, c, d]: Curve) {
    const { sx, sy } = this;
    this.path.push(["C", b.x * sx, b.y * sy, c.x * sx, c.y * sy, d.x * sx, d.y * sy]);
    return this.at(d.x, d.y);
  }

  private at(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
}

const pen = () => new Pen(1, 1);

/** For shapes laid out in steps. */
const grid = (w: number, h: number, across: number, down = across) => new Pen(w / across, h / down);

const poly = ([x, y]: Pair, ...rest: Pair[]) =>
  pen()
    .move(x, y)
    .line(...rest)
    .close();

const rounded = (w: number, h: number, r: number) =>
  pen()
    .move(0, r)
    .arc(r, r, 180, 90)
    .line([w - r, 0])
    .arc(r, r, 270, 90)
    .line([w, h - r])
    .arc(r, r, 0, 90)
    .line([r, h])
    .arc(r, r, 90, 90)
    .close();

const box = (w: number, h: number) => poly([0, 0], [w, 0], [w, h], [0, h]);

const diamond = (w: number, h: number) => poly([0, h / 2], [w / 2, 0], [w, h / 2], [w / 2, h]);

const oval = (w: number, h: number) => pen().oval(w / 2, h / 2, w / 2, h / 2);

/** Corners of a regular polygon, or of a star when every other one is only `inner` of the way out. */
function spokes(count: number, first: number, cx: number, cy: number, rx: number, ry: number, inner = 1): Pair[] {
  return Array.from({ length: count }, (_, i): Pair => {
    const angle = first + (i * 360) / count;
    const out = i % 2 ? inner : 1;
    return [cx + rx * out * cos(angle), cy + ry * out * sin(angle)];
  });
}

const around = ([first, ...rest]: Pair[]) => poly(first, ...rest);

const both = ({ path }: Pen): ShapePart => ({ path, paint: "both" });
const holed = ({ path }: Pen): ShapePart => ({ path, paint: "both", evenOdd: true });
const line = ({ path }: Pen): ShapePart => ({ path, paint: "stroke" });
const fill = ({ path }: Pen, shade?: number): ShapePart =>
  shade === undefined ? { path, paint: "fill" } : { path, paint: "fill", shade };

/** Office's four shades. */
const LIGHTER = 0.4;
const LIGHT = 0.2;
const DARK = -0.2;
const DARKER = -0.4;

const edges = (left: number, top: number, right: number, bottom: number): Box => ({
  x: Math.min(left, (left + right) / 2),
  y: Math.min(top, (top + bottom) / 2),
  w: Math.max(0, right - left),
  h: Math.max(0, bottom - top),
});

/** The box through an ellipse at 45 degrees. */
const inOval = (w: number, h: number): Box => {
  const x = (w / 2) * (1 - Math.SQRT1_2);
  const y = (h / 2) * (1 - Math.SQRT1_2);
  return edges(x, y, w - x, h - y);
};

/** How far text keeps from the box at a rounded corner, as part of its radius. */
const ROUND_INSET = 1 - Math.SQRT1_2;

// ---------------------------------------------------------------- definitions

/** An adjust value: what it is to begin with, and its limits. */
type Range = readonly [value: number, min: number, max: number];

/** For values that only the size of the box limits: the length of an arrow's head, the place of a tail. */
const FAR = 100;

const between = (value: number, min: number, max: number): Range => [value, min, max];
const half = (value: number) => between(value, 0, 0.5);
const whole = (value: number) => between(value, 0, 1);
const free = (value: number) => between(value, 0, FAR);
const place = (value: number) => between(value, -FAR, FAR);
/** In degrees, up to the last one Office can write. */
const angle = (value: number) => between(value, 0, 21599999 / 60000);

/** A handle: its value changes along a direction, or with the angle about the middle of the box. */
type Grip = Point & ({ way: Point } | { from: number; most: number });

const gripX = (x: number, y: number): Grip => ({ x, y, way: { x: 1, y: 0 } });
const gripY = (x: number, y: number): Grip => ({ x, y, way: { x: 0, y: 1 } });
const gripOut = (at: Point, degrees: number): Grip => ({ ...at, way: { x: cos(degrees), y: sin(degrees) } });
const gripTurn = (at: Point, from = 0, most = 360): Grip => ({ ...at, from, most });

type Drawing = { parts: ShapePart[]; text: Box; grips?: Grip[] };
type Draw = (w: number, h: number, adj: readonly number[]) => Drawing;

const fit = (ranges: readonly Range[], adj: readonly number[]): number[] =>
  ranges.map(([value, min, max], i) => pin(min, Number.isFinite(adj[i]) ? adj[i] : value, max));

/**
 * The value that brings a handle to `target`, found by halving, as a handle runs one way while its value
 * grows. Where the box lets it go no further it stands still, and the value found is where that begins.
 */
function settle(at: (value: number) => number, [, min, max]: Range, target: number, slack: number): number | null {
  const sign = at(max) < at(min) ? -1 : 1;
  const start = sign * at(min);
  const end = sign * at(max);
  if (end - start <= slack) return null;
  const want = pin(start, sign * target, end);
  const limit = want <= start + slack ? want + slack : want - slack;
  let low = min;
  let high = max;
  for (let i = 0; i < 64; i += 1) {
    const middle = (low + high) / 2;
    if (sign * at(middle) <= limit) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function shape(
  group: ShapeGroup,
  kind: string,
  label: string,
  ratio: number,
  ranges: readonly Range[],
  draw: Draw,
): ShapeDef {
  const drawing = (w: number, h: number, adj: readonly number[]) =>
    draw(Math.max(w, 1e-3), Math.max(h, 1e-3), fit(ranges, adj));
  const gripOf = (w: number, h: number, adj: readonly number[], i: number): Grip =>
    drawing(w, h, adj).grips?.[i] ?? gripX(0, 0);
  return {
    kind,
    label,
    group,
    ratio,
    parts: (w, h, adj) => drawing(w, h, adj).parts,
    text: (w, h, adj) => drawing(w, h, adj).text,
    adjust: ranges.map((range, i): ShapeAdjust => {
      const [value, min, max] = range;
      return {
        value,
        min,
        max,
        handle: (w, h, adj) => {
          const { x, y } = gripOf(w, h, adj, i);
          return { x, y };
        },
        drag: (w, h, adj, at) => {
          const now = fit(ranges, adj);
          const grip = gripOf(w, h, now, i);
          const slack = (w + h) * 1e-10;
          // A handle that has not moved keeps its value, even one that is more than the box can show.
          if (Math.hypot(at.x - grip.x, at.y - grip.y) <= slack) return now[i];
          if ("way" in grip) {
            const far = (point: Point) => point.x * grip.way.x + point.y * grip.way.y;
            if (Math.abs(far(at) - far(grip)) <= slack) return now[i];
            const tried = (value: number) => {
              const other = now.map((old, j) => (j === i ? value : old));
              return far(gripOf(w, h, other, i));
            };
            const found = settle(tried, range, far(at), slack);
            return found === null ? now[i] : Math.round(found * 1e9) / 1e9;
          }
          const turned = turn(Math.round((angleOf(at.x - w / 2, at.y - h / 2) - grip.from) * 1e7) / 1e7);
          if (turned <= grip.most) return pin(min, turned, max);
          return pin(min, turned - grip.most < 360 - turned ? grip.most : 0, max);
        },
      };
    }),
  };
}

function movePath(path: readonly Cmd[], to: (point: Point) => Point): Cmd[] {
  const pair = (x: number, y: number): [number, number] => {
    const point = to({ x, y });
    return [point.x, point.y];
  };
  return path.map((cmd): Cmd => {
    if (cmd[0] === "Z") return cmd;
    if (cmd[0] === "C") return ["C", ...pair(cmd[1], cmd[2]), ...pair(cmd[3], cmd[4]), ...pair(cmd[5], cmd[6])];
    return [cmd[0], ...pair(cmd[1], cmd[2])];
  });
}

/** A drawing with every point moved. */
function moved(drawing: Drawing, to: (point: Point) => Point): Drawing {
  const { x, y, w, h } = drawing.text;
  const a = to({ x, y });
  const b = to({ x: x + w, y: y + h });
  const origin = to({ x: 0, y: 0 });
  return {
    parts: drawing.parts.map((part) => ({ ...part, path: movePath(part.path, to) })),
    text: edges(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)),
    grips: drawing.grips?.map((grip) => {
      if (!("way" in grip)) return { ...grip, ...to(grip) };
      const way = to(grip.way);
      return { ...to(grip), way: { x: way.x - origin.x, y: way.y - origin.y } };
    }),
  };
}

const mirrored =
  (draw: Draw): Draw =>
  (w, h, adj) =>
    moved(draw(w, h, adj), ({ x, y }) => ({ x: w - x, y }));

const upsideDown =
  (draw: Draw): Draw =>
  (w, h, adj) =>
    moved(draw(w, h, adj), ({ x, y }) => ({ x, y: h - y }));

/** Right becomes down, left becomes up. */
const turnedDown =
  (draw: Draw): Draw =>
  (w, h, adj) =>
    moved(draw(h, w, adj), ({ x, y }) => ({ x: y, y: x }));

// ---------------------------------------------------------------- basic shapes

const basic = (kind: string, label: string, ratio: number, ranges: readonly Range[], draw: Draw) =>
  shape("Basic", kind, label, ratio, ranges, draw);

/** An arc of the box's own ellipse, between the points where two rays meet it. */
function arcOf(w: number, h: number, start: number, end: number) {
  const from = meet(w / 2, h / 2, w / 2, h / 2, start);
  const to = meet(w / 2, h / 2, w / 2, h / 2, end);
  const sweep = sweepOf(start, end);
  const outline = pen()
    .move(from.x, from.y)
    .arc(w / 2, h / 2, start, sweep);
  return { from, to, sweep, outline };
}

/** The box around such an arc and some points. */
function arcBox(w: number, h: number, start: number, sweep: number, points: readonly Point[]): Box {
  const meets = (degrees: number) => turn(degrees - start) <= sweep;
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return edges(
    meets(180) ? 0 : Math.min(...xs),
    meets(270) ? 0 : Math.min(...ys),
    meets(0) ? w : Math.max(...xs),
    meets(90) ? h : Math.max(...ys),
  );
}

/** The puffs of a cloud, each going on where the last one ended: radii, start and sweep in 1/60000 degrees. */
const PUFFS: readonly (readonly number[])[] = [
  [6753, 9190, -11429249, 7426832],
  [5333, 7267, -8646143, 5396714],
  [4365, 5945, -8748475, 5983381],
  [4857, 6595, -7859164, 7034504],
  [5333, 7273, -4722533, 6541615],
  [6775, 9220, -2776035, 7816140],
  [5785, 7867, 37501, 6842000],
  [6752, 9215, 1347096, 6910353],
  [7720, 10543, 3974558, 4542661],
  [4360, 5918, -16496525, 8804134],
  [4345, 5945, -14809710, 9151131],
];

/** The lines inside it: where each starts, then the same. */
const FOLDS: readonly (readonly number[])[] = [
  [4693, 26177, 4345, 5945, 5204520, 1585770],
  [6928, 34899, 4360, 5918, 4416628, 686848],
  [16478, 39090, 6752, 9215, 8257449, 844866],
  [28827, 34751, 6752, 9215, 387196, 959901],
  [34129, 22954, 5785, 7867, -4217541, 4255042],
  [41798, 15354, 5333, 7273, 1819082, 1665090],
  [38324, 5426, 4857, 6595, -824660, 891534],
  [29078, 3952, 4857, 6595, -8950887, 1091722],
  [22141, 4720, 4365, 5945, -9809656, 1061181],
  [14000, 5192, 6753, 9190, -4002417, 739161],
  [4127, 15789, 6753, 9190, 9459261, 711490],
];

function cloud(w: number, h: number): Drawing {
  const outline = grid(w, h, 43200).move(3900, 14370);
  for (const [rx, ry, start, sweep] of PUFFS) outline.arc(rx, ry, start / 60000, sweep / 60000);
  const folds = grid(w, h, 43200);
  for (const [x, y, rx, ry, start, sweep] of FOLDS) folds.move(x, y).arc(rx, ry, start / 60000, sweep / 60000);
  return {
    parts: [both(outline.close()), line(folds)],
    text: edges((w * 2977) / 21600, (h * 3262) / 21600, (w * 17087) / 21600, (h * 17337) / 21600),
  };
}

const BASIC = [
  basic("rect", "Rectangle", 1.4, [], (w, h) => ({ parts: [both(box(w, h))], text: edges(0, 0, w, h) })),
  basic("roundRect", "Rounded rectangle", 1.4, [half(0.16667)], (w, h, [a]) => {
    const r = Math.min(w, h) * a;
    const inset = r * ROUND_INSET;
    return {
      parts: [both(rounded(w, h, r))],
      text: edges(inset, inset, w - inset, h - inset),
      grips: [gripX(r, 0)],
    };
  }),
  basic("snip1Rect", "Cut corner", 1.4, [half(0.16667)], (w, h, [a]) => {
    const cut = Math.min(w, h) * a;
    return {
      parts: [both(poly([0, 0], [w - cut, 0], [w, cut], [w, h], [0, h]))],
      text: edges(0, cut / 2, w - cut / 2, h),
      grips: [gripX(w - cut, 0)],
    };
  }),
  basic("snip2DiagRect", "Cut diagonal corners", 1.4, [half(0), half(0.16667)], (w, h, [a1, a2]) => {
    const p = Math.min(w, h) * a1;
    const q = Math.min(w, h) * a2;
    const inset = Math.max(p, q) / 2;
    return {
      parts: [both(poly([p, 0], [w - q, 0], [w, q], [w, h - p], [w - p, h], [q, h], [0, h - q], [0, p]))],
      text: edges(inset, inset, w - inset, h - inset),
      grips: [gripX(p, 0), gripX(w - q, 0)],
    };
  }),
  basic("round2SameRect", "Rounded top corners", 1.4, [half(0.16667), half(0)], (w, h, [a1, a2]) => {
    const p = Math.min(w, h) * a1;
    const q = Math.min(w, h) * a2;
    const side = Math.max(p, q) * ROUND_INSET;
    const outline = pen()
      .move(p, 0)
      .line([w - p, 0])
      .arc(p, p, 270, 90)
      .line([w, h - q])
      .arc(q, q, 0, 90)
      .line([q, h])
      .arc(q, q, 90, 90)
      .line([0, p])
      .arc(p, p, 180, 90)
      .close();
    return {
      parts: [both(outline)],
      text: edges(side, p * ROUND_INSET, w - side, h - q * ROUND_INSET),
      grips: [gripX(w - p, 0), gripX(q, h)],
    };
  }),
  basic("ellipse", "Ellipse", 1, [], (w, h) => ({ parts: [both(oval(w, h))], text: inOval(w, h) })),
  basic("triangle", "Triangle", 1.15, [whole(0.5)], (w, h, [a]) => ({
    parts: [both(poly([0, h], [w * a, 0], [w, h]))],
    text: edges((w * a) / 2, h / 2, (w * a) / 2 + w / 2, h),
    grips: [gripX(w * a, 0)],
  })),
  basic("rtTriangle", "Right triangle", 1, [], (w, h) => ({
    parts: [both(poly([0, h], [0, 0], [w, h]))],
    text: edges(w / 12, (h * 7) / 12, (w * 7) / 12, (h * 11) / 12),
  })),
  basic("diamond", "Diamond", 1, [], (w, h) => ({
    parts: [both(diamond(w, h))],
    text: edges(w / 4, h / 4, (w * 3) / 4, (h * 3) / 4),
  })),
  basic("parallelogram", "Parallelogram", 1.35, [free(0.25)], (w, h, [a]) => {
    const x = Math.min(Math.min(w, h) * a, w);
    const inset = (1 + (5 * x) / w) / 12;
    return {
      parts: [both(poly([0, h], [x, 0], [w, 0], [w - x, h]))],
      text: edges(w * inset, h * inset, w * (1 - inset), h * (1 - inset)),
      grips: [gripX(x, 0)],
    };
  }),
  basic("trapezoid", "Trapezoid", 1.35, [free(0.25)], (w, h, [a]) => {
    const x = Math.min(Math.min(w, h) * a, w / 2);
    return {
      parts: [both(poly([0, h], [x, 0], [w - x, 0], [w, h]))],
      text: edges((x * 2) / 3, (h * x * 2) / (w * 3), w - (x * 2) / 3, h),
      grips: [gripX(x, 0)],
    };
  }),
  // The corners of these do not reach all sides of a box, so they are stretched until they do.
  basic("pentagon", "Pentagon", 1.05, [], (w, h) => {
    const rx = (w / 2) * 1.05146;
    const ry = (h / 2) * 1.10557;
    const x = rx * cos(54);
    return {
      parts: [both(around(spokes(5, -90, w / 2, ry, rx, ry)))],
      text: edges(w / 2 - x, (ry * (1 - sin(18)) * cos(54)) / cos(18), w / 2 + x, h),
    };
  }),
  basic("hexagon", "Hexagon", 1.15, [free(0.25)], (w, h, [a]) => {
    const x = Math.min(Math.min(w, h) * a, w / 2);
    const part = (x * 2) / w;
    const inset = (part > 0.5 ? 1 + 6 * part : 2 + 4 * part) / 24;
    return {
      parts: [both(poly([0, h / 2], [x, 0], [w - x, 0], [w, h / 2], [w - x, h], [x, h]))],
      text: edges(w * inset, h * inset, w * (1 - inset), h * (1 - inset)),
      grips: [gripX(x, 0)],
    };
  }),
  basic("heptagon", "Heptagon", 1.03, [], (w, h) => {
    const rx = (w / 2) * 1.02572;
    const ry = (h / 2) * 1.0521;
    const x = rx * cos(270 / 7);
    const y = ry * (1 - sin(270 / 7));
    return {
      parts: [both(around(spokes(7, -90, w / 2, ry, rx, ry)))],
      text: edges(w / 2 - x, y, w / 2 + x, h - y),
    };
  }),
  basic("octagon", "Octagon", 1, [half(0.29289)], (w, h, [a]) => {
    const x = Math.min(w, h) * a;
    return {
      parts: [both(poly([0, x], [x, 0], [w - x, 0], [w, x], [w, h - x], [w - x, h], [x, h], [0, h - x]))],
      text: edges(x / 2, x / 2, w - x / 2, h - x / 2),
      grips: [gripX(x, 0)],
    };
  }),
  basic("decagon", "Decagon", 1.05, [], (w, h) => {
    const ry = (h / 2) * 1.05146;
    const x = (w / 2) * cos(36);
    const y = ry * sin(36);
    return {
      parts: [both(around(spokes(10, 180, w / 2, h / 2, w / 2, ry)))],
      text: edges(w / 2 - x, h / 2 - y, w / 2 + x, h / 2 + y),
    };
  }),
  basic("dodecagon", "Dodecagon", 1, [], (w, h) => {
    const rx = w / 2 / cos(15);
    const ry = h / 2 / cos(15);
    const x = rx * cos(45);
    const y = ry * sin(45);
    return {
      parts: [both(around(spokes(12, 15, w / 2, h / 2, rx, ry)))],
      text: edges(w / 2 - x, h / 2 - y, w / 2 + x, h / 2 + y),
    };
  }),
  basic("plus", "Plus", 1, [half(0.25)], (w, h, [a]) => {
    const x = Math.min(w, h) * a;
    const outline = pen()
      .move(0, x)
      .line([x, x], [x, 0], [w - x, 0], [w - x, x], [w, x])
      .line([w, h - x], [w - x, h - x], [w - x, h], [x, h], [x, h - x], [0, h - x])
      .close();
    return {
      parts: [both(outline)],
      text: w > h ? edges(0, x, w, h - x) : edges(x, 0, w - x, h),
      grips: [gripX(x, 0)],
    };
  }),
  basic("can", "Cylinder", 0.75, [free(0.25)], (w, h, [a]) => {
    const rx = w / 2;
    const ry = Math.min((Math.min(w, h) * a) / 2, h / 4);
    const body = pen()
      .move(0, ry)
      .arc(rx, ry, 180, -180)
      .line([w, h - ry])
      .arc(rx, ry, 0, 180)
      .close();
    const lines = pen()
      .move(w, ry)
      .arc(rx, ry, 0, 360)
      .line([w, h - ry])
      .arc(rx, ry, 0, 180)
      .line([0, ry]);
    return {
      parts: [fill(body), fill(pen().oval(rx, ry, rx, ry), LIGHTER), line(lines)],
      text: edges(0, 2 * ry, w, h - ry),
      grips: [gripY(rx, 2 * ry)],
    };
  }),
  basic("cube", "Cube", 1, [whole(0.25)], (w, h, [a]) => {
    const s = Math.min(w, h) * a;
    const lines = poly([0, s], [s, 0], [w, 0], [w, h - s], [w - s, h], [0, h])
      .move(0, s)
      .line([w - s, s], [w, 0])
      .move(w - s, s)
      .line([w - s, h]);
    return {
      parts: [
        fill(poly([0, s], [w - s, s], [w - s, h], [0, h])),
        fill(poly([w - s, s], [w, 0], [w, h - s], [w - s, h]), DARK),
        fill(poly([0, s], [s, 0], [w, 0], [w - s, s]), LIGHT),
        line(lines),
      ],
      text: edges(0, s, w - s, h),
      grips: [gripY(0, s)],
    };
  }),
  basic("bevel", "Bevel", 1.2, [half(0.125)], (w, h, [a]) => {
    const x = Math.min(w, h) * a;
    const lines = box(w, h)
      .move(x, x)
      .line([w - x, x], [w - x, h - x], [x, h - x])
      .close()
      .move(0, 0)
      .line([x, x])
      .move(0, h)
      .line([x, h - x])
      .move(w, 0)
      .line([w - x, x])
      .move(w, h)
      .line([w - x, h - x]);
    return {
      parts: [
        fill(poly([x, x], [w - x, x], [w - x, h - x], [x, h - x])),
        fill(poly([0, 0], [w, 0], [w - x, x], [x, x]), LIGHT),
        fill(poly([0, h], [x, h - x], [w - x, h - x], [w, h]), DARK),
        fill(poly([0, 0], [x, x], [x, h - x], [0, h]), LIGHTER),
        fill(poly([w, 0], [w, h], [w - x, h - x], [w - x, x]), DARKER),
        line(lines),
      ],
      text: edges(x, x, w - x, h - x),
      grips: [gripX(x, 0)],
    };
  }),
  basic("donut", "Ring", 1, [half(0.25)], (w, h, [a]) => {
    const r = Math.min(w, h) * a;
    const outline = oval(w, h);
    if (a < 0.5) outline.oval(w / 2, h / 2, w / 2 - r, h / 2 - r, -360);
    return { parts: [holed(outline)], text: inOval(w, h), grips: [gripX(r, h / 2)] };
  }),
  basic("noSmoking", "Not allowed", 1, [half(0.1875)], (w, h, [a]) => {
    const r = Math.min(w, h) * a;
    const rx = w / 2 - r;
    const ry = h / 2 - r;
    const outline = oval(w, h);
    if (a < 0.5) {
      // The bar runs from corner to corner. Seen from the middle, half of it is `lean` wide.
      const bar = angleOf(w, h);
      const reach = meet(0, 0, rx, ry, bar);
      const lean = angleOf(Math.hypot(reach.x, reach.y), r / 2);
      for (const start of [bar - lean, bar - lean - 180]) {
        const { x, y } = meet(w / 2, h / 2, rx, ry, start);
        outline
          .move(x, y)
          .arc(rx, ry, start, 2 * lean - 180)
          .close();
      }
    }
    return { parts: [holed(outline)], text: inOval(w, h), grips: [gripX(r, h / 2)] };
  }),
  basic("blockArc", "Block arc", 1, [angle(180), angle(0), half(0.25)], (w, h, [start, end, a]) => {
    const r = Math.min(w, h) * a;
    const rx = w / 2 - r;
    const ry = h / 2 - r;
    const { from, to, sweep, outline } = arcOf(w, h, start, end);
    const inner = meet(w / 2, h / 2, rx, ry, end);
    outline.line([inner.x, inner.y]).arc(rx, ry, end, -sweep).close();
    return {
      parts: [both(outline)],
      text: arcBox(w, h, start, sweep, [from, to, inner, meet(w / 2, h / 2, rx, ry, start)]),
      grips: [gripTurn(from), gripTurn(inner), gripOut(inner, end)],
    };
  }),
  basic("pie", "Pie", 1, [angle(0), angle(270)], (w, h, [start, end]) => {
    const { from, to, outline } = arcOf(w, h, start, end);
    return {
      parts: [both(outline.line([w / 2, h / 2]).close())],
      text: inOval(w, h),
      grips: [gripTurn(from), gripTurn(to)],
    };
  }),
  basic("chord", "Chord", 1, [angle(45), angle(270)], (w, h, [start, end]) => {
    const { from, to, outline } = arcOf(w, h, start, end);
    return { parts: [both(outline.close())], text: inOval(w, h), grips: [gripTurn(from), gripTurn(to)] };
  }),
  basic("arc", "Arc", 1, [angle(270), angle(0)], (w, h, [start, end]) => {
    const { from, to, sweep, outline } = arcOf(w, h, start, end);
    return {
      parts: [line(outline)],
      text: arcBox(w, h, start, sweep, [from, to]),
      grips: [gripTurn(from), gripTurn(to)],
    };
  }),
  basic("teardrop", "Teardrop", 1, [between(1, 0, 2)], (w, h, [a]) => {
    const x = (w / 2) * (1 + a);
    const y = (h / 2) * (1 - a);
    const outline = pen()
      .move(0, h / 2)
      .arc(w / 2, h / 2, 180, 90)
      .bend((w / 2 + x) / 2, 0, x, y)
      .bend(w, (h / 2 + y) / 2, w, h / 2)
      .arc(w / 2, h / 2, 0, 180)
      .close();
    return { parts: [both(outline)], text: inOval(w, h), grips: [gripX(x, 0)] };
  }),
  basic("frame", "Frame", 1, [half(0.125)], (w, h, [a]) => {
    const x = Math.min(w, h) * a;
    const outline = box(w, h);
    if (a < 0.5) {
      outline
        .move(x, x)
        .line([x, h - x], [w - x, h - x], [w - x, x])
        .close();
    }
    return { parts: [holed(outline)], text: edges(x, x, w - x, h - x), grips: [gripX(x, 0)] };
  }),
  basic("halfFrame", "Half frame", 1, [free(0.33333), free(0.33333)], (w, h, [a1, a2]) => {
    const x = Math.min(Math.min(w, h) * a2, w);
    const y = Math.min(Math.min(w, h) * a1, h - (h * x) / w);
    return {
      parts: [both(poly([0, 0], [w, 0], [w - (y * w) / h, y], [x, y], [x, h - (x * h) / w], [0, h]))],
      text: edges(0, 0, w, h),
      grips: [gripY(0, y), gripX(x, 0)],
    };
  }),
  basic("corner", "L shape", 1, [free(0.5), free(0.5)], (w, h, [a1, a2]) => {
    const x = Math.min(Math.min(w, h) * a2, w);
    const y = h - Math.min(Math.min(w, h) * a1, h);
    return {
      parts: [both(poly([0, 0], [x, 0], [x, y], [w, y], [w, h], [0, h]))],
      text: w > h ? edges(0, y, w, h) : edges(0, 0, x, h),
      grips: [gripY(0, y), gripX(x, 0)],
    };
  }),
  basic("diagStripe", "Diagonal stripe", 1, [whole(0.5)], (w, h, [a]) => ({
    parts: [both(poly([0, h * a], [w * a, 0], [w, 0], [0, h]))],
    text: edges(0, 0, (w * a + w) / 2, (h * a + h) / 2),
    grips: [gripY(0, h * a)],
  })),
  basic("foldedCorner", "Folded corner", 1, [half(0.16667)], (w, h, [a]) => {
    const fold = Math.min(w, h) * a;
    const x = w - fold;
    const y = h - fold;
    const tip: Pair = [x + fold / 5, y + fold / 5];
    return {
      parts: [
        fill(poly([0, 0], [w, 0], [w, y], [x, h], [0, h])),
        fill(poly([x, h], tip, [w, y]), DARK),
        line(pen().move(x, h).line(tip, [w, y], [x, h], [0, h], [0, 0], [w, 0], [w, y])),
      ],
      text: edges(0, 0, w, y),
      grips: [gripX(x, h)],
    };
  }),
  basic("smileyFace", "Smiley face", 1, [between(0.04653, -0.04653, 0.04653)], (w, h, [a]) => {
    const eyes = grid(w, h, 21600).oval(7340, 7570, 1125, 1125).oval(14260, 7570, 1125, 1125);
    const lips = (h * 16515) / 21600;
    const mouth = pen()
      .move((w * 4969) / 21699, lips - h * a)
      .bend(w / 2, lips + 3 * h * a, (w * 16640) / 21600, lips - h * a);
    return {
      parts: [fill(oval(w, h)), { ...both(eyes), shade: DARK }, line(mouth), line(oval(w, h))],
      text: inOval(w, h),
      grips: [gripY(w / 2, lips + h * a)],
    };
  }),
  basic("heart", "Heart", 1, [], (w, h) => {
    const x = w / 2;
    const outline = pen()
      .move(x, h / 4)
      .curve(x + (w * 10) / 48, -h / 3, x + (w * 49) / 48, h / 4, x, h)
      .curve(x - (w * 49) / 48, h / 4, x - (w * 10) / 48, -h / 3, x, h / 4)
      .close();
    return { parts: [both(outline)], text: edges(w / 6, h / 4, (w * 5) / 6, (h * 2) / 3) };
  }),
  basic("lightningBolt", "Lightning bolt", 1, [], (w, h) => {
    const outline = grid(w, h, 21600)
      .move(8472, 0)
      .line([12860, 6080], [11050, 6797], [16577, 12007], [14767, 12877], [21600, 21600])
      .line([10012, 14915], [12222, 13987], [5022, 9705], [7602, 8382], [0, 3890])
      .close();
    return {
      parts: [both(outline)],
      text: edges((w * 8757) / 21600, (h * 7437) / 21600, (w * 13917) / 21600, (h * 14277) / 21600),
    };
  }),
  basic("sun", "Sun", 1, [between(0.25, 0.125, 0.46875)], (w, h, [a]) => {
    const r = 0.5 - a;
    const near = (0.5 - (r * 30274) / 32768) * 0.75;
    const far = (0.5 - (r * 12540) / 32768) * 0.75;
    const p = near + 0.03662;
    const q = far + 0.03662;
    const base = far + 0.125;
    const low = 3163 / 21600;
    const high = 18436 / 21600;
    const square = (r * 23170) / 32768;
    const outline = new Pen(w, h)
      .move(1, 0.5)
      .line([1 - near, 1 - base], [1 - near, base])
      .close()
      .move(high, low)
      .line([1 - p, q], [1 - q, p])
      .close()
      .move(0.5, 0)
      .line([1 - base, near], [base, near])
      .close()
      .move(low, low)
      .line([q, p], [p, q])
      .close()
      .move(0, 0.5)
      .line([near, base], [near, 1 - base])
      .close()
      .move(low, high)
      .line([p, 1 - q], [q, 1 - p])
      .close()
      .move(0.5, 1)
      .line([base, 1 - near], [1 - base, 1 - near])
      .close()
      .move(high, high)
      .line([1 - q, 1 - p], [1 - p, 1 - q])
      .close()
      .oval(0.5, 0.5, r, r);
    return {
      parts: [both(outline)],
      text: edges(w * (0.5 - square), h * (0.5 - square), w * (0.5 + square), h * (0.5 + square)),
      grips: [gripX(w * a, h / 2)],
    };
  }),
  basic("moon", "Moon", 0.5, [between(0.5, 0, 0.875)], (w, h, [a]) => {
    // Before it is stretched the hollow is a circle through both tips.
    const r = ((1 - a) ** 2 + 1) / (2 * (1 - a));
    const tip = angleOf((1 - a - r) * w, h / 2);
    const dy = (h / 2) * Math.sqrt(1 - (1 - (a * 9598) / 32768) ** 2);
    const outline = pen()
      .move(w, h)
      .arc(w, h / 2, 90, 180)
      .arc(r * w, (r * h) / 2, -tip, 2 * tip - 360)
      .close();
    return {
      parts: [both(outline)],
      text: edges((w * a * 9598) / 32768, h / 2 - dy, w * a, h / 2 + dy),
      grips: [gripX(w * a, h / 2)],
    };
  }),
  basic("cloud", "Cloud", 1.5, [], cloud),
  basic("gear6", "Gear", 1, [between(0.15, 0, 0.2), between(0.03526, 0, 0.05358)], (w, h, [a1, a2]) => {
    const tall = Math.min(w, h) * a1;
    const lean = Math.min(w, h) * a2;
    const rx = w / 2 - tall;
    const ry = h / 2 - tall;
    const wide = angleOf(Math.min(rx, ry), (tall + lean) / 2);
    const rim = (degrees: number): Point => ({ x: w / 2 + rx * cos(degrees), y: h / 2 + ry * sin(degrees) });
    const seen = (degrees: number) => angleOf(rx * cos(degrees), ry * sin(degrees));
    const outline = pen();
    for (let tooth = -30; tooth < 330; tooth += 60) {
      const a = rim(tooth - wide);
      const d = rim(tooth + wide);
      const length = Math.hypot(a.x - d.x, a.y - d.y) || 1;
      const u = { x: (a.x - d.x) / length, y: (a.y - d.y) / length };
      const top = (p: Point, by: number): Pair => [p.x + u.x * by - u.y * tall, p.y + u.y * by + u.x * tall];
      const start = seen(tooth + wide);
      if (tooth < 0) outline.move(a.x, a.y);
      outline.line(top(a, -lean), top(d, lean), [d.x, d.y]).arc(rx, ry, start, turn(seen(tooth + 60 - wide) - start));
    }
    const corner = rim(30 + wide);
    const left = rim(270 - wide);
    const right = rim(270 + wide);
    return {
      parts: [both(outline.close())],
      text: edges(w - corner.x, h - corner.y, corner.x, corner.y),
      grips: [gripY(right.x, right.y), gripX(left.x, left.y)],
    };
  }),
];

// ---------------------------------------------------------------- arrows

const arrow = (kind: string, label: string, ratio: number, ranges: readonly Range[], draw: Draw) =>
  shape("Arrows", kind, label, ratio, ranges, draw);

const rightArrow: Draw = (w, h, [a1, a2]) => {
  const head = Math.min(Math.min(w, h) * a2, w);
  const x = w - head;
  const top = (h * (1 - a1)) / 2;
  return {
    parts: [both(poly([0, top], [x, top], [x, 0], [w, h / 2], [x, h], [x, h - top], [0, h - top]))],
    text: edges(0, top, x + (top * head * 2) / h, h - top),
    grips: [gripY(0, top), gripX(x, 0)],
  };
};

const leftRightArrow: Draw = (w, h, [a1, a2]) => {
  const x = Math.min(Math.min(w, h) * a2, w / 2);
  const top = (h * (1 - a1)) / 2;
  const low = h - top;
  const side = x - (top * x * 2) / h;
  const outline = pen()
    .move(0, h / 2)
    .line([x, 0], [x, top], [w - x, top], [w - x, 0], [w, h / 2])
    .line([w - x, h], [w - x, low], [x, low], [x, h])
    .close();
  return {
    parts: [both(outline)],
    text: edges(side, top, w - side, low),
    grips: [gripY(w - x, top), gripX(x, 0)],
  };
};

const ARROWS = [
  arrow("rightArrow", "Right arrow", 2, [whole(0.5), free(0.5)], rightArrow),
  arrow("leftArrow", "Left arrow", 2, [whole(0.5), free(0.5)], mirrored(rightArrow)),
  arrow("upArrow", "Up arrow", 0.5, [whole(0.5), free(0.5)], turnedDown(mirrored(rightArrow))),
  arrow("downArrow", "Down arrow", 0.5, [whole(0.5), free(0.5)], turnedDown(rightArrow)),
  arrow("leftRightArrow", "Left and right arrow", 2.5, [whole(0.5), free(0.5)], leftRightArrow),
  arrow("upDownArrow", "Up and down arrow", 0.4, [whole(0.5), free(0.5)], turnedDown(leftRightArrow)),
  arrow("quadArrow", "Four-way arrow", 1, [whole(0.225), half(0.225), half(0.225)], (w, h, [a1, a2, a3]) => {
    const ss = Math.min(w, h);
    const x = ss * Math.min(a3, 0.5 - a2);
    const wide = ss * a2;
    const thin = Math.min((ss * a1) / 2, wide);
    const cx = w / 2;
    const cy = h / 2;
    const outline = pen()
      .move(0, cy)
      .line([x, cy - wide], [x, cy - thin], [cx - thin, cy - thin], [cx - thin, x], [cx - wide, x], [cx, 0])
      .line([cx + wide, x], [cx + thin, x], [cx + thin, cy - thin], [w - x, cy - thin], [w - x, cy - wide], [w, cy])
      .line([w - x, cy + wide], [w - x, cy + thin], [cx + thin, cy + thin], [cx + thin, h - x], [cx + wide, h - x])
      .line([cx, h], [cx - wide, h - x], [cx - thin, h - x], [cx - thin, cy + thin], [x, cy + thin], [x, cy + wide])
      .close();
    const side = wide > 0 ? (thin * x) / wide : 0;
    return {
      parts: [both(outline)],
      text: edges(side, cy - thin, w - side, cy + thin),
      grips: [gripX(cx - thin, x), gripX(cx - wide, 0), gripY(w, x)],
    };
  }),
  arrow("bentArrow", "Bent arrow", 1, [whole(0.25), half(0.25), half(0.25), free(0.4375)], (w, h, [a1, a2, a3, a4]) => {
    const ss = Math.min(w, h);
    const thick = ss * Math.min(a1, 2 * a2);
    const wing = ss * a2 - thick / 2;
    const x = w - ss * a3;
    const low = wing + thick;
    const bend = Math.min(ss * a4, x, h - wing);
    const inner = Math.max(bend - thick, 0);
    const outline = pen()
      .move(0, h)
      .line([0, wing + bend])
      .arc(bend, bend, 180, 90)
      .line([x, wing], [x, 0], [w, ss * a2], [x, low + wing], [x, low], [thick + inner, low])
      .arc(inner, inner, 270, -90)
      .line([thick, h])
      .close();
    return {
      parts: [both(outline)],
      text: edges(0, 0, w, h),
      grips: [gripX(thick, h), gripY(x, low + wing), gripX(x, 0), gripX(bend, 0)],
    };
  }),
  arrow(
    "uturnArrow",
    "U-turn arrow",
    1,
    [whole(0.25), between(0.25, 0, 0.25), free(0.25), free(0.4375), whole(0.75)],
    (w, h, [a1, a2, a3, a4, a5]) => {
      const ss = Math.min(w, h);
      const thick = ss * Math.min(a1, 2 * a2);
      const wing = ss * a2 - thick / 2;
      const head = Math.min(ss * a3, h - thick);
      const tip = pin(head + thick, h * a5, h);
      const neck = tip - head;
      const right = w - wing;
      const bend = Math.min(ss * a4, right / 2, neck);
      const inner = Math.max(bend - thick, 0);
      const left = w - 2 * ss * a2;
      const outline = pen()
        .move(0, h)
        .line([0, bend])
        .arc(bend, bend, 180, 90)
        .line([right - bend, 0])
        .arc(bend, bend, 270, 90)
        .line([right, neck], [w, neck], [w - ss * a2, tip], [left, neck], [right - thick, neck])
        .line([right - thick, thick + inner])
        .arc(inner, inner, 0, -90)
        .line([thick + inner, thick])
        .arc(inner, inner, 270, -90)
        .line([thick, h])
        .close();
      return {
        parts: [both(outline)],
        text: edges(0, 0, w, h),
        grips: [gripX(thick, h), gripX(left, h), gripY(left, neck), gripX(bend, 0), gripY(w, tip)],
      };
    },
  ),
  arrow("curvedRightArrow", "Curved arrow", 0.6, [free(0.25), free(0.5), free(0.25)], (w, h, [a1, a2, a3]) => {
    const ss = Math.min(w, h);
    const wide = Math.min(ss * a2, h / 2);
    const thick = Math.min(ss * a1, wide);
    const ry = h / 2 - (thick + wide) / 4;
    // Where the two edges of the band cross: the head ends before it.
    const cross = (w * Math.sqrt(4 * ry * ry - thick * thick)) / (2 * ry);
    const head = Math.min(ss * a3, cross);
    const low = ry + thick;
    const dy = (ry * Math.sqrt(w * w - head * head)) / w;
    const wing = (wide - thick) / 2;
    const x = w - head;
    const sweep = angleOf(head, dy);
    const hidden = angleOf(cross, thick / 2);
    const band = () =>
      pen()
        .move(0, ry)
        .arc(w, ry, 180, -sweep)
        .line([x, ry + dy - wing], [w, h - wide / 2], [x, low + dy + wing], [x, low + dy])
        .arc(w, ry, 180 - sweep, sweep);
    const back = pen()
      .move(w, thick)
      .arc(w, ry, 270, hidden - 90)
      .arc(w, ry, 180 - hidden, 90 + hidden)
      .close();
    const lines = band()
      .line([0, ry])
      .arc(w, ry, 180, 90)
      .line([w, thick])
      .arc(w, ry, 270, hidden - 90);
    return {
      parts: [fill(band().close()), fill(back, DARK), line(lines)],
      text: edges(0, 0, w, h),
      grips: [gripY(w, thick), gripY(w, ry + dy - wing), gripX(x, h)],
    };
  }),
  arrow("stripedRightArrow", "Striped arrow", 2, [whole(0.5), free(0.5)], (w, h, [a1, a2]) => {
    const step = Math.min(w, h) / 32;
    const head = Math.min(Math.min(w, h) * a2, (w * 27) / 32);
    const x = w - head;
    const top = (h * (1 - a1)) / 2;
    const low = h - top;
    const outline = poly([0, top], [step, top], [step, low], [0, low])
      .move(2 * step, top)
      .line([4 * step, top], [4 * step, low], [2 * step, low])
      .close()
      .move(5 * step, top)
      .line([x, top], [x, 0], [w, h / 2], [x, h], [x, low], [5 * step, low])
      .close();
    return {
      parts: [both(outline)],
      text: edges(5 * step, top, w - head * a1, low),
      grips: [gripY(0, top), gripX(x, 0)],
    };
  }),
  arrow("notchedRightArrow", "Notched arrow", 2, [whole(0.5), free(0.5)], (w, h, [a1, a2]) => {
    const head = Math.min(Math.min(w, h) * a2, w);
    const x = w - head;
    const top = (h * (1 - a1)) / 2;
    const low = h - top;
    const notch = head * a1;
    return {
      parts: [both(poly([0, top], [x, top], [x, 0], [w, h / 2], [x, h], [x, low], [0, low], [notch, h / 2]))],
      text: edges(notch, top, w - notch, low),
      grips: [gripY(w, top), gripX(x, 0)],
    };
  }),
  arrow("homePlate", "Pentagon arrow", 2, [free(0.5)], (w, h, [a]) => {
    const x = w - Math.min(Math.min(w, h) * a, w);
    return {
      parts: [both(poly([0, 0], [x, 0], [w, h / 2], [x, h], [0, h]))],
      text: edges(0, 0, (x + w) / 2, h),
      grips: [gripX(x, 0)],
    };
  }),
  arrow("chevron", "Chevron", 1, [free(0.5)], (w, h, [a]) => {
    const notch = Math.min(Math.min(w, h) * a, w);
    const x = w - notch;
    return {
      parts: [both(poly([0, 0], [x, 0], [w, h / 2], [x, h], [0, h], [notch, h / 2]))],
      text: x > notch ? edges(notch, 0, x, h) : edges(0, 0, w, h),
      grips: [gripX(x, 0)],
    };
  }),
  arrow(
    "rightArrowCallout",
    "Arrow callout",
    1.2,
    [free(0.25), free(0.25), free(0.25), whole(0.64977)],
    (w, h, [a1, a2, a3, a4]) => {
      const ss = Math.min(w, h);
      const wide = Math.min(ss * a2, h / 2);
      const thin = Math.min((ss * a1) / 2, wide);
      const x = w - Math.min(ss * a3, w);
      const right = Math.min(w * a4, x);
      const cy = h / 2;
      const outline = pen()
        .move(0, 0)
        .line([right, 0], [right, cy - thin], [x, cy - thin], [x, cy - wide], [w, cy])
        .line([x, cy + wide], [x, cy + thin], [right, cy + thin], [right, h], [0, h])
        .close();
      return {
        parts: [both(outline)],
        text: edges(0, 0, right, h),
        grips: [gripY(x, cy - thin), gripY(w, cy - wide), gripX(x, 0), gripX(right, h)],
      };
    },
  ),
  arrow(
    "circularArrow",
    "Circular arrow",
    1,
    [half(0.125), angle(1142319 / 60000), angle(20457681 / 60000), angle(180), between(0.125, 0, 0.25)],
    (w, h, [a1, a2, end, start, a5]) => {
      const ss = Math.min(w, h);
      const wing = ss * a5;
      const thick = ss * Math.min(a1, 2 * a5);
      // A band between two ellipses. The middle of the head's base runs on one halfway.
      const [rx, ry] = [w / 2 - wing, h / 2 - wing];
      const [rx1, ry1] = [rx + thick / 2, ry + thick / 2];
      const [rx2, ry2] = [Math.max(rx - thick / 2, ss * 1e-6), Math.max(ry - thick / 2, ss * 1e-6)];
      const base = meet(0, 0, rx, ry, end);
      // The base may turn until it only just meets the inside of the band.
      const most = Math.asin(Math.min(1, Math.min(rx2, ry2) / Math.hypot(base.x, base.y))) * (180 / Math.PI);
      const head = Math.min(a2, most);
      const [dx, dy] = [cos(end + head), sin(end + head)];
      const along = (t: number): Point => ({ x: base.x + dx * t, y: base.y + dy * t });
      const tip = meet(0, 0, rx, ry, end + head);
      const onEllipse = (ax: number, ay: number, near: number) => {
        const a = (dx / ax) ** 2 + (dy / ay) ** 2;
        const b = (base.x * dx) / ax ** 2 + (base.y * dy) / ay ** 2;
        const c = (base.x / ax) ** 2 + (base.y / ay) ** 2 - 1;
        const root = Math.sqrt(Math.max(0, b * b - a * c));
        const [t1, t2] = [(-b + root) / a, (-b - root) / a];
        return Math.abs(t1 - near) < Math.abs(t2 - near) ? t1 : t2;
      };
      const t1 = onEllipse(rx1, ry1, wing);
      const t2 = onEllipse(rx2, ry2, -wing);
      const [outside, inside] = [along(t1), along(t2)];
      const winged = Math.abs(t1 - t2) / 2 <= wing;
      const [left, right] = winged ? [along(wing), along(-wing)] : [outside, inside];
      const tail = meet(0, 0, rx1, ry1, start);
      const back = angleOf(inside.x, inside.y);
      const [cx, cy] = [w / 2, h / 2];
      const pair = ({ x, y }: Point): Pair => [cx + x, cy + y];
      const at = ({ x, y }: Point): Point => ({ x: cx + x, y: cy + y });
      const outline = pen()
        .move(...pair(tail))
        .arc(rx1, ry1, start, sweepOf(start, angleOf(outside.x, outside.y)))
        .line(pair(left), pair(tip), pair(right), pair(inside))
        .arc(rx2, ry2, back, -turn(back - start))
        .close();
      const [tx, ty] = [rx1 * Math.SQRT1_2, ry1 * Math.SQRT1_2];
      return {
        parts: [both(outline)],
        text: edges(cx - tx, cy - ty, cx + tx, cy + ty),
        grips: [
          gripOut(at(meet(0, 0, rx2, ry2, start)), start),
          gripTurn(at(tip), end, most),
          gripTurn(at(base)),
          gripTurn(at(tail)),
          gripOut(at(along(-wing)), end),
        ],
      };
    },
  ),
];

// ---------------------------------------------------------------- stars and banners

const banner = (kind: string, label: string, ratio: number, ranges: readonly Range[], draw: Draw) =>
  shape("Stars and banners", kind, label, ratio, ranges, draw);

/**
 * `room` is how far text reaches to the sides, up and down, as part of the inner radius; `stretch` makes
 * stars fill the box whose points do not reach all its sides.
 */
const star = (count: number, inner: number, room: readonly number[], stretch: Pair = [1, 1]) =>
  banner(`star${count}`, `${count}-point star`, 1, [half(inner)], (w, h, [a]) => {
    const rx = (w / 2) * stretch[0];
    const ry = (h / 2) * stretch[1];
    const [side, up, down] = room.map((part) => part * 2 * a);
    const x = Math.max(0, w / 2 - rx * side);
    return {
      parts: [both(around(spokes(2 * count, -90, w / 2, ry, rx, ry, 2 * a)))],
      text: edges(x, ry * (1 - up), w - x, Math.min(h, ry * (1 + down))),
      grips: [gripY(w / 2, ry * (1 - 2 * a))],
    };
  });

const SQUARE = [Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2];

const ribbon: Draw = (w, h, [a1, a2]) => {
  const left = (w * (1 - a2)) / 2;
  const right = w - left;
  const curl = w / 32;
  const ry = (h * a1) / 4;
  const y1 = (h * a1) / 2;
  const y2 = h * a1;
  const y4 = h - y2;
  const foldLeft = left + w / 8;
  const foldRight = right - w / 8;
  const outline = () =>
    pen()
      .move(0, 0)
      .line([foldLeft - curl, 0])
      .arc(curl, ry, 270, 180)
      .line([left + curl, y1])
      .arc(curl, ry, 270, -180)
      .line([right - curl, y2])
      .arc(curl, ry, 90, -180)
      .line([foldRight + curl, y1])
      .arc(curl, ry, 90, 180)
      .line([w, 0], [w - w / 8, y4 / 2], [w, y4], [right, y4], [right, h - ry])
      .arc(curl, ry, 0, 90)
      .line([left + curl, h])
      .arc(curl, ry, 90, 90)
      .line([left, y4], [0, y4], [w / 8, y4 / 2])
      .close();
  const folds = pen()
    .move(foldLeft, ry)
    .arc(curl, ry, 0, 90)
    .line([left + curl, y1])
    .arc(curl, ry, 270, -180)
    .line([foldLeft, y2])
    .close()
    .move(foldRight, ry)
    .arc(curl, ry, 180, -90)
    .line([right - curl, y1])
    .arc(curl, ry, 270, 180)
    .line([foldRight, y2])
    .close();
  const lines = outline()
    .move(foldLeft, ry)
    .line([foldLeft, y2])
    .move(foldRight, y2)
    .line([foldRight, ry])
    .move(left, y4)
    .line([left, y2 - ry])
    .move(right, y2 - ry)
    .line([right, y4]);
  return {
    parts: [fill(outline()), fill(folds, DARK), line(lines)],
    text: edges(left, y2, right, h),
    grips: [gripY(w / 2, y2), gripX(left, 0)],
  };
};

/** Top and bottom edge run in `count` waves, the top one shifted against the bottom one. */
const waves =
  (count: number): Draw =>
  (w, h, [a1, a2]) => {
    const shift = 2 * w * a2;
    const top = { from: Math.max(0, -shift), to: w - Math.max(0, shift) };
    const low = { from: Math.max(0, shift), to: w + Math.min(0, shift) };
    const y = h * a1;
    const swing = (y * 10) / 3;
    const outline = pen().move(top.from, y);
    const step = (top.to - top.from) / count;
    for (let i = 0; i < count; i += 1) {
      const x = top.from + i * step;
      outline.curve(x + step / 3, y - swing, x + (step * 2) / 3, y + swing, x + step, y);
    }
    outline.line([low.to, h - y]);
    for (let i = 0; i < count; i += 1) {
      const x = low.to - i * step;
      outline.curve(x - step / 3, h - y + swing, x - (step * 2) / 3, h - y - swing, x - step, h - y);
    }
    return {
      parts: [both(outline.close())],
      text: edges(Math.max(top.from, low.from), 2 * y, Math.min(top.to, low.to), h - 2 * y),
      grips: [gripY(0, y), gripX(w / 2 + w * a2, h)],
    };
  };

const STARS = [
  star(4, 0.125, SQUARE),
  star(5, 0.19098, [cos(18), sin(54), 1], [1.05146, 1.10557]),
  star(6, 0.28868, [1, sin(60), sin(60)], [1.1547, 1]),
  star(7, 0.34601, [cos(270 / 7), cos(180 / 7), sin(270 / 7)], [1.02572, 1.0521]),
  star(8, 0.375, [cos(22.5), cos(22.5), cos(22.5)]),
  star(10, 0.42533, [cos(36), sin(36), sin(36)], [1.05146, 1]),
  star(12, 0.375, SQUARE),
  star(16, 0.375, SQUARE),
  star(24, 0.375, SQUARE),
  banner("irregularSeal1", "Explosion", 1.1, [], (w, h) => {
    const outline = grid(w, h, 21600)
      .move(10800, 5800)
      .line([14522, 0], [14155, 5325], [18380, 4457], [16702, 7315], [21097, 8137], [17607, 10475], [21600, 13290])
      .line([16837, 12942], [18145, 18095], [14020, 14457], [13247, 19737], [10532, 14935], [8485, 21600])
      .line([7715, 15627], [4762, 17617], [5667, 13937], [135, 14587], [3722, 11775], [0, 8615], [4627, 7617])
      .line([370, 2295], [7312, 6320], [8352, 2295])
      .close();
    return {
      parts: [both(outline)],
      text: edges((w * 4627) / 21600, (h * 6320) / 21600, (w * 16702) / 21600, (h * 13937) / 21600),
    };
  }),
  banner("ribbon", "Down ribbon", 2, [between(0.16667, 0, 0.33333), between(0.5, 0.25, 0.75)], ribbon),
  banner("ribbon2", "Up ribbon", 2, [between(0.16667, 0, 0.33333), between(0.5, 0.25, 0.75)], upsideDown(ribbon)),
  banner("wave", "Wave", 2, [between(0.125, 0, 0.2), between(0, -0.1, 0.1)], waves(1)),
  banner("doubleWave", "Double wave", 2, [between(0.0625, 0, 0.125), between(0, -0.1, 0.1)], waves(2)),
];

// ---------------------------------------------------------------- callouts

const callout = (kind: string, label: string, ratio: number, ranges: readonly Range[], draw: Draw) =>
  shape("Callouts", kind, label, ratio, ranges, draw);

/** Where the tail ends, counted from the middle. */
const TAIL = [place(-0.20833), place(0.625)];

const tailGrips = (w: number, h: number, a1: number, a2: number): Grip[] => {
  const [x, y] = [w * (0.5 + a1), h * (0.5 + a2)];
  return [gripX(x, y), gripY(x, y)];
};

/** A box with round corners and a tail. */
function bubble(w: number, h: number, r: number, a1: number, a2: number): ShapePart {
  // A tail that ends inside does not show.
  if (Math.max(Math.abs(a1), Math.abs(a2)) <= 0.5) return both(rounded(w, h, r));
  // Drawn with the tail on top, then turned to the side it belongs to.
  const upright = Math.abs(a2) > Math.abs(a1);
  const [long, deep] = upright ? [w, h] : [h, w];
  const [side, out] = upright ? [a1, a2] : [a2, a1];
  const outline = pen().move(0, r);
  // On along the top, where the base of the tail can lie on a corner.
  const go = (from: number, to: number) => {
    const bend = (x: number) => Math.acos(pin(-1, 1 - x / r, 1)) * (180 / Math.PI);
    if (from < r) outline.arc(r, r, 180 + bend(from), bend(Math.min(to, r)) - bend(from));
    if (to > r && from < long - r) outline.line([Math.min(to, long - r), 0]);
    if (to > long - r) {
      const left = bend(long - Math.max(from, long - r));
      outline.arc(r, r, 360 - left, left - bend(long - to));
    }
  };
  const top = (x: number) => {
    const corner = r - Math.min(x, long - x, r);
    return r - Math.sqrt(r * r - corner * corner);
  };
  const first = (long * (side > 0 ? 7 : 2)) / 12;
  const last = (long * (side > 0 ? 10 : 5)) / 12;
  go(0, first);
  outline.line([long * (0.5 + side), deep * (0.5 - Math.abs(out))], [last, top(last)]);
  go(last, long);
  outline
    .line([long, deep - r])
    .arc(r, r, 0, 90)
    .line([r, deep])
    .arc(r, r, 90, 90)
    .close();
  const path = movePath(outline.path, ({ x, y }) => {
    const turned = out > 0 ? deep - y : y;
    return upright ? { x, y: turned } : { x: turned, y: x };
  });
  return { path, paint: "both" };
}

const CALLOUTS = [
  callout("wedgeRectCallout", "Speech bubble", 1.5, TAIL, (w, h, [a1, a2]) => ({
    parts: [bubble(w, h, 0, a1, a2)],
    text: edges(0, 0, w, h),
    grips: tailGrips(w, h, a1, a2),
  })),
  callout("wedgeRoundRectCallout", "Rounded speech bubble", 1.5, [...TAIL, half(0.16667)], (w, h, [a1, a2, a3]) => {
    const r = Math.min(w, h) * a3;
    const inset = r * ROUND_INSET;
    return {
      parts: [bubble(w, h, r, a1, a2)],
      text: edges(inset, inset, w - inset, h - inset),
      grips: [...tailGrips(w, h, a1, a2), gripX(r, 0)],
    };
  }),
  callout("wedgeEllipseCallout", "Oval speech bubble", 1.5, TAIL, (w, h, [a1, a2]) => {
    const rim = (degrees: number): Pair => [(w / 2) * cos(degrees), (h / 2) * sin(degrees)];
    const middle = angleOf(a1, a2);
    const [x, y] = rim(middle + 11);
    const start = angleOf(x, y);
    const tailed = () =>
      pen()
        .move(w * (0.5 + a1), h * (0.5 + a2))
        .line([w / 2 + x, h / 2 + y])
        .arc(w / 2, h / 2, start, sweepOf(start, angleOf(...rim(middle - 11))))
        .close();
    // A tail that ends inside does not show.
    const outline = Math.hypot(a1, a2) > 0.5 ? tailed() : oval(w, h);
    return { parts: [both(outline)], text: inOval(w, h), grips: tailGrips(w, h, a1, a2) };
  }),
  callout("cloudCallout", "Thought bubble", 1.5, TAIL, (w, h, [a1, a2]) => {
    const { parts, text } = cloud(w, h);
    const unit = Math.min(w, h) / 21600;
    const [x, y] = [w * (0.5 + a1), h * (0.5 + a2)];
    const rim = meet(w / 2, h / 2, w / 2, h / 2, angleOf(w * a1, h * a2));
    const length = Math.hypot(rim.x - x, rim.y - y);
    const [dx, dy] = length > 0 ? [(rim.x - x) / length, (rim.y - y) / length] : [0, 0];
    const step = (length - 6600 * unit) / 3;
    const puff = (far: number, r: number) => both(pen().oval(x + dx * far, y + dy * far, r * unit, r * unit));
    const puffs = [puff(2 * step + 4800 * unit, 1800), puff(step + 1800 * unit, 1200), puff(0, 600)];
    return { parts: [...parts, ...puffs], text, grips: tailGrips(w, h, a1, a2) };
  }),
  callout(
    "borderCallout1",
    "Line callout",
    1.5,
    [place(0.1875), place(-0.08333), place(1.125), place(-0.38333)],
    (w, h, [y1, x1, y2, x2]) => {
      const [x, y, endX, endY] = [w * x1, h * y1, w * x2, h * y2];
      return {
        parts: [both(box(w, h)), line(pen().move(x, y).line([endX, endY]))],
        text: edges(0, 0, w, h),
        grips: [gripY(x, y), gripX(x, y), gripY(endX, endY), gripX(endX, endY)],
      };
    },
  ),
];

// ---------------------------------------------------------------- flowchart

const flow = (kind: string, label: string, ratio: number, draw: (w: number, h: number) => Drawing) =>
  shape("Flowchart", `flowChart${kind}`, label, ratio, [], draw);

const middle = (w: number, h: number) => edges(w / 4, h / 4, (w * 3) / 4, (h * 3) / 4);
const slope = (w: number, h: number) => edges(w / 5, 0, (w * 4) / 5, h);

const FLOWCHART = [
  flow("Process", "Process", 1.5, (w, h) => ({ parts: [both(box(w, h))], text: edges(0, 0, w, h) })),
  flow("AlternateProcess", "Alternate process", 1.5, (w, h) => {
    const r = Math.min(w, h) / 6;
    const inset = r * ROUND_INSET;
    return { parts: [both(rounded(w, h, r))], text: edges(inset, inset, w - inset, h - inset) };
  }),
  flow("Decision", "Decision", 1.5, (w, h) => ({ parts: [both(diamond(w, h))], text: middle(w, h) })),
  flow("InputOutput", "Input or output", 1.5, (w, h) => ({
    parts: [both(poly([0, h], [w / 5, 0], [w, 0], [(w * 4) / 5, h]))],
    text: slope(w, h),
  })),
  flow("PredefinedProcess", "Predefined process", 1.5, (w, h) => {
    const lines = box(w, h)
      .move(w / 8, 0)
      .line([w / 8, h])
      .move((w * 7) / 8, 0)
      .line([(w * 7) / 8, h]);
    return { parts: [fill(box(w, h)), line(lines)], text: edges(w / 8, 0, (w * 7) / 8, h) };
  }),
  flow("InternalStorage", "Internal storage", 1.5, (w, h) => {
    const lines = box(w, h)
      .move(w / 8, 0)
      .line([w / 8, h])
      .move(0, h / 8)
      .line([w, h / 8]);
    return { parts: [fill(box(w, h)), line(lines)], text: edges(w / 8, h / 8, w, h) };
  }),
  flow("Document", "Document", 1.5, (w, h) => {
    const outline = grid(w, h, 21600)
      .move(0, 0)
      .line([21600, 0], [21600, 17322])
      .curve(10800, 17322, 10800, 23922, 0, 20172)
      .close();
    return { parts: [both(outline)], text: edges(0, 0, w, (h * 17322) / 21600) };
  }),
  flow("Multidocument", "Multiple documents", 1.4, (w, h) => {
    const sheets = grid(w, h, 21600)
      .move(0, 20782)
      .curve(9298, 23542, 9298, 18022, 18595, 18022)
      .line([18595, 3675], [0, 3675])
      .close()
      .move(1532, 3675)
      .line([1532, 1815], [20000, 1815], [20000, 16252])
      .curve(19298, 16252, 18595, 16352, 18595, 16352)
      .line([18595, 3675])
      .close()
      .move(2972, 1815)
      .line([2972, 0], [21600, 0], [21600, 14392])
      .curve(20800, 14392, 20000, 14467, 20000, 14467)
      .line([20000, 1815])
      .close();
    const lines = grid(w, h, 21600)
      .move(0, 3675)
      .line([18595, 3675], [18595, 18022])
      .curve(9298, 18022, 9298, 23542, 0, 20782)
      .close()
      .move(1532, 3675)
      .line([1532, 1815], [20000, 1815], [20000, 16252])
      .curve(19298, 16252, 18595, 16352, 18595, 16352)
      .move(2972, 1815)
      .line([2972, 0], [21600, 0], [21600, 14392])
      .curve(20800, 14392, 20000, 14467, 20000, 14467);
    return {
      parts: [fill(sheets), line(lines)],
      text: edges(0, (h * 3675) / 21600, (w * 18595) / 21600, (h * 20782) / 21600),
    };
  }),
  flow("Terminator", "Start or end", 3, (w, h) => {
    const outline = grid(w, h, 21600)
      .move(3475, 0)
      .line([18125, 0])
      .arc(3475, 10800, 270, 180)
      .line([3475, 21600])
      .arc(3475, 10800, 90, 180)
      .close();
    return {
      parts: [both(outline)],
      text: edges((w * 1018) / 21600, (h * 3163) / 21600, (w * 20582) / 21600, (h * 18437) / 21600),
    };
  }),
  flow("Preparation", "Preparation", 1.75, (w, h) => ({
    parts: [both(poly([0, h / 2], [w / 5, 0], [(w * 4) / 5, 0], [w, h / 2], [(w * 4) / 5, h], [w / 5, h]))],
    text: slope(w, h),
  })),
  flow("ManualInput", "Manual input", 2, (w, h) => ({
    parts: [both(poly([0, h / 5], [w, 0], [w, h], [0, h]))],
    text: edges(0, h / 5, w, h),
  })),
  flow("ManualOperation", "Manual operation", 1.5, (w, h) => ({
    parts: [both(poly([0, 0], [w, 0], [(w * 4) / 5, h], [w / 5, h]))],
    text: slope(w, h),
  })),
  flow("Connector", "Connector", 1, (w, h) => ({ parts: [both(oval(w, h))], text: inOval(w, h) })),
  flow("OffpageConnector", "Off-page connector", 1, (w, h) => ({
    parts: [both(poly([0, 0], [w, 0], [w, (h * 4) / 5], [w / 2, h], [0, (h * 4) / 5]))],
    text: edges(0, 0, w, (h * 4) / 5),
  })),
  flow("PunchedTape", "Punched tape", 1.2, (w, h) => {
    const outline = grid(w, h, 20)
      .move(0, 2)
      .arc(5, 2, 180, -180)
      .arc(5, 2, 180, 180)
      .line([20, 18])
      .arc(5, 2, 0, -180)
      .arc(5, 2, 0, 180)
      .close();
    return { parts: [both(outline)], text: edges(0, h / 5, w, (h * 4) / 5) };
  }),
  flow("SummingJunction", "Summing junction", 1, (w, h) => {
    const { x, y } = inOval(w, h);
    const lines = oval(w, h)
      .move(x, y)
      .line([w - x, h - y])
      .move(w - x, y)
      .line([x, h - y]);
    return { parts: [fill(oval(w, h)), line(lines)], text: inOval(w, h) };
  }),
  flow("Or", "Or", 1, (w, h) => {
    const lines = oval(w, h)
      .move(w / 2, 0)
      .line([w / 2, h])
      .move(0, h / 2)
      .line([w, h / 2]);
    return { parts: [fill(oval(w, h)), line(lines)], text: inOval(w, h) };
  }),
  flow("Collate", "Collate", 0.5, (w, h) => ({
    parts: [both(poly([0, 0], [w, 0], [w / 2, h / 2], [w, h], [0, h], [w / 2, h / 2]))],
    text: middle(w, h),
  })),
  flow("Sort", "Sort", 0.5, (w, h) => {
    const lines = diamond(w, h)
      .move(0, h / 2)
      .line([w, h / 2]);
    return { parts: [fill(diamond(w, h)), line(lines)], text: middle(w, h) };
  }),
  flow("Extract", "Extract", 1, (w, h) => ({
    parts: [both(poly([0, h], [w / 2, 0], [w, h]))],
    text: edges(w / 4, h / 2, (w * 3) / 4, h),
  })),
  flow("Merge", "Merge", 1, (w, h) => ({
    parts: [both(poly([0, 0], [w, 0], [w / 2, h]))],
    text: edges(w / 4, 0, (w * 3) / 4, h / 2),
  })),
  flow("OnlineStorage", "Stored data", 1.5, (w, h) => {
    const outline = grid(w, h, 6).move(1, 0).line([6, 0]).arc(1, 3, 270, -180).line([1, 6]).arc(1, 3, 90, 180).close();
    return { parts: [both(outline)], text: edges(w / 6, 0, (w * 5) / 6, h) };
  }),
  flow("Delay", "Delay", 1, (w, h) => {
    const outline = pen()
      .move(0, 0)
      .line([w / 2, 0])
      .arc(w / 2, h / 2, 270, 180)
      .line([0, h])
      .close();
    const { y } = inOval(w, h);
    return { parts: [both(outline)], text: edges(0, y, (w / 2) * (1 + Math.SQRT1_2), h - y) };
  }),
  flow("MagneticDisk", "Database", 1, (w, h) => {
    const side = () => grid(w, h, 6).move(0, 1).arc(3, 1, 180, 180).line([6, 5]).arc(3, 1, 0, 180).close();
    return {
      parts: [fill(side()), line(side().move(6, 1).arc(3, 1, 0, 180))],
      text: edges(0, h / 3, w, (h * 5) / 6),
    };
  }),
  flow("Display", "Display", 1.5, (w, h) => {
    const outline = grid(w, h, 6).move(0, 3).line([1, 0], [5, 0]).arc(1, 3, 270, 180).line([1, 6]).close();
    return { parts: [both(outline)], text: edges(w / 6, 0, (w * 5) / 6, h) };
  }),
];

// ---------------------------------------------------------------- brackets

const bracket = (kind: string, label: string, ratio: number, ranges: readonly Range[], draw: Draw) =>
  shape("Brackets", kind, label, ratio, ranges, draw);

const leftBracket: Draw = (w, h, [a]) => {
  const y = Math.min(Math.min(w, h) * a, h / 2);
  const outline = () => pen().move(w, h).arc(w, y, 90, 90).line([0, y]).arc(w, y, 180, 90);
  const inset = y * ROUND_INSET;
  return {
    parts: [fill(outline().close()), line(outline())],
    text: edges(w * ROUND_INSET, inset, w, h - inset),
    grips: [gripY(0, y)],
  };
};

const leftBrace: Draw = (w, h, [a1, a2]) => {
  const x = w / 2;
  const y = Math.min(Math.min(w, h) * a1, (Math.min(a2, 1 - a2) * h) / 2);
  const tip = h * a2;
  const outline = () =>
    pen()
      .move(w, h)
      .arc(x, y, 90, 90)
      .line([x, tip + y])
      .arc(x, y, 0, -90)
      .arc(x, y, 90, -90)
      .line([x, y])
      .arc(x, y, 180, 90);
  const inset = y * ROUND_INSET;
  return {
    parts: [fill(outline().close()), line(outline())],
    text: edges(w - x * Math.SQRT1_2, inset, w, h - inset),
    grips: [gripY(x, y), gripY(0, tip)],
  };
};

const BRACKETS = [
  bracket("leftBracket", "Left bracket", 0.1, [free(0.08333)], leftBracket),
  bracket("rightBracket", "Right bracket", 0.1, [free(0.08333)], mirrored(leftBracket)),
  bracket("bracketPair", "Double bracket", 1.2, [half(0.16667)], (w, h, [a]) => {
    const r = Math.min(w, h) * a;
    const inset = r * ROUND_INSET;
    const lines = pen()
      .move(r, h)
      .arc(r, r, 90, 90)
      .line([0, r])
      .arc(r, r, 180, 90)
      .move(w - r, 0)
      .arc(r, r, 270, 90)
      .line([w, h - r])
      .arc(r, r, 0, 90);
    return {
      parts: [fill(rounded(w, h, r)), line(lines)],
      text: edges(inset, inset, w - inset, h - inset),
      grips: [gripY(0, r)],
    };
  }),
  bracket("leftBrace", "Left brace", 0.17, [free(0.08333), whole(0.5)], leftBrace),
  bracket("rightBrace", "Right brace", 0.17, [free(0.08333), whole(0.5)], mirrored(leftBrace)),
  bracket("bracePair", "Double brace", 1.2, [between(0.08333, 0, 0.25)], (w, h, [a]) => {
    const r = Math.min(w, h) * a;
    const left = (outline: Pen) =>
      outline
        .arc(r, r, 90, 90)
        .line([r, h / 2 + r])
        .arc(r, r, 0, -90)
        .arc(r, r, 90, -90)
        .line([r, r])
        .arc(r, r, 180, 90);
    const right = (outline: Pen) =>
      outline
        .arc(r, r, 270, 90)
        .line([w - r, h / 2 - r])
        .arc(r, r, 180, -90)
        .arc(r, r, 270, -90)
        .line([w - r, h - r])
        .arc(r, r, 0, 90);
    const start = () => pen().move(2 * r, h);
    const inside = right(left(start()).line([w - 2 * r, 0])).close();
    const inset = r * (1 + ROUND_INSET);
    return {
      parts: [fill(inside), line(right(left(start()).move(w - 2 * r, 0)))],
      text: edges(inset, inset, w - inset, h - r * ROUND_INSET),
      grips: [gripY(0, h / 2 - r)],
    };
  }),
];

// ---------------------------------------------------------------- all of them

export const SHAPES: readonly ShapeDef[] = [...BASIC, ...ARROWS, ...STARS, ...CALLOUTS, ...FLOWCHART, ...BRACKETS];

const byKind = new Map(SHAPES.map((def) => [def.kind, def]));

export function shapeDef(kind: string): ShapeDef | null {
  return byKind.get(kind) ?? null;
}

/** The adjust values to use: the given ones, filled up with defaults and kept in range. */
export function adjOf(def: ShapeDef, adj: readonly number[] = []): number[] {
  return fit(
    def.adjust.map(({ value, min, max }) => between(value, min, max)),
    adj,
  );
}
