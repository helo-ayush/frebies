import type {
  FlowAlign,
  FlowBlock,
  FlowBox,
  FlowDoc,
  FlowImage,
  FlowLine,
  FlowPara,
  FlowRun,
  FlowSection,
  FlowStyle,
  FlowTable,
} from "./flow";
import {
  attr,
  bodyLook,
  boxFill,
  boxLine,
  boxPad,
  bulletText,
  clamp,
  clean,
  eachDocPara,
  finite,
  fontKind,
  fontName,
  gridOf,
  hasWords,
  headingOf,
  hex,
  href,
  isBehind,
  isBlank,
  isLineShape,
  isLoose,
  isMono,
  isRtl,
  ListBook,
  ListCounter,
  markPattern,
  paperOf,
  Pictures,
  pieces,
  pt,
  shapeName,
  shapeParts,
  shapeRoom,
  short,
  sideOf,
  STAND_IN,
  stopsOf,
  sumCols,
  textOf,
  turnedSize,
  usualLook,
  xml,
  type BookItem,
  type Grid,
  type Look,
  type Piece as RunPiece,
  type Placed,
} from "./write-kit";

/** Plain text, Markdown and web pages. */

const altOf = (image: FlowImage) =>
  clean(image.alt ?? "")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------- plain text

/** Pictures leave what they are called. */
const plainText = (para: FlowPara) =>
  clean(para.runs.map((run) => (run.image ? altOf(run.image) && ` [${altOf(run.image)}] ` : run.text)).join(""))
    .replace(/ +(\[[^\]\n]*\]) +/g, " $1 ")
    .replace(/\u{ad}/gu, "")
    .trimEnd();

function cellText(blocks: readonly FlowPara[]): string {
  const lists = new ListCounter();
  return blocks
    .map((para) => {
      if (!para.list) lists.stop();
      const label = para.list ? `${lists.next(para.list).label} ` : "";
      return (label + plainText(para)).replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join(" ");
}

/** The words of every place of a table. Spans leave empty places. */
const rowsOf = <T>(grid: Grid, read: (placed: Placed) => T, empty: T): T[][] =>
  grid.rows.map(({ slots }, r) =>
    slots.map((placed, c) => (placed && placed.row === r && placed.col === c ? read(placed) : empty)),
  );

type Chunk = { list: boolean; text: string };

/** Items of a list stand together, everything else has an empty line around it. */
const joinChunks = (chunks: readonly Chunk[]) =>
  chunks.reduce((out, { list, text }, i) => {
    if (i === 0) return text;
    return out + (list && chunks[i - 1].list ? "\n" : "\n\n") + text;
  }, "");

function textChunks(blocks: readonly FlowBlock[], lists: ListCounter): Chunk[] {
  return blocks.flatMap((block): Chunk[] => {
    if (block.kind === "box") return textChunks(block.blocks, new ListCounter());
    if (block.kind !== "para") {
      if (block.kind === "break") return [];
      lists.stop();
      if (block.kind === "rule") return [{ list: false, text: "-".repeat(40) }];
      const rows = rowsOf(gridOf(block), ({ cell }) => cellText(cell.blocks), "");
      return rows.length > 0 ? [{ list: false, text: rows.map((row) => row.join("\t")).join("\n") }] : [];
    }
    const words = plainText(block)
      .replace(/[ \t]+$/gm, "")
      .replace(/^ (?=\[)/, "");
    if (!block.list) {
      lists.stop();
      return words.trim() ? [{ list: false, text: words }] : [];
    }
    const { level, label } = lists.next(block.list);
    const lead = `${"  ".repeat(level)}${label} `;
    return [{ list: true, text: lead + words.replace(/\n/g, `\n${" ".repeat(lead.length)}`) }];
  });
}

export function writeText(doc: FlowDoc): string {
  const sections = doc.sections.map((section) => joinChunks(textChunks(section.blocks, new ListCounter())));
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

// ---------------------------------------------------------------- Markdown

type Mark = "bold" | "italic" | "strike";
type Piece = { text: string; marks: Mark[]; code: boolean; script?: "super" | "sub"; link: string | null };

const SIGNS: Record<Mark, { plain: string; open: string; close: string }> = {
  bold: { plain: "**", open: "<strong>", close: "</strong>" },
  italic: { plain: "*", open: "<em>", close: "</em>" },
  strike: { plain: "~~", open: "<del>", close: "</del>" },
};

const isSpace = (sign: string) => sign === "" || /\s/.test(sign);
const isSign = (sign: string) => /[\p{P}\p{S}]/u.test(sign);
const firstOf = (text: string) => (text ? String.fromCodePoint(text.codePointAt(0) ?? 32) : "");
const lastOf = (text: string) => firstOf(/[\s\S]$/u.exec(text)?.[0] ?? "");

/** Signs that would mean something in the middle of a line. */
const escapeWords = (text: string) =>
  text.replace(/[\\`*_[\]<~]|&(?=#?\w+;)/g, (sign, at: number) => {
    // At the edge of a piece another sign may follow.
    const [before, after] = [text[at - 1] ?? sign, text[at + 1] ?? sign];
    if (sign === "_" && /\w/.test(before) && /[^\W_]/.test(after)) return sign;
    if (sign === "*" && before === " " && after === " ") return sign;
    if (sign === "~" && before !== "~" && after !== "~") return sign;
    return `\\${sign}`;
  });

/** Signs that would mean something at its start. */
const escapeStart = (line: string) =>
  line
    .replace(/^[ \t]+/, "")
    .replace(/^(#{1,6}(?=\s|$)|[*+-](?=\s|$)|>|=+\s*$|([-*_])(?=(\s*\2)+\s*$)|~{3})/, "\\$1")
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2");

function codeSpan(text: string): string {
  const words = text.replace(/\n/g, " ");
  const longest = Math.max(0, ...[...words.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = /^`|`$|^ .* $/.test(words) ? " " : "";
  return fence + pad + words + pad + fence;
}

const lookOf = ({ marks, code, script, link }: Piece) => [marks.join("+"), code, script, link].join(" ");

/** Runs as pieces that look alike, with the spaces around emphasised words kept outside. */
function piecesOf(para: FlowPara, how: { bold: boolean }): Piece[] {
  const out: Piece[] = [];
  const add = (piece: Piece) => {
    const last = out[out.length - 1];
    if (last && lookOf(last) === lookOf(piece)) last.text += piece.text;
    else out.push(piece);
  };
  for (const run of para.runs) {
    if (run.image) {
      if (altOf(run.image)) add({ text: ` [${altOf(run.image)}] `, marks: [], code: false, link: null });
      continue;
    }
    const text = clean(run.text).replace(/[\u{ad}\u{200b}]/gu, "");
    if (!text) continue;
    const { style } = run;
    const marks: Mark[] = [];
    if (style.bold && how.bold) marks.push("bold");
    if (style.italic) marks.push("italic");
    if (style.strike) marks.push("strike");
    add({ text, marks, code: isMono(style.font), script: style.script, link: href(style.link) });
  }
  // Emphasis cannot start or end with a space.
  const tidy: Piece[] = [];
  out.forEach((piece, i) => {
    const [, lead, words, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(piece.text) ?? ["", "", piece.text, ""];
    const around = (other: Piece | undefined) => ({
      marks: piece.marks.filter((mark) => other?.marks.includes(mark)),
      code: false,
      link: piece.link !== null && other?.link === piece.link ? piece.link : null,
    });
    if (words === "") return tidy.push({ text: piece.text, ...around(out[i + 1]), marks: [] });
    if (lead) tidy.push({ text: lead, ...around(out[i - 1]) });
    tidy.push({ ...piece, text: words });
    if (trail) tidy.push({ text: trail, ...around(out[i + 1]) });
    return undefined;
  });
  return tidy;
}

type Token =
  { text: string; mark?: undefined } | { text?: undefined; mark: Mark; opens: boolean; span: { html: boolean } };

/** Opens and closes emphasis so that it is always properly nested. */
function tokensOf(list: readonly Piece[], write: (piece: Piece) => string): Token[] {
  const out: Token[] = [];
  const open: { mark: Mark; span: { html: boolean } }[] = [];
  const reach = (mark: Mark, from: number) => {
    let to = from;
    while (list[to]?.marks.includes(mark)) to += 1;
    return to;
  };
  for (let i = 0; i <= list.length; i += 1) {
    const want = list[i]?.marks ?? [];
    const keep = open.findIndex(({ mark }) => !want.includes(mark));
    while (keep >= 0 && open.length > keep) {
      const top = open.pop();
      if (top) out.push({ ...top, opens: false });
    }
    const missing = want.filter((mark) => !open.some((one) => one.mark === mark));
    // What lasts longest goes outside.
    for (const mark of missing.sort((a, b) => reach(b, i) - reach(a, i))) {
      const one = { mark, span: { html: false } };
      open.push(one);
      out.push({ ...one, opens: true });
    }
    if (list[i]) out.push({ text: write(list[i]) });
  }
  return out;
}

/** Stars only work next to some signs; where they would not, tags do. */
function emphasise(tokens: readonly Token[]): string {
  /** The sign a neighbour shows on its near side. */
  const edge = (token: Token | undefined, end: "first" | "last"): string => {
    if (!token) return "";
    if (token.mark === undefined) return end === "first" ? firstOf(token.text) : lastOf(token.text);
    if (token.span.html) return end === "first" ? "<" : ">";
    return SIGNS[token.mark].plain[0];
  };
  const isPlain = (token: Token | undefined, sign: string) =>
    token?.mark !== undefined && !token.span.html && SIGNS[token.mark].plain[0] === sign;
  // A tag in place of a sign changes what its neighbours stand next to.
  for (let again = true; again;) {
    again = false;
    let stars = 0;
    let before = "";
    let open = 0;
    tokens.forEach((token, i) => {
      if (token.mark === undefined || token.span.html) return;
      const sign = SIGNS[token.mark].plain[0];
      const last = tokens[i - 1];
      // Signs of the same kind next to each other count as one.
      if (!isPlain(last, sign)) {
        before = edge(last, "last");
        open = stars;
      }
      let to = i;
      while (isPlain(tokens[to + 1], sign)) to += 1;
      const after = edge(tokens[to + 1], "first");
      const [inner, outer] = token.opens ? [after, before] : [before, after];
      const closes = !isSpace(before) && (!isSign(before) || isSpace(after) || isSign(after));
      const bad =
        isSpace(inner) ||
        (isSign(inner) && !isSpace(outer) && !isSign(outer)) ||
        // Right after the end of another, or inside another it could be the end of.
        (token.opens && last?.mark !== undefined && !last.opens) ||
        (token.opens && sign === "*" && open > 0 && closes);
      if (bad) {
        token.span.html = true;
        again = true;
      } else if (sign === "*") stars += token.opens ? 1 : -1;
    });
  }
  return tokens
    .map((token) => {
      if (token.mark === undefined) return token.text;
      const sign = SIGNS[token.mark];
      return token.span.html ? (token.opens ? sign.open : sign.close) : sign.plain;
    })
    .join("");
}

function inline(para: FlowPara, how: { bold: boolean; table?: boolean }): string {
  const list = piecesOf(para, how);
  const write = ({ text, code, script }: Piece) => {
    let words = code && text.trim() ? codeSpan(text) : escapeWords(text);
    if (script && text.trim()) words = script === "super" ? `<sup>${words}</sup>` : `<sub>${words}</sub>`;
    return how.table ? words.replace(/\|/g, "\\|").replace(/\n/g, "<br>") : words;
  };
  const tokens: Token[] = [];
  for (let i = 0; i < list.length;) {
    let end = i + 1;
    while (end < list.length && list[end].link === list[i].link) end += 1;
    const link = list[i].link;
    const own = tokensOf(list.slice(i, end), write);
    const target = link?.replace(/[()]/g, (sign) => (sign === "(" ? "%28" : "%29"));
    const last = tokens[tokens.length - 1];
    // "!" in front of it would make it a picture.
    if (target && last?.text?.endsWith("!")) last.text = `${last.text.slice(0, -1)}\\!`;
    if (target) tokens.push({ text: `[${emphasise(own).replace(/\n/g, " ")}](${target})` });
    else tokens.push(...own);
    i = end;
  }
  const text = emphasise(tokens).trim();
  return text.split("\n").map(escapeStart).join("\\\n");
}

const isCode = (para: FlowPara) =>
  !para.list &&
  !para.heading &&
  para.runs.every((run) => !run.image && (isMono(run.style.font) || run.text.trim() === "")) &&
  textOf(para).trim() !== "";

const taskOf = (mark: string) => (/^[☐□❏]$/u.test(mark) ? "[ ] " : /^[☑☒✅]$/u.test(mark) ? "[x] " : "");

/** Lists that are open, outermost first. */
type OpenList = { level: number; wide: number; sign: string };

class MarkdownWriter {
  private lists = new ListCounter();
  private open: OpenList[] = [];
  private code: string[] = [];
  private out: Chunk[] = [];

  add(block: FlowBlock) {
    if (block.kind === "para" && (isCode(block) || (this.code.length > 0 && isBlank(block)))) {
      this.stop();
      this.code.push(textOf(block));
      return;
    }
    this.endCode();
    if (block.kind === "para" && block.list) return this.item(block);
    if (block.kind === "break") return;
    if (block.kind === "box") {
      const inner = new MarkdownWriter();
      block.blocks.forEach((para) => inner.add(para));
      this.out.push(...inner.end());
      return;
    }
    this.stop();
    if (block.kind === "rule") this.out.push({ list: false, text: "---" });
    else if (block.kind === "table") this.table(block);
    else this.para(block);
  }

  private stop() {
    this.lists.stop();
    this.open = [];
  }

  private endCode() {
    if (this.code.length === 0) return;
    const text = this.code.join("\n").trimEnd();
    const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = "`".repeat(longest + 1);
    this.out.push({ list: false, text: `${fence}\n${text}\n${fence}` });
    this.code = [];
  }

  private para(para: FlowPara) {
    const level = headingOf(para);
    const bold = !level || para.runs.some((run) => run.text?.trim() && !run.style.bold);
    const text = inline(para, { bold });
    if (!text) return;
    const line = text.replace(/\\?\n/g, " ");
    this.out.push({ list: false, text: level ? `${"#".repeat(level)} ${line.replace(/(#+)$/, "\\$1")}` : text });
  }

  private item(para: FlowPara) {
    if (!para.list) return;
    const { level, label, value, fresh } = this.lists.next(para.list);
    while (this.open.length > 0 && this.open[this.open.length - 1].level > level) this.open.pop();
    const was = this.open[this.open.length - 1]?.level === level ? this.open.pop() : undefined;
    const indent = this.open.reduce((sum, one) => sum + one.wide, 0);
    const number = para.list.type === "number";
    let sign = was?.sign ?? "";
    if (!number) sign = "-";
    else if (!was || fresh) {
      // The same sign would go on with the list before.
      const usual = /\)\s*$/.test(para.list.mark) ? ")" : ".";
      sign = was?.sign !== usual ? usual : usual === "." ? ")" : ".";
    }
    const task = number ? "" : taskOf(label);
    const lead = number ? `${value}${sign} ` : `${sign} `;
    this.open.push({ level, wide: lead.length, sign });
    const text = inline(para, { bold: true }).replace(/\n/g, `\n${" ".repeat(indent + lead.length)}`);
    // Only a list from 1 can follow words without an empty line.
    const gap = number && value !== 1 && fresh && indent > 0 ? "\n" : "";
    this.out.push({ list: true, text: `${gap}${" ".repeat(indent)}${lead}${task}${text}`.replace(/[ \t]+$/, "") });
  }

  private table(table: FlowTable) {
    const grid = gridOf(table);
    if (grid.rows.length === 0) return;
    const words = ({ cell, row }: Placed) => {
      const lists = new ListCounter();
      const lines = cell.blocks.map((para) => {
        if (!para.list) lists.stop();
        const label = para.list ? `${escapeWords(lists.next(para.list).label)} ` : "";
        return label + inline(para, { bold: row > 0, table: true });
      });
      return lines.filter((line) => line.trim()).join("<br>");
    };
    const rows = rowsOf(grid, words, "");
    const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
    const rules = grid.cols.map((_, c) => {
      const column = grid.cells.filter(({ col, row }) => col === c && row > 0);
      const aligns = new Set(column.map(({ cell }) => cell.blocks[0]?.align ?? "left"));
      const align = aligns.size === 1 ? [...aligns][0] : "left";
      return align === "center" ? ":---:" : align === "right" ? "---:" : "---";
    });
    this.out.push({ list: false, text: [line(rows[0]), line(rules), ...rows.slice(1).map(line)].join("\n") });
  }

  end(): Chunk[] {
    this.endCode();
    return this.out;
  }
}

export function writeMarkdown(doc: FlowDoc): string {
  const sections = doc.sections.map((section) => {
    const writer = new MarkdownWriter();
    section.blocks.forEach((block) => writer.add(block));
    return joinChunks(writer.end());
  });
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

// ---------------------------------------------------------------- web pages

const FALLBACK = { sans: "sans-serif", serif: "serif", mono: "monospace", script: "cursive" };

function familyCss(font: string): string {
  const kind = fontKind(font);
  const names = [...new Set([font, STAND_IN[kind]])].map((name) => `"${name.replace(/["\\<>]/g, "")}"`);
  return `${names.join(", ")}, ${FALLBACK[kind]}`;
}

const colorCss = (color: string | null | undefined) => `#${(hex(color) ?? "000000").toLowerCase()}`;
const DASHES = { solid: "solid", dash: "dashed", dot: "dotted" };
const lineCss = (line: FlowLine) =>
  `${pt(Math.max(0.5, line.width))} ${DASHES[line.dash ?? "solid"]} ${colorCss(line.color)}`;

/** Rules are made as they are needed; the same look twice is one class. */
class Sheet {
  readonly rules: string[] = [];
  private names = new Map<string, string>();
  private counts = new Map<string, number>();

  use(prefix: string, css: readonly string[]): string {
    const body = css.filter(Boolean).join("; ");
    if (!body) return "";
    const key = `${prefix} ${body}`;
    const known = this.names.get(key);
    if (known) return known;
    const count = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, count);
    const name = `${prefix}${count}`;
    this.names.set(key, name);
    this.rules.push(`.${name} { ${body} }`);
    return name;
  }

  /** How a list counts, named once. */
  counter(system: string, prefix: string, suffix: string): string {
    const body = `system: extends ${system}; prefix: ${cssText(prefix)}; suffix: ${cssText(suffix)};`;
    const known = this.names.get(body);
    if (known) return known;
    const name = `count${this.names.size + 1}`;
    this.names.set(body, name);
    this.rules.push(`@counter-style ${name} { ${body} }`);
    return name;
  }
}

const cssText = (text: string) => `"${text.replace(/["\\\n<]/g, (sign) => `\\${sign.charCodeAt(0).toString(16)} `)}"`;
const classes = (...names: string[]) => {
  const list = names.filter(Boolean).join(" ");
  return list ? ` class="${list}"` : "";
};

const SYSTEMS = { "1": "decimal", a: "lower-alpha", A: "upper-alpha", i: "lower-roman", I: "upper-roman" };

type Numbers = { page: number; pages: number } | null;

/** Where words are being put. `left` is there already: the edge of the list item around them. */
type Room = { numbers: Numbers; left: number; band: boolean; width: number };

class HtmlWriter {
  private sheet = new Sheet();
  private lists = new ListBook();
  private base: Look;
  private open: { item: BookItem; tag: string; left: number }[] = [];

  constructor(
    private doc: FlowDoc,
    private pictures: Pictures,
  ) {
    this.base = bodyLook(doc);
  }

  // ---------------------------------------------------------------- words

  private runCss(style: FlowStyle, around: Look): string[] {
    const font = fontName(style.font) ?? around.font;
    const color = style.color ? colorCss(style.color) : around.color;
    return [
      font !== around.font ? `font-family: ${familyCss(font)}` : "",
      style.size && style.size !== around.size ? `font-size: ${pt(style.size)}` : "",
      color !== around.color && !(style.link && !style.color) ? `color: ${color}` : "",
      hex(style.highlight) ? `background: ${colorCss(style.highlight)}` : "",
      finite(style.tracking) !== 0 ? `letter-spacing: ${pt(style.tracking)}` : "",
    ];
  }

  /** `strong`: it is bold already. */
  private runHtml({ run, field }: RunPiece, around: Look, strong: boolean, numbers: Numbers): string {
    if (run.image) return this.picture(run.image, "");
    const { style } = run;
    let out = field ? String(numbers?.[field] ?? "") : xml(run.text).replace(/\n/g, "<br>");
    if (out === "") return "";
    if (style.script) out = style.script === "super" ? `<sup>${out}</sup>` : `<sub>${out}</sub>`;
    if (style.strike) out = `<s>${out}</s>`;
    if (style.underline && !style.link) out = `<u>${out}</u>`;
    if (style.italic) out = `<em>${out}</em>`;
    if (style.bold && !strong) out = `<strong>${out}</strong>`;
    const name = this.sheet.use("t", this.runCss(style, around));
    return name ? `<span class="${name}">${out}</span>` : out;
  }

  private words(para: FlowPara, around: Look, strong: boolean, room: Room): string {
    const list = pieces(para.runs, room.band);
    let out = "";
    for (let i = 0; i < list.length;) {
      const link = href(list[i].run.style?.link);
      let end = i + 1;
      while (end < list.length && href(list[end].run.style?.link) === link) end += 1;
      const inner = list
        .slice(i, end)
        .filter(({ run }) => !run.image?.float)
        .map((piece) => this.runHtml(piece, around, strong, room.numbers))
        .join("");
      if (link && inner) {
        const { color, underline } = list[i].run.style ?? {};
        const bare = color === undefined && underline === undefined;
        const name = bare ? "" : this.sheet.use("a", [underline ? "" : "text-decoration: none", "color: inherit"]);
        out += `<a href="${attr(link)}"${classes(name)}>${inner}</a>`;
      } else out += inner;
      i = end;
    }
    return out;
  }

  private picture(image: FlowImage, spot: string): string {
    const { type, bytes } = this.pictures.get(image);
    const size = turnedSize(image.w, image.h, image.angle);
    const name = this.sheet.use("i", [spot, `width: ${pt(size.w)}`, `height: ${pt(size.h)}`]);
    return `<img${classes(name)} src="data:image/${type};base64,${base64(bytes)}" alt="${attr(image.alt ?? "")}">`;
  }

  private floats(para: FlowPara, from: "page" | "para"): string {
    return para.runs
      .flatMap((run) => (run.image?.float?.from === from ? [run.image] : []))
      .map((image) => {
        const { x, y, behind } = image.float ?? { x: 0, y: 0 };
        const size = turnedSize(image.w, image.h, image.angle);
        const at = { x: x + (image.w - size.w) / 2, y: y + (image.h - size.h) / 2 };
        return this.picture(image, spotCss(at, Boolean(behind)));
      })
      .join("");
  }

  /** `tag` is "li" inside a list. */
  private para(para: FlowPara, tag: string, room: Room, extra: readonly string[] = []): string {
    const heading = headingOf(para);
    const rtl = isRtl(para);
    const look = usualLook([para], this.base);
    const strong = heading > 0 && para.runs.every((run) => run.image || !run.text.trim() || run.style.bold);
    const text = textOf(para);
    const parts = text.split("\t").length;
    const spread = room.band && parts > 1 && stopsOf(para, true, room.width).some(({ kind }) => kind === "right");
    const boxed = Boolean(hex(para.fill) || para.border);
    const here = this.floats(para, "para");
    const [before, after] = [Math.max(0, finite(para.before)), Math.max(0, finite(para.after))];
    const { top, right, bottom, left } = para.border ?? {};
    const css = [
      look.font !== this.base.font ? `font-family: ${familyCss(look.font)}` : "",
      look.size !== this.base.size || heading ? `font-size: ${pt(look.size)}` : "",
      look.color !== this.base.color ? `color: ${look.color}` : "",
      heading ? `font-weight: ${strong ? 700 : 400}` : "",
      para.align && (para.align !== "left" || rtl) ? `text-align: ${para.align}` : "",
      // Margins of neighbours would be one; as padding they add up, as on paper.
      boxed ? `margin-top: ${pt(before)}` : before ? `padding-top: ${pt(before)}` : "",
      after ? `margin-bottom: ${pt(after)}` : "",
      finite(para.left) - room.left !== 0 ? `margin-left: ${pt(finite(para.left) - room.left)}` : "",
      finite(para.right) ? `margin-right: ${pt(para.right)}` : "",
      finite(para.first) && tag !== "li" ? `text-indent: ${pt(para.first)}` : "",
      lineHeightCss(para.line),
      hex(para.fill) ? `background: ${colorCss(para.fill)}` : "",
      top ? `border-top: ${lineCss(top)}` : "",
      right ? `border-right: ${lineCss(right)}` : "",
      bottom ? `border-bottom: ${lineCss(bottom)}` : "",
      left ? `border-left: ${lineCss(left)}` : "",
      boxed ? `padding: 1pt ${right ? "4pt" : "0"} 1pt ${left ? "4pt" : "0"}` : "",
      spread ? "display: flex; justify-content: space-between" : "",
      !spread && /\t| {2}|^ | $/m.test(text) ? "white-space: pre-wrap" : "",
      !spread && parts > 1 ? `tab-size: ${pt(para.tabs?.[0] ?? 36)}` : "",
      para.keepNext && !heading ? "break-after: avoid" : "",
      here ? "position: relative" : "",
      ...extra,
    ];
    const name = this.sheet.use(heading ? "h" : "p", css);
    const dir = rtl ? ' dir="rtl"' : "";
    let words = "";
    if (spread)
      words = splitTabs(para)
        .map((one) => `<span>${this.words(one, look, strong, room)}</span>`)
        .join("");
    else words = this.words(para, look, strong, room);
    const own = heading && tag === "p" ? `h${heading}` : tag;
    if (heading && tag === "li") words = `<h${heading}>${words}</h${heading}>`;
    // The end of an item is written once its own lists are.
    const end = tag === "li" ? "" : `</${own}>`;
    return `${this.floats(para, "page")}<${own}${classes(name)}${dir}>${here}${words || "<br>"}${end}`;
  }

  // ---------------------------------------------------------------- lists

  /** Closes lists until the next item has its place. */
  private closeTo(depth: number): string {
    let out = "";
    while (this.open.length > depth) out += `</li></${this.open.pop()?.tag}>\n`;
    return out;
  }

  private item(para: FlowPara, room: Room): string {
    const item = this.lists.use(para, this.base.size);
    let out = "";
    let depth = this.open.length;
    while (depth > 0 && this.open[depth - 1].item.at > item.at) depth -= 1;
    const same = this.open[depth - 1];
    const goes = same?.item.at === item.at && same.item.list === item.list;
    if (same?.item.at === item.at && !goes) depth -= 1;
    out += this.closeTo(depth);
    if (goes) out += "</li>\n";
    const parent = this.open[depth - (goes ? 2 : 1)];
    const { left } = item;
    if (goes) same.left = left;
    else {
      const tag = item.level.number ? "ol" : "ul";
      const start = item.level.number && item.value !== 1 ? ` start="${item.value}"` : "";
      out += `${depth > 0 ? "\n" : ""}<${tag}${classes(this.listClass(item))}${start}>\n`;
      this.open.push({ item, tag, left });
    }
    const chain = item.level.number && markPattern(item.level.mark, item.at).kinds.length > 1;
    const extra = chain ? [`list-style-type: ${cssText(`${item.label} `)}`] : [];
    const style = { ...para, left, first: undefined };
    return out + this.para(style, "li", { ...room, left: parent?.left ?? 0 }, extra);
  }

  private listClass({ level, at }: BookItem): string {
    const bullet = cssText(`${bulletText(level.mark)}\u{a0}\u{a0}`);
    if (!level.number) return this.sheet.use("l", [`list-style-type: ${bullet}`]);
    const { between, kinds } = markPattern(level.mark, at);
    const kind = kinds[kinds.length - 1];
    const name = this.sheet.counter(SYSTEMS[kind], between[kinds.length - 1], `${between[kinds.length]} `);
    return this.sheet.use("l", [`list-style-type: ${name}`]);
  }

  // ---------------------------------------------------------------- blocks

  blocks(blocks: readonly FlowBlock[], room: Room): string {
    const kept = this.open;
    this.open = [];
    let out = "";
    for (const block of blocks) {
      const item = block.kind === "para" && block.list && !(block.frame && !room.band);
      if (!item && block.kind !== "box") {
        out += this.closeTo(0);
        if (block.kind !== "para" || !block.list) this.lists.stop();
      }
      if (block.kind === "para") out += this.paraBlock(block, room, Boolean(item));
      else if (block.kind === "table") out += this.table(block, room);
      else if (block.kind === "box") out += this.box(block, room);
      else if (block.kind === "rule") out += `${this.rule(block.color, block.width)}\n`;
    }
    out += this.closeTo(0);
    this.lists.stop();
    this.open = kept;
    return out;
  }

  private paraBlock(para: FlowPara, room: Room, item: boolean): string {
    if (item) return this.item(para, room);
    if (isLoose(para)) {
      const here = this.floats(para, "para");
      return `${this.floats(para, "page")}${here ? `<div class="here">${here}</div>` : ""}\n`;
    }
    if (!para.frame) return `${this.para(para, "p", room)}\n`;
    const { x, y, w, h } = para.frame;
    const spot = [spotCss({ x, y }, false), `width: ${pt(w)}`, h ? `min-height: ${pt(h)}` : ""];
    if (!para.list) return `${this.para({ ...para, before: 0, after: 0 }, "p", room, spot)}\n`;
    // Out of its list an item has to bring its mark along.
    const { label, left, first } = this.lists.use(para, this.base.size);
    const mark: FlowRun = { text: `${label}\t`, style: para.runs.find((run) => run.text)?.style ?? {} };
    const plain: FlowPara = { ...para, list: undefined, left, first, runs: [mark, ...para.runs], before: 0, after: 0 };
    return `${this.para(plain, "p", room, [...spot, `tab-size: ${pt(Math.max(1, -first))}`])}\n`;
  }

  private rule(color = "#000000", width = 0.75): string {
    const name = this.sheet.use("r", ["border: 0", `border-top: ${lineCss({ color, width })}`, "margin: 4pt 0 6pt"]);
    return `<hr class="${name}">`;
  }

  private table(table: FlowTable, room: Room): string {
    const grid = gridOf(table);
    if (grid.rows.length === 0) return "";
    const left = { left: pt(finite(table.left) - room.left), center: "auto", right: "auto" }[table.align ?? "left"];
    const right = table.align === "center" ? "auto" : "0";
    const name = this.sheet.use("g", [`width: ${pt(sumCols(grid.cols))}`, `margin: 0 ${right} 0 ${left}`]);
    const cols = grid.cols.map((w) => `<col${classes(this.sheet.use("c", [`width: ${pt(w)}`]))}>`);
    const rows = grid.rows.map(({ slots, h, head }, r) => {
      const cells = slots.flatMap((placed, c) => {
        if (placed && (placed.row !== r || placed.col !== c)) return [];
        if (!placed) return ["<td></td>"];
        return [this.cell(grid, placed, head, room)];
      });
      const row = this.sheet.use("w", [h && h > 0 ? `height: ${pt(h)}` : ""]);
      return `<tr${classes(row)}>${cells.join("")}</tr>`;
    });
    const heads = grid.rows.filter((row) => row.head).length;
    const top = heads > 0 ? `<thead>\n${rows.slice(0, heads).join("\n")}\n</thead>\n` : "";
    const body = `<tbody>\n${rows.slice(heads).join("\n")}\n</tbody>\n`;
    return `<table${classes(name)}>\n<colgroup>${cols.join("")}</colgroup>\n${top}${body}</table>\n`;
  }

  private cell(grid: Grid, placed: Placed, head: boolean, room: Room): string {
    const { cell, rows, cols } = placed;
    const { top, right, bottom, left } = grid.pad;
    const sides = (["top", "right", "bottom", "left"] as const).map((side) => {
      const line = sideOf(grid, placed, side);
      return line && line.width > 0 ? `border-${side}: ${lineCss(line)}` : "";
    });
    const name = this.sheet.use("d", [
      `padding: ${pt(top)} ${pt(right)} ${pt(bottom)} ${pt(left)}`,
      cell.valign && cell.valign !== "top" ? `vertical-align: ${cell.valign}` : "",
      hex(cell.fill) ? `background: ${colorCss(cell.fill)}` : "",
      ...sides,
    ]);
    const tag = head ? "th" : "td";
    const spans = `${cols > 1 ? ` colspan="${cols}"` : ""}${rows > 1 ? ` rowspan="${rows}"` : ""}`;
    const words = hasWords(cell.blocks) ? this.blocks(cell.blocks, { ...room, left: 0 }).trim() : "";
    return `<${tag}${classes(name)}${spans}>${words}</${tag}>`;
  }

  private box(box: FlowBox, room: Room): string {
    const name = shapeName(box.shape);
    const fill = boxFill(box);
    const line = boxLine(box);
    const [w, h] = [Math.max(0, finite(box.w)), Math.max(0, finite(box.h))];
    const words = hasWords(box.blocks) && !isLineShape(name);
    const wrap = (html: string) => (box.from === "page" ? `${html}\n` : `<div class="here">${html}</div>\n`);
    // Nothing is drawn in a picture without any height.
    const sides = [`width: ${pt(Math.max(w, 1))}`, `height: ${pt(Math.max(h, 1))}`];
    if (!words) return wrap(this.drawing(box, w, h, this.sheet.use("b", [spotCss(box, isBehind(box)), ...sides])));
    const pad = boxPad(box, this.base.size);
    const place = shapeRoom(box);
    const plain = name === "rect";
    const [right, low] = [w - place.x - place.w, h - place.y - place.h];
    const pads = [place.y + pad.y, right + pad.x, low + pad.y, place.x + pad.x].map(pt);
    const inner = [
      `padding: ${pads.join(" ")}`,
      box.valign === "middle" ? "justify-content: center" : box.valign === "bottom" ? "justify-content: flex-end" : "",
    ];
    const look = [
      plain && fill ? `background: ${colorCss(`#${fill}`)}` : "",
      plain && line ? `border: ${lineCss(line)}` : "",
    ];
    const size = [spotCss(box, isBehind(box)), `width: ${pt(w)}`, `min-height: ${pt(h)}`];
    const css = this.sheet.use("b", [...size, ...inner, ...look]);
    const back = plain ? "" : this.drawing(box, w, h, this.sheet.use("b", [spotCss({ x: 0, y: 0 }, true), ...sides]));
    const html = this.blocks(
      box.blocks.map((para) => ({ ...para, frame: undefined })),
      { ...room, left: 0 },
    );
    return wrap(`<aside${classes("box", css)}>${back}\n${html}</aside>`);
  }

  private drawing(box: FlowBox, w: number, h: number, name: string): string {
    const fill = boxFill(box);
    const line = boxLine(box);
    const steps = { solid: [], dash: [3, 2], dot: [1, 1.6] }[line?.dash ?? "solid"];
    const dash = steps.map((step) => short(step * finite(line?.width))).join(" ");
    const ink = line
      ? `stroke="${colorCss(line.color)}" stroke-width="${short(line.width)}"` +
        (dash ? ` stroke-dasharray="${dash}"` : "")
      : 'stroke="none"';
    const size = [w, h].map((value) => Math.max(value, 1));
    const paths = shapeParts(box.shape, w, h).map(({ path, paint, shade, evenOdd }) => {
      const d = path.map(([sign, ...at]) => sign + at.map(short).join(" ")).join("");
      const back = fill && paint !== "stroke" ? shaded(fill, shade) : "none";
      const edge = paint === "fill" ? 'stroke="none"' : ink;
      return `<path d="${d}" fill="${back}" ${edge}${evenOdd ? ' fill-rule="evenodd"' : ""}/>`;
    });
    if (box.shape === "arrow" && line) paths.push(arrowHead(w, h, line));
    return (
      `<svg${classes(name)} viewBox="0 0 ${size.map(short).join(" ")}" preserveAspectRatio="none" ` +
      `overflow="visible" aria-hidden="true">${paths.join("")}</svg>`
    );
  }

  // ---------------------------------------------------------------- pages

  page(): string {
    const sheets = this.doc.sections.flatMap((section, i) =>
      pagesOf(section).map((blocks) => ({ section, i, blocks })),
    );
    const pages = sheets.length;
    const html = sheets.map(({ section, i, blocks }, at) => this.one(section, i, blocks, { page: at + 1, pages }));
    const title = xml(this.doc.title || "Document");
    const author = this.doc.author ? `<meta name="author" content="${attr(this.doc.author)}">\n` : "";
    const rules = [...this.basics(), ...this.sheet.rules].join("\n");
    return (
      `<!DOCTYPE html>\n<html lang="${language(this.doc)}">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n${author}` +
      `<style>\n${rules}\n</style>\n</head>\n<body>\n${html.join("\n")}\n</body>\n</html>\n`
    );
  }

  private one(section: FlowSection, i: number, blocks: readonly FlowBlock[], numbers: Numbers): string {
    const { columns, width } = paperOf(section, 100000);
    const band = (tag: "header" | "footer") =>
      section[tag]?.length
        ? `<${tag}>\n${this.blocks(section[tag] ?? [], { numbers, left: 0, band: true, width })}</${tag}>\n`
        : "";
    const words = this.blocks(blocks, { numbers, left: 0, band: false, width });
    const inner = columns > 1 ? `<div class="columns">\n${words}</div>\n` : words;
    return `<section class="page s${i + 1}">\n${band("header")}${inner}${band("footer")}</section>`;
  }

  private basics(): string[] {
    const { font, size, color } = this.base;
    const rules = [
      "* { box-sizing: border-box; }",
      "body { margin: 0; padding: 1px 0; background: #e8e8e8; }",
      `.page { position: relative; isolation: isolate; margin: 24px auto; background: #ffffff; color: ${color}; ` +
        `box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25); font: ${pt(size)} ${familyCss(font)}; overflow-wrap: break-word; }`,
      "p, h1, h2, h3, h4, h5, h6, ul, ol, li { margin: 0; padding: 0; }",
      "li > h1, li > h2, li > h3, li > h4, li > h5, li > h6 { display: inline; font: inherit; }",
      "table { border-collapse: collapse; table-layout: fixed; }",
      "th, td { padding: 0; vertical-align: top; text-align: left; font-weight: inherit; }",
      "th { font-weight: 400; }",
      "img { vertical-align: baseline; }",
      "sup, sub { line-height: 0; font-size: 65%; }",
      "header, footer { position: absolute; }",
      ".here { position: relative; height: 0; }",
      ".box { display: flex; flex-direction: column; isolation: isolate; }",
    ];
    this.doc.sections.forEach((section, i) => {
      const { page, margin, columns, gap, headerAt, footerAt } = paperOf(section, 100000);
      const pads = [margin.top, margin.right, margin.bottom, margin.left].map(pt).join(" ");
      const name = `.s${i + 1}`;
      const sides = `left: ${pt(margin.left)}; right: ${pt(margin.right)}`;
      rules.push(
        `${name} { page: p${i + 1}; width: ${pt(page.w)}; min-height: ${pt(page.h)}; padding: ${pads}; }`,
        `@page p${i + 1} { size: ${pt(page.w)} ${pt(page.h)}; margin: 0; }`,
      );
      if (section.header?.length) rules.push(`${name} > header { top: ${pt(headerAt)}; ${sides}; }`);
      if (section.footer?.length) rules.push(`${name} > footer { bottom: ${pt(footerAt)}; ${sides}; }`);
      if (columns > 1) rules.push(`${name} > .columns { columns: ${columns}; column-gap: ${pt(gap)}; }`);
    });
    rules.push(
      "@media print { body { padding: 0; background: none; } .page { margin: 0; box-shadow: none; break-after: page; " +
        "print-color-adjust: exact; -webkit-print-color-adjust: exact; } .page:last-child { break-after: auto; } }",
    );
    return rules;
  }
}

// ---------------------------------------------------------------- pieces of web pages

/** Breaks make pages of their own. */
function pagesOf(section: FlowSection): FlowBlock[][] {
  const pages: FlowBlock[][] = [[]];
  for (const block of section.blocks) {
    const last = pages[pages.length - 1];
    if (block.kind === "break") pages.push([]);
    else if (block.kind === "para" && block.breakBefore && last.length > 0) pages.push([block]);
    else last.push(block);
  }
  return pages;
}

const spotCss = ({ x, y }: { x: number; y: number }, behind: boolean) =>
  `position: absolute; left: ${pt(x)}; top: ${pt(y)}${behind ? "; z-index: -1" : ""}`;

function lineHeightCss(line: FlowPara["line"]): string {
  if (!line) return "";
  if ("times" in line) return line.times === 1 ? "" : `line-height: ${short(line.times * 1.2)}`;
  return line.atLeast ? `line-height: max(${pt(line.points)}, 1.2em)` : `line-height: ${pt(line.points)}`;
}

/** The parts of a header between its tabs. */
function splitTabs(para: FlowPara): FlowPara[] {
  const parts: FlowRun[][] = [[]];
  for (const run of para.runs) {
    if (run.image) {
      parts[parts.length - 1].push(run);
      continue;
    }
    run.text.split("\t").forEach((text, i) => {
      if (i > 0) parts.push([]);
      parts[parts.length - 1].push({ text, style: run.style });
    });
  }
  // With one tab the words after it stand in the middle.
  if (parts.length === 2) parts.push([]);
  return parts.map((runs) => ({ ...para, runs }));
}

/** Lighter (+) or darker (-). */
function shaded(fill: string, by = 0): string {
  const mixed = [0, 2, 4].map((at) => {
    const value = parseInt(fill.slice(at, at + 2), 16);
    return clamp(Math.round(by >= 0 ? value + (255 - value) * by : value * (1 + by)), 0, 255);
  });
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function arrowHead(w: number, h: number, line: FlowLine): string {
  const length = Math.hypot(w, h) || 1;
  const [ux, uy] = [w / length, h / length];
  const size = Math.min(length * 0.6, 6 + line.width * 3.2);
  const at = (back: number, side: number) => `${short(w - ux * back - uy * side)} ${short(h - uy * back + ux * side)}`;
  const path = `M${at(0, 0)}L${at(size, size * 0.42)}L${at(size, -size * 0.42)}Z`;
  return `<path d="${path}" fill="${colorCss(line.color)}" stroke="none"/>`;
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Hindi or English, by most of its letters. */
function language(doc: FlowDoc): string {
  let [hindi, latin] = [0, 0];
  eachDocPara(doc, (para) => {
    const text = textOf(para);
    hindi += text.match(/[\u{900}-\u{97f}]/gu)?.length ?? 0;
    latin += text.match(/[a-z]/gi)?.length ?? 0;
  });
  return hindi > latin ? "hi" : "en";
}

export async function writeHtml(doc: FlowDoc): Promise<string> {
  const pictures = new Pictures({ gif: true, bake: true });
  await pictures.load(doc);
  return new HtmlWriter(doc, pictures).page();
}
