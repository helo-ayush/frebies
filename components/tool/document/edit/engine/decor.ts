import {
  DEFAULT_STYLE,
  marginBox,
  pageBox,
  shownMatrix,
  shownSize,
  type Asset,
  type Band,
  type Decor,
  type DocState,
  type Page,
  type PageSet,
  type Style,
} from "../model";
import { apply, invert, placement } from "./matrix";
import { measureBox, type Laid } from "./text-dom";

/** What stands on every page: header, footer, page numbers and a watermark. The same for the screen and the file. */

export type DecorItem =
  | { kind: "text"; laid: Laid; x: number; y: number; angle: number; opacity: number }
  | { kind: "image"; asset: string; x: number; y: number; w: number; h: number; angle: number; opacity: number };

/** "1-3, 5, 8-" as page numbers from 0. Everything when it is empty. */
export function parsePages(list: string, count: number): number[] {
  const out = new Set<number>();
  for (const part of list.split(/[,;\s]+/)) {
    const match = /^(\d+)?(-|–)?(\d+)?$/.exec(part.trim());
    if (!match || (!match[1] && !match[3])) continue;
    const from = match[1] ? Number(match[1]) : 1;
    const to = match[2] ? (match[3] ? Number(match[3]) : count) : from;
    const step = from <= to ? 1 : -1;
    for (let i = from; step > 0 ? i <= to : i >= to; i += step) if (i >= 1 && i <= count) out.add(i - 1);
  }
  return [...out];
}

export const ALL_PAGES: PageSet = { kind: "all", list: "", skipFirst: false };

export function inSet(set: PageSet, index: number, count: number): boolean {
  if (set.skipFirst && index === 0) return false;
  if (set.kind === "odd") return index % 2 === 0;
  if (set.kind === "even") return index % 2 === 1;
  if (set.kind === "list") return parsePages(set.list, count).includes(index);
  return true;
}

export const FRESH_DECOR: Decor = {
  bandStyle: { ...DEFAULT_STYLE, size: 10, color: "#57565c" },
  bandAt: 28,
  bandPages: ALL_PAGES,
  from: 1,
  digits: 1,
};

type Place = { index: number; count: number; name: string };

export function filledIn(text: string, decor: Decor, place: Place): string {
  const number = String(decor.from + place.index).padStart(decor.digits, "0");
  return text
    .replace(/\{page\}/gi, number)
    .replace(/\{pages\}/gi, String(decor.from - 1 + place.count).padStart(decor.digits, "0"))
    .replace(/\{date\}/gi, new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }))
    .replace(/\{file\}/gi, place.name);
}

const hasBand = (band: Band | undefined): band is Band => Boolean(band && (band.left || band.center || band.right));

export function decorStyles(decor: Decor | undefined): Style[] {
  if (!decor) return [];
  return [decor.bandStyle, ...(decor.watermark?.kind === "text" ? [decor.watermark.style] : [])];
}

export function decorOf(
  doc: DocState,
  page: Page,
  place: Place,
  assets: ReadonlyMap<string, Pick<Asset, "w" | "h">>,
): DecorItem[] {
  const { decor } = doc;
  if (!decor) return [];
  const out: DecorItem[] = [];
  const size = shownSize(page);
  const back = invert(shownMatrix(page));
  const turn = -page.rotate;
  /** From the page as it is shown to the page as it is stored. */
  const put = (x: number, y: number, angle: number) => {
    const at = apply(back, x, y);
    return { x: at.x, y: at.y, angle: turn + angle };
  };

  const mark = decor.watermark;
  if (mark && inSet(mark.pages, place.index, place.count)) {
    const width = Math.max(8, size.w * mark.size);
    let w = width;
    let h = 0;
    let laid: Laid | null = null;
    if (mark.kind === "text") {
      const text = filledIn(mark.text, decor, place);
      if (text.trim() !== "") {
        const at = (points: number): Laid => ({
          runs: [{ text, style: { ...mark.style, size: points } }],
          align: "center",
          leading: points * 1.2,
          wrap: false,
          w: 0,
        });
        const probe = measureBox(at(100));
        const points = Math.max(4, (width / Math.max(1, probe.w)) * 100);
        laid = at(points);
        ({ w, h } = measureBox(laid));
      }
    } else {
      const asset = mark.asset ? assets.get(mark.asset) : undefined;
      h = asset ? (width * asset.h) / asset.w : 0;
    }
    if (h > 0) {
      const add = (cx: number, cy: number) => {
        // Turned about its own middle.
        const off = apply(placement(0, 0, mark.angle), w / 2, h / 2);
        const at = put(cx - off.x, cy - off.y, mark.angle);
        if (laid) out.push({ kind: "text", laid, ...at, opacity: mark.opacity });
        else if (mark.asset) out.push({ kind: "image", asset: mark.asset, ...at, w, h, opacity: mark.opacity });
      };
      if (mark.tile) {
        const stepX = w * 1.45;
        const stepY = Math.max(h * 2.4, 60);
        const reach = Math.hypot(size.w, size.h) / 2;
        const turned = placement(size.w / 2, size.h / 2, mark.angle);
        const cols = Math.min(12, Math.ceil(reach / stepX));
        const rows = Math.min(20, Math.ceil(reach / stepY));
        for (let r = -rows; r <= rows; r += 1) {
          for (let c = -cols; c <= cols; c += 1) {
            const at = apply(turned, (c + (Math.abs(r) % 2) * 0.5) * stepX, r * stepY);
            const far = Math.max(w, h) * 0.6;
            if (at.x > -far && at.x < size.w + far && at.y > -far && at.y < size.h + far) add(at.x, at.y);
          }
        }
      } else {
        const edge = size.h * 0.12;
        add(size.w / 2, mark.place === "top" ? edge : mark.place === "bottom" ? size.h - edge : size.h / 2);
      }
    }
  }

  if (inSet(decor.bandPages, place.index, place.count)) {
    const style = decor.bandStyle;
    const leading = Math.round(style.size * 1.22 * 10) / 10;
    const box = pageBox(page);
    const inner = marginBox(page);
    const upright = page.rotate === 0 && page.margin;
    const x = upright ? inner.x - box.x : 36;
    const w = upright ? inner.w : Math.max(40, size.w - 72);
    const band = (words: Band | undefined, top: boolean) => {
      if (!hasBand(words)) return;
      for (const [align, text] of [
        ["left", words.left],
        ["center", words.center],
        ["right", words.right],
      ] as const) {
        if (!text) continue;
        const laid: Laid = { runs: [{ text: filledIn(text, decor, place), style }], align, leading, wrap: true, w };
        const { h } = measureBox(laid);
        out.push({ kind: "text", laid, ...put(x, top ? decor.bandAt : size.h - decor.bandAt - h, 0), opacity: 1 });
      }
    };
    band(decor.header, true);
    band(decor.footer, false);
  }
  return out;
}
