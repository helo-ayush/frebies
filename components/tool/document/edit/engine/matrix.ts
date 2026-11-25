/** [a b c d e f] as in PDF: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** First `m`, then `by`. */
export function mul(m: Matrix, by: Matrix): Matrix {
  return [
    m[0] * by[0] + m[1] * by[2],
    m[0] * by[1] + m[1] * by[3],
    m[2] * by[0] + m[3] * by[2],
    m[2] * by[1] + m[3] * by[3],
    m[4] * by[0] + m[5] * by[2] + by[4],
    m[4] * by[1] + m[5] * by[3] + by[5],
  ];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function bounds(points: readonly Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of points) {
    x0 = Math.min(x0, point.x);
    y0 = Math.min(y0, point.y);
    x1 = Math.max(x1, point.x);
    y1 = Math.max(y1, point.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function corners(m: Matrix, box: Box): Point[] {
  return [
    apply(m, box.x, box.y),
    apply(m, box.x + box.w, box.y),
    apply(m, box.x + box.w, box.y + box.h),
    apply(m, box.x, box.y + box.h),
  ];
}

export function intersect(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Place and turn of a box: rotation about its top-left corner. */
export function placement(x: number, y: number, angle: number): Matrix {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, x, y];
}

export function objectCorners(object: { x: number; y: number; w: number; h: number; angle: number }): Point[] {
  return corners(placement(object.x, object.y, object.angle), { x: 0, y: 0, w: object.w, h: object.h });
}

export function objectBounds(object: { x: number; y: number; w: number; h: number; angle: number }): Box {
  return bounds(objectCorners(object));
}

/** Turn a box to `angle` without moving its middle. */
export function turnAbout(object: Box & { angle: number }, angle: number): { x: number; y: number; angle: number } {
  const middle = apply(placement(object.x, object.y, object.angle), object.w / 2, object.h / 2);
  const offset = apply(placement(0, 0, angle), object.w / 2, object.h / 2);
  return { x: middle.x - offset.x, y: middle.y - offset.y, angle };
}

export const num = (value: number) => {
  const text = (Math.round(value * 1e4) / 1e4).toString();
  return text.includes("e") ? value.toFixed(6) : text === "-0" ? "0" : text;
};

export const mat = (m: Matrix) =>
  m
    .map((value) => {
      const text = (Math.round(value * 1e6) / 1e6).toString();
      return text.includes("e") ? value.toFixed(8) : text === "-0" ? "0" : text;
    })
    .join(" ");
