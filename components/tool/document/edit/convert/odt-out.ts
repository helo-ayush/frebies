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
  attr,
  bandStops,
  bodyHeight,
  bodyLook,
  boxFill,
  boxLine,
  boxPad,
  bulletFont,
  bulletText,
  clean,
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
  isCramped,
  isLineShape,
  isLoose,
  isRtl,
  ListBook,
  markPattern,
  markStyle,
  MediaFolder,
  paperOf,
  Pictures,
  pieces,
  pt,
  roughBand,
  roughHeight,
  shapeName,
  shapeParts,
  shapeRoom,
  short,
  sideOf,
  smallest,
  stopsOf,
  sumCols,
  turnedSize,
  xml,
  type BookItem,
  type BookLevel,
  type BookList,
  type Grid,
  type HeadLook,
  type Look,
  type Place,
  type Placed,
  type Stop,
} from "./write-kit";

/**
 * OpenDocument, for LibreOffice and others. Looks are kept in styles that are
 * made as they are needed; a page's size, margins, header and footer belong to
 * its "master page", which the first paragraph of a section names.
 */

const URN = "urn:oasis:names:tc:opendocument:xmlns";
const SPACES = [
  ...["office", "style", "text", "table", "meta", "config"].map((name) => `xmlns:${name}="${URN}:${name}:1.0"`),
  `xmlns:draw="${URN}:drawing:1.0"`,
  `xmlns:fo="${URN}:xsl-fo-compatible:1.0"`,
  `xmlns:svg="${URN}:svg-compatible:1.0"`,
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:ooo="http://openoffice.org/2004/office"',
].join(" ");
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const MIME = "application/vnd.oasis.opendocument.text";
const MAX_PAGE = 8000;
/** And of tables and links, or Word does not open the file. */
const MAX_TABLE = 1584;
const MAX_LINK = 2080;

const paper = (section: FlowSection) => paperOf(section, MAX_PAGE);

function linkTo(link: string | undefined): string | null {
  const to = href(link);
  return to && to.length <= MAX_LINK ? to : null;
}

/** Attributes. What has no value is left out. */
type Attrs = Record<string, string | number | false | null | undefined>;
const attrs = (list: Attrs) =>
  Object.entries(list)
    .map(([name, value]) => (value || value === 0 ? ` ${name}="${value}"` : ""))
    .join("");

const tag = (name: string, list: Attrs, inner = "") =>
  inner ? `<${name}${attrs(list)}>${inner}</${name}>` : `<${name}${attrs(list)}/>`;

const ALIGN: Record<FlowAlign, string> = { left: "start", center: "center", right: "end", justify: "justify" };
const ALIGN_RTL: Record<FlowAlign, string> = { left: "left", center: "center", right: "right", justify: "justify" };

const css = (color: string | null | undefined) => `#${(hex(color) ?? "000000").toLowerCase()}`;

const DASHES = { solid: "solid", dash: "dashed", dot: "dotted" };
const lineCss = (line: FlowLine | null | undefined) =>
  line && line.width > 0
    ? `${pt(Math.max(0.1, line.width))} ${DASHES[line.dash ?? "solid"]} ${css(line.color)}`
    : "none";

// ---------------------------------------------------------------- styles

/** Automatic styles of one file. The same look twice is one style. */
class Styles {
  readonly all: string[] = [];
  private names = new Map<string, string>();
  private counts = new Map<string, number>();

  constructor(private salt: string) {}

  /** `list`: the attributes of the style; `inner`: what it contains. */
  use(family: string, prefix: string, list: Attrs, inner: string): string {
    const look = attrs({ "style:family": family, ...list });
    const key = `${look} ${inner}`;
    let name = this.names.get(key);
    if (!name) {
      const count = (this.counts.get(prefix) ?? 0) + 1;
      this.counts.set(prefix, count);
      name = `${this.salt}${prefix}${count}`;
      this.names.set(key, name);
      this.all.push(`<style:style style:name="${name}"${look}>${inner}</style:style>`);
    }
    return name;
  }
}

/** Everything there is to say about letters. */
type Full = {
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  script: string;
  highlight: string;
  tracking: number;
};

/** Attributes for what differs from `base`; all of them without one. */
function textProps(look: Full, base: Full | null): Attrs {
  const out: Attrs = {};
  const differs = (key: keyof Full) => !base || look[key] !== base[key];
  // Asian and complex scripts have attributes of their own.
  const thrice = (space: string, name: string, value: string) => {
    out[`${space}:${name}`] = value;
    out[`style:${name}-asian`] = value;
    out[`style:${name}-complex`] = value;
  };
  if (differs("font")) thrice("style", "font-name", attr(look.font));
  if (differs("size")) thrice("fo", "font-size", pt(look.size));
  if (differs("bold")) thrice("fo", "font-weight", look.bold ? "bold" : "normal");
  if (differs("italic")) thrice("fo", "font-style", look.italic ? "italic" : "normal");
  if (differs("color")) out["fo:color"] = look.color;
  if (differs("underline")) {
    out["style:text-underline-style"] = look.underline ? "solid" : "none";
    if (look.underline) out["style:text-underline-width"] = "auto";
    if (look.underline) out["style:text-underline-color"] = "font-color";
  }
  if (differs("strike")) {
    out["style:text-line-through-style"] = look.strike ? "solid" : "none";
    if (look.strike) out["style:text-line-through-type"] = "single";
  }
  if (differs("script")) out["style:text-position"] = look.script ? `${look.script} 58%` : "0% 100%";
  if (differs("highlight")) out["fo:background-color"] = look.highlight || "transparent";
  if (differs("tracking")) out["fo:letter-spacing"] = look.tracking ? pt(look.tracking) : "normal";
  return out;
}

const textXml = (list: Attrs) => (attrs(list) ? tag("style:text-properties", list) : "");

// ---------------------------------------------------------------- blocks in a row

/** Where words are being put. */
type Room = {
  styles: Styles;
  place: Place;
  /** "{page}" and "{pages}" stand for numbers here. */
  fields: boolean;
  w: number;
  h: number;
  /** Size of an empty paragraph that does not say. */
  size?: number;
};

type Frame = NonNullable<FlowPara["frame"]>;

/** A paragraph that can still be added to. */
type Para = { name: "text:p" | "text:h"; list: Attrs; content: string };

/** How a paragraph or a table starts: on a new page, or on a new kind of page. */
type Start = { turn: boolean; master: string };

/** Frames and drawings wait for a paragraph to hang on, new pages for one to start with. */
class Story {
  /** Tables and the edges of lists are ready-made. */
  private out: (Para | string)[] = [];
  private waiting = "";
  private turn = false;
  /** Nothing is on the page yet. */
  private bare = true;
  /** Lists that are open, level by level. */
  private open: BookList[] = [];
  private frame: { key: string; paras: FlowPara[] } | null = null;

  constructor(
    private writer: Writer,
    private room: Room,
    private master = "",
  ) {}

  add(block: FlowBlock) {
    const { place } = this.room;
    if (block.kind === "para" && block.frame && place !== "cell" && place !== "box") return this.framed(block);
    this.endFrame();
    if (block.kind === "para") this.para(block);
    else if (block.kind === "table") this.table(block);
    else if (block.kind === "box") this.waiting += this.writer.box(block, this.room);
    else if (block.kind === "rule") this.rule(block);
    else this.pageBreak();
  }

  private start(): Start {
    const start = { turn: this.turn, master: this.master };
    this.turn = false;
    this.master = "";
    this.bare = false;
    return start;
  }

  private push(para: Para) {
    para.content = this.waiting + para.content;
    this.waiting = "";
    this.out.push(para);
  }

  /** An empty paragraph nobody sees. */
  private tiny() {
    this.closeLists();
    this.push(this.writer.tiny(this.start(), this.room));
  }

  private last(): Para | null {
    for (let i = this.out.length - 1; i >= 0; i -= 1) {
      const one = this.out[i];
      if (typeof one === "object") return one;
      if (one.startsWith("<table:")) return null;
    }
    return null;
  }

  private settle() {
    this.endFrame();
    if (!this.waiting) return;
    const last = this.bare ? null : this.last();
    if (!last) return this.tiny();
    last.content += this.waiting;
    this.waiting = "";
  }

  private pageBreak() {
    if (this.room.place !== "body") return;
    this.settle();
    if (this.bare) this.tiny();
    this.turn = true;
    this.bare = true;
  }

  private para(para: FlowPara) {
    const { writer, room } = this;
    if (para.breakBefore && room.place === "body" && !this.turn && this.out.length > 0) {
      this.settle();
      this.turn = true;
      this.bare = true;
    }
    if (isLoose(para)) {
      this.waiting += writer.para(para, room, { turn: false, master: "" }, null).content;
      return;
    }
    if (!para.list) writer.lists.stop();
    const item = para.list ? writer.lists.use(para, writer.base.size) : null;
    this.toList(item);
    this.push(writer.para(para, room, this.start(), item));
  }

  private rule(rule: FlowRule) {
    this.writer.lists.stop();
    this.closeLists();
    this.push(this.writer.rule(rule, this.start(), this.room));
  }

  private table(table: FlowTable) {
    this.writer.lists.stop();
    this.closeLists();
    if (table.rows.length === 0) return;
    this.settle();
    this.out.push(this.writer.table(table, this.room, this.start()));
  }

  /** Paragraphs with the same place share a frame. */
  private framed(para: FlowPara) {
    const key = JSON.stringify(para.frame);
    if (this.frame?.key !== key) {
      this.endFrame();
      if (para.breakBefore) this.pageBreak();
      this.frame = { key, paras: [] };
    }
    this.frame?.paras.push(para);
  }

  private endFrame() {
    const paras = this.frame?.paras ?? [];
    this.frame = null;
    const at = paras[0]?.frame;
    if (!at) return;
    const { writer, room } = this;
    const story = new Story(writer, { ...room, place: "box", w: at.w });
    const fits = finite(at.h) > 0 && roughHeight(paras, at.w, writer.base.size) <= finite(at.h);
    // What a single paragraph has behind it fills the whole frame. So does a box around it, though not single lines.
    const own = paras.length === 1 ? paras[0] : null;
    const { top, right, bottom, left } = own?.border ?? {};
    const boxed = Boolean(top && right && bottom && left);
    for (const para of paras) {
      const plain = { ...para, frame: undefined, breakBefore: undefined };
      if (own) plain.fill = undefined;
      if (boxed) plain.border = undefined;
      story.add(plain);
    }
    const look = { fill: own?.fill, border: boxed ? own?.border : undefined };
    // Numbers go on from one frame to the next.
    this.waiting += writer.frame(at, story.end(false), room, look, fits);
  }

  // Items of a level are children of the item above them.

  private toList(item: BookItem | null) {
    if (!item) return this.closeLists();
    const { list, at, level, value } = item;
    while (this.open.length > at + 1) this.closeLevel();
    if (this.open.length === at + 1) {
      if (this.open[at] === list) {
        this.out.push("</text:list-item>", "<text:list-item>");
        return;
      }
      this.closeLevel();
    }
    while (this.open.length <= at) {
      const own = this.open.length === at;
      this.out.push(`<text:list text:style-name="${listName(list)}">`, itemXml(level, value, own));
      this.open.push(list);
    }
  }

  private closeLevel() {
    this.out.push("</text:list-item></text:list>");
    this.open.pop();
  }

  private closeLists() {
    while (this.open.length > 0) this.closeLevel();
  }

  /** Everything so far. Lists end with it, unless `alone` is false. */
  end(alone = true): string {
    this.settle();
    if (this.turn || this.master || this.out.length === 0) this.tiny();
    this.closeLists();
    if (alone) this.writer.lists.stop();
    return this.out.map((one) => (typeof one === "string" ? one : tag(one.name, one.list, one.content))).join("");
  }
}

const listName = (list: BookList) => `List_${list.id}`;

/** A number the list would not start with by itself has to be said. */
const itemXml = (level: BookLevel, value: number, own: boolean) =>
  `<text:list-item${attrs({ "text:start-value": own && level.number && value !== level.start && value })}>`;

// ---------------------------------------------------------------- the document

class Writer {
  readonly lists = new ListBook();
  readonly base: Look;
  private media = new MediaFolder();
  private content = new Styles("");
  private bands = new Styles("B");
  private heads: HeadLook[];
  private fonts = new Set<string>();
  private drawings = 0;
  private stripe = false;

  constructor(
    private doc: FlowDoc,
    private pictures: Pictures,
  ) {
    this.base = bodyLook(doc);
    this.heads = headLooks(doc, this.base);
    for (const { font } of [this.base, ...this.heads]) this.fonts.add(font);
  }

  // ---------------------------------------------------------------- words

  private full(style: FlowStyle): Full {
    const font = fontName(style.font) ?? this.base.font;
    this.fonts.add(font);
    return {
      font,
      size: style.size ?? this.base.size,
      color: style.color ? css(style.color) : "#000000",
      bold: Boolean(style.bold),
      italic: Boolean(style.italic),
      underline: Boolean(style.underline),
      strike: Boolean(style.strike),
      script: style.script ?? "",
      highlight: style.highlight ? css(style.highlight) : "",
      tracking: Math.round(finite(style.tracking) * 100) / 100,
    };
  }

  private baseFull(): Full {
    return this.full({ font: this.base.font, size: this.base.size, color: this.base.color });
  }

  /** The look of a paragraph as a whole: what its mark and its empty lines have. */
  private paraFull(para: FlowPara, room: Room): Full {
    const { font, color, bold, italic, size } = markStyle(para);
    const usual = isBlank(para) ? room.size : undefined;
    return this.full({ font, bold, italic, size: size ?? usual, color: color ?? this.base.color });
  }

  private headFull(level: number): Full {
    const { font, size, color, bold, italic } = this.heads[level - 1];
    return this.full({ font, size, color, bold, italic });
  }

  para(para: FlowPara, room: Room, start: Start, item: BookItem | null): Para {
    const heading = headingOf(para);
    const look = this.paraFull(para, room);
    let parent = item ? "List_20_Paragraph" : "Standard";
    if (room.place === "header") parent = "Header";
    if (room.place === "footer") parent = "Footer";
    if (heading) parent = `Heading_20_${heading}`;
    const text = textXml(textProps(look, heading ? this.headFull(heading) : this.baseFull()));
    return {
      name: heading ? "text:h" : "text:p",
      list: {
        "text:style-name": this.paraStyle(room, parent, start, this.paraProps(para, room, start, item) + text),
        "text:outline-level": heading || undefined,
      },
      content: this.runs(para, room, look),
    };
  }

  private paraStyle(room: Room, parent: string, { master }: Start, inner: string): string {
    const list = { "style:parent-style-name": parent, "style:master-page-name": master };
    return room.styles.use("paragraph", "P", list, inner);
  }

  private paraProps(para: FlowPara, room: Room, start: Start, item: BookItem | null): string {
    const rtl = isRtl(para);
    const inline = para.runs.some((run) => run.image && (!run.image.float || room.place === "box"));
    const { left, first } = item ?? { left: finite(para.left), first: finite(para.first) };
    const right = finite(para.right);
    const level = { left: finite(item?.level.left), first: finite(item?.level.first) };
    // The place of a list's level goes without saying, but with one measure given all have to be.
    const own = left !== level.left || first !== level.first || right !== 0;
    const list: Attrs = {
      "fo:margin-top": pt(Math.max(0, finite(para.before))),
      "fo:margin-bottom": pt(Math.max(0, finite(para.after))),
      "fo:margin-left": own && pt(left),
      "fo:margin-right": own && pt(right),
      "fo:text-indent": own && pt(first),
      "fo:text-align": (rtl ? ALIGN_RTL : ALIGN)[para.align ?? (rtl ? "right" : "left")],
      ...lineHeight(para.line, inline),
      "fo:keep-with-next": para.keepNext && "always",
      "fo:break-before": start.turn && "page",
      "fo:background-color": hex(para.fill) && css(para.fill),
      "style:writing-mode": rtl && "rl-tb",
      ...this.borders(para.border),
    };
    const stops = stopsXml(stopsOf(para, room.place === "header" || room.place === "footer", room.w));
    return tag("style:paragraph-properties", list, stops && `<style:tab-stops>${stops}</style:tab-stops>`);
  }

  private borders(border: FlowPara["border"]): Attrs {
    if (!border) return {};
    const { top, right, bottom, left } = border;
    // Neighbours with the same lines are taken for one block. Word only tells them apart by what is different.
    const each = Boolean(bottom && !top);
    if (each) this.stripe = !this.stripe;
    return {
      "fo:border-top": lineCss(top),
      "fo:border-right": lineCss(right),
      "fo:border-bottom": lineCss(bottom),
      "fo:border-left": lineCss(left),
      "fo:padding-top": top ? "1pt" : "0pt",
      "fo:padding-bottom": each && this.stripe ? "2pt" : bottom ? "1pt" : "0pt",
      "fo:padding-left": left ? "4pt" : "0pt",
      "fo:padding-right": right ? "4pt" : "0pt",
      "style:join-border": each && "false",
    };
  }

  private runs(para: FlowPara, room: Room, look: Full): string {
    let out = "";
    let link: string | null = null;
    let linked = "";
    const endLink = () => {
      out += link && linked ? tag("text:a", { ...LINKED, "xlink:href": attr(link) }, linked) : linked;
      linked = "";
    };
    const spaces = { before: true };
    for (const { run, field } of pieces(para.runs, room.fields)) {
      const words = clean(run.text ?? "");
      if (!run.image && !words && !field) continue;
      // A floating picture only hangs on these words.
      const to: string | null = run.image?.float ? link : linkTo(run.style?.link);
      if (to !== link) {
        endLink();
        link = to;
      }
      if (run.image) {
        linked += this.picture(run.image, room);
        // Word drops a plain space after a picture.
        spaces.before = true;
        continue;
      }
      const inner = field ? FIELDS[field] : wordsXml(words, spaces);
      if (field) spaces.before = false;
      // Links have a colour and a line of their own, which a given look has to undo.
      const bare = to && run.style.color === undefined && run.style.underline === undefined;
      const own = this.full(bare ? { ...run.style, color: look.color } : run.style);
      const props = textProps(own, look);
      if (to && !bare) {
        props["fo:color"] = own.color;
        props["style:text-underline-style"] = own.underline ? "solid" : "none";
      }
      const style = attrs(props) && room.styles.use("text", "T", {}, textXml(props));
      linked += style ? tag("text:span", { "text:style-name": style }, inner) : inner;
    }
    endLink();
    return out;
  }

  /** A paragraph without words, as low as it can be. */
  private low(room: Room, start: Start, list: Attrs): Para {
    const props = { ...list, "fo:line-height": "1pt", "fo:break-before": start.turn && "page" };
    const text = textXml(textProps({ ...this.baseFull(), size: 1 }, this.baseFull()));
    const style = this.paraStyle(room, "Standard", start, tag("style:paragraph-properties", props) + text);
    return { name: "text:p", list: { "text:style-name": style }, content: "" };
  }

  tiny(start: Start, room: Room): Para {
    return this.low(room, start, { "fo:margin-top": "0pt", "fo:margin-bottom": "0pt" });
  }

  rule(rule: FlowRule, start: Start, room: Room): Para {
    return this.low(room, start, {
      "fo:margin-top": "3pt",
      "fo:margin-bottom": "6pt",
      "fo:border-bottom": lineCss({ color: rule.color ?? "#000000", width: rule.width ?? 0.75 }),
      "fo:border-top": "none",
      "fo:border-left": "none",
      "fo:border-right": "none",
      "fo:padding-bottom": "1pt",
    });
  }

  // ---------------------------------------------------------------- drawings

  private newId() {
    this.drawings += 1;
    return this.drawings;
  }

  private graphic(room: Room, list: Attrs, parent = ""): string {
    const inner = tag("style:graphic-properties", list);
    return room.styles.use("graphic", "fr", { "style:parent-style-name": parent }, inner);
  }

  private picture(image: FlowImage, room: Room): string {
    const size = turnedSize(image.w, image.h, image.angle);
    const id = this.newId();
    const float = room.place === "box" ? undefined : image.float;
    const scale = float ? 1 : Math.min(1, (room.h - 3 - this.base.size * 0.35) / size.h);
    const place = float ? spot(float.from, Boolean(float.behind)) : IN_LINE;
    const list: Attrs = {
      "draw:style-name": this.graphic(room, { ...BARE, ...NO_MARGIN, ...place }, "Graphics"),
      "draw:name": `Picture ${id}`,
      "text:anchor-type": float ? "paragraph" : "as-char",
      "svg:x": float && pt(float.x + (image.w - size.w) / 2),
      "svg:y": float && pt(float.y + (image.h - size.h) / 2),
      "svg:width": pt(Math.max(0.5, size.w * scale)),
      "svg:height": pt(Math.max(0.5, size.h * scale)),
      "draw:z-index": id,
    };
    const file = tag("draw:image", {
      "xlink:href": `Pictures/${this.media.name(this.pictures.get(image))}`,
      "xlink:type": "simple",
      "xlink:show": "embed",
      "xlink:actuate": "onLoad",
    });
    return tag("draw:frame", list, file + (image.alt ? `<svg:title>${xml(image.alt)}</svg:title>` : ""));
  }

  /** Words at an exact place of the page. `fits`: they need no more room than they have. */
  frame({ x, y, w, h }: Frame, words: string, room: Room, look: Pick<FlowPara, "fill" | "border">, fits: boolean) {
    const id = this.newId();
    const fill = hex(look.fill) && css(look.fill);
    const { top, right, bottom, left } = look.border ?? {};
    const style = this.graphic(
      room,
      {
        "fo:border-top": lineCss(top),
        "fo:border-right": lineCss(right),
        "fo:border-bottom": lineCss(bottom),
        "fo:border-left": lineCss(left),
        "fo:padding": "0pt",
        ...paint(fill),
        ...spot("page", false),
      },
      "Frame",
    );
    const list: Attrs = {
      "draw:style-name": style,
      "draw:name": `Frame ${id}`,
      "text:anchor-type": "paragraph",
      "svg:x": pt(x),
      "svg:y": pt(y),
      "svg:width": pt(Math.max(1, w)),
      "svg:height": fits && pt(h),
      "draw:z-index": id,
    };
    const least = !fits && pt(Math.max(1, finite(h)));
    return tag("draw:frame", list, tag("draw:text-box", { "fo:min-height": least }, words));
  }

  box(box: FlowBox, room: Room): string {
    const id = this.newId();
    const name = shapeName(box.shape);
    const fill = boxFill(box);
    const line = boxLine(box);
    const pad = boxPad(box, this.base.size);
    const at = box.valign ?? "top";
    const [w, h] = [Math.max(0, finite(box.w)), Math.max(0, finite(box.h))];
    const place = { "text:anchor-type": "paragraph", "draw:z-index": id };
    if (isLineShape(name)) {
      const [y1, y2] = name === "lineInv" ? [box.y + h, box.y] : [box.y, box.y + h];
      const head = { "draw:marker-end": "Arrow", "draw:marker-end-width": pt(4 + finite(line?.width) * 2.5) };
      const look = { ...ink(line), ...(box.shape === "arrow" ? head : {}), ...spot(box.from, false) };
      return tag("draw:line", {
        "draw:style-name": this.graphic(room, look),
        "draw:name": `Line ${id}`,
        ...place,
        "svg:x1": pt(box.x),
        "svg:y1": pt(y1),
        "svg:x2": pt(box.x + w),
        "svg:y2": pt(y2),
      });
    }
    const words = hasWords(box.blocks) ? this.boxWords(box, room, pad.x) : "";
    const pads = {
      "fo:padding-left": pt(pad.x),
      "fo:padding-right": pt(pad.x),
      "fo:padding-top": pt(pad.y),
      "fo:padding-bottom": pt(pad.y),
    };
    const size = { "svg:x": pt(box.x), "svg:y": pt(box.y), "svg:width": pt(Math.max(1, w)) };
    const high = pt(Math.max(1, h));
    const shared = { ...pads, ...spot(box.from, isBehind(box)), "draw:textarea-vertical-align": at };
    if (words && name === "rect") {
      // Words that need more room than there is make the box higher.
      const grows = isCramped(box, pad, this.base.size) || (!fill && !line && at === "top");
      const look = { "fo:border": lineCss(line), ...paint(fill && css(`#${fill}`)), ...shared };
      const list: Attrs = {
        "draw:style-name": this.graphic(room, look, "Frame"),
        "draw:name": `Box ${id}`,
        ...place,
        ...size,
        "svg:height": !grows && high,
      };
      return tag("draw:frame", list, tag("draw:text-box", { "fo:min-height": grows && high }, words));
    }
    const look = {
      ...ink(line),
      "draw:fill": fill ? "solid" : "none",
      "draw:fill-color": fill && css(`#${fill}`),
      ...shared,
      "draw:textarea-horizontal-align": "justify",
      "fo:wrap-option": "wrap",
      "draw:auto-grow-height": "false",
    };
    const list: Attrs = {
      "draw:style-name": this.graphic(room, look),
      "draw:name": `Shape ${id}`,
      ...place,
      ...size,
      "svg:height": high,
    };
    return tag("draw:custom-shape", list, words + geometry(box, w, h));
  }

  private boxWords(box: FlowBox, room: Room, pad: number): string {
    const inside: Room = { ...room, place: "box", w: Math.max(1, shapeRoom(box).w - pad * 2), h: MAX_PAGE };
    return this.lists.apart(() => {
      const story = new Story(this, inside);
      for (const para of box.blocks) story.add({ ...para, frame: undefined });
      return story.end();
    });
  }

  // ---------------------------------------------------------------- tables

  table(table: FlowTable, room: Room, start: Start): string {
    const grid = gridOf(table, MAX_TABLE);
    const left = Math.min(finite(table.left), MAX_TABLE - sumCols(grid.cols));
    const align = table.align ?? "left";
    const props = tag("style:table-properties", {
      "style:width": pt(sumCols(grid.cols)),
      "table:align": align,
      "table:border-model": "collapsing",
      "fo:margin-left": align === "left" && pt(left),
      "fo:margin-top": "0pt",
      "fo:margin-bottom": "0pt",
      "style:may-break-between-rows": "true",
      "fo:break-before": start.turn && "page",
    });
    const style = room.styles.use("table", "Table", { "style:master-page-name": start.master }, props);
    const columns = grid.cols.map((w) => {
      const inner = tag("style:table-column-properties", { "style:column-width": pt(w) });
      return tag("table:table-column", { "table:style-name": room.styles.use("table-column", "Col", {}, inner) });
    });
    const rows = grid.rows.map((_, r) => this.row(grid, r, room));
    const heads = grid.rows.filter((row) => row.head).length;
    const top = heads > 0 ? tag("table:table-header-rows", {}, rows.slice(0, heads).join("")) : "";
    return tag("table:table", { "table:style-name": style }, columns.join("") + top + rows.slice(heads).join(""));
  }

  private row(grid: Grid, r: number, room: Room): string {
    const { slots, h } = grid.rows[r];
    const size = smallest(slots.flatMap((placed) => (placed ? [placed.cell] : [])));
    const cells = slots.map((placed, c) => {
      if (!placed) {
        const none = this.cellStyle(room, { "fo:border": "none" });
        return tag("table:table-cell", { "table:style-name": none }, "<text:p/>");
      }
      if (placed.row !== r || placed.col !== c) return "<table:covered-table-cell/>";
      return this.cell(grid, placed, { ...room, place: "cell", size });
    });
    const height = h && h > 0 ? pt(h) : undefined;
    const inner = tag("style:table-row-properties", { "style:min-row-height": height, "fo:keep-together": "auto" });
    const style = room.styles.use("table-row", "Row", {}, inner);
    return tag("table:table-row", { "table:style-name": style }, cells.join(""));
  }

  private cell(grid: Grid, placed: Placed, room: Room): string {
    const { cell, col, rows, cols } = placed;
    const width = sumCols(grid.cols, col, cols) - grid.pad.left - grid.pad.right;
    const look: Attrs = {
      "style:vertical-align": cell.valign !== "top" && cell.valign,
      "fo:background-color": hex(cell.fill) && css(cell.fill),
    };
    for (const side of ["top", "right", "bottom", "left"] as const) {
      look[`fo:border-${side}`] = lineCss(sideOf(grid, placed, side));
      look[`fo:padding-${side}`] = pt(grid.pad[side]);
    }
    this.lists.stop();
    const story = new Story(this, { ...room, w: Math.max(1, width) });
    for (const para of cell.blocks.length > 0 ? cell.blocks : [EMPTY]) story.add(para);
    const list: Attrs = {
      "table:style-name": this.cellStyle(room, look),
      "office:value-type": "string",
      "table:number-columns-spanned": cols > 1 && cols,
      "table:number-rows-spanned": rows > 1 && rows,
    };
    return tag("table:table-cell", list, story.end());
  }

  private cellStyle(room: Room, look: Attrs): string {
    return room.styles.use("table-cell", "Cell", {}, tag("style:table-cell-properties", look));
  }

  // ---------------------------------------------------------------- pages

  private pageLayout(section: FlowSection, i: number): string {
    const { page, margin, columns, gap, headerAt, footerAt } = paper(section);
    // Header and footer stand inside the margins of the words, which are wider than those of the page.
    const top = section.header?.length ? Math.min(headerAt, margin.top) : margin.top;
    const bottom = section.footer?.length ? Math.min(footerAt, margin.bottom) : margin.bottom;
    const many = columns > 1 && tag("style:columns", { "fo:column-count": columns, "fo:column-gap": pt(gap) });
    const props = tag(
      "style:page-layout-properties",
      {
        "fo:page-width": pt(page.w),
        "fo:page-height": pt(page.h),
        "style:print-orientation": page.w > page.h ? "landscape" : "portrait",
        "fo:margin-top": pt(top),
        "fo:margin-bottom": pt(bottom),
        "fo:margin-left": pt(margin.left),
        "fo:margin-right": pt(margin.right),
        "style:writing-mode": "lr-tb",
      },
      many || "",
    );
    const band = (place: "header" | "footer", height: number, edge: string) => {
      const list = {
        "fo:min-height": pt(height),
        "fo:margin-left": "0pt",
        "fo:margin-right": "0pt",
        [`fo:margin-${edge}`]: "0pt",
        "style:dynamic-spacing": "false",
      };
      return tag(`style:${place}-style`, {}, section[place]?.length ? tag("style:header-footer-properties", list) : "");
    };
    const bands = band("header", margin.top - top, "bottom") + band("footer", margin.bottom - bottom, "top");
    return tag("style:page-layout", { "style:name": `Layout${i + 1}` }, props + bands);
  }

  private master(section: FlowSection, i: number): string {
    const list = { "style:name": masterName(i), "style:page-layout-name": `Layout${i + 1}` };
    return tag("style:master-page", list, this.band("header", section) + this.band("footer", section));
  }

  private band(place: "header" | "footer", section: FlowSection): string {
    const { width, height, margin, footerAt } = paper(section);
    let blocks = section[place] ?? [];
    if (blocks.length === 0) {
      // Word would go on with that of the pages before.
      const others = this.doc.sections.some((other) => other[place]?.length);
      return others ? tag(`style:${place}`, { "style:display": "false" }, "<text:p/>") : "";
    }
    // Footers stand on the edge of the page, not under the words: the rest of their room comes first.
    const free = margin.bottom - footerAt - roughBand(blocks, width, this.base.size);
    if (place === "footer" && free > 1) {
      const [top, ...rest] = blocks;
      if (top.kind === "para") blocks = [{ ...top, before: finite(top.before) + free }, ...rest];
      else blocks = [{ kind: "para", runs: [{ text: "", style: { size: 1 } }], line: { points: free } }, ...blocks];
    }
    const words = this.lists.apart(() => {
      const story = new Story(this, { styles: this.bands, place, fields: true, w: width, h: height });
      for (const block of blocks) story.add(block);
      return story.end();
    });
    return tag(`style:${place}`, {}, words);
  }

  private body(): string {
    const out = this.doc.sections.map((section, i) => {
      const h = bodyHeight(section, MAX_PAGE, this.base.size);
      const room: Room = { styles: this.content, place: "body", fields: false, w: paper(section).column, h };
      const story = new Story(this, room, masterName(i));
      for (const block of section.blocks) story.add(block);
      return story.end();
    });
    return out.join("");
  }

  // ---------------------------------------------------------------- files

  private fontFaces(): string {
    const generic = { sans: "swiss", serif: "roman", mono: "modern", script: "script" };
    const faces = [...this.fonts].sort().map((font) => {
      const kind = fontKind(font);
      return tag("style:font-face", {
        "style:name": attr(font),
        "svg:font-family": /\s/.test(font) ? `'${attr(font)}'` : attr(font),
        "style:font-family-generic": generic[kind],
        "style:font-pitch": kind === "mono" ? "fixed" : "variable",
      });
    });
    return `<office:font-face-decls>${faces.join("")}</office:font-face-decls>`;
  }

  private namedStyles(): string {
    const base = this.baseFull();
    const named = (name: string, parent: string, inner: string, more: Attrs = {}) =>
      tag(
        "style:style",
        {
          "style:name": name,
          "style:display-name": name.replace(/_20_/g, " "),
          "style:family": "paragraph",
          "style:parent-style-name": parent,
          "style:class": "text",
          ...more,
        },
        inner,
      );
    const byDefault = (family: string, inner: string) => tag("style:default-style", { "style:family": family }, inner);
    const heads = this.heads.map((one, i) => {
      const props = tag("style:paragraph-properties", {
        "fo:margin-top": pt(one.first ? finite(one.first.before) : one.size),
        "fo:margin-bottom": pt(one.first ? finite(one.first.after) : one.size / 3),
        "fo:keep-with-next": "always",
      });
      const text = textXml(textProps(this.headFull(i + 1), base));
      const more = { "style:next-style-name": "Standard", "style:default-outline-level": i + 1 };
      return named(`Heading_20_${i + 1}`, "Heading", props + text, more);
    });
    const stops = `<style:tab-stops>${stopsXml(bandStops(paper(this.doc.sections[0]).width))}</style:tab-stops>`;
    const band = tag("style:paragraph-properties", {}, stops);
    const all = textProps(base, null);
    const language = { "fo:language": "en", "fo:country": "US" };
    const usual = { "style:tab-stop-distance": "36pt", "style:writing-mode": "page", "fo:orphans": 2, "fo:widows": 2 };
    const link = {
      "fo:color": "#0563c1",
      "style:text-underline-style": "solid",
      "style:text-underline-width": "auto",
      "style:text-underline-color": "font-color",
    };
    const corner = { "text:anchor-type": "paragraph", "svg:x": "0pt", "svg:y": "0pt" };
    const above = { "style:wrap": "none", "style:vertical-pos": "top", "style:vertical-rel": "paragraph" };
    const graphic = (name: string, list: Attrs) =>
      tag("style:style", { "style:name": name, "style:family": "graphic" }, tag("style:graphic-properties", list));
    const dashes = (name: string, length: string, distance: string) =>
      tag("draw:stroke-dash", {
        "draw:name": name,
        "draw:style": "rect",
        "draw:dots1": 1,
        "draw:dots1-length": length,
        "draw:distance": distance,
      });
    return [
      byDefault("paragraph", tag("style:paragraph-properties", usual) + textXml({ ...all, ...language })),
      byDefault("graphic", `<style:paragraph-properties/>${textXml(all)}`),
      byDefault("table", tag("style:table-properties", { "table:border-model": "collapsing" })),
      byDefault("table-row", tag("style:table-row-properties", { "fo:keep-together": "auto" })),
      named("Standard", "", tag("style:paragraph-properties", { "fo:margin-top": "0pt", "fo:margin-bottom": "0pt" })),
      named("Heading", "Standard", tag("style:paragraph-properties", { "fo:keep-with-next": "always" })),
      ...heads,
      named("List_20_Paragraph", "Standard", ""),
      named("Header", "Standard", band),
      named("Footer", "Standard", band),
      tag(
        "style:style",
        { "style:name": "Internet_20_link", "style:display-name": "Internet link", "style:family": "text" },
        textXml(link),
      ),
      graphic("Graphics", { ...corner, ...above }),
      graphic("Frame", { ...corner, ...BARE }),
      ...this.lists.lists.map((list) => listXml(list, this.fonts)),
      tag("draw:marker", { "draw:name": "Arrow", "svg:viewBox": "0 0 20 30", "svg:d": "M10 0l-10 30h20z" }),
      dashes("Dashes", "300%", "200%"),
      dashes("Dots", "100%", "100%"),
    ].join("");
  }

  /** Every file of the package after the first, by its path. */
  files(): Map<string, string | Uint8Array> {
    const body = this.body();
    const masters = this.doc.sections.map((section, i) => this.master(section, i)).join("");
    const layouts = this.doc.sections.map((section, i) => this.pageLayout(section, i)).join("");
    const named = this.namedStyles();
    const faces = this.fontFaces();
    const { title, author } = this.doc;
    const now = new Date().toISOString().replace(/\.\d+Z$/, "");
    const person = author ? xml(author) : "";
    const meta =
      (title ? `<dc:title>${xml(title)}</dc:title>` : "") +
      (person && `<meta:initial-creator>${person}</meta:initial-creator><dc:creator>${person}</dc:creator>`) +
      `<meta:creation-date>${now}</meta:creation-date><dc:date>${now}</dc:date>`;
    const file = (kind: string, inner: string) =>
      `${HEAD}<office:document-${kind} ${SPACES} office:version="1.2">${inner}</office:document-${kind}>`;
    const part = (name: string, inner: string) => `<office:${name}>${inner}</office:${name}>`;
    const content = part("automatic-styles", this.content.all.join("")) + part("body", part("text", body));
    const styles =
      part("styles", named) +
      part("automatic-styles", this.bands.all.join("") + layouts) +
      part("master-styles", masters);
    const out = new Map<string, string | Uint8Array>([
      ["content.xml", file("content", faces + content)],
      ["styles.xml", file("styles", faces + styles)],
      ["meta.xml", file("meta", part("meta", meta))],
      ["settings.xml", file("settings", part("settings", SETTINGS))],
    ]);
    for (const { name, picture } of this.media.files) out.set(`Pictures/${name}`, picture.bytes);
    const entries = [...out.keys()].map((path) => {
      const type = /^Pictures\/.*\.(\w+)$/.exec(path)?.[1];
      const list = { "manifest:full-path": path, "manifest:media-type": type ? `image/${type}` : "text/xml" };
      return tag("manifest:file-entry", list);
    });
    const root = { "manifest:full-path": "/", "manifest:version": "1.2", "manifest:media-type": MIME };
    const manifest = { "xmlns:manifest": `${URN}:manifest:1.0`, "manifest:version": "1.2" };
    const all = tag("manifest:file-entry", root) + entries.join("");
    out.set("META-INF/manifest.xml", HEAD + tag("manifest:manifest", manifest, all));
    return out;
  }
}

// ---------------------------------------------------------------- pieces

const EMPTY: FlowPara = { kind: "para", runs: [] };
const masterName = (i: number) => (i === 0 ? "Standard" : `Section${i + 1}`);

const BARE: Attrs = { "fo:border": "none", "fo:padding": "0pt" };
const NO_MARGIN: Attrs = {
  "fo:margin-left": "0pt",
  "fo:margin-right": "0pt",
  "fo:margin-top": "0pt",
  "fo:margin-bottom": "0pt",
};
const IN_LINE: Attrs = { "style:vertical-pos": "top", "style:vertical-rel": "baseline" };
const LINKED: Attrs = {
  "xlink:type": "simple",
  "text:style-name": "Internet_20_link",
  "text:visited-style-name": "Internet_20_link",
};

/** Where a drawing stands, and whether the words run over or under it. */
function spot(from: "page" | "para", behind: boolean): Attrs {
  const rel = from === "page" ? "page" : "paragraph";
  return {
    "style:wrap": "run-through",
    "style:number-wrapped-paragraphs": "no-limit",
    "style:run-through": behind ? "background" : "foreground",
    "style:vertical-pos": "from-top",
    "style:vertical-rel": rel,
    "style:horizontal-pos": "from-left",
    "style:horizontal-rel": rel,
    "style:flow-with-text": "false",
  };
}

const paint = (fill: string | null): Attrs => ({
  "fo:background-color": fill ?? "transparent",
  "draw:fill": fill ? "solid" : "none",
  "draw:fill-color": fill,
});

function ink(line: FlowLine | null): Attrs {
  if (!line) return { "draw:stroke": "none" };
  const dash = line.dash === "dash" ? "Dashes" : line.dash === "dot" ? "Dots" : "";
  return {
    "draw:stroke": dash ? "dash" : "solid",
    "draw:stroke-dash": dash,
    "svg:stroke-width": pt(line.width),
    "svg:stroke-color": css(line.color),
  };
}

const stopsXml = (stops: readonly Stop[]) =>
  stops.map(({ kind, at }) => tag("style:tab-stop", { "style:position": pt(at), "style:type": kind })).join("");

function lineHeight(line: FlowPara["line"], pictures: boolean): Attrs {
  if (line && "times" in line && line.times > 0 && !pictures)
    return { "fo:line-height": `${short(line.times * 100)}%` };
  if (line && "points" in line && line.points > 0)
    return line.atLeast || pictures
      ? { "style:line-height-at-least": pt(line.points) }
      : { "fo:line-height": pt(line.points) };
  return { "fo:line-height": "100%" };
}

const FIELDS = {
  page: '<text:page-number text:select-page="current">1</text:page-number>',
  pages: "<text:page-count>1</text:page-count>",
};

/** Spaces in a row, or next to a line end, would be dropped if they were not written out. */
function wordsXml(text: string, spaces: { before: boolean }): string {
  return (text.match(/\n|\t| +|[^\n\t ]+/g) ?? [])
    .map((part) => {
      if (part === "\n" || part === "\t") {
        spaces.before = true;
        return part === "\n" ? "<text:line-break/>" : "<text:tab/>";
      }
      if (part[0] !== " ") {
        spaces.before = false;
        return xml(part);
      }
      const extra = part.length - (spaces.before ? 0 : 1);
      const out = `${spaces.before ? "" : " "}${extra > 0 ? `<text:s text:c="${extra}"/>` : ""}`;
      spaces.before = true;
      return out;
    })
    .join("");
}

const FORMATS = { "1": "1", a: "a", A: "A", i: "i", I: "I" };

function listXml(list: BookList, fonts: Set<string>): string {
  const all = allLevels(list.levels).map((level, at) => {
    const label = tag("style:list-level-label-alignment", {
      "text:label-followed-by": level.tab ? "listtab" : "space",
      "text:list-tab-stop-position": level.tab && pt(level.left),
      "fo:text-indent": pt(level.first),
      "fo:margin-left": pt(level.left),
    });
    const mode = { "text:list-level-position-and-space-mode": "label-alignment" };
    const place = tag("style:list-level-properties", mode, label);
    if (!level.number) {
      const text = bulletText(level.mark);
      const font = bulletFont(text);
      if (font) fonts.add(font);
      const mark = { "text:level": at + 1, "text:bullet-char": attr([...text][0]) };
      return tag("text:list-level-style-bullet", mark, place + (font ? textXml({ "style:font-name": font }) : ""));
    }
    const { between, kinds } = markPattern(level.mark, at);
    return tag(
      "text:list-level-style-number",
      {
        "text:level": at + 1,
        "style:num-format": FORMATS[kinds[kinds.length - 1]],
        "style:num-prefix": attr(between[0]),
        "style:num-suffix": attr(between[kinds.length]),
        "text:start-value": level.start,
        "text:display-levels": kinds.length > 1 && kinds.length,
      },
      place,
    );
  });
  const name = { "style:name": listName(list), "style:display-name": `List ${list.id}` };
  return tag("text:list-style", name, all.join(""));
}

/** The outline of a shape, in hundredths of a point. */
function geometry(box: FlowBox, w: number, h: number): string {
  const n = (value: number) => String(Math.round(value * 100));
  const path = shapeParts(box.shape, w, h).map(({ path: cmds, paint: how }) => {
    const drawn = cmds.map(([sign, ...at]) => [sign, ...at.map(n)].join(" "));
    const only = how === "fill" ? " S" : how === "stroke" ? " F" : "";
    return `${drawn.join(" ")}${only} N`;
  });
  const room = shapeRoom(box);
  return tag("draw:enhanced-geometry", {
    "svg:viewBox": `0 0 ${n(Math.max(1, w))} ${n(Math.max(1, h))}`,
    "draw:type": "non-primitive",
    "draw:text-areas": [room.x, room.y, room.x + room.w, room.y + room.h].map(n).join(" "),
    "draw:enhanced-path": path.join(" "),
  });
}

const setting = (name: string, on: boolean) =>
  `<config:config-item config:name="${name}" config:type="boolean">${on}</config:config-item>`;

/** Space between paragraphs, tab stops and lines that end early, as Word understands them. */
const SETTINGS = [
  '<config:config-item-set config:name="ooo:configuration-settings">',
  setting("AddParaTableSpacing", true),
  setting("AddParaTableSpacingAtStart", true),
  setting("AddParaSpacingToTableCells", true),
  setting("TabsRelativeToIndent", false),
  setting("DoNotJustifyLinesWithManualBreak", true),
  "</config:config-item-set>",
].join("");

const BLANK: FlowSection = { w: 595.3, h: 841.9, margin: { top: 72, right: 72, bottom: 72, left: 72 }, blocks: [] };

export async function writeOdt(doc: FlowDoc): Promise<Uint8Array> {
  const pictures = new Pictures({ gif: true, bake: true });
  const [{ default: JSZip }] = await Promise.all([import("jszip"), pictures.load(doc)]);
  const zip = new JSZip();
  const whole = doc.sections.length > 0 ? doc : { ...doc, sections: [BLANK] };
  // The kind of file is told by its first bytes, so they must not be packed.
  zip.file("mimetype", MIME, { createFolders: false, compression: "STORE" });
  for (const [path, data] of new Writer(whole, pictures).files()) {
    const compression = typeof data === "string" ? "DEFLATE" : "STORE";
    zip.file(path, data, { createFolders: false, compression, compressionOptions: { level: 6 } });
  }
  return zip.generateAsync({ type: "uint8array" });
}
