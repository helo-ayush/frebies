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
  clamp,
  clean,
  cropOf,
  eachDocPara,
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
  lineKey,
  ListBook,
  markPattern,
  markStyle,
  MediaFolder,
  paperOf,
  Pictures,
  pieces,
  shapeName,
  shapeParts,
  shapeRoom,
  sideOf,
  smallest,
  STAND_IN,
  stopsOf,
  sumCols,
  Tally,
  textOf,
  turnedSize,
  twips,
  WordStory,
  xml,
  type BookItem,
  type BookLevel,
  type BookList,
  type Grid,
  type HeadLook,
  type Look,
  type NumberKind,
  type Place,
  type Placed,
  type Stop,
  type WordFormat,
  type WordPara,
} from "./write-kit";

/**
 * Word's own format. Headings, lists, fields and tables are written the way Word
 * does, so that the file is as easy to go on with as one made there. Elements
 * stand in the order the format asks for: Word refuses files that mix it up.
 */

const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE = "http://schemas.openxmlformats.org/package/2006";
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006";
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SHAPE = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const SPACES =
  `xmlns:w="${WORD}" xmlns:r="${OFFICE}" xmlns:wp="${DRAWING}/wordprocessingDrawing" xmlns:a="${DRAWING}/main" ` +
  `xmlns:pic="${DRAWING}/picture" xmlns:wps="${SHAPE}" ` +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:v="urn:schemas-microsoft-com:vml" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"';

/** The largest page, the longest measure and the most columns Word takes. */
const MAX_PAGE = 1584;
const MAX_TWIPS = 31680;
const MAX_COLUMNS = 63;

const JUSTIFY: Record<FlowAlign, string> = { left: "left", center: "center", right: "right", justify: "both" };
/** Office means the side a line starts and ends on: in Arabic the other way round. */
const JUSTIFY_RTL: Record<FlowAlign, string> = { ...JUSTIFY, left: "right", right: "left" };

const within = (points: number | undefined) => clamp(twips(points), -MAX_TWIPS, MAX_TWIPS);
/** Sizes are kept in half points. */
const halves = (size: number) => clamp(Math.round(size * 2), 2, 3276);
const onOff = (name: string, on: boolean) => (on ? `<w:${name}/>` : `<w:${name} w:val="0"/>`);
const paper = (section: FlowSection) => paperOf(section, MAX_PAGE);

// ---------------------------------------------------------------- files that point to others

class Part {
  private rels: string[] = [];
  private known = new Map<string, string>();

  constructor(readonly path: string) {}

  private add(type: string, target: string, outside = false): string {
    const key = `${type} ${target}`;
    let id = this.known.get(key);
    if (!id) {
      id = `rId${this.rels.length + 1}`;
      this.known.set(key, id);
      const mode = outside ? ' TargetMode="External"' : "";
      this.rels.push(`<Relationship Id="${id}" Type="${OFFICE}/${type}" Target="${attr(target)}"${mode}/>`);
    }
    return id;
  }

  file(type: string, target: string) {
    return this.add(type, target);
  }

  image(name: string) {
    return this.add("image", `media/${name}`);
  }

  link(url: string) {
    return this.add("hyperlink", url, true);
  }

  get relsPath() {
    return this.path.replace(/([^/]+)$/, "_rels/$1.rels");
  }

  relsXml(): string | null {
    if (this.rels.length === 0) return null;
    return `${HEAD}<Relationships xmlns="${PACKAGE}/relationships">${this.rels.join("")}</Relationships>`;
  }
}

// ---------------------------------------------------------------- lists

const FORMATS: Record<NumberKind, string> = {
  "1": "decimal",
  a: "lowerLetter",
  A: "upperLetter",
  i: "lowerRoman",
  I: "upperRoman",
};

function numberingXml(lists: readonly BookList[]): string {
  const all = lists.map(({ id, levels }) => {
    const code = (salt: number) => ((id * 0x9e3779b1 + salt) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    return (
      `<w:abstractNum w:abstractNumId="${id}"><w:nsid w:val="${code(0x1d2c3b4a)}"/>` +
      `<w:multiLevelType w:val="multilevel"/><w:tmpl w:val="${code(0x5a6b7c8d)}"/>` +
      `${allLevels(levels).map(levelXml).join("")}</w:abstractNum>`
    );
  });
  const uses = lists.map(({ id }) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`);
  return `${HEAD}<w:numbering ${SPACES}>${all.join("")}${uses.join("")}</w:numbering>`;
}

function levelXml(level: BookLevel, at: number): string {
  let format = "bullet";
  let text = bulletText(level.mark);
  let look = "";
  if (level.number) {
    const { between, kinds } = markPattern(level.mark, at);
    format = FORMATS[kinds[kinds.length - 1]];
    text = kinds.map((_, i) => `${between[i]}%${at - kinds.length + i + 2}`).join("") + between[kinds.length];
  } else {
    const font = bulletFont(text);
    if (font) look = `<w:rPr>${fontsXml(font)}</w:rPr>`;
  }
  const first = level.first < 0 ? `w:hanging="${within(-level.first)}"` : `w:firstLine="${within(level.first)}"`;
  return (
    `<w:lvl w:ilvl="${at}"><w:start w:val="${level.number ? level.start : 1}"/><w:numFmt w:val="${format}"/>` +
    `<w:suff w:val="${level.tab ? "tab" : "space"}"/><w:lvlText w:val="${attr(text)}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${within(level.left)}" ${first}/></w:pPr>${look}</w:lvl>`
  );
}

// ---------------------------------------------------------------- looks

function fontsXml(font: string): string {
  const name = attr(font);
  return `<w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:eastAsia="${name}" w:cs="${name}"/>`;
}

const DASHES: Record<NonNullable<FlowLine["dash"]>, string> = { solid: "single", dash: "dashed", dot: "dotted" };

function lineXml(name: string, line: FlowLine | null, space = 0): string {
  if (!line || !(line.width > 0)) return `<w:${name} w:val="nil"/>`;
  const size = clamp(Math.round(line.width * 8), 2, 96);
  const color = hex(line.color) ?? "auto";
  return `<w:${name} w:val="${DASHES[line.dash ?? "solid"]}" w:sz="${size}" w:space="${space}" w:color="${color}"/>`;
}

function shadeXml(color: string | undefined): string {
  const fill = hex(color);
  return fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "";
}

type Spacing = { before: number; after: number; line: string };

function lineRule(line: FlowPara["line"]): string {
  if (line && "times" in line && line.times > 0)
    return `w:line="${clamp(Math.round(line.times * 240), 1, MAX_TWIPS)}" w:lineRule="auto"`;
  if (line && "points" in line && line.points > 0)
    return `w:line="${clamp(twips(line.points), 1, MAX_TWIPS)}" w:lineRule="${line.atLeast ? "atLeast" : "exact"}"`;
  return 'w:line="240" w:lineRule="auto"';
}

function spacingOf(para: FlowPara, pictures = false): Spacing {
  let line = para.line;
  // A picture in a line: an exact height would cut it off, a multiple would stretch the room around it.
  if (pictures && line && "points" in line) line = { ...line, atLeast: true };
  else if (pictures && textOf(para).trim() === "") line = undefined;
  return {
    before: clamp(twips(para.before), 0, MAX_TWIPS),
    after: clamp(twips(para.after), 0, MAX_TWIPS),
    line: lineRule(line),
  };
}

const spacingXml = ({ before, after, line }: Spacing) => `<w:spacing w:before="${before}" w:after="${after}" ${line}/>`;

/** `full`: say everything, not only what differs. `mark`: for the end of a paragraph, which has no letters. */
type Wording = { full?: boolean; mark?: boolean; link?: boolean; rtl?: boolean; text?: string };

/** Where words are being put. */
type Room = {
  part: Part;
  place: Place;
  /** "{page}" and "{pages}" stand for numbers here. */
  fields: boolean;
  w: number;
  h: number;
  /** Size of an empty paragraph that does not say. */
  size?: number;
};

const turnXml = (turn: boolean) => (turn ? "<w:pageBreakBefore/>" : "");

// ---------------------------------------------------------------- the document

class Writer implements WordFormat<Room> {
  readonly lists = new ListBook();
  private media = new MediaFolder();
  private parts: { part: Part; xml: string; type: string }[] = [];
  private document = new Part("word/document.xml");
  private fonts = new Set<string>();
  private base: Look;
  private spacing: Spacing;
  private heads: HeadLook[];
  private drawings = 0;

  constructor(
    private doc: FlowDoc,
    private pictures: Pictures,
  ) {
    this.base = bodyLook(doc);
    this.heads = headLooks(doc, this.base);
    const known = new Map<string, Spacing>();
    const usual = new Tally<string>();
    for (const block of doc.sections.flatMap((section) => section.blocks)) {
      if (block.kind !== "para" || block.heading || block.list || block.frame || isBlank(block)) continue;
      const spacing = spacingOf(block);
      known.set(spacingXml(spacing), spacing);
      usual.add(spacingXml(spacing), textOf(block).length);
    }
    this.spacing = known.get(usual.top() ?? "") ?? spacingOf(EMPTY);
    for (const { font } of [this.base, ...this.heads]) this.fonts.add(font);
  }

  // ---------------------------------------------------------------- words

  /** How letters differ from those of the body text; all there is to say about them when `full`. */
  private look(style: FlowStyle, how: Wording): string {
    const { base } = this;
    const { full = false, mark = false, link = false, rtl = false, text = "" } = how;
    // A link that nobody has given a look has the usual one.
    const bare = link && style.color === undefined && style.underline === undefined;
    const font = fontName(style.font) ?? (full ? base.font : undefined);
    const color = hex(style.color);
    const size = style.size ? halves(style.size) : 0;
    let out = link ? '<w:rStyle w:val="Hyperlink"/>' : "";
    if (font) this.fonts.add(font);
    if (font && (full || font !== base.font)) out += fontsXml(font);
    if (style.bold || full) out += onOff("b", Boolean(style.bold)) + onOff("bCs", Boolean(style.bold));
    if (style.italic || full) out += onOff("i", Boolean(style.italic)) + onOff("iCs", Boolean(style.italic));
    if (style.strike && !mark) out += "<w:strike/>";
    if (color && (full || link || color !== hex(base.color))) out += `<w:color w:val="${color}"/>`;
    if (!color && !bare && !mark && hex(base.color) !== "000000") out += '<w:color w:val="auto"/>';
    const tracking = within(style.tracking);
    if (tracking !== 0 && !mark) out += `<w:spacing w:val="${tracking}"/>`;
    if (size && (full || size !== halves(base.size))) out += `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
    if (mark) return out;
    if (style.underline) out += '<w:u w:val="single"/>';
    else if (link && !bare) out += '<w:u w:val="none"/>';
    out += shadeXml(style.highlight);
    if (style.script) out += `<w:vertAlign w:val="${style.script === "super" ? "superscript" : "subscript"}"/>`;
    if (rtl && /[\u{590}-\u{8ff}]/u.test(text)) out += "<w:rtl/>";
    if (/[\u{900}-\u{97f}]/u.test(text)) out += '<w:lang w:bidi="hi-IN"/>';
    return out;
  }

  para(para: FlowPara, room: Room, turn: boolean, framed: boolean) {
    const loose = { drawings: "" };
    const content = this.runs(para, room, framed ? loose : null);
    const props = this.props(para, room, turn, framed);
    const made = { props, mark: this.markProps(para, room), section: "", content, framed };
    return { para: made, loose: loose.drawings };
  }

  tiny(turn: boolean): WordPara {
    const props = `${turnXml(turn)}<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>`;
    const mark = '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>';
    return { props, mark, section: "", content: "", framed: false };
  }

  rule(rule: FlowRule, turn: boolean): WordPara {
    const line = { color: rule.color ?? "#000000", width: rule.width ?? 0.75 };
    const border = `<w:pBdr>${lineXml("bottom", line, 1)}</w:pBdr>`;
    const spacing = '<w:spacing w:before="60" w:after="120" w:line="20" w:lineRule="exact"/>';
    return { ...this.tiny(false), props: turnXml(turn) + border + spacing };
  }

  join({ props, mark, section, content }: WordPara): string {
    const inner = props + mark + section;
    return `<w:p>${inner ? `<w:pPr>${inner}</w:pPr>` : ""}${content}</w:p>`;
  }

  private markProps(para: FlowPara, room: Room): string {
    const style = markStyle(para);
    const size = style.size ?? (isBlank(para) ? room.size : undefined);
    const look = this.look({ ...style, size }, { full: Boolean(para.heading), mark: true });
    return look ? `<w:rPr>${look}</w:rPr>` : "";
  }

  /** `loose` takes the floating pictures of a paragraph that cannot hold them. */
  private runs(para: FlowPara, room: Room, loose: { drawings: string } | null): string {
    let out = "";
    let text = "";
    let textLook = "";
    let link: string | null = null;
    let linked = "";
    const how = { full: Boolean(para.heading), rtl: isRtl(para) };
    const endText = () => {
      if (text) linked += `<w:r>${textLook ? `<w:rPr>${textLook}</w:rPr>` : ""}${textXml(text)}</w:r>`;
      text = "";
    };
    const endLink = () => {
      endText();
      const id = link && linked ? room.part.link(link) : "";
      out += id ? `<w:hyperlink r:id="${id}" w:history="1">${linked}</w:hyperlink>` : linked;
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
        endText();
        linked += this.picture(run.image, room, loose);
        continue;
      }
      const look = this.look(run.style, { ...how, link: to !== null, text: words });
      if (field || look !== textLook) endText();
      textLook = look;
      if (field) linked += fieldXml(field === "page" ? "PAGE" : "NUMPAGES", look);
      else text += words;
    }
    endLink();
    return out;
  }

  private props(para: FlowPara, room: Room, turn: boolean, framed: boolean): string {
    const heading = headingOf(para);
    const item = para.list ? this.lists.use(para, this.base.size) : null;
    const band = room.place === "header" || room.place === "footer";
    const rtl = isRtl(para);
    let style = item ? "ListParagraph" : "";
    if (band) style = room.place === "header" ? "Header" : "Footer";
    if (heading) style = `Heading${heading}`;
    let out = style ? `<w:pStyle w:val="${style}"/>` : "";
    if (para.keepNext) out += "<w:keepNext/>";
    else if (heading && para.keepNext === false) out += '<w:keepNext w:val="0"/>';
    out += turnXml(turn);
    if (framed && para.frame) out += frameXml(para.frame);
    if (item) out += `<w:numPr><w:ilvl w:val="${item.at}"/><w:numId w:val="${item.list.id}"/></w:numPr>`;
    out += bordersXml(para.border) + shadeXml(para.fill) + (band ? this.bandTabs(para, room) : tabsXml(para));
    if (rtl) out += "<w:bidi/>";
    const spacing = spacingOf(
      para,
      para.runs.some((run) => run.image && (!run.image.float || room.place === "box")),
    );
    // Headings and cells have a spacing of their own to be told apart from.
    const own = heading || band || room.place === "cell";
    if (own || spacingXml(spacing) !== spacingXml(this.spacing)) out += spacingXml(spacing);
    out += indentXml(para, item);
    const justify = (rtl ? JUSTIFY_RTL : JUSTIFY)[para.align ?? (rtl ? "right" : "left")];
    return justify === "left" ? out : `${out}<w:jc w:val="${justify}"/>`;
  }

  /** The stops of a header or footer, as far as its style does not have them already. */
  private bandTabs(para: FlowPara, room: Room): string {
    const usual = this.usualStops();
    const own = stopsOf(para, true, room.w);
    const key = (stops: readonly Stop[]) => stops.map(({ kind, at }) => kind + within(at)).join();
    if (key(own) === key(usual)) return "";
    const gone = usual.filter(({ at }) => !own.some((stop) => within(stop.at) === within(at)));
    return stopsXml([...own, ...gone.map(({ at }) => ({ kind: "clear", at }))]);
  }

  private usualStops = () => bandStops(paper(this.doc.sections[0]).width);

  // ---------------------------------------------------------------- drawings

  private newId() {
    this.drawings += 1;
    return this.drawings;
  }

  private picture(image: FlowImage, room: Room, loose: { drawings: string } | null): string {
    const rel = room.part.image(this.media.name(this.pictures.get(image)));
    const turned = turnedSize(image.w, image.h, image.angle);
    const id = this.newId();
    const name = `name="Picture ${id}" descr="${attr(image.alt ?? "")}"`;
    // Text boxes cannot hold floating things, and a frame is already where it should be.
    const float = room.place === "box" || (loose && image.float?.from === "para") ? undefined : image.float;
    // What is higher than the page, with the room letters have below their line, would be cut off at its end.
    const scale = float ? 1 : Math.min(1, (room.h - 3 - this.base.size * 0.35) / turned.h, (MAX_PAGE - 4) / turned.w);
    const size = `cx="${emu(Math.max(0.5, image.w * scale))}" cy="${emu(Math.max(0.5, image.h * scale))}"`;
    const crop = cropOf(image);
    const part = (value: number) => Math.round(value * 100000);
    const cut = crop
      ? `<a:srcRect l="${part(crop.x)}" t="${part(crop.y)}" r="${part(1 - crop.x - crop.w)}" ` +
        `b="${part(1 - crop.y - crop.h)}"/>`
      : "";
    const turn = Math.round((((finite(image.angle) % 360) + 360) % 360) * 60000);
    const graphic =
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic>' +
      `<a:graphicData uri="${DRAWING}/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" ${name}/><pic:cNvPicPr/>` +
      `</pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/>${cut}<a:stretch><a:fillRect/></a:stretch>` +
      `</pic:blipFill><pic:spPr><a:xfrm${turn ? ` rot="${turn}"` : ""}><a:off x="0" y="0"/><a:ext ${size}/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    const side = emu(Math.max(0, (turned.w - image.w) * scale) / 2);
    const top = emu(Math.max(0, (turned.h - image.h) * scale) / 2);
    const about = `<wp:extent ${size}/><wp:effectExtent l="${side}" t="${top}" r="${side}" b="${top}"/>`;
    const props = `<wp:docPr id="${id}" ${name}/>`;
    if (!float)
      return (
        `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">${about}${props}${graphic}</wp:inline>` +
        "</w:drawing></w:r>"
      );
    const drawing =
      `<w:r><w:drawing>${anchorXml(float, id, Boolean(float.behind), room.place)}${about}<wp:wrapNone/>${props}` +
      `${graphic}</wp:anchor></w:drawing></w:r>`;
    if (!loose) return drawing;
    loose.drawings += drawing;
    return "";
  }

  /** A shape with or without words: the way Word does it now, and the way it did before 2010. */
  box(box: FlowBox, room: Room): string {
    const id = this.newId();
    const name = shapeName(box.shape);
    const pad = boxPad(box, this.base.size);
    let words = "";
    if (hasWords(box.blocks) && !isLineShape(name)) {
      const inside: Room = { ...room, place: "box", w: Math.max(1, shapeRoom(box).w - pad.x * 2), h: MAX_PAGE };
      words = this.lists.apart(() => {
        const story = new WordStory<Room>(this, inside);
        for (const para of box.blocks) story.add(para);
        return `<w:txbxContent>${story.end()}</w:txbxContent>`;
      });
    }
    // Words that do not fit would be cut off: such a box grows with them.
    const unseen = boxFill(box) === null && !boxLine(box) && (box.valign ?? "top") === "top";
    const grows = words !== "" && (unseen || isCramped(box, pad, this.base.size));
    const drawing: Drawing = { box, id, name, words, pad, grows };
    return (
      `<w:r><mc:AlternateContent><mc:Choice Requires="wps">${modernShape(drawing, room.place)}</mc:Choice>` +
      `<mc:Fallback>${oldShape(drawing)}</mc:Fallback></mc:AlternateContent></w:r>`
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
    const cols = grid.cols.slice(from, to).map((w) => Math.max(20, twips(w)));
    const line = table.border ?? null;
    // Word cannot show what reaches further than its widest page.
    const left = Math.min(within(table.left), MAX_TWIPS - sumCols(cols));
    const place =
      table.align === "center" || table.align === "right"
        ? `<w:jc w:val="${table.align}"/>`
        : `<w:tblInd w:w="${left}" w:type="dxa"/>`;
    const lines = ["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => lineXml(side, line));
    const pads = (["top", "left", "bottom", "right"] as const).map(
      (side) => `<w:${side} w:w="${twips(grid.pad[side])}" w:type="dxa"/>`,
    );
    const rows = grid.rows.map((_, r) => this.row(grid, r, from, to, cols, line, room));
    return (
      `<w:tbl><w:tblPr>${line ? '<w:tblStyle w:val="TableGrid"/>' : ""}<w:tblW w:w="${sumCols(cols)}" w:type="dxa"/>` +
      `${place}<w:tblBorders>${lines.join("")}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar>${pads.join("")}</w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" ` +
      'w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
      `<w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`
    );
  }

  private row(
    grid: Grid,
    r: number,
    from: number,
    to: number,
    cols: readonly number[],
    line: FlowLine | null,
    room: Room,
  ): string {
    const { slots, h, head } = grid.rows[r];
    const size = smallest(slots.flatMap((placed) => (placed ? [placed.cell] : [])));
    let last = to;
    while (last > from + 1 && !slots[last - 1]) last -= 1;
    let out = "";
    for (let c = from; c < last;) {
      const placed = slots[c];
      const end = placed ? Math.min(last, placed.col + placed.cols) : c + 1;
      const width = sumCols(cols, c - from, end - c);
      let props = `<w:tcW w:w="${width}" w:type="dxa"/>`;
      if (end - c > 1) props += `<w:gridSpan w:val="${end - c}"/>`;
      if (placed && placed.rows > 1) props += `<w:vMerge${placed.row === r ? ' w:val="restart"' : ""}/>`;
      props += cellBorders(grid, placed, r, c, end, line) + shadeXml(placed?.cell.fill);
      if (placed?.cell.valign === "middle") props += '<w:vAlign w:val="center"/>';
      if (placed?.cell.valign === "bottom") props += '<w:vAlign w:val="bottom"/>';
      const here = placed && placed.row === r && placed.col === c ? placed.cell.blocks : [];
      const w = Math.max(1, width / 20 - grid.pad.left - grid.pad.right);
      const story = new WordStory<Room>(this, { ...room, place: "cell", w, size });
      this.lists.stop();
      for (const para of here.length > 0 ? here : [EMPTY]) story.add(para);
      out += `<w:tc><w:tcPr>${props}</w:tcPr>${story.end()}</w:tc>`;
      c = end;
    }
    let props = "";
    if (last < to) {
      props += `<w:gridAfter w:val="${to - last}"/>`;
      props += `<w:wAfter w:w="${sumCols(cols, last - from, to - last)}" w:type="dxa"/>`;
    }
    if (h && h > 0) props += `<w:trHeight w:val="${clamp(twips(h), 1, MAX_TWIPS)}" w:hRule="atLeast"/>`;
    if (head) props += "<w:tblHeader/>";
    return `<w:tr>${props ? `<w:trPr>${props}</w:trPr>` : ""}${out}</w:tr>`;
  }

  // ---------------------------------------------------------------- pages

  private section(section: FlowSection, bands: string): string {
    const { page, margin, columns, gap, headerAt, footerAt } = paper(section);
    const turned = page.w > page.h ? ' w:orient="landscape"' : "";
    const many = columns > 1 ? ` w:num="${columns}"` : "";
    return (
      `<w:sectPr>${bands}<w:type w:val="nextPage"/><w:pgSz w:w="${twips(page.w)}" w:h="${twips(page.h)}"${turned}/>` +
      `<w:pgMar w:top="${twips(margin.top)}" w:right="${twips(margin.right)}" w:bottom="${twips(margin.bottom)}" ` +
      `w:left="${twips(margin.left)}" w:header="${twips(headerAt)}" w:footer="${twips(footerAt)}" w:gutter="0"/>` +
      `<w:cols${many} w:space="${twips(columns > 1 ? gap : 36)}"/></w:sectPr>`
    );
  }

  private band(place: "header" | "footer", blocks: readonly FlowBlock[], section: FlowSection): string {
    const name = `${place}${this.parts.filter((one) => one.type === place).length + 1}.xml`;
    const part = new Part(`word/${name}`);
    const { width, height } = paper(section);
    const words = this.lists.apart(() => {
      const story = new WordStory<Room>(this, { part, place, fields: true, w: width, h: height });
      for (const block of blocks.length > 0 ? blocks : [EMPTY]) story.add(block);
      return story.end();
    });
    const tag = place === "header" ? "hdr" : "ftr";
    this.parts.push({ part, type: place, xml: `${HEAD}<w:${tag} ${SPACES}>${words}</w:${tag}>` });
    return `<w:${place}Reference w:type="default" r:id="${this.document.file(place, name)}"/>`;
  }

  private body(): string {
    const { sections } = this.doc;
    const shown = { header: "", footer: "" };
    const bytes = new Map<Uint8Array, number>();
    const key = (blocks: readonly FlowBlock[] | undefined, section: FlowSection) =>
      blocks?.length
        ? `${paper(section).width} ${JSON.stringify(blocks, (_, value) => {
            if (!(value instanceof Uint8Array)) return value;
            if (!bytes.has(value)) bytes.set(value, bytes.size);
            return bytes.get(value);
          })}`
        : "";
    let out = "";
    sections.forEach((section, i) => {
      let bands = "";
      for (const place of ["header", "footer"] as const) {
        // What a section does not say it takes from the one before it.
        const now = key(section[place], section);
        if (now !== shown[place]) bands += this.band(place, section[place] ?? [], section);
        shown[place] = now;
      }
      const h = bodyHeight(section, MAX_PAGE, this.base.size);
      const { column } = paper(section);
      const story = new WordStory<Room>(this, { part: this.document, place: "body", fields: false, w: column, h });
      for (const block of section.blocks) story.add(block);
      const look = this.section(section, bands);
      out += i < sections.length - 1 ? story.end(look) : story.end() + look;
    });
    return out;
  }

  // ---------------------------------------------------------------- the other files

  private styles(): string {
    const look = (one: Look & { bold?: boolean; italic?: boolean }) =>
      fontsXml(one.font) +
      (one.bold ? "<w:b/><w:bCs/>" : "") +
      (one.italic ? "<w:i/><w:iCs/>" : "") +
      `<w:color w:val="${hex(one.color) ?? "auto"}"/><w:sz w:val="${halves(one.size)}"/>` +
      `<w:szCs w:val="${halves(one.size)}"/>`;
    const style = (type: string, id: string, name: string, rest: string) =>
      `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${rest}</w:style>`;
    const basic = (type: string, id: string, name: string, rest: string) =>
      `<w:style w:type="${type}" w:default="1" w:styleId="${id}"><w:name w:val="${name}"/>${rest}</w:style>`;
    const unseen = '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>';
    const normal = '<w:basedOn w:val="Normal"/>';
    const heads = this.heads.map((one, i) => {
      const spacing = one.first
        ? spacingOf(one.first)
        : { before: twips(one.size), after: twips(one.size / 3), line: lineRule(undefined) };
      return style(
        "paragraph",
        `Heading${i + 1}`,
        `heading ${i + 1}`,
        `${normal}<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/>` +
          `${spacingXml(spacing)}<w:outlineLvl w:val="${i}"/></w:pPr><w:rPr>${look(one)}</w:rPr>`,
      );
    });
    const stops = stopsXml(this.usualStops());
    const band = (id: string) =>
      style(
        "paragraph",
        id,
        id.toLowerCase(),
        `${normal}<w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr>${stops}</w:pPr>`,
      );
    const cell = (name: string, w: number) => `<w:${name} w:w="${w}" w:type="dxa"/>`;
    const pads = cell("top", 0) + cell("left", 108) + cell("bottom", 0) + cell("right", 108);
    const edges = ["top", "left", "bottom", "right", "insideH", "insideV"].map(
      (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`,
    );
    let complex = false;
    eachDocPara(this.doc, (para) => (complex ||= isComplex(textOf(para))));
    const known = (name: string, priority: number) =>
      `<w:lsdException w:name="${name}" w:uiPriority="${priority}" w:qFormat="1"/>`;
    return [
      `${HEAD}<w:styles ${SPACES}><w:docDefaults><w:rPrDefault><w:rPr>${look(this.base)}`,
      `<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="${complex ? "hi-IN" : "ar-SA"}"/></w:rPr></w:rPrDefault>`,
      `<w:pPrDefault><w:pPr>${spacingXml(this.spacing)}</w:pPr></w:pPrDefault></w:docDefaults>`,
      '<w:latentStyles w:defLockedState="0" w:defUIPriority="99" w:defSemiHidden="0" w:defUnhideWhenUsed="0" ',
      `w:defQFormat="0" w:count="376">${known("Normal", 0)}${known("Title", 10)}${known("Subtitle", 11)}`,
      `${known("List Paragraph", 34)}</w:latentStyles>`,
      basic("paragraph", "Normal", "Normal", "<w:qFormat/>"),
      ...heads,
      basic("character", "DefaultParagraphFont", "Default Paragraph Font", unseen),
      basic(
        "table",
        "TableNormal",
        "Normal Table",
        `${unseen}<w:tblPr>${cell("tblInd", 0)}<w:tblCellMar>${pads}</w:tblCellMar></w:tblPr>`,
      ),
      basic("numbering", "NoList", "No List", unseen),
      style(
        "paragraph",
        "ListParagraph",
        "List Paragraph",
        `${normal}<w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr>`,
      ),
      style(
        "character",
        "Hyperlink",
        "Hyperlink",
        '<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr>' +
          '<w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>',
      ),
      band("Header"),
      band("Footer"),
      style(
        "table",
        "TableGrid",
        "Table Grid",
        '<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:before="0" w:after="0" ' +
          `w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>${edges.join("")}</w:tblBorders></w:tblPr>`,
      ),
      "</w:styles>",
    ].join("");
  }

  private fontTable(): string {
    const families = { sans: "swiss", serif: "roman", mono: "modern", script: "script" };
    const fonts = [...this.fonts].sort().map((font) => {
      const kind = fontKind(font);
      const other = font === STAND_IN[kind] ? "" : `<w:altName w:val="${STAND_IN[kind]}"/>`;
      return (
        `<w:font w:name="${attr(font)}">${other}<w:charset w:val="00"/><w:family w:val="${families[kind]}"/>` +
        `<w:pitch w:val="${kind === "mono" ? "fixed" : "variable"}"/></w:font>`
      );
    });
    return `${HEAD}<w:fonts ${SPACES}>${fonts.join("")}</w:fonts>`;
  }

  /** Every file of the package, by its path. */
  files(): Map<string, string | Uint8Array> {
    const body = this.body();
    const out = new Map<string, string | Uint8Array>([["[Content_Types].xml", ""]]);
    const main = "application/vnd.openxmlformats-officedocument.wordprocessingml";
    const types: string[] = [];
    const put = (path: string, type: string, text: string) => {
      out.set(path, text);
      types.push(`<Override PartName="/${path}" ContentType="${type}"/>`);
    };
    const own = (name: string, text: string) => {
      put(`word/${name}.xml`, `${main}.${name}+xml`, text);
      this.document.file(name, `${name}.xml`);
    };
    const core = `${PACKAGE}/relationships/metadata/core-properties`;
    out.set(
      "_rels/.rels",
      `${HEAD}<Relationships xmlns="${PACKAGE}/relationships">` +
        `<Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="${core}" Target="docProps/core.xml"/>` +
        `<Relationship Id="rId3" Type="${OFFICE}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    );
    const document = `${HEAD}<w:document ${SPACES}><w:body>${body}</w:body></w:document>`;
    put("word/document.xml", `${main}.document.main+xml`, document);
    own("styles", this.styles());
    own("settings", SETTINGS);
    own("fontTable", this.fontTable());
    if (this.lists.lists.length > 0) own("numbering", numberingXml(this.lists.lists));
    for (const { part, type, xml: text } of this.parts) put(part.path, `${main}.${type}+xml`, text);
    for (const part of [this.document, ...this.parts.map((one) => one.part)]) {
      const rels = part.relsXml();
      if (rels) out.set(part.relsPath, rels);
    }
    for (const { name, picture } of this.media.files) out.set(`word/media/${name}`, picture.bytes);
    const { title, author } = this.doc;
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    put(
      "docProps/core.xml",
      "application/vnd.openxmlformats-package.core-properties+xml",
      `${HEAD}<cp:coreProperties xmlns:cp="${PACKAGE}/metadata/core-properties" ` +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        (title ? `<dc:title>${xml(title)}</dc:title>` : "") +
        (author ? `<dc:creator>${xml(author)}</dc:creator>` : "") +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    );
    put(
      "docProps/app.xml",
      "application/vnd.openxmlformats-officedocument.extended-properties+xml",
      `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
        "<DocSecurity>0</DocSecurity></Properties>",
    );
    const images = new Set(this.media.files.map(({ picture }) => picture.type));
    out.set(
      "[Content_Types].xml",
      `${HEAD}<Types xmlns="${PACKAGE}/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        [...images].map((type) => `<Default Extension="${type}" ContentType="image/${type}"/>`).join("") +
        `${types.join("")}</Types>`,
    );
    return out;
  }
}

const compat = (name: string, value: number) =>
  `<w:compatSetting w:name="${name}" w:uri="http://schemas.microsoft.com/office/word" w:val="${value}"/>`;

/** 15 is Word 2013 and later: anything else opens in compatibility mode. */
const SETTINGS = [
  `${HEAD}<w:settings ${SPACES}><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>`,
  '<w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:doNotExpandShiftReturn/>',
  compat("compatibilityMode", 15),
  compat("overrideTableStyleFontSizeAndJustification", 1),
  compat("enableOpenTypeFeatures", 1),
  compat("doNotFlipMirrorIndents", 1),
  compat("differentiateMultirowTableHeaders", 1),
  '</w:compat><w:themeFontLang w:val="en-US"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=","/></w:settings>',
].join("");

// ---------------------------------------------------------------- parts of paragraphs and cells

const EMPTY: FlowPara = { kind: "para", runs: [] };

const BREAKS: Record<string, string> = {
  "\n": "<w:br/>",
  "\t": "<w:tab/>",
  "\u{ad}": "<w:softHyphen/>",
  "\u{2011}": "<w:noBreakHyphen/>",
};

const textXml = (text: string) =>
  text
    .split(/([\n\t\u{ad}\u{2011}])/u)
    .map((part) => BREAKS[part] ?? (part ? `<w:t xml:space="preserve">${xml(part)}</w:t>` : ""))
    .join("");

function fieldXml(code: string, look: string): string {
  const run = (inner: string) => `<w:r>${look ? `<w:rPr>${look}</w:rPr>` : ""}${inner}</w:r>`;
  const sign = (type: string) => run(`<w:fldChar w:fldCharType="${type}"/>`);
  const instruction = run(`<w:instrText xml:space="preserve"> ${code} </w:instrText>`);
  return sign("begin") + instruction + sign("separate") + run("<w:t>1</w:t>") + sign("end");
}

/** "none" lets a frame stand exactly where it should: any other wrapping moves frames out of each other's way. */
function frameXml({ x, y, w, h }: NonNullable<FlowPara["frame"]>): string {
  const high = h && h > 0 ? ` w:h="${clamp(twips(h), 1, MAX_TWIPS)}" w:hRule="atLeast"` : "";
  // Word counts from 1: 0 is for "wherever the paragraph happens to be".
  const at = (points: number) => within(points) + 1 || 1;
  return (
    `<w:framePr w:w="${clamp(twips(w), 1, MAX_TWIPS)}"${high} w:hSpace="0" w:wrap="none" w:vAnchor="page" ` +
    `w:hAnchor="page" w:x="${at(x)}" w:y="${at(y)}"/>`
  );
}

function bordersXml(border: FlowPara["border"]): string {
  if (!border) return "";
  const { top, right, bottom, left } = border;
  let out = "";
  if (top) out += lineXml("top", top, 1);
  if (left) out += lineXml("left", left, 4);
  if (bottom) out += lineXml("bottom", bottom, 1);
  if (right) out += lineXml("right", right, 4);
  // Word takes neighbours with the same lines for one block: a line under each has to be asked for.
  if (bottom && !top) out += lineXml("between", bottom, 1);
  return out ? `<w:pBdr>${out}</w:pBdr>` : "";
}

function stopsXml(stops: readonly { kind: string; at: number }[]): string {
  const known = new Map(stops.map(({ kind, at }) => [within(at), kind]));
  const sorted = [...known].sort(([a], [b]) => a - b).slice(0, 60);
  return `<w:tabs>${sorted.map(([at, kind]) => `<w:tab w:val="${kind}" w:pos="${at}"/>`).join("")}</w:tabs>`;
}

const tabsXml = (para: FlowPara) => (para.tabs?.length ? stopsXml(stopsOf(para, false, 0)) : "");

/** Indents. Those of a list's level go without saying. */
function indentXml(para: FlowPara, item: BookItem | null): string {
  const left = within(item ? item.left : para.left);
  const first = within(item ? item.first : para.first);
  const right = within(para.right);
  let out = "";
  if (left !== within(item?.level.left) || first !== within(item?.level.first)) {
    out += ` w:left="${left}"`;
    if (first < 0) out += ` w:hanging="${-first}"`;
    else if (first > 0 || item) out += ` w:firstLine="${first}"`;
  }
  if (right !== 0) out += ` w:right="${right}"`;
  return out ? `<w:ind${out}/>` : "";
}

/** The lines of a cell that are not simply those of its table. It covers the columns from `c` to `end`. */
function cellBorders(grid: Grid, placed: Placed | null, r: number, c: number, end: number, line: FlowLine | null) {
  const none = () => null;
  const first = placed?.row === r;
  const last = placed !== null && placed.row + placed.rows - 1 === r;
  const sides = [
    { name: "top", shown: first, get: () => placed && sideOf(grid, placed, "top") },
    { name: "left", shown: true, get: () => grid.down[r][c] },
    { name: "bottom", shown: last, get: () => placed && sideOf(grid, placed, "bottom") },
    { name: "right", shown: true, get: () => grid.down[r][end] },
  ].map(({ name, shown, get }) => ({ name, shown: shown || !placed, get: placed ? get : none }));
  // Where a merged cell goes on there is no edge to draw.
  const odd = sides.filter(({ shown, get }) => shown && (!placed || lineKey(get()) !== lineKey(line)));
  const lines = odd.map(({ name, get }) => lineXml(name, get()));
  return lines.length > 0 ? `<w:tcBorders>${lines.join("")}</w:tcBorders>` : "";
}

// ---------------------------------------------------------------- shapes

type Spot = { x: number; y: number; from: "page" | "para" };

function anchorXml(at: Spot, id: number, behind: boolean, place: Place): string {
  const page = at.from === "page";
  const from = (name: string, what: string, points: number) =>
    `<wp:${name} relativeFrom="${what}"><wp:posOffset>${emu(points)}</wp:posOffset></wp:${name}>`;
  return (
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251658240 + id * 1024}" ` +
    `behindDoc="${behind ? 1 : 0}" locked="0" layoutInCell="${page && place === "cell" ? 0 : 1}" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>${from("positionH", page ? "page" : "column", at.x)}` +
    from("positionV", page ? "page" : "paragraph", at.y)
  );
}

type Drawing = {
  box: FlowBox;
  id: number;
  name: string;
  words: string;
  pad: { x: number; y: number };
  grows: boolean;
};

function modernShape({ box, id, name, words, pad, grows }: Drawing, place: Place): string {
  const fill = boxFill(box);
  const line = boxLine(box);
  const size = `cx="${emu(Math.max(0, finite(box.w)))}" cy="${emu(Math.max(0, finite(box.h)))}"`;
  const dash = line?.dash === "dash" ? "dash" : line?.dash === "dot" ? "sysDot" : "solid";
  const anchor = box.valign === "middle" ? "ctr" : box.valign === "bottom" ? "b" : "t";
  let kind = "<wps:cNvSpPr/>";
  if (isLineShape(name)) kind = "<wps:cNvCnPr/>";
  else if (words && name === "rect") kind = '<wps:cNvSpPr txBox="1"/>';
  let outline = `<a:prstGeom prst="${name}"><a:avLst/></a:prstGeom>`;
  if (name === "check" || name === "cross")
    outline =
      '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>' +
      `<a:path w="1000" h="1000" fill="none">${pathXml(name)}</a:path></a:pathLst></a:custGeom>`;
  const solid = (color: string) => `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
  const ink = line
    ? `<a:ln w="${clamp(emu(line.width), 0, 20116800)}">${solid(hex(line.color) ?? "000000")}` +
      `<a:prstDash val="${dash}"/>${box.shape === "arrow" ? '<a:tailEnd type="triangle"/>' : ""}</a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  return (
    `<w:drawing>${anchorXml(box, id, isBehind(box), place)}<wp:extent ${size}/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
    `<wp:docPr id="${id}" name="${words ? "Text Box" : "Shape"} ${id}"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic><a:graphicData uri="${SHAPE}"><wps:wsp>${kind}<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext ${size}/>` +
    `</a:xfrm>${outline}${fill ? solid(fill) : "<a:noFill/>"}${ink}</wps:spPr>` +
    (words ? `<wps:txbx>${words}</wps:txbx>` : "") +
    '<wps:bodyPr rot="0" vert="horz" wrap="square" ' +
    `lIns="${emu(pad.x)}" tIns="${emu(pad.y)}" rIns="${emu(pad.x)}" bIns="${emu(pad.y)}" anchor="${anchor}" ` +
    `anchorCtr="0">${grows ? "<a:spAutoFit/>" : "<a:noAutofit/>"}</wps:bodyPr></wps:wsp></a:graphicData></a:graphic>` +
    "</wp:anchor></w:drawing>"
  );
}

/** One of the editor's own marks, in thousandths of its box. */
function pathXml(name: string): string {
  const point = (x: number, y: number) => `<a:pt x="${Math.round(x)}" y="${Math.round(y)}"/>`;
  return shapeParts(name, 1000, 1000)
    .flatMap((part) => part.path)
    .map((cmd) => {
      if (cmd[0] === "M") return `<a:moveTo>${point(cmd[1], cmd[2])}</a:moveTo>`;
      return cmd[0] === "L" ? `<a:lnTo>${point(cmd[1], cmd[2])}</a:lnTo>` : "";
    })
    .join("");
}

/** The same shape for programs that only know the drawings of Word 2007. */
function oldShape({ box, id, words, pad, grows }: Drawing): string {
  const [w, h] = [Math.max(0.05, finite(box.w)), Math.max(0.05, finite(box.h))];
  const [cx, cy] = [Math.max(1, twips(w)), Math.max(1, twips(h))];
  const fill = boxFill(box);
  const line = boxLine(box);
  const path = shapeParts(box.shape, cx, cy).map(({ path: cmds, paint }) => {
    const drawn = cmds.map(([sign, ...at]) =>
      sign === "Z" ? "x" : sign.toLowerCase() + at.map((value) => Math.round(value)).join(","),
    );
    return `${drawn.join("")}${paint === "fill" ? "ns" : paint === "stroke" ? "nf" : ""}e`;
  });
  const from = box.from === "page" ? "page" : "text";
  const style = [
    "position:absolute",
    `margin-left:${finite(box.x).toFixed(2)}pt`,
    `margin-top:${finite(box.y).toFixed(2)}pt`,
    `width:${w.toFixed(2)}pt`,
    `height:${h.toFixed(2)}pt`,
    `z-index:${isBehind(box) ? id - 1000000 : id}`,
    `mso-position-horizontal-relative:${from}`,
    `mso-position-vertical-relative:${from}`,
    `v-text-anchor:${box.valign ?? "top"}`,
  ];
  const ink = line
    ? `strokecolor="#${hex(line.color) ?? "000000"}" strokeweight="${line.width.toFixed(2)}pt"`
    : 'stroked="f"';
  let stroke = line?.dash === "dash" ? ' dashstyle="dash"' : line?.dash === "dot" ? ' dashstyle="1 1"' : "";
  if (box.shape === "arrow") stroke += ' endarrow="block"';
  const inset = [pad.x, pad.y, pad.x, pad.y].map((value) => `${value.toFixed(2)}pt`);
  const fit = grows ? ' style="mso-fit-shape-to-text:t"' : "";
  return (
    `<w:pict><v:shape id="Shape${id}" style="${style.join(";")}" coordsize="${cx},${cy}" path="${path.join("")}" ` +
    `${fill ? `fillcolor="#${fill}"` : 'filled="f"'} ${ink}>${stroke ? `<v:stroke${stroke}/>` : ""}` +
    (words ? `<v:textbox${fit} inset="${inset.join(",")}">${words}</v:textbox>` : "") +
    `<w10:wrap anchorx="${from}" anchory="${from}"/></v:shape></w:pict>`
  );
}

// ---------------------------------------------------------------- the file

const BLANK: FlowSection = { w: 595.3, h: 841.9, margin: { top: 72, right: 72, bottom: 72, left: 72 }, blocks: [] };

export async function writeDocx(doc: FlowDoc): Promise<Uint8Array> {
  const pictures = new Pictures({ gif: true, bake: false });
  const [{ default: JSZip }] = await Promise.all([import("jszip"), pictures.load(doc)]);
  const zip = new JSZip();
  const whole = doc.sections.length > 0 ? doc : { ...doc, sections: [BLANK] };
  for (const [path, data] of new Writer(whole, pictures).files()) {
    // Entries for folders make some readers refuse the file. Pictures are small already.
    const compression = typeof data === "string" ? "DEFLATE" : "STORE";
    zip.file(path, data, { createFolders: false, compression, compressionOptions: { level: 6 } });
  }
  return zip.generateAsync({ type: "uint8array" });
}
