import type {
  FlowAlign,
  FlowBlock,
  FlowBox,
  FlowDoc,
  FlowImage,
  FlowLine,
  FlowPara,
  FlowRule,
  FlowSection,
  FlowStyle,
  FlowTable,
} from "./flow";
import {
  allLevels,
  bandStops,
  bodyHeight,
  bodyLook,
  boxFill,
  boxLine,
  boxPad,
  bulletFont,
  bulletText,
  clamp,
  clean,
  emu,
  finite,
  fontKind,
  fontName,
  gridOf,
  hasWords,
  headingOf,
  headLooks,
  hex,
  href,
  isBehind,
  isBlank,
  isComplex,
  isCramped,
  isLineShape,
  isRtl,
  ListBook,
  markPattern,
  markStyle,
  paperOf,
  Pictures,
  pieces,
  rgb,
  roughHeight,
  shapeName,
  shapeParts,
  shapeRoom,
  sideOf,
  smallest,
  stopsOf,
  textOf,
  turnedSize,
  twips,
  WordStory,
  type BookLevel,
  type Grid,
  type HeadLook,
  type Look,
  type Place,
  type Placed,
  type WordFormat,
  type WordPara,
} from "./write-kit";

/**
 * Rich Text, as Word writes it. WordPad and others skip what they do not know:
 * numbers of lists and floating pictures are there once more in a plain way.
 */

const MAX_PAGE = 1584;
const MAX_TWIPS = 31680;
const MAX_COLUMNS = 63;
const within = (points: number | undefined) => clamp(twips(points), -MAX_TWIPS, MAX_TWIPS);
const halves = (size: number) => clamp(Math.round(size * 2), 2, 3276);
const paper = (section: FlowSection) => paperOf(section, MAX_PAGE);

const ALIGN: Record<FlowAlign, string> = { left: "\\ql", center: "\\qc", right: "\\qr", justify: "\\qj" };

const SIGNS: Record<string, string> = {
  "\\": "\\\\",
  "{": "\\{",
  "}": "\\}",
  "\n": "\\line ",
  "\t": "\\tab ",
  "\u{a0}": "\\~",
  "\u{ad}": "\\-",
  "\u{2011}": "\\_",
};

/** Everything that is not plain ASCII goes by its number, with "?" for programs that cannot read those. */
const escape = (text: string) =>
  clean(text).replace(/[\\{}]|[^ -~]/g, (sign) => {
    if (SIGNS[sign]) return SIGNS[sign];
    const code = sign.charCodeAt(0);
    return `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
  });

const bytesHex = (bytes: Uint8Array) => {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 64) {
    let line = "";
    for (const byte of bytes.subarray(i, i + 64)) line += byte.toString(16).padStart(2, "0");
    lines.push(line);
  }
  return lines.join("\n");
};

/** Names with a number in a table at the head of the file. */
class Index {
  readonly names: string[] = [];

  of(name: string): number {
    const known = this.names.indexOf(name);
    return known >= 0 ? known : this.names.push(name) - 1;
  }
}

type Room = { place: Place; fields: boolean; w: number; h: number; size?: number };

class Writer implements WordFormat<Room> {
  readonly lists = new ListBook();
  private fonts = new Index();
  private colors = new Index();
  private base: Look;
  private heads: HeadLook[];
  private drawings = 0;

  constructor(
    private doc: FlowDoc,
    private pictures: Pictures,
  ) {
    this.base = bodyLook(doc);
    this.heads = headLooks(doc, this.base);
    this.fonts.of(this.base.font);
  }

  // ---------------------------------------------------------------- looks

  /** 0 is "automatic". */
  private color(color: string | null | undefined): number {
    const value = hex(color);
    return value ? this.colors.of(value) + 1 : 0;
  }

  private look(style: FlowStyle, text = "", mark = false, rtl = false): string {
    const font = this.fonts.of(fontName(style.font) ?? this.base.font);
    const size = halves(style.size ?? this.base.size);
    const weight = (style.bold ? "\\b" : "") + (style.italic ? "\\i" : "");
    const own = `\\f${font}\\fs${size}${weight}`;
    // Hindi, Arabic and the like have looks of their own.
    const complex = `\\af${font}\\afs${size}${weight.replace("\\b", "\\ab").replace("\\i", "\\ai")}`;
    let out = `\\plain${own}`;
    if (rtl && /[\u{590}-\u{8ff}]/u.test(text)) out = `\\plain\\ltrch\\fcs1${complex}\\rtlch\\fcs0${own}`;
    else if (isComplex(text)) out = `\\plain\\rtlch\\fcs1${complex}\\ltrch\\fcs0${own}`;
    const color = this.color(style.color);
    if (color) out += `\\cf${color}`;
    if (mark) return out;
    if (style.underline) out += "\\ul";
    if (style.strike) out += "\\strike";
    if (style.script) out += `\\${style.script}`;
    const tracking = within(style.tracking);
    if (tracking !== 0) out += `\\expnd${Math.round(tracking / 5)}\\expndtw${tracking}`;
    const back = this.color(style.highlight);
    // Word reads the first, WordPad the second.
    if (back) out += `\\chshdng0\\chcbpat${back}\\cb${back}`;
    return out;
  }

  private line(line: FlowLine | null | undefined, space = 0): string {
    if (!line || !(line.width > 0)) return "\\brdrnone";
    const width = clamp(Math.round(line.width * 20), 2, 255);
    const kind = line.dash === "dash" ? "\\brdrdash" : line.dash === "dot" ? "\\brdrdot" : "\\brdrs";
    return `${kind}\\brdrw${width}${space ? `\\brsp${space}` : ""}\\brdrcf${this.color(line.color)}`;
  }

  // ---------------------------------------------------------------- paragraphs

  para(para: FlowPara, room: Room, turn: boolean, framed: boolean) {
    const loose = { drawings: "" };
    const heading = headingOf(para);
    const item = para.list ? this.lists.use(para, this.base.size) : null;
    const style = markStyle(para);
    const look = { ...style, size: style.size ?? (isBlank(para) ? room.size : undefined) };
    const mark = this.look(look, "", true);
    let props = "";
    if (heading) props += `\\s${heading}`;
    else if (room.place === "header") props += "\\s11";
    else if (room.place === "footer") props += "\\s12";
    else if (item) props += "\\s10";
    if (room.place === "cell") props += "\\intbl";
    const rtl = isRtl(para);
    props += (rtl ? "\\rtlpar" : "\\ltrpar") + ALIGN[para.align ?? (rtl ? "right" : "left")];
    if (para.keepNext || heading) props += "\\keepn";
    if (turn) props += "\\pagebb";
    if (heading) props += `\\outlinelevel${heading - 1}`;
    const left = within(item ? item.left : para.left);
    const right = within(para.right);
    props += `\\li${left}\\ri${right}\\lin${left}\\rin${right}\\fi${within(item ? item.first : para.first)}`;
    props += spacing(
      para,
      para.runs.some((run) => run.image && (!run.image.float || room.place === "box")),
    );
    if (framed && para.frame) props += frame(para.frame);
    props += this.borders(para);
    if (hex(para.fill)) props += `\\cbpat${this.color(para.fill)}`;
    props += this.tabs(para, room);
    let content = this.runs(para, room, framed ? loose : null);
    if (item) {
      props += `\\ls${item.list.id}\\ilvl${item.at}`;
      content = `{\\listtext${mark} ${escape(item.label)}${item.level.tab ? "\\tab" : ""} }${content}`;
    }
    return { para: { props, mark, section: "", content, framed }, loose: loose.drawings };
  }

  private borders(para: FlowPara): string {
    const { top, right, bottom, left } = para.border ?? {};
    let out = "";
    if (top) out += `\\brdrt${this.line(top, 20)}`;
    if (left) out += `\\brdrl${this.line(left, 80)}`;
    if (bottom) out += `\\brdrb${this.line(bottom, 20)}`;
    if (right) out += `\\brdrr${this.line(right, 80)}`;
    // Neighbours with the same lines are one block to Word: a line under each has to be asked for.
    return bottom && !top ? `${out}\\brdrbtw${this.line(bottom, 20)}` : out;
  }

  private tabs(para: FlowPara, room: Room): string {
    const kinds = { left: "", center: "\\tqc", right: "\\tqr" };
    return stopsOf(para, room.place === "header" || room.place === "footer", room.w)
      .map(({ kind, at }) => `${kinds[kind]}\\tx${within(at)}`)
      .join("");
  }

  private runs(para: FlowPara, room: Room, loose: { drawings: string } | null): string {
    let out = "";
    let link: string | null = null;
    let linked = "";
    const rtl = isRtl(para);
    const endLink = () => {
      out += link && linked ? `{\\field{\\*\\fldinst{HYPERLINK "${escape(link)}"}}{\\fldrslt{${linked}}}}` : linked;
      linked = "";
    };
    for (const { run, field } of pieces(para.runs, room.fields)) {
      const words = clean(run.text ?? "");
      if (!run.image && !words && !field) continue;
      // A floating picture only hangs on these words.
      const to: string | null = run.image?.float ? link : href(run.style?.link);
      if (to !== link) {
        endLink();
        link = to;
      }
      if (run.image) {
        linked += this.picture(run.image, room, loose);
        continue;
      }
      // A link that nobody has given a look has the usual one.
      const bare = to && run.style.color === undefined && run.style.underline === undefined;
      const style = bare ? { ...run.style, color: "#0563c1", underline: true } : run.style;
      const look = `${this.look(style, words, false, rtl)}${to ? "\\cs20" : ""}`;
      const inner = field ? `{\\field{\\*\\fldinst{${FIELDS[field]}}}{\\fldrslt{1}}}` : escape(words);
      linked += `{${look} ${inner}}`;
    }
    endLink();
    return out;
  }

  tiny(turn: boolean): WordPara {
    const props = `\\ltrpar\\ql${turn ? "\\pagebb" : ""}\\li0\\ri0\\sb0\\sa0\\sl-20\\slmult0`;
    return { props, mark: "\\plain\\fs2", section: "", content: "", framed: false };
  }

  rule(rule: FlowRule, turn: boolean): WordPara {
    const line = this.line({ color: rule.color ?? "#000000", width: rule.width ?? 0.75 }, 20);
    const props = `\\ltrpar\\ql${turn ? "\\pagebb" : ""}\\li0\\ri0\\sb60\\sa120\\sl-20\\slmult0\\brdrb${line}`;
    return { ...this.tiny(false), props };
  }

  join({ props, mark, section, content }: WordPara): string {
    // The end of a section cannot start a page of its own.
    if (section === "\\sect" && props.includes("\\pagebb") && content === "")
      return `\\pard${props}${mark} \\par\n${this.join({ ...this.tiny(false), section })}`;
    return `\\pard${props}${mark} ${content}${section || "\\par"}\n`;
  }

  // ---------------------------------------------------------------- drawings

  private newId() {
    this.drawings += 1;
    return this.drawings;
  }

  private blip(image: FlowImage, w: number, h: number): string {
    const picture = this.pictures.get(image);
    return (
      `{\\pict\\${picture.type === "jpeg" ? "jpegblip" : "pngblip"}\\picw${picture.w}\\pich${picture.h}` +
      `\\picwgoal${Math.max(1, twips(w))}\\pichgoal${Math.max(1, twips(h))}\\picscalex100\\picscaley100\n` +
      `${bytesHex(picture.bytes)}}`
    );
  }

  private picture(image: FlowImage, room: Room, loose: { drawings: string } | null): string {
    const size = turnedSize(image.w, image.h, image.angle);
    const float = room.place === "box" || (loose && image.float?.from === "para") ? undefined : image.float;
    if (!float) {
      const scale = Math.min(1, (room.h - 3 - this.base.size * 0.35) / size.h, (MAX_PAGE - 4) / size.w);
      return this.blip(image, size.w * scale, size.h * scale);
    }
    const spot = { x: float.x + (image.w - size.w) / 2, y: float.y + (image.h - size.h) / 2, from: float.from };
    const blip = this.blip(image, size.w, size.h);
    const props = prop("pib", blip) + prop("wzDescription", escape(image.alt ?? "")) + prop("fLine", 0);
    const drawing = this.shape(spot, size.w, size.h, Boolean(float.behind), 75, props, "", blip);
    if (!loose) return drawing;
    loose.drawings += drawing;
    return "";
  }

  /** `plain` is for programs that do not know shapes. */
  private shape(
    at: { x: number; y: number; from: "page" | "para" },
    w: number,
    h: number,
    behind: boolean,
    type: number,
    props: string,
    words: string,
    plain: string,
  ): string {
    const id = this.newId();
    const page = at.from === "page";
    const [left, top] = [within(at.x), within(at.y)];
    const [bx, by] = page ? ["page", "page"] : ["column", "para"];
    const place = `\\shpleft${left}\\shptop${top}\\shpright${left + twips(w)}\\shpbottom${top + twips(h)}`;
    const order = `\\shpwr3\\shpwrk0\\shpfblwtxt${behind ? 1 : 0}\\shpz${id}\\shplid${1024 + id}`;
    const about =
      (page ? prop("posrelh", 1) + prop("posrelv", 1) : "") +
      prop("dhgt", 251658240 + id * 1024) +
      prop("fLayoutInCell", 1) +
      prop("fAllowOverlap", 1) +
      prop("fBehindDocument", behind ? 1 : 0);
    return (
      `{\\shp{\\*\\shpinst${place}\\shpfhdr0\\shpbx${bx}\\shpbxignore\\shpby${by}\\shpbyignore${order}` +
      prop("shapeType", type) +
      props +
      about +
      `${words ? `{\\shptxt ${words}}` : ""}}${plain ? `{\\shprslt{\\pard\\plain ${plain}\\par}}` : ""}}`
    );
  }

  box(box: FlowBox, room: Room): string {
    const name = shapeName(box.shape);
    const fill = boxFill(box);
    const line = boxLine(box);
    const pad = boxPad(box, this.base.size);
    const [w, h] = [Math.max(0, finite(box.w)), Math.max(0, finite(box.h))];
    const inner = shapeRoom(box);
    let words = "";
    if (hasWords(box.blocks) && !isLineShape(name)) {
      words = this.lists.apart(() => {
        const inside: Room = { ...room, place: "box", w: Math.max(1, inner.w - pad.x * 2), h: MAX_PAGE };
        const story = new WordStory<Room>(this, inside);
        for (const para of box.blocks) story.add(para);
        return story.end();
      });
    }
    const native = NATIVE[name];
    const type = native === 1 && words ? 202 : isLineShape(name) && name !== "lineInv" ? 20 : (native ?? 0);
    let props = type === 0 ? freeform(box, w, h) : "";
    props += fill ? prop("fillColor", bgr(fill)) + prop("fFilled", 1) : prop("fFilled", 0);
    props += line
      ? prop("lineColor", bgr(line.color)) + prop("lineWidth", emu(line.width)) + prop("fLine", 1)
      : prop("fLine", 0);
    if (line?.dash === "dash") props += prop("lineDashing", 6);
    if (line?.dash === "dot") props += prop("lineDashing", 2);
    if (box.shape === "arrow") props += prop("lineEndArrowhead", 1);
    if (!words) return this.shape(box, w, h, isBehind(box), type, props, "", "");
    // Word does not listen to "anchorText" here: the room above the words has to do it.
    const free = Math.max(0, inner.h - pad.y * 2 - roughHeight(box.blocks, inner.w - pad.x * 2, this.base.size));
    const above = box.valign === "middle" ? free / 2 : box.valign === "bottom" ? free : 0;
    const unseen = !fill && !line && (box.valign ?? "top") === "top";
    const grows = unseen || isCramped(box, pad, this.base.size);
    const inset =
      prop("dxTextLeft", emu(pad.x)) +
      prop("dxTextRight", emu(pad.x)) +
      prop("dyTextTop", emu(pad.y + above)) +
      prop("dyTextBottom", emu(pad.y)) +
      prop("fFitShapeToText", grows ? 1 : 0);
    // Other programs at least get the words.
    const plain = words.replace(/\\par\n$/, "");
    if (type !== 0) return this.shape(box, w, h, false, type, props + inset, words, plain);
    // Word shows no words inside an outline of one's own: they go on top of it.
    const over = { x: box.x + inner.x, y: box.y + inner.y, from: box.from };
    const clear = prop("fFilled", 0) + prop("fLine", 0);
    return (
      this.shape(box, w, h, false, 0, props, "", "") +
      this.shape(over, inner.w, inner.h, false, 202, clear + inset, words, plain)
    );
  }

  // ---------------------------------------------------------------- tables

  /** One table, or several when it has more columns than Word allows. */
  tables(table: FlowTable, room: Room): string[] {
    const grid = gridOf(table, MAX_PAGE);
    const out: string[] = [];
    for (let from = 0; from < grid.cols.length; from += MAX_COLUMNS)
      out.push(this.table(table, grid, from, Math.min(grid.cols.length, from + MAX_COLUMNS), room));
    return out;
  }

  private table(table: FlowTable, grid: Grid, from: number, to: number, room: Room): string {
    /** Right edge of every column, after the left edge of the first. */
    const edges = [0];
    for (const w of grid.cols.slice(from, to)) edges.push(edges[edges.length - 1] + Math.max(20, twips(w)));
    // Word cannot show what reaches further than its widest page.
    const far = MAX_TWIPS - edges[edges.length - 1];
    const left = table.align === "center" || table.align === "right" ? 0 : Math.min(within(table.left), far);
    const { pad } = grid;
    const sides = [pad.left, pad.top, pad.bottom, pad.right].map((points) => twips(points));
    const pads = ["l", "t", "b", "r"].map((side, i) => `\\trpadd${side}${sides[i]}\\trpaddf${side}3`);
    // Word counts to the words of the first cell here, not to its edge.
    const indent = `\\trql\\tblind${left + sides[0]}\\tblindtype3`;
    const start =
      `\\trowd\\ltrrow\\trgaph${Math.min(720, Math.max(sides[0], sides[3]))}\\trleft${left}` +
      `${table.align === "center" ? "\\trqc" : table.align === "right" ? "\\trqr" : indent}${pads.join("")}`;
    const rows = grid.rows.map(({ slots, h, head }, r) => {
      const size = smallest(slots.flatMap((placed) => (placed ? [placed.cell] : [])));
      let last = to;
      while (last > from + 1 && !slots[last - 1]) last -= 1;
      let cells = "";
      let words = "";
      for (let c = from; c < last;) {
        const placed = slots[c];
        const end = placed ? Math.min(last, placed.col + placed.cols) : c + 1;
        const width = edges[end - from] - edges[c - from];
        cells += `${this.cell(grid, placed, r)}\\clftsWidth3\\clwWidth${width}\\cellx${left + edges[end - from]}`;
        const here = placed && placed.row === r && placed.col === c ? placed.cell.blocks : [];
        const inside: Room = { ...room, place: "cell", w: Math.max(1, width / 20 - pad.left - pad.right), size };
        const story = new WordStory<Room>(this, inside);
        this.lists.stop();
        for (const para of here.length > 0 ? here : [EMPTY]) story.add(para);
        words += story.end("\\cell");
        c = end;
      }
      const high = h && h > 0 ? `\\trrh${clamp(twips(h), 1, MAX_TWIPS)}` : "";
      const width = `\\trftsWidth3\\trwWidth${edges[last - from]}`;
      return `${start}${high}${head ? "\\trhdr" : ""}${width}${cells}\n${words}\\row\n`;
    });
    return rows.join("");
  }

  private cell(grid: Grid, placed: Placed | null, r: number): string {
    if (!placed) return "\\clvertalt\\clbrdrt\\brdrnone\\clbrdrl\\brdrnone\\clbrdrb\\brdrnone\\clbrdrr\\brdrnone";
    let out = "";
    if (placed.rows > 1) out += placed.row === r ? "\\clvmgf" : "\\clvmrg";
    out += { top: "\\clvertalt", middle: "\\clvertalc", bottom: "\\clvertalb" }[placed.cell.valign ?? "top"];
    const inside = { top: placed.row !== r, bottom: placed.row + placed.rows - 1 !== r, left: false, right: false };
    for (const side of ["top", "left", "bottom", "right"] as const) {
      const line = inside[side] ? null : sideOf(grid, placed, side);
      out += `\\clbrdr${side[0]}${this.line(line)}`;
    }
    return hex(placed.cell.fill) ? `${out}\\clcbpat${this.color(placed.cell.fill)}` : out;
  }

  // ---------------------------------------------------------------- pages

  private band(place: "header" | "footer", blocks: readonly FlowBlock[], section: FlowSection): string {
    const { width, height } = paper(section);
    const words = this.lists.apart(() => {
      const story = new WordStory<Room>(this, { place, fields: true, w: width, h: height });
      for (const block of blocks.length > 0 ? blocks : [EMPTY]) story.add(block);
      return story.end();
    });
    return `{\\${place} ${words}}\n`;
  }

  private body(): string {
    const { sections } = this.doc;
    const any = {
      header: sections.some((section) => section.header?.length),
      footer: sections.some((section) => section.footer?.length),
    };
    return sections
      .map((section, i) => {
        const { page, margin, columns, gap, column, headerAt, footerAt } = paper(section);
        let look = `\\sectd\\ltrsect\\sbkpage\\pgwsxn${twips(page.w)}\\pghsxn${twips(page.h)}`;
        look += `\\marglsxn${twips(margin.left)}\\margrsxn${twips(margin.right)}`;
        look += `\\margtsxn${twips(margin.top)}\\margbsxn${twips(margin.bottom)}`;
        look += `\\headery${twips(headerAt)}\\footery${twips(footerAt)}`;
        if (page.w > page.h) look += "\\lndscpsxn";
        if (columns > 1) look += `\\cols${columns}\\colsx${twips(gap)}`;
        // A section without one would go on with that of the pages before.
        const bands = (["header", "footer"] as const)
          .map((place) => (any[place] ? this.band(place, section[place] ?? [], section) : ""))
          .join("");
        const h = bodyHeight(section, MAX_PAGE, this.base.size);
        const story = new WordStory<Room>(this, { place: "body", fields: false, w: column, h });
        for (const block of section.blocks) story.add(block);
        return `${look}\n${bands}${story.end(i < sections.length - 1 ? "\\sect" : "")}`;
      })
      .join("");
  }

  // ---------------------------------------------------------------- the head of the file

  private styleSheet(): string {
    const plain = (one: Look & { bold?: boolean; italic?: boolean }) => this.look(one, "", true).replace("\\plain", "");
    const heads = this.heads.map((one, i) => {
      const before = one.first ? finite(one.first.before) : one.size;
      const after = one.first ? finite(one.first.after) : one.size / 3;
      const space = `\\sb${twips(before)}\\sa${twips(after)}`;
      return `{\\s${i + 1}\\ql\\keepn${space}\\outlinelevel${i}${plain(one)}\\sbasedon0\\snext0 heading ${i + 1};}`;
    });
    const width = paper(this.doc.sections[0]).width;
    const stops = bandStops(width).map(({ kind, at }) => `\\tq${kind[0]}\\tx${within(at)}`);
    return (
      `{\\stylesheet{\\ql${plain(this.base)}\\snext0 Normal;}${heads.join("")}` +
      `{\\s10\\ql\\li720${plain(this.base)}\\sbasedon0\\snext10 List Paragraph;}` +
      `{\\s11\\ql${stops.join("")}${plain(this.base)}\\sbasedon0\\snext11 header;}` +
      `{\\s12\\ql${stops.join("")}${plain(this.base)}\\sbasedon0\\snext12 footer;}` +
      `{\\*\\cs19\\additive Default Paragraph Font;}` +
      `{\\*\\cs20\\additive\\ul\\cf${this.color("#0563c1")}\\sbasedon19 Hyperlink;}}\n`
    );
  }

  private listTables(): string {
    const { lists } = this.lists;
    if (lists.length === 0) return "";
    const all = lists.map(({ id, levels }) => {
      const each = allLevels(levels).map((level, at) => this.level(level, at));
      return `{\\list\\listtemplateid${100000 + id}${each.join("")}{\\listname ;}\\listid${200000 + id}}\n`;
    });
    const uses = lists.map(({ id }) => `{\\listoverride\\listid${200000 + id}\\listoverridecount0\\ls${id}}`);
    return `{\\*\\listtable${all.join("")}}\n{\\*\\listoverridetable${uses.join("")}}\n`;
  }

  private level(level: BookLevel, at: number): string {
    let kind = 23;
    let text = "";
    let count = 0;
    let places = "";
    let font = "";
    const put = (words: string) => {
      text += escape(words);
      count += words.length;
    };
    if (level.number) {
      const { between, kinds } = markPattern(level.mark, at);
      kind = { "1": 0, I: 1, i: 2, A: 3, a: 4 }[kinds[kinds.length - 1]];
      kinds.forEach((_, i) => {
        put(between[i]);
        text += `\\'0${at - kinds.length + i + 1}`;
        count += 1;
        places += byte(count);
      });
      put(between[kinds.length]);
    } else {
      const mark = bulletText(level.mark);
      const named = bulletFont(mark);
      if (named) font = `\\f${this.fonts.of(named)}`;
      put(mark);
    }
    return (
      `{\\listlevel\\levelnfc${kind}\\levelnfcn${kind}\\leveljc0\\leveljcn0\\levelfollow${level.tab ? 0 : 1}` +
      `\\levelstartat${level.number ? level.start : 1}\\levelspace0\\levelindent0{\\leveltext${byte(count)}${text};}` +
      `{\\levelnumbers${places};}${font}\\fi${within(level.first)}\\li${within(level.left)}\\lin${within(level.left)}}`
    );
  }

  text(): string {
    const body = this.body();
    const styles = this.styleSheet();
    const lists = this.listTables();
    const families = { sans: "\\fswiss", serif: "\\froman", mono: "\\fmodern", script: "\\fscript" };
    const fonts = this.fonts.names.map((font, i) => {
      const kind = fontKind(font);
      return `{\\f${i}${families[kind]}\\fcharset0\\fprq${kind === "mono" ? 1 : 2} ${escape(font).replace(/;/g, "")};}`;
    });
    const colors = this.colors.names.map((color) => {
      const [red, green, blue] = rgb(`#${color}`);
      return `\\red${red}\\green${green}\\blue${blue};`;
    });
    const { title, author } = this.doc;
    const info = `${title ? `{\\title ${escape(title)}}` : ""}${author ? `{\\author ${escape(author)}}` : ""}`;
    const { page, margin } = paper(this.doc.sections[0]);
    return (
      `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\\deflang1033\\deflangfe1033{\\fonttbl${fonts.join("")}}\n` +
      `{\\colortbl;${colors.join("")}}\n${styles}${lists}${info ? `{\\info${info}}\n` : ""}` +
      `\\paperw${twips(page.w)}\\paperh${twips(page.h)}\\margl${twips(margin.left)}\\margr${twips(margin.right)}` +
      `\\margt${twips(margin.top)}\\margb${twips(margin.bottom)}\\deftab720\\widowctrl\\ftnbj\\aenddoc${MODERN}` +
      `\\viewkind1\\viewscale100\\fet0\n${body}}`
    );
  }
}

// ---------------------------------------------------------------- pieces

const EMPTY: FlowPara = { kind: "para", runs: [] };
const FIELDS = { page: "PAGE", pages: "NUMPAGES" };

/** Without these Word lays the text out the way its old versions did. */
const MODERN = (
  "noxlattoyen noultrlspc dntblnsbdb nospaceforul horzdoc jexpand splytwnine ftnlytwnine htmautsp nolnhtadjtbl " +
  "useltbaln alntblind lytcalctblwd lyttblrtgr lnbrkrule nobrkwrptbl snaptogridincell allowfieldendsel wrppunct " +
  "asianbrkrule newtblstyruls nogrowautofit usenormstyforlist noindnmbrts felnbrelev nocxsptable indrlsweleven " +
  "noafcnsttbl afelev utinl hwelev spltpgpar notcvasp notbrkcnstfrctbl notvatxbx krnprsnet cachedcolbal nouicompat"
).replace(/ ?(\w+)/g, "\\$1");

const byte = (value: number) => `\\'${value.toString(16).padStart(2, "0")}`;
const prop = (name: string, value: string | number) => `{\\sp{\\sn ${name}}{\\sv ${value}}}`;

/** Shapes that are the same in Word's old drawings, by their number there. */
const NATIVE: Record<string, number> = {
  rect: 1,
  roundRect: 2,
  ellipse: 3,
  diamond: 4,
  triangle: 5,
  flowChartProcess: 109,
  flowChartDecision: 110,
};

/** Drawings keep their colours the other way round. */
function bgr(color: string): number {
  const [red, green, blue] = rgb(color.startsWith("#") ? color : `#${color}`);
  return red + green * 256 + blue * 65536;
}

function spacing(para: FlowPara, pictures: boolean): string {
  const before = clamp(twips(para.before), 0, MAX_TWIPS);
  let out = `\\sb${before}\\sa${clamp(twips(para.after), 0, MAX_TWIPS)}`;
  const line = para.line;
  if (line && "points" in line && line.points > 0) {
    // An exact height is negative. It would cut off a picture.
    const exact = !line.atLeast && !pictures;
    out += `\\sl${exact ? "-" : ""}${clamp(twips(line.points), 1, MAX_TWIPS)}\\slmult0`;
  } else if (line && "times" in line && line.times > 0 && (!pictures || textOf(para).trim() !== ""))
    out += `\\sl${clamp(Math.round(line.times * 240), 1, MAX_TWIPS)}\\slmult1`;
  else out += "\\sl240\\slmult1";
  return out;
}

/** "overlay" lets a frame stand exactly where it should, whatever else is there. */
function frame({ x, y, w, h }: NonNullable<FlowPara["frame"]>): string {
  const at = (name: string, points: number) => `\\pos${points < 0 ? "neg" : ""}${name}${Math.abs(within(points))}`;
  const size = `\\absw${clamp(twips(w), 1, MAX_TWIPS)}${h && h > 0 ? `\\absh${clamp(twips(h), 1, MAX_TWIPS)}` : ""}`;
  return `\\pvpg\\phpg${at("x", x)}${at("y", y)}${size}\\dxfrtext0\\dfrmtxtx0\\dfrmtxty0\\overlay`;
}

/** A shape by its outline, for all that have no simple number. */
function freeform(box: FlowBox, w: number, h: number): string {
  const points: string[] = [];
  const segments: number[] = [];
  const add = (x: number, y: number) => points.push(`(${Math.round(x * 100)},${Math.round(y * 100)})`);
  for (const { path, paint } of shapeParts(box.shape, w, h)) {
    for (const cmd of path) {
      if (cmd[0] === "Z") segments.push(0x6001);
      else if (cmd[0] === "C") {
        add(cmd[1], cmd[2]);
        add(cmd[3], cmd[4]);
        add(cmd[5], cmd[6]);
        segments.push(0x2001);
      } else {
        add(cmd[1], cmd[2]);
        segments.push(cmd[0] === "M" ? 0x4000 : 1);
      }
    }
    if (paint === "stroke") segments.push(0xaa00);
    if (paint === "fill") segments.push(0xab00);
    segments.push(0x8000);
  }
  return (
    prop("geoLeft", 0) +
    prop("geoTop", 0) +
    prop("geoRight", Math.max(1, Math.round(w * 100))) +
    prop("geoBottom", Math.max(1, Math.round(h * 100))) +
    prop("shapePath", 4) +
    prop("pVerticies", `8;${points.length};${points.join(";")}`) +
    prop("pSegmentInfo", `2;${segments.length};${segments.join(";")}`)
  );
}

const BLANK: FlowSection = { w: 595.3, h: 841.9, margin: { top: 72, right: 72, bottom: 72, left: 72 }, blocks: [] };

export async function writeRtf(doc: FlowDoc): Promise<Uint8Array> {
  const pictures = new Pictures({ gif: false, bake: true });
  await pictures.load(doc);
  const whole = doc.sections.length > 0 ? doc : { ...doc, sections: [BLANK] };
  return new TextEncoder().encode(new Writer(whole, pictures).text());
}
