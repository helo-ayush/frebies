import {
  ConvertError,
  type FlowBlock,
  type FlowBox,
  type FlowCell,
  type FlowDoc,
  type FlowImage,
  type FlowLine,
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
  LOCKED,
  SIDES,
  SIMPLE,
  aboutHigh,
  at,
  blend,
  capitals,
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
  type Paint,
  type Point,
  type Script,
  type Side,
  type TabPlan,
  type TabStop,
  type Traits,
} from "./xml";

/**
 * Reads OpenDocument texts (.odt, .ott), as LibreOffice and Word write them.
 * Looks come from styles that inherit from each other; what was set by hand is a
 * style of its own as well, without a name anybody sees.
 */

// ---------------------------------------------------------------- what is kept while reading

/** Looks of words. null says "none" where leaving it out says "as it was". */
type TextLook = {
  font?: string;
  fontEast?: string;
  fontCs?: string;
  size?: number;
  sizeEast?: number;
  sizeCs?: number;
  bold?: boolean;
  boldCs?: boolean;
  italic?: boolean;
  italicCs?: boolean;
  under?: boolean;
  strike?: boolean;
  caps?: boolean;
  small?: boolean;
  hidden?: boolean;
  color?: string | null;
  back?: string | null;
  script?: "super" | "sub" | null;
  tracking?: number;
  complex?: boolean;
};

type Edges = Partial<Record<Side, FlowLine | null>>;
type ParaLook = {
  align?: string;
  left?: number;
  right?: number;
  first?: number;
  before?: number;
  after?: number;
  line?: NonNullable<FlowPara["line"]>;
  breakBefore?: string;
  breakAfter?: string;
  keepNext?: boolean;
  fill?: string | null;
  edges?: Edges;
  tabs?: TabStop[];
  step?: number;
  context?: boolean;
  rtl?: boolean;
};

type ParaStyle = {
  para: ParaLook;
  text: TextLook;
  /** What the paragraph's own style says, without what it inherits. */
  own: ParaLook;
  /** The style people know it by. */
  name: string;
  list: string;
  master: string | null;
};

/** A picture as a filling, and the one colour that comes closest to it. */
type Fill = { bytes: Uint8Array; mime: string; color: string };

/** Where styles are looked up: those set by hand differ between the text and the headers. */
type Scope = Map<string, Element>;

type Room = {
  w: number;
  h: number;
  margin: FlowMargin;
  headerAt: number;
  footerAt: number;
  cols: number;
  gap: number;
  text: number;
  kind: string;
  header?: FlowBlock[];
  footer?: FlowBlock[];
};

type Env = {
  scope: Scope;
  room: Room;
  place: "body" | "band" | "cell" | "box" | "note";
  /** In a header or footer, however deep: page numbers are live there. */
  band: boolean;
  at: number;
  width: number;
  back?: string;
  /** Looks that table cells and shapes lend their words. */
  base?: { para: ParaLook; text: TextLook };
  /** The text itself: where finished sections go, and drawings waiting for a paragraph. */
  body?: { chunks: Chunk<Room>[]; blocks: FlowBlock[]; loose: Piece[]; begun: boolean };
};

type Piece =
  | { kind: "run"; run: FlowRun }
  /** Paragraphs of a frame that is only there to push them to one side. */
  | { kind: "paras"; paras: FlowPara[] }
  | { kind: "box"; box: FlowBox; z: number }
  | { kind: "stand"; image: FlowImage; x: number; before: number; after: number; below: boolean };

type Item = {
  level: Element | null;
  depth: number;
  label: Label | null;
  /** Not the first paragraph of its item. */ more: boolean;
};
type Label = { mark?: string; type: "bullet" | "number"; text?: string; value?: number };

type Doc = {
  scopes: { body: Scope; page: Scope };
  named: Map<string, Element>;
  masters: Map<string, Element>;
  layouts: Map<string, Element>;
  faces: Map<string, string>;
  outline: Element | null;
  pictures: Map<string, { bytes: Uint8Array; mime: string }>;
  /** Colours that run into each other, and pictures things are filled with, by their names. */
  gradients: Map<string, Element>;
  fills: Map<string, Fill>;
  formulas: Map<string, Element>;
  rooms: Map<string, Room>;
  counts: Map<string, (number | undefined)[]>;
  notes: { mark: string; body: Element; end: boolean; scope: Scope }[];
  tabs: Map<FlowPara, TabPlan>;
  traits: Traits;
  /** Pictures in front of the words, and how far in front. */
  over: Map<FlowImage, number>;
  paras: Map<string, ParaStyle>;
  /** Made by Word, which means some things its own way. */
  word: boolean;
  /** Space after and space before add up instead of the larger one counting. */
  sums: boolean;
  /** Tab stops are counted from the paragraph's edge. */
  tabsInside: boolean;
};

const measure = (text: string | null | undefined) => lengthOf(text);
const percent = (text: string | null | undefined) =>
  text?.trim().endsWith("%") ? (numberOf(text) ?? 100) / 100 : undefined;
const colorOf = (text: string | null | undefined): string | null | undefined =>
  text === null || text === undefined ? undefined : isHex(text) ? hexOf(text) : null;

// ---------------------------------------------------------------- looks

function textLook(doc: Doc, el: Element | null): TextLook {
  const out: TextLook = {};
  if (!el) return out;
  const face = (named: string, plain: string) => {
    const name = at(el, named);
    const family = at(el, plain);
    const found =
      (name ? (doc.faces.get(name) ?? name) : undefined) ?? family?.split(",")[0].replace(/['"]/g, "").trim();
    return found || undefined;
  };
  const font = face("font-name", "font-family");
  const fontEast = face("font-name-asian", "font-family-asian");
  const fontCs = face("font-name-complex", "font-family-complex");
  if (font) out.font = font;
  if (fontEast) out.fontEast = fontEast;
  if (fontCs) out.fontCs = fontCs;
  const size = measure(at(el, "font-size"));
  const sizeEast = measure(at(el, "font-size-asian"));
  const sizeCs = measure(at(el, "font-size-complex"));
  if (size) out.size = size;
  if (sizeEast) out.sizeEast = sizeEast;
  if (sizeCs) out.sizeCs = sizeCs;
  const heavy = (value: string | null) =>
    value === null ? undefined : value === "bold" || (numberOf(value) ?? 400) >= 600;
  const bold = heavy(at(el, "font-weight"));
  const boldCs = heavy(at(el, "font-weight-complex"));
  if (bold !== undefined) out.bold = bold;
  if (boldCs !== undefined) out.boldCs = boldCs;
  const slant = (value: string | null) => (value === null ? undefined : /italic|oblique/.test(value));
  const italic = slant(at(el, "font-style"));
  const italicCs = slant(at(el, "font-style-complex"));
  if (italic !== undefined) out.italic = italic;
  if (italicCs !== undefined) out.italicCs = italicCs;
  const line = (name: string) => {
    const kinds = [at(el, `${name}-style`), at(el, `${name}-type`)].filter((value) => value !== null);
    return kinds.length > 0 ? kinds.every((value) => value !== "none") : undefined;
  };
  const under = line("text-underline");
  const strike = line("text-line-through");
  if (under !== undefined) out.under = under;
  if (strike !== undefined) out.strike = strike;
  const color = colorOf(at(el, "color"));
  if (color) out.color = color;
  else if (at(el, "use-window-font-color") === "true") out.color = null;
  const back = colorOf(at(el, "background-color"));
  if (back !== undefined) out.back = back;
  const place = at(el, "text-position");
  if (place !== null) {
    const [rise, share] = place.split(/\s+/);
    const up = rise === "super" ? 1 : rise === "sub" ? -1 : (numberOf(rise) ?? 0);
    // Letters of full size that only stand a little higher are not superscript.
    const small = (percent(share) ?? 0.6) < 0.95;
    out.script = up > 0 && small ? "super" : up < 0 && small ? "sub" : null;
  }
  const spacing = at(el, "letter-spacing");
  if (spacing !== null) out.tracking = measure(spacing) ?? 0;
  const turn = at(el, "text-transform");
  if (turn !== null) out.caps = turn === "uppercase";
  const variant = at(el, "font-variant");
  if (variant !== null) out.small = variant === "small-caps";
  const shown = at(el, "display");
  if (shown !== null) out.hidden = shown === "none";
  const script = at(el, "script-type");
  if (script !== null) out.complex = script === "complex";
  return out;
}

/** Looks one over the other. Sizes may be a share of the size they are in. */
function overText(doc: Doc, base: TextLook, el: Element | null): TextLook {
  const own = textLook(doc, el);
  const out: TextLook = { ...base, ...own };
  const share = percent(at(el, "font-size"));
  const shareCs = percent(at(el, "font-size-complex"));
  if (share) out.size = (base.size ?? 12) * share;
  if (shareCs) out.sizeCs = (base.sizeCs ?? base.size ?? 12) * shareCs;
  return out;
}

function lineOf(text: string | null | undefined): FlowLine | null | undefined {
  if (text === null || text === undefined) return undefined;
  const parts = text.trim().split(/\s+/);
  const kind = parts.find((part) =>
    /^(solid|double|dashed|dotted|dash|dot|groove|ridge|inset|outset|fine-dashed|dash-dot|dash-dot-dot|double-thin)$/.test(
      part,
    ),
  );
  if (!kind || parts.includes("none") || parts.includes("hidden")) return null;
  const width = parts.map((part) => measure(part)).find((value) => value !== undefined) ?? 0.75;
  const color = parts.map((part) => colorOf(part)).find((value) => typeof value === "string");
  const line: FlowLine = { color: color ?? "#000000", width: round(Math.max(0.25, width)) };
  if (/dash/.test(kind)) line.dash = "dash";
  else if (/dot/.test(kind)) line.dash = "dot";
  return line;
}

function edgesOf(el: Element | null): Edges | undefined {
  const all = lineOf(at(el, "border"));
  const out: Edges = {};
  for (const side of SIDES) {
    const line = lineOf(at(el, `border-${side}`)) ?? (at(el, `border-${side}`) === null ? all : null);
    if (line !== undefined) out[side] = line;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function padOf(el: Element | null): Partial<FlowMargin> {
  const all = measure(at(el, "padding"));
  const out: Partial<FlowMargin> = {};
  for (const side of SIDES) {
    const value = measure(at(el, `padding-${side}`)) ?? all;
    if (value !== undefined) out[side] = value;
  }
  return out;
}

function tabsOf(el: Element | null): TabStop[] | undefined {
  const holder = kid(el, "tab-stops");
  if (!holder) return undefined;
  return kids(holder, "tab-stop").flatMap((stop): TabStop[] => {
    const place = measure(at(stop, "position"));
    const type = at(stop, "type") ?? "left";
    if (place === undefined) return [];
    const filled = (at(stop, "leader-style") ?? "none") !== "none" || (at(stop, "leader-type") ?? "none") !== "none";
    const sign = at(stop, "leader-text") ?? at(stop, "leader-char") ?? ".";
    return [
      {
        at: place,
        kind: type === "center" || type === "right" ? type : type === "char" ? "decimal" : "left",
        fill: filled && sign.trim() ? sign.trim().slice(0, 1) : undefined,
      },
    ];
  });
}

function paraLook(el: Element | null): ParaLook {
  const out: ParaLook = {};
  if (!el) return out;
  const set = <K extends keyof ParaLook>(key: K, value: ParaLook[K]) => {
    if (value !== undefined) out[key] = value;
  };
  const margin = measure(at(el, "margin"));
  set("align", at(el, "text-align") ?? undefined);
  set("left", measure(at(el, "margin-left") ?? at(el, "margin-start")) ?? margin);
  set("right", measure(at(el, "margin-right") ?? at(el, "margin-end")) ?? margin);
  set("before", measure(at(el, "margin-top")) ?? margin);
  set("after", measure(at(el, "margin-bottom")) ?? margin);
  set("first", measure(at(el, "text-indent")));
  const line = at(el, "line-height");
  const least = measure(at(el, "line-height-at-least"));
  if (least !== undefined) set("line", least > 0 ? { points: round(least), atLeast: true } : { times: 1 });
  else if (line !== null) {
    const times = percent(line);
    const points = measure(line);
    set("line", times ? { times: round(times, 4) } : points ? { points: round(points) } : { times: 1 });
  }
  set("breakBefore", at(el, "break-before") ?? undefined);
  set("breakAfter", at(el, "break-after") ?? undefined);
  const keep = at(el, "keep-with-next");
  if (keep !== null) set("keepNext", keep === "always" || keep === "true");
  set("fill", colorOf(at(el, "background-color")));
  set("edges", edgesOf(el));
  set("tabs", tabsOf(el));
  set("step", measure(at(el, "tab-stop-distance")));
  const context = at(el, "contextual-spacing");
  if (context !== null) set("context", context === "true");
  const way = at(el, "writing-mode");
  if (way !== null && way !== "page") set("rtl", /^rl/.test(way));
  return out;
}

// ---------------------------------------------------------------- styles

const key = (family: string, name: string) => `${family}|${name}`;

/** A style and all it is based on, the first one first. */
function chainOf(doc: Doc, scope: Scope, family: string, name: string | null): Element[] {
  const out: Element[] = [];
  let next = name;
  let place: Scope = scope;
  while (next && out.length < 40) {
    const el: Element | undefined = place.get(key(family, next)) ?? doc.named.get(key(family, next));
    if (!el || out.includes(el)) break;
    out.unshift(el);
    next = at(el, "parent-style-name");
    place = doc.named;
  }
  return out;
}

const defaultOf = (doc: Doc, family: string) => doc.named.get(`default|${family}`) ?? null;

function paraStyle(doc: Doc, scope: Scope, name: string | null): ParaStyle {
  const id = `${scope === doc.scopes.body ? "b" : "p"}|${name ?? ""}`;
  const known = doc.paras.get(id);
  if (known) return known;
  const base = defaultOf(doc, "paragraph");
  let para = paraLook(kid(base, "paragraph-properties"));
  let text = overText(doc, {}, kid(base, "text-properties"));
  const chain = chainOf(doc, scope, "paragraph", name);
  let list = "";
  let master: string | null = null;
  for (const el of chain) {
    para = { ...para, ...paraLook(kid(el, "paragraph-properties")) };
    text = overText(doc, text, kid(el, "text-properties"));
    list = at(el, "list-style-name") ?? list;
    master = at(el, "master-page-name") ?? master;
  }
  const leaf = chain[chain.length - 1];
  const byHand = Boolean(leaf && name && scope.get(key("paragraph", name)) === leaf);
  const known2: ParaStyle = {
    para,
    text,
    own: byHand ? paraLook(kid(leaf ?? null, "paragraph-properties")) : {},
    name: (byHand ? at(leaf ?? null, "parent-style-name") : name) ?? "",
    list,
    master: master || null,
  };
  doc.paras.set(id, known2);
  return known2;
}

function textStyle(doc: Doc, scope: Scope, name: string | null, base: TextLook): TextLook {
  return chainOf(doc, scope, "text", name).reduce((look, el) => overText(doc, look, kid(el, "text-properties")), base);
}

/** What a drawing's style says, down to what it is based on. */
function graphicStyle(doc: Doc, scope: Scope, name: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const el of chainOf(doc, scope, "graphic", name)) {
    for (const attr of Array.from(kid(el, "graphic-properties")?.attributes ?? [])) out.set(attr.localName, attr.value);
    const mode = at(kid(el, "paragraph-properties"), "writing-mode");
    if (mode) out.set("writing-mode", mode);
  }
  return out;
}

// ---------------------------------------------------------------- opening the file

const plainHref = (href: string | null) => (href ?? "").replace(/^\.\//, "").replace(/\/$/, "");

async function openDoc(pack: Pack): Promise<{ doc: Doc; text: Element }> {
  const kind = pack.has("mimetype") ? new TextDecoder().decode((await pack.bytes("mimetype")) ?? undefined).trim() : "";
  if (/spreadsheet/.test(kind)) throw new ConvertError("This is an OpenDocument spreadsheet, not a text document.");
  if (/presentation/.test(kind)) throw new ConvertError("This is an OpenDocument presentation, not a text document.");
  if (!pack.has("content.xml")) throw new ConvertError("This is not an OpenDocument text.");
  const [manifest, content, styles, settings, meta] = await Promise.all(
    ["META-INF/manifest.xml", "content.xml", "styles.xml", "settings.xml", "meta.xml"].map((path) => pack.xml(path)),
  );
  if (find(manifest, "encryption-data")) throw new ConvertError(LOCKED);
  if (!content) throw new ConvertError(DAMAGED);
  const text = dig(content, "body", "text");
  if (!text) throw new ConvertError("This is not an OpenDocument text.");

  const named = new Map<string, Element>();
  const collect = (holder: Element | null, into: Map<string, Element>) => {
    for (const el of kids(holder)) {
      const name = at(el, "name") ?? "";
      if (el.localName === "style") into.set(key(at(el, "family") ?? "", name), el);
      else if (el.localName === "list-style") into.set(key("list", name), el);
      else if (el.localName === "default-style") into.set(`default|${at(el, "family") ?? ""}`, el);
    }
  };
  const scopes = { body: new Map<string, Element>(), page: new Map<string, Element>() };
  // Files in one piece keep everything in the content.
  for (const root of [styles, content]) collect(kid(root, "styles"), named);
  collect(kid(content, "automatic-styles"), scopes.body);
  collect(kid(styles, "automatic-styles"), scopes.page);
  const faces = new Map<string, string>();
  for (const root of [styles, content])
    for (const face of kids(kid(root, "font-face-decls"), "font-face")) {
      const family = at(face, "font-family")?.split(",")[0].replace(/['"]/g, "").trim();
      if (family) faces.set(at(face, "name") ?? "", family);
    }
  const pick = (name: string) =>
    new Map(
      [styles, content].flatMap((root) =>
        ["automatic-styles", "master-styles", "styles"].flatMap((holder) =>
          kids(kid(root, holder), name).map((el) => [at(el, "name") ?? "", el] as [string, Element]),
        ),
      ),
    );
  const item = (name: string) =>
    settings
      ? findAll(settings, "config-item")
          .find((el) => at(el, "name") === name)
          ?.textContent?.trim()
      : undefined;
  const generator = find(meta, "generator")?.textContent ?? "";
  const doc: Doc = {
    scopes,
    named,
    masters: pick("master-page"),
    layouts: pick("page-layout"),
    faces,
    outline: kids(kid(styles, "styles"), "outline-style")[0] ?? null,
    pictures: new Map(),
    gradients: pick("gradient"),
    fills: new Map(),
    formulas: new Map(),
    rooms: new Map(),
    counts: new Map(),
    notes: [],
    tabs: new Map(),
    traits: new Map(),
    over: new Map(),
    paras: new Map(),
    word: /MicrosoftWord|MicrosoftOffice/i.test(generator),
    sums: item("AddParaTableSpacing") === "true",
    tabsInside: item("TabsRelativeToIndent") !== "false",
  };
  const files = new Set<string>();
  const objects = new Set<string>();
  for (const root of [content, styles]) {
    if (!root) continue;
    for (const el of findAll(root, "image")) if (at(el, "href")) files.add(plainHref(at(el, "href")));
    for (const el of findAll(root, "object")) if (at(el, "href")) objects.add(plainHref(at(el, "href")));
  }
  await Promise.all([
    ...[...files].map(async (file) => {
      const bytes = await pack.bytes(resolvePath("", decodePath(file)));
      const mime = bytes && bytes.length > 0 ? pictureType(bytes) : null;
      if (bytes && mime) doc.pictures.set(file, { bytes, mime });
    }),
    ...[...pick("fill-image")].map(async ([name, el]) => {
      const bytes = await pack.bytes(resolvePath("", decodePath(plainHref(at(el, "href")))));
      const mime = bytes && bytes.length > 0 ? pictureType(bytes) : null;
      const color = bytes && mime ? await colorIn(bytes, mime) : null;
      if (bytes && mime && color) doc.fills.set(name, { bytes, mime, color });
    }),
    ...[...objects].map(async (object) => {
      const root = await pack.xml(`${resolvePath("", decodePath(object))}/content.xml`);
      const math = root?.localName === "math" ? root : find(root, "math");
      if (math) doc.formulas.set(object, math);
    }),
  ]);
  return { doc, text };
}

/** The colour of a picture from far away. */
async function colorIn(bytes: Uint8Array, mime: string): Promise<string | null> {
  try {
    const picture = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    pen.fillStyle = "#ffffff";
    pen.fillRect(0, 0, 8, 8);
    pen.imageSmoothingQuality = "high";
    pen.drawImage(picture, 0, 0, 8, 8);
    const { data } = pen.getImageData(0, 0, 8, 8);
    return fromChannels(
      [0, 1, 2].map((k) => Array.from({ length: 64 }, (_, i) => data[i * 4 + k]).reduce((a, b) => a + b, 0) / 64),
    );
  } catch {
    return null;
  }
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export async function readOdt(bytes: Uint8Array): Promise<FlowDoc> {
  const pack = await openPack(bytes, "an OpenDocument text");
  const { doc, text } = await openDoc(pack);
  const sections = readBody(doc, text);
  await settleTabs(doc.tabs);
  const out: FlowDoc = { kind: "flow", sections };
  const about = dig(await pack.xml("meta.xml"), "meta");
  const title = kid(about, "title")?.textContent?.trim();
  const author = (kid(about, "initial-creator") ?? kid(about, "creator"))?.textContent?.trim();
  if (title) out.title = title;
  if (author) out.author = author;
  return out;
}

// ---------------------------------------------------------------- pages

/** The page a master page describes, with its header and footer. */
function roomOf(doc: Doc, name: string | null): Room {
  const first = doc.masters.get(name ?? "") ?? doc.masters.get("Standard") ?? [...doc.masters.values()][0] ?? null;
  const id = at(first, "name") ?? "";
  const known = doc.rooms.get(id);
  if (known) return known;
  const layout = doc.layouts.get(at(first, "page-layout-name") ?? "") ?? null;
  const props = kid(layout, "page-layout-properties");
  const all = measure(at(props, "margin"));
  const edge = (side: Side) => measure(at(props, `margin-${side}`)) ?? all ?? 56.7;
  const w = measure(at(props, "page-width")) ?? 595.3;
  const h = measure(at(props, "page-height")) ?? 841.9;
  const columns = kid(props, "columns");
  const cols = Math.max(1, Math.round(numberOf(at(columns, "column-count")) ?? 1));
  const gap = measure(at(columns, "column-gap")) ?? 18;
  const margin: FlowMargin = { top: edge("top"), right: edge("right"), bottom: edge("bottom"), left: edge("left") };
  const room: Room = {
    w,
    h,
    margin,
    headerAt: margin.top,
    footerAt: margin.bottom,
    cols,
    gap,
    text: Math.max(36, (w - margin.left - margin.right - gap * (cols - 1)) / cols),
    kind: "nextPage",
  };
  doc.rooms.set(id, room);
  // A page that only comes first says what follows it; that is the one whose header counts.
  const next = doc.masters.get(at(first, "next-style-name") ?? "");
  for (const [place, side] of [
    ["header", "top"],
    ["footer", "bottom"],
  ] as const) {
    const holders = [next && next !== first ? kid(next, place) : null, kid(first, place), kid(first, `${place}-first`)];
    const env: Env = {
      scope: doc.scopes.page,
      room,
      place: "band",
      band: true,
      at: margin.left,
      width: w - margin.left - margin.right,
    };
    let blocks: FlowBlock[] = [];
    for (const el of holders)
      if (isBlank(blocks) && el && at(el, "display") !== "false") blocks = readBlocks(doc, el, env);
    numberLists(blocks, doc.traits);
    const box = dig(layout, `${place}-style`, "header-footer-properties");
    if (isBlank(blocks) && !box) continue;
    if (box) {
      // Headers stand inside the margin here, and the text begins below them.
      const high = measure(at(box, "height")) ?? Math.max(measure(at(box, "min-height")) ?? 0, heightOf(blocks));
      const space = measure(at(box, place === "header" ? "margin-bottom" : "margin-top")) ?? 0;
      room[place === "header" ? "headerAt" : "footerAt"] = margin[side];
      margin[side] = round(margin[side] + high + space);
    } else room[place === "header" ? "headerAt" : "footerAt"] = Math.min(36, margin[side] / 2);
    if (!isBlank(blocks)) room[place] = blocks;
  }
  if (!room.header && room.headerAt === margin.top) room.headerAt = Math.min(36, margin.top / 2);
  if (!room.footer && room.footerAt === margin.bottom) room.footerAt = Math.min(36, margin.bottom / 2);
  return room;
}

/** About how high paragraphs are that all fit on their line. */
function heightOf(blocks: readonly FlowBlock[]): number {
  return blocks.reduce((sum, block) => {
    if (block.kind === "table") {
      const pad = (block.pad?.top ?? 0) + (block.pad?.bottom ?? 0);
      return (
        sum +
        block.rows.reduce(
          (all, row) => all + Math.max(row.h ?? 0, ...row.cells.map((cell) => heightOf(cell.blocks) + pad)),
          0,
        )
      );
    }
    if (block.kind !== "para") return sum;
    const size = Math.max(6, ...block.runs.map((run) => run.style?.size ?? 0));
    const picture = Math.max(0, ...block.runs.map((run) => (run.image && !run.image.float ? run.image.h : 0)));
    const times = block.line && "times" in block.line ? block.line.times : 1;
    const lines = 1 + block.runs.reduce((all, run) => all + (run.text?.split("\n").length ?? 1) - 1, 0);
    const line = block.line && "points" in block.line && !block.line.atLeast ? block.line.points : size * 1.2 * times;
    return sum + Math.max(picture, line * lines) + (block.before ?? 0) + (block.after ?? 0);
  }, 0);
}

function readBody(doc: Doc, text: Element): FlowSection[] {
  const body = { chunks: [] as Chunk<Room>[], blocks: [] as FlowBlock[], loose: [] as Piece[], begun: false };
  const room = roomOf(doc, null);
  const env: Env = {
    scope: doc.scopes.body,
    room,
    place: "body",
    band: false,
    at: room.margin.left,
    width: room.text,
    body,
  };
  walk(doc, text, env, body.blocks);
  flushLoose(doc, env);
  finishChunk(doc, env);
  if (body.chunks.length === 0) body.chunks.push({ room: env.room, blocks: [] });
  body.chunks[body.chunks.length - 1].blocks.push(...readNotes(doc, env.room));
  return joinChunks(body.chunks).map(({ room: own, blocks }) => {
    if (blocks.length === 0) blocks.push(...makeBlocks(doc, newLine(doc, env, null), null));
    tidyBreaks(blocks);
    numberLists(blocks, doc.traits);
    const section: FlowSection = { w: round(own.w), h: round(own.h), margin: roundMargin(own.margin), blocks };
    if (own.cols > 1) Object.assign(section, { columns: own.cols, gap: round(own.gap) });
    if (own.header) section.header = own.header;
    if (own.footer) section.footer = own.footer;
    section.headerAt = round(own.headerAt);
    section.footerAt = round(own.footerAt);
    return section;
  });
}

const roundMargin = ({ top, right, bottom, left }: FlowMargin): FlowMargin => ({
  top: round(top),
  right: round(right),
  bottom: round(bottom),
  left: round(left),
});

/** Puts what was read so far down as a section, when there is anything. */
function finishChunk(doc: Doc, env: Env) {
  const { body } = env;
  if (!body || body.blocks.length === 0) return;
  settleParas(body.blocks, doc.traits, { sums: doc.sums, cell: false });
  body.chunks.push({ room: env.room, blocks: body.blocks.splice(0) });
}

function enterRoom(env: Env, room: Room) {
  env.room = room;
  env.at = room.margin.left;
  env.width = room.text;
}

/** A paragraph or table that asks for another kind of page starts a section. */
function turnPage(doc: Doc, env: Env, master: string | null) {
  const { body } = env;
  if (!body || env.place !== "body") return;
  if (master) {
    finishChunk(doc, env);
    enterRoom(env, roomOf(doc, master));
  }
  body.begun = true;
}

function readNotes(doc: Doc, room: Room): FlowBlock[] {
  const out: FlowBlock[] = [];
  for (const end of [false, true]) {
    // Notes can hold notes of their own only in broken files; the list is fixed before it is read.
    for (const note of [...doc.notes].filter((one) => one.end === end)) {
      const env: Env = { scope: note.scope, room, place: "note", band: false, at: room.margin.left, width: room.text };
      const paras = onlyParas(doc.traits, readBlocks(doc, note.body, env));
      const first = paras[0];
      if (!first) continue;
      const start = first.runs.find((run) => run.image === undefined);
      const style: FlowStyle = { ...(start?.style ?? {}), script: "super" };
      const space = /^\s/.test(start?.text ?? "") ? "" : " ";
      first.runs = joinRuns([
        { text: note.mark, style },
        { text: space, style: { ...style, script: undefined } },
        ...first.runs,
      ]);
      const usual = paraStyle(doc, doc.scopes.body, "Standard").text.size ?? 11;
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

function readBlocks(doc: Doc, holder: Element, env: Env): FlowBlock[] {
  const out: FlowBlock[] = [];
  walk(doc, holder, { ...env, body: undefined }, out);
  settleParas(out, doc.traits, { sums: doc.sums, cell: env.place === "cell" });
  return out;
}

const DRAWN = /^(frame|custom-shape|rect|ellipse|circle|line|connector|polyline|polygon|path|g|regular-polygon)$/;

function walk(doc: Doc, holder: Element, env: Env, out: FlowBlock[]) {
  for (const el of kids(holder)) {
    switch (el.localName) {
      case "p":
      case "h":
        readPara(doc, el, env, out, null);
        break;
      case "list":
        readList(doc, el, env, out, 0, at(el, "style-name"));
        break;
      case "numbered-paragraph": {
        const depth = Math.max(0, Math.round(numberOf(at(el, "level")) ?? 1) - 1);
        const level = levelOf(doc, env.scope, at(el, "style-name") ?? "", depth);
        const start = numberOf(at(el, "start-value"));
        for (const p of kids(el))
          if (p.localName === "p" || p.localName === "h")
            readPara(doc, p, env, out, {
              level,
              depth,
              label: labelOf(doc, at(el, "style-name") ?? "", level, depth, start),
              more: false,
            });
        break;
      }
      case "table":
        flushLoose(doc, env);
        turnPage(doc, env, masterOfTable(doc, el, env));
        out.push(readTable(doc, el, env));
        break;
      case "section":
        if (at(el, "display") !== "none") readSection(doc, el, env, out);
        break;
      case "table-of-content":
      case "illustration-index":
      case "table-index":
      case "object-index":
      case "user-index":
      case "alphabetical-index":
      case "bibliography": {
        const body = kid(el, "index-body");
        if (body) walk(doc, body, env, out);
        break;
      }
      case "index-title":
        walk(doc, el, env, out);
        break;
      default:
        // Drawings of the page itself hang on the paragraph that comes next.
        if (env.body && DRAWN.test(el.localName)) {
          const line = newLine(doc, env, null);
          drawAny(line, el);
          env.body.loose.push(...line.pieces);
        }
    }
  }
}

/** Drawings no paragraph came for. */
function flushLoose(doc: Doc, env: Env) {
  if (!env.body || env.body.loose.length === 0) return;
  const line = newLine(doc, env, null);
  line.pieces.push(...env.body.loose.splice(0));
  env.body.blocks.push(...makeBlocks(doc, line, null));
}

/** Part of the text with columns of its own. */
function readSection(doc: Doc, el: Element, env: Env, out: FlowBlock[]) {
  const style = chainOf(doc, env.scope, "section", at(el, "style-name"));
  const columns = style.map((one) => dig(one, "section-properties", "columns")).find(Boolean) ?? null;
  const cols = Math.max(1, Math.round(numberOf(at(columns, "column-count")) ?? 1));
  if (!env.body || cols === env.room.cols) {
    walk(doc, el, env, out);
    return;
  }
  const around = env.room;
  const gap = measure(at(columns, "column-gap")) ?? 18;
  const text = Math.max(36, (around.w - around.margin.left - around.margin.right - gap * (cols - 1)) / cols);
  flushLoose(doc, env);
  finishChunk(doc, env);
  enterRoom(env, { ...around, cols, gap, text, kind: "continuous" });
  walk(doc, el, env, out);
  flushLoose(doc, env);
  finishChunk(doc, env);
  enterRoom(env, { ...around, kind: "continuous" });
}

// ---------------------------------------------------------------- lists

function levelOf(doc: Doc, scope: Scope, name: string, depth: number): Element | null {
  const style = scope.get(key("list", name)) ?? doc.named.get(key("list", name));
  return kids(style).find((el) => numberOf(at(el, "level")) === depth + 1) ?? null;
}

function readList(doc: Doc, list: Element, env: Env, out: FlowBlock[], depth: number, inherited: string | null) {
  const name = at(list, "style-name") ?? inherited ?? "";
  const goesOn = at(list, "continue-numbering") === "true" || at(list, "continue-list") !== null;
  // A list that does not say it goes on starts over.
  if (depth === 0 && !goesOn) doc.counts.delete(name);
  for (const item of kids(list)) {
    if (item.localName !== "list-item" && item.localName !== "list-header") continue;
    const start = numberOf(at(item, "start-value"));
    let first = item.localName === "list-item";
    for (const el of kids(item)) {
      if (el.localName === "list") readList(doc, el, env, out, depth + 1, name);
      else if (el.localName === "p" || el.localName === "h") {
        const own = paraStyle(doc, env.scope, at(el, "style-name")).list || name;
        const level = levelOf(doc, env.scope, name || own, depth) ?? levelOf(doc, env.scope, own, depth);
        const label = first ? labelOf(doc, name || own, level, depth, start) : null;
        readPara(doc, el, env, out, { level, depth, label, more: !first });
        first = false;
      } else if (el.localName === "table") out.push(readTable(doc, el, env));
      else walk(doc, wrap(el), env, out);
    }
  }
}

/** One element by itself, for a walk over it. */
function wrap(el: Element): Element {
  const holder = el.ownerDocument.createElementNS(el.namespaceURI, "holder");
  holder.append(el.cloneNode(true));
  return holder;
}

const FORMATS: Record<string, string> = {
  "1": "decimal",
  a: "lowerLetter",
  A: "upperLetter",
  i: "lowerRoman",
  I: "upperRoman",
};

function labelOf(doc: Doc, name: string, level: Element | null, depth: number, start: number | undefined): Label {
  if (!level) return { type: "bullet", mark: "•" };
  if (/bullet$/.test(level.localName)) {
    const props = kid(level, "text-properties");
    const named =
      at(props, "font-name") ??
      at(dig(doc.named.get(key("text", at(level, "style-name") ?? "")), "text-properties"), "font-name");
    const font = (named ? (doc.faces.get(named) ?? named) : undefined) ?? at(props, "font-family") ?? undefined;
    const sign = plainSymbols(at(level, "bullet-char") ?? "•", font).trim();
    return { type: "bullet", mark: sign === "o" && /courier/i.test(font ?? "") ? "◦" : sign || "•" };
  }
  if (/image$/.test(level.localName)) return { type: "bullet", mark: "•" };
  let counts = doc.counts.get(name);
  if (!counts) doc.counts.set(name, (counts = []));
  const startOf = (el: Element | null) => numberOf(at(el, "start-value")) ?? 1;
  const levels = kids(level.parentElement);
  const at1 = (index: number) => levels.find((el) => numberOf(at(el, "level")) === index + 1) ?? null;
  for (let i = 0; i < depth; i += 1) counts[i] ??= startOf(at1(i));
  const now = counts[depth];
  counts[depth] = start ?? (now === undefined ? startOf(level) : now + 1);
  counts.length = depth + 1;
  const value = counts[depth] ?? 1;
  const format = (el: Element | null) => {
    const sign = at(el, "num-format") ?? "";
    return sign === "" ? "none" : (FORMATS[sign] ?? "decimal");
  };
  const prefix = at(level, "num-prefix") ?? "";
  const suffix = at(level, "num-suffix") ?? "";
  const shown = Math.max(1, Math.min(depth + 1, Math.round(numberOf(at(level, "display-levels")) ?? 1)));
  const pattern = at(level, "num-list-format");
  const kind = KINDS[format(level)];
  const bare = !/[\p{L}\p{N}]/u.test(prefix + suffix);
  if (kind && shown === 1 && bare && (kind === "1" || (value > 0 && value < 4000)))
    return { type: "number", mark: prefix.trimStart() + kind + suffix.trimEnd(), value };
  const count = (index: number) => countText(format(at1(index)), counts?.[index] ?? 1);
  const text = pattern
    ? pattern.replace(/%(\d+)%/g, (_, digit: string) => count(Number(digit) - 1))
    : prefix +
      Array.from({ length: shown }, (_, i) => count(depth - shown + 1 + i))
        .filter(Boolean)
        .join(".") +
      suffix;
  return {
    type: "number",
    text: format(level) === "none" && !bare ? prefix + suffix : format(level) === "none" ? "" : text,
    value,
  };
}

/** Where a list level puts its words and its mark. */
function listPlace(
  level: Element | null,
): { left: number; first: number; stop?: number; follow: string; old: boolean } | null {
  const props = kid(level, "list-level-properties");
  if (!props) return null;
  const aligned = kid(props, "list-level-label-alignment");
  if (at(props, "list-level-position-and-space-mode") === "label-alignment" && aligned)
    return {
      left: measure(at(aligned, "margin-left")) ?? 0,
      first: measure(at(aligned, "text-indent")) ?? 0,
      stop: measure(at(aligned, "list-tab-stop-position")),
      follow: at(aligned, "label-followed-by") ?? "listtab",
      old: false,
    };
  const width = Math.max(measure(at(props, "min-label-width")) ?? 0, 0);
  return { left: (measure(at(props, "space-before")) ?? 0) + width, first: -width, follow: "listtab", old: true };
}

// ---------------------------------------------------------------- paragraphs

type Line = {
  doc: Doc;
  env: Env;
  style: ParaStyle;
  para: ParaLook;
  text: TextLook;
  pieces: Piece[];
  link?: string;
  back?: string;
  tall: number;
  push: number;
  /** The last thing read was a space that swallows the next one. */
  space: boolean;
  align?: FlowPara["align"];
};

function newLine(doc: Doc, env: Env, name: string | null): Line {
  const style = paraStyle(doc, env.scope, name);
  const para = env.base ? { ...env.base.para, ...style.para } : style.para;
  const text = env.base ? { ...style.text, ...env.base.text } : style.text;
  return { doc, env, style, para, text, pieces: [], back: para.fill ?? env.back, tall: 0, push: 0, space: true };
}

function readPara(doc: Doc, el: Element, env: Env, out: FlowBlock[], item: Item | null) {
  const line = newLine(doc, env, at(el, "style-name"));
  if (env.body) {
    if (env.place === "body") turnPage(doc, env, line.style.master);
    line.pieces.push(...env.body.loose.splice(0));
  }
  const { text } = line;
  readInline(line, el, text);
  const level = el.localName === "h" ? Math.round(numberOf(at(el, "outline-level")) ?? 1) : undefined;
  const numbered = item ?? (level && at(el, "is-list-header") !== "true" ? outlineItem(doc, line, level) : null);
  if (env.place === "body" && line.para.breakBefore === "page" && !line.style.master)
    out.push(...makeBlocks(doc, line, numbered, level, true));
  else out.push(...makeBlocks(doc, line, numbered, level));
  if (env.place === "body" && line.para.breakAfter === "page") out.push({ kind: "break" });
}

/** Headings may be numbered without being in a list. */
function outlineItem(doc: Doc, line: Line, level: number): Item | null {
  const own = kids(doc.outline).find((el) => numberOf(at(el, "level")) === level);
  if (!own || !(at(own, "num-format") ?? "")) return null;
  const label = labelOf(doc, "|outline", own, level - 1, undefined);
  return { level: own, depth: level - 1, label, more: false };
}

function makeBlocks(doc: Doc, line: Line, item: Item | null, level?: number, breaks = false): FlowBlock[] {
  const { env, pieces } = line;
  const blocks: FlowBlock[] = [];
  const boxes = pieces.flatMap((piece) => (piece.kind === "box" ? [piece] : [])).sort((a, b) => a.z - b.z);
  const stands = pieces.flatMap((piece) => (piece.kind === "stand" ? [piece] : []));
  const runs = joinRuns(pieces.flatMap((piece) => (piece.kind === "run" ? [piece.run] : [])));
  settleDepth(runs, boxes, doc.over);
  const para = makePara(doc, line, runs, item, level);
  if (breaks) para.breakBefore = true;
  if (para.runs.every((run) => run.image?.float))
    para.runs.push({ text: "", style: styleOf(line, line.text, "plain") });
  for (const piece of pieces) if (piece.kind === "paras") blocks.push(...piece.paras);
  blocks.push(...boxes.map(({ box }) => box));
  for (const one of stands.filter(({ below }) => !below)) blocks.push(standPara(one, env.width));
  blocks.push(...splitLines(para, doc.tabs, doc.traits));
  for (const one of stands.filter(({ below }) => below)) blocks.push(standPara(one, env.width));
  return blocks;
}

function makePara(doc: Doc, line: Line, runs: FlowRun[], item: Item | null, level?: number): FlowPara {
  const { para: look, style, env } = line;
  const para: FlowPara = { kind: "para", runs };
  let { left = 0, first = 0 } = look;
  const place = item ? listPlace(item.level) : null;
  const stops = [...(look.tabs ?? [])];
  if (place) {
    // What was set by hand on the paragraph counts more than its list, what its style says less.
    if (place.old) {
      left = (style.own.left ?? 0) + place.left;
      first = style.own.first ?? place.first;
    } else {
      left = style.own.left ?? place.left;
      first = style.own.first ?? place.first;
    }
  }
  if (item && !item.label) first = item.more ? (style.own.first ?? 0) : 0;
  const right = look.right ?? 0;
  const sides: Record<string, FlowPara["align"]> = {
    center: "center",
    justify: "justify",
    left: "left",
    right: "right",
    start: look.rtl ? "right" : "left",
    end: look.rtl ? "left" : "right",
  };
  const align = line.align ?? sides[look.align ?? "start"] ?? (look.rtl ? "right" : "left");
  if (align !== "left") para.align = align;
  const [west, east] = look.rtl ? [right, left] : [left, right];
  if (west) para.left = round(west);
  if (east) para.right = round(east);
  if (first) para.first = round(first);
  para.before = round((look.before ?? 0) + line.push);
  para.after = round(look.after ?? 0);
  para.line = look.line ?? { times: 1 };
  if (line.tall > 0 && !runs.some((run) => run.text)) para.line = { points: round(line.tall), atLeast: true };
  if (level && level <= 6) para.heading = level as FlowPara["heading"];
  if (look.keepNext) para.keepNext = true;
  if (look.fill) para.fill = look.fill;
  const { top, right: r, bottom, left: l } = look.edges ?? {};
  if (top || r || bottom || l)
    para.border = cleanEdges({
      top: top ?? undefined,
      right: r ?? undefined,
      bottom: bottom ?? undefined,
      left: l ?? undefined,
    });

  const label = item?.label;
  if (label?.mark) para.list = { type: label.type, mark: label.mark, level: item?.depth ?? 0 };
  else if (label?.text) {
    const look2 = textStyle(doc, env.scope, at(item?.level, "style-name"), line.text);
    const own = styleOf(line, overText(doc, look2, kid(item?.level, "text-properties")), "plain");
    const gap = place?.follow === "nothing" ? "" : place?.follow === "space" ? " " : "\t";
    para.runs = joinRuns([{ text: label.text, style: own }, ...(gap ? [{ text: gap, style: own }] : []), ...runs]);
    if (gap === "\t") {
      const stop = first < 0 ? left : place?.stop;
      if (stop !== undefined) stops.push({ at: doc.tabsInside ? stop - left : stop, kind: "left" });
    }
  }
  const shift = doc.tabsInside ? left : 0;
  doc.tabs.set(para, {
    stops: stops.map((stop) => ({ ...stop, at: stop.at + shift })).filter((stop) => stop.at > 0.01),
    width: env.width,
    step: look.step || 36,
  });
  doc.traits.set(para, {
    style: style.name,
    context: look.context ?? false,
    autoBefore: false,
    autoAfter: false,
    list: "",
    value: label?.value,
    edges: look.edges ?? {},
  });
  return para;
}

// ---------------------------------------------------------------- words

function styleOf(line: Line, look: TextLook, script: Script): FlowStyle {
  const { doc } = line;
  // Word marks the words that are set in the fonts for Hindi and Arabic; others go by the letters.
  const complex = doc.word
    ? Boolean(look.complex)
    : look.complex === true || script === "indic" || script === "complex";
  const font = complex ? (look.fontCs ?? look.font) : script === "east" ? (look.fontEast ?? look.font) : look.font;
  const shown = script === "indic" && !drawsIndic(font) ? "Nirmala UI" : font;
  const size = (complex ? look.sizeCs : script === "east" ? look.sizeEast : undefined) ?? look.size ?? 12;
  const style: FlowStyle = {
    font: isSymbolFont(shown) ? (line.text.font ?? "Times New Roman") : (shown ?? "Times New Roman"),
    size: round(size),
  };
  const back = look.back ?? line.back;
  const color = look.color ?? (back && isDark(back) ? "#ffffff" : undefined);
  if (color) style.color = color;
  if (complex ? (look.boldCs ?? look.bold) : look.bold) style.bold = true;
  if (complex ? (look.italicCs ?? look.italic) : look.italic) style.italic = true;
  if (look.under) style.underline = true;
  if (look.strike) style.strike = true;
  if (look.script) style.script = look.script;
  if (look.back) style.highlight = look.back;
  if (look.tracking) style.tracking = round(look.tracking);
  if (line.link) style.link = line.link;
  return style;
}

function put(line: Line, raw: string, look: TextLook) {
  if (raw === "" || look.hidden) return;
  const token = /^\{pages?\}$/.test(raw);
  const known = new Map<Script, FlowStyle>();
  const of = (script: Script) => {
    let style = known.get(script);
    if (!style) known.set(script, (style = styleOf(line, look, script)));
    return style;
  };
  const alike = (a: Script, b: Script) => {
    const [x, y] = [of(a), of(b)];
    return x.font === y.font && x.size === y.size && x.bold === y.bold && x.italic === y.italic;
  };
  for (const part of splitScripts(plainSymbols(raw, look.font), alike)) {
    for (const piece of token ? [{ text: part.text, scale: 1 }] : capitals(part.text, look.caps, look.small)) {
      const style = { ...of(part.script) };
      if (piece.scale !== 1) style.size = round((style.size ?? 12) * piece.scale);
      line.pieces.push({ kind: "run", run: { text: piece.text, style } });
    }
  }
}

/** Letters between the tags: runs of white space are one space, and none at the start. */
function putText(line: Line, data: string, look: TextLook) {
  let text = data.replace(/[ \t\r\n]+/g, " ");
  if (line.space) text = text.replace(/^ /, "");
  if (text === "") return;
  line.space = text.endsWith(" ");
  put(line, text, look);
}

/** Marks of things that are not shown in the text. */
const UNSEEN =
  /^(bookmark|bookmark-start|bookmark-end|reference-mark|reference-mark-start|reference-mark-end|change|change-start|change-end|soft-page-break|annotation|annotation-end|toc-mark|toc-mark-start|toc-mark-end|user-index-mark.*|alphabetical-index-mark.*|script|dde-connection|hidden-paragraph|title|desc|forms|variable-decls|sequence-decls|tracked-changes)$/;

function readInline(line: Line, holder: Element, look: TextLook) {
  const { doc, env } = line;
  for (const node of Array.from(holder.childNodes)) {
    if (node.nodeType === 3 || node.nodeType === 4) {
      putText(line, node.nodeValue ?? "", look);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    switch (el.localName) {
      case "span": {
        const own = textStyle(doc, env.scope, at(el, "style-name"), look);
        // A check box as newer programs write it says so around the sign.
        readInline(line, el, own);
        break;
      }
      case "content-control": {
        if (at(el, "checkbox") === "true") {
          const inner = textStyle(doc, env.scope, at(kid(el, "span"), "style-name"), look);
          put(line, at(el, "checked") === "true" ? "☑" : "☐", inner);
          line.space = false;
        } else readInline(line, el, look);
        break;
      }
      case "a": {
        const before = line.link;
        line.link = outsideLink(at(el, "href")) ?? before;
        readInline(line, el, textStyle(doc, env.scope, at(el, "style-name"), look));
        line.link = before;
        break;
      }
      case "s":
        put(line, " ".repeat(Math.max(1, Math.min(500, Math.round(numberOf(at(el, "c")) ?? 1)))), look);
        line.space = false;
        break;
      case "tab":
        put(line, "\t", look);
        line.space = false;
        break;
      case "line-break":
        put(line, "\n", look);
        line.space = false;
        break;
      case "note": {
        if (look.hidden) break;
        const body = kid(el, "note-body");
        const citation = kid(el, "note-citation");
        const mark = at(citation, "label") ?? citation?.textContent?.trim() ?? "";
        if (body) doc.notes.push({ mark, body, end: at(el, "note-class") === "endnote", scope: env.scope });
        put(line, mark, { ...look, script: "super" });
        line.space = false;
        break;
      }
      case "page-number":
        if (env.band && (at(el, "select-page") ?? "current") === "current") put(line, "{page}", look);
        else readInline(line, el, look);
        line.space = false;
        break;
      case "page-count":
        if (env.band) put(line, "{pages}", look);
        else readInline(line, el, look);
        line.space = false;
        break;
      case "ruby":
        if (kid(el, "ruby-base")) readInline(line, kid(el, "ruby-base") as Element, look);
        break;
      case "hidden-text":
        if (at(el, "is-hidden") !== "true") readInline(line, el, look);
        break;
      default:
        if (DRAWN.test(el.localName)) {
          try {
            drawAny(line, el);
          } catch {
            // A drawing that cannot be made out is left out; the words go on.
          }
        } else if (!UNSEEN.test(el.localName)) readInline(line, el, look);
    }
  }
}

// ---------------------------------------------------------------- drawings

type Spot = { x: number; y: number; from: "page" | "para" };

/** Where a drawing stands; null for one in the line. */
function spotOf(
  line: Line,
  el: Element,
  props: Map<string, string>,
  w: number,
  h: number,
  x: number,
  y: number,
): Spot | null {
  const { env } = line;
  const { room } = env;
  const anchor = at(el, "anchor-type") ?? (line.env.place === "body" ? "paragraph" : "paragraph");
  if (anchor === "as-char") return null;
  const onPage = anchor === "page";
  const relH = props.get("horizontal-rel") ?? (onPage ? "page" : "paragraph");
  const relV = props.get("vertical-rel") ?? (onPage ? "page" : "paragraph");
  const posH = props.get("horizontal-pos") ?? "from-left";
  const posV = props.get("vertical-pos") ?? "from-top";
  const wide: [number, number] =
    relH === "page"
      ? [0, room.w]
      : relH === "page-content"
        ? [room.margin.left, room.w - room.margin.left - room.margin.right]
        : relH === "page-start-margin"
          ? [0, room.margin.left]
          : relH === "page-end-margin"
            ? [room.w - room.margin.right, room.margin.right]
            : [env.at, env.width];
  const high: [number, number] | null =
    env.place === "cell" || env.place === "box"
      ? null
      : relV === "page"
        ? [0, room.h]
        : relV === "page-content"
          ? [room.margin.top, room.h - room.margin.top - room.margin.bottom]
          : relV === "page-content-top"
            ? [0, room.margin.top]
            : relV === "page-content-bottom"
              ? [room.h - room.margin.bottom, room.margin.bottom]
              : null;
  const left =
    posH === "center"
      ? wide[0] + (wide[1] - w) / 2
      : posH === "right" || posH === "outside"
        ? wide[0] + wide[1] - w
        : posH === "left" || posH === "inside"
          ? wide[0]
          : wide[0] + x;
  if (!high) return { x: round(left - env.at), y: round(/^from/.test(posV) ? y : 0), from: "para" };
  const top =
    posV === "middle"
      ? high[0] + (high[1] - h) / 2
      : posV === "bottom"
        ? high[0] + high[1] - h
        : posV === "top"
          ? high[0]
          : high[0] + y;
  return { x: round(left), y: round(top), from: "page" };
}

/** A drawing turned and moved, step after step: "rotate (0.5) translate (1cm 2cm)". */
function turnOf(el: Element, w: number, h: number): { angle: number; x: number; y: number } | null {
  const steps = [...(at(el, "transform") ?? "").matchAll(/(rotate|translate)\s*\(([^)]*)\)/g)];
  if (!steps.some(([, name]) => name === "rotate")) return null;
  let [x, y] = [w / 2, h / 2];
  let turn = 0;
  for (const [, name, value] of steps) {
    const parts = value.trim().split(/[\s,]+/);
    if (name === "translate") {
      x += measure(parts[0]) ?? 0;
      y += measure(parts[1]) ?? 0;
      continue;
    }
    const rad = parseFloat(parts[0]) || 0;
    [x, y] = [Math.cos(rad) * x + Math.sin(rad) * y, Math.cos(rad) * y - Math.sin(rad) * x];
    turn -= (rad * 180) / Math.PI;
  }
  return { angle: round(turn), x: x - w / 2, y: y - h / 2 };
}

/** The words stand beside a drawing that says so. Pictures see to that themselves. */
function keepClear(line: Line, props: Map<string, string>, spot: Spot | null, w: number, h: number) {
  const { env, para } = line;
  if (!spot || env.place !== "body" || !/^(left|right|parallel|dynamic|biggest)$/.test(props.get("wrap") ?? "")) return;
  const before = env.body?.blocks ?? [];
  const first =
    env.body !== undefined &&
    (before.length === 0 || before[before.length - 1].kind === "break" || para.breakBefore === "page");
  const ground = { at: env.at, width: env.width, top: env.room.margin.top, high: env.room.h, first };
  const image = spacerFor(ground, spot, w, h);
  if (image === "below") {
    if (spot.from === "para" && spot.y > -h && spot.y < 24) line.push = Math.max(line.push, spot.y + h);
  } else if (image) line.pieces.push({ kind: "run", run: { image } });
}

function drawAny(line: Line, el: Element, within?: { spot: Spot; frame: Frame }) {
  const { doc, env } = line;
  const props = graphicStyle(doc, env.scope, at(el, "style-name"));
  const z = numberOf(at(el, "z-index")) ?? 0;
  const isLine = /^(line|connector)$/.test(el.localName);
  const end = (name: string) => measure(at(el, name)) ?? 0;
  const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(end);
  if (el.localName === "g") {
    const shapes = kids(el).filter((child) => DRAWN.test(child.localName));
    const boxes = shapes.map(frameOf);
    if (boxes.length === 0) return;
    const x0 = Math.min(...boxes.map((box) => box.x));
    const y0 = Math.min(...boxes.map((box) => box.y));
    const w = Math.max(...boxes.map((box) => box.x + box.w)) - x0;
    const h = Math.max(...boxes.map((box) => box.y + box.h)) - y0;
    const spot = within?.spot ?? spotOf(line, el, props, w, h, x0, y0) ?? inlineSpot(line, w);
    if (!within && at(el, "anchor-type") === "as-char") line.tall = Math.max(line.tall, h);
    else if (!within) keepClear(line, props, spot, w, h);
    shapes.forEach((shape, i) =>
      drawAny(line, shape, {
        spot,
        frame: {
          ...boxes[i],
          x: boxes[i].x - x0 + (within?.frame.x ?? 0),
          y: boxes[i].y - y0 + (within?.frame.y ?? 0),
        },
      }),
    );
    return;
  }
  const own = frameOf(el);
  const turn = turnOf(el, own.w, own.h);
  const spot = within ? within.spot : spotOf(line, el, props, own.w, own.h, own.x, own.y);
  const frame: Frame = within ? within.frame : { x: 0, y: 0, w: own.w, h: own.h };
  const through = props.get("wrap") === "run-through";
  const behind = through && props.get("run-through") === "background";
  const alone = props.get("wrap") === "none" && spot?.from === "para" && !behind;

  if (el.localName === "frame") {
    const formula = kids(el, "object")
      .map((object) => (at(object, "href") ? doc.formulas.get(plainHref(at(object, "href"))) : find(object, "math")))
      .find(Boolean);
    if (formula) {
      for (const run of mathRuns(
        mathParts(formula),
        styleOf(line, { ...line.text, italic: false, font: "Cambria Math" }, "plain"),
      ))
        line.pieces.push({ kind: "run", run });
      line.space = false;
      if (at(formula, "display") === "block" && kids(el.parentElement).length === 1) line.align = "center";
      return;
    }
    const image = imageOf(doc, el, props, own.w, own.h);
    if (image) {
      if (turn) image.angle = turn.angle;
      if (alone && spot && env.place === "body") {
        line.pieces.push({
          kind: "stand",
          image,
          x: spot.x,
          before: spot.y,
          after: measure(props.get("margin-bottom")) ?? 0,
          below: spot.y >= 24,
        });
        return;
      }
      addImage(line, image, frame, spot, { behind, free: through, z });
      line.space = false;
      return;
    }
    const text = kid(el, "text-box");
    if (!text) return;
    if (env.place === "band" && own.w < 4 && spot?.from === "para") {
      // Page numbers used to be put into headers and footers this way.
      const paras = onlyParas(doc.traits, readBlocks(doc, text, { ...env, body: undefined }));
      const side = props.get("horizontal-pos");
      if (side === "right" || side === "center") for (const para of paras) para.align = side;
      line.pieces.push({ kind: "paras", paras });
      return;
    }
    const high = own.h || (measure(at(text, "min-height")) ?? 20);
    const fill =
      props.get("fill") === "solid" ? colorOf(props.get("fill-color")) : colorOf(props.get("background-color"));
    const border = edgesOf2(props);
    addBox(line, text, { ...frame, h: high }, spot, {
      fill: fill ?? null,
      stroke: border,
      shape: undefined,
      props,
      z,
      alone,
      grows: !own.h,
      keeps: !within,
    });
    return;
  }
  if (!within && !isLine) keepClear(line, props, spot, own.w, own.h);
  const base = defaultOf(doc, "graphic");
  const given = (name: string) => props.get(name) ?? at(kid(base, "graphic-properties"), name) ?? undefined;
  const stroke = strokeOf(given);
  const boxless = env.place === "cell" || env.place === "box";
  const degrees = turn?.angle ?? 0;
  if (isLine) {
    if (!stroke) return;
    const how = { flipH: x2 < x1, flipV: y2 < y1 };
    const [start, end] = ["marker-start", "marker-end"].map((name) => Boolean(given(name)));
    const type = at(el, "type") ?? "standard";
    const kind =
      el.localName === "line" || type === "line" ? "line" : type === "curve" ? "curvedConnector3" : "bentConnector3";
    addLine(line, frame, spot, { stroke, kind, ...how, start, end, degrees, behind, free: through, z });
    return;
  }
  const paint = paintOf(doc, given);
  const geometry = kid(el, "enhanced-geometry");
  const drawn =
    /^(custom-shape|path|polygon|polyline)$/.test(el.localName) && shapeOf(el) === "rect" ? outlineOf(el, frame) : null;
  const across = drawn?.kind === "line" && stroke ? drawn.line : null;
  if (across && stroke) {
    // A line that was spelled out as a shape.
    const [a, b] = across;
    const box = {
      x: frame.x + Math.min(a.x, b.x),
      y: frame.y + Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
    const [start, end] = ["marker-start", "marker-end"].map((name) => Boolean(given(name)));
    const how = { flipH: b.x < a.x, flipV: b.y < a.y, start, end, degrees, behind, free: through, z };
    addLine(line, box, spot, { stroke, kind: "line", ...how });
    return;
  }
  const quarters = quartersOf(degrees);
  const mirrors = {
    flipH: at(geometry, "mirror-horizontal") === "true",
    flipV: at(geometry, "mirror-vertical") === "true",
  };
  const named = drawn ? (drawn.kind ?? "free") : shapeOf(el);
  const shape = turnedShape(named, quarters ?? 0, mirrors);
  const look = {
    fill: paint?.color ?? null,
    stroke,
    shape: shape === "rect" || shape === "free" ? undefined : shape,
    props,
    z,
    alone,
  };
  const bare = !kids(el).some(
    (child) => /^(p|h|list|table)$/.test(child.localName) && (child.textContent ?? "").trim() !== "",
  );
  // The words of a shape lie over it.
  const depth = { behind: behind || !bare, free: through, z };
  const addPicture = (image: FlowImage | null, reach = 0) => {
    if (image && degrees) image.angle = degrees;
    if (image) addImage(line, image, { ...frame, x: frame.x - reach, y: frame.y - reach }, spot, depth);
  };
  if (drawn && named === "free") {
    // The line is drawn half outside.
    const reach = (stroke?.width ?? 0) / 2;
    if (paint || stroke)
      addPicture(
        paintImage(Math.max(0.5, frame.w + reach * 2), Math.max(0.5, frame.h + reach * 2), (pen) => {
          pen.translate(reach, reach);
          if (mirrors.flipH || mirrors.flipV) {
            pen.translate(mirrors.flipH ? frame.w : 0, mirrors.flipV ? frame.h : 0);
            pen.scale(mirrors.flipH ? -1 : 1, mirrors.flipV ? -1 : 1);
          }
          for (const part of drawn.parts) {
            if (paint && part.filled) {
              pen.fillStyle = fillStyle(pen, paint, frame.w, frame.h);
              pen.fill(part.path, "evenodd");
            }
            if (stroke && part.lined) strokeWith(pen, stroke, part.path);
          }
        }),
        reach,
      );
    if (!bare) addBox(line, el, frame, spot, { ...look, fill: null, stroke: null });
    return;
  }
  const texture =
    given("fill") === "bitmap" && given("repeat") === "stretch"
      ? doc.fills.get(given("fill-image-name") ?? "")
      : undefined;
  if (texture) {
    addPicture({ bytes: texture.bytes, mime: texture.mime, w: round(frame.w), h: round(frame.h) });
    if (!bare) addBox(line, el, frame, spot, { ...look, fill: null, stroke: null });
    return;
  }
  // Cells hold no shapes, boxes cannot lean, and colours that run into each other are drawn.
  const prior = env.place === "body" ? env.body?.blocks : undefined;
  // A box is put down with its paragraph, so one that lies behind words further up has to be a picture.
  const late =
    behind &&
    spot?.from === "page" &&
    !line.para.breakBefore &&
    prior &&
    prior.length > 0 &&
    prior[prior.length - 1].kind !== "break";
  if (bare && (paint || stroke) && SIMPLE.test(shape) && (boxless || paint?.stops || quarters === null || late)) {
    addPicture(shapeImage(shape, frame, paint, stroke));
    return;
  }
  const way = quarters !== null && quarters % 2 === 1 ? quarters : null;
  addBox(line, el, way && bare ? onSide(frame) : frame, spot, look, way ?? undefined);
}

function addImage(
  line: Line,
  image: FlowImage,
  frame: Frame,
  spot: Spot | null,
  how: { behind: boolean; free: boolean; z: number },
) {
  if (image.w < 0.2 || image.h < 0.2) return;
  if (spot) {
    const under = how.behind || how.free;
    image.float = {
      x: round(spot.x + frame.x),
      y: round(spot.y + frame.y),
      from: spot.from,
      ...(under && { behind: true }),
    };
    if (how.free && !how.behind) line.doc.over.set(image, how.z);
  }
  line.pieces.push({ kind: "run", run: { image } });
}

/** What a drawing is filled with. Shapes are, unless they say they are not. */
function paintOf(doc: Doc, given: (name: string) => string | undefined): Paint | null {
  const kind = given("fill") ?? "solid";
  if (kind === "none") return null;
  const opacity = percent(given("opacity")) ?? 1;
  if (opacity < 0.01) return null;
  const thin = (color: string) => (opacity < 0.99 ? blend(color, "#ffffff", opacity) : color);
  const el = kind === "gradient" ? doc.gradients.get(given("fill-gradient-name") ?? "") : undefined;
  if (el) {
    const shade = (name: string) => {
      const strength = percent(at(el, `${name}-intensity`)) ?? 1;
      return thin(blend(colorOf(at(el, `${name}-color`)) ?? "#ffffff", "#000000", strength));
    };
    const [start, end] = [shade("start"), shade("end")];
    const style = at(el, "style") ?? "linear";
    const border = Math.min(0.99, percent(at(el, "border")) ?? 0);
    // In the middle of the round ones, and at the rims of the mirrored one, is the colour that comes last.
    const stops: [number, string][] =
      style === "axial"
        ? [
            [0, end],
            [0.5 * border, end],
            [0.5, start],
            [1 - 0.5 * border, end],
            [1, end],
          ]
        : style === "linear"
          ? [
              [0, start],
              [border, start],
              [1, end],
            ]
          : [
              [0, end],
              [1 - border, start],
              [1, start],
            ];
    const turn = (at(el, "angle") ?? "0").trim();
    const degrees =
      /rad$/.test(turn) && !/grad$/.test(turn)
        ? (parseFloat(turn) * 180) / Math.PI
        : /deg$/.test(turn)
          ? parseFloat(turn)
          : parseFloat(turn) / 10;
    return runThrough(stops, { angle: 90 - (degrees || 0), radial: !/^(linear|axial)$/.test(style) });
  }
  const texture = kind === "bitmap" ? doc.fills.get(given("fill-image-name") ?? "") : undefined;
  if (texture) return { color: thin(texture.color) };
  return { color: thin(colorOf(given("fill-color")) ?? (kind === "solid" ? "#729fcf" : "#d9d9d9")) };
}

function strokeOf(given: (name: string) => string | undefined): FlowLine | null {
  const mode = given("stroke") ?? "solid";
  if (mode === "none" || (percent(given("stroke-opacity")) ?? 1) < 0.01) return null;
  return {
    color: colorOf(given("stroke-color")) ?? "#000000",
    width: round(Math.max(0.25, measure(given("stroke-width")) ?? 0.5)),
    ...(mode === "dash" && { dash: "dash" as const }),
  };
}

/** A drawing's box, from the corner of what it is measured from. */
function frameOf(el: Element): Frame {
  const size = (name: string) => measure(at(el, name));
  if (/^(line|connector)$/.test(el.localName)) {
    const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) => size(name) ?? 0);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  const w = size("width") ?? size("min-width") ?? 0;
  const h = size("height") ?? size("min-height") ?? 0;
  const turn = turnOf(el, w, h);
  return { x: turn?.x ?? size("x") ?? 0, y: turn?.y ?? size("y") ?? 0, w, h };
}

function inlineSpot(line: Line, w: number): Spot {
  const { para, env } = line;
  const free = env.width - (para.left ?? 0) - (para.right ?? 0) - w;
  const x = para.align === "center" ? free / 2 : para.align === "right" || para.align === "end" ? free : 0;
  return { x: round((para.left ?? 0) + Math.max(0, x)), y: 0, from: "para" };
}

/** Lines the editor has a shape for are that. Arrows that point another way than its own, elbows and curves are pictures. */
function addLine(
  line: Line,
  own: Frame,
  spot: Spot | null,
  how: {
    stroke: FlowLine;
    kind: string;
    flipH: boolean;
    flipV: boolean;
    start: boolean;
    end: boolean;
    degrees: number;
    behind: boolean;
    free: boolean;
    z: number;
  },
) {
  const { stroke } = how;
  const straight = how.kind === "line";
  const { frame, flipH, flipV } = straight
    ? turnLine(own, how, how.degrees)
    : { frame: own, flipH: how.flipH, flipV: how.flipV };
  if (!spot) line.tall = Math.max(line.tall, frame.h);
  const where = spot ?? inlineSpot(line, frame.w);
  const place = { x: round(where.x + frame.x), y: round(where.y + frame.y), from: where.from };
  const boxless = line.env.place === "cell" || line.env.place === "box";
  if (straight && !boxless && !how.start && !(how.end && (flipH || (flipV && frame.h > 0.5)))) {
    const up = flipH !== flipV && frame.w > 0.5 && frame.h > 0.5;
    const box: FlowBox = { kind: "box", ...place, w: round(frame.w), h: round(frame.h), blocks: [], stroke };
    box.shape = how.end ? "arrow" : up ? "lineInv" : "line";
    line.pieces.push({ kind: "box", box, z: how.z });
    return;
  }
  const corners = connectorCorners(how.kind, frame.w, frame.h).map(({ x, y }) => ({
    x: flipH ? frame.w - x : x,
    y: flipV ? frame.h - y : y,
  }));
  const made = lineImage(corners, stroke, { start: how.start, end: how.end, curved: how.kind.startsWith("curved") });
  if (!made) return;
  const image: FlowImage = { ...made.image, ...(!straight && how.degrees && { angle: how.degrees }) };
  const { edge } = made;
  addImage(line, image, { ...frame, x: frame.x - edge, y: frame.y - edge }, where, how);
}

/** One line for all sides of a frame: the first there is. */
function edgesOf2(props: Map<string, string>): FlowLine | null {
  for (const name of ["border", "border-top", "border-left", "border-bottom", "border-right"]) {
    const line = lineOf(props.get(name));
    if (line) return line;
  }
  return null;
}

function addBox(
  line: Line,
  holder: Element,
  own: Frame,
  spot: Spot | null,
  box: {
    fill: string | null;
    stroke: FlowLine | null;
    shape: string | undefined;
    props: Map<string, string>;
    z: number;
    alone: boolean;
    /** As high as the words in it need it. */
    grows?: boolean;
    /** Words may have to keep clear of it. */
    keeps?: boolean;
  },
  quarters?: number,
) {
  const { doc, env } = line;
  const { props } = box;
  const all = measure(props.get("padding"));
  const inset = (side: Side, usual: number) => measure(props.get(`padding-${side}`)) ?? all ?? usual;
  const pad = { l: inset("left", 7.2), t: inset("top", 3.6), r: inset("right", 7.2), b: inset("bottom", 3.6) };
  const inside: Env = {
    ...env,
    place: "box",
    at: 0,
    width: Math.max(10, own.w - pad.l - pad.r),
    back: box.fill ?? undefined,
    base: undefined,
    body: undefined,
  };
  const blocks = onlyParas(doc.traits, readBlocks(doc, holder, inside));
  const empty = isBlank(blocks);
  if (!box.fill && !box.stroke && empty) return;
  const frame = box.grows ? { ...own, h: Math.max(own.h, aboutHigh(blocks, inside.width) + pad.t + pad.b) } : own;
  if (box.keeps) keepClear(line, props, spot, frame.w, frame.h);
  if (!spot) line.tall = Math.max(line.tall, frame.h);
  const where = spot ?? inlineSpot(line, frame.w);
  const mode = props.get("writing-mode") ?? "";
  const way = quarters === 1 || /^tb/.test(mode) ? 90 : quarters === 3 || /^bt/.test(mode) ? 270 : null;
  if (way && !empty && env.place !== "cell" && env.place !== "box") {
    const laid = quarters ? onSide(frame) : frame;
    const valign = props.get("textarea-vertical-align");
    const turned = turnedWords(
      blocks,
      laid,
      quarters ? turnedPad(pad, quarters) : pad,
      way,
      valign === "middle" || valign === "bottom" ? valign : "top",
    );
    if (turned) {
      if (box.fill || box.stroke) {
        const out: FlowBox = {
          kind: "box",
          x: round(where.x + laid.x),
          y: round(where.y + laid.y),
          from: where.from,
          w: round(laid.w),
          h: round(laid.h),
          blocks: [],
        };
        if (box.shape) out.shape = box.shape;
        if (box.fill) out.fill = box.fill;
        if (box.stroke) out.stroke = box.stroke;
        line.pieces.push({ kind: "box", box: out, z: box.z });
      }
      addImage(line, turned.image, { ...laid, x: laid.x + turned.x, y: laid.y + turned.y }, where, {
        behind: false,
        free: true,
        z: box.z,
      });
      return;
    }
  }
  let { x, y, w, h } = { x: where.x + frame.x, y: where.y + frame.y, w: frame.w, h: frame.h };
  if (!empty && !box.fill && !box.stroke) {
    // Nothing of the box itself is seen: what counts is where the words are.
    x += pad.l;
    y += pad.t;
    w = Math.max(1, w - pad.l - pad.r);
    h = Math.max(1, h - pad.t - pad.b);
  } else if (!empty) {
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
  if (box.alone && where.y > -h && where.y < 24) line.push = Math.max(line.push, where.y + frame.h);
  const out: FlowBox = {
    kind: "box",
    x: round(x),
    y: round(y),
    from: where.from,
    w: round(w),
    h: round(h),
    blocks: empty ? [] : blocks,
  };
  if (box.shape) out.shape = box.shape;
  if (box.fill) out.fill = box.fill;
  if (box.stroke) out.stroke = box.stroke;
  const valign = props.get("textarea-vertical-align");
  if (valign === "middle" || valign === "bottom") out.valign = valign;
  line.pieces.push({ kind: "box", box: out, z: box.z });
}

/** Shapes by the names LibreOffice has for them. */
const SHAPES: Record<string, string> = {
  rectangle: "rect",
  "round-rectangle": "roundRect",
  ellipse: "ellipse",
  "isosceles-triangle": "triangle",
  "right-triangle": "rtTriangle",
  diamond: "diamond",
  parallelogram: "parallelogram",
  trapezoid: "trapezoid",
  "regular-pentagon": "pentagon",
  "pentagon-right": "homePlate",
  "chevron-right": "chevron",
  hexagon: "hexagon",
  octagon: "octagon",
  cross: "plus",
  cube: "cube",
  can: "can",
  ring: "donut",
  heart: "heart",
  sun: "sun",
  moon: "moon",
  smiley: "smileyFace",
  cloud: "cloud",
  "right-arrow": "rightArrow",
  "left-arrow": "leftArrow",
  "up-arrow": "upArrow",
  "down-arrow": "downArrow",
  "left-right-arrow": "leftRightArrow",
  "up-down-arrow": "upDownArrow",
  star4: "star4",
  star5: "star5",
  star8: "star8",
  star24: "star24",
  "rectangular-callout": "wedgeRectCallout",
  "round-rectangular-callout": "wedgeRoundRectCallout",
  "round-callout": "wedgeEllipseCallout",
  "cloud-callout": "cloudCallout",
  "flowchart-process": "flowChartProcess",
  "flowchart-alternate-process": "flowChartAlternateProcess",
  "flowchart-decision": "flowChartDecision",
  "flowchart-data": "flowChartInputOutput",
  "flowchart-terminator": "flowChartTerminator",
  "flowchart-document": "flowChartDocument",
  "flowchart-preparation": "flowChartPreparation",
  "flowchart-connector": "flowChartConnector",
  "left-brace": "leftBrace",
  "right-brace": "rightBrace",
  "left-bracket": "leftBracket",
  "right-bracket": "rightBracket",
};

/** Word gives no names but its own for the drawing as a whole: "Arrow: Right 6". */
const WORD_SHAPES: [RegExp, string][] = [
  [/rounded corners/i, "roundRect"],
  [/^oval/i, "ellipse"],
  [/^arrow: right|^right arrow/i, "rightArrow"],
  [/^arrow: left|^left arrow/i, "leftArrow"],
  [/^arrow: up|^up arrow/i, "upArrow"],
  [/^arrow: down|^down arrow/i, "downArrow"],
  [/^arrow: left-right/i, "leftRightArrow"],
  [/isosceles triangle/i, "triangle"],
  [/right triangle/i, "rtTriangle"],
  [/^diamond/i, "diamond"],
  [/^parallelogram/i, "parallelogram"],
  [/^trapezoid/i, "trapezoid"],
  [/^hexagon/i, "hexagon"],
  [/^octagon/i, "octagon"],
  [/^star: 5/i, "star5"],
  [/^star: 4/i, "star4"],
  [/^heart/i, "heart"],
  [/^cloud/i, "cloud"],
  [/^flowchart: process/i, "flowChartProcess"],
  [/^flowchart: decision/i, "flowChartDecision"],
  [/^flowchart: terminator/i, "flowChartTerminator"],
  [/^flowchart: document/i, "flowChartDocument"],
  [/^flowchart: data/i, "flowChartInputOutput"],
  [/speech bubble: rectangle with/i, "wedgeRoundRectCallout"],
  [/speech bubble: rectangle/i, "wedgeRectCallout"],
  [/speech bubble: oval/i, "wedgeEllipseCallout"],
];

function shapeOf(el: Element): string {
  if (el.localName === "ellipse" || el.localName === "circle") return "ellipse";
  if (el.localName === "rect") return measure(at(el, "corner-radius")) ? "roundRect" : "rect";
  const type = at(kid(el, "enhanced-geometry"), "type") ?? "";
  if (type.startsWith("ooxml-")) return type.slice(6);
  const name = at(el, "name") ?? "";
  return SHAPES[type] ?? WORD_SHAPES.find(([test]) => test.test(name))?.[1] ?? "rect";
}

type Step = { to: "M" | "L" | "C" | "Z"; points: Point[] };
type Outline = {
  kind: string | null;
  line: [Point, Point];
  parts: { path: Path2D; filled: boolean; lined: boolean }[];
};

/** How a shape is drawn, in points, and what it is called when it is one of the plain ones. */
function outlineOf(el: Element, frame: Frame): Outline | null {
  const geometry = kid(el, "enhanced-geometry");
  const [x, y, w, h] = (at(geometry ?? el, "viewBox") ?? "0 0 21600 21600").split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const sx = w > 0 ? frame.w / w : 1;
  const sy = h > 0 ? frame.h / h : 1;
  if (!geometry) {
    const points = at(el, "points");
    const d = el.localName === "path" ? at(el, "d") : points && `M ${points}${el.localName === "polygon" ? " Z" : ""}`;
    if (!d) return null;
    const path = new Path2D();
    path.addPath(new Path2D(d), new DOMMatrix([sx, 0, 0, sy, -x * sx, -y * sy]));
    const filled = el.localName !== "polyline" && /z\s*$/i.test(d);
    return {
      kind: null,
      line: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      parts: [{ path, filled, lined: true }],
    };
  }
  const parts = stepsOf(geometry, { x, y, w, h }, frame);
  if (!parts || parts.length === 0) return null;
  const place = (point: Point) => ({ x: (point.x - x) * sx, y: (point.y - y) * sy });
  const all = parts.flatMap(({ steps }) => steps);
  const first = all[0]?.points[0] ?? { x, y };
  const last = all[all.length - 1]?.points[0] ?? first;
  const out: Outline = { kind: plainKind(all, { x, y, w, h }), line: [place(first), place(last)], parts: [] };
  for (const { steps, filled, lined } of parts) {
    const path = new Path2D();
    for (const step of steps) {
      const [a, b, c] = step.points.map(place);
      if (step.to === "M") path.moveTo(a.x, a.y);
      else if (step.to === "L") path.lineTo(a.x, a.y);
      else if (step.to === "C") path.bezierCurveTo(a.x, a.y, b.x, b.y, c.x, c.y);
      else path.closePath();
    }
    out.parts.push({ path, filled, lined });
  }
  return out;
}

/** The name of an outline that is a line, a rectangle, an ellipse, or a rectangle with round corners. */
function plainKind(steps: readonly Step[], box: Frame): string | null {
  const ends = steps.filter(({ points }) => points.length > 0).map(({ points }) => points[points.length - 1]);
  const moves = steps.filter(({ to }) => to === "M").length;
  const curves = steps.filter(({ to }) => to === "C");
  if (moves !== 1 || ends.length < 2) return null;
  if (ends.length === 2 && curves.length === 0) return "line";
  const near = (a: number, b: number, size: number) => Math.abs(a - b) <= size * 0.006;
  const sideX = ({ x }: Point) => near(x, box.x, box.w) || near(x, box.x + box.w, box.w);
  const sideY = ({ y }: Point) => near(y, box.y, box.h) || near(y, box.y + box.h, box.h);
  const round1 = ({ x, y }: Point) =>
    Math.abs(Math.hypot((x - box.x) / box.w - 0.5, (y - box.y) / box.h - 0.5) - 0.5) < 0.012;
  if (curves.length === 0) {
    const corners = new Set(ends.map(({ x, y }) => `${near(x, box.x, box.w)} ${near(y, box.y, box.h)}`));
    return ends.length <= 6 && ends.every((point) => sideX(point) && sideY(point)) && corners.size === 4
      ? "rect"
      : null;
  }
  const lines = steps.filter(({ to }) => to === "L").length;
  if (curves.length >= 4 && ends.every(round1)) return "ellipse";
  if (
    curves.length === 4 &&
    lines >= 3 &&
    lines <= 5 &&
    ends.every((point) => sideX(point) !== sideY(point) || (sideX(point) && sideY(point)))
  )
    return "roundRect";
  return null;
}

/** An outline's steps as plain lines and curves. Its numbers may be formulas. */
function stepsOf(
  geometry: Element,
  view: Frame,
  frame: Frame,
): { steps: Step[]; filled: boolean; lined: boolean }[] | null {
  const value = formulasOf(geometry, view, frame);
  const tokens =
    (at(geometry, "enhanced-path") ?? "").match(/\?\w+|\$\d+|-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-z]/gi) ?? [];
  const out: { steps: Step[]; filled: boolean; lined: boolean }[] = [];
  let part = { steps: [] as Step[], filled: true, lined: true };
  let here: Point = { x: 0, y: 0 };
  const go = (to: Step["to"], ...points: Point[]) => {
    part.steps.push({ to, points });
    if (points.length > 0) here = points[points.length - 1];
  };
  const arc = (c: Point, rx: number, ry: number, from: number, sweep: number, jump: boolean) => {
    const on = (angle: number) => ({ x: c.x + rx * Math.cos(angle), y: c.y + ry * Math.sin(angle) });
    if (rx === 0 && ry === 0) return;
    go(jump || part.steps.length === 0 ? "M" : "L", on(from));
    const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 0.001));
    const k = (4 / 3) * Math.tan(sweep / count / 4);
    for (let i = 0; i < count; i += 1) {
      const [a, b] = [from + (sweep / count) * i, from + (sweep / count) * (i + 1)];
      const [p, q] = [on(a), on(b)];
      go(
        "C",
        { x: p.x - rx * k * Math.sin(a), y: p.y + ry * k * Math.cos(a) },
        { x: q.x + rx * k * Math.sin(b), y: q.y - ry * k * Math.cos(b) },
        q,
      );
    }
  };
  for (let i = 0; i < tokens.length;) {
    const letter = tokens[i].toUpperCase();
    i += 1;
    const numbers: number[] = [];
    for (; i < tokens.length && !/^[a-z]$/i.test(tokens[i]); i += 1) numbers.push(value(tokens[i]));
    if (numbers.some((one) => !Number.isFinite(one))) return null;
    const sets = (size: number) =>
      Array.from({ length: Math.floor(numbers.length / size) }, (_, k) => numbers.slice(k * size, (k + 1) * size));
    switch (letter) {
      case "M":
        sets(2).forEach(([x, y], k) => go(k === 0 ? "M" : "L", { x, y }));
        break;
      case "L":
        for (const [x, y] of sets(2)) go("L", { x, y });
        break;
      case "C":
        for (const [a, b, c, e, x, y] of sets(6)) go("C", { x: a, y: b }, { x: c, y: e }, { x, y });
        break;
      case "Q":
        for (const [a, b, x, y] of sets(4)) {
          const p = here;
          go(
            "C",
            { x: p.x + ((a - p.x) * 2) / 3, y: p.y + ((b - p.y) * 2) / 3 },
            { x: x + ((a - x) * 2) / 3, y: y + ((b - y) * 2) / 3 },
            { x, y },
          );
        }
        break;
      case "X":
      case "Y":
        // Quarters of an ellipse that set out along one side, then along the other.
        sets(2).forEach(([x, y], k) => {
          const p = here;
          const across = (letter === "X") === (k % 2 === 0);
          const c = 0.5523;
          if (across) go("C", { x: p.x + (x - p.x) * c, y: p.y }, { x, y: y - (y - p.y) * c }, { x, y });
          else go("C", { x: p.x, y: p.y + (y - p.y) * c }, { x: x - (x - p.x) * c, y }, { x, y });
        });
        break;
      case "T":
      case "U":
        for (const [x, y, rx, ry, from, to] of sets(6)) {
          const sweep = to - from;
          arc({ x, y }, rx, ry, (from * Math.PI) / 180, (sweep * Math.PI) / 180, letter === "U");
        }
        break;
      case "A":
      case "B":
      case "W":
      case "V":
        for (const [l, t, r, b, x1, y1, x2, y2] of sets(8)) {
          const c = { x: (l + r) / 2, y: (t + b) / 2 };
          const [rx, ry] = [Math.abs(r - l) / 2, Math.abs(b - t) / 2];
          const angle = (x: number, y: number) => Math.atan2((y - c.y) / (ry || 1), (x - c.x) / (rx || 1));
          const from = angle(x1, y1);
          const turn = Math.PI * 2;
          const clockwise = letter === "W" || letter === "V";
          let sweep = (((angle(x2, y2) - from) % turn) + turn) % turn;
          if (!clockwise) sweep = sweep === 0 ? -turn : sweep - turn;
          else if (sweep === 0) sweep = turn;
          arc(c, rx, ry, from, sweep, letter === "B" || letter === "V");
        }
        break;
      case "G":
        for (const [rx, ry, from, sweep] of sets(4)) {
          const start = (from * Math.PI) / 180;
          arc(
            { x: here.x - rx * Math.cos(start), y: here.y - ry * Math.sin(start) },
            rx,
            ry,
            start,
            (sweep * Math.PI) / 180,
            false,
          );
        }
        break;
      case "Z":
        go("Z");
        break;
      case "F":
        part.filled = false;
        break;
      case "S":
        part.lined = false;
        break;
      case "N":
        if (part.steps.length > 0) out.push(part);
        part = { steps: [], filled: true, lined: true };
        break;
      default:
        return null;
    }
  }
  if (part.steps.length > 0) out.push(part);
  return out;
}

/** Works out the formulas of a shape: "?f3" is one of its own, "$0" the place of a handle. */
function formulasOf(geometry: Element, view: Frame, frame: Frame): (text: string) => number {
  const equations = new Map(kids(geometry, "equation").map((el) => [at(el, "name") ?? "", at(el, "formula") ?? ""]));
  const handles = (at(geometry, "modifiers") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const known = new Map<string, number>([
    ["left", view.x],
    ["top", view.y],
    ["right", view.x + view.w],
    ["bottom", view.y + view.h],
    ["width", view.w],
    ["height", view.h],
    ["logwidth", frame.w * 35.28],
    ["logheight", frame.h * 35.28],
    ["xstretch", numberOf(at(geometry, "path-stretchpoint-x")) ?? 0],
    ["ystretch", numberOf(at(geometry, "path-stretchpoint-y")) ?? 0],
    ["hasstroke", 1],
    ["hasfill", 1],
    ["pi", Math.PI],
  ]);
  const call = (name: string, [a = NaN, b = NaN, c = NaN]: number[]) => {
    if (name === "if") return a > 0 ? b : c;
    if (name === "atan2") return Math.atan2(a, b);
    if (name === "min" || name === "max") return Math[name](a, b);
    return /^(abs|sqrt|sin|cos|tan|atan)$/.test(name) ? Math[name as "abs"](a) : NaN;
  };
  const value = (text: string): number => {
    const tokens = text.match(/\?\w+|\$\d+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-z]\w*|[-+*/(),]/gi) ?? [];
    let i = 0;
    const sum = (): number => {
      let out = product();
      while (tokens[i] === "+" || tokens[i] === "-") out = tokens[i++] === "+" ? out + product() : out - product();
      return out;
    };
    const product = (): number => {
      let out = atom();
      while (tokens[i] === "*" || tokens[i] === "/") out = tokens[i++] === "*" ? out * atom() : out / atom();
      return out;
    };
    const atom = (): number => {
      const token = tokens[i++] ?? "";
      if (token === "-") return -atom();
      if (token === "+") return atom();
      if (token === "(") {
        const out = sum();
        i += 1;
        return out;
      }
      if (token.startsWith("?")) return named(token.slice(1));
      if (token.startsWith("$")) return handles[Number(token.slice(1))] ?? NaN;
      if (/^[\d.]/.test(token)) return Number(token);
      if (tokens[i] !== "(") return known.get(token) ?? NaN;
      const args: number[] = [];
      do {
        i += 1;
        args.push(sum());
      } while (tokens[i] === ",");
      i += 1;
      return call(token, args);
    };
    return sum();
  };
  const named = (name: string): number => {
    const have = known.get(`?${name}`);
    if (have !== undefined) return have;
    // One that leans on itself comes to nothing.
    known.set(`?${name}`, NaN);
    const out = value(equations.get(name) ?? "");
    known.set(`?${name}`, out);
    return out;
  };
  return value;
}

function imageOf(doc: Doc, frame: Element, props: Map<string, string>, w: number, h: number): FlowImage | null {
  // The same picture may come in several forms; the first one that can be shown is taken.
  for (const el of kids(frame, "image")) {
    const inside = kid(el, "binary-data")?.textContent?.replace(/\s+/g, "");
    let picture = doc.pictures.get(plainHref(at(el, "href")));
    if (!picture && inside) {
      const bytes = Uint8Array.from(atob(inside), (letter) => letter.charCodeAt(0));
      const mime = pictureType(bytes);
      if (mime) picture = { bytes, mime };
    }
    if (!picture) continue;
    const image: FlowImage = { bytes: picture.bytes, mime: picture.mime, w: round(w), h: round(h) };
    const crop = cropOf(props.get("clip"), picture, w, h);
    const alt = (kid(frame, "desc") ?? kid(frame, "title"))?.textContent?.trim();
    if (crop) image.crop = crop;
    if (alt) image.alt = alt;
    return image;
  }
  return null;
}

/** "rect(top, right, bottom, left)": how much is cut off at each side. */
function cropOf(
  clip: string | undefined,
  picture: { bytes: Uint8Array; mime: string },
  w: number,
  h: number,
): FlowImage["crop"] {
  const sides = /rect\(([^)]*)\)/
    .exec(clip ?? "")?.[1]
    .split(/[\s,]+/)
    .map((part) => measure(part) ?? 0);
  if (!sides || sides.length < 4 || sides.every((side) => Math.abs(side) < 0.05)) return undefined;
  const [top, right, bottom, left] = sides.map((side) => Math.max(0, side));
  // Cuts are measured on the picture as it is stored.
  const natural = naturalSize(picture);
  const wide = natural?.w ?? w + left + right;
  const high = natural?.h ?? h + top + bottom;
  const crop = { x: left / wide, y: top / high, w: 1 - (left + right) / wide, h: 1 - (top + bottom) / high };
  if (crop.w <= 0.001 || crop.h <= 0.001) return undefined;
  return { x: round(crop.x, 5), y: round(crop.y, 5), w: round(crop.w, 5), h: round(crop.h, 5) };
}

/** How large a picture says it is, in points. */
function naturalSize({ bytes, mime }: { bytes: Uint8Array; mime: string }): { w: number; h: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length > 33) {
    const [w, h] = [view.getUint32(16), view.getUint32(20)];
    let perPoint = 96 / 72;
    for (let i = 33; i + 12 < bytes.length;) {
      const size = view.getUint32(i);
      if (view.getUint32(i + 4) === 0x70485973 && view.getUint8(i + 16) === 1) {
        perPoint = (view.getUint32(i + 8) * 0.0254) / 72 || perPoint;
        break;
      }
      if (view.getUint32(i + 4) === 0x49444154) break;
      i += 12 + size;
    }
    return { w: w / perPoint, h: h / perPoint };
  }
  if (mime !== "image/jpeg") return null;
  let perPoint = 96 / 72;
  for (let i = 2; i + 9 < bytes.length;) {
    const marker = view.getUint16(i);
    if ((marker & 0xff00) !== 0xff00) return null;
    if (marker === 0xffe0 && view.getUint32(i + 4) === 0x4a464946 && i + 16 < bytes.length) {
      const unit = view.getUint8(i + 11);
      const density = view.getUint16(i + 12);
      if (unit > 0 && density > 1) perPoint = (unit === 2 ? density * 2.54 : density) / 72;
    }
    if (marker >= 0xffc0 && marker <= 0xffcf && marker !== 0xffc4 && marker !== 0xffc8 && marker !== 0xffcc)
      return { w: view.getUint16(i + 7) / perPoint, h: view.getUint16(i + 5) / perPoint };
    i += 2 + view.getUint16(i + 2);
  }
  return null;
}

// ---------------------------------------------------------------- equations

function mathParts(el: Element | null | undefined): MathPart[] {
  if (!el) return [];
  const inner = kids(el);
  const all = () => inner.flatMap(mathParts);
  const text = () => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  switch (el.localName) {
    case "mi":
      return [{ text: text(), upright: at(el, "mathvariant") === "normal" || text().length > 1 }];
    case "mn":
    case "mtext":
    case "ms":
      return [{ text: text(), upright: true }];
    case "mo":
      return [{ text: text().replace(/-/g, "−").replace(/[⁡-⁤]/g, "") }];
    case "mfrac":
      return [...inBrackets(mathParts(inner[0])), { text: "/" }, ...inBrackets(mathParts(inner[1]))];
    case "msqrt":
      return [{ text: "√" }, ...inBrackets(all())];
    case "mroot":
      return [...raised(mathParts(inner[1]), "super"), { text: "√" }, ...inBrackets(mathParts(inner[0]))];
    case "msup":
    case "mover":
      return [...mathParts(inner[0]), ...raised(mathParts(inner[1]), "super")];
    case "msub":
    case "munder":
      return [...mathParts(inner[0]), ...raised(mathParts(inner[1]), "sub")];
    case "msubsup":
    case "munderover":
      return [...mathParts(inner[0]), ...raised(mathParts(inner[1]), "sub"), ...raised(mathParts(inner[2]), "super")];
    case "mfenced":
      return [
        { text: at(el, "open") ?? "(" },
        ...inner.flatMap((part, i) =>
          i > 0
            ? [{ text: (at(el, "separators") ?? ",").trim().slice(0, 1) || "," }, ...mathParts(part)]
            : mathParts(part),
        ),
        { text: at(el, "close") ?? ")" },
      ];
    case "mtable":
      return inner.flatMap((row, i): MathPart[] => [
        ...(i > 0 ? [{ text: "; " }] : []),
        ...kids(row).flatMap((cell, k): MathPart[] => [...(k > 0 ? [{ text: ", " }] : []), ...mathParts(cell)]),
      ]);
    case "semantics":
      return mathParts(inner[0]);
    case "annotation":
    case "annotation-xml":
    case "mphantom":
    case "mspace":
      return [];
    default:
      return all();
  }
}

// ---------------------------------------------------------------- tables

type Slot = {
  row: number;
  col: number;
  rows: number;
  cols: number;
  el: Element | null;
  style: string | null;
  lines: Record<Side, FlowLine | null>;
  pad: FlowMargin;
  cell?: FlowCell;
};

function masterOfTable(doc: Doc, table: Element, env: Env): string | null {
  const chain = chainOf(doc, env.scope, "table", at(table, "style-name"));
  return chain.reduce<string | null>((found, el) => at(el, "master-page-name") ?? found, null) || null;
}

/** Rows or columns, out of the groups they are in. `head`: those repeated on every page. */
function gather(holder: Element, name: string, head = false): { el: Element; head: boolean }[] {
  return kids(holder).flatMap((el) => {
    if (el.localName === name) return [{ el, head }];
    if (/^table-(header-)?(rows|columns)$|^table-(row|column)-group$/.test(el.localName))
      return gather(el, name, head || el.localName.startsWith("table-header"));
    return [];
  });
}

function cellProps(
  doc: Doc,
  scope: Scope,
  name: string | null,
): { fill?: string | null; edges: Edges; pad: Partial<FlowMargin>; valign?: string } {
  const out: ReturnType<typeof cellProps> = { edges: {}, pad: {} };
  for (const el of [defaultOf(doc, "table-cell"), ...chainOf(doc, scope, "table-cell", name)]) {
    const props = kid(el, "table-cell-properties");
    if (!props) continue;
    const fill = colorOf(at(props, "background-color"));
    if (fill !== undefined) out.fill = fill;
    out.edges = { ...out.edges, ...edgesOf(props) };
    out.pad = { ...out.pad, ...padOf(props) };
    out.valign = at(props, "vertical-align") ?? out.valign;
  }
  return out;
}

function readTable(doc: Doc, table: Element, env: Env): FlowTable {
  const { scope } = env;
  const chain = chainOf(doc, scope, "table", at(table, "style-name"));
  const prop = (name: string) =>
    chain.reduce<string | null>(
      (found, el) => at(kid(el, "table-properties"), name) ?? found,
      at(dig(defaultOf(doc, "table"), "table-properties"), name),
    );
  const align = prop("align") ?? "margins";
  const leftEdge = measure(prop("margin-left")) ?? 0;
  const rightEdge = measure(prop("margin-right")) ?? 0;
  const share = percent(prop("rel-width"));
  const width =
    align === "margins"
      ? env.width - leftEdge - rightEdge
      : share
        ? env.width * share
        : (measure(prop("width")) ?? null);
  const tableFill = colorOf(prop("background-color"));

  const columns = gather(table, "table-column").flatMap(({ el }) => {
    const style = chainOf(doc, scope, "table-column", at(el, "style-name"));
    const props = style.map((one) => kid(one, "table-column-properties")).filter(Boolean);
    const own = props.map((one) => measure(at(one, "column-width"))).find((value) => value !== undefined) ?? 0;
    const part = props.map((one) => numberOf(at(one, "rel-column-width"))).find((value) => value !== undefined) ?? 0;
    const cell = at(el, "default-cell-style-name");
    return Array.from({ length: Math.min(200, Math.round(numberOf(at(el, "number-columns-repeated")) ?? 1)) }, () => ({
      own,
      part,
      cell,
    }));
  });
  const rows = gather(table, "table-row").flatMap(({ el, head }) => {
    const times = Math.round(numberOf(at(el, "number-rows-repeated")) ?? 1);
    return Array.from({ length: Math.max(1, Math.min(100, times)) }, () => ({ el, head }));
  });

  const slots: Slot[] = [];
  let count = columns.length;
  rows.forEach(({ el }, row) => {
    let col = 0;
    for (const td of kids(el)) {
      const times = Math.max(1, Math.min(200, Math.round(numberOf(at(td, "number-columns-repeated")) ?? 1)));
      if (td.localName === "covered-table-cell") {
        col += times;
        continue;
      }
      if (td.localName !== "table-cell") continue;
      for (let i = 0; i < times; i += 1) {
        const cols = Math.max(1, Math.round(numberOf(at(td, "number-columns-spanned")) ?? 1));
        slots.push({
          row,
          col,
          rows: Math.max(1, Math.round(numberOf(at(td, "number-rows-spanned")) ?? 1)),
          cols,
          el: td,
          style: at(td, "style-name") ?? at(el, "default-cell-style-name") ?? columns[col]?.cell ?? null,
          lines: { top: null, right: null, bottom: null, left: null },
          pad: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        col += 1;
      }
    }
    count = Math.max(count, col);
  });
  count = Math.max(1, count);
  const grid: (Slot | null)[][] = rows.map(() => Array.from({ length: count }, () => null));
  for (const slot of slots) {
    slot.rows = Math.min(slot.rows, rows.length - slot.row);
    slot.cols = Math.min(slot.cols, count - slot.col);
    for (let r = slot.row; r < slot.row + slot.rows; r += 1)
      for (let c = slot.col; c < slot.col + slot.cols; c += 1) grid[r][c] = slot;
  }

  // Widths: as given, else by their shares, else all the same.
  const raw = Array.from({ length: count }, (_, i) => columns[i] ?? { own: 0, part: 0, cell: null });
  const known = raw.reduce((sum, column) => sum + column.own, 0);
  const parts = raw.reduce((sum, column) => sum + column.part, 0);
  const room = width ?? (known || env.width);
  let sizes = raw.map((column) => column.own || (parts > 0 ? (column.part / parts) * room : 0));
  const open = sizes.filter((size) => size <= 0).length;
  if (open > 0) {
    const left = Math.max(open * 12, room - sizes.reduce((sum, size) => sum + size, 0));
    sizes = sizes.map((size) => (size > 0 ? size : left / open));
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (width && total > 0 && Math.abs(total - width) > 1 && (align === "margins" || share))
    sizes = sizes.map((size) => (size * width) / total);

  const looks = new Map(slots.map((slot) => [slot, cellProps(doc, scope, slot.style)]));
  for (const slot of slots) {
    const look = looks.get(slot);
    for (const side of SIDES) {
      slot.lines[side] = look?.edges[side] ?? null;
      slot.pad[side] = look?.pad[side] ?? 0;
    }
  }
  settleLines(slots, grid, rows.length, count);
  const pads = tally(slots.map((slot) => JSON.stringify(slot.pad)));
  const pad: FlowMargin = pads ? (JSON.parse(pads) as FlowMargin) : { top: 0, right: 5.4, bottom: 0, left: 5.4 };
  const usual = tally(slots.flatMap((slot) => SIDES.map((side) => JSON.stringify(slot.lines[side]))));
  const border = usual ? (JSON.parse(usual) as FlowLine | null) : null;

  const starts = sizes.map((_, i) => sizes.slice(0, i).reduce((sum, size) => sum + size, 0));
  const inRow: Slot[][] = rows.map(() => []);
  for (const slot of slots) inRow[slot.row].push(slot);
  const made: FlowRow[] = rows.map(({ el, head }, row) => {
    const props = chainOf(doc, scope, "table-row", at(el, "style-name")).map((one) => kid(one, "table-row-properties"));
    const size = (name: string) => props.map((one) => measure(at(one, name))).find((value) => value !== undefined);
    const rowFill = props.map((one) => colorOf(at(one, "background-color"))).find((value) => value !== undefined);
    const cells = inRow[row]
      .sort((a, b) => a.col - b.col)
      .map((slot): FlowCell => {
        const look = looks.get(slot);
        const fill = look?.fill ?? rowFill ?? tableFill;
        const cell: FlowCell = { blocks: [] };
        slot.cell = cell;
        if (slot.cols > 1) cell.colSpan = slot.cols;
        if (slot.rows > 1) cell.rowSpan = slot.rows;
        if (fill) cell.fill = fill;
        if (look?.valign === "middle" || look?.valign === "bottom") cell.valign = look.valign;
        const edges: NonNullable<FlowCell["border"]> = {};
        for (const side of SIDES) if (lineKey(slot.lines[side]) !== lineKey(border)) edges[side] = slot.lines[side];
        if (Object.keys(edges).length > 0) cell.border = edges;
        const wide = sizes.slice(slot.col, slot.col + slot.cols).reduce((sum, one) => sum + one, 0);
        const inside: Env = {
          ...env,
          place: "cell",
          at: env.at + leftEdge + (starts[slot.col] ?? 0) + slot.pad.left,
          width: Math.max(10, wide - slot.pad.left - slot.pad.right),
          back: fill ?? env.back,
          body: undefined,
        };
        cell.blocks = slot.el ? onlyParas(doc.traits, readBlocks(doc, slot.el, inside)) : [];
        if (cell.blocks.length === 0) cell.blocks = [{ kind: "para", runs: [], before: 0, after: 0 }];
        const left = round(slot.pad.left - pad.left);
        const right = round(slot.pad.right - pad.right);
        for (const para of cell.blocks) {
          if (Math.abs(left) > 0.2) para.left = round((para.left ?? 0) + left);
          if (Math.abs(right) > 0.2) para.right = round((para.right ?? 0) + right);
        }
        const top = cell.blocks[0];
        if (slot.pad.top - pad.top > 0.2) top.before = round((top.before ?? 0) + slot.pad.top - pad.top);
        return cell;
      });
    const out: FlowRow = { cells };
    const exact = size("row-height");
    const h = size("min-row-height") ?? exact;
    if (h) out.h = round(h);
    if (exact) {
      for (const cell of cells) {
        if (!isBlank(cell.blocks)) continue;
        const only: FlowPara = {
          ...cell.blocks[0],
          before: 0,
          after: 0,
          line: { points: round(Math.max(0.5, exact - pad.top - pad.bottom)) },
        };
        cell.blocks = [only];
      }
    }
    const tall = Math.max(
      0,
      ...inRow[row].map((slot) => (slot.rows === 1 && slot.cell ? pictureHeight(slot.cell) : 0)),
    );
    if (tall > 0) out.h = round(Math.max(out.h ?? 0, tall + pad.top + pad.bottom));
    if (head) out.head = true;
    return out;
  });
  const rtl = /^rl/.test(prop("writing-mode") ?? "");
  if (rtl) {
    sizes = [...sizes].reverse();
    for (const row of made) row.cells.reverse();
  }
  const out: FlowTable = {
    kind: "table",
    cols: sizes.map((size) => round(size)),
    rows: made,
    border,
    pad: { top: round(pad.top), right: round(pad.right), bottom: round(pad.bottom), left: round(pad.left) },
  };
  const over = sizes.reduce((sum, size) => sum + size, 0) - env.width;
  const side = align === "center" ? "center" : (align === "right") !== rtl ? "right" : null;
  if (side && over > 1) out.left = round(side === "center" ? -over / 2 : -over);
  else if (side) out.align = side;
  else if (Math.abs(leftEdge) > 0.05) out.left = round(leftEdge);
  return out;
}
