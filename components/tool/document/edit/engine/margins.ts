import type { Margin } from "../model";
import type { PageText } from "./extract";
import { rulesOf } from "./vectors";

/** Page sizes and margins: the usual ones, and the ones a PDF was made with. */

export type Unit = "cm" | "mm" | "in" | "pt";
export const UNITS: Record<Unit, { points: number; label: string; step: number; digits: number }> = {
  cm: { points: 72 / 2.54, label: "cm", step: 0.1, digits: 2 },
  mm: { points: 72 / 25.4, label: "mm", step: 1, digits: 1 },
  in: { points: 72, label: "in", step: 0.05, digits: 2 },
  pt: { points: 1, label: "pt", step: 1, digits: 0 },
};

const all = (value: number): Margin => ({ top: value, right: value, bottom: value, left: value });
const CM = UNITS.cm.points;

export type MarginPreset = { id: string; label: string; hint: string; margin: Margin | null };
/** Named as in Word. */
export const MARGINS: readonly MarginPreset[] = [
  { id: "none", label: "None", hint: "Text can go to the edge", margin: null },
  { id: "normal", label: "Standard", hint: "2.54 cm all round", margin: all(72) },
  { id: "narrow", label: "Narrow", hint: "1.27 cm all round", margin: all(36) },
  {
    id: "moderate",
    label: "Moderate",
    hint: "2.54 cm top and bottom, 1.91 cm at the sides",
    margin: { top: 72, right: 54, bottom: 72, left: 54 },
  },
  {
    id: "wide",
    label: "Wide",
    hint: "2.54 cm top and bottom, 5.08 cm at the sides",
    margin: { top: 72, right: 144, bottom: 72, left: 144 },
  },
  { id: "slim", label: "Slim", hint: "0.5 cm all round", margin: all(0.5 * CM) },
];

export const sameMargin = (a: Margin | null | undefined, b: Margin | null | undefined, by = 1.5) => {
  if (!a || !b) return !a && !b;
  return (
    Math.abs(a.top - b.top) < by &&
    Math.abs(a.right - b.right) < by &&
    Math.abs(a.bottom - b.bottom) < by &&
    Math.abs(a.left - b.left) < by
  );
};

export const presetOf = (margin: Margin | null | undefined) =>
  MARGINS.find((preset) => sameMargin(preset.margin, margin ?? null)) ?? null;

export type PaperSize = { id: string; label: string; w: number; h: number };
export const PAPERS: readonly PaperSize[] = [
  { id: "a4", label: "A4", w: 595.28, h: 841.89 },
  { id: "letter", label: "Letter", w: 612, h: 792 },
  { id: "legal", label: "Legal", w: 612, h: 1008 },
  { id: "a3", label: "A3", w: 841.89, h: 1190.55 },
  { id: "a5", label: "A5", w: 419.53, h: 595.28 },
  { id: "b5", label: "B5", w: 498.9, h: 708.66 },
  { id: "tabloid", label: "Tabloid", w: 792, h: 1224 },
  { id: "executive", label: "Executive", w: 521.86, h: 756 },
  { id: "slide", label: "Slide 16:9", w: 540, h: 960 },
  { id: "square", label: "Square", w: 595.28, h: 595.28 },
];

export function paperOf(w: number, h: number): { paper: PaperSize; landscape: boolean } | null {
  for (const paper of PAPERS) {
    if (Math.abs(paper.w - w) < 2 && Math.abs(paper.h - h) < 2) return { paper, landscape: false };
    if (Math.abs(paper.w - h) < 2 && Math.abs(paper.h - w) < 2) return { paper, landscape: paper.w !== paper.h };
  }
  return null;
}

/** Margins people set come in round numbers: a measured one close to those is one of those. */
const ROUND = [72, 36, 54, 90, 108, 144, 28.35, 34, 42.52, 51, 56.69, 62.36, 70.87, 85.04, 99.2, 113.39];
const rounded = (value: number) => {
  for (const round of ROUND) if (Math.abs(value - round) < 2.4) return round;
  return Math.round(value * 2) / 2;
};

type Sample = { text: PageText; w: number; h: number };

/** The margin a file was made with, from some of its pages. Null when text goes to the edges, or there is none. */
export function detectMargin(samples: readonly Sample[]): Margin | null {
  const pages = samples.map(({ text, w, h }) => ({
    w,
    h,
    blocks: text.blocks.filter(
      (block) => block.angle === 0 && block.x > -5 && block.x < w && block.y > -20 && block.y < h,
    ),
    rules: rulesOf(text.paths),
  }));
  const loose = (text: string) => text.replace(/\d+/g, "#").trim();

  // Running heads and feet: the same words at the same height on several pages, or a lone page number.
  const seen = new Map<string, number>();
  for (const page of pages)
    for (const block of page.blocks) {
      const key = `${loose(block.text)}@${Math.round(block.y / 3)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  const running = (page: (typeof pages)[number], block: (typeof page.blocks)[number]) => {
    const edge = block.y + block.h < page.h * 0.13 || block.y > page.h * 0.87;
    if (!edge) return false;
    if ((seen.get(`${loose(block.text)}@${Math.round(block.y / 3)}`) ?? 0) > 1) return true;
    return (
      block.lines.length === 1 && /^[-–\s]*(page\s*)?[\divxlc]+(\s*(of|\/)\s*\d+)?[-–\s]*$/i.test(block.text.trim())
    );
  };

  const lefts: number[] = [];
  const rights: number[] = [];
  const tops: number[] = [];
  const bottoms: number[] = [];
  let width = 0;
  let height = 0;
  for (const page of pages) {
    const body = page.blocks.filter((block) => !running(page, block));
    if (body.length === 0) continue;
    width = page.w;
    height = page.h;
    for (const block of body) {
      block.rows.forEach((row, i) => {
        lefts.push(i === 0 && block.list ? block.x : row.x0);
        rights.push(page.w - row.x1);
      });
    }
    // Tables and rules usually run from margin to margin.
    for (const rule of page.rules.y) if (rule.to - rule.from > page.w * 0.45) rights.push(page.w - rule.to);
    tops.push(Math.min(...body.map((block) => block.y)));
    bottoms.push(page.h - Math.max(...body.map((block) => block.rows[block.rows.length - 1].y + block.size * 0.25)));
  }
  if (lefts.length === 0) return null;

  // The outermost edge that enough lines share.
  const outer = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const enough = sorted.length < 10 ? 1 : Math.max(2, sorted.length * 0.05);
    for (let i = 0; i < sorted.length; i += 1) {
      let count = 0;
      for (let k = i; k < sorted.length && sorted[k] - sorted[i] < 2; k += 1) count += 1;
      if (count >= enough) return sorted[i];
    }
    return sorted[0];
  };
  const left = outer(lefts);
  let right = Math.min(...rights.filter((value) => value > 2), width);
  const sortedRights = rights.filter((value) => value > 2).sort((a, b) => a - b);
  if (sortedRights.length > 20) right = sortedRights[Math.floor(sortedRights.length * 0.01)];
  // Lines that end early leave more room than the margin asks for.
  if (right > left && right - left < Math.max(40, width * 0.08)) right = left;
  else if (right > left && sortedRights.length < 8) right = left;
  const top = Math.min(...tops);
  let bottom = Math.min(...bottoms);
  if (bottom > top + 30) bottom = Math.min(bottom, Math.max(top, 36));

  const margin: Margin = {
    top: rounded(Math.max(0, Math.min(top, height * 0.4))),
    right: rounded(Math.max(0, Math.min(right, width * 0.4))),
    bottom: rounded(Math.max(0, Math.min(bottom, height * 0.4))),
    left: rounded(Math.max(0, Math.min(left, width * 0.4))),
  };
  if (margin.left < 9 && margin.right < 9 && margin.top < 9) return null;
  return margin;
}

export const marginText = (margin: Margin | null | undefined, unit: Unit = "cm"): string => {
  if (!margin) return "None";
  const { points, digits, label } = UNITS[unit];
  const show = (value: number) => String(Number((value / points).toFixed(digits)));
  const { top, right, bottom, left } = margin;
  if (sameMargin(margin, all(top), 0.6)) return `${show(top)} ${label} all round`;
  if (Math.abs(top - bottom) < 0.6 && Math.abs(left - right) < 0.6)
    return `${show(top)} ${label} top and bottom, ${show(left)} ${label} sides`;
  return `${show(top)}, ${show(right)}, ${show(bottom)}, ${show(left)} ${label}`;
};
