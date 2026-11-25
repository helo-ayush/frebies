import type { DocState, Page } from "../model";
import type { Cuts } from "./content";
import type { PageText } from "./extract";
import { apply, invert, placement } from "./matrix";

/** Everything of the original page that must not be drawn any more. */
export function cutsOf(page: Page, objects: DocState["objects"], text: PageText): Cuts {
  const out: Cuts = { text: new Map(), pictures: new Set(page.imageCuts) };
  const add = (op: number, at: number) => {
    let set = out.text.get(op);
    if (!set) out.text.set(op, (set = new Set()));
    set.add(at);
  };
  for (const ranges of Object.values(page.cuts)) {
    for (const [op, from, to] of ranges) for (let at = from; at < to; at += 1) add(op, at);
  }
  // Under a whiteout the words go too, or they could still be copied out.
  for (const id of page.objects) {
    const object = objects[id];
    if (object?.type !== "shape" || object.kind !== "whiteout") continue;
    const back = invert(placement(object.x, object.y, object.angle));
    for (const glyph of text.glyphs) {
      const rad = (glyph.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const p = apply(
        back,
        glyph.x + (cos * glyph.w) / 2 + sin * glyph.size * 0.3,
        glyph.y + (sin * glyph.w) / 2 - cos * glyph.size * 0.3,
      );
      if (p.x >= 0 && p.x <= object.w && p.y >= 0 && p.y <= object.h) add(glyph.op, glyph.at);
    }
  }
  return out;
}

export const hasCuts = (cuts: Cuts) => cuts.text.size > 0 || cuts.pictures.size > 0;

/** Changes when the page's own drawing has to be made again. */
export function cutKey(page: Page, objects: DocState["objects"]): string {
  const white = page.objects
    .map((id) => objects[id])
    .filter((object) => object?.type === "shape" && object.kind === "whiteout")
    .map((object) => [object.x, object.y, object.w, object.h, object.angle].map((v) => Math.round(v * 10)).join(","));
  return `${Object.keys(page.cuts).sort().join(",")}|${[...page.imageCuts].sort((a, b) => a - b).join(",")}|${white.join(";")}`;
}
