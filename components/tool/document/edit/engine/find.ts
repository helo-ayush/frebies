import type { TextBody } from "../model";
import { plainText } from "../model";
import type { Block } from "./paragraphs";
import { pageOfLocal } from "./paragraphs";
import { layText, textWidth, type Laid } from "./text-dom";

/** Finds words the way people mean them: small or capital, over line ends, whatever the quotes look like. */

export type FindHow = { matchCase: boolean; whole: boolean };
/** A turned rectangle, by its top-left corner. */
export type Spot = { x: number; y: number; w: number; h: number; angle: number };
export type Match = { from: number; to: number };

const ALIKE: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "‐": "-",
  "‑": "-",
  "−": "-",
  "…": "...",
};

/** The text as it is compared, and where every compared letter comes from. */
function folded(text: string, how: FindHow): { text: string; at: number[] } {
  let out = "";
  const at: number[] = [];
  let space = true;
  for (let i = 0; i < text.length;) {
    const point = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(point);
    const next = i + ch.length;
    if (/\s/.test(ch) || point === 0x2028) {
      // A word broken at the end of a line is one word.
      const broken = /[\n\r]/.test(ch) && out.endsWith("-") && /\p{Ll}/u.test(text[next] ?? "") && /\p{L}-$/u.test(out);
      if (broken) {
        out = out.slice(0, -1);
        at.pop();
        space = true;
      } else if (!space) {
        out += " ";
        at.push(i);
        space = true;
      }
      i = next;
      continue;
    }
    if (point === 0xad || point === 0x200b) {
      i = next;
      continue;
    }
    let plain = ALIKE[ch] ?? ch.normalize("NFKC");
    if (!how.matchCase) plain = plain.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") || plain.toLowerCase();
    for (const unit of plain) {
      out += unit;
      for (let k = 0; k < unit.length; k += 1) at.push(i);
    }
    space = false;
    i = next;
  }
  at.push(text.length);
  return { text: out, at };
}

export function matchesIn(text: string, query: string, how: FindHow): Match[] {
  const needle = folded(query, how).text.trim();
  if (needle === "") return [];
  const hay = folded(text, how);
  const out: Match[] = [];
  const word = /[\p{L}\p{N}_]/u;
  for (
    let from = hay.text.indexOf(needle);
    from >= 0;
    from = hay.text.indexOf(needle, from + Math.max(1, needle.length))
  ) {
    const to = from + needle.length;
    if (how.whole) {
      const before = hay.text[from - 1];
      const after = hay.text[to];
      if (
        (before && word.test(before) && word.test(needle[0])) ||
        (after && word.test(after) && word.test(needle[needle.length - 1]))
      )
        continue;
    }
    // One past the last letter, not up to the next one: spaces between are left out.
    const last = hay.at[to - 1];
    const end = last + (String.fromCodePoint(text.codePointAt(last) ?? 32).length || 1);
    out.push({ from: hay.at[from], to: end });
  }
  return out;
}

/** Where some letters of a block are on the page. */
export function spotsInBlock(block: Block, match: Match): Spot[] {
  const t = { cos: Math.cos((block.angle * Math.PI) / 180), sin: Math.sin((block.angle * Math.PI) / 180) };
  const out: Spot[] = [];
  let start = 0;
  block.lines.forEach((line, i) => {
    const length = line.runs.reduce((sum, run) => sum + run.text.length, 0);
    const from = match.from - start;
    const to = match.to - start;
    start += length + 1;
    if (to <= 0 || from >= length) return;
    const row = block.rows[i];
    let x0 = Infinity;
    let x1 = -Infinity;
    row.cells.forEach(([at, left, right], k) => {
      const end = row.cells[k + 1]?.[0] ?? length;
      if (end <= from || at >= to) return;
      // A glyph that stands for several letters is divided between them.
      const span = Math.max(1, end - at);
      x0 = Math.min(x0, left + ((right - left) * Math.max(0, from - at)) / span);
      x1 = Math.max(x1, left + ((right - left) * Math.min(span, to - at)) / span);
    });
    if (x1 <= x0) return;
    const top = pageOfLocal(x0, row.y - row.size * 0.84, t);
    out.push({ x: top.x, y: top.y, w: x1 - x0, h: row.size * 1.1, angle: block.angle });
  });
  return out;
}

/** Where some letters of a text are, from the corner of its box. */
export function spotsInText(laid: Laid, match: Match): Spot[] {
  const out: Spot[] = [];
  for (const piece of layText(laid)) {
    if (piece.mark) continue;
    const from = Math.max(match.from, piece.at);
    const to = Math.min(match.to, piece.at + piece.text.length);
    if (to <= from) continue;
    const whole = textWidth(piece.text, piece.style, piece.face) || 1;
    const scale = piece.width / whole;
    const before = textWidth(piece.text.slice(0, from - piece.at), piece.style, piece.face) * scale;
    const width = textWidth(piece.text.slice(from - piece.at, to - piece.at), piece.style, piece.face) * scale;
    const size = piece.style.size;
    const spot = { x: piece.x + before, y: piece.baseline - size * 0.84, w: width, h: size * 1.1, angle: 0 };
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - spot.y) < 0.5 && spot.x - (last.x + last.w) < size * 0.5 && spot.x >= last.x)
      last.w = spot.x + spot.w - last.x;
    else out.push(spot);
  }
  return out;
}

export const matchesInBody = (body: Pick<TextBody, "runs">, query: string, how: FindHow) =>
  matchesIn(plainText(body.runs), query, how);
