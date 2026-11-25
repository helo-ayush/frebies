import type { InkObject, ShapeObject } from "../model";
import { num } from "./matrix";

/** One outline for the screen (SVG) and for the file (PDF), y down. */
export type Cmd =
  ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

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

export type Outline = { path: Cmd[]; paint: "stroke" | "fill" | "both" };

export function shapeOutlines(shape: ShapeObject): Outline[] {
  const { w, h, kind } = shape;
  switch (kind) {
    case "rect":
      return [{ path: rectPath(0, 0, w, h), paint: "both" }];
    case "whiteout":
      return [{ path: rectPath(0, 0, w, h), paint: "fill" }];
    case "ellipse":
      return [{ path: ellipsePath(0, 0, w, h), paint: "both" }];
    case "line":
    case "arrow": {
      let a = { x: 0, y: shape.flip ? h : 0 };
      let b = { x: w, y: shape.flip ? 0 : h };
      if (shape.back) [a, b] = [b, a];
      if (kind === "line")
        return [
          {
            path: [
              ["M", a.x, a.y],
              ["L", b.x, b.y],
            ],
            paint: "stroke",
          },
        ];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const head = Math.min(length * 0.6, 6 + shape.width * 3.2);
      const half = head * 0.42;
      const neck = { x: b.x - u.x * head, y: b.y - u.y * head };
      return [
        {
          path: [
            ["M", a.x, a.y],
            ["L", neck.x, neck.y],
          ],
          paint: "stroke",
        },
        {
          path: [
            ["M", b.x, b.y],
            ["L", neck.x - u.y * half, neck.y + u.x * half],
            ["L", neck.x + u.y * half, neck.y - u.x * half],
            ["Z"],
          ],
          paint: "fill",
        },
      ];
    }
    case "check":
      return [
        {
          path: [
            ["M", w * 0.06, h * 0.55],
            ["L", w * 0.37, h * 0.88],
            ["L", w * 0.94, h * 0.12],
          ],
          paint: "stroke",
        },
      ];
    case "cross":
      return [
        {
          path: [
            ["M", w * 0.1, h * 0.1],
            ["L", w * 0.9, h * 0.9],
            ["M", w * 0.9, h * 0.1],
            ["L", w * 0.1, h * 0.9],
          ],
          paint: "stroke",
        },
      ];
    case "dot":
      return [{ path: ellipsePath(0, 0, w, h), paint: "fill" }];
  }
}

/** What fills an outline: an arrow's head and a dot take the line's colour. */
export function outlineFill(shape: ShapeObject): string | null {
  return shape.kind === "arrow" || shape.kind === "dot" ? shape.stroke : shape.fill;
}

/** A smooth line through the points of a stroke. */
export function strokePath(points: readonly number[], w: number, h: number): Cmd[] {
  const at = (i: number) => ({ x: points[i * 2] * w, y: points[i * 2 + 1] * h });
  const count = Math.floor(points.length / 2);
  if (count === 0) return [];
  const first = at(0);
  if (count === 1)
    return [
      ["M", first.x, first.y],
      ["L", first.x + 0.01, first.y],
    ];
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

export function inkPath(ink: InkObject): Cmd[] {
  return ink.strokes.flatMap((stroke) => strokePath(stroke, ink.w, ink.h));
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
