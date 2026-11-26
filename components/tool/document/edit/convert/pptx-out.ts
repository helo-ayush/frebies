import { numberMark } from "../model";
import type {
  FixedDoc,
  FixedImage,
  FixedItem,
  FixedPage,
  FixedShape,
  FixedTable,
  FixedText,
  FlowCell,
  FlowLine,
  FlowPara,
  FlowRun,
  FlowStyle,
  LineHead,
} from "./flow";

/**
 * Pages as a PowerPoint deck: a slide for every page, everything on it in its
 * place. Boxes are read as Office keeps them: the place before turning, and an
 * angle clockwise about the middle.
 */

// ---------------------------------------------------------------- shapes

/**
 * Every shape Office knows, with how its adjust values start out (an angle in degrees, the rest
 * in hundred thousandths) and their names where those are not adj, or adj1, adj2 and so on.
 */
const SHAPES = `rect parallelogram=25000 trapezoid=25000 diamond roundRect=16667 octagon=29289 triangle=50000
  rtTriangle ellipse hexagon=adj:25000,vf:115470 plus=25000 pentagon=hf:105146,vf:110557 can=25000 cube=25000
  bevel=12500 foldedCorner=16667 smileyFace=4653 donut=25000 noSmoking=18750 blockArc=180°,0°,25000 heart
  lightningBolt sun=25000 moon=50000 arc=270°,0° bracketPair=16667 bracePair=8333 plaque=16667 leftBracket=8333
  rightBracket=8333 leftBrace=8333,50000 rightBrace=8333,50000 rightArrow=50000,50000 leftArrow=50000,50000
  upArrow=50000,50000 downArrow=50000,50000 leftRightArrow=50000,50000 upDownArrow=50000,50000
  quadArrow=22500,22500,22500 leftRightUpArrow=25000,25000,25000 bentArrow=25000,25000,25000,43750
  uturnArrow=25000,25000,25000,43750,75000 leftUpArrow=25000,25000,25000 bentUpArrow=25000,25000,25000
  curvedRightArrow=25000,50000,25000 curvedLeftArrow=25000,50000,25000 curvedUpArrow=25000,50000,25000
  curvedDownArrow=25000,50000,25000 stripedRightArrow=50000,50000 notchedRightArrow=50000,50000 homePlate=50000
  chevron=50000 rightArrowCallout=25000,25000,25000,64977 leftArrowCallout=25000,25000,25000,64977
  upArrowCallout=25000,25000,25000,64977 downArrowCallout=25000,25000,25000,64977
  leftRightArrowCallout=25000,25000,25000,48123 upDownArrowCallout=25000,25000,25000,48123
  quadArrowCallout=18515,18515,18515,48123 circularArrow=12500,19.03865°,340.96135°,180°,12500
  flowChartProcess flowChartAlternateProcess flowChartDecision flowChartInputOutput flowChartPredefinedProcess
  flowChartInternalStorage flowChartDocument flowChartMultidocument flowChartTerminator flowChartPreparation
  flowChartManualInput flowChartManualOperation flowChartConnector flowChartOffpageConnector
  flowChartPunchedCard flowChartPunchedTape flowChartSummingJunction flowChartOr flowChartCollate flowChartSort
  flowChartExtract flowChartMerge flowChartOnlineStorage flowChartDelay flowChartMagneticTape
  flowChartMagneticDisk flowChartMagneticDrum flowChartDisplay flowChartOfflineStorage irregularSeal1
  irregularSeal2 star4=12500 star5=adj:19098,hf:105146,vf:110557 star6=adj:28868,hf:115470
  star7=adj:34601,hf:102572,vf:105210 star8=37500 star10=adj:42533,hf:105146 star12=37500 star16=37500
  star24=37500 star32=37500 ribbon2=16667,50000 ribbon=16667,50000 ellipseRibbon2=25000,50000,12500
  ellipseRibbon=25000,50000,12500 verticalScroll=12500 horizontalScroll=12500 wave=12500,0 doubleWave=6250,0
  wedgeRectCallout=-20833,62500 wedgeRoundRectCallout=-20833,62500,16667 wedgeEllipseCallout=-20833,62500
  cloudCallout=-20833,62500 borderCallout1=18750,-8333,112500,-38333
  borderCallout2=18750,-8333,18750,-16667,112500,-46667
  borderCallout3=18750,-8333,18750,-16667,100000,-16667,112963,-8333 callout1=18750,-8333,112500,-38333
  callout2=18750,-8333,18750,-16667,112500,-46667 callout3=18750,-8333,18750,-16667,100000,-16667,112963,-8333
  accentCallout1=18750,-8333,112500,-38333 accentCallout2=18750,-8333,18750,-16667,112500,-46667
  accentCallout3=18750,-8333,18750,-16667,100000,-16667,112963,-8333
  accentBorderCallout1=18750,-8333,112500,-38333 accentBorderCallout2=18750,-8333,18750,-16667,112500,-46667
  accentBorderCallout3=18750,-8333,18750,-16667,100000,-16667,112963,-8333 actionButtonBlank actionButtonHome
  actionButtonHelp actionButtonInformation actionButtonBackPrevious actionButtonForwardNext
  actionButtonBeginning actionButtonEnd actionButtonReturn actionButtonDocument actionButtonSound
  actionButtonMovie leftRightRibbon=50000,50000,16667 diagStripe=50000 pie=0°,270°
  nonIsoscelesTrapezoid=25000,25000 decagon=vf:105146 heptagon=hf:102572,vf:105210 dodecagon round1Rect=16667
  round2SameRect=16667,0 round2DiagRect=16667,0 snipRoundRect=16667,16667 snip1Rect=16667
  snip2SameRect=16667,0 snip2DiagRect=0,16667 frame=adj1:12500 halfFrame=33333,33333 teardrop=100000
  chord=45°,270° corner=50000,50000 mathPlus=adj1:23520 mathMinus=adj1:23520 mathMultiply=adj1:23520
  mathDivide=23520,5880,11760 mathEqual=23520,11760 mathNotEqual=23520,110°,11760 cornerTabs squareTabs
  plaqueTabs gear6=15000,3526 gear9=10000,1763 funnel pieWedge
  leftCircularArrow=12500,340.96135°,19.03865°,180°,12500
  leftRightCircularArrow=12500,19.03865°,340.96135°,199.0387°,12500 swooshArrow=25000,16667 cloud chartX
  chartStar chartPlus line lineInv straightConnector1 bentConnector2 bentConnector3=adj1:50000
  bentConnector4=50000,50000 bentConnector5=50000,50000,50000 curvedConnector2 curvedConnector3=adj1:50000
  curvedConnector4=50000,50000 curvedConnector5=50000,50000,50000`;

/** An adjust value: what the file calls it, what it is to begin with, and how many of the file's units make 1. */
export type PresetAdjust = { name: string; value: number; per: number };

export const PRESETS: Record<string, PresetAdjust[]> = Object.fromEntries(
  SHAPES.split(/\s+/).map((word) => {
    const [shape, list] = word.split("=");
    const values = list ? list.split(",") : [];
    const adjusts = values.map((value, i): PresetAdjust => {
      const [raw, own] = value.split(":").reverse();
      const name = own ?? (values.length > 1 ? `adj${i + 1}` : "adj");
      const angle = raw.endsWith("°");
      return { name, value: Number.parseFloat(raw) / (angle ? 1 : 100000), per: angle ? 60000 : 100000 };
    });
    return [shape, adjusts];
  }),
);

// ---------------------------------------------------------------- xml

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** Text for the file, without the characters no XML may hold. */
const esc = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[\ud800-\udfff]/gu, "")
    .replace(/[&<>"]/g, (sign) => ENTITIES[sign]);

/** Points to the file's units. */
const emu = (points: number) => Math.round((Number.isFinite(points) ? points : 0) * 12700);

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const hex = (color: string | undefined): string | null => {
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color ?? "");
  if (short)
    return short
      .slice(1)
      .map((digit) => digit + digit)
      .join("")
      .toUpperCase();
  return /^#?([0-9a-f]{6})/i.exec(color ?? "")?.[1].toUpperCase() ?? null;
};

function solid(color: string | undefined, opacity = 1): string {
  const value = hex(color);
  if (!value) return "<a:noFill/>";
  const alpha = opacity < 1 ? `<a:alpha val="${Math.round(clamp(opacity, 0, 1) * 100000)}"/>` : "";
  return `<a:solidFill><a:srgbClr val="${value}">${alpha}</a:srgbClr></a:solidFill>`;
}

const HEADS: Record<LineHead, string | null> = {
  none: null,
  arrow: "triangle",
  open: "arrow",
  dot: "oval",
  diamond: "diamond",
  // Office has no such end; a short line across stands in for it.
  bar: null,
};

/** A line's looks. `tag` is a:ln, or the side of a table cell. */
function lineXml(line: FlowLine | null | undefined, opacity = 1, tag = "a:ln", ends = ""): string {
  if (!line || !hex(line.color) || line.width <= 0) return `<${tag}><a:noFill/></${tag}>`;
  const dash = line.dash === "dash" ? "dash" : line.dash === "dot" ? "sysDot" : "solid";
  const width = clamp(emu(line.width), 0, 20116800);
  return `<${tag} w="${width}">${solid(line.color, opacity)}<a:prstDash val="${dash}"/>${ends}</${tag}>`;
}

// ---------------------------------------------------------------- fonts

/** Fonts everyone with Office has, for the open ones drawn to the same measure. */
const FONTS: Record<string, string> = {
  arimo: "Arial",
  tinos: "Times New Roman",
  cousine: "Courier New",
  carlito: "Calibri",
  caladea: "Cambria",
  gelasio: "Georgia",
  "open-sans": "Open Sans",
  garamond: "Garamond",
  playfair: "Playfair Display",
  dancing: "Dancing Script",
  vibes: "Great Vibes",
  devanagari: "Nirmala UI",
  symbols: "Segoe UI Symbol",
};

/** How the fonts of a PDF are often called. */
const PDF_NAMES: [RegExp, string][] = [
  [/^(arial|helvetica)(mt|neue|lt|ltstd)?$/i, "Arial"],
  [/^times(newroman)?(ps)?(mt)?$/i, "Times New Roman"],
  [/^courier(new)?(ps)?(mt)?$/i, "Courier New"],
];

function fontName(font: string | undefined): string {
  if (!font) return "Arial";
  if (font.startsWith("lib:")) {
    const id = font.slice(4);
    return (
      FONTS[id] ??
      id.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase())
    );
  }
  if (/^(pdf|user):/.test(font)) return "Arial";
  const bare = font
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/[,-](bold|italic|oblique|regular|roman|medium|semibold|light)+(mt)?$/i, "");
  const flat = bare.replace(/[\s_]/g, "");
  return (
    PDF_NAMES.find(([test]) => test.test(flat))?.[1] ??
    bare
      .replace(/([a-z])(PS|PSMT|MT)$/, "$1")
      .trim()
      .slice(0, 60)
  );
}

/** A font's own line height, for a size of 1. PowerPoint's is 1.2 for all of them. */
const HEIGHTS: Record<string, number> = {
  Arial: 1.149,
  "Times New Roman": 1.149,
  "Courier New": 1.133,
  Calibri: 1.221,
  Cambria: 1.172,
  Georgia: 1.136,
  "Open Sans": 1.362,
  Roboto: 1.172,
  Inter: 1.21,
  Montserrat: 1.219,
  Poppins: 1.5,
  Oswald: 1.482,
  "Playfair Display": 1.333,
  Garamond: 1.125,
  "Nirmala UI": 1.33,
};

const LINE = 1.2;

// ---------------------------------------------------------------- the file's parts

type Link = { id: string; type: string; target: string; external?: boolean };

/** What one part points to. */
class Links {
  readonly list: Link[] = [];

  add(type: string, target: string, external = false): string {
    const known = this.list.find((link) => link.type === type && link.target === target);
    if (known) return known.id;
    const id = `rId${this.list.length + 1}`;
    this.list.push({ id, type, target, external });
    return id;
  }

  xml(): string {
    const each = this.list.map(({ id, type, target, external }) => {
      const mode = external ? ' TargetMode="External"' : "";
      const kind = type.startsWith("http") ? type : `${REL}/${type}`;
      return `<Relationship Id="${id}" Type="${kind}" Target="${esc(target)}"${mode}/>`;
    });
    return `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${each.join("")}</Relationships>`;
  }
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

type Media = { name: string; bytes: Uint8Array };

/** The pictures, each kept once. */
class Pictures {
  readonly list: Media[] = [];
  private readonly known = new Map<Uint8Array, Promise<string | null>>();

  /** The picture's file, or null when it cannot be opened. */
  add(bytes: Uint8Array, mime: string): Promise<string | null> {
    let job = this.known.get(bytes);
    if (!job) this.known.set(bytes, (job = this.keep(bytes, mime)));
    return job;
  }

  private async keep(bytes: Uint8Array, mime: string): Promise<string | null> {
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const data = png || jpeg ? bytes : await asPng(bytes, mime).catch(() => null);
    if (!data) return null;
    const twin = this.list.find((media) => same(media.bytes, data));
    if (twin) return twin.name;
    const name = `image${this.list.length + 1}.${jpeg ? "jpeg" : "png"}`;
    this.list.push({ name, bytes: data });
    return name;
  }
}

/** PowerPoint opens PNG and JPEG everywhere; other pictures are drawn anew. */
async function asPng(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const w = image.naturalWidth || 800;
    const h = image.naturalHeight || 600;
    // A drawing has no dots of its own, so it gets enough to stay sharp.
    const scale = Math.min(mime.includes("svg") ? 3 : 1, 4000 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Where a page's points land on its slide. */
type Fit = { scale: number; dx: number; dy: number };

type Slide = { fit: Fit; links: Links; pictures: Pictures; next: () => number };

// ---------------------------------------------------------------- text

/** An address PowerPoint takes, or null. */
function address(link: string | undefined): string | null {
  const value = link?.trim() ?? "";
  if (!value || value.startsWith("#")) return null;
  const full = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : /^[^\s/@]+@[^\s/@]+$/.test(value)
      ? `mailto:${value}`
      : `https://${value}`;
  try {
    const url = new URL(full);
    return /^(https?|mailto|tel|sms|ftp):$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function runLook(style: FlowStyle, tag: string, slide: Slide, opacity: number): string {
  const { fit, links } = slide;
  const size = clamp(Math.round((style.size ?? 12) * fit.scale * 100), 100, 400000);
  const marks = [
    style.bold ? ' b="1"' : "",
    style.italic ? ' i="1"' : "",
    style.underline ? ' u="sng"' : "",
    style.strike ? ' strike="sngStrike"' : "",
    style.tracking ? ` spc="${clamp(Math.round(style.tracking * fit.scale * 100), -400000, 400000)}"` : "",
    style.script === "super" ? ' baseline="30000"' : style.script === "sub" ? ' baseline="-25000"' : "",
  ].join("");
  const face = esc(fontName(style.font));
  const faces = `<a:latin typeface="${face}"/><a:ea typeface="${face}"/><a:cs typeface="${face}"/>`;
  const back = hex(style.highlight);
  const target = tag === "a:rPr" ? address(style.link) : null;
  // Links would turn blue by themselves; the note at the end keeps the colour they have.
  const click = target
    ? `<a:hlinkClick r:id="${links.add("hyperlink", target, true)}"><a:extLst><a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}">` +
      '<ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/></a:ext></a:extLst></a:hlinkClick>'
    : "";
  return (
    `<${tag} sz="${size}"${marks} dirty="0">${solid(style.color ?? "#000000", opacity)}` +
    `${back ? `<a:highlight><a:srgbClr val="${back}"/></a:highlight>` : ""}${faces}${click}</${tag}>`
  );
}

const styleOf = (runs: readonly FlowRun[]): FlowStyle => runs.find((run) => run.style !== undefined)?.style ?? {};

function runsXml(runs: readonly FlowRun[], slide: Slide, opacity: number): string {
  let out = "";
  for (const run of runs) {
    if (run.text === undefined || run.text === "") continue;
    const lines = run.text.replace(/\r\n?/g, "\n").split("\n");
    lines.forEach((line, i) => {
      if (i > 0) out += `<a:br>${runLook(run.style, "a:rPr", slide, opacity)}</a:br>`;
      if (line) out += `<a:r>${runLook(run.style, "a:rPr", slide, opacity)}<a:t>${esc(line)}</a:t></a:r>`;
    });
  }
  const last = [...runs].reverse().find((run) => run.style !== undefined)?.style ?? {};
  return out + runLook(last, "a:endParaRPr", slide, opacity);
}

const NUMBERS: Record<string, string> = {
  "1.": "arabicPeriod",
  "1)": "arabicParenR",
  "(1)": "arabicParenBoth",
  "1": "arabicPlain",
  "a.": "alphaLcPeriod",
  "a)": "alphaLcParenR",
  "(a)": "alphaLcParenBoth",
  "A.": "alphaUcPeriod",
  "A)": "alphaUcParenR",
  "(A)": "alphaUcParenBoth",
  "i.": "romanLcPeriod",
  "i)": "romanLcParenR",
  "(i)": "romanLcParenBoth",
  "I.": "romanUcPeriod",
  "I)": "romanUcParenR",
  "(I)": "romanUcParenBoth",
};

/** Bullets as PowerPoint makes them itself, from a font that is always there. */
const WINGDINGS: Record<string, string> = {
  "▪": "§",
  "■": "n",
  "□": "q",
  "●": "l",
  "◆": "u",
  "❖": "v",
  "➢": "Ø",
  "➔": "è",
  "✓": "ü",
  "✔": "ü",
  "✗": "û",
  "★": "«",
  "☐": "¨",
  "☑": "þ",
  "☒": "ý",
};

/** What stands in front of a paragraph. Literal marks are typed, as the file has no word for them. */
type Mark = { xml: string; typed?: string };

/** The marks of a text: numbers as the editor counts them, written so PowerPoint counts the same. */
function marksOf(blocks: readonly FlowPara[]): (Mark | null)[] {
  const counts: number[] = [];
  const kinds: string[] = [];
  const there: ({ type: string; start: number; at: number } | undefined)[] = [];
  return blocks.map(({ list, runs }): Mark | null => {
    if (!list) {
      for (const all of [counts, kinds, there]) all.length = 0;
      return null;
    }
    const level = clamp(Math.round(list.level), 0, 8);
    const kind = `${list.type}${list.mark}`;
    for (const all of [counts, kinds, there]) all.length = Math.min(all.length, level + 1);
    const goes = counts[level] !== undefined && kinds[level] === kind && list.start === undefined;
    counts[level] = list.type === "bullet" ? 0 : goes ? counts[level] + 1 : (list.start ?? 1);
    kinds[level] = kind;
    if (list.type === "bullet") {
      there[level] = undefined;
      if (!list.mark.trim()) return null;
      const picture = WINGDINGS[list.mark];
      const font = picture ? "Wingdings" : /[\u2600-\u2bff]/.test(list.mark) ? "Segoe UI Symbol" : "Arial";
      const set = picture ? ' pitchFamily="2" charset="2"' : "";
      return { xml: `<a:buFont typeface="${font}"${set}/><a:buChar char="${esc(picture ?? list.mark)}"/>` };
    }
    const number = counts[level];
    const type = NUMBERS[list.mark];
    const now = there[level];
    // PowerPoint leaves a line without words out of the counting.
    const blank = !runs.some((run) => run.text);
    const follows = now !== undefined && now.type === type && now.at + 1 === number;
    // Nothing tells it to start over with the number it just started with.
    const stuck = now !== undefined && !follows && now.type === type && now.start === number;
    if (!type || blank || stuck || number < 1 || number > 32767) {
      there[level] = undefined;
      return { xml: "<a:buNone/>", typed: numberMark(list.mark, number) };
    }
    const start = follows ? now.start : number;
    there[level] = { type, start, at: number };
    return {
      xml: `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${type}"${start === 1 ? "" : ` startAt="${start}"`}/>`,
    };
  });
}

const ALIGNS = { left: "l", center: "ctr", right: "r", justify: "just" } as const;

/** The furthest in or out a paragraph may go. */
const indent = (points: number) => clamp(emu(points), -51206400, 51206400);

/** The largest letters of a paragraph, and whether all are that large. */
function sizesOf(runs: readonly FlowRun[]): { size: number; mixed: boolean } {
  const sizes = runs.flatMap((run) => (run.text ? [run.style.size ?? 12] : []));
  if (sizes.length === 0) sizes.push(styleOf(runs).size ?? 12);
  return { size: Math.max(...sizes), mixed: Math.max(...sizes) - Math.min(...sizes) > 0.01 };
}

function spacing({ line, runs }: FlowPara, scale: number): string {
  const { size, mixed } = sizesOf(runs);
  const percent = (value: number) =>
    `<a:lnSpc><a:spcPct val="${clamp(Math.round(value * 100), 1, 1584) * 1000}"/></a:lnSpc>`;
  if (!line) return "";
  if ("times" in line) return percent((line.times * (HEIGHTS[fontName(styleOf(runs).font)] ?? 1.17)) / LINE);
  if (line.atLeast && line.points <= size * LINE) return "";
  const points = line.points * scale;
  const normal = size * scale * LINE;
  // PowerPoint rounds points to whole ones and shares to whole hundredths: the closer one is taken.
  const byPoints = Math.abs(Math.round(points) - points);
  const byShare = mixed ? Infinity : Math.abs((Math.round((points / normal) * 100) / 100) * normal - points);
  if (byShare < byPoints) return percent(points / normal);
  return `<a:lnSpc><a:spcPts val="${clamp(Math.round(points), 1, 1584) * 100}"/></a:lnSpc>`;
}

function paraXml(block: FlowPara, mark: Mark | null, slide: Slide, opacity: number): string {
  const { scale } = slide.fit;
  const { size } = sizesOf(block.runs);
  const list = block.list;
  const level = list ? clamp(Math.round(list.level), 0, 8) : 0;
  const step = Math.max(12, Math.round(size * 1.5));
  const left = Math.max(0, (block.left ?? (list ? step * (level + 1) : 0)) * scale);
  const first = Math.max(-left, (block.first ?? (list && block.left === undefined ? -step : 0)) * scale);
  const points = (name: string, value: number | undefined) =>
    value && value > 0
      ? `<a:${name}><a:spcPts val="${clamp(Math.round(value * scale * 100), 0, 158400)}"/></a:${name}>`
      : "";
  const typed = mark?.typed !== undefined ? mark.typed : null;
  // Typed marks need a stop where the words begin.
  const stops = [...(typed !== null && left > 0 ? [left] : []), ...(block.tabs ?? []).map((at) => at * scale)].slice(
    0,
    32,
  );
  const tabs = stops.map((at) => `<a:tab pos="${indent(at)}" algn="l"/>`).join("");
  const pPr =
    `<a:pPr marL="${indent(left)}"${block.right && block.right > 0 ? ` marR="${indent(block.right * scale)}"` : ""}` +
    ` lvl="${level}" indent="${indent(first)}" algn="${ALIGNS[block.align ?? "left"]}">` +
    spacing(block, scale) +
    points("spcBef", block.before) +
    points("spcAft", block.after) +
    (mark?.xml ?? "<a:buNone/>") +
    (tabs ? `<a:tabLst>${tabs}</a:tabLst>` : "") +
    "</a:pPr>";
  const runs: FlowRun[] =
    typed !== null ? [{ text: `${typed}\t`, style: styleOf(block.runs) }, ...block.runs] : block.runs;
  return `<a:p>${pPr}${runsXml(runs, slide, opacity)}</a:p>`;
}

function parasXml(blocks: readonly FlowPara[], slide: Slide, opacity = 1): string {
  if (blocks.length === 0) return "<a:p><a:endParaRPr/></a:p>";
  const marks = marksOf(blocks);
  return blocks.map((block, i) => paraXml(block, marks[i], slide, opacity)).join("");
}

// ---------------------------------------------------------------- things on a slide

type Boxed = { x: number; y: number; w: number; h: number; angle?: number; flipX?: boolean; flipY?: boolean };

function xfrmXml(box: Boxed, { scale, dx, dy }: Fit, tag = "a:xfrm"): string {
  const angle = Math.round(((((box.angle ?? 0) % 360) + 360) % 360) * 60000) % 21600000;
  const turn = `${angle ? ` rot="${angle}"` : ""}${box.flipX ? ' flipH="1"' : ""}${box.flipY ? ' flipV="1"' : ""}`;
  return (
    `<${tag}${turn}><a:off x="${emu(box.x * scale + dx)}" y="${emu(box.y * scale + dy)}"/>` +
    `<a:ext cx="${Math.max(0, emu(box.w * scale))}" cy="${Math.max(0, emu(box.h * scale))}"/></${tag}>`
  );
}

function geometry(shape: string, adj: readonly number[] = []): string {
  const name = PRESETS[shape] ? shape : "rect";
  const adjusts = PRESETS[name];
  // All of a shape's values or none: PowerPoint refuses a file with only some of them.
  const moved = adjusts.some((_, i) => Number.isFinite(adj[i]));
  const list = adjusts.map(({ name: gd, value, per }, i) => {
    const own = Number.isFinite(adj[i]) ? adj[i] : value;
    return `<a:gd name="${gd}" fmla="val ${Math.round(own * per)}"/>`;
  });
  return `<a:prstGeom prst="${name}"><a:avLst>${moved ? list.join("") : ""}</a:avLst></a:prstGeom>`;
}

/** The editor's own marks, which Office does not have. Points in hundredths of the box. */
const DRAWN: Record<string, number[][]> = {
  check: [[6, 55, 37, 88, 94, 12]],
  cross: [
    [10, 10, 90, 90],
    [90, 10, 10, 90],
  ],
};

function drawnGeometry(lines: number[][]): string {
  const paths = lines.map((points) => {
    let out = "";
    for (let i = 0; i < points.length; i += 2) {
      const pt = `<a:pt x="${points[i]}" y="${points[i + 1]}"/>`;
      out += i === 0 ? `<a:moveTo>${pt}</a:moveTo>` : `<a:lnTo>${pt}</a:lnTo>`;
    }
    return out;
  });
  return (
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>' +
    `<a:path w="100" h="100" fill="none">${paths.join("")}</a:path></a:pathLst></a:custGeom>`
  );
}

const scaled = (line: FlowLine | null | undefined, scale: number): FlowLine | null =>
  line ? { ...line, width: line.width * scale } : null;

function named(slide: Slide, kind: string, extra = ""): string {
  const id = slide.next();
  return `<p:cNvPr id="${id}" name="${kind} ${id - 1}"${extra}/>`;
}

/** A little room to spare, so a font that runs a hair wider does not break a line earlier. */
const SPARE = 1;

function textXml(item: FixedText, slide: Slide): string {
  const { fit } = slide;
  const opacity = item.opacity ?? 1;
  const pad = item.pad ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const aligns = new Set(item.blocks.map((block) => block.align ?? "left"));
  const spare = item.noWrap ? 0 : SPARE;
  const left = pad.left - (aligns.has("right") || aligns.has("center") ? spare : 0);
  const right = pad.right - (aligns.has("right") ? 0 : spare);
  const side = (name: string, value: number) => ` ${name}="${emu(value * fit.scale)}"`;
  const anchor = item.valign === "middle" ? "ctr" : item.valign === "bottom" ? "b" : "t";
  const shape = item.shape && PRESETS[item.shape] ? item.shape : "rect";
  const bare = shape === "rect" && !item.fill && !item.stroke;
  // PowerPoint turns the words of a shape that is upside down; here only the shape is.
  const body =
    `<a:bodyPr${item.flipY ? ' rot="10800000"' : ""} wrap="${item.noWrap ? "none" : "square"}"` +
    `${side("lIns", left)}${side("tIns", pad.top)}${side("rIns", right)}${side("bIns", pad.bottom)} rtlCol="0" anchor="${anchor}">` +
    `${bare && item.noWrap ? "<a:spAutoFit/>" : "<a:noAutofit/>"}</a:bodyPr>`;
  return (
    `<p:sp><p:nvSpPr>${named(slide, bare ? "TextBox" : "Shape")}<p:cNvSpPr${bare ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrmXml(item, fit)}${geometry(shape, item.adj)}${solid(item.fill, opacity)}` +
    `${lineXml(scaled(item.stroke, fit.scale), opacity)}</p:spPr>` +
    `<p:txBody>${body}<a:lstStyle/>${parasXml(item.blocks, slide, opacity)}</p:txBody></p:sp>`
  );
}

/** The two ends of a line, start first. */
function endsOf({ x, y, w, h, flipX, flipY, angle }: FixedShape) {
  const rad = ((angle ?? 0) * Math.PI) / 180;
  const at = (right: boolean, low: boolean) => {
    const dx = right ? w / 2 : -w / 2;
    const dy = low ? h / 2 : -h / 2;
    return {
      x: x + w / 2 + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: y + h / 2 + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  };
  return [at(Boolean(flipX), Boolean(flipY)), at(!flipX, !flipY)];
}

function connector(item: FixedShape, slide: Slide, ends: string): string {
  const { fit } = slide;
  return (
    `<p:cxnSp><p:nvCxnSpPr>${named(slide, "Line")}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr>${xfrmXml(item, fit)}${geometry("line")}${lineXml(scaled(item.stroke, fit.scale), item.opacity ?? 1, "a:ln", ends)}` +
    "</p:spPr></p:cxnSp>"
  );
}

function lineShape(item: FixedShape, slide: Slide): string {
  const start = item.start ?? "none";
  const end = item.end ?? (item.shape === "arrow" ? "arrow" : "none");
  const head = (tag: string, kind: LineHead) =>
    HEADS[kind] ? `<a:${tag} type="${HEADS[kind]}" w="med" len="med"/>` : "";
  let out = connector(item, slide, head("headEnd", start) + head("tailEnd", end));
  const [a, b] = endsOf(item);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const half = Math.min(length * 0.6, 6 + (item.stroke?.width ?? 1) * 3.2) * 0.45;
  const across = { x: (-(b.y - a.y) / length) * half, y: ((b.x - a.x) / length) * half };
  for (const [kind, at] of [
    [start, a],
    [end, b],
  ] as const) {
    if (kind !== "bar") continue;
    const p = { x: at.x - across.x, y: at.y - across.y };
    const q = { x: at.x + across.x, y: at.y + across.y };
    const box = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
    const stroke = item.stroke && { color: item.stroke.color, width: item.stroke.width };
    const bar: FixedShape = {
      kind: "shape",
      shape: "line",
      ...box,
      flipX: q.x < p.x,
      flipY: q.y < p.y,
      stroke,
      opacity: item.opacity,
    };
    out += connector(bar, slide, "");
  }
  return out;
}

function shapeXml(item: FixedShape, slide: Slide): string {
  if (/^(line|lineInv|arrow|straightConnector1)$/.test(item.shape))
    return lineShape(item.shape === "lineInv" ? { ...item, flipY: !item.flipY } : item, slide);
  const { fit } = slide;
  const opacity = item.opacity ?? 1;
  const drawn = DRAWN[item.shape];
  const dot = item.shape === "dot";
  const form = drawn ? drawnGeometry(drawn) : geometry(dot ? "ellipse" : item.shape, item.adj);
  const fill = dot ? (item.fill ?? item.stroke?.color) : item.fill;
  return (
    `<p:sp><p:nvSpPr>${named(slide, "Shape")}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrmXml(item, fit)}${form}` +
    `${drawn ? "<a:noFill/>" : solid(fill, opacity)}${lineXml(dot ? null : scaled(item.stroke, fit.scale), opacity)}</p:spPr>` +
    // A shape without a text body cannot be typed in.
    '<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr/></a:p></p:txBody></p:sp>'
  );
}

async function imageXml(item: FixedImage, slide: Slide): Promise<string> {
  const name = await slide.pictures.add(item.bytes, item.mime);
  if (!name) return "";
  const id = slide.links.add("image", `../media/${name}`);
  const share = (value: number) => Math.round(clamp(value, 0, 1) * 100000);
  const { crop } = item;
  const sides: [string, number][] = crop
    ? [
        ["l", share(crop.x)],
        ["t", share(crop.y)],
        ["r", share(1 - crop.x - crop.w)],
        ["b", share(1 - crop.y - crop.h)],
      ]
    : [];
  const cut = sides
    .filter(([, value]) => value > 0)
    .map(([side, value]) => ` ${side}="${value}"`)
    .join("");
  const opacity = item.opacity ?? 1;
  const alpha = opacity < 1 ? `<a:alphaModFix amt="${share(opacity)}"/>` : "";
  return (
    `<p:pic><p:nvPicPr>${named(slide, "Picture")}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${id}">${alpha}</a:blip>${cut ? `<a:srcRect${cut}/>` : ""}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrmXml(item, slide.fit)}${geometry("rect")}</p:spPr></p:pic>`
  );
}

// ---------------------------------------------------------------- tables

/** How high a cell's words are when none of them wrap. PowerPoint makes a row higher, but never lower, than that. */
function heightOf(cell: FlowCell): number {
  let sum = 0;
  for (const block of cell.blocks) {
    const { size } = sizesOf(block.runs);
    const lines = block.runs.reduce((n, run) => n + (run.text?.split("\n").length ?? 1) - 1, 1);
    const line = block.line && "points" in block.line ? block.line.points : size * LINE;
    sum += lines * line + (block.before ?? 0) + (block.after ?? 0);
  }
  return sum;
}

type Side = "top" | "right" | "bottom" | "left";
type Slot = { cell: FlowCell; r: number; c: number; rows: number; cols: number };

/** Every place of the grid with the cell that covers it. */
function gridOf({ table }: FixedTable): (Slot | null)[][] {
  const { rows, cols } = table;
  const grid: (Slot | null)[][] = rows.map(() => cols.map(() => null));
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (c < cols.length && grid[r][c]) c += 1;
      if (c >= cols.length) break;
      let wide = 1;
      const most = Math.max(1, cell.colSpan ?? 1);
      while (wide < most && c + wide < cols.length && !grid[r][c + wide]) wide += 1;
      const tall = clamp(cell.rowSpan ?? 1, 1, rows.length - r);
      const slot: Slot = { cell, r, c, rows: tall, cols: wide };
      for (let i = r; i < r + tall; i += 1) for (let k = c; k < c + wide; k += 1) grid[i][k] ??= slot;
      c += wide;
    }
  });
  return grid;
}

function tableXml(item: FixedTable, slide: Slide): string {
  const { table } = item;
  const { fit } = slide;
  if (table.cols.length === 0 || table.rows.length === 0) return "";
  const grid = gridOf(item);
  const pad = table.pad ?? { top: 2, right: 5.4, bottom: 2, left: 5.4 };
  const total = table.cols.reduce((sum, width) => sum + Math.max(0, width), 0);
  const stretch = total > 0 && item.w > 0 ? item.w / total : 1;
  const widths = table.cols.map((width) =>
    Math.max(1, (total > 0 ? Math.max(0, width) : item.w / table.cols.length) * stretch),
  );
  const heights = table.rows.map((row, r) => {
    const words = grid[r].map((slot) =>
      slot?.r === r && slot.rows === 1 ? heightOf(slot.cell) + pad.top + pad.bottom : 0,
    );
    return row.h ?? Math.max(8, ...words);
  });
  const normal: FlowLine | null = table.border === undefined ? { color: "#bfbfbf", width: 0.5 } : table.border;
  /** The line two neighbours share. Both write it, so both must say the same. */
  const between = (a: Slot | null, sideA: Side, b: Slot | null, sideB: Side): FlowLine | null => {
    if (a && a === b) return null;
    const own = a?.cell.border?.[sideA];
    const other = b?.cell.border?.[sideB];
    if (own === undefined && other === undefined) return a || b ? normal : null;
    if (own && other) return own.width >= other.width ? own : other;
    return own ?? other ?? null;
  };
  const slotAt = (r: number, c: number) => grid[r]?.[c] ?? null;
  const margins =
    ` marL="${emu(pad.left * fit.scale)}" marR="${emu(pad.right * fit.scale)}"` +
    ` marT="${emu(pad.top * fit.scale)}" marB="${emu(pad.bottom * fit.scale)}"`;
  // Tiny letters, or a cell without words would make its row higher.
  const empty = '<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr sz="100"/></a:p></a:txBody>';
  const rows = grid.map((row, r) => {
    const cells = row.map((slot, c) => {
      // A cell that spans takes its lines from its first square, so every square has those around the whole cell.
      const { r: top, c: left, rows: tall, cols: wide } = slot ?? { r, c, rows: 1, cols: 1 };
      const lines = [
        lineXml(scaled(between(slotAt(r, left - 1), "right", slot, "left"), fit.scale), 1, "a:lnL"),
        lineXml(scaled(between(slot, "right", slotAt(r, left + wide), "left"), fit.scale), 1, "a:lnR"),
        lineXml(scaled(between(slotAt(top - 1, c), "bottom", slot, "top"), fit.scale), 1, "a:lnT"),
        lineXml(scaled(between(slot, "bottom", slotAt(top + tall, c), "top"), fit.scale), 1, "a:lnB"),
      ].join("");
      if (!slot) return `<a:tc>${empty}<a:tcPr${margins}>${lines}<a:noFill/></a:tcPr></a:tc>`;
      const { cell } = slot;
      const spans =
        (slot.c === c && slot.cols > 1 ? ` gridSpan="${slot.cols}"` : "") +
        (slot.r === r && slot.rows > 1 ? ` rowSpan="${slot.rows}"` : "") +
        (c > slot.c ? ' hMerge="1"' : "") +
        (r > slot.r ? ' vMerge="1"' : "");
      const anchor = cell.valign === "middle" ? ' anchor="ctr"' : cell.valign === "bottom" ? ' anchor="b"' : "";
      const body =
        slot.r === r && slot.c === c
          ? `<a:txBody><a:bodyPr/><a:lstStyle/>${parasXml(cell.blocks, slide)}</a:txBody>`
          : empty;
      return `<a:tc${spans}>${body}<a:tcPr${margins}${anchor}>${lines}${solid(cell.fill)}</a:tcPr></a:tc>`;
    });
    return `<a:tr h="${Math.max(0, emu(heights[r] * fit.scale))}">${cells.join("")}</a:tr>`;
  });
  const box = {
    x: item.x,
    y: item.y,
    w: widths.reduce((sum, width) => sum + width, 0),
    h: heights.reduce((sum, h) => sum + h, 0),
  };
  return (
    `<p:graphicFrame><p:nvGraphicFramePr>${named(slide, "Table")}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>` +
    `<p:nvPr/></p:nvGraphicFramePr>${xfrmXml(box, fit, "p:xfrm")}<a:graphic>` +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr>' +
    "<a:tableStyleId>{2D5ABB26-0587-4C30-8999-92F81FD0307C}</a:tableStyleId></a:tblPr>" +
    `<a:tblGrid>${widths.map((width) => `<a:gridCol w="${emu(width * fit.scale)}"/>`).join("")}</a:tblGrid>${rows.join("")}` +
    "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>"
  );
}

// ---------------------------------------------------------------- slides

/** Pictures that stood in a line of words, which a slide cannot do. They are put where the words start. */
function strayImages(item: FixedText): FixedImage[] {
  const out: FixedImage[] = [];
  let y = item.y + (item.pad?.top ?? 0);
  for (const block of item.blocks) {
    let tall = 0;
    for (const { image } of block.runs) {
      if (!image) continue;
      const x = item.x + (item.pad?.left ?? 0) + (block.left ?? 0);
      out.push({
        kind: "image",
        x,
        y,
        w: image.w,
        h: image.h,
        bytes: image.bytes,
        mime: image.mime,
        crop: image.crop,
        angle: image.angle,
      });
      tall = Math.max(tall, image.h);
    }
    y += Math.max(tall, sizesOf(block.runs).size * LINE);
  }
  return out;
}

async function itemXml(item: FixedItem, slide: Slide): Promise<string> {
  switch (item.kind) {
    case "text": {
      let out = textXml(item, slide);
      for (const image of strayImages(item)) out += await imageXml(image, slide);
      return out;
    }
    case "image":
      return imageXml(item, slide);
    case "shape":
      return shapeXml(item, slide);
    case "table":
      return tableXml(item, slide);
  }
}

const ROOT_GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/>' +
  '<a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

async function slideXml(page: FixedPage, slide: Slide): Promise<string> {
  let shapes = "";
  for (const item of page.items) shapes += await itemXml(item, slide);
  const paper = hex(page.fill) ? `<p:bg><p:bgPr>${solid(page.fill)}<a:effectLst/></p:bgPr></p:bg>` : "";
  return (
    `${HEAD}<p:sld ${NS}><p:cSld>${paper}<p:spTree>${ROOT_GROUP}${shapes}</p:spTree></p:cSld>` +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
  );
}

/** The size most pages have, within what PowerPoint allows. */
function slideSize(pages: readonly FixedPage[]): { w: number; h: number } {
  const seen = new Map<string, { w: number; h: number; count: number }>();
  for (const { w, h } of pages) {
    if (!(w > 0 && h > 0)) continue;
    const key = `${Math.round(w)}x${Math.round(h)}`;
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { w, h, count: 1 });
  }
  const best = [...seen.values()].sort((a, b) => b.count - a.count)[0] ?? { w: 960, h: 540 };
  const scale = Math.min(4032 / best.w, 4032 / best.h, Math.max(1, 72 / best.w, 72 / best.h));
  return { w: best.w * scale, h: best.h * scale };
}

function fitOf(page: FixedPage, size: { w: number; h: number }): Fit {
  // A page a hair larger or smaller is not worth odd letter sizes.
  if (Math.abs(page.w - size.w) < 2 && Math.abs(page.h - size.h) < 2) return { scale: 1, dx: 0, dy: 0 };
  const scale = Math.min(size.w / Math.max(1, page.w), size.h / Math.max(1, page.h));
  return { scale, dx: (size.w - page.w * scale) / 2, dy: (size.h - page.h * scale) / 2 };
}

// ---------------------------------------------------------------- the parts every deck has

const COLORS = ["44546A", "E7E6E6", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];

function themeXml(name: string): string {
  const slots = ["dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const colors = slots.map((slot, i) => `<a:${slot}><a:srgbClr val="${COLORS[i]}"/></a:${slot}>`).join("");
  const font = (tag: string) =>
    `<a:${tag}><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:${tag}>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) =>
    `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  const effect = "<a:effectStyle><a:effectLst/></a:effectStyle>";
  return (
    `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements>` +
    '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${colors}</a:clrScheme>` +
    `<a:fontScheme name="Office">${font("majorFont")}${font("minorFont")}</a:fontScheme>` +
    `<a:fmtScheme name="Office"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${effect.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme>` +
    "</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"
  );
}

function levels(size: number): string {
  let out = "";
  for (let i = 1; i <= 9; i += 1)
    out +=
      `<a:lvl${i}pPr marL="${(i - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
      `<a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/>` +
      `<a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${i}pPr>`;
  return out;
}

const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" ' +
  'accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
const WHITE_BG = '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>';

const masterXml = () =>
  `${HEAD}<p:sldMaster ${NS}><p:cSld>${WHITE_BG}<p:spTree>${ROOT_GROUP}</p:spTree></p:cSld>${CLR_MAP}` +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  `<p:txStyles><p:titleStyle>${levels(4400)}</p:titleStyle><p:bodyStyle>${levels(2800)}</p:bodyStyle>` +
  `<p:otherStyle>${levels(1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;

const layoutXml = () =>
  `${HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${ROOT_GROUP}</p:spTree></p:cSld>` +
  "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";

const NOTE_BOXES = {
  image: '<a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/>',
  body: '<a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/>',
};

const notesShape = (id: number, name: string, ph: string, place: string, body: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr>` +
  `<p:spPr>${place}</p:spPr>${body}</p:sp>`;

function notesMasterXml(): string {
  const place = (box: string) => `<a:xfrm>${box}</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
  const words = "<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>";
  return (
    `${HEAD}<p:notesMaster ${NS}><p:cSld>${WHITE_BG}<p:spTree>${ROOT_GROUP}` +
    notesShape(2, "Slide Image 1", 'type="sldImg" idx="2"', place(NOTE_BOXES.image), "") +
    notesShape(3, "Notes 2", 'type="body" sz="quarter" idx="3"', place(NOTE_BOXES.body), words) +
    `</p:spTree></p:cSld>${CLR_MAP}<p:notesStyle>${levels(1200)}</p:notesStyle></p:notesMaster>`
  );
}

function notesXml(notes: string): string {
  const paras = notes
    .split("\n")
    .map(
      (line) =>
        `<a:p>${line ? `<a:r><a:rPr dirty="0"/><a:t>${esc(line)}</a:t></a:r>` : ""}<a:endParaRPr dirty="0"/></a:p>`,
    );
  return (
    `${HEAD}<p:notes ${NS}><p:cSld><p:spTree>${ROOT_GROUP}` +
    notesShape(2, "Slide Image 1", 'type="sldImg"', "", "") +
    notesShape(
      3,
      "Notes 2",
      'type="body" idx="1"',
      "",
      `<p:txBody><a:bodyPr/><a:lstStyle/>${paras.join("")}</p:txBody>`,
    ) +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>"
  );
}

const TYPE = "application/vnd.openxmlformats-officedocument.presentationml";

export async function writePptx(doc: FixedDoc): Promise<Uint8Array> {
  const { default: Zip } = await import("jszip");
  const zip = new Zip();
  const pages: FixedPage[] = doc.pages.length > 0 ? doc.pages : [{ w: 960, h: 540, items: [] }];
  const size = slideSize(pages);
  const pictures = new Pictures();
  const types: [path: string, type: string][] = [];
  const put = (path: string, xml: string, type?: string) => {
    zip.file(path, xml, { createFolders: false });
    if (type) types.push([`/${path}`, type]);
  };
  // The list of parts is the first thing in the file, where programs look for it. It is filled in at the end.
  put("[Content_Types].xml", "");

  const main = new Links();
  const masterId = main.add("slideMaster", "slideMasters/slideMaster1.xml");
  const theme = "application/vnd.openxmlformats-officedocument.theme+xml";
  const master = new Links();
  master.add("slideLayout", "../slideLayouts/slideLayout1.xml");
  master.add("theme", "../theme/theme1.xml");
  const layout = new Links();
  layout.add("slideMaster", "../slideMasters/slideMaster1.xml");
  put("ppt/theme/theme1.xml", themeXml("Office Theme"), theme);
  put("ppt/slideMasters/slideMaster1.xml", masterXml(), `${TYPE}.slideMaster+xml`);
  put("ppt/slideMasters/_rels/slideMaster1.xml.rels", master.xml());
  put("ppt/slideLayouts/slideLayout1.xml", layoutXml(), `${TYPE}.slideLayout+xml`);
  put("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout.xml());

  const ids: string[] = [];
  const noted = pages.some((page) => page.notes?.trim());
  for (const [i, page] of pages.entries()) {
    const n = i + 1;
    let id = 1;
    const links = new Links();
    links.add("slideLayout", "../slideLayouts/slideLayout1.xml");
    const slide: Slide = { fit: fitOf(page, size), links, pictures, next: () => (id += 1) };
    const xml = await slideXml(page, slide);
    const notes = page.notes?.trim();
    if (notes) {
      links.add("notesSlide", `../notesSlides/notesSlide${n}.xml`);
      const back = new Links();
      back.add("notesMaster", "../notesMasters/notesMaster1.xml");
      back.add("slide", `../slides/slide${n}.xml`);
      put(`ppt/notesSlides/notesSlide${n}.xml`, notesXml(notes), `${TYPE}.notesSlide+xml`);
      put(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, back.xml());
    }
    put(`ppt/slides/slide${n}.xml`, xml, `${TYPE}.slide+xml`);
    put(`ppt/slides/_rels/slide${n}.xml.rels`, links.xml());
    ids.push(`<p:sldId id="${255 + n}" r:id="${main.add("slide", `slides/slide${n}.xml`)}"/>`);
  }
  let notesId = "";
  if (noted) {
    notesId = `<p:notesMasterIdLst><p:notesMasterId r:id="${main.add("notesMaster", "notesMasters/notesMaster1.xml")}"/></p:notesMasterIdLst>`;
    const back = new Links();
    back.add("theme", "../theme/theme2.xml");
    put("ppt/theme/theme2.xml", themeXml("Notes"), theme);
    put("ppt/notesMasters/notesMaster1.xml", notesMasterXml(), `${TYPE}.notesMaster+xml`);
    put("ppt/notesMasters/_rels/notesMaster1.xml.rels", back.xml());
  }
  main.add("presProps", "presProps.xml");
  main.add("viewProps", "viewProps.xml");
  main.add("theme", "theme/theme1.xml");
  main.add("tableStyles", "tableStyles.xml");
  put("ppt/presProps.xml", `${HEAD}<p:presentationPr ${NS}/>`, `${TYPE}.presProps+xml`);
  put("ppt/viewProps.xml", `${HEAD}<p:viewPr ${NS}/>`, `${TYPE}.viewProps+xml`);
  put(
    "ppt/tableStyles.xml",
    `${HEAD}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    `${TYPE}.tableStyles+xml`,
  );
  put(
    "ppt/presentation.xml",
    `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${masterId}"/></p:sldMasterIdLst>` +
      `${notesId}<p:sldIdLst>${ids.join("")}</p:sldIdLst><p:sldSz cx="${emu(size.w)}" cy="${emu(size.h)}"/>` +
      `<p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${levels(1800)}</p:defaultTextStyle></p:presentation>`,
    `${TYPE}.presentation.main+xml`,
  );
  put("ppt/_rels/presentation.xml.rels", main.xml());
  for (const { name, bytes } of pictures.list)
    zip.file(`ppt/media/${name}`, bytes, { createFolders: false, compression: "STORE" });

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
  put(
    "docProps/core.xml",
    `${HEAD}<cp:coreProperties xmlns:cp="${core}" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(doc.title ?? "")}</dc:title>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    "application/vnd.openxmlformats-package.core-properties+xml",
  );
  const root = new Links();
  root.add("officeDocument", "ppt/presentation.xml");
  root.add(
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
    "docProps/core.xml",
  );
  put("_rels/.rels", root.xml());
  const defaults = [
    ["rels", "application/vnd.openxmlformats-package.relationships+xml"],
    ["xml", "application/xml"],
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
  ].map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`);
  const overrides = types.map(([path, type]) => `<Override PartName="${path}" ContentType="${type}"/>`);
  put(
    "[Content_Types].xml",
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.join("")}${overrides.join("")}</Types>`,
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
