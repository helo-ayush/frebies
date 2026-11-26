import {
  ConvertError,
  type FlowBlock,
  type FlowBox,
  type FlowCell,
  type FlowDoc,
  type FlowImage,
  type FlowLine,
  type FlowList,
  type FlowMargin,
  type FlowPara,
  type FlowRow,
  type FlowRun,
  type FlowSection,
  type FlowStyle,
  type FlowTable,
} from "./flow";
import {
  DAMAGED,
  KINDS,
  SIDES,
  SIMPLE,
  aboutHigh,
  at,
  blend,
  capitals,
  channels,
  cleanEdges,
  connectorCorners,
  countText,
  dig,
  drawsIndic,
  fillStyle,
  find,
  findAll,
  fromChannels,
  hexOf,
  inBrackets,
  isBlank,
  isDark,
  isHex,
  isSymbolFont,
  joinChunks,
  joinRuns,
  kid,
  kids,
  lengthOf,
  lineImage,
  lineKey,
  mathRuns,
  mathText,
  numberLists,
  numberOf,
  onSide,
  onlyParas,
  openPack,
  outsideLink,
  paintImage,
  pictureHeight,
  pictureType,
  plainSymbols,
  quartersOf,
  raised,
  resolvePath,
  round,
  runThrough,
  settleDepth,
  settleLines,
  settleParas,
  settleTabs,
  shapeImage,
  spacerFor,
  splitLines,
  splitRuns,
  splitScripts,
  standPara,
  strokeWith,
  tally,
  tidyBreaks,
  turnLine,
  turnedPad,
  turnedShape,
  turnedWords,
  type Chunk,
  type Frame,
  type MathPart,
  type Pack,
  type Pad,
  type Paint,
  type Script,
  type Side,
  type TabPlan,
  type TabStop,
  type Traits,
} from "./xml";

/**
 * Reads Word documents (.docx, and .docm and .dotx, which are the same inside).
 * Word keeps looks in layers: the document's defaults, the style of the table,
 * of the paragraph, of the words, and what was set by hand. Here they are boiled
 * down to what is seen in the end. Where the rules are unclear, Word itself was
 * asked: small test files, exported to PDF.
 */

// ---------------------------------------------------------------- what is kept while reading

type EdgeName = Side | "insideH" | "insideV" | "between";
type Edges = Partial<Record<EdgeName, FlowLine | null>>;

/** Looks of words. null says "none" where leaving it out says "as it was". */
type RunLook = {
  ascii?: string;
  ansi?: string;
  ea?: string;
  cs?: string;
  size?: number;
  sizeCs?: number;
  bold?: boolean;
  boldCs?: boolean;
  italic?: boolean;
  italicCs?: boolean;
  caps?: boolean;
  small?: boolean;
  strike?: boolean;
  double?: boolean;
  hidden?: boolean;
  under?: boolean;
  color?: string | null;
  mark?: string | null;
  shade?: string | null;
  script?: "super" | "sub" | null;
  tracking?: number;
  /** Set in the fonts and sizes of Arabic, Hindi and the like. */
  complex?: boolean;
};

type ParaLook = {
  align?: string;
  left?: number;
  right?: number;
  first?: number;
  before?: number;
  after?: number;
  autoBefore?: boolean;
  autoAfter?: boolean;
  /** In 240ths of a line, or in twentieths of a point. */
  line?: number;
  rule?: string;
  context?: boolean;
  breakBefore?: boolean;
  keepNext?: boolean;
  fill?: string | null;
  edges?: Edges;
  tabs?: (TabStop & { clear?: boolean })[];
  outline?: number;
  rtl?: boolean;
  snap?: boolean;
  num?: string;
  level?: number;
};

type CellLook = {
  edges: Edges;
  fill?: string | null;
  valign?: FlowCell["valign"];
  pad?: Partial<FlowMargin>;
};

type Layer = {
  para: ParaLook;
  run: RunLook;
  cell: CellLook;
  pad?: Partial<FlowMargin>;
  indent?: number;
  align?: string;
};

type Style = {
  id: string;
  kind: string;
  name: string;
  based: string;
  para: ParaLook;
  run: RunLook;
  el: Element;
};

type TableStyle = { whole: Layer; parts: Map<string, Layer>; rowBand: number; colBand: number };

type Rel = { kind: string; target: string; outside: boolean };
type Part = { path: string; root: Element; rels: Map<string, Rel> };
type Picture = { bytes: Uint8Array; mime: string };

type FontSet = { latin: string; ea: string; cs: string; scripts: Map<string, string> };
type Theme = {
  colors: Map<string, string>;
  /** Which colour each of the names for text and background stands for. */
  names: Map<string, string>;
  major: FontSet;
  minor: FontSet;
  lines: number[];
  /** Ready-made fills, and those for backgrounds. */
  fills: Element[];
  backs: Element[];
  ea: string;
  bidi: string;
};

type Level = {
  start: number;
  format: string;
  text: string;
  suffix: string;
  legal: boolean;
  restart?: number;
  style: string;
  para: ParaLook;
  run: RunLook;
};

type NumberList = { base: string; levels: Map<number, Level>; starts: Map<number, number> };

type Note = { kind: "foot" | "end"; id: string; mark: string };

type Refs = Partial<Record<"default" | "first" | "even", string>>;

/** The page a section is on. */
type Room = {
  w: number;
  h: number;
  margin: FlowMargin;
  headerAt: number;
  footerAt: number;
  cols: number;
  gap: number;
  /** Width of one column of text. */
  text: number;
  kind: string;
  title: boolean;
  header: Refs;
  footer: Refs;
  /** Lines stand on a grid this far apart. */
  pitch: number;
  frame: Element | null;
};

type Field = {
  code: string;
  stage: "code" | "result";
  text?: string;
  done?: boolean;
  link?: string;
  form: Element | null;
};

/** Where the paragraphs being read stand. */
type Env = {
  part: Part;
  room: Room;
  place: "body" | "header" | "footer" | "cell" | "box" | "note";
  /** In a header or footer, however deep: page numbers are live there. */
  band: boolean;
  /** Left edge of the words on the page, and the room they have. */
  at: number;
  width: number;
  fields: Field[];
  /** Marks of fields that never end or never began. */
  lost: Set<Element>;
  table?: { para: ParaLook; run: RunLook };
  /** Colour behind the words. */
  back?: string;
  /** Colour of words that have none of their own. */
  ink?: string;
  /** The number of the note being read. */
  mark?: string;
  /** The paragraph starts a page for certain. */
  top?: boolean;
};

type Doc = {
  main: Part;
  theme: Theme;
  styles: Map<string, Style>;
  normal: string;
  plainTable: string;
  base: { para: ParaLook; run: RunLook };
  numbers: Map<string, NumberList>;
  counts: Map<string, (number | undefined)[]>;
  begun: Set<string>;
  parts: Map<string, Part>;
  pictures: Map<string, Picture>;
  /** Word version the file is laid out for. */
  mode: number;
  /** Space after and space before add up instead of the larger one counting. */
  sums: boolean;
  /** What follows a page break starts with the rest of its paragraph. */
  splits: boolean;
  step: number;
  notes: Map<string, Note>;
  noteFormat: Record<Note["kind"], { format: string; start: number }>;
  tabs: Map<FlowPara, TabPlan>;
  traits: Traits;
  /** Pictures in front of the words, and how far in front. */
  over: Map<FlowImage, number>;
  styled: Map<string, { look: ParaLook; run: RunLook; heading?: number }>;
  tableStyles: Map<string, TableStyle>;
  sections: number;
};

const twips = (text: string | null | undefined) => lengthOf(text, 1 / 20);
const emu = (text: string | null | undefined) => lengthOf(text, 1 / 12700) ?? 0;
const valOf = (el: Element | null | undefined) => at(el, "val");
const yes = (value: string | null | undefined) => /^(1|true|on|t)$/i.test(value ?? "");
/** A switch: on when it is there, unless it says otherwise. */
const on = (el: Element | null): boolean | undefined =>
  el ? !/^(0|false|off|none)$/i.test(valOf(el) ?? "1") : undefined;

// ---------------------------------------------------------------- colours and lines

const SLOTS: Record<string, string> = {
  dark1: "dk1",
  light1: "lt1",
  dark2: "dk2",
  light2: "lt2",
  hyperlink: "hlink",
  followedHyperlink: "folHlink",
  text1: "tx1",
  text2: "tx2",
  background1: "bg1",
  background2: "bg2",
};

function themeColor(theme: Theme, name: string): string | null {
  const slot = SLOTS[name] ?? name;
  return theme.colors.get(theme.names.get(slot) ?? slot) ?? null;
}

function toHsl(color: string): [number, number, number] {
  const [r, g, b] = channels(color).map((part) => part / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: readonly number[]): string {
  const light = Math.max(0, Math.min(1, l));
  const sat = Math.max(0, Math.min(1, s));
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const part = (shift: number) => {
    const t = (((h + shift) % 1) + 1) % 1;
    const value = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return value * 255;
  };
  return fromChannels([part(1 / 3), part(0), part(-1 / 3)]);
}

/** The colour an element names: undefined when it names none, null for "automatic". */
function colorOf(doc: Doc, el: Element, plain = "val", prefix = "theme"): string | null | undefined {
  const own = at(el, plain);
  const named = at(el, prefix === "theme" ? "themeColor" : prefix);
  const base = named && named !== "none" ? themeColor(doc.theme, named) : null;
  if (base) {
    const tint = at(el, `${prefix}Tint`);
    const shade = at(el, `${prefix}Shade`);
    const [h, s, l] = toHsl(base);
    const part = (value: string) => parseInt(value, 16) / 255;
    const light = shade ? l * part(shade) : tint ? l * part(tint) + 1 - part(tint) : l;
    const color = light === l ? base : fromHsl([h, s, light]);
    // Word writes its own result next to the rule; rounding may differ by a hair.
    if (isHex(own) && channels(hexOf(own)).every((value, i) => Math.abs(value - channels(color)[i]) <= 4))
      return hexOf(own);
    return color;
  }
  if (own === null) return undefined;
  return isHex(own) ? hexOf(own) : null;
}

/** The colour behind something: null when it is there to say there is none. */
function shadeOf(doc: Doc, el: Element): string | null {
  const pattern = valOf(el) ?? "clear";
  if (pattern === "nil") return null;
  const fill = colorOf(doc, el, "fill", "themeFill") ?? null;
  if (pattern === "clear") return fill;
  const ink = colorOf(doc, el, "color") ?? "#000000";
  if (pattern === "solid") return ink;
  const share = /^pct(\d+)$/.exec(pattern)?.[1];
  return blend(ink, fill ?? "#ffffff", share ? Number(share) / 100 : pattern.startsWith("thin") ? 0.25 : 0.5);
}

const HIGHLIGHTS: Record<string, string> = {
  black: "#000000",
  blue: "#0000ff",
  cyan: "#00ffff",
  green: "#00ff00",
  magenta: "#ff00ff",
  red: "#ff0000",
  yellow: "#ffff00",
  white: "#ffffff",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#c0c0c0",
};

function lineOf(doc: Doc, el: Element): FlowLine | null {
  const kind = valOf(el) ?? "nil";
  if (kind === "nil" || kind === "none") return null;
  const size = numberOf(at(el, "sz")) ?? 4;
  // Twice as many strokes look heavier than one.
  const weight = /^(double|triple|doubleWave|wave)$/.test(kind) ? 1.5 : 1;
  const line: FlowLine = {
    color: colorOf(doc, el, "color") ?? "#000000",
    width: round(Math.min(12, Math.max(0.25, (size / 8) * weight))),
  };
  if (/dash/i.test(kind)) line.dash = "dash";
  else if (kind === "dotted") line.dash = "dot";
  return line;
}

const EDGE_NAMES: Record<string, EdgeName> = {
  top: "top",
  bottom: "bottom",
  left: "left",
  start: "left",
  right: "right",
  end: "right",
  insideH: "insideH",
  insideV: "insideV",
  between: "between",
};

function edgesOf(doc: Doc, holder: Element | null): Edges {
  const out: Edges = {};
  for (const el of kids(holder)) {
    const name = EDGE_NAMES[el.localName];
    if (name) out[name] = lineOf(doc, el);
  }
  return out;
}

/** The colour a drawing uses, and how much of it. */
function drawnColor(doc: Doc, holder: Element | null, stand?: string | null): { color: string; alpha: number } | null {
  for (const el of kids(holder)) {
    let color: string | null = null;
    const value = valOf(el);
    if (el.localName === "srgbClr" && isHex(value)) color = hexOf(value);
    else if (el.localName === "schemeClr")
      color = value === "phClr" ? (stand ?? null) : value ? themeColor(doc.theme, value) : null;
    else if (el.localName === "sysClr") color = isHex(at(el, "lastClr")) ? hexOf(at(el, "lastClr") ?? "") : "#000000";
    else if (el.localName === "prstClr") color = namedColor(value ?? "");
    else if (el.localName === "scrgbClr")
      color = fromChannels(["r", "g", "b"].map((name) => ((numberOf(at(el, name)) ?? 0) / 100000) ** (1 / 2.2) * 255));
    if (!color) continue;
    let alpha = 1;
    for (const change of kids(el)) {
      const share = (numberOf(valOf(change)) ?? 100000) / 100000;
      const [h, s, l] = toHsl(color);
      const linear = (mix: (part: number) => number) =>
        fromChannels(channels(color ?? "#000000").map((part) => mix((part / 255) ** 2.2) ** (1 / 2.2) * 255));
      if (change.localName === "lumMod") color = fromHsl([h, s, l * share]);
      else if (change.localName === "lumOff") color = fromHsl([h, s, l + share]);
      else if (change.localName === "satMod") color = fromHsl([h, s * share, l]);
      else if (change.localName === "tint") color = linear((part) => part * share + 1 - share);
      else if (change.localName === "shade") color = linear((part) => part * share);
      else if (change.localName === "alpha") alpha = share;
      else if (change.localName === "gray") {
        const [r, g, b] = channels(color);
        color = fromChannels(Array.from({ length: 3 }, () => 0.299 * r + 0.587 * g + 0.114 * b));
      }
    }
    return { color, alpha };
  }
  return null;
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  lime: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  aqua: "#00ffff",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  purple: "#800080",
  teal: "#008080",
  orange: "#ffa500",
  dkGray: "#a9a9a9",
  ltGray: "#d3d3d3",
  window: "#ffffff",
  windowText: "#000000",
};
const namedColor = (name: string) => NAMED[name] ?? null;

/** Half-seen colours are given as they look on white paper. */
const onPaper = (found: { color: string; alpha: number } | null) =>
  found ? (found.alpha < 0.999 ? blend(found.color, "#ffffff", found.alpha) : found.color) : null;

// ---------------------------------------------------------------- looks

const SCRIPTS: Record<string, string> = {
  ja: "Jpan",
  ko: "Hang",
  zh: "Hans",
  ar: "Arab",
  fa: "Arab",
  ur: "Arab",
  he: "Hebr",
  hi: "Deva",
  mr: "Deva",
  ne: "Deva",
  sa: "Deva",
  bn: "Beng",
  as: "Beng",
  gu: "Gujr",
  pa: "Guru",
  ta: "Taml",
  te: "Telu",
  kn: "Knda",
  ml: "Mlym",
  or: "Orya",
  th: "Thai",
};

function scriptOf(language: string): string {
  if (/^zh-(TW|HK|MO|Hant)/i.test(language)) return "Hant";
  return SCRIPTS[language.slice(0, 2).toLowerCase()] ?? "";
}

/** "minorHAnsi" as the font the theme means by it. */
function themeFont(theme: Theme, name: string): string | undefined {
  const set = name.startsWith("major") ? theme.major : theme.minor;
  const kind = name.slice(5);
  const font =
    kind === "EastAsia"
      ? set.ea || set.scripts.get(scriptOf(theme.ea))
      : kind === "Bidi"
        ? set.cs || set.scripts.get(scriptOf(theme.bidi))
        : set.latin;
  return font || undefined;
}

function runLook(doc: Doc, rPr: Element | null): RunLook {
  const out: RunLook = {};
  for (const el of kids(rPr)) {
    const value = valOf(el);
    switch (el.localName) {
      case "rFonts": {
        const pick = (themed: string, plain: string) => {
          const name = at(el, themed);
          return (name ? themeFont(doc.theme, name) : undefined) ?? (at(el, plain) || undefined);
        };
        const ascii = pick("asciiTheme", "ascii");
        const ansi = pick("hAnsiTheme", "hAnsi");
        const ea = pick("eastAsiaTheme", "eastAsia");
        const cs = pick("cstheme", "cs");
        if (ascii) out.ascii = ascii;
        if (ansi) out.ansi = ansi;
        if (ea) out.ea = ea;
        if (cs) out.cs = cs;
        break;
      }
      case "b":
        out.bold = on(el);
        break;
      case "bCs":
        out.boldCs = on(el);
        break;
      case "i":
        out.italic = on(el);
        break;
      case "iCs":
        out.italicCs = on(el);
        break;
      case "caps":
        out.caps = on(el);
        break;
      case "smallCaps":
        out.small = on(el);
        break;
      case "strike":
        out.strike = on(el);
        break;
      case "dstrike":
        out.double = on(el);
        break;
      case "vanish":
        out.hidden = on(el);
        break;
      case "u":
        out.under = value !== null && value !== "none";
        break;
      case "color": {
        const color = colorOf(doc, el);
        if (color !== undefined) out.color = color;
        break;
      }
      case "highlight":
        out.mark = HIGHLIGHTS[value ?? ""] ?? null;
        break;
      case "shd":
        out.shade = shadeOf(doc, el);
        break;
      case "sz":
      case "szCs": {
        const size = lengthOf(value, 0.5);
        if (size) out[el.localName === "sz" ? "size" : "sizeCs"] = size;
        break;
      }
      case "vertAlign":
        out.script = value === "superscript" ? "super" : value === "subscript" ? "sub" : null;
        break;
      case "spacing":
        out.tracking = twips(value) ?? 0;
        break;
      case "cs":
      case "rtl":
        if (on(el)) out.complex = true;
        break;
    }
  }
  return out;
}

const TOGGLES = ["bold", "boldCs", "italic", "italicCs", "caps", "small", "strike", "double", "hidden"] as const;

/** Layers of styles. Switches flip: bold words in a bold paragraph are not bold. */
function mixLooks(base: RunLook, ...layers: (RunLook | undefined)[]): RunLook {
  const out: RunLook = Object.assign({}, base, ...layers);
  for (const key of TOGGLES) {
    const set = layers.filter((layer) => layer?.[key] !== undefined);
    if (set.length > 0) out[key] = Boolean(base[key]) || set.filter((layer) => layer?.[key]).length % 2 === 1;
  }
  return out;
}

const LEADERS: Record<string, string> = { dot: ".", hyphen: "-", underscore: "_", heavy: "_", middleDot: "·" };
const STOPS: Record<string, TabStop["kind"]> = {
  left: "left",
  start: "left",
  num: "left",
  center: "center",
  right: "right",
  end: "right",
  decimal: "decimal",
};

function paraLook(doc: Doc, pPr: Element | null): ParaLook {
  const out: ParaLook = {};
  for (const el of kids(pPr)) {
    const value = valOf(el);
    switch (el.localName) {
      case "jc":
        if (value) out.align = value;
        break;
      case "ind": {
        const left = twips(at(el, "left") ?? at(el, "start"));
        const right = twips(at(el, "right") ?? at(el, "end"));
        const first = twips(at(el, "firstLine"));
        const hang = twips(at(el, "hanging"));
        if (left !== undefined) out.left = left;
        if (right !== undefined) out.right = right;
        if (hang !== undefined) out.first = -hang;
        else if (first !== undefined) out.first = first;
        break;
      }
      case "spacing": {
        const before = twips(at(el, "before"));
        const after = twips(at(el, "after"));
        const line = at(el, "line");
        if (before !== undefined) out.before = before;
        if (after !== undefined) out.after = after;
        if (at(el, "beforeAutospacing") !== null) out.autoBefore = yes(at(el, "beforeAutospacing"));
        if (at(el, "afterAutospacing") !== null) out.autoAfter = yes(at(el, "afterAutospacing"));
        if (line !== null) {
          out.line = /[a-z]/i.test(line) ? (lengthOf(line) ?? 12) * 20 : numberOf(line);
          out.rule = at(el, "lineRule") ?? "auto";
        }
        break;
      }
      case "contextualSpacing":
        out.context = on(el);
        break;
      case "pageBreakBefore":
        out.breakBefore = on(el);
        break;
      case "keepNext":
        out.keepNext = on(el);
        break;
      case "shd":
        out.fill = shadeOf(doc, el);
        break;
      case "pBdr":
        out.edges = edgesOf(doc, el);
        break;
      case "tabs":
        out.tabs = kids(el, "tab").flatMap((tab) => {
          const place = twips(at(tab, "pos"));
          const kind = valOf(tab) ?? "left";
          if (place === undefined || (kind !== "clear" && !STOPS[kind])) return [];
          return [
            { at: place, kind: STOPS[kind] ?? "left", fill: LEADERS[at(tab, "leader") ?? ""], clear: kind === "clear" },
          ];
        });
        break;
      case "outlineLvl":
        out.outline = numberOf(value);
        break;
      case "bidi":
        out.rtl = on(el);
        break;
      case "snapToGrid":
        out.snap = on(el);
        break;
      case "numPr": {
        const num = valOf(kid(el, "numId"));
        const level = numberOf(valOf(kid(el, "ilvl")));
        if (num !== null) out.num = num;
        if (level !== undefined) out.level = level;
        break;
      }
    }
  }
  return out;
}

function mergeTabs(a: ParaLook["tabs"], b: ParaLook["tabs"]): ParaLook["tabs"] {
  if (!a || !b) return b ?? a;
  const gone = new Set(b.map((tab) => Math.round(tab.at * 20)));
  return [...a.filter((tab) => !gone.has(Math.round(tab.at * 20))), ...b];
}

function mergePara(a: ParaLook, b: ParaLook | undefined): ParaLook {
  if (!b) return a;
  const out: ParaLook = { ...a, ...b };
  if (a.edges && b.edges) out.edges = { ...a.edges, ...b.edges };
  if (a.tabs && b.tabs) out.tabs = mergeTabs(a.tabs, b.tabs);
  return out;
}

// ---------------------------------------------------------------- styles

/** A style and all it is based on, the first one first. */
function chainOf(doc: Doc, id: string): Style[] {
  const out: Style[] = [];
  const seen = new Set<string>();
  for (let style = doc.styles.get(id); style && !seen.has(style.id); style = doc.styles.get(style.based)) {
    seen.add(style.id);
    out.unshift(style);
  }
  return out;
}

/** What a paragraph style comes to. `listed`: with the indents of the list it belongs to. */
function styledPara(doc: Doc, id: string, listed: boolean): { look: ParaLook; run: RunLook; heading?: number } {
  const key = `${listed}|${id}`;
  const known = doc.styled.get(key);
  if (known) return known;
  let look: ParaLook = {};
  let run: RunLook = {};
  let heading: number | undefined;
  for (const style of chainOf(doc, id)) {
    run = { ...run, ...style.run };
    const named = /^heading ([1-9])$/i.exec(style.name)?.[1];
    if (named) heading = Number(named);
    if (listed && (style.para.num !== undefined || style.para.level !== undefined)) {
      const num = style.para.num ?? look.num;
      const list = num ? doc.numbers.get(num) : undefined;
      const level = list?.levels.get(style.para.level ?? levelOfStyle(list, style.id) ?? look.level ?? 0);
      if (level) look = mergePara(look, level.para);
    }
    look = mergePara(look, style.para);
  }
  if (look.num && look.level === undefined) {
    const list = doc.numbers.get(look.num);
    const level = list ? levelOfStyle(list, id) : undefined;
    if (level !== undefined) look = { ...look, level };
  }
  const out = { look, run, heading };
  doc.styled.set(key, out);
  return out;
}

const levelOfStyle = (list: NumberList, id: string) => [...list.levels].find(([, level]) => level.style === id)?.[0];

/** Looks of a character style; a paragraph's style lends its letters as well. */
function charLook(doc: Doc, id: string): RunLook | undefined {
  const chain = chainOf(doc, id);
  return chain.length > 0 ? Object.assign({}, ...chain.map((style) => style.run)) : undefined;
}

function padOf(holder: Element | null): Partial<FlowMargin> | undefined {
  if (!holder) return undefined;
  const out: Partial<FlowMargin> = {};
  for (const el of kids(holder)) {
    const name = EDGE_NAMES[el.localName];
    const size = at(el, "type") === "pct" ? undefined : twips(at(el, "w"));
    if (size !== undefined && (name === "top" || name === "right" || name === "bottom" || name === "left"))
      out[name] = size;
  }
  return out;
}

function valignOf(el: Element | null): FlowCell["valign"] | undefined {
  const value = valOf(el);
  return value === "center" ? "middle" : value === "bottom" ? "bottom" : value ? "top" : undefined;
}

function cellLook(doc: Doc, tcPr: Element | null): CellLook {
  const shade = kid(tcPr, "shd");
  return {
    edges: edgesOf(doc, kid(tcPr, "tcBorders")),
    fill: shade ? shadeOf(doc, shade) : undefined,
    valign: valignOf(kid(tcPr, "vAlign")),
    pad: padOf(kid(tcPr, "tcMar")),
  };
}

/** One set of rules of a table style: the whole table's, or those of its first row and the like. */
function layerOf(doc: Doc, el: Element): Layer {
  const tblPr = kid(el, "tblPr");
  const cell = cellLook(doc, kid(el, "tcPr"));
  const shade = kid(tblPr, "shd");
  return {
    para: paraLook(doc, kid(el, "pPr")),
    run: runLook(doc, kid(el, "rPr")),
    cell: {
      ...cell,
      edges: { ...edgesOf(doc, kid(tblPr, "tblBorders")), ...cell.edges },
      fill: cell.fill === undefined && shade ? shadeOf(doc, shade) : cell.fill,
    },
    pad: padOf(kid(tblPr, "tblCellMar")),
    indent: twips(at(kid(tblPr, "tblInd"), "w")),
    align: valOf(kid(tblPr, "jc")) ?? undefined,
  };
}

const EMPTY_LAYER: Layer = { para: {}, run: {}, cell: { edges: {} } };

function mergeLayer(a: Layer, b: Layer): Layer {
  return {
    para: mergePara(a.para, b.para),
    run: { ...a.run, ...b.run },
    cell: {
      edges: { ...a.cell.edges, ...b.cell.edges },
      fill: b.cell.fill === undefined ? a.cell.fill : b.cell.fill,
      valign: b.cell.valign ?? a.cell.valign,
      pad: { ...a.cell.pad, ...b.cell.pad },
    },
    pad: { ...a.pad, ...b.pad },
    indent: b.indent ?? a.indent,
    align: b.align ?? a.align,
  };
}

function tableStyle(doc: Doc, id: string): TableStyle {
  const known = doc.tableStyles.get(id);
  if (known) return known;
  let whole = EMPTY_LAYER;
  const parts = new Map<string, Layer>();
  let rowBand = 1;
  let colBand = 1;
  for (const style of chainOf(doc, id)) {
    whole = mergeLayer(whole, layerOf(doc, style.el));
    rowBand = numberOf(valOf(dig(style.el, "tblPr", "tblStyleRowBandSize"))) ?? rowBand;
    colBand = numberOf(valOf(dig(style.el, "tblPr", "tblStyleColBandSize"))) ?? colBand;
    for (const el of kids(style.el, "tblStylePr")) {
      const name = at(el, "type") ?? "";
      const layer = layerOf(doc, el);
      if (name === "wholeTable") whole = mergeLayer(whole, layer);
      else parts.set(name, mergeLayer(parts.get(name) ?? EMPTY_LAYER, layer));
    }
  }
  const out = { whole, parts, rowBand: Math.max(1, rowBand), colBand: Math.max(1, colBand) };
  doc.tableStyles.set(id, out);
  return out;
}

// ---------------------------------------------------------------- lists

function readLevel(doc: Doc, el: Element): Level {
  // Formats newer than the file's first readers are wrapped, with an older one to fall back on.
  const formats = findAll(el, "numFmt");
  const custom = formats.find((format) => at(format, "format"));
  const zeros = /^0+1\b/.exec(at(custom, "format") ?? "")?.[0].length;
  return {
    start: numberOf(valOf(kid(el, "start"))) ?? 0,
    format: zeros ? `zeros${zeros}` : (valOf(formats[formats.length - 1]) ?? "decimal"),
    text: valOf(kid(el, "lvlText")) ?? "",
    suffix: valOf(kid(el, "suff")) ?? "tab",
    legal: on(kid(el, "isLgl")) ?? false,
    restart: numberOf(valOf(kid(el, "lvlRestart"))),
    style: valOf(kid(el, "pStyle")) ?? "",
    para: listIndents(paraLook(doc, kid(el, "pPr"))),
    run: runLook(doc, kid(el, "rPr")),
  };
}

/** Of a level's paragraph settings only where things stand matters. */
const listIndents = ({ left, right, first, tabs }: ParaLook): ParaLook => ({
  ...(left !== undefined && { left }),
  ...(right !== undefined && { right }),
  ...(first !== undefined && { first }),
  ...(tabs !== undefined && { tabs }),
});

function readNumbers(doc: Doc, root: Element | null) {
  const bases = new Map(kids(root, "abstractNum").map((el) => [at(el, "abstractNumId") ?? "", el]));
  const nums = new Map(kids(root, "num").map((el) => [at(el, "numId") ?? "", el]));
  const baseOf = (id: string, depth = 0): string => {
    const link = valOf(kid(bases.get(id), "numStyleLink"));
    if (!link || depth > 4) return id;
    // The list is kept with a style of its own, which names the number.
    const num = valOf(dig(doc.styles.get(link)?.el, "pPr", "numPr", "numId"));
    const next = num ? valOf(kid(nums.get(num), "abstractNumId")) : null;
    return next ? baseOf(next, depth + 1) : id;
  };
  for (const [id, el] of nums) {
    const base = baseOf(valOf(kid(el, "abstractNumId")) ?? "");
    const levels = new Map<number, Level>();
    for (const lvl of kids(bases.get(base), "lvl")) levels.set(numberOf(at(lvl, "ilvl")) ?? 0, readLevel(doc, lvl));
    const starts = new Map<number, number>();
    for (const over of kids(el, "lvlOverride")) {
      const index = numberOf(at(over, "ilvl")) ?? 0;
      const start = numberOf(valOf(kid(over, "startOverride")));
      const own = kid(over, "lvl");
      if (own) levels.set(index, readLevel(doc, own));
      if (start !== undefined) starts.set(index, start);
    }
    doc.numbers.set(id, { base, levels, starts });
  }
}

/** Counts one more item. All lists made from the same pattern count on together. */
function countItem(doc: Doc, id: string, list: NumberList, index: number): number[] {
  let counts = doc.counts.get(list.base);
  if (!counts) doc.counts.set(list.base, (counts = []));
  if (!doc.begun.has(id)) {
    doc.begun.add(id);
    for (const level of list.starts.keys()) counts[level] = undefined;
  }
  const startOf = (level: number) => list.starts.get(level) ?? list.levels.get(level)?.start ?? 1;
  // Levels above that had no item of their own yet count as begun.
  for (let level = 0; level < index; level += 1) counts[level] ??= startOf(level);
  const now = counts[index];
  counts[index] = now === undefined ? startOf(index) : now + 1;
  for (let level = index + 1; level < 9; level += 1) {
    const restart = list.levels.get(level)?.restart;
    if (restart === undefined || (restart > 0 && index <= restart - 1)) counts[level] = undefined;
  }
  return Array.from({ length: 9 }, (_, level) => counts?.[level] ?? startOf(level));
}

const formatCount = (format: string, value: number) =>
  format.startsWith("zeros") ? String(value).padStart(Number(format.slice(5)), "0") : countText(format, value);

type Mark = { list?: FlowList; text?: string; value?: number };

/** What stands in front of a list item: a list the editor knows, or plain words. */
function markOf(doc: Doc, id: string, list: NumberList, index: number): Mark {
  const level = list.levels.get(index);
  if (!level) return {};
  if (level.format === "bullet") {
    const font = level.run.ascii ?? level.run.ansi;
    const sign = plainSymbols(level.text, font).trim();
    const mark = sign === "o" && /courier/i.test(font ?? "") ? "◦" : sign;
    return mark ? { list: { type: "bullet", mark, level: index } } : {};
  }
  const counts = countItem(doc, id, list, index);
  const value = counts[index];
  const own = /^([^%\p{L}\p{N}]*)%(\d)([^%\p{L}\p{N}]*)$/u.exec(level.text.trim());
  const kind = KINDS[level.format];
  if (own && Number(own[2]) === index + 1 && kind && (kind === "1" || (value > 0 && value < 4000)))
    return { list: { type: "number", mark: own[1] + kind + own[3], level: index }, value };
  const text = level.text.replace(/%(\d)/g, (_, digit: string) => {
    const other = list.levels.get(Number(digit) - 1);
    const format = level.legal && Number(digit) !== index + 1 ? "decimal" : (other?.format ?? "decimal");
    return formatCount(format, counts[Number(digit) - 1] ?? 1);
  });
  return text.trim() ? { text, value } : { value };
}

// ---------------------------------------------------------------- opening the file

async function readRels(pack: Pack, path: string): Promise<Map<string, Rel>> {
  const root = await pack.xml(path.replace(/[^/]*$/, (name) => `_rels/${name}.rels`));
  const out = new Map<string, Rel>();
  for (const el of kids(root, "Relationship")) {
    const id = at(el, "Id");
    const raw = at(el, "Target");
    if (!id || raw === null) continue;
    const outside = at(el, "TargetMode") === "External";
    let target = outside ? raw : resolvePath(path, raw);
    if (!outside && !pack.has(target)) {
      try {
        target = decodeURI(target);
      } catch {
        // Not an encoded name after all.
      }
    }
    out.set(id, { kind: (at(el, "Type") ?? "").split("/").pop() ?? "", target, outside });
  }
  return out;
}

async function readPart(pack: Pack, path: string | undefined): Promise<Part | null> {
  const root = path ? await pack.xml(path) : null;
  return path && root ? { path, root, rels: await readRels(pack, path) } : null;
}

function readTheme(root: Element | null, settings: Element | null): Theme {
  const elements = kid(root, "themeElements");
  const colors = new Map<string, string>();
  for (const el of kids(kid(elements, "clrScheme"))) {
    const value = el.firstElementChild;
    const hex = value?.localName === "sysClr" ? at(value, "lastClr") : valOf(value);
    if (isHex(hex)) colors.set(el.localName, hexOf(hex));
  }
  const fonts = (name: string): FontSet => {
    const set = dig(elements, "fontScheme", name);
    const face = (kind: string) => at(kid(set, kind), "typeface") ?? "";
    return {
      latin: face("latin"),
      ea: face("ea"),
      cs: face("cs"),
      scripts: new Map(kids(set, "font").map((el) => [at(el, "script") ?? "", at(el, "typeface") ?? ""])),
    };
  };
  const names = new Map([
    ["bg1", "lt1"],
    ["tx1", "dk1"],
    ["bg2", "lt2"],
    ["tx2", "dk2"],
  ]);
  const mapping = kid(settings, "clrSchemeMapping");
  for (const [slot, own] of [
    ["bg1", "bg1"],
    ["tx1", "t1"],
    ["bg2", "bg2"],
    ["tx2", "t2"],
  ]) {
    const value = at(mapping, own);
    if (value && SLOTS[value]) names.set(slot, SLOTS[value]);
  }
  const languages = kid(settings, "themeFontLang");
  return {
    colors,
    names,
    major: fonts("majorFont"),
    minor: fonts("minorFont"),
    lines: kids(dig(elements, "fmtScheme", "lnStyleLst"), "ln").map((el) => emu(at(el, "w")) || 0.75),
    fills: kids(dig(elements, "fmtScheme", "fillStyleLst")),
    backs: kids(dig(elements, "fmtScheme", "bgFillStyleLst")),
    ea: at(languages, "eastAsia") ?? "",
    bidi: at(languages, "bidi") ?? "",
  };
}

function readStyles(doc: Doc, root: Element | null) {
  for (const el of kids(root, "style")) {
    const id = at(el, "styleId") ?? "";
    const kind = at(el, "type") ?? "paragraph";
    doc.styles.set(id, {
      id,
      kind,
      name: valOf(kid(el, "name")) ?? "",
      based: valOf(kid(el, "basedOn")) ?? "",
      para: {},
      run: {},
      el,
    });
    if (!yes(at(el, "default"))) continue;
    if (kind === "paragraph") doc.normal = id;
    if (kind === "table") doc.plainTable = id;
  }
  const defaults = kid(root, "docDefaults");
  doc.base = {
    para: paraLook(doc, dig(defaults, "pPrDefault", "pPr")),
    run: runLook(doc, dig(defaults, "rPrDefault", "rPr")),
  };
  for (const style of doc.styles.values()) {
    style.para = paraLook(doc, kid(style.el, "pPr"));
    style.run = runLook(doc, kid(style.el, "rPr"));
  }
}

async function openDoc(pack: Pack): Promise<Doc> {
  const top = [...(await readRels(pack, "")).values()].find((rel) => rel.kind === "officeDocument" && !rel.outside);
  const path = top && pack.has(top.target) ? top.target : "word/document.xml";
  if (!pack.has(path)) {
    if (pack.has("xl/workbook.xml")) throw new ConvertError("This is an Excel workbook, not a Word document.");
    if (pack.has("ppt/presentation.xml"))
      throw new ConvertError("This is a PowerPoint presentation, not a Word document.");
    throw new ConvertError("This is not a Word document.");
  }
  const main = await readPart(pack, path);
  if (!main) throw new ConvertError(DAMAGED);
  if (main.root.localName !== "document" || !kid(main.root, "body"))
    throw new ConvertError("This is not a Word document.");
  const rels = [...main.rels.values()].filter((rel) => !rel.outside);
  const pathOf = (kind: string) => rels.find((rel) => rel.kind === kind)?.target;
  const [styles, numbering, settings, theme, footnotes, endnotes] = await Promise.all(
    ["styles", "numbering", "settings", "theme", "footnotes", "endnotes"].map((kind) => readPart(pack, pathOf(kind))),
  );
  const bands = await Promise.all(
    rels
      .filter((rel) => rel.kind === "header" || rel.kind === "footer" || rel.kind.startsWith("diagram"))
      .map((rel) => readPart(pack, rel.target)),
  );
  const compat = kid(settings?.root, "compat");
  const mode = kids(compat, "compatSetting").find((el) => at(el, "name") === "compatibilityMode");
  const doc: Doc = {
    main,
    theme: readTheme(theme?.root ?? null, settings?.root ?? null),
    styles: new Map(),
    normal: "",
    plainTable: "",
    base: { para: {}, run: {} },
    numbers: new Map(),
    counts: new Map(),
    begun: new Set(),
    parts: new Map(),
    pictures: new Map(),
    mode: numberOf(valOf(mode)) ?? 12,
    sums: on(kid(compat, "doNotUseHTMLParagraphAutoSpacing")) ?? false,
    splits: on(kid(compat, "splitPgBreakAndParaMark")) ?? false,
    step: twips(valOf(kid(settings?.root, "defaultTabStop"))) || 36,
    notes: new Map(),
    noteFormat: {
      foot: noteFormat(settings?.root, "footnotePr", "decimal"),
      end: noteFormat(settings?.root, "endnotePr", "lowerRoman"),
    },
    tabs: new Map(),
    traits: new Map(),
    over: new Map(),
    styled: new Map(),
    tableStyles: new Map(),
    sections: 1,
  };
  readStyles(doc, styles?.root ?? null);
  readNumbers(doc, numbering?.root ?? null);
  for (const part of [main, footnotes, endnotes, ...bands]) if (part) doc.parts.set(part.path, part);
  if (footnotes) doc.parts.set("foot", footnotes);
  if (endnotes) doc.parts.set("end", endnotes);
  const files = new Set<string>();
  for (const part of doc.parts.values())
    for (const rel of part.rels.values()) if (rel.kind === "image" && !rel.outside) files.add(rel.target);
  await Promise.all(
    [...files].map(async (file) => {
      const bytes = await pack.bytes(file);
      const mime = bytes && bytes.length > 0 ? pictureType(bytes) : null;
      if (bytes && mime) doc.pictures.set(file, { bytes, mime });
    }),
  );
  return doc;
}

function noteFormat(root: Element | null | undefined, name: string, usual: string) {
  const el = kid(root, name);
  return { format: valOf(kid(el, "numFmt")) ?? usual, start: numberOf(valOf(kid(el, "numStart"))) ?? 1 };
}

export async function readDocx(bytes: Uint8Array): Promise<FlowDoc> {
  const pack = await openPack(bytes, "a Word document");
  const doc = await openDoc(pack);
  const sections = readBody(doc);
  await settleTabs(doc.tabs);
  const out: FlowDoc = { kind: "flow", sections };
  const core = [...(await readRels(pack, "")).values()].find((rel) => rel.kind === "core-properties");
  const about = await pack.xml(core?.target ?? "docProps/core.xml");
  const title = kid(about, "title")?.textContent?.trim();
  const author = kid(about, "creator")?.textContent?.trim();
  if (title) out.title = title;
  if (author) out.author = author;
  return out;
}

// ---------------------------------------------------------------- sections

function readRoom(sectPr: Element | null): Room {
  const size = kid(sectPr, "pgSz");
  const edge = kid(sectPr, "pgMar");
  const columns = kid(sectPr, "cols");
  const grid = kid(sectPr, "docGrid");
  const w = twips(at(size, "w")) || 612;
  const h = twips(at(size, "h")) || 792;
  const gutter = twips(at(edge, "gutter")) ?? 0;
  const margin: FlowMargin = {
    top: Math.abs(twips(at(edge, "top")) ?? 72),
    right: twips(at(edge, "right")) ?? 72,
    bottom: Math.abs(twips(at(edge, "bottom")) ?? 72),
    left: (twips(at(edge, "left")) ?? 72) + gutter,
  };
  const own = kids(columns, "col");
  const cols = Math.max(1, Math.round(numberOf(at(columns, "num")) ?? (own.length || 1)));
  const gap = twips(own.length > 0 ? at(own[0], "space") : at(columns, "space")) ?? 36;
  const refs = (name: string): Refs => {
    const out: Refs = {};
    for (const el of kids(sectPr, name)) {
      const type = at(el, "type") ?? "default";
      const id = at(el, "id");
      if (id && (type === "default" || type === "first" || type === "even")) out[type] = id;
    }
    return out;
  };
  return {
    w,
    h,
    margin,
    headerAt: twips(at(edge, "header")) ?? 36,
    footerAt: twips(at(edge, "footer")) ?? 36,
    cols,
    gap,
    text: Math.max(36, (w - margin.left - margin.right - gap * (cols - 1)) / cols),
    kind: valOf(kid(sectPr, "type")) ?? "nextPage",
    title: on(kid(sectPr, "titlePg")) ?? false,
    header: refs("headerReference"),
    footer: refs("footerReference"),
    pitch: /^lines/.test(at(grid, "type") ?? "") ? (twips(at(grid, "linePitch")) ?? 0) : 0,
    frame: kid(sectPr, "pgBorders"),
  };
}

function storyEnv(part: Part, root: Element, room: Room, place: Env["place"]): Env {
  return {
    part,
    room,
    place,
    band: place === "header" || place === "footer",
    at: room.margin.left,
    width: place === "body" || place === "note" ? room.text : room.w - room.margin.left - room.margin.right,
    fields: [],
    lost: lostFields(root),
  };
}

/** Marks of fields without a partner. Taking them seriously would swallow the rest of the text. */
function lostFields(root: Element): Set<Element> {
  const open: Element[] = [];
  const lost = new Set<Element>();
  for (const el of findAll(root, "fldChar")) {
    if (el.closest("del, moveFrom")) continue;
    const kind = at(el, "fldCharType");
    if (kind === "begin") open.push(el);
    else if (open.length === 0) lost.add(el);
    else if (kind === "end") open.pop();
  }
  open.forEach((el) => lost.add(el));
  return lost;
}

function readBody(doc: Doc): FlowSection[] {
  const body = kid(doc.main.root, "body") as Element;
  const marks = findAll(body, "sectPr").filter(
    ({ parentElement: parent }) =>
      parent === body || (parent?.localName === "pPr" && parent.parentElement?.localName === "p"),
  );
  const rooms = marks.map(readRoom);
  if (marks.length === 0 || marks[marks.length - 1].parentElement !== body)
    rooms.push(rooms.length > 0 ? { ...rooms[rooms.length - 1], kind: "continuous" } : readRoom(null));
  // Headers and footers a section does not name are those of the one before.
  rooms.forEach((room, i) => {
    if (i === 0) return;
    room.header = { ...rooms[i - 1].header, ...room.header };
    room.footer = { ...rooms[i - 1].footer, ...room.footer };
  });
  doc.sections = rooms.length;

  const chunks: Chunk<Room>[] = [];
  const env = storyEnv(doc.main, body, rooms[0], "body");
  const rest = readBlocks(doc, body, env, (blocks) => {
    chunks.push({ room: env.room, blocks });
    env.room = rooms[Math.min(chunks.length, rooms.length - 1)];
    env.at = env.room.margin.left;
    env.width = env.room.text;
  });
  if (rest.length > 0 || chunks.length === 0) chunks.push({ room: env.room, blocks: rest });
  chunks[chunks.length - 1].blocks.push(...readNotes(doc, env.room));

  const joined = joinChunks(chunks);
  return joined.map(({ room, blocks }) => {
    if (blocks.length === 0) blocks.push(...paraBlocks(doc, settingOf(doc, null, env), env, [], {}));
    tidyBreaks(blocks);
    numberLists(blocks, doc.traits);
    const section: FlowSection = { w: round(room.w), h: round(room.h), margin: room.margin, blocks };
    if (room.cols > 1) Object.assign(section, { columns: room.cols, gap: round(room.gap) });
    const header = readBand(doc, room, "header");
    const footer = readBand(doc, room, "footer");
    if (header) section.header = header;
    if (footer) section.footer = footer;
    section.headerAt = round(room.headerAt);
    section.footerAt = round(room.footerAt);
    return section;
  });
}

function readBand(doc: Doc, room: Room, place: "header" | "footer"): FlowBlock[] | undefined {
  const refs = room[place];
  const read = (id: string | undefined) => {
    const part = id ? doc.parts.get(doc.main.rels.get(id)?.target ?? "") : undefined;
    if (!part) return [];
    const blocks = readBlocks(doc, part.root, storyEnv(part, part.root, room, place));
    numberLists(blocks, doc.traits);
    return isBlank(blocks) ? [] : blocks;
  };
  let blocks = read(refs.default);
  // The first page's own header only stands in when there is no other.
  if (blocks.length === 0 && room.title) blocks = read(refs.first);
  if (place === "header") blocks.push(...pageFrame(doc, room));
  return blocks.length > 0 ? blocks : undefined;
}

/** A frame around the pages, as a box every page shows. */
function pageFrame(doc: Doc, room: Room): FlowBox[] {
  const { frame } = room;
  if (!frame || at(frame, "display") === "firstPage") return [];
  const edges = edgesOf(doc, frame);
  const gaps: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const el of kids(frame)) {
    const name = EDGE_NAMES[el.localName];
    if (name && name in gaps) gaps[name as Side] = numberOf(at(el, "space")) ?? 0;
  }
  const fromText = (at(frame, "offsetFrom") ?? "text") === "text";
  const inset = (side: Side) => Math.max(0, fromText ? room.margin[side] - gaps[side] : gaps[side]);
  const x0 = inset("left");
  const y0 = inset("top");
  const x1 = room.w - inset("right");
  const y1 = room.h - inset("bottom");
  const box = (x: number, y: number, w: number, h: number, stroke: FlowLine, shape?: string): FlowBox => ({
    kind: "box",
    x: round(x),
    y: round(y),
    from: "page",
    w: round(w),
    h: round(h),
    blocks: [],
    stroke,
    ...(shape && { shape }),
  });
  const { top, right, bottom, left } = edges;
  if (top && right && bottom && left) return [box(x0, y0, x1 - x0, y1 - y0, top)];
  const out: FlowBox[] = [];
  if (top) out.push(box(x0, y0, x1 - x0, 0, top, "line"));
  if (bottom) out.push(box(x0, y1, x1 - x0, 0, bottom, "line"));
  if (left) out.push(box(x0, y0, 0, y1 - y0, left, "line"));
  if (right) out.push(box(x1, y0, 0, y1 - y0, right, "line"));
  return out;
}

// ---------------------------------------------------------------- footnotes and endnotes

function noteMark(doc: Doc, kind: Note["kind"], id: string, custom: boolean): string {
  const key = `${kind}:${id}`;
  const known = doc.notes.get(key);
  if (known) return known.mark;
  const { format, start } = doc.noteFormat[kind];
  const counted = [...doc.notes.values()].filter((note) => note.kind === kind && note.mark).length;
  const mark = custom ? "" : countText(format, start + counted);
  doc.notes.set(key, { kind, id, mark });
  return mark;
}

/** The notes, small, after a thin rule. */
function readNotes(doc: Doc, room: Room): FlowBlock[] {
  const out: FlowBlock[] = [];
  const usual = doc.base.run.size ?? 10;
  for (const kind of ["foot", "end"] as const) {
    const part = doc.parts.get(kind);
    for (const note of [...doc.notes.values()].filter((one) => one.kind === kind)) {
      const el = kids(part?.root).find((one) => at(one, "id") === note.id);
      if (!part || !el) continue;
      const env = storyEnv(part, el, room, "note");
      env.mark = note.mark;
      const paras = onlyParas(doc.traits, readBlocks(doc, el, env));
      const first = paras[0];
      if (!first) continue;
      const start = first.runs.find((run) => run.image === undefined && run.text.trim() !== "");
      if (note.mark && start?.style?.script !== "super") {
        const style: FlowStyle = { ...(first.runs[0]?.style ?? {}), script: "super" };
        first.runs = [{ text: note.mark, style }, { text: " ", style: { ...style, script: undefined } }, ...first.runs];
      }
      for (const para of paras) {
        for (const run of para.runs)
          if (run.image === undefined && (run.style.size ?? 0) >= usual && usual > 9)
            run.style = { ...run.style, size: round(Math.min(10, (run.style.size ?? usual) * 0.9)) };
        out.push(para);
      }
    }
  }
  return out.length > 0 ? [{ kind: "rule", color: "#000000", width: 0.5 }, ...out] : [];
}

// ---------------------------------------------------------------- blocks

/** The version of something this reader can read. */
function choose(el: Element): Element | null {
  for (const choice of kids(el, "Choice")) {
    const wanted = (at(choice, "Requires") ?? "").split(/\s+/).filter(Boolean);
    const known = wanted.every((prefix) => {
      const space = choice.lookupNamespaceURI(prefix) ?? prefix;
      return /word\/20\d\d\/(wordprocessing(Shape|Group|Canvas|Drawing)|wordml)|office\/drawing\/2010\/main/.test(
        space,
      );
    });
    if (known) return choice;
  }
  return kid(el, "Fallback") ?? null;
}

/** Ticked or not, as a character. */
function checkBox(sdt: Element) {
  const box = dig(sdt, "sdtPr", "checkbox");
  const content = kid(sdt, "sdtContent");
  if (!box || !content) return;
  const sign = yes(valOf(kid(box, "checked")) ?? "0") ? "☑" : "☐";
  const text = find(content, "t");
  const symbol = find(content, "sym");
  if (text) text.textContent = sign;
  else if (symbol) {
    const own = content.ownerDocument.createElementNS(symbol.namespaceURI, "w:t");
    own.textContent = sign;
    symbol.replaceWith(own);
  }
}

function readBlocks(doc: Doc, holder: Element, env: Env, cut?: (blocks: FlowBlock[]) => void): FlowBlock[] {
  let out: FlowBlock[] = [];
  let carry: Carry = { pieces: [] };
  let frame: { key: string; box: FlowBox; around: boolean } | null = null;
  const flush = () => {
    if (carry.pieces.length > 0)
      out.push(...paraBlocks(doc, carry.set ?? settingOf(doc, null, env), env, carry.pieces, {}));
    carry = { pieces: [] };
  };
  const walk = (parent: Element | null) => {
    for (const el of kids(parent)) {
      switch (el.localName) {
        case "p": {
          const framed = frameOf(doc, el, env);
          if (framed === "cap") {
            carry = { ...carry, pieces: [...carry.pieces, ...dropCap(doc, el, env)] };
            break;
          }
          const last = out.findLast((block) => block.kind !== "box");
          env.top = env.place === "body" && env.room.cols === 1 && (!last || last.kind === "break");
          const apart = framed && framed !== "line" ? framed : null;
          if (!apart && frame?.around) {
            // The words that come next stand beside the frame.
            const { x, y, from, w, h, blocks } = frame.box;
            const image = spacerFor(groundOf(env), { x, y, from }, w, Math.max(h, aboutHigh(blocks, w)));
            if (image && image !== "below")
              carry = { ...carry, pieces: [...carry.pieces, { kind: "run", run: { image } }] };
          }
          const read = readPara(doc, el, env, carry);
          carry = read.carry;
          if (apart) {
            if (frame && frame.key === apart.key) frame.box.blocks.push(...onlyParas(doc.traits, read.blocks));
            else {
              frame = { ...apart, box: { ...apart.box, blocks: onlyParas(doc.traits, read.blocks) } };
              out.push(frame.box);
            }
            break;
          }
          frame = null;
          const ends = cut && dig(el, "pPr", "sectPr");
          // The mark that ends a section is not a line of its own.
          if (!ends || out.length === 0 || !isBlank(read.blocks)) out.push(...read.blocks);
          else if (out[out.length - 1].kind === "break") out.push(...read.blocks);
          if (ends) {
            flush();
            settleParas(out, doc.traits, { sums: doc.sums, cell: env.place === "cell" });
            cut(out);
            out = [];
          }
          break;
        }
        case "tbl":
          flush();
          frame = null;
          out.push(...readTable(doc, el, env));
          break;
        case "sdt":
          checkBox(el);
          walk(kid(el, "sdtContent"));
          break;
        case "customXml":
        case "smartTag":
        case "ins":
        case "moveTo":
          walk(el);
          break;
        case "AlternateContent":
          walk(choose(el));
          break;
        case "oMath":
        case "oMathPara": {
          const p = el.ownerDocument.createElementNS(doc.main.root.namespaceURI, "w:p");
          p.append(el.cloneNode(true));
          out.push(...readPara(doc, p, env, { pieces: [] }).blocks);
          break;
        }
      }
    }
  };
  walk(holder);
  flush();
  settleParas(out, doc.traits, { sums: doc.sums, cell: env.place === "cell" });
  return out;
}

// ---------------------------------------------------------------- paragraphs

/** What is left of paragraphs whose end was taken out or hidden, and whose settings the rest takes over. */
type Carry = { pieces: Piece[]; set?: Setting };

type Piece =
  | { kind: "run"; run: FlowRun }
  | { kind: "break" }
  | { kind: "box"; box: FlowBox; z: number }
  | { kind: "rule"; color?: string; width?: number }
  /** A picture with nothing beside it, above or below the words it hangs on. */
  | { kind: "stand"; image: FlowImage; x: number; before: number; after: number; below: boolean };

type Setting = { look: ParaLook; style: string; run: RunLook; heading?: number; num?: string; level: number };

function settingOf(doc: Doc, pPr: Element | null, env: Env): Setting {
  const asked = valOf(kid(pPr, "pStyle")) ?? "";
  const style = doc.styles.get(asked)?.kind === "paragraph" ? asked : doc.normal;
  const own = paraLook(doc, pPr);
  const styled = styledPara(doc, style, own.num !== "0");
  let look = mergePara(mergePara(doc.base.para, env.table?.para), styled.look);
  const num = own.num ?? styled.look.num;
  const level = own.level ?? styled.look.level ?? 0;
  if (own.num !== undefined || own.level !== undefined)
    look = mergePara(look, num ? doc.numbers.get(num)?.levels.get(level)?.para : undefined);
  look = mergePara(look, own);
  const outline = look.outline;
  const heading = outline === undefined ? styled.heading : outline + 1;
  return { look, style, run: styled.run, heading, num, level };
}

/** What a paragraph is read into. */
type Line = {
  doc: Doc;
  env: Env;
  pieces: Piece[];
  set: Setting;
  looks: Map<string, RunLook>;
  link?: string;
  /** Colour behind the paragraph. */
  back?: string;
  /** Height of shapes that stand in the line, and room floating ones push the words down by. */
  tall: number;
  push: number;
  /** Tabs that name their own place: the middle or the edge of the line. */
  tabs: TabStop[];
  math?: string;
};

function newLine(doc: Doc, env: Env, set: Setting): Line {
  return {
    doc,
    env,
    set,
    pieces: [],
    looks: new Map(),
    back: set.look.fill ?? env.back,
    tall: 0,
    push: 0,
    tabs: [],
  };
}

function readPara(doc: Doc, p: Element, env: Env, carry: Carry): { blocks: FlowBlock[]; carry: Carry } {
  const pPr = kid(p, "pPr");
  const set = settingOf(doc, pPr, env);
  const line = newLine(doc, env, set);
  line.pieces.push(...carry.pieces);
  readInline(line, p);
  const mark = kid(pPr, "rPr");
  const look = lookOf(line, mark);
  // A paragraph whose end was taken out, or is hidden, runs on into the next.
  if (kid(mark, "del") || kid(mark, "moveFrom")) return { blocks: [], carry: { pieces: line.pieces, set: carry.set } };
  if (look.hidden && kid(mark, "vanish"))
    return { blocks: [], carry: { pieces: line.pieces, set: carry.set ?? (line.pieces.length > 0 ? set : undefined) } };
  line.set = carry.set ?? set;
  return { blocks: paraBlocks(doc, line.set, env, line.pieces, look, line), carry: { pieces: [] } };
}

/** The finished paragraph, in pieces where a page ends in it. */
function paraBlocks(
  doc: Doc,
  set: Setting,
  env: Env,
  pieces: readonly Piece[],
  end: RunLook,
  line?: Line,
): FlowBlock[] {
  const blocks: FlowBlock[] = [];
  const mine = line ?? newLine(doc, env, set);
  const list = set.num && set.num !== "0" ? doc.numbers.get(set.num) : undefined;
  const mark: Mark = list && set.num ? markOf(doc, set.num, list, set.level) : {};
  const empty: FlowRun = { text: "", style: styleOf(mine, end, end.ascii ?? end.ansi) };
  let runs: FlowRun[] = [];
  let begun = false;
  let boxes: { box: FlowBox; z: number }[] = [];
  const finish = (last: boolean) => {
    const filled = runs.some((run) => run.image !== undefined || run.text !== "");
    if (filled || boxes.length > 0 || (last && !begun)) {
      settleDepth(runs, boxes, doc.over);
      const para = makePara(mine, joinRuns(runs), begun ? {} : mark, !begun, end);
      // Floating pictures alone leave the line empty, but it is there.
      if (para.runs.every((run) => run.image?.float)) para.runs.push(empty);
      blocks.push(...boxes.sort((a, b) => a.z - b.z).map(({ box }) => box), para);
      boxes = [];
    }
    begun = begun || filled;
    runs = [];
  };
  const stands = pieces.flatMap((piece) => (piece.kind === "stand" ? [piece] : []));
  for (const one of stands.filter(({ below }) => !below)) blocks.push(standPara(one, env.width));
  for (const piece of pieces) {
    if (piece.kind === "run") runs.push(piece.run);
    else if (piece.kind === "stand") continue;
    else if (piece.kind === "box") boxes.push(piece);
    else if (piece.kind === "rule") {
      finish(false);
      begun = true;
      blocks.push({
        kind: "rule",
        ...(piece.color && { color: piece.color }),
        ...(piece.width && { width: piece.width }),
      });
    } else if (env.place === "body") {
      finish(false);
      begun = true;
      blocks.push({ kind: "break" });
    }
  }
  if (doc.splits && begun && runs.length === 0) runs.push(empty);
  finish(true);
  if (runs.length === 0 && doc.splits && blocks[blocks.length - 1]?.kind === "break")
    blocks.push(makePara(mine, [empty], {}, false, end));
  for (const one of stands.filter(({ below }) => below)) blocks.push(standPara(one, env.width));
  // Lines of a paragraph with aligned tabs each have stops of their own.
  return blocks.flatMap((block): FlowBlock[] =>
    block.kind === "para" ? splitLines(block, doc.tabs, doc.traits) : [block],
  );
}

function makePara(line: Line, runs: FlowRun[], mark: Mark, first: boolean, end: RunLook): FlowPara {
  const { doc, env, set } = line;
  const { look } = set;
  const para: FlowPara = { kind: "para", runs };
  const [left, right] = look.rtl ? [look.right, look.left] : [look.left, look.right];
  const sides: Record<string, FlowPara["align"]> = {
    center: "center",
    both: "justify",
    distribute: "justify",
    lowKashida: "justify",
    mediumKashida: "justify",
    highKashida: "justify",
    thaiDistribute: "justify",
    // "left" is where a line starts, which is the right in Arabic and Hebrew.
    left: look.rtl ? "right" : "left",
    start: look.rtl ? "right" : "left",
    right: look.rtl ? "left" : "right",
    end: look.rtl ? "left" : "right",
  };
  const align = line.math ?? sides[look.align ?? "start"] ?? (look.rtl ? "right" : "left");
  if (align !== "left") para.align = align as FlowPara["align"];
  if (left) para.left = round(left);
  if (right) para.right = round(right);
  if (look.first && first) para.first = round(look.first);
  const auto = !doc.sums;
  para.before = first ? round(auto && look.autoBefore ? 14 : (look.before ?? 0)) : 0;
  para.after = round(auto && look.autoAfter ? 14 : (look.after ?? 0));
  para.line = spacingOf(look, env.room);
  if (line.tall > 0 && !runs.some((run) => run.text)) para.line = { points: round(line.tall), atLeast: true };
  if (first && line.push > 0) para.before = round(para.before + line.push);
  if (set.heading && set.heading <= 6) para.heading = set.heading as FlowPara["heading"];
  if (first && look.breakBefore && env.place === "body") para.breakBefore = true;
  if (look.keepNext) para.keepNext = true;
  if (look.fill) para.fill = look.fill;
  const { top, right: east, bottom, left: west } = look.edges ?? {};
  if (top || east || bottom || west)
    para.border = cleanEdges({
      top: top ?? undefined,
      right: (look.rtl ? west : east) ?? undefined,
      bottom: bottom ?? undefined,
      left: (look.rtl ? east : west) ?? undefined,
    });

  const stops = (look.tabs ?? [])
    .filter((tab) => !tab.clear)
    .map(({ at: place, kind, fill }): TabStop => ({ at: place, kind, fill }));
  if (mark.list) para.list = mark.list;
  else if (mark.text !== undefined) {
    const level = doc.numbers.get(set.num ?? "")?.levels.get(set.level);
    const style = styleOf(line, { ...end, ...level?.run }, level?.run.ascii ?? end.ascii ?? end.ansi);
    const gap = level?.suffix === "nothing" ? "" : level?.suffix === "space" ? " " : "\t";
    const words = plainSymbols(mark.text, level?.run.ascii);
    para.runs = joinRuns([{ text: words, style }, ...(gap ? [{ text: gap, style }] : []), ...runs]);
    // The edge of the words is where the tab behind the number leads.
    if (gap === "\t" && (look.first ?? 0) < 0 && !stops.some((stop) => Math.abs(stop.at - (left ?? 0)) < 0.5))
      stops.push({ at: left ?? 0, kind: "left" });
  }
  if (line.tabs.length > 0) stops.splice(0, stops.length, ...line.tabs);
  doc.tabs.set(para, { stops, width: env.width, step: doc.step });
  doc.traits.set(para, {
    style: set.style,
    context: look.context ?? false,
    autoBefore: auto && (look.autoBefore ?? false),
    autoAfter: auto && (look.autoAfter ?? false),
    list: set.num ?? "",
    value: mark.value,
    between: look.edges?.between,
    edges: look.edges ?? {},
  });
  return para;
}

function spacingOf(look: ParaLook, room: Room): NonNullable<FlowPara["line"]> {
  const value = look.line ?? 240;
  if (look.rule === "exact" && value > 0) return { points: round(value / 20) };
  if (look.rule === "atLeast" && value > 0) return { points: round(value / 20), atLeast: true };
  const times = value > 0 ? value / 240 : 1;
  if (room.pitch > 0 && look.snap !== false) return { points: round(room.pitch * times), atLeast: true };
  return { times: round(times, 4) };
}

/** Old-style frames: a box of its own, a big first letter, or just a line pushed to a side. */
function frameOf(
  doc: Doc,
  p: Element,
  env: Env,
): { key: string; box: FlowBox; around: boolean } | "cap" | "line" | null {
  const el = dig(p, "pPr", "framePr");
  if (!el) return null;
  if (/^(drop|margin)$/.test(at(el, "dropCap") ?? "")) return "cap";
  if (env.place !== "body") {
    // Page numbers used to be put into headers and footers this way.
    const side = at(el, "xAlign");
    const pPr = kid(p, "pPr") as Element;
    if (side && side !== "left") {
      kid(pPr, "jc")?.remove();
      const jc = el.ownerDocument.createElementNS(el.namespaceURI, "w:jc");
      jc.setAttributeNS(el.namespaceURI, "w:val", side === "outside" ? "right" : side);
      pPr.append(jc);
    }
    return "line";
  }
  const { room } = env;
  const w = twips(at(el, "w")) ?? room.text;
  const h = twips(at(el, "h")) ?? 20;
  const spot = placed(env, w, h, {
    relH: at(el, "hAnchor") ?? "text",
    alignH: at(el, "xAlign"),
    x: twips(at(el, "x")) ?? 0,
    relV: at(el, "vAnchor") ?? "text",
    alignV: at(el, "yAlign"),
    y: twips(at(el, "y")) ?? 0,
  });
  const key = Array.from(el.attributes, (attr) => attr.name + attr.value).join("|");
  const around = !/^(none|notBeside)$/.test(at(el, "wrap") ?? "");
  return { key, box: { kind: "box", ...spot, w: round(w), h: round(h), blocks: [] }, around };
}

/** The big first letter goes back to its word; lines cannot run around it here. */
function dropCap(doc: Doc, p: Element, env: Env): Piece[] {
  const line = newLine(doc, env, settingOf(doc, kid(p, "pPr"), env));
  readInline(line, p);
  const most = (doc.base.run.size ?? 10) * 2;
  return line.pieces.map((piece): Piece => {
    if (piece.kind !== "run" || piece.run.image !== undefined) return piece;
    const { text, style } = piece.run;
    return { kind: "run", run: { text, style: { ...style, size: Math.min(style.size ?? most, most) } } };
  });
}

// ---------------------------------------------------------------- words

function lookOf(line: Line, rPr: Element | null): RunLook {
  let id = valOf(kid(rPr, "rStyle")) ?? "";
  // Entries of a table of contents lead somewhere, but do not look like links.
  if (
    id &&
    line.doc.styles.get(id)?.name.toLowerCase() === "hyperlink" &&
    line.env.fields.some((field) => /^\s*TOC\b/i.test(field.code))
  )
    id = "";
  let base = line.looks.get(id);
  if (!base) {
    const { doc, env, set } = line;
    base = mixLooks(doc.base.run, env.table?.run, set.run, id ? charLook(doc, id) : undefined);
    line.looks.set(id, base);
  }
  return rPr ? { ...base, ...runLook(line.doc, rPr) } : base;
}

function styleOf(line: Line, look: RunLook, font: string | undefined): FlowStyle {
  const { complex } = look;
  const style: FlowStyle = {
    font: font || "Times New Roman",
    size: round((complex ? (look.sizeCs ?? look.size) : look.size) ?? 10),
  };
  const back = look.shade ?? line.back;
  // Letters without a colour are black, or white where black could not be read.
  const color =
    look.color ??
    (look.color === undefined ? line.env.ink : undefined) ??
    (back && isDark(back) ? "#ffffff" : undefined);
  if (color) style.color = color;
  if (complex ? look.boldCs : look.bold) style.bold = true;
  if (complex ? look.italicCs : look.italic) style.italic = true;
  if (look.under) style.underline = true;
  if (look.strike || look.double) style.strike = true;
  if (look.script) style.script = look.script;
  const behind = look.mark ?? look.shade;
  if (behind) style.highlight = behind;
  if (look.tracking) style.tracking = round(look.tracking);
  const link = line.link ?? openLink(line.env);
  if (link) style.link = link;
  return style;
}

const openLink = (env: Env) => [...env.fields].reverse().find((field) => field.link)?.link;

/** Words, split where the letters change to a script that has a font of its own. */
function addText(line: Line, text: string, look: RunLook) {
  if (text === "" || look.hidden || silent(line.env)) return;
  if (line.env.fields.some((field) => field.text !== undefined)) {
    tellField(line, look);
    return;
  }
  put(line, text, look);
}

function put(line: Line, raw: string, look: RunLook) {
  const ascii = look.ascii ?? look.ansi;
  const symbol = isSymbolFont(ascii);
  const token = /^\{pages?\}$/.test(raw);
  // The letters a symbol font stood for come in the paragraph's own font.
  const usual = symbol ? (line.looks.get("")?.ascii ?? line.doc.base.run.ascii) : ascii;
  const ansi = symbol ? usual : (look.ansi ?? usual);
  const indic = (font: string | undefined) => (drawsIndic(font) ? font : "Nirmala UI");
  const cs = look.cs ?? usual;
  const fontOf: Record<Script, string | undefined> = look.complex
    ? { plain: cs, ansi: cs, complex: cs, east: cs, indic: indic(cs) }
    : { plain: usual, ansi, complex: ansi, east: look.ea ?? usual, indic: indic(ansi) };
  for (const part of splitScripts(plainSymbols(raw, ascii), (a, b) => fontOf[a] === fontOf[b])) {
    for (const piece of token ? [{ text: part.text, scale: 1 }] : capitals(part.text, look.caps, look.small)) {
      const style = styleOf(line, look, fontOf[part.script]);
      if (piece.scale !== 1) style.size = round((style.size ?? 10) * piece.scale);
      line.pieces.push({ kind: "run", run: { text: piece.text, style } });
    }
  }
}

// ---------------------------------------------------------------- fields

/** Nothing is shown while a field is still being spelled out. */
const silent = (env: Env) => env.fields.some((field) => field.stage === "code");

/** Shows what a field stands for, once, in the look of its old result. */
function tellField(line: Line, look: RunLook) {
  const field = line.env.fields.find((one) => one.text !== undefined);
  if (!field || field.done) return;
  field.done = true;
  put(line, field.text ?? "", look);
}

function startResult(line: Line, field: Field) {
  const { doc, env } = line;
  field.stage = "result";
  const code = field.code.trim();
  const name = /^[A-Za-z]+/.exec(code)?.[0].toUpperCase() ?? "";
  const words = code.match(/"[^"]*"|\\\S+|\S+/g) ?? [];
  const plain = (word: string | undefined) => (word ?? "").replace(/^"|"$/g, "");
  if (env.band && name === "PAGE") field.text = "{page}";
  else if (env.band && (name === "NUMPAGES" || (name === "SECTIONPAGES" && doc.sections === 1))) field.text = "{pages}";
  else if (name === "HYPERLINK") {
    const anchor = words.findIndex((word) => /^\\l$/i.test(word));
    const target = words[1] && !words[1].startsWith("\\") ? plain(words[1]) : "";
    const link = outsideLink(target);
    if (link) field.link = anchor > 0 ? `${link}#${plain(words[anchor + 1])}` : link;
  } else if (name === "FORMCHECKBOX") {
    const box = kid(field.form, "checkBox");
    const state = kid(box, "checked") ?? kid(box, "default");
    field.text = on(state) ? "☑" : "☐";
  } else if (name === "FORMDROPDOWN") {
    const choices = kid(field.form, "ddList");
    const chosen = numberOf(valOf(kid(choices, "result"))) ?? numberOf(valOf(kid(choices, "default"))) ?? 0;
    field.text = valOf(kids(choices, "listEntry")[chosen]) ?? "";
  } else if (name === "SYMBOL") {
    const number = Number(words[1]);
    const font = words.findIndex((word) => /^\\f$/i.test(word));
    if (number > 0)
      field.text = plainSymbols(
        String.fromCodePoint(number < 256 ? 0xf000 + number : number),
        plain(words[font + 1]) || "Symbol",
      );
  } else if (name === "MACROBUTTON" || name === "GOTOBUTTON") field.text = words.slice(2).map(plain).join(" ");
}

function readField(line: Line, el: Element, look: RunLook) {
  const { env } = line;
  if (env.lost.has(el)) return;
  const kind = at(el, "fldCharType");
  if (kind === "begin") {
    env.fields.push({ code: "", stage: "code", form: kid(el, "ffData") });
    return;
  }
  const field = env.fields[env.fields.length - 1];
  if (!field) return;
  if (kind === "separate") startResult(line, field);
  else if (kind === "end") {
    if (field.stage === "code") startResult(line, field);
    if (!silent(env) && !look.hidden) tellField(line, look);
    env.fields.pop();
  }
}

// ---------------------------------------------------------------- inside a paragraph

function readInline(line: Line, parent: Element | null) {
  for (const el of kids(parent)) {
    switch (el.localName) {
      case "r":
        readRun(line, el);
        break;
      case "hyperlink": {
        const before = line.link;
        const id = at(el, "id");
        const rel = id ? line.env.part.rels.get(id) : undefined;
        const link = rel?.outside ? outsideLink(rel.target) : null;
        const anchor = at(el, "anchor");
        if (link) line.link = anchor && !link.includes("#") ? `${link}#${anchor}` : link;
        readInline(line, el);
        line.link = before;
        break;
      }
      case "fldSimple": {
        const field: Field = { code: at(el, "instr") ?? "", stage: "code", form: kid(el, "ffData") };
        line.env.fields.push(field);
        startResult(line, field);
        readInline(line, el);
        if (!silent(line.env)) tellField(line, lookOf(line, dig(el, "r", "rPr")));
        line.env.fields.pop();
        break;
      }
      case "sdt":
        checkBox(el);
        readInline(line, kid(el, "sdtContent"));
        break;
      case "ins":
      case "moveTo":
      case "smartTag":
      case "customXml":
      case "dir":
      case "bdo":
        readInline(line, el);
        break;
      case "AlternateContent":
        readInline(line, choose(el));
        break;
      case "oMathPara":
        // An equation on a line of its own stands in the middle whatever the paragraph says.
        if (!parent || kids(parent).every((one) => !/^(r|hyperlink|oMath|fldSimple)$/.test(one.localName)))
          line.math = mathAlign(el);
        readMath(line, el);
        break;
      case "oMath":
        readMath(line, el);
        break;
    }
  }
}

function readRun(line: Line, r: Element) {
  const look = lookOf(line, kid(r, "rPr"));
  readRunParts(line, r, look);
}

function readRunParts(line: Line, holder: Element, look: RunLook) {
  const { env, doc } = line;
  for (const el of kids(holder)) {
    switch (el.localName) {
      case "t": {
        const text = (el.textContent ?? "").replace(/[\t\r\n]+/g, " ");
        // Spaces at the ends count only when the file says so.
        const kept = el.getAttribute("xml:space") === "preserve" ? text : text.replace(/^ +| +$/g, "");
        addText(line, kept, look);
        break;
      }
      case "tab":
        addText(line, "\t", look);
        break;
      case "ptab": {
        const side = at(el, "alignment");
        const kind = side === "center" ? "center" : side === "right" ? "right" : "left";
        const place = kind === "center" ? env.width / 2 : kind === "right" ? env.width : 0;
        line.tabs.push({ at: place, kind, fill: LEADERS[at(el, "leader") ?? ""] });
        addText(line, "\t", look);
        break;
      }
      case "br": {
        const type = at(el, "type");
        if (type !== "page" && type !== "column") addText(line, "\n", look);
        else if (!silent(env) && !look.hidden && (type === "page" || env.room.cols === 1))
          line.pieces.push({ kind: "break" });
        break;
      }
      case "cr":
        addText(line, "\n", look);
        break;
      case "noBreakHyphen":
        addText(line, "‑", look);
        break;
      case "softHyphen":
        addText(line, "­", look);
        break;
      case "sym": {
        const code = parseInt(at(el, "char") ?? "", 16);
        const font = at(el, "font") ?? undefined;
        if (!code) break;
        const hidden = isSymbolFont(font) && code < 0x100 ? code + 0xf000 : code;
        const sign = plainSymbols(String.fromCodePoint(hidden), font);
        addText(
          line,
          sign,
          isSymbolFont(font) ? { ...look, ascii: line.looks.get("")?.ascii } : { ...look, ascii: font, ansi: font },
        );
        break;
      }
      case "pgNum":
        if (env.band) addText(line, "{page}", look);
        break;
      case "fldChar":
        readField(line, el, look);
        break;
      case "instrText": {
        const field = env.fields[env.fields.length - 1];
        if (field?.stage === "code") field.code += el.textContent ?? "";
        break;
      }
      case "footnoteReference":
      case "endnoteReference": {
        if (look.hidden || silent(env)) break;
        const kind = el.localName === "footnoteReference" ? "foot" : "end";
        const mark = noteMark(doc, kind, at(el, "id") ?? "", yes(at(el, "customMarkFollows")));
        addText(line, mark, { ...look, script: "super" });
        break;
      }
      case "footnoteRef":
      case "endnoteRef":
        addText(line, env.mark ?? "", { ...look, script: "super" });
        break;
      case "ruby":
        readInline(line, kid(el, "rubyBase"));
        break;
      case "drawing":
      case "pict":
      case "object":
        if (look.hidden || silent(env)) break;
        try {
          if (el.localName === "drawing") readDrawing(line, el);
          else readVml(line, el);
        } catch {
          // A drawing that cannot be made out is left out; the words go on.
        }
        break;
      case "AlternateContent": {
        const choice = choose(el);
        if (choice) readRunParts(line, choice, look);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- equations

function mathAlign(el: Element): string {
  const side = valOf(dig(el, "oMathParaPr", "jc"));
  return side === "left" || side === "right" ? side : "center";
}

/** An equation in one line: x = (-b + √(b² - 4ac))/(2a). */
function readMath(line: Line, el: Element) {
  if (silent(line.env)) return;
  const own = find(el, "rPr");
  const look = lookOf(line, own?.namespaceURI === line.doc.main.root.namespaceURI ? own : null);
  const style = styleOf(line, { ...look, italic: false }, "Cambria Math");
  for (const run of mathRuns(mathParts(el), style)) line.pieces.push({ kind: "run", run });
}

function mathParts(el: Element | null): MathPart[] {
  return kids(el).flatMap((child): MathPart[] => {
    const inner = (name: string) => mathParts(kid(child, name));
    const prop = (holder: string, name: string) => valOf(dig(child, holder, name));
    switch (child.localName) {
      case "r": {
        const text = kids(child, "t")
          .map((t) => t.textContent ?? "")
          .join("");
        const plain = prop("rPr", "sty") === "p" || kid(kid(child, "rPr"), "nor") !== null;
        // Hyphens are minus signs here.
        return text ? [{ text: text.replace(/-/g, "\u2212"), upright: plain }] : [];
      }
      case "f": {
        const num = inner("num");
        const den = inner("den");
        if (prop("fPr", "type") === "noBar") return [...num, { text: "¦" }, ...den];
        return [...inBrackets(num), { text: "/" }, ...inBrackets(den)];
      }
      case "sSup":
        return [...inner("e"), ...raised(inner("sup"), "super")];
      case "sSub":
        return [...inner("e"), ...raised(inner("sub"), "sub")];
      case "sSubSup":
        return [...inner("e"), ...raised(inner("sub"), "sub"), ...raised(inner("sup"), "super")];
      case "sPre":
        return [...raised(inner("sub"), "sub"), ...raised(inner("sup"), "super"), ...inner("e")];
      case "rad": {
        const degree = inner("deg");
        const text = mathText(degree);
        const sign: MathPart[] =
          text === "" || text === "2"
            ? [{ text: "√" }]
            : text === "3"
              ? [{ text: "∛" }]
              : text === "4"
                ? [{ text: "∜" }]
                : [...raised(degree, "super"), { text: "√" }];
        return [...sign, ...inBrackets(inner("e"))];
      }
      case "nary": {
        const sign = prop("naryPr", "chr") ?? "∫";
        return [
          { text: sign },
          ...raised(inner("sub"), "sub"),
          ...raised(inner("sup"), "super"),
          { text: " " },
          ...inner("e"),
        ];
      }
      case "d": {
        const pr = kid(child, "dPr");
        const sign = (name: string, usual: string) => (kid(pr, name) ? (valOf(kid(pr, name)) ?? "") : usual);
        const parts = kids(child, "e").map(mathParts);
        const inside = parts.flatMap((part, i) => (i > 0 ? [{ text: sign("sepChr", "|") }, ...part] : part));
        return [{ text: sign("begChr", "(") }, ...inside, { text: sign("endChr", ")") }];
      }
      case "func":
        return [...inner("fName").map((part) => ({ ...part, upright: true })), { text: " " }, ...inner("e")];
      case "limLow":
        return [...inner("e"), ...raised(inner("lim"), "sub")];
      case "limUpp":
        return [...inner("e"), ...raised(inner("lim"), "super")];
      case "acc": {
        const sign = prop("accPr", "chr") ?? "̂";
        const parts = inner("e");
        return [...parts, { text: sign }];
      }
      case "bar":
        return inner("e").map((part) => ({
          ...part,
          text: Array.from(part.text, (letter) => letter + (prop("barPr", "pos") === "top" ? "̅" : "̲")).join(""),
        }));
      case "m":
        return kids(child, "mr").flatMap((row, i): MathPart[] => [
          ...(i > 0 ? [{ text: "; " }] : []),
          ...kids(row, "e").flatMap((cell, k): MathPart[] => [...(k > 0 ? [{ text: ", " }] : []), ...mathParts(cell)]),
        ]);
      case "eqArr":
        return kids(child, "e").flatMap((row, i): MathPart[] => [
          ...(i > 0 ? [{ text: "; " }] : []),
          ...mathParts(row),
        ]);
      case "del":
      case "moveFrom":
      case "rPr":
      case "ctrlPr":
      case "oMathParaPr":
      case "argPr":
        return [];
      default:
        return /Pr$/.test(child.localName) ? [] : mathParts(child);
    }
  });
}

// ---------------------------------------------------------------- where drawings stand

type Spot = { x: number; y: number; from: "page" | "para" };
type Ask = {
  relH: string;
  alignH: string | null;
  x: number;
  /** Instead of `x`: a share of what it is measured from. */
  shareH?: number;
  relV: string;
  alignV: string | null;
  y: number;
  shareV?: number;
};

/** The place asked for, from the page's corner, or from the column's edge and the paragraph's top. */
function placed(env: Env, w: number, h: number, ask: Ask): Spot {
  const { room } = env;
  const { margin } = room;
  const inCell = env.place === "cell";
  const across = (): [number, number] => {
    if (inCell) return [env.at, env.width];
    if (ask.relH === "page") return [0, room.w];
    if (/^(left|inside|inner)/.test(ask.relH)) return [0, margin.left];
    if (/^(right|outside|outer)/.test(ask.relH)) return [room.w - margin.right, margin.right];
    if (ask.relH === "margin") return [margin.left, room.w - margin.left - margin.right];
    return [env.at, env.width];
  };
  const down = (): [number, number] | null => {
    if (inCell) return null;
    if (ask.relV === "page") return [0, room.h];
    if (/^(top|inside|inner)/.test(ask.relV)) return [0, margin.top];
    if (/^(bottom|outside|outer)/.test(ask.relV)) return [room.h - margin.bottom, margin.bottom];
    if (ask.relV === "margin") return [margin.top, room.h - margin.top - margin.bottom];
    return null;
  };
  const line = (area: [number, number], size: number, align: string | null, offset: number) => {
    if (align === "center") return area[0] + (area[1] - size) / 2;
    if (align === "right" || align === "bottom" || align === "outside") return area[0] + area[1] - size;
    if (align === "left" || align === "top" || align === "inside") return area[0];
    return area[0] + offset;
  };
  const wide = across();
  const x = line(wide, w, ask.alignH, ask.shareH === undefined ? ask.x : ask.shareH * wide[1]);
  const area = down();
  if (area) {
    const y = line(area, h, ask.alignV, ask.shareV === undefined ? ask.y : ask.shareV * area[1]);
    return { x: round(x), y: round(y), from: "page" };
  }
  return { x: round(x - env.at), y: round(ask.alignV ? 0 : ask.y), from: "para" };
}

/** Where an anchored drawing stands. */
function anchorSpot(env: Env, anchor: Element, w: number, h: number, thing: Element): Spot {
  if (yes(at(anchor, "simplePos"))) {
    const point = kid(anchor, "simplePos");
    return { x: round(emu(at(point, "x"))), y: round(emu(at(point, "y"))), from: "page" };
  }
  const part = (name: "positionH" | "positionV") => {
    // Places given as a share of the page come wrapped, with a plain one for programs that do not know them.
    const wrapped = kids(anchor, "AlternateContent")
      .flatMap((wrap) => [kid(kid(wrap, "Choice"), name), kid(kid(wrap, "Fallback"), name)])
      .find(Boolean);
    const el = kid(anchor, name) ?? wrapped ?? null;
    const share = numberOf(kid(el, name === "positionH" ? "pctPosHOffset" : "pctPosVOffset")?.textContent?.trim());
    return {
      rel: at(el, "relativeFrom") ?? (name === "positionH" ? "column" : "paragraph"),
      align: kid(el, "align")?.textContent?.trim() || null,
      offset: emu(kid(el, "posOffset")?.textContent?.trim()),
      share: share === undefined ? undefined : share / 100000,
    };
  };
  const across = part("positionH");
  const down = part("positionV");
  const ask: Ask = {
    relH: across.rel,
    alignH: across.align,
    x: across.offset,
    shareH: across.share,
    relV: down.rel,
    alignV: down.align,
    y: down.offset,
    shareV: down.share,
  };
  const spot = placed(env, w, h, ask);
  const turn = (numberOf(at(dig(thing, "spPr", "xfrm") ?? dig(thing, "grpSpPr", "xfrm"), "rot")) ?? 0) / 60000;
  const half = ((turn % 180) + 180) % 180;
  if (half < 45 || half >= 135) return spot;
  // What lies on its side is lined up as narrow and high as it looks, but measured from where it would stand upright.
  const side = placed(env, h, w, ask);
  if (across.align) spot.x = round(side.x + (h - w) / 2);
  if (down.align) spot.y = round(side.y + (w - h) / 2);
  return spot;
}

// ---------------------------------------------------------------- drawings

/** Where one drawing goes: in the line, or at a spot. */
type Target = {
  spot: Spot | null;
  behind: boolean;
  /** In front of the words, which run on as if it were not there. */
  free?: boolean;
  alt?: string;
  /** Drawn over those with less. */
  z: number;
};

function readDrawing(line: Line, drawing: Element) {
  for (const holder of kids(drawing)) {
    if (holder.localName !== "inline" && holder.localName !== "anchor") continue;
    const about = kid(holder, "docPr");
    if (yes(at(about, "hidden"))) continue;
    const size = kid(holder, "extent");
    const w = shareOf(line.env.room, kid(holder, "sizeRelH")) ?? emu(at(size, "cx"));
    const h = shareOf(line.env.room, kid(holder, "sizeRelV")) ?? emu(at(size, "cy"));
    const thing = dig(holder, "graphic", "graphicData")?.firstElementChild;
    if (!thing) continue;
    const anchored = holder.localName === "anchor";
    const spot = anchored ? anchorSpot(line.env, holder, w, h, thing) : null;
    const target: Target = {
      spot,
      behind: anchored && yes(at(holder, "behindDoc")),
      free: anchored && kid(holder, "wrapNone") !== null,
      alt: at(about, "descr")?.trim() || undefined,
      z: numberOf(at(holder, "relativeHeight")) ?? 0,
    };
    if (anchored && spot && !target.behind) {
      const stands = thing.localName === "pic" && spot.from === "para" && kid(holder, "wrapTopAndBottom") !== null;
      const image = stands && line.env.place === "body" ? pictureOf(line, thing, { x: 0, y: 0, w, h }) : null;
      if (image) {
        const after = emu(at(holder, "distB"));
        if (target.alt) image.alt = target.alt;
        line.pieces.push({ kind: "stand", image, x: spot.x, before: spot.y, after, below: spot.y >= 24 });
        continue;
      }
      // Pictures the words run beside, or not, are kept clear of when they are laid out; shapes are not.
      if (thing.localName !== "pic") makeRoom(line, holder, spot, w, h);
    }
    draw(line, thing, { x: 0, y: 0, w, h }, target);
  }
}

/** A size given as a share of the page or its margins; null when it is a plain one. */
function shareOf({ w, h, margin }: Room, el: Element | null): number | null {
  const share = numberOf(el?.textContent?.trim()) ?? 0;
  if (!el || share <= 0) return null;
  const across = el.localName === "sizeRelH";
  const from = at(el, "relativeFrom") ?? "page";
  const whole =
    from === "margin"
      ? across
        ? w - margin.left - margin.right
        : h - margin.top - margin.bottom
      : /^(left|inside)/.test(from)
        ? margin.left
        : /^(right|outside)/.test(from)
          ? margin.right
          : /^top/.test(from)
            ? margin.top
            : /^bottom/.test(from)
              ? margin.bottom
              : across
                ? w
                : h;
  return (whole * share) / 100000;
}

/** Shapes that words do not run beside push them down, others push them aside. */
function makeRoom(line: Line, anchor: Element, spot: Spot, w: number, h: number) {
  const { env } = line;
  const around = kid(anchor, "wrapSquare") || kid(anchor, "wrapTight") || kid(anchor, "wrapThrough");
  // Word needs an inch beside a picture to put words there.
  const x = spot.from === "page" ? spot.x - env.at : spot.x;
  const beside = Math.max(x, env.width - x - w) >= 72 && at(around, "wrapText") !== "none";
  if (around && beside && env.place === "body") {
    const spacer = spacerFor(groundOf(env), spot, w, h);
    if (spacer && spacer !== "below") line.pieces.push({ kind: "run", run: { image: spacer } });
    if (spacer !== "below") return;
  }
  if (!kid(anchor, "wrapTopAndBottom") && !around) return;
  const end = spot.y + h + emu(at(anchor, "distB"));
  if (spot.from === "para" && spot.y > -h && spot.y < 24) line.push = Math.max(line.push, end);
  const top = env.room.margin.top;
  if (spot.from === "page" && env.top && spot.y < top + 36 && end > top) line.push = Math.max(line.push, end - top);
}

const groundOf = ({ at, width, room, top }: Env) => ({
  at,
  width,
  top: room.margin.top,
  high: room.h,
  first: Boolean(top),
});

/** A picture, a shape, or a group of them. `frame` is its place within what is being drawn. */
function draw(line: Line, el: Element, frame: Frame, target: Target) {
  switch (el.localName) {
    case "pic": {
      const image = pictureOf(line, el, frame);
      if (image) addImage(line, { ...image, ...(target.alt && { alt: target.alt }) }, frame, target);
      break;
    }
    case "wsp":
    case "sp":
      drawShape(line, el, frame, target);
      break;
    case "wgp":
    case "grpSp":
    case "wpc":
    case "spTree": {
      const xfrm = dig(el, "grpSpPr", "xfrm");
      const off = kid(xfrm, "chOff");
      const ext = kid(xfrm, "chExt");
      const own = kid(xfrm, "ext");
      const wide = emu(at(ext, "cx")) || emu(at(own, "cx")) || frame.w;
      const high = emu(at(ext, "cy")) || emu(at(own, "cy")) || frame.h;
      const sx = frame.w / (wide || 1);
      const sy = frame.h / (high || 1);
      for (const child of kids(el)) {
        const place = dig(child, "spPr", "xfrm") ?? dig(child, "grpSpPr", "xfrm") ?? kid(child, "xfrm");
        if (!place || child.localName === "grpSpPr") continue;
        const point = kid(place, "off");
        const size = kid(place, "ext");
        draw(
          line,
          child,
          {
            x: frame.x + (emu(at(point, "x")) - emu(at(off, "x"))) * sx,
            y: frame.y + (emu(at(point, "y")) - emu(at(off, "y"))) * sy,
            w: emu(at(size, "cx")) * sx,
            h: emu(at(size, "cy")) * sy,
          },
          { ...target, spot: target.spot ?? inlineSpot(line, frame), alt: undefined },
        );
      }
      if (!target.spot) line.tall = Math.max(line.tall, frame.h);
      break;
    }
    case "relIds":
      drawDiagram(line, el, frame, target);
      break;
  }
}

/** A drawing in the line that cannot be one letter of it: it floats, and the line keeps its height. */
function inlineSpot(line: Line, frame: Frame): Spot {
  const { look } = line.set;
  const room = line.env.width - (look.left ?? 0) - (look.right ?? 0);
  const x = /^(center)$/.test(look.align ?? "")
    ? (room - frame.w) / 2
    : /^(right|end)$/.test(look.align ?? "")
      ? room - frame.w
      : 0;
  return { x: round((look.left ?? 0) + Math.max(0, x)), y: 0, from: "para" };
}

function addImage(line: Line, image: FlowImage, frame: Frame, { spot, behind, free, z }: Target) {
  if (image.w < 0.2 || image.h < 0.2) return;
  if (spot) {
    const under = behind || free;
    image.float = {
      x: round(spot.x + frame.x),
      y: round(spot.y + frame.y),
      from: spot.from,
      ...(under && { behind: true }),
    };
    if (free && !behind) line.doc.over.set(image, z);
  }
  line.pieces.push({ kind: "run", run: { image } });
}

function pictureById(line: Line, id: string | null): Picture | undefined {
  const rel = id ? line.env.part.rels.get(id) : undefined;
  return rel && !rel.outside ? line.doc.pictures.get(rel.target) : undefined;
}

function cropOf(rect: Element | null): FlowImage["crop"] {
  const part = (name: string) => {
    const value = at(rect, name) ?? "0";
    return Math.max(0, value.endsWith("%") ? parseFloat(value) / 100 : (numberOf(value) ?? 0) / 100000);
  };
  const x = part("l");
  const y = part("t");
  const w = 1 - x - part("r");
  const h = 1 - y - part("b");
  if (w <= 0.001 || h <= 0.001 || (x < 0.0005 && y < 0.0005 && w > 0.9995 && h > 0.9995)) return undefined;
  return { x: round(x, 5), y: round(y, 5), w: round(w, 5), h: round(h, 5) };
}

function pictureOf(line: Line, pic: Element, frame: Frame): FlowImage | null {
  const fill = kid(pic, "blipFill");
  const blip = kid(fill, "blip");
  const picture = pictureById(line, at(blip, "embed")) ?? pictureById(line, at(find(blip, "svgBlip"), "embed"));
  if (!picture) return null;
  const image: FlowImage = { bytes: picture.bytes, mime: picture.mime, w: round(frame.w), h: round(frame.h) };
  const crop = cropOf(kid(fill, "srcRect"));
  const turn = (numberOf(at(dig(pic, "spPr", "xfrm"), "rot")) ?? 0) / 60000;
  if (crop) image.crop = crop;
  if (Math.abs(turn) > 0.05) image.angle = round(turn);
  return image;
}

// ---------------------------------------------------------------- shapes

function paintOf(doc: Doc, el: Element, stand?: string | null): Paint | null {
  switch (el.localName) {
    case "solidFill": {
      const color = onPaper(drawnColor(doc, el, stand));
      return color ? { color } : null;
    }
    case "gradFill": {
      const stops = kids(kid(el, "gsLst"), "gs")
        .flatMap((stop): [number, string][] => {
          const color = onPaper(drawnColor(doc, stop, stand));
          return color ? [[(numberOf(at(stop, "pos")) ?? 0) / 100000, color]] : [];
        })
        .sort((a, b) => a[0] - b[0]);
      const angle = (numberOf(at(kid(el, "lin"), "ang")) ?? 0) / 60000;
      return runThrough(stops, { angle, radial: kid(el, "path") !== null });
    }
    case "pattFill": {
      const ink = onPaper(drawnColor(doc, kid(el, "fgClr"), stand));
      const paper = onPaper(drawnColor(doc, kid(el, "bgClr"), stand));
      const share = /^pct(\d+)$/.exec(at(el, "prst") ?? "");
      const color = ink && paper ? blend(ink, paper, share ? Number(share[1]) / 100 : 0.3) : (paper ?? ink);
      return color ? { color } : null;
    }
    // The texture of a theme: its colour says the most about it.
    case "blipFill":
      return stand ? { color: stand } : null;
  }
  return null;
}

function fillOf(doc: Doc, spPr: Element | null, style: Element | null): Paint | null {
  for (const el of kids(spPr)) {
    if (el.localName === "noFill" || el.localName === "blipFill") return null;
    if (/^(solid|grad|patt)Fill$/.test(el.localName)) return paintOf(doc, el);
  }
  const ref = kid(style, "fillRef");
  const index = numberOf(at(ref, "idx")) ?? 0;
  if (!ref || index <= 0 || index === 1000) return null;
  const stand = onPaper(drawnColor(doc, ref));
  const ready = index > 1000 ? doc.theme.backs[index - 1001] : doc.theme.fills[index - 1];
  return (ready ? paintOf(doc, ready, stand) : null) ?? (stand ? { color: stand } : null);
}

function strokeOf(doc: Doc, spPr: Element | null, style: Element | null): FlowLine | null {
  const ln = kid(spPr, "ln");
  if (kid(ln, "noFill")) return null;
  const ref = kid(style, "lnRef");
  const index = numberOf(at(ref, "idx")) ?? 0;
  const color =
    onPaper(drawnColor(doc, kid(ln, "solidFill"))) ??
    onPaper(drawnColor(doc, kid(kid(ln, "gradFill"), "gsLst")?.firstElementChild ?? null)) ??
    (ref && index > 0 ? onPaper(drawnColor(doc, ref)) : null);
  if (!color) return null;
  const own = at(ln, "w");
  const line: FlowLine = {
    color,
    width: round(own !== null ? emu(own) || 0.25 : (doc.theme.lines[index - 1] ?? 0.75)),
  };
  const dash = valOf(kid(ln, "prstDash")) ?? "solid";
  if (/dot$/i.test(dash) && !/dash/i.test(dash)) line.dash = "dot";
  else if (dash !== "solid") line.dash = "dash";
  return line;
}

function drawShape(line: Line, el: Element, own: Frame, target: Target) {
  const { doc, env } = line;
  const spPr = kid(el, "spPr");
  const style = kid(el, "style");
  const body = kid(el, "bodyPr") ?? dig(el, "txBody", "bodyPr");
  const xfrm = kid(spPr, "xfrm");
  const paint = fillOf(doc, spPr, style);
  const fill = paint?.color ?? null;
  const stroke = strokeOf(doc, spPr, style);
  const geometry = kid(spPr, "custGeom");
  const preset = at(kid(spPr, "prstGeom"), "prst") ?? "rect";
  const isLine = /^(line|straightConnector1)$/.test(preset) && !geometry;
  const ink = onPaper(drawnColor(doc, kid(style, "fontRef")));
  // Boxes cannot be turned, but what lies on its side or stands on its head can be drawn all the same.
  const turn = ((((numberOf(at(xfrm, "rot")) ?? 0) / 60000) % 360) + 360) % 360;
  const flips = { flipH: yes(at(xfrm, "flipH")), flipV: yes(at(xfrm, "flipV")) };
  const quarters = quartersOf(turn);
  const onItsSide = quarters !== null && quarters % 2 === 1 && !geometry;
  const frame = onItsSide ? onSide(own) : own;
  const shape = isLine ? preset : turnedShape(preset, quarters ?? 0, flips);
  const angle = Math.abs(turn) > 0.05 ? { angle: round(turn) } : {};
  const where = { ...target, spot: target.spot ?? inlineSpot(line, frame) };
  if (!target.spot) line.tall = Math.max(line.tall, frame.h);

  const words = dig(el, "txbx", "txbxContent");
  const picture = pictureById(line, at(dig(spPr, "blipFill", "blip"), "embed"));
  if (picture) {
    const crop = cropOf(dig(spPr, "blipFill", "srcRect"));
    const size = { w: round(own.w), h: round(own.h) };
    const worded = words !== null || kid(el, "txBody") !== null;
    const image = { bytes: picture.bytes, mime: picture.mime, ...size, ...(crop && { crop }), ...angle };
    addImage(line, image, own, worded ? { ...where, behind: true } : where);
  }
  const inset = (name: string, usual: number) => (at(body, name) === null ? usual : emu(at(body, name)));
  const pad = { l: inset("lIns", 7.2), t: inset("tIns", 3.6), r: inset("rIns", 7.2), b: inset("bIns", 3.6) };
  const blocks = words
    ? boxParas(line, words, { fill, ink, width: own.w - pad.l - pad.r })
    : drawnText(line, kid(el, "txBody"), ink);

  const [start, end] = ["headEnd", "tailEnd"].map(
    (name) => (at(kid(kid(spPr, "ln"), name), "type") ?? "none") !== "none",
  );
  if ((isLine || (/^(bent|curved)Connector[2-5]$/.test(preset) && !geometry)) && stroke) {
    const adjust = kids(dig(spPr, "prstGeom", "avLst")).map(
      (gd) => numberOf(at(gd, "fmla")?.replace(/^val\s+/, "")) ?? 50000,
    );
    const how = { kind: preset, ...flips, start, end, adjust: adjust.map((value) => value / 100000), turn };
    drawLine(line, own, target, stroke, how);
    return;
  }
  if (geometry && (fill || stroke) && !picture) {
    const image = outlineImage(geometry, own, paint, stroke, flips);
    if (image) {
      const worded = !isBlank(blocks);
      const reach = (stroke?.width ?? 0) / 2;
      const around = { ...own, x: own.x - reach, y: own.y - reach };
      addImage(line, { ...image, ...angle }, around, worded ? { ...where, behind: true } : where);
      if (worded) addBox(line, own, where, { blocks, valign: anchorOf(body), pad });
      return;
    }
  }
  const empty = isBlank(blocks);
  if (!fill && !stroke && empty) return;
  // Cells and boxes hold no shapes, and colours that run into each other are drawn.
  const boxless = env.place === "cell" || env.place === "box";
  // A box is put down with its paragraph, so one that lies behind words further up has to be a picture.
  const late = where.behind && where.spot.from === "page" && env.place === "body" && !env.top;
  if (empty && (boxless || ((paint?.stops || quarters === null || late) && SIMPLE.test(shape)))) {
    const image = shapeImage(shape, own, paint, stroke);
    if (image) addImage(line, { ...image, ...angle }, own, boxless ? target : where);
    return;
  }
  const vert = at(body, "vert");
  const way = onItsSide ? (quarters === 1 ? 90 : 270) : vert === "vert" ? 90 : vert === "vert270" ? 270 : null;
  // The room around the words turns with them.
  const around = onItsSide ? turnedPad(pad, quarters) : pad;
  const turned = way && !empty && !boxless ? turnedWords(blocks, frame, around, way, anchorOf(body) ?? "top") : null;
  if (turned) {
    if (fill || stroke)
      addBox(line, frame, where, {
        shape: shape === "rect" ? undefined : shape,
        blocks: [],
        fill: fill ?? undefined,
        stroke: stroke ?? undefined,
      });
    addImage(line, turned.image, { ...frame, x: frame.x + turned.x, y: frame.y + turned.y }, where);
    return;
  }
  addBox(line, frame, where, {
    shape: shape === "rect" ? undefined : shape,
    blocks: empty ? [] : blocks,
    fill: fill ?? undefined,
    stroke: stroke ?? undefined,
    valign: anchorOf(body),
    pad,
  });
}

function anchorOf(body: Element | null): FlowBox["valign"] {
  // A box that fits its words has no room to move them in, whatever height was noted last.
  const value = kid(body, "spAutoFit") ? "t" : at(body, "anchor");
  return value === "ctr" ? "middle" : value === "b" ? "bottom" : "top";
}

/** The paragraphs of a text box. */
function boxParas(
  line: Line,
  content: Element,
  { fill, ink, width }: { fill: string | null; ink: string | null; width: number },
): FlowPara[] {
  const { doc, env } = line;
  const inside: Env = {
    ...env,
    place: "box",
    at: 0,
    width: Math.max(10, width),
    fields: [],
    lost: lostFields(content),
    table: undefined,
    back: fill ?? undefined,
    ink: ink ?? undefined,
  };
  return onlyParas(doc.traits, readBlocks(doc, content, inside));
}

function addBox(
  line: Line,
  frame: Frame,
  { spot, z }: Target,
  box: Pick<FlowBox, "shape" | "blocks" | "fill" | "stroke" | "valign"> & { pad?: Pad },
) {
  if (!spot) return;
  let { x, y, w, h } = { x: spot.x + frame.x, y: spot.y + frame.y, w: frame.w, h: frame.h };
  const { pad, blocks } = box;
  if (pad && blocks.length > 0) {
    if (!box.fill && !box.stroke) {
      // Nothing of the box itself is seen: what counts is where the words are.
      x += pad.l;
      y += pad.t;
      w = Math.max(1, w - pad.l - pad.r);
      h = Math.max(1, h - pad.t - pad.b);
    } else {
      // A seen box keeps its words as far from the edge as Word usually does; other distances are added.
      const left = round(pad.l - 7.2);
      const right = round(pad.r - 7.2);
      for (const para of blocks) {
        if (Math.abs(left) > 0.2) para.left = round((para.left ?? 0) + left);
        if (Math.abs(right) > 0.2) para.right = round((para.right ?? 0) + right);
      }
      const last = blocks[blocks.length - 1];
      if (pad.t > 3.8) blocks[0].before = round((blocks[0].before ?? 0) + pad.t - 3.6);
      if (pad.b > 3.8) last.after = round((last.after ?? 0) + pad.b - 3.6);
    }
  }
  const out: FlowBox = { kind: "box", x: round(x), y: round(y), from: spot.from, w: round(w), h: round(h), blocks };
  if (box.shape) out.shape = box.shape;
  if (box.fill) out.fill = box.fill;
  if (box.stroke) out.stroke = box.stroke;
  if (box.valign && box.valign !== "top") out.valign = box.valign;
  line.pieces.push({ kind: "box", box: out, z });
}

/** Words of shapes that were drawn elsewhere, as in diagrams. */
function drawnText(line: Line, body: Element | null, ink: string | null): FlowPara[] {
  const paras: FlowPara[] = [];
  for (const p of kids(body, "p")) {
    const runs: FlowRun[] = [];
    const usual = line.doc.base.run.ascii ?? "Calibri";
    for (const r of kids(p)) {
      const text = r.localName === "br" ? "\n" : (kid(r, "t")?.textContent ?? "");
      if (!text) continue;
      const rPr = kid(r, "rPr");
      const color = onPaper(drawnColor(line.doc, kid(rPr, "solidFill"))) ?? ink;
      const face = at(kid(rPr, "latin"), "typeface");
      const style: FlowStyle = {
        font: face && !face.startsWith("+") ? face : usual,
        size: round((numberOf(at(rPr, "sz")) ?? 1100) / 100),
      };
      if (color) style.color = color;
      if (yes(at(rPr, "b"))) style.bold = true;
      if (yes(at(rPr, "i"))) style.italic = true;
      runs.push({ text, style });
    }
    if (runs.length === 0) continue;
    const side = at(kid(p, "pPr"), "algn");
    const para: FlowPara = { kind: "para", runs: joinRuns(runs), before: 0, after: 0, line: { times: 1 } };
    if (side === "ctr") para.align = "center";
    else if (side === "r") para.align = "right";
    else if (side === "just") para.align = "justify";
    paras.push(para);
  }
  return paras;
}

/** A diagram comes with a drawing of how it looked last. */
function drawDiagram(line: Line, el: Element, frame: Frame, target: Target) {
  const { doc, env } = line;
  const data = doc.parts.get(env.part.rels.get(at(el, "dm") ?? "")?.target ?? "");
  const id = data ? at(find(data.root, "dataModelExt"), "relId") : null;
  const drawn = doc.parts.get(env.part.rels.get(id ?? "")?.target ?? "");
  const tree = kid(drawn?.root, "spTree");
  if (!tree || !drawn) return;
  const inside: Line = { ...line, env: { ...env, part: drawn } };
  const spot = target.spot ?? inlineSpot(line, frame);
  for (const shape of kids(tree, "sp")) {
    const xfrm = dig(shape, "spPr", "xfrm");
    const off = kid(xfrm, "off");
    const ext = kid(xfrm, "ext");
    draw(
      inside,
      shape,
      { x: frame.x + emu(at(off, "x")), y: frame.y + emu(at(off, "y")), w: emu(at(ext, "cx")), h: emu(at(ext, "cy")) },
      { ...target, spot },
    );
  }
  if (!target.spot) line.tall = Math.max(line.tall, frame.h);
}

// ---------------------------------------------------------------- shapes as pictures

/** Freely drawn outlines have no name the editor knows, so they come as pictures. */
function outlineImage(
  geometry: Element,
  frame: Frame,
  paint: Paint | null,
  stroke: FlowLine | null,
  flip: { flipH: boolean; flipV: boolean },
): FlowImage | null {
  const { w, h } = frame;
  // The line is drawn half outside.
  const reach = (stroke?.width ?? 0) / 2;
  const paths = kids(kid(geometry, "pathLst"), "path");
  const guides = guideValues(geometry, frame);
  const numberAt = (text: string | null) => numberOf(text) ?? guides.get(text ?? "") ?? NaN;
  const shapes = paths.map((path) => {
    const sx = w / (numberOf(at(path, "w")) || emuOf(frame.w));
    const sy = h / (numberOf(at(path, "h")) || emuOf(frame.h));
    const outline = new Path2D();
    let here: [number, number] = [0, 0];
    let sound = true;
    for (const step of kids(path)) {
      const points = kids(step, "pt").map((pt): [number, number] => [
        numberAt(at(pt, "x")) * sx,
        numberAt(at(pt, "y")) * sy,
      ]);
      if (points.flat().some((value) => !Number.isFinite(value))) sound = false;
      const [a, b, c] = points;
      if (step.localName === "moveTo" && a) outline.moveTo(...(here = a));
      else if (step.localName === "lnTo" && a) outline.lineTo(...(here = a));
      else if (step.localName === "cubicBezTo" && a && b && c) {
        outline.bezierCurveTo(...a, ...b, ...c);
        here = c;
      } else if (step.localName === "quadBezTo" && a && b) {
        outline.quadraticCurveTo(...a, ...b);
        here = b;
      } else if (step.localName === "arcTo") {
        const rx = numberAt(at(step, "wR")) * sx;
        const ry = numberAt(at(step, "hR")) * sy;
        const from = (numberAt(at(step, "stAng")) / 60000 / 180) * Math.PI;
        const sweep = (numberAt(at(step, "swAng")) / 60000 / 180) * Math.PI;
        if (![rx, ry, from, sweep].every(Number.isFinite)) sound = false;
        else {
          const cx = here[0] - rx * Math.cos(from);
          const cy = here[1] - ry * Math.sin(from);
          outline.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, from, from + sweep, sweep < 0);
          here = [cx + rx * Math.cos(from + sweep), cy + ry * Math.sin(from + sweep)];
        }
      } else if (step.localName === "close") outline.closePath();
    }
    return {
      outline,
      sound,
      filled: at(path, "fill") !== "none",
      lined: !/^(0|false)$/.test(at(path, "stroke") ?? "1"),
    };
  });
  if (shapes.length === 0 || shapes.some((shape) => !shape.sound)) return null;
  return paintImage(Math.max(0.5, w + reach * 2), Math.max(0.5, h + reach * 2), (pen) => {
    pen.translate(reach, reach);
    if (flip.flipH || flip.flipV) {
      pen.translate(flip.flipH ? w : 0, flip.flipV ? h : 0);
      pen.scale(flip.flipH ? -1 : 1, flip.flipV ? -1 : 1);
    }
    for (const { outline, filled, lined } of shapes) {
      if (paint && filled) {
        pen.fillStyle = fillStyle(pen, paint, w, h);
        pen.fill(outline, "evenodd");
      }
      if (stroke && lined) strokeWith(pen, stroke, outline);
    }
  });
}

const emuOf = (points: number) => Math.max(1, Math.round(points * 12700));

/** The few names an outline may use for its own measures. */
function guideValues(geometry: Element, frame: Frame): Map<string, number> {
  const w = emuOf(frame.w);
  const h = emuOf(frame.h);
  const out = new Map<string, number>([
    ["l", 0],
    ["t", 0],
    ["r", w],
    ["b", h],
    ["w", w],
    ["h", h],
    ["hc", w / 2],
    ["vc", h / 2],
    ["wd2", w / 2],
    ["hd2", h / 2],
    ["ss", Math.min(w, h)],
    ["ls", Math.max(w, h)],
    ["cd4", 5400000],
    ["cd2", 10800000],
    ["3cd4", 16200000],
  ]);
  const value = (text: string | undefined) => numberOf(text) ?? out.get(text ?? "") ?? 0;
  for (const el of kids(kid(geometry, "gdLst"), "gd")) {
    const [kind, ...args] = (at(el, "fmla") ?? "").split(/\s+/);
    const [a, b, c] = args.map(value);
    const result =
      kind === "val"
        ? a
        : kind === "*/"
          ? (a * b) / (c || 1)
          : kind === "+-"
            ? a + b - c
            : kind === "+/"
              ? (a + b) / (c || 1)
              : kind === "?:"
                ? a > 0
                  ? b
                  : c
                : kind === "max"
                  ? Math.max(a, b)
                  : kind === "min"
                    ? Math.min(a, b)
                    : kind === "pin"
                      ? Math.min(Math.max(a, b), c)
                      : kind === "sqrt"
                        ? Math.sqrt(a)
                        : kind === "abs"
                          ? Math.abs(a)
                          : NaN;
    out.set(at(el, "name") ?? "", result);
  }
  return out;
}

type Stroke = {
  kind: string;
  flipH: boolean;
  flipV: boolean;
  start: boolean;
  end: boolean;
  adjust?: number[];
  turn: number;
};

/** Lines the editor has a shape for are that. Arrows that point another way than its own, elbows and curves are pictures. */
function drawLine(line: Line, own: Frame, target: Target, stroke: FlowLine, how: Stroke) {
  const straight = /^(line|straightConnector1)$/.test(how.kind);
  const { frame, flipH, flipV } = straight
    ? turnLine(own, how, how.turn)
    : { frame: own, flipH: how.flipH, flipV: how.flipV };
  const boxless = line.env.place === "cell" || line.env.place === "box";
  const back = flipH || (flipV && frame.h > 0.5);
  if (straight && !boxless && !how.start && !(how.end && back)) {
    const up = flipH !== flipV && frame.w > 0.5 && frame.h > 0.5;
    const spot = target.spot ?? inlineSpot(line, frame);
    addBox(
      line,
      frame,
      { ...target, spot },
      { shape: how.end ? "arrow" : up ? "lineInv" : "line", stroke, blocks: [] },
    );
    return;
  }
  const corners = connectorCorners(how.kind, frame.w, frame.h, how.adjust).map(({ x, y }) => ({
    x: flipH ? frame.w - x : x,
    y: flipV ? frame.h - y : y,
  }));
  const made = lineImage(corners, stroke, { start: how.start, end: how.end, curved: how.kind.startsWith("curved") });
  if (!made) return;
  const angle = straight || Math.abs(how.turn) < 0.05 ? {} : { angle: round(how.turn) };
  const { edge } = made;
  addImage(line, { ...made.image, ...angle }, { ...frame, x: frame.x - edge, y: frame.y - edge }, target);
}

// ---------------------------------------------------------------- the drawings of older files

const VML_SHAPES: Record<string, string> = {
  "1": "rect",
  "2": "roundRect",
  "3": "ellipse",
  "4": "diamond",
  "5": "triangle",
  "6": "rtTriangle",
  "7": "parallelogram",
  "8": "trapezoid",
  "9": "hexagon",
  "10": "octagon",
  "11": "plus",
  "12": "star5",
  "13": "rightArrow",
  "15": "homePlate",
  "16": "cube",
  "20": "line",
  "22": "can",
  "32": "line",
  "55": "chevron",
  "56": "pentagon",
  "61": "wedgeRectCallout",
  "62": "wedgeRoundRectCallout",
  "63": "wedgeEllipseCallout",
  "66": "leftArrow",
  "67": "downArrow",
  "68": "upArrow",
  "69": "leftRightArrow",
  "70": "upDownArrow",
  "74": "heart",
  "84": "bevel",
  "85": "leftBracket",
  "86": "rightBracket",
  "87": "leftBrace",
  "88": "rightBrace",
  "96": "smileyFace",
  "109": "flowChartProcess",
  "110": "flowChartDecision",
  "111": "flowChartInputOutput",
  "114": "flowChartDocument",
  "116": "flowChartTerminator",
  "117": "flowChartPreparation",
  "120": "flowChartConnector",
  "176": "flowChartAlternateProcess",
  "183": "sun",
  "184": "moon",
};

function cssOf(el: Element): Map<string, string> {
  return new Map(
    (at(el, "style") ?? "").split(";").flatMap((rule) => {
      const colon = rule.indexOf(":");
      return colon > 0
        ? [[rule.slice(0, colon).trim().toLowerCase(), rule.slice(colon + 1).trim()] as [string, string]]
        : [];
    }),
  );
}

function vmlColor(text: string | null): string | null {
  const value = (text ?? "").trim();
  const hex = /^#([0-9a-f]{6})\b/i.exec(value)?.[1];
  if (hex) return hexOf(hex);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])\b/i.exec(value);
  if (short)
    return hexOf(
      short
        .slice(1)
        .map((digit) => digit + digit)
        .join(""),
    );
  return namedColor(value.split(/[\s[(]/)[0]);
}

/** "6554f", ".1" and "10%" all say a tenth. */
function vmlShare(text: string | null): number {
  const value = numberOf(text) ?? 0;
  return text?.endsWith("f") ? value / 65536 : text?.endsWith("%") ? value / 100 : value;
}

function readVml(line: Line, holder: Element) {
  for (const el of kids(holder)) drawVml(line, el, null);
}

/** `group`: how the numbers of a group's parts become points, and where the group stands. */
function drawVml(line: Line, el: Element, group: { frame: Frame; target: Target } | null) {
  if (!/^(shape|rect|roundrect|oval|line|polyline|group|image|arc|curve)$/.test(el.localName)) return;
  const css = cssOf(el);
  if (css.get("visibility") === "hidden") return;
  const { env } = line;
  const length = (name: string) => lengthOf(css.get(name), 0.75) ?? 0;
  let frame: Frame;
  let target: Target;
  if (group) {
    frame = group.frame;
    target = group.target;
  } else {
    let w = length("width");
    let h = length("height");
    let x = length("margin-left") || length("left");
    let y = length("margin-top") || length("top");
    if (el.localName === "line") {
      const [x1, y1] = (at(el, "from") ?? "0,0").split(",").map((part) => lengthOf(part, 0.75) ?? 0);
      const [x2, y2] = (at(el, "to") ?? "0,0").split(",").map((part) => lengthOf(part, 0.75) ?? 0);
      x += Math.min(x1, x2);
      y += Math.min(y1, y2);
      w = Math.abs(x2 - x1);
      h = Math.abs(y2 - y1);
    }
    if (yes(at(el, "hr"))) {
      const color = vmlColor(at(el, "fillcolor"));
      line.pieces.push({ kind: "rule", color: color ?? "#a0a0a0", width: round(Math.min(6, h || 1.5)) });
      return;
    }
    frame = { x: 0, y: 0, w, h };
    const floats = css.get("position") === "absolute" || el.localName === "line";
    const relative = (name: string) => (css.get(name) ?? "text").replace(/-margin-area$/, "Margin");
    const side = (name: string) => {
      const value = css.get(name);
      return value && value !== "absolute" ? value : null;
    };
    target = {
      spot: floats
        ? placed(env, w, h, {
            relH: relative("mso-position-horizontal-relative"),
            alignH: side("mso-position-horizontal"),
            x,
            relV: relative("mso-position-vertical-relative"),
            alignV: side("mso-position-vertical"),
            y,
          })
        : null,
      behind: (css.get("z-index") ?? "").startsWith("-"),
      free: floats && (at(kid(el, "wrap"), "type") ?? "none") === "none",
      alt: at(el, "alt")?.trim() || undefined,
      z: numberOf(css.get("z-index")) ?? 0,
    };
  }
  if (el.localName === "group") {
    const [gw, gh] = (at(el, "coordsize") ?? "1000,1000").split(",").map(Number);
    const [gx, gy] = (at(el, "coordorigin") ?? "0,0").split(",").map((part) => Number(part) || 0);
    const sx = frame.w / (gw || 1000);
    const sy = frame.h / (gh || 1000);
    const spot = target.spot ?? inlineSpot(line, frame);
    if (!target.spot) line.tall = Math.max(line.tall, frame.h);
    for (const child of kids(el)) {
      const rules = cssOf(child);
      const plain = (name: string) => parseFloat(rules.get(name) ?? "0") || 0;
      let [cx, cy, cw, ch] = [plain("left"), plain("top"), plain("width"), plain("height")];
      if (child.localName === "line") {
        const [x1, y1] = (at(child, "from") ?? "0,0").split(",").map(parseFloat);
        const [x2, y2] = (at(child, "to") ?? "0,0").split(",").map(parseFloat);
        [cx, cy, cw, ch] = [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      }
      const inside = { x: frame.x + (cx - gx) * sx, y: frame.y + (cy - gy) * sy, w: cw * sx, h: ch * sy };
      drawVml(line, child, { frame: inside, target: { ...target, spot } });
    }
    return;
  }
  const turn = parseFloat(css.get("rotation") ?? "0") || 0;
  const typed = find(line.env.part.root, "shapetype") ? shapeTypeOf(line, at(el, "type")) : null;
  const flag = (name: string, usual: boolean) => {
    const own = at(el, name) ?? at(typed, name);
    return own === null ? usual : !/^(f|false|0)$/i.test(own);
  };
  const data = kid(el, "imagedata");
  const picture = pictureById(line, at(data, "id") ?? at(data, "relid") ?? at(data, "pict"));
  if (data) {
    if (!picture) return;
    const image: FlowImage = { bytes: picture.bytes, mime: picture.mime, w: round(frame.w), h: round(frame.h) };
    const [l, t, r, b] = ["cropleft", "croptop", "cropright", "cropbottom"].map((name) =>
      Math.max(0, vmlShare(at(data, name))),
    );
    if (l + t + r + b > 0.001 && l + r < 0.999 && t + b < 0.999)
      image.crop = { x: round(l, 5), y: round(t, 5), w: round(1 - l - r, 5), h: round(1 - t - b, 5) };
    if (turn) image.angle = round(turn);
    if (target.alt) image.alt = target.alt;
    addImage(line, image, frame, target);
    return;
  }
  const words = at(kid(el, "textpath"), "string");
  if (words) {
    const image = wordArt(words, cssOf(kid(el, "textpath") as Element), frame, {
      fill: flag("filled", true) ? (vmlColor(at(el, "fillcolor")) ?? "#000000") : null,
      alpha: at(kid(el, "fill"), "opacity") ? vmlShare(at(kid(el, "fill"), "opacity")) : 1,
      stroke: flag("stroked", true) ? (vmlColor(at(el, "strokecolor")) ?? "#000000") : null,
    });
    if (image) addImage(line, { ...image, ...(turn && { angle: round(turn) }), alt: words }, frame, target);
    return;
  }
  const alpha = at(kid(el, "fill"), "opacity") ? vmlShare(at(kid(el, "fill"), "opacity")) : 1;
  const raw = flag("filled", el.localName !== "line")
    ? (vmlColor(at(el, "fillcolor") ?? at(typed, "fillcolor")) ?? "#ffffff")
    : null;
  const fill = raw && alpha < 0.999 ? blend(raw, "#ffffff", alpha) : raw;
  const width = lengthOf(at(el, "strokeweight"), 0.75) ?? 0.75;
  const dash = at(kid(el, "stroke"), "dashstyle") ?? "solid";
  const stroke: FlowLine | null = flag("stroked", true)
    ? {
        color: vmlColor(at(el, "strokecolor")) ?? "#000000",
        width: round(Math.max(0.25, width)),
        ...(/dot$/i.test(dash) ? { dash: "dot" as const } : dash !== "solid" ? { dash: "dash" as const } : {}),
      }
    : null;
  const box = kid(el, "textbox");
  const content = kid(box, "txbxContent");
  const sides = (at(box, "inset") ?? "").split(",").map((part) => lengthOf(part, 0.75));
  const pad = { l: sides[0] ?? 7.2, t: sides[1] ?? 3.6, r: sides[2] ?? 7.2, b: sides[3] ?? 3.6 };
  const blocks = content ? boxParas(line, content, { fill, ink: null, width: frame.w - pad.l - pad.r }) : [];
  const number = /_t(\d+)$/.exec(at(el, "type") ?? "")?.[1] ?? at(el, "spt") ?? "";
  const shape =
    el.localName === "roundrect"
      ? "roundRect"
      : el.localName === "oval"
        ? "ellipse"
        : el.localName === "line"
          ? "line"
          : VML_SHAPES[number];
  if (!target.spot) line.tall = Math.max(line.tall, frame.h);
  if (!fill && !stroke && isBlank(blocks)) return;
  const elbow = /^(3[3-6])$/.test(number) ? "bent" : /^(37|38|39|40)$/.test(number) ? "curved" : null;
  if ((shape === "line" || elbow) && stroke) {
    const ends = kid(el, "stroke");
    const [start, end] = ["startarrow", "endarrow"].map((name) => (at(ends, name) ?? "none") !== "none");
    const mirrored = css.get("flip") ?? "";
    const [from, to] = [at(el, "from") ?? "0,0", at(el, "to") ?? "0,0"].map((point) =>
      point.split(",").map((part) => lengthOf(part, 0.75) ?? 0),
    );
    const drawn = el.localName === "line";
    const flipH = (drawn && to[0] < from[0] - 0.01) !== /x/.test(mirrored);
    const flipV = (drawn && to[1] < from[1] - 0.01) !== /y/.test(mirrored);
    const adjust = (at(el, "adj") ?? "")
      .split(",")
      .flatMap((part) => (numberOf(part) === undefined ? [] : [Number(part) / 21600]));
    const kind = elbow ? `${elbow}Connector${elbow === "bent" ? Number(number) - 31 : Number(number) - 35}` : "line";
    drawLine(line, frame, target, stroke, { kind, flipH, flipV, start, end, adjust, turn });
    return;
  }
  const quarters = quartersOf(turn);
  const laid = quarters !== null && quarters % 2 === 1 ? onSide(frame) : frame;
  const named = shape
    ? turnedShape(shape, quarters ?? 0, {
        flipH: /x/.test(css.get("flip") ?? ""),
        flipV: /y/.test(css.get("flip") ?? ""),
      })
    : shape;
  const valign = css.get("v-text-anchor");
  addBox(
    line,
    laid,
    { ...target, spot: target.spot ?? inlineSpot(line, laid) },
    {
      shape: named === "rect" ? undefined : named,
      blocks: isBlank(blocks) ? [] : blocks,
      fill: fill ?? undefined,
      stroke: stroke ?? undefined,
      valign: valign?.startsWith("middle") ? "middle" : valign?.startsWith("bottom") ? "bottom" : "top",
      pad,
    },
  );
}

/** Shapes may lean on a type that is spelled out once in the file. */
function shapeTypeOf(line: Line, type: string | null): Element | null {
  const id = type?.replace(/^#/, "");
  return id ? (findAll(line.env.part.root, "shapetype").find((el) => at(el, "id") === id) ?? null) : null;
}

/** Words drawn as a shape, the way watermarks are. */
function wordArt(
  words: string,
  css: Map<string, string>,
  frame: Frame,
  paint: { fill: string | null; alpha: number; stroke: string | null },
): FlowImage | null {
  if (frame.w < 1 || frame.h < 1) return null;
  const font = (css.get("font-family") ?? "Arial").replace(/["']/g, "");
  return paintImage(frame.w, frame.h, (pen) => {
    pen.font = `${css.get("font-style") === "italic" ? "italic" : "normal"} ${css.get("font-weight") === "bold" ? 700 : 400} 100px "${font}", Arial, sans-serif`;
    const size = pen.measureText(words);
    const tall = size.actualBoundingBoxAscent + size.actualBoundingBoxDescent || 100;
    // The words fill the whole frame, however much that stretches them.
    pen.scale(frame.w / (size.width || 1), frame.h / tall);
    pen.globalAlpha = paint.alpha;
    if (paint.fill) {
      pen.fillStyle = paint.fill;
      pen.fillText(words, 0, size.actualBoundingBoxAscent);
    }
    if (paint.stroke) {
      pen.strokeStyle = paint.stroke;
      pen.lineWidth = 0.75;
      pen.strokeText(words, 0, size.actualBoundingBoxAscent);
    }
  });
}

// ---------------------------------------------------------------- tables

type Slot = {
  row: number;
  col: number;
  rows: number;
  cols: number;
  tc: Element | null;
  /** Every piece of it, with the column it starts in. */
  parts: { tc: Element; col: number; cols: number }[];
  cell?: FlowCell;
  look: CellLook;
  table: { para: ParaLook; run: RunLook };
  lines: Record<Side, FlowLine | null>;
  pad: FlowMargin;
};

type Look = {
  firstRow: boolean;
  lastRow: boolean;
  firstCol: boolean;
  lastCol: boolean;
  bands: boolean;
  stripes: boolean;
};

function tableLook(tblPr: Element | null): Look {
  const el = kid(tblPr, "tblLook");
  const bits = el ? parseInt(valOf(el) ?? "0", 16) || 0 : 0x04a0;
  const flag = (name: string, bit: number) => {
    const own = at(el, name);
    return own !== null ? yes(own) : (bits & bit) !== 0;
  };
  return {
    firstRow: flag("firstRow", 0x20),
    lastRow: flag("lastRow", 0x40),
    firstCol: flag("firstColumn", 0x80),
    lastCol: flag("lastColumn", 0x100),
    bands: !flag("noHBand", 0x200),
    stripes: !flag("noVBand", 0x400),
  };
}

/** Rows or cells, out of whatever they are wrapped in. */
function unwrap(holder: Element, name: string): Element[] {
  return kids(holder).flatMap((el): Element[] => {
    if (el.localName === name) return [el];
    if (el.localName === "sdt") {
      checkBox(el);
      const content = kid(el, "sdtContent");
      return content ? unwrap(content, name) : [];
    }
    if (/^(customXml|ins|moveTo|smartTag)$/.test(el.localName)) return unwrap(el, name);
    if (el.localName === "AlternateContent") {
      const choice = choose(el);
      return choice ? unwrap(choice, name) : [];
    }
    return [];
  });
}

function readTable(doc: Doc, tbl: Element, env: Env): FlowBlock[] {
  const tblPr = kid(tbl, "tblPr");
  const look = tableLook(tblPr);
  const asked = valOf(kid(tblPr, "tblStyle")) ?? "";
  const style = tableStyle(doc, doc.styles.get(asked)?.kind === "table" ? asked : doc.plainTable);
  const ownEdges = edgesOf(doc, kid(tblPr, "tblBorders"));
  const tablePad: FlowMargin = {
    top: 0,
    right: 5.4,
    bottom: 0,
    left: 5.4,
    ...style.whole.pad,
    ...padOf(kid(tblPr, "tblCellMar")),
  };
  const tableShade = kid(tblPr, "shd");
  const tableFill = tableShade ? shadeOf(doc, tableShade) : undefined;

  const rows = unwrap(tbl, "tr").filter((tr) => !dig(tr, "trPr", "del"));
  const slots: Slot[] = [];
  const grid: (Slot | null)[][] = rows.map(() => []);
  const merging = new Map<number, Slot>();
  let cols = 0;
  rows.forEach((tr, row) => {
    const trPr = kid(tr, "trPr");
    let col = Math.round(numberOf(valOf(kid(trPr, "gridBefore"))) ?? 0);
    const skip = (from: number, count: number) => {
      if (count > 0) slots.push(makeSlot(row, from, count, null));
    };
    skip(0, col);
    for (const tc of unwrap(tr, "tc")) {
      const tcPr = kid(tc, "tcPr");
      const span = Math.max(1, Math.round(numberOf(valOf(kid(tcPr, "gridSpan"))) ?? 1));
      const across = kid(tcPr, "hMerge");
      const last = slots[slots.length - 1];
      if (across && valOf(across) !== "restart" && last?.row === row) {
        last.cols += span;
        last.parts.push({ tc, col, cols: span });
        col += span;
        continue;
      }
      const down = kid(tcPr, "vMerge");
      const above = down && valOf(down) !== "restart" ? merging.get(col) : undefined;
      if (above && above.row + above.rows === row) above.rows += 1;
      else {
        const slot = makeSlot(row, col, span, tc);
        slots.push(slot);
        if (down) merging.set(col, slot);
        else merging.delete(col);
      }
      col += span;
    }
    const after = Math.round(numberOf(valOf(kid(trPr, "gridAfter"))) ?? 0);
    skip(col, after);
    cols = Math.max(cols, col + after);
  });
  if (rows.length === 0 || cols === 0) return [];
  for (const slot of slots)
    for (let r = slot.row; r < Math.min(rows.length, slot.row + slot.rows); r += 1)
      for (let c = slot.col; c < Math.min(cols, slot.col + slot.cols); c += 1) grid[r][c] = slot;

  // Looks, from the table's style to the cell's own.
  const heads = Math.max(
    1,
    rows.findIndex((tr) => !on(dig(tr, "trPr", "tblHeader"))),
  );
  const headRows = look.firstRow ? heads : 0;
  const footRow = look.lastRow && rows.length > headRows ? rows.length - 1 : rows.length;
  for (const slot of slots) {
    const { row, col } = slot;
    const bottom = row + slot.rows - 1;
    const edge = col + slot.cols - 1;
    const exceptions = kid(rows[row], "tblPrEx");
    const base: Edges = { ...style.whole.cell.edges, ...ownEdges, ...edgesOf(doc, kid(exceptions, "tblBorders")) };
    type Area = { r0: number; r1: number; c0: number; c1: number };
    const pickEdges = (edges: Edges, area: Area): Partial<Record<Side, FlowLine | null>> => {
      const out: Partial<Record<Side, FlowLine | null>> = {};
      const take = (side: Side, outer: boolean, inner: "insideH" | "insideV") => {
        const found = outer ? edges[side] : edges[inner];
        if (found !== undefined) out[side] = found;
      };
      take("top", row <= area.r0, "insideH");
      take("bottom", bottom >= area.r1, "insideH");
      take("left", col <= area.c0, "insideV");
      take("right", edge >= area.c1, "insideV");
      return out;
    };
    const whole: Area = { r0: 0, r1: rows.length - 1, c0: 0, c1: cols - 1 };
    const layers: [Layer, Area][] = [];
    const add = (name: string, area: Area) => {
      const layer = style.parts.get(name);
      if (layer) layers.push([layer, area]);
    };
    const inBody = row >= headRows && row < footRow;
    if (look.bands && inBody) {
      const band = Math.floor((row - headRows) / style.rowBand);
      const from = headRows + band * style.rowBand;
      add(band % 2 === 0 ? "band1Horz" : "band2Horz", {
        ...whole,
        r0: from,
        r1: Math.min(footRow, from + style.rowBand) - 1,
      });
    }
    if (look.stripes && inBody) {
      const start = look.firstCol ? 1 : 0;
      if (col >= start && !(look.lastCol && edge === cols - 1)) {
        const band = Math.floor((col - start) / style.colBand);
        const from = start + band * style.colBand;
        add(band % 2 === 0 ? "band1Vert" : "band2Vert", {
          r0: headRows,
          r1: footRow - 1,
          c0: from,
          c1: from + style.colBand - 1,
        });
      }
    }
    const isFirst = look.firstCol && col === 0;
    const isLast = look.lastCol && edge === cols - 1 && !isFirst;
    if (isLast) add("lastCol", { r0: headRows, r1: footRow - 1, c0: cols - 1, c1: cols - 1 });
    if (isFirst) add("firstCol", { r0: headRows, r1: footRow - 1, c0: 0, c1: 0 });
    if (row >= footRow) add("lastRow", { ...whole, r0: footRow, r1: footRow });
    if (row < headRows) add("firstRow", { ...whole, r0: 0, r1: headRows - 1 });
    const corner = { r0: row, r1: bottom, c0: col, c1: edge };
    if (row < headRows && isFirst) add("nwCell", corner);
    if (row < headRows && isLast) add("neCell", corner);
    if (row >= footRow && isFirst) add("swCell", corner);
    if (row >= footRow && isLast) add("seCell", corner);

    const own = cellLook(doc, kid(slot.tc, "tcPr"));
    let lines = pickEdges(base, whole);
    let fill = tableFill ?? style.whole.cell.fill;
    let valign = style.whole.cell.valign;
    let pad: Partial<FlowMargin> = { ...tablePad, ...style.whole.cell.pad };
    let para = style.whole.para;
    let run = style.whole.run;
    for (const [layer, area] of layers) {
      lines = { ...lines, ...pickEdges(layer.cell.edges, area) };
      if (layer.cell.fill !== undefined) fill = layer.cell.fill;
      valign = layer.cell.valign ?? valign;
      pad = { ...pad, ...layer.cell.pad };
      para = mergePara(para, layer.para);
      run = { ...run, ...layer.run };
    }
    const { top, right, bottom: low, left } = { ...lines, ...own.edges };
    slot.lines = slot.tc
      ? { top: top ?? null, right: right ?? null, bottom: low ?? null, left: left ?? null }
      : { top: null, right: null, bottom: null, left: null };
    slot.look = { edges: {}, fill: own.fill === undefined ? fill : own.fill, valign: own.valign ?? valign };
    slot.pad = { ...tablePad, ...pad, ...own.pad };
    slot.table = { para, run };
  }

  const widths = columnWidths(doc, tbl, env, slots, cols, tablePad);
  const total = widths.sizes.reduce((sum, size) => sum + size, 0);
  // Before Word 2013 the words of a table lined up with the margin, not its edge.
  const shift = doc.mode < 15 && env.place !== "cell" ? tablePad.left : 0;
  const indentEl = kid(tblPr, "tblInd");
  const indent = (indentEl && at(indentEl, "type") !== "pct" ? twips(at(indentEl, "w")) : style.whole.indent) ?? 0;
  const float = kid(tblPr, "tblpPr");
  const side = at(float, "tblpXSpec") ?? valOf(kid(tblPr, "jc")) ?? style.whole.align ?? "left";
  const rtl = on(kid(tblPr, "bidiVisual")) ?? false;
  let align: FlowTable["align"] =
    side === "center" ? "center" : /^(right|end|outside)$/.test(side) ? "right" : undefined;
  if (rtl) align = align === "right" ? undefined : (align ?? "right");
  let left = indent - shift;
  if (float && at(float, "tblpX") !== null) {
    const x = twips(at(float, "tblpX")) ?? 0;
    left = x - (at(float, "horzAnchor") === "page" ? env.room.margin.left : 0);
  }

  // What most cells have becomes the table's own; the others say how they differ.
  const real = slots.filter((slot) => slot.tc);
  const pads = tally(real.map((slot) => JSON.stringify(slot.pad)));
  const pad: FlowMargin = pads ? (JSON.parse(pads) as FlowMargin) : tablePad;
  settleLines(slots, grid, rows.length, cols);
  const usual = tally(real.flatMap((slot) => SIDES.map((name) => JSON.stringify(slot.lines[name]))));
  const border: FlowLine | null = usual ? (JSON.parse(usual) as FlowLine | null) : null;

  const starts = widths.sizes.map((_, i) => widths.sizes.slice(0, i).reduce((sum, size) => sum + size, 0));
  const inRow: Slot[][] = rows.map(() => []);
  for (const slot of slots) inRow[slot.row].push(slot);
  // Only rows at the very top are repeated on every page.
  const plain = rows.findIndex((tr) => !on(dig(tr, "trPr", "tblHeader")));
  const out: FlowRow[] = rows.map((tr, row) => {
    const trPr = kid(tr, "trPr");
    const height = kid(trPr, "trHeight");
    const h = height && at(height, "hRule") !== "auto" ? twips(valOf(height)) : undefined;
    const cells = inRow[row]
      .sort((a, b) => a.col - b.col)
      .map((slot) =>
        makeCell(doc, env, slot, { border, pad, sizes: widths.sizes, left: env.at + left + (starts[slot.col] ?? 0) }),
      );
    if (rtl) cells.reverse();
    const made: FlowRow = { cells };
    if (h) made.h = round(h);
    // Thin rows are lines and gaps: the empty paragraph in them must not make them higher.
    if (h && at(height, "hRule") === "exact") {
      for (const cell of cells) {
        if (!isBlank(cell.blocks)) continue;
        const only: FlowPara = {
          ...cell.blocks[0],
          before: 0,
          after: 0,
          line: { points: round(Math.max(0.5, h - pad.top - pad.bottom)) },
        };
        cell.blocks = [only];
      }
    }
    const tall = Math.max(
      0,
      ...inRow[row].map((slot) => (slot.rows === 1 && slot.cell ? pictureHeight(slot.cell) : 0)),
    );
    if (tall > 0) made.h = round(Math.max(made.h ?? 0, tall + pad.top + pad.bottom));
    if (row < plain) made.head = true;
    return made;
  });
  let sizes = widths.sizes;
  if (widths.guess) sizes = fitColumns(sizes, slots, pad, widths.target ?? env.width, widths.target !== null);
  if (rtl) sizes = [...sizes].reverse();
  const table: FlowTable = {
    kind: "table",
    cols: sizes.map((size) => round(size)),
    rows: out,
    border,
    pad: { top: round(pad.top), right: round(pad.right), bottom: round(pad.bottom), left: round(pad.left) },
  };
  const over = table.cols.reduce((sum, size) => sum + size, 0) - env.width;
  if (align && over > 1) table.left = round(align === "center" ? -over / 2 : -over);
  else if (align) table.align = align;
  else if (Math.abs(left) > 0.05 && total > 0) table.left = round(left);
  return [table];
}

function makeSlot(row: number, col: number, cols: number, tc: Element | null): Slot {
  return {
    row,
    col,
    rows: 1,
    cols,
    tc,
    parts: tc ? [{ tc, col, cols }] : [],
    look: { edges: {} },
    table: { para: {}, run: {} },
    lines: { top: null, right: null, bottom: null, left: null },
    pad: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

function makeCell(
  doc: Doc,
  env: Env,
  slot: Slot,
  table: { border: FlowLine | null; pad: FlowMargin; sizes: number[]; left: number },
): FlowCell {
  const { look, pad } = slot;
  const cell: FlowCell = { blocks: [] };
  slot.cell = cell;
  if (slot.cols > 1) cell.colSpan = slot.cols;
  if (slot.rows > 1) cell.rowSpan = slot.rows;
  if (look.fill && slot.tc) cell.fill = look.fill;
  if (look.valign && look.valign !== "top") cell.valign = look.valign;
  const border: NonNullable<FlowCell["border"]> = {};
  for (const side of SIDES) if (lineKey(slot.lines[side]) !== lineKey(table.border)) border[side] = slot.lines[side];
  if (Object.keys(border).length > 0) cell.border = border;
  if (!slot.tc) {
    cell.blocks = [{ kind: "para", runs: [], before: 0, after: 0 }];
    return cell;
  }
  const width = table.sizes.slice(slot.col, slot.col + slot.cols).reduce((sum, size) => sum + size, 0);
  const inside: Env = {
    ...env,
    place: "cell",
    at: table.left + pad.left,
    width: Math.max(10, width - pad.left - pad.right),
    table: slot.table,
    back: look.fill ?? (look.fill === null ? undefined : env.back),
  };
  cell.blocks = onlyParas(doc.traits, readBlocks(doc, slot.tc, inside));
  if (cell.blocks.length === 0) cell.blocks = [{ kind: "para", runs: [], before: 0, after: 0 }];
  // Cells with other margins than the rest of the table keep them as indents.
  const left = round(pad.left - table.pad.left);
  const right = round(pad.right - table.pad.right);
  for (const para of cell.blocks) {
    if (Math.abs(left) > 0.2) para.left = round((para.left ?? 0) + left);
    if (Math.abs(right) > 0.2) para.right = round((para.right ?? 0) + right);
  }
  const first = cell.blocks[0];
  const last = cell.blocks[cell.blocks.length - 1];
  if (pad.top - table.pad.top > 0.2) first.before = round((first.before ?? 0) + pad.top - table.pad.top);
  if (pad.bottom - table.pad.bottom > 0.2) last.after = round((last.after ?? 0) + pad.bottom - table.pad.bottom);
  return cell;
}

type Widths = {
  sizes: number[];
  /** Nobody said how wide the columns are: their words decide. */
  guess: boolean;
  /** How wide the whole table is, when that was said. */
  target: number | null;
};

function columnWidths(doc: Doc, tbl: Element, env: Env, slots: readonly Slot[], cols: number, pad: FlowMargin): Widths {
  const tblPr = kid(tbl, "tblPr");
  const room = env.width + (doc.mode < 15 && env.place !== "cell" ? pad.left + pad.right : 0);
  const share = (el: Element | null, whole: number): number | null => {
    const value = at(el, "w") ?? "";
    const type = at(el, "type") ?? "dxa";
    if (type === "pct" || value.endsWith("%"))
      return value.endsWith("%") ? (parseFloat(value) / 100) * whole : ((numberOf(value) ?? 0) / 5000) * whole || null;
    return type === "dxa" ? (twips(value) ?? 0) || null : null;
  };
  const target = share(kid(tblPr, "tblW"), room);
  const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((el) => twips(at(el, "w")) ?? 0);
  const asked: (number | null)[] = Array.from({ length: cols }, () => null);
  const pieces = slots.flatMap((slot) => slot.parts);
  for (const piece of pieces) {
    if (piece.cols !== 1) continue;
    const size = share(dig(piece.tc, "tcPr", "tcW"), target ?? room);
    if (size) asked[piece.col] = Math.max(asked[piece.col] ?? 0, size);
  }
  // Wide cells share out what the columns under them do not say.
  for (const piece of pieces) {
    if (piece.cols === 1) continue;
    const size = share(dig(piece.tc, "tcPr", "tcW"), target ?? room);
    const open = Array.from({ length: piece.cols }, (_, i) => piece.col + i).filter(
      (c) => c < cols && asked[c] === null,
    );
    if (!size || open.length === 0) continue;
    const known = Array.from({ length: piece.cols }, (_, i) => asked[piece.col + i] ?? 0).reduce(
      (sum, one) => sum + one,
      0,
    );
    const base = open.reduce((sum, c) => sum + (grid[c] ?? 0), 0);
    for (const c of open)
      if (size > known) asked[c] = base > 0 ? ((size - known) * (grid[c] ?? 0)) / base : (size - known) / open.length;
  }
  const fixed = valOf(kid(tblPr, "tblLayout")) ?? at(kid(tblPr, "tblLayout"), "type");
  // Word keeps the widths it worked out in the grid; other programs often fill it with anything.
  const byWord = kids(tbl, "tr").some(
    (tr) => at(tr, "rsidR") !== null || at(tr, "rsidTr") !== null || at(tr, "paraId") !== null,
  );
  const trusted = grid.length >= cols && grid.slice(0, cols).every((size) => size > 0) && (byWord || fixed === "fixed");
  const guess = asked.some((size) => size === null) && !trusted;
  const even = (target ?? room) / cols;
  let sizes = asked.map((size, c) => size ?? ((trusted || grid[c] > 10 ? grid[c] : 0) || even));
  const sum = sizes.reduce((all, size) => all + size, 0);
  // A table that fits itself keeps to the room there is, unless it was told a width of its own.
  const whole = target ?? (sum > room + 1 ? room : sum);
  if (fixed !== "fixed" && sum > 0 && Math.abs(sum - whole) > 1) sizes = sizes.map((size) => (size * whole) / sum);
  return { sizes, guess, target };
}

/** Widths for columns nobody measured: as wide as their words, as far as there is room. */
function fitColumns(
  sizes: readonly number[],
  slots: readonly Slot[],
  pad: FlowMargin,
  room: number,
  full: boolean,
): number[] {
  const pen = document.createElement("canvas").getContext("2d");
  const measure = (text: string, style: FlowStyle) => {
    if (!pen) return text.length * (style.size ?? 11) * 0.5;
    pen.font = `${style.italic ? "italic" : "normal"} ${style.bold ? 700 : 400} 100px "${style.font ?? "Calibri"}", Calibri, Carlito, Arial, sans-serif`;
    return (pen.measureText(text).width / 100) * (style.size ?? 11);
  };
  const most = sizes.map(() => 12);
  const least = sizes.map(() => 12);
  for (const slot of slots) {
    if (slot.cols !== 1 || !slot.tc) continue;
    for (const para of slot.cell?.blocks ?? []) {
      const side = pad.left + pad.right + (para.left ?? 0) + (para.right ?? 0) + 1;
      for (const line of splitRuns(para.runs, "\n")) {
        const whole = line.reduce((all, run) => all + (run.image ? run.image.w : measure(run.text, run.style)), 0);
        const word = Math.max(
          0,
          ...line.flatMap((run) =>
            run.image ? [run.image.w] : run.text.split(/\s+/).map((one) => measure(one, run.style)),
          ),
        );
        most[slot.col] = Math.max(most[slot.col], whole + side);
        least[slot.col] = Math.max(least[slot.col], word + side);
      }
    }
  }
  const all = most.reduce((sum, size) => sum + size, 0);
  const min = least.reduce((sum, size) => sum + size, 0);
  if (all <= room) return full ? most.map((size) => (size * room) / all) : most;
  if (min >= room) return least.map((size) => (size * room) / min);
  // Everyone gets what the longest word needs; the rest goes to those with more to say.
  return least.map((size, i) => size + ((most[i] - size) * (room - min)) / (all - min));
}
