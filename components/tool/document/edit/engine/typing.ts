import type { List, Para, Run, Style, TextBody } from "../model";
import {
  allParas,
  editBody,
  levelMark,
  listStep,
  paraAt,
  paraOf,
  parasIn,
  plainText,
  setParas,
  sliceRuns,
  styleAt,
  styleRuns,
  tidyParas,
  tidyRuns,
  type BodyEdit,
} from "../model";
import { SOFT, paraSize } from "./text-dom";

/** What keys do to a text: new lines, lists that go on and end, levels, and lists that start by themselves. */

type Body = Pick<TextBody, "runs" | "paras">;
export type Typed = BodyEdit & { from: number; to: number };

const DEEP = 8;

/** Text size where a paragraph starts, for the steps of lists. */
function sizeAt(body: Body, index: number): number {
  const text = plainText(body.runs);
  let at = 0;
  for (let i = 0; i < index; i += 1) at = text.indexOf("\n", at) + 1;
  return styleAt(body.runs, at).size;
}

/** A paragraph as a list item of a level, its text one step further in than its mark. */
export function listed(para: Para, list: Pick<List, "type" | "mark" | "start">, level: number, size: number): Para {
  const step = listStep(size);
  return {
    ...para,
    first: undefined,
    left: step * (level + 1),
    list: { ...list, level, gap: step },
  };
}

const unlisted = (para: Para): Para => ({ ...para, list: undefined, left: undefined, first: undefined });

/** Moves list items (or plain paragraphs) a step in or out. */
export function stepParas(body: Body, from: number, to: number, by: 1 | -1): Para[] | undefined {
  return setParas(body, from, to, (para, i) => {
    if (para.list) {
      const { list } = para;
      const level = list.level + by;
      if (level < 0) return unlisted(para);
      if (level > DEEP) return para;
      const step = list.gap > 4 ? list.gap : listStep(sizeAt(body, i));
      return {
        ...para,
        left: Math.max(list.gap, (para.left ?? list.gap) + by * step),
        list: { ...list, level, mark: levelMark(list.mark, list.level, level), start: undefined, resume: undefined },
      };
    }
    const left = Math.max(0, (para.left ?? 0) + by * 36);
    return { ...para, left: left || undefined };
  });
}

/** Text typed or pasted over a selection. */
export function insertText(body: Body, from: number, to: number, text: string, style?: Style): Typed {
  const at = from + text.length;
  return { ...editBody(body, from, to, text, style), from: at, to: at };
}

/** Words with their looks, and their paragraphs, over a selection. */
export function insertBody(body: Body, from: number, to: number, more: BodyEdit): Typed {
  const text = plainText(more.runs);
  const at = from + text.length;
  const next = editBody(body, from, to, text);
  const runs = tidyRuns([
    ...sliceRuns(next.runs, 0, from),
    ...more.runs,
    ...sliceRuns(next.runs, at, plainText(next.runs).length),
  ]);
  let { paras } = next;
  const breaks = text.split("\n").length - 1;
  if (more.paras && breaks > 0) {
    const first = paraAt(runs, from).index;
    const own = allParas({ runs, paras });
    // A line pasted into the middle of another keeps the look of that one.
    const start = paraAt(runs, from).from === from ? 0 : 1;
    for (let i = start; i <= breaks; i += 1) own[first + i] = more.paras[i] ?? {};
    paras = tidyParas(own);
  } else if (more.paras && plainText(body.runs) === "") paras = tidyParas([more.paras[0] ?? {}]);
  return { runs, paras, from: at, to: at };
}

/** The Enter key. On an empty list item it ends the list. */
export function pressEnter(body: Body, from: number, to: number, soft: boolean, style?: Style): Typed {
  if (soft) return insertText(body, from, to, SOFT, style);
  if (from === to) {
    const { index, from: start, to: end } = paraAt(body.runs, from);
    const para = paraOf(body, index);
    if (para.list && start === end) {
      const paras = para.list.level > 0 ? stepParas(body, index, index, -1) : setParas(body, index, index, unlisted);
      return { runs: body.runs, paras, from, to };
    }
  }
  return insertText(body, from, to, "\n", style);
}

/** Backspace at the start of a paragraph: first the list goes, then the indent, then the line end. Null: nothing special. */
export function pressBackspace(body: Body, from: number, to: number): Typed | null {
  if (from !== to) return null;
  const { index, from: start } = paraAt(body.runs, from);
  if (start !== from) return null;
  const para = paraOf(body, index);
  if (para.list) return { runs: body.runs, paras: setParas(body, index, index, unlisted), from, to };
  if (para.left || para.first)
    return {
      runs: body.runs,
      paras: setParas(body, index, index, (item) => ({ ...item, left: undefined, first: undefined })),
      from,
      to,
    };
  return null;
}

/** Tab: deeper in a list, further in at the start of a line, a gap anywhere else. */
export function pressTab(body: Body, from: number, to: number, back: boolean, style?: Style): Typed {
  const [first, last] = parasIn(body.runs, from, to);
  const { from: start } = paraAt(body.runs, from);
  const para = paraOf(body, first);
  const many = last > first;
  if (many || (para.list && (from === start || from !== to)) || (back && (para.list || para.left || para.first))) {
    if (back && !para.list && !many && para.first)
      return {
        runs: body.runs,
        paras: setParas(body, first, first, (item) => ({ ...item, first: undefined })),
        from,
        to,
      };
    return { runs: body.runs, paras: stepParas(body, first, last, back ? -1 : 1), from, to };
  }
  if (back) return { runs: body.runs, paras: body.paras, from, to };
  if (from === to && from === start && plainText(body.runs).length > 0 && !para.list) {
    // As in Word: first the line, then the whole paragraph.
    const paras = setParas(body, first, first, (item) =>
      item.first ? { ...item, first: undefined, left: (item.left ?? 0) + 36 } : { ...item, first: 36 },
    );
    return { runs: body.runs, paras, from, to };
  }
  return insertText(body, from, to, "\t", style);
}

// ---------------------------------------------------------------- lists

/** The same list for some paragraphs, or none when they all have it already. */
export function toggleList(
  body: Body,
  from: number,
  to: number,
  list: Pick<List, "type" | "mark">,
): Para[] | undefined {
  const paras = allParas(body).slice(from, to + 1);
  const on = paras.every(
    (para) => para.list?.type === list.type && para.list.mark === levelMark(list.mark, 0, para.list.level),
  );
  if (on) return setParas(body, from, to, unlisted);
  return setParas(body, from, to, (para, i) => {
    const level = para.list?.level ?? 0;
    return listed(para, { type: list.type, mark: levelMark(list.mark, 0, level) }, level, sizeAt(body, i));
  });
}

export const clearList = (body: Body, from: number, to: number) =>
  setParas(body, from, to, (para) => (para.list ? unlisted(para) : para));

/** What was typed at the start of a line, as the list it means. */
function listMeant(text: string): Pick<List, "type" | "mark" | "start"> | null {
  const number = /^(\(?)(\d{1,3}|[aAiI])([.)])$/.exec(text);
  if (number) {
    const [, open, value, close] = number;
    if (open && close !== ")") return null;
    if (/^\d/.test(value)) {
      const start = Number(value);
      return { type: "number", mark: `${open}1${close}`, start: start === 1 ? undefined : start };
    }
    return { type: "number", mark: `${open}${value}${close}` };
  }
  const bullets: Record<string, string> = {
    "*": "•",
    "•": "•",
    "-": "–",
    "–": "–",
    ">": "➤",
    "->": "➤",
    "[]": "☐",
    "[ ]": "☐",
    "[x]": "☑",
    o: "◦",
    "+": "◆",
  };
  const mark = bullets[text];
  return mark ? { type: "bullet", mark } : null;
}

/** A space was typed: "1." and the like at the start of a line become a list. Null when nothing does. */
export function listByTyping(body: Body, caret: number): Typed | null {
  const { index, from } = paraAt(body.runs, caret);
  const para = paraOf(body, index);
  if (para.list) return null;
  const typed = plainText(body.runs).slice(from, caret);
  if (!typed.endsWith(" ")) return null;
  const list = listMeant(typed.slice(0, -1));
  if (!list) return null;
  const next = editBody(body, from, caret, "");
  const size = sizeAt(body, index);
  return {
    runs: next.runs,
    paras: setParas(next, index, index, (item) => listed(item, list, 0, size)),
    from,
    to: from,
  };
}

const SHORT: [string, string][] = [
  ["-->", "→"],
  ["->", "→"],
  ["<-", "←"],
  ["=>", "⇒"],
  ["(c)", "©"],
  ["(r)", "®"],
  ["(tm)", "™"],
  ["...", "…"],
  ["1/2", "½"],
  ["1/4", "¼"],
  ["3/4", "¾"],
  ["+-", "±"],
];

/** A space or a stop was typed: "->" becomes an arrow, "(c)" the sign. Null when nothing does. */
export function signByTyping(body: Body, caret: number): Typed | null {
  const text = plainText(body.runs);
  const word = text.slice(Math.max(0, caret - 8), caret - 1);
  for (const [from, to] of SHORT) {
    if (!word.toLowerCase().endsWith(from)) continue;
    const start = caret - 1 - from.length;
    const before = text[start - 1];
    if (before && !/[\s(]/.test(before) && /^[\d(]/.test(from) && from !== "(c)" && from !== "(r)" && from !== "(tm)")
      continue;
    const next = editBody(body, start, caret - 1, to);
    const at = caret - from.length + to.length;
    return { ...next, from: at, to: at };
  }
  return null;
}

/** A space was typed after an address: it becomes a link. Null when it was not one. */
export function linkByTyping(body: Body, caret: number): Typed | null {
  const text = plainText(body.runs);
  const { from } = paraAt(body.runs, caret);
  const word = /\S+$/.exec(text.slice(from, caret - 1))?.[0] ?? "";
  const bare = word.replace(/[.,;:!?)\]]+$/, "");
  if (!/^(https?:\/\/[^\s]{3,}|www\.[^\s.]+\.[^\s]{2,}|[\w.+-]+@[\w-]+(\.[\w-]+)+)$/i.test(bare)) return null;
  const start = caret - 1 - word.length;
  if (styleAt(body.runs, start + 1).link) return null;
  const url =
    bare.includes("@") && !/^https?:/i.test(bare) ? `mailto:${bare}` : /^www\./i.test(bare) ? `https://${bare}` : bare;
  return {
    runs: styleRuns(body.runs, start, start + bare.length, (style) => ({
      ...style,
      link: url,
      underline: true,
      color: "#1c5fc4",
    })),
    paras: body.paras,
    from: caret,
    to: caret,
  };
}

// ---------------------------------------------------------------- letters

export type Case = "upper" | "lower" | "title" | "sentence";

/** Capitals, small letters, and the like, run by run so every look stays. */
export function changeCase(runs: readonly Run[], from: number, to: number, how: Case): Run[] {
  const text = plainText(runs);
  const part = text.slice(from, to);
  let next = part;
  if (how === "upper") next = part.toUpperCase();
  else if (how === "lower") next = part.toLowerCase();
  else if (how === "title")
    next = part.toLowerCase().replace(/(^|[\s(“"'\-–—/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  else
    next = part
      .toLowerCase()
      .replace(/(^|[.!?]\s+|\n)(["“'(]*)(\p{L})/gu, (_, a: string, b: string, c: string) => a + b + c.toUpperCase());
  // Letters that change their number (ß) are left alone, so every look keeps its place.
  if (next.length !== part.length)
    next = [...part]
      .map((ch, i) => (next[i] && [...next][i]?.length === ch.length ? [...next][i] : ch))
      .join("")
      .slice(0, part.length);
  let at = 0;
  return tidyRuns(
    runs.map((run) => {
      let out = "";
      for (let i = 0; i < run.text.length; i += 1) {
        const place = at + i;
        out += place >= from && place < to ? next[place - from] : run.text[i];
      }
      at += run.text.length;
      return { ...run, text: out };
    }),
  );
}

/** Leading of every paragraph in proportion to its own text. */
export function spaced(body: TextBody, times: number): { leading: number; paras: Para[] | undefined } {
  const text = plainText(body.runs).split("\n");
  const sizes: number[] = [];
  let at = 0;
  for (const part of text) {
    const runs: Run[] = [];
    let from = 0;
    for (const run of body.runs) {
      const a = Math.max(at, from);
      const b = Math.min(at + part.length, from + run.text.length);
      if (b > a || (part.length === 0 && at >= from && at <= from + run.text.length)) runs.push(run);
      from += run.text.length;
    }
    sizes.push(paraSize(runs));
    at += part.length + 1;
  }
  const base = Math.max(...sizes);
  return {
    leading: times * base,
    paras: tidyParas(
      allParas(body).map((para, i) => ({
        ...para,
        leading: Math.abs(sizes[i] - base) > 0.1 ? times * sizes[i] : undefined,
      })),
    ),
  };
}
