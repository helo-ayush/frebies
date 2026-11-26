import type { ShapeObject, ShapeText } from "../model";
import type { Box } from "./matrix";
import { adjOf, shapeDef } from "./shape-kinds";
import { heightOf } from "./text-dom";

/** Where the words of a shape may go, from its corner. */
export function shapeRoom(shape: ShapeObject): Box {
  const def = shapeDef(shape.kind);
  const all = { x: 0, y: 0, w: shape.w, h: shape.h };
  if (!def) return all;
  const box = def.text(Math.max(0.01, shape.w), Math.max(0.01, shape.h), adjOf(def, shape.adj));
  return {
    x: shape.flipX ? shape.w - box.x - box.w : box.x,
    y: shape.flipY ? shape.h - box.y - box.h : box.y,
    w: box.w,
    h: box.h,
  };
}

/** Where its words are: as wide as there is room, as high as they need. */
export function wordsBox(shape: ShapeObject, text: ShapeText): Box {
  const room = shapeRoom(shape);
  const w = Math.max(4, room.w - text.pad * 2);
  const h = heightOf(text, w);
  const free = room.h - text.pad * 2 - h;
  const down = text.valign === "middle" ? free / 2 : text.valign === "bottom" ? free : 0;
  return { x: room.x + text.pad, y: room.y + text.pad + down, w, h };
}
