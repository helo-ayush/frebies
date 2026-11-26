import { dashArray, type Head, type InkObject, type MarkObject, type PathObject, type ShapeObject } from "../model";
import { num, type Point } from "./matrix";
import { adjOf, shapeDef } from "./shape-kinds";

/** One outline for the screen (SVG) and for the file (PDF), y down. */
export type Cmd =
  ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

/** A path and how it is painted. Every drawn object comes down to a few of these. */
export type Painted = {
  path: Cmd[];
  fill: string | null;
  stroke: string | null;
  width: number;
  dash: number[];
  cap: 0 | 1 | 2;
  join: 0 | 1 | 2;
  evenOdd?: boolean;
};

const K = 0.5522847498;

export function ellipsePath(x: number, y: number, w: number, h: number): Cmd[] {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ry * K, cx + rx * K, cy + ry, cx, cy + ry],
    ["C", cx - rx * K, cy + ry, cx - rx, cy + ry * K, cx - rx, cy],
    ["C", cx - rx, cy - ry * K, cx - rx * K, cy - ry, cx, cy - ry],
    ["C", cx + rx * K, cy - ry, cx + rx, cy - ry * K, cx + rx, cy],
    ["Z"],
  ];
}

export function rectPath(x: number, y: number, w: number, h: number): Cmd[] {
  return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
}

export function roundPath(w: number, h: number, radius: number): Cmd[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r < 0.01) return rectPath(0, 0, w, h);
  const k = r * (1 - K);
  return [
    ["M", r, 0],
    ["L", w - r, 0],
    ["C", w - k, 0, w, k, w, r],
    ["L", w, h - r],
    ["C", w, h - k, w - k, h, w - r, h],
    ["L", r, h],
    ["C", k, h, 0, h - k, 0, h - r],
    ["L", 0, r],
    ["C", 0, k, k, 0, r, 0],
    ["Z"],
  ];
}

const line = (a: Point, b: Point): Cmd[] => [
  ["M", a.x, a.y],
  ["L", b.x, b.y],
];

const open = (path: Cmd[], color: string | null, width: number, dash: number[] = [], round = false): Painted => ({
  path,
  fill: null,
  stroke: color,
  width,
  dash,
  cap: round ? 1 : 0,
  join: round ? 1 : 0,
});

const solid = (path: Cmd[], color: string | null): Painted => ({
  path,
  fill: color,
  stroke: null,
  width: 0,
  dash: [],
  cap: 0,
  join: 0,
});

/** Lighter (+) or darker (-). */
export function shaded(color: string, by: number): string {
  const parts = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));
  const mixed = parts.map((value) => Math.round(by >= 0 ? value + (255 - value) * by : value * (1 + by)));
  return `#${mixed.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

/** Mirrors a path inside its box. */
export function mirrored(path: readonly Cmd[], w: number, h: number, x: boolean, y: boolean): Cmd[] {
  if (!x && !y) return [...path];
  const fx = (v: number) => (x ? w - v : v);
  const fy = (v: number) => (y ? h - v : v);
  return path.map((cmd): Cmd => {
    if (cmd[0] === "Z") return cmd;
    if (cmd[0] === "C") return ["C", fx(cmd[1]), fy(cmd[2]), fx(cmd[3]), fy(cmd[4]), fx(cmd[5]), fy(cmd[6])];
    return [cmd[0], fx(cmd[1]), fy(cmd[2])];
  });
}

// ---------------------------------------------------------------- lines and their ends

/** The two ends of a line, start first, from the corner of its box. */
export function endsOf(shape: ShapeObject): [Point, Point] {
  const a = { x: 0, y: shape.flip ? shape.h : 0 };
  const b = { x: shape.w, y: shape.flip ? 0 : shape.h };
  return shape.back ? [b, a] : [a, b];
}

function headParts(
  kind: Head,
  at: Point,
  from: Point,
  width: number,
  color: string | null,
): { parts: Painted[]; cut: number } {
  const length = Math.hypot(at.x - from.x, at.y - from.y) || 1;
  const u = { x: (at.x - from.x) / length, y: (at.y - from.y) / length };
  const n = { x: -u.y, y: u.x };
  const size = Math.min(length * 0.6, 6 + width * 3.2);
  const back = (by: number, side: number) => ({ x: at.x - u.x * by + n.x * side, y: at.y - u.y * by + n.y * side });
  switch (kind) {
    case "arrow": {
      const a = back(size, size * 0.42);
      const b = back(size, -size * 0.42);
      return { parts: [solid([["M", at.x, at.y], ["L", a.x, a.y], ["L", b.x, b.y], ["Z"]], color)], cut: size * 0.9 };
    }
    case "open": {
      const a = back(size, size * 0.5);
      const b = back(size, -size * 0.5);
      return {
        parts: [
          open(
            [
              ["M", a.x, a.y],
              ["L", at.x, at.y],
              ["L", b.x, b.y],
            ],
            color,
            width,
            [],
            true,
          ),
        ],
        cut: 0,
      };
    }
    case "dot": {
      const r = Math.max(width * 1.6, 2.4);
      return { parts: [solid(ellipsePath(at.x - r, at.y - r, r * 2, r * 2), color)], cut: 0 };
    }
    case "bar": {
      const a = back(0, size * 0.45);
      const b = back(0, -size * 0.45);
      return { parts: [open(line(a, b), color, width)], cut: 0 };
    }
    case "diamond": {
      const r = Math.max(width * 2.2, 3.4);
      const p = [back(-r, 0), back(0, r), back(r, 0), back(0, -r)];
      return {
        parts: [
          solid(
            [["M", p[0].x, p[0].y], ["L", p[1].x, p[1].y], ["L", p[2].x, p[2].y], ["L", p[3].x, p[3].y], ["Z"]],
            color,
          ),
        ],
        cut: 0,
      };
    }
    default:
      return { parts: [], cut: 0 };
  }
}

function lineParts(shape: ShapeObject): Painted[] {
  const [a, b] = endsOf(shape);
  const last = shape.end ?? (shape.kind === "arrow" ? "arrow" : "none");
  const end = headParts(last, b, a, shape.width, shape.stroke);
  const start = headParts(shape.start ?? "none", a, b, shape.width, shape.stroke);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const from = { x: a.x + u.x * start.cut, y: a.y + u.y * start.cut };
  const to = { x: b.x - u.x * end.cut, y: b.y - u.y * end.cut };
  return [
    open(line(from, to), shape.stroke, shape.width, dashArray(shape.dash, shape.width)),
    ...start.parts,
    ...end.parts,
  ];
}

// ---------------------------------------------------------------- everything drawn

export function shapeParts(shape: ShapeObject): Painted[] {
  const { w, h, kind } = shape;
  switch (kind) {
    case "line":
    case "arrow":
      return lineParts(shape);
    case "whiteout":
    case "redact":
      return [solid(rectPath(0, 0, w, h), shape.fill)];
    case "check":
      return [
        open(
          [
            ["M", w * 0.06, h * 0.55],
            ["L", w * 0.37, h * 0.88],
            ["L", w * 0.94, h * 0.12],
          ],
          shape.stroke,
          shape.width,
          [],
          true,
        ),
      ];
    case "cross":
      return [
        open(
          [
            ["M", w * 0.1, h * 0.1],
            ["L", w * 0.9, h * 0.9],
            ["M", w * 0.9, h * 0.1],
            ["L", w * 0.1, h * 0.9],
          ],
          shape.stroke,
          shape.width,
          [],
          true,
        ),
      ];
    case "dot":
      return [solid(ellipsePath(0, 0, w, h), shape.stroke)];
    default:
      break;
  }
  const def = shapeDef(kind);
  const dash = dashArray(shape.dash, shape.width);
  const stroke = shape.width > 0 ? shape.stroke : null;
  if (!def)
    return [{ path: rectPath(0, 0, w, h), fill: shape.fill, stroke, width: shape.width, dash, cap: 0, join: 0 }];
  return def.parts(Math.max(0.01, w), Math.max(0.01, h), adjOf(def, shape.adj)).map((part): Painted => ({
    path: mirrored(part.path, w, h, Boolean(shape.flipX), Boolean(shape.flipY)),
    fill: part.paint === "stroke" || !shape.fill ? null : part.shade ? shaded(shape.fill, part.shade) : shape.fill,
    stroke: part.paint === "fill" ? null : stroke,
    width: shape.width,
    dash,
    cap: 0,
    join: 0,
    evenOdd: part.evenOdd,
  }));
}

/** A path kept in fractions, at the size of its box. */
export function scaledPath(object: PathObject): Cmd[] {
  const { w, h } = object;
  const path = object.path.map((cmd): Cmd => {
    if (cmd[0] === "Z") return cmd;
    if (cmd[0] === "C") return ["C", cmd[1] * w, cmd[2] * h, cmd[3] * w, cmd[4] * h, cmd[5] * w, cmd[6] * h];
    return [cmd[0], cmd[1] * w, cmd[2] * h];
  });
  return mirrored(path, w, h, Boolean(object.flipX), Boolean(object.flipY));
}

export const pathParts = (object: PathObject): Painted[] => [
  {
    path: scaledPath(object),
    fill: object.fill,
    stroke: object.width > 0 ? object.stroke : null,
    width: object.width,
    dash: object.dash,
    cap: object.cap,
    join: object.join,
    evenOdd: object.evenOdd,
  },
];

/** A smooth line through the points of a stroke. */
export function strokePath(points: readonly number[], w: number, h: number): Cmd[] {
  const at = (i: number) => ({ x: points[i * 2] * w, y: points[i * 2 + 1] * h });
  const count = Math.floor(points.length / 2);
  if (count === 0) return [];
  const first = at(0);
  if (count === 1) return line(first, { x: first.x + 0.01, y: first.y });
  const path: Cmd[] = [["M", first.x, first.y]];
  let from = first;
  for (let i = 1; i < count - 1; i += 1) {
    const q = at(i);
    const next = at(i + 1);
    const to = { x: (q.x + next.x) / 2, y: (q.y + next.y) / 2 };
    path.push([
      "C",
      from.x + (2 / 3) * (q.x - from.x),
      from.y + (2 / 3) * (q.y - from.y),
      to.x + (2 / 3) * (q.x - to.x),
      to.y + (2 / 3) * (q.y - to.y),
      to.x,
      to.y,
    ]);
    from = to;
  }
  const end = at(count - 1);
  path.push(["L", end.x, end.y]);
  return path;
}

export function inkPath(ink: Pick<InkObject, "strokes" | "w" | "h">): Cmd[] {
  return ink.strokes.flatMap((stroke) => strokePath(stroke, ink.w, ink.h));
}

export const inkParts = (ink: InkObject): Painted[] => [open(inkPath(ink), ink.stroke, ink.width, [], true)];

/** A highlight, a line under or through the words, or a wavy one. */
export function markParts(mark: MarkObject): Painted[] {
  return mark.rects.flatMap(([x, y, w, h]): Painted[] => {
    if (mark.kind === "highlight") return [solid(rectPath(x, y, w, h), mark.color)];
    if (mark.kind === "squiggle") {
      const base = y + h * 0.95;
      const step = Math.max(1.4, h * 0.13);
      const path: Cmd[] = [["M", x, base]];
      for (let at = step, up = true; at < w + step * 0.5; at += step, up = !up)
        path.push(["L", x + Math.min(at, w), base + (up ? -step * 0.55 : step * 0.55)]);
      return [open(path, mark.color, Math.max(0.6, h * 0.05), [], true)];
    }
    const thick = Math.max(0.6, h * 0.06);
    const top = mark.kind === "underline" ? y + h * 0.93 : y + h * 0.54;
    return [solid(rectPath(x, top, w, thick), mark.color)];
  });
}

export function toSvg(path: readonly Cmd[]): string {
  return path.map(([name, ...values]) => `${name}${values.map((value) => num(value)).join(" ")}`).join("");
}

export function toPdf(path: readonly Cmd[]): string {
  return path
    .map(([name, ...values]) => {
      const numbers = values.map((value) => num(value)).join(" ");
      return name === "M" ? `${numbers} m` : name === "L" ? `${numbers} l` : name === "C" ? `${numbers} c` : "h";
    })
    .join("\n");
}
