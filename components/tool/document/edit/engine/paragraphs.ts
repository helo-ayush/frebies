import type { Align, GlyphRange, List, Run, Style } from "../model";
import { tidyRuns } from "../model";
import { firstBaseline, type Glyph } from "./extract";

/**
 * Gathers the letters of a page into lines and the lines into paragraphs. Only
 * lines that were one line before they ran out of room are joined: list items,
 * headings, addresses and table cells stay on their own.
 */

type Item = { glyph: Glyph; x: number; rise: number; before: string };

type Fragment = {
  angle: number;
  size: number;
  /** In the frame turned by `angle`. */
  x0: number;
  x1: number;
  y: number;
  glyphs: Item[];
  /** A second copy drawn on top, as some programs do for bold. */
  extra: Glyph[];
  /** Letters that stack and reorder, so baselines wander. */
  odd: boolean;
  /** Holds letters the PDF gives no text for: left alone. */
  broken: boolean;
};

/** A bullet or number that stands apart in front of a line. */
type Lead = { text: string; x: number; glyphs: Glyph[] };

type Row = Fragment & {
  text: string;
  face: string;
  lead: Lead | null;
  /** The nearest thing on either side, on the same line: another text or a ruled line. */
  wallLeft: number;
  wallRight: number;
  /** A ruled line on that side, as in a table. */
  ruledLeft: boolean;
  ruledRight: boolean;
  /** Edges of the column it stands in. */
  col: { x0: number; x1: number };
};

/** Straight lines drawn on the page, in page space. */
export type Rules = { x: { at: number; from: number; to: number }[]; y: { at: number; from: number; to: number }[] };

export type Block = {
  key: string;
  angle: number;
  /** Top-left corner in page space, with the block's own width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** One entry per line, with its width in points. */
  lines: { runs: Run[]; x: number; width: number }[];
  align: Align;
  size: number;
  leading: number;
  /** Local y of the first baseline below the top edge. */
  ascent: number;
  alpha: number;
  ranges: GlyphRange[];
  text: string;
  /**
   * Where each line sits, in the frame turned by `angle`. `cells` has the place
   * in the line's text, the left and the right edge of every letter.
   */
  rows: { x0: number; x1: number; y: number; size: number; cells: [number, number, number][] }[];
  /** Its bullet or number, which is not part of the text. `gap`: from the mark to the text. */
  list: Pick<List, "type" | "mark" | "start" | "gap"> | null;
  /** Edges of the column it stands in, in the turned frame. */
  col: { x0: number; x1: number };
  /** Nothing stands beside it on that side, up to the edge of the page. */
  free: { left: boolean; right: boolean };
};

const turn = (angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
};

/** Page space to the frame where the text runs left to right. */
export function localOf(x: number, y: number, t: { cos: number; sin: number }) {
  return { x: x * t.cos + y * t.sin, y: -x * t.sin + y * t.cos };
}

export function pageOfLocal(x: number, y: number, t: { cos: number; sin: number }) {
  return { x: x * t.cos - y * t.sin, y: x * t.sin + y * t.cos };
}

/** Scripts whose letters stack and reorder, so their baselines wander. */
const stacked = (text: string) => /[\u0590-\u08ff\u0900-\u0dff\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff]/.test(text);
const readable = (text: string) => text !== "" && !/[\u0000-\u0008\ue000-\uf8ff\ufffd]/.test(text);

// ---------------------------------------------------------------- what lines say

const BULLET = "[•◦▪▫●○■□▸►▶➢➤➔✓✔✗✘❖◆◇★☆‣⁃·§]";
/** A whole text that is only a list mark. */
const MARK_ALONE = new RegExp(
  `^(?:${BULLET}|[-–—*o]|\\[[ xX✓]?\\s?\\]|[☐☑☒]|\\(?(?:\\d{1,3}|[a-zA-Z]|[ivx]{2,5}|[IVX]{2,5})[.)]|\\(?\\d{1,3}\\)|\\d{1,2}(?:\\.\\d{1,2}){1,3}\\.?)$`,
);
/** A line that begins with one. */
const MARK_FIRST = new RegExp(
  `^(?:${BULLET}\\s*|[-–—*]\\s+|\\[\\s*[xX✓]?\\s*\\]\\s*|[☐☑☒]\\s*|\\((?:\\d{1,3}|[a-zA-Z]|[ivxIVX]{2,5})\\)\\s+|(?:\\d{1,3}|[ivx]{2,5}|[IVX]{2,5})[.)]\\s+|\\d{1,2}(?:\\.\\d{1,2}){1,3}\\.?\\s+|[a-zA-Z][.)]\\s+)`,
);
const LETTER_MARK = /^[a-zA-Z][.)]\s/;
const LEADERS = /(?:\.\s?){5,}\s*\S{0,8}$|…{2,}|_{6,}$/;
const ends = (text: string) => /[.!?:;…]["'”’)\]]*$/.test(text.trim());
const startsLower = (text: string) => /^["'“‘(]?\p{Ll}/u.test(text);
const startsUpper = (text: string) => /^["'“‘([]*[\p{Lu}\p{N}]/u.test(text);
const hyphenated = (text: string) => /\p{L}[-‐]$/u.test(text);
const numeric = (text: string) =>
  /\d/.test(text) && (/^[\s\d.,:%()+\-–/₹$€£¥]+$/.test(text) || /^[^\s\d]{1,3}\.?\s?[\d.,]+$/.test(text));

function listOf(text: string): Pick<List, "type" | "mark" | "start"> {
  const mark = text.trim();
  const number = /^(\(?)(\d{1,3}|[a-zA-Z]|[ivxIVX]{2,5})([.)]|\))$/.exec(mark);
  if (!number) return { type: "bullet", mark };
  const [, open, value, close] = number;
  if (/^\d/.test(value)) return { type: "number", mark: `${open}1${close}`, start: Number(value) };
  if (value.length > 1 || /^[iI]$/.test(value)) {
    const map: Record<string, number> = { i: 1, v: 5, x: 10 };
    let total = 0;
    const small = value.toLowerCase();
    for (let i = 0; i < small.length; i += 1) {
      const here = map[small[i]] ?? 0;
      total += (map[small[i + 1]] ?? 0) > here ? -here : here;
    }
    return { type: "number", mark: `${open}${value === small ? "i" : "I"}${close}`, start: total };
  }
  const small = value.toLowerCase();
  return {
    type: "number",
    mark: `${open}${value === small ? "a" : "A"}${close}`,
    start: small.charCodeAt(0) - 96,
  };
}

// ---------------------------------------------------------------- the whole way

export function findBlocks(glyphs: readonly Glyph[], rules: Rules, page: { w: number; h: number }): Block[] {
  const lines = linesOf(fragmentsOf(glyphs, rules), rules);
  const rows = rowsOf(lines, rules);
  return paragraphsOf(rows, page.w)
    .filter((group) => !group.some((line) => line.broken))
    .map((group, index) => blockOf(group, index))
    .filter((block): block is Block => block !== null);
}

/** Is there a drawn line between two places of the same text line? Only upright text asks. */
function ruledBetween(rules: Rules, angle: number, x0: number, x1: number, y: number, size: number): boolean {
  if (Math.abs(angle) > 0.5 || x1 - x0 < size * 0.12) return false;
  const top = y - size * 0.6;
  const bottom = y - size * 0.1;
  return rules.x.some((rule) => rule.at > x0 - 0.5 && rule.at < x1 + 0.5 && rule.from < bottom && rule.to > top);
}

/** 1. Letters that follow each other. */
function fragmentsOf(glyphs: readonly Glyph[], rules: Rules): Fragment[] {
  const fragments: Fragment[] = [];
  let open: Fragment | null = null;
  let gapText = "";
  let pending: Glyph[] = [];

  for (const glyph of glyphs) {
    if (glyph.size < 0.8) continue;
    const t = turn(glyph.angle);
    const p = localOf(glyph.x, glyph.y, t);
    if (glyph.space) {
      if (open) {
        gapText += glyph.text || " ";
        pending.push(glyph);
      }
      continue;
    }
    const broken = !readable(glyph.text);
    const odd = broken || stacked(glyph.text);
    const gap: number = open ? p.x - open.x1 : 0;
    const drop: number = open ? p.y - open.y : 0;
    const reach = open ? Math.max(open.size, glyph.size) : 0;
    const loose = open !== null && odd && open.odd;
    const level = open !== null && Math.abs(drop) < open.size * (loose ? 0.6 : 0.12);
    const script =
      open !== null &&
      !level &&
      Math.abs(drop) < open.size * 0.62 &&
      (glyph.size < open.size * 0.86 || Math.abs(drop) < open.size * 0.3);
    const joins =
      open !== null &&
      open.odd === odd &&
      Math.abs(((glyph.angle - open.angle + 540) % 360) - 180) < 0.6 &&
      (level || script) &&
      gap > -reach * (loose ? 1.6 : 0.4) &&
      gap < reach * (gapText ? 1.6 : script ? 0.5 : 0.95) &&
      glyph.size < open.size * 2.2 &&
      !ruledBetween(rules, glyph.angle, open.x1, p.x, p.y, reach);
    if (open && joins) {
      const before = gapText !== "" ? gapText.replace(/[^ ]/g, " ") : gap > reach * 0.17 ? " " : "";
      for (const space of pending) open.extra.push(space);
      open.glyphs.push({ glyph, x: p.x, rise: script && !loose ? -drop : 0, before });
      open.x1 = Math.max(open.x1, p.x + glyph.w);
      open.broken ||= broken;
    } else {
      open = {
        angle: glyph.angle,
        size: glyph.size,
        x0: p.x,
        x1: p.x + glyph.w,
        y: p.y,
        glyphs: [{ glyph, x: p.x, rise: 0, before: "" }],
        extra: [],
        odd,
        broken,
      };
      fragments.push(open);
    }
    gapText = "";
    pending = [];
  }
  return fragments;
}

const textOf = (line: Fragment) => line.glyphs.map((item) => item.before + item.glyph.text).join("");

/** 2. The same line, drawn in pieces or out of order. */
function linesOf(fragments: Fragment[], rules: Rules): Fragment[] {
  fragments.sort((a, b) => a.angle - b.angle || a.y - b.y || a.x0 - b.x0);
  const lines: Fragment[] = [];
  for (const fragment of fragments) {
    let target: Fragment | null = null;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (Math.abs(line.angle - fragment.angle) > 0.6) break;
      if (fragment.y - line.y > Math.max(line.size, fragment.size) * 0.6) break;
      if (line.odd !== fragment.odd) continue;
      if (Math.abs(fragment.y - line.y) > Math.min(line.size, fragment.size) * (line.odd ? 0.5 : 0.14)) continue;
      const reach = Math.max(line.size, fragment.size);
      if (
        Math.abs(fragment.x0 - line.x0) < reach * 0.16 &&
        Math.abs(fragment.x1 - line.x1) < reach * 0.2 &&
        textOf(fragment) === textOf(line)
      ) {
        line.extra.push(...fragment.glyphs.map((item) => item.glyph), ...fragment.extra);
        target = line;
        break;
      }
      const gap = fragment.x0 - line.x1;
      const ratio = line.size / fragment.size;
      if (
        gap > -reach * 0.3 &&
        gap < reach * 0.62 &&
        ratio > 0.5 &&
        ratio < 2 &&
        !ruledBetween(rules, line.angle, line.x1, fragment.x0, fragment.y, reach)
      ) {
        const first = fragment.glyphs[0];
        line.glyphs.push(
          { ...first, before: first.before || (gap > reach * 0.17 ? " " : "") },
          ...fragment.glyphs.slice(1),
        );
        line.extra.push(...fragment.extra);
        line.broken ||= fragment.broken;
        line.x1 = Math.max(line.x1, fragment.x1);
        line.size = Math.max(line.size, fragment.size);
        target = line;
        break;
      }
    }
    if (!target) lines.push({ ...fragment, glyphs: [...fragment.glyphs], extra: [...fragment.extra] });
  }
  return lines;
}

/** 3. What stands around every line, and the marks that belong to it. */
function rowsOf(lines: Fragment[], rules: Rules): Row[] {
  const faceOf = (line: Fragment) => {
    const count = new Map<string, number>();
    for (const { glyph } of line.glyphs) {
      const key = `${glyph.font}|${glyph.size.toFixed(1)}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  let rows: Row[] = lines.map((line) => ({
    ...line,
    text: textOf(line).trim(),
    face: faceOf(line),
    lead: null,
    wallLeft: -Infinity,
    wallRight: Infinity,
    ruledLeft: false,
    ruledRight: false,
    col: { x0: line.x0, x1: line.x1 },
  }));

  const near = (a: Row, b: Row) =>
    Math.abs(a.angle - b.angle) < 0.6 && Math.abs(a.y - b.y) < Math.max(a.size, b.size) * 0.55;

  // A mark drawn on its own goes with the text to the right of it.
  const taken = new Set<Row>();
  for (const mark of rows) {
    if (mark.broken || mark.text.length > 8 || !MARK_ALONE.test(mark.text)) continue;
    let best: Row | null = null;
    for (const row of rows) {
      if (row === mark || taken.has(row) || row.broken || !near(mark, row)) continue;
      if (Math.abs(row.y - mark.y) > Math.max(row.size, mark.size) * 0.25) continue;
      const gap = row.x0 - mark.x1;
      if (gap < 0 || gap > Math.max(mark.size, row.size) * 4.5) continue;
      if (ruledBetween(rules, row.angle, mark.x1, row.x0, row.y, row.size)) continue;
      if (!best || row.x0 < best.x0) best = row;
    }
    if (!best || best.lead || MARK_ALONE.test(best.text)) continue;
    best.lead = {
      text: mark.text,
      x: mark.x0,
      glyphs: [...mark.glyphs.map((item) => item.glyph), ...mark.extra],
    };
    taken.add(mark);
  }
  rows = rows.filter((row) => !taken.has(row));

  // The same when both were drawn in one go, with more than a space between them.
  for (const row of rows) {
    if (row.lead || row.broken || row.odd) continue;
    let end = 0;
    while (end < row.glyphs.length && (end === 0 || row.glyphs[end].before === "")) end += 1;
    if (end >= row.glyphs.length || end > 6) continue;
    const word = row.glyphs.slice(0, end);
    const text = word.map((item) => item.glyph.text).join("");
    const next = row.glyphs[end];
    const last = word[word.length - 1];
    if (!MARK_ALONE.test(text) || next.x - (last.x + last.glyph.w) < row.size * 0.55) continue;
    row.lead = { text, x: row.x0, glyphs: word.map((item) => item.glyph) };
    row.glyphs = [{ ...next, before: "" }, ...row.glyphs.slice(end + 1)];
    row.x0 = next.x;
    row.text = textOf(row).trim();
    row.face = faceOf(row);
  }

  const begin = (row: Row) => row.lead?.x ?? row.x0;

  // The nearest neighbour on either side.
  for (const row of rows) {
    for (const other of rows) {
      if (other === row || !near(row, other)) continue;
      if (begin(other) > row.x1 - row.size * 0.2) row.wallRight = Math.min(row.wallRight, begin(other));
      else if (other.x1 < begin(row) + row.size * 0.2) row.wallLeft = Math.max(row.wallLeft, other.x1);
    }
    if (Math.abs(row.angle) > 0.5) continue;
    const top = row.y - row.size * 0.6;
    const bottom = row.y - row.size * 0.1;
    for (const rule of rules.x) {
      if (rule.from > bottom || rule.to < top) continue;
      if (rule.at > row.x1 - 1 && rule.at <= row.wallRight) {
        row.wallRight = rule.at;
        row.ruledRight = true;
      } else if (rule.at < begin(row) + 1 && rule.at >= row.wallLeft) {
        row.wallLeft = rule.at;
        row.ruledLeft = true;
      }
    }
  }

  // The column: as far as any line goes that shares its room.
  for (const row of rows) {
    if (row.ruledRight && row.ruledLeft) {
      const pad = Math.min(12, Math.max(1, begin(row) - row.wallLeft));
      row.col = { x0: row.wallLeft + Math.min(pad, 6), x1: row.wallRight - Math.min(pad, 6) };
      if (row.col.x1 < row.x1) row.col.x1 = row.x1;
      if (row.col.x0 > begin(row)) row.col.x0 = begin(row);
      continue;
    }
    let x0 = begin(row);
    let x1 = row.x1;
    for (const other of rows) {
      if (Math.abs(other.angle - row.angle) > 0.6 || other.broken) continue;
      if (other.x1 <= row.x0 || begin(other) >= row.x1) continue;
      if (other.x1 <= row.wallRight - row.size * 0.5) x1 = Math.max(x1, other.x1);
      if (begin(other) >= row.wallLeft + row.size * 0.5) x0 = Math.min(x0, begin(other));
    }
    row.col = { x0, x1: row.ruledRight ? Math.min(x1, row.wallRight - 2) : x1 };
  }
  return rows.sort((a, b) => a.angle - b.angle || a.y - b.y || a.x0 - b.x0);
}

/** The width of a line's first word: what would have had to fit on the line before. */
function firstWord(line: Row): number {
  let end = line.x0;
  for (const item of line.glyphs) {
    if (item.before && item !== line.glyphs[0]) break;
    end = item.x + item.glyph.w;
  }
  return end - line.x0;
}

/** 4. Lines that make a paragraph. */
function paragraphsOf(rows: Row[], pageWidth: number): Row[][] {
  // Which line comes right after which, going by place and look alone.
  const before = new Map<Row, Row>();
  const after = new Map<Row, Row>();
  rows.forEach((line, index) => {
    if (line.broken) return;
    let best: Row | null = null;
    for (let i = index - 1; i >= 0 && i > index - 80; i -= 1) {
      const last = rows[i];
      if (Math.abs(last.angle - line.angle) > 0.6) break;
      const step = line.y - last.y;
      if (step < line.size * 0.82) continue;
      if (step > line.size * 2.3) break;
      if (last.broken || line.odd !== last.odd || after.has(last)) continue;
      if (Math.abs(last.size - line.size) > line.size * 0.06) continue;
      const overlap = Math.min(last.x1, line.x1) - Math.max(last.x0, line.x0);
      if (overlap < Math.min(last.x1 - last.x0, line.x1 - line.x0) * 0.5) continue;
      if (line.x0 > last.wallRight || line.x1 < last.wallLeft) continue;
      const left = Math.abs(line.x0 - last.x0) < line.size * 3.4;
      const center = Math.abs((line.x0 + line.x1) / 2 - (last.x0 + last.x1) / 2) < line.size * 0.5;
      const right = Math.abs(line.x1 - last.x1) < line.size * 0.5;
      if (!left && !center && !right) continue;
      // The closest line above wins; of two equally close ones, the one that overlaps more.
      if (!best || last.y > best.y + line.size * 0.3) best = last;
      else if (Math.abs(last.y - best.y) < line.size * 0.3) {
        const other = Math.min(best.x1, line.x1) - Math.max(best.x0, line.x0);
        if (overlap > other) best = last;
      }
    }
    if (!best) return;
    const last = best;
    const crossed = rows.some(
      (other) =>
        other !== line &&
        other !== last &&
        Math.abs(other.angle - line.angle) < 0.6 &&
        other.y > last.y + line.size * 0.3 &&
        other.y < line.y - line.size * 0.3 &&
        Math.min(other.x1, line.x1) - Math.max(other.x0, line.x0) > line.size,
    );
    if (crossed) return;
    before.set(line, last);
    after.set(last, line);
  });

  // How far apart wrapped lines stand: measured where a sentence plainly goes on.
  const pitch = new Map<string, number>();
  {
    const seen = new Map<string, number[]>();
    for (const [line, last] of before) {
      if (!startsLower(line.text) || ends(last.text)) continue;
      const list = seen.get(line.face) ?? [];
      list.push((line.y - last.y) / line.size);
      seen.set(line.face, list);
    }
    for (const [face, list] of seen) {
      list.sort((a, b) => a - b);
      pitch.set(face, list[Math.floor(list.length / 2)]);
    }
  }

  // Columns that are narrower than the page's: several lines in a row that all end near the same edge.
  const edge = new Map<Row, number>();
  const visited = new Set<Row>();
  for (const start of rows) {
    if (visited.has(start) || before.has(start)) continue;
    const chain: Row[] = [];
    for (let row: Row | undefined = start; row && !visited.has(row); row = after.get(row)) {
      visited.add(row);
      chain.push(row);
    }
    let run: Row[] = [];
    const close = () => {
      if (run.length >= 3) {
        const x1 = Math.max(...run.map((row) => row.x1));
        let fits = 0;
        for (let i = 0; i < run.length - 1; i += 1)
          if (x1 - run[i].x1 < firstWord(run[i + 1]) + run[i].size * 0.5) fits += 1;
        const reach = run.filter((row) => x1 - row.x1 < row.size * 4).length;
        if (fits >= (run.length - 1) * 0.6 && reach >= Math.max(2, run.length * 0.4))
          for (const row of run) edge.set(row, x1);
      }
      run = [];
    };
    for (const row of chain) {
      const last = run[run.length - 1];
      if (
        last &&
        (row.lead || MARK_FIRST.test(row.text) || row.face !== last.face || Math.abs(row.x0 - last.x0) > row.size * 0.6)
      )
        close();
      run.push(row);
    }
    close();
  }

  // Where lines would end if the right margin were as wide as the left one.
  const upright = rows.filter((row) => Math.abs(row.angle) < 0.5 && !row.broken);
  const margin = upright.length > 0 ? Math.min(...upright.map((row) => row.lead?.x ?? row.x0)) : 0;
  const mirrored = pageWidth - margin;

  const joins = (group: Row[], line: Row): boolean => {
    const last = group[group.length - 1];
    const size = line.size;
    const step = line.y - last.y;
    const lower = startsLower(line.text);
    const open = !ends(last.text);

    const limit = edge.get(last) ?? last.col.x1;
    const need = firstWord(line) + size * 0.25;
    const width = last.x1 - last.x0;
    const lefts = Math.abs(line.x0 - last.x0) < size * 0.5;
    const centered =
      !lefts &&
      Math.abs((line.x0 + line.x1) / 2 - (last.x0 + last.x1) / 2) < size * 0.5 &&
      Math.abs(line.x1 - last.x1) > size * 0.5;
    const spare = centered ? limit - last.col.x0 - width : limit - last.x1;
    const full = spare < need;

    if (line.lead) return false;
    if (MARK_FIRST.test(line.text) && !(LETTER_MARK.test(line.text) && full && open && group.length > 1)) return false;
    if (LEADERS.test(last.text) || LEADERS.test(line.text)) return false;
    if (numeric(line.text) || numeric(last.text)) return false;
    if (last.ruledRight !== line.ruledRight && last.ruledLeft !== line.ruledLeft) return false;

    // Another look all along the line is another paragraph: a heading over its text.
    if (line.face !== last.face) {
      const faces = new Set(last.glyphs.map((item) => item.glyph.font));
      const shared = line.glyphs.some((item) => faces.has(item.glyph.font));
      if (!shared || !full) return false;
      if (!lower && !open) return false;
    }

    // More room between the lines than inside a paragraph.
    const usual = pitch.get(line.face);
    const ratio = step / size;
    if (usual !== undefined) {
      if (ratio > usual * 1.3) return false;
      if (ratio > usual * 1.05 && !(lower && open && full)) return false;
    } else if (ratio > 1.62 && !(lower && open)) return false;
    if (group.length > 1) {
      const own = (last.y - group[0].y) / (group.length - 1);
      if (Math.abs(step - own) > own * 0.08) return false;
    }

    // Pushed in or out.
    if (!centered) {
      const second = group[1] ?? null;
      if (second) {
        if (Math.abs(line.x0 - second.x0) > size * 0.75 && Math.abs(line.x1 - second.x1) > size * 0.5) return false;
      } else {
        const shift = line.x0 - last.x0;
        // Only a list mark lets the lines after it hang further in.
        if (shift > size * 0.75 && !(last.lead || MARK_FIRST.test(last.text))) return false;
        if (shift < -size * 0.75 && (last.lead || !full)) return false;
      }
    }

    if (full) {
      // Short lines one under another are cells or items, unless a sentence plainly goes on.
      const narrow = width < size * 9 && line.x1 - line.x0 < size * 9;
      if (narrow && !lower && !(last.ruledRight && open)) return false;
      // A sentence that ends on the longest line around, then a new one: only together if the page had no room left.
      if (group.length === 1 && !edge.has(last) && !open && startsUpper(line.text) && Math.abs(line.angle) < 0.5) {
        const far = last.wallRight < Infinity ? limit : Math.max(limit, Math.min(mirrored, limit + size * 12));
        if (far - last.x1 >= need) return false;
      }
      return true;
    }
    if (hyphenated(last.text) && lower) return true;
    return lower && open && width > size * 14 && spare < size * 7;
  };

  const done = new Set<Row>();
  const out: Row[][] = [];
  for (const start of rows) {
    if (done.has(start)) continue;
    let group = [start];
    done.add(start);
    for (let next = after.get(start); next && !done.has(next); next = after.get(next)) {
      done.add(next);
      if (joins(group, next)) group.push(next);
      else {
        out.push(group);
        group = [next];
      }
    }
    out.push(group);
  }
  // In reading order again: the chains were followed one after another.
  return out.sort((a, b) => a[0].angle - b[0].angle || a[0].y - b[0].y || a[0].x0 - b[0].x0);
}

// ---------------------------------------------------------------- 5. as blocks

function runsOf(line: Row): { runs: Run[]; cells: [number, number, number][] } {
  const runs: Run[] = [];
  const cells: [number, number, number][] = [];
  let at = 0;
  for (const item of line.glyphs) {
    const { glyph } = item;
    const style: Style = {
      font: glyph.font,
      size: Math.round(glyph.size * 100) / 100,
      color: glyph.color,
      bold: false,
      italic: glyph.slant,
      underline: false,
      strike: false,
      tracking: 0,
      rise: Math.abs(item.rise) > 0.05 ? Math.round(item.rise * 100) / 100 : 0,
    };
    if (item.before) {
      runs.push({ text: item.before, style: runs[runs.length - 1]?.style ?? style });
      at += item.before.length;
    }
    cells.push([at, item.x, item.x + glyph.w]);
    runs.push({ text: glyph.text, style });
    at += glyph.text.length;
  }
  return { runs: tidyRuns(runs), cells };
}

function blockOf(lines: Row[], index: number): Block | null {
  const { angle } = lines[0];
  const t = turn(angle);
  const size = Math.max(...lines.map((line) => line.size));
  const x0 = Math.min(...lines.map((line) => line.x0));
  const x1 = Math.max(...lines.map((line) => line.x1));
  const leading = lines.length > 1 ? (lines[lines.length - 1].y - lines[0].y) / (lines.length - 1) : size * 1.2;
  const ascent = firstBaseline(size, leading);
  const top = lines[0].y - ascent;
  const { lead } = lines[0];
  // As far as every one of its lines may go.
  const col = {
    x0: Math.min(lead?.x ?? x0, Math.max(...lines.map((line) => line.col.x0))),
    x1: Math.max(x1, Math.min(...lines.map((line) => line.col.x1))),
  };

  let align: Align = "left";
  const near = (a: number, b: number, k: number) => Math.abs(a - b) < size * k;
  if (lines.length > 1) {
    const full = lines.slice(0, -1);
    const lefts = lines.every((item, i) => near(item.x0, x0, 0.4) || (i === 0 && item.x0 - x0 < size * 3.4));
    const rights = full.every((item) => near(item.x1, x1, 0.12));
    const centers = lines.every((item) => near((item.x0 + item.x1) / 2, (x0 + x1) / 2, 0.4));
    if (lefts) align = rights && full.length > 1 ? "justify" : "left";
    else if (centers) align = "center";
    else if (lines.every((item) => near(item.x1, x1, 0.4))) align = "right";
    else align = rights && full.length > 1 ? "justify" : "left";
  } else if (!lead) {
    // A single line shows its side by the room it leaves.
    const leftRoom = x0 - col.x0;
    const rightRoom = col.x1 - x1;
    const cell = lines[0].ruledLeft && lines[0].ruledRight;
    if (Math.abs(leftRoom - rightRoom) < size * (cell ? 0.25 : 0.6) && leftRoom > size * (cell ? 0.7 : 1.5))
      align = "center";
    else if (rightRoom < size * 0.3 && leftRoom > size * 4) align = "right";
  }

  const byOp = new Map<number, Set<number>>();
  const note = (glyph: Glyph) => {
    let set = byOp.get(glyph.op);
    if (!set) byOp.set(glyph.op, (set = new Set()));
    set.add(glyph.at);
  };
  for (const item of lines) {
    item.glyphs.forEach(({ glyph }) => note(glyph));
    item.extra.forEach(note);
  }
  lead?.glyphs.forEach(note);
  const ranges: GlyphRange[] = [];
  for (const [op, set] of byOp) {
    const at = [...set].sort((a, b) => a - b);
    let from = at[0];
    for (let i = 1; i <= at.length; i += 1) {
      if (at[i] === at[i - 1] + 1) continue;
      ranges.push([op, from, at[i - 1] + 1]);
      from = at[i];
    }
  }

  const read = lines.map(runsOf);
  // With a mark of its own the box starts at the mark, and the text hangs.
  const left = lead ? Math.min(lead.x, x0) : x0;
  const out = lines.map((item, i) => ({ runs: read[i].runs, x: item.x0 - left, width: item.x1 - item.x0 }));
  const text = out.map((item) => item.runs.map((run) => run.text).join("")).join("\n");
  if (text.trim() === "") return null;
  const corner = pageOfLocal(left, top, t);
  return {
    key: `b${index}`,
    angle: Math.abs(angle) < 0.05 ? 0 : angle,
    x: corner.x,
    y: corner.y,
    w: x1 - left,
    h: leading * lines.length,
    lines: out,
    align,
    size,
    leading,
    ascent,
    alpha: lines[0].glyphs[0].glyph.alpha,
    ranges,
    text,
    rows: lines.map((item, i) => ({ x0: item.x0, x1: item.x1, y: item.y, size: item.size, cells: read[i].cells })),
    list: lead ? { ...listOf(lead.text), gap: lines[0].x0 - left } : null,
    col,
    free: {
      left: lines.every((line) => line.wallLeft === -Infinity),
      right: lines.every((line) => line.wallRight === Infinity),
    },
  };
}
