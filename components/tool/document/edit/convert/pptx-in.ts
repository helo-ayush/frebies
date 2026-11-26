import type JSZip from "jszip";
import {
  ConvertError,
  type FixedDoc,
  type FixedImage,
  type FixedItem,
  type FixedPage,
  type FixedText,
  type FlowAlign,
  type FlowCell,
  type FlowLine,
  type FlowList,
  type FlowPara,
  type FlowRow,
  type FlowRun,
  type FlowStyle,
  type LineHead,
} from "./flow";
import { PRESETS } from "./pptx-out";
import { isSymbolFont, parseXml, pictureType, plainSymbols } from "./xml";

/**
 * Opens PowerPoint decks. What a slide does not say itself it takes from its
 * layout, the layout from its master, and colours and fonts from the theme.
 *
 * Boxes are kept as Office keeps them: the place before turning, and an angle
 * clockwise about the middle. Padding counts from the shape's own text area.
 */

// ---------------------------------------------------------------- xml

const EMU = 12700;
const pt = (emu: number) => emu / EMU;
const neat = (value: number) => Math.round(value * 100) / 100;

const DRAWABLE = new Set(["sp", "pic", "grpSp", "cxnSp", "graphicFrame", "oleObj"]);

/** Child elements. Of a drawing kept in two versions, the one every program can show. */
function kids(el: Element | null | undefined, name?: string): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(el?.children ?? [])) {
    if (child.localName !== "AlternateContent") out.push(child);
    else {
      const last = Array.from(child.children).find((branch) => branch.localName === "Fallback");
      const first = Array.from(child.children).find((branch) => branch.localName === "Choice");
      const plain = kids(last);
      out.push(...(plain.some((one) => DRAWABLE.has(one.localName)) || !first ? plain : kids(first)));
    }
  }
  return name === undefined ? out : out.filter((child) => child.localName === name);
}

const kid = (el: Element | null | undefined, name: string): Element | null => kids(el, name)[0] ?? null;

function inside(el: Element | null | undefined, ...names: string[]): Element | null {
  let at = el ?? null;
  for (const name of names) at = kid(at, name);
  return at;
}

const attr = (el: Element | null | undefined, name: string): string | null => el?.getAttribute(name) ?? null;

function num(el: Element | null | undefined, name: string): number | null {
  const raw = attr(el, name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

/** "50000" and "50%" are both a half. */
function share(el: Element | null | undefined, name = "val"): number | null {
  const value = num(el, name);
  if (value === null) return null;
  return attr(el, name)?.trim().endsWith("%") ? value / 100 : value / 100000;
}

function flag(el: Element | null | undefined, name: string): boolean | null {
  const raw = attr(el, name);
  return raw === null ? null : raw === "1" || raw === "true" || raw === "on";
}

const degrees = (value: number | null) => (value ?? 0) / 60000;

function relId(el: Element, name: string): string | null {
  for (const one of Array.from(el.attributes))
    if (one.localName === name && one.namespaceURI?.endsWith("elationships")) return one.value;
  return null;
}

function decode(bytes: Uint8Array): string {
  const wide = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff;
  return new TextDecoder(wide === true ? "utf-16be" : wide || "utf-8").decode(bytes);
}

// ---------------------------------------------------------------- the package

type Rel = { type: string; target: string; external: boolean };
type Part = { path: string; root: Element; rels: Map<string, Rel> };

const flatPath = (path: string) => path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();

function joinPath(base: string, target: string): string {
  const out = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const step of target.split("/")) {
    if (step === "..") out.pop();
    else if (step !== "." && step !== "") out.push(step);
  }
  return out.join("/");
}

class Package {
  private readonly names = new Map<string, string>();
  private readonly blobs = new Map<string, Promise<Uint8Array | null>>();
  private readonly parts = new Map<string, Promise<Part | null>>();
  private readonly owners = new Map<Document, Part>();

  constructor(private readonly zip: JSZip) {
    // Some programs write other capitals than the links that point there.
    for (const name of Object.keys(zip.files)) this.names.set(flatPath(name), name);
  }

  /** The same array every time, so a picture used twice is known to be one. */
  bytes(path: string): Promise<Uint8Array | null> {
    const key = flatPath(path);
    let job = this.blobs.get(key);
    if (!job) {
      const file = this.zip.file(this.names.get(key) ?? "");
      job = file ? file.async("uint8array") : Promise.resolve(null);
      this.blobs.set(key, job);
    }
    return job;
  }

  part(path: string): Promise<Part | null> {
    const key = flatPath(path);
    let job = this.parts.get(key);
    if (!job) this.parts.set(key, (job = this.load(path)));
    return job;
  }

  private async load(path: string): Promise<Part | null> {
    const bytes = await this.bytes(path);
    const root = bytes ? parseXml(decode(bytes)) : null;
    if (!root) return null;
    const part = { path, root, rels: await this.rels(path) };
    this.owners.set(root.ownerDocument, part);
    return part;
  }

  async rels(path: string): Promise<Map<string, Rel>> {
    const at = path.lastIndexOf("/") + 1;
    const bytes = await this.bytes(`${path.slice(0, at)}_rels/${path.slice(at)}.rels`);
    const out = new Map<string, Rel>();
    for (const el of kids(bytes ? parseXml(decode(bytes)) : null, "Relationship")) {
      const target = attr(el, "Target") ?? "";
      const external = attr(el, "TargetMode") === "External";
      out.set(attr(el, "Id") ?? "", {
        type: (attr(el, "Type") ?? "").split("/").pop() ?? "",
        target: external ? target : joinPath(path, target.replace(/%20/g, " ")),
        external,
      });
    }
    return out;
  }

  async main(): Promise<Part | null> {
    for (const rel of (await this.rels("")).values()) {
      const part = rel.type === "officeDocument" ? await this.part(rel.target) : null;
      if (part) return part;
    }
    return this.part("ppt/presentation.xml");
  }

  /** The part an element is in. */
  owner(el: Element): Part | null {
    return this.owners.get(el.ownerDocument) ?? null;
  }

  /** Where an element's r:id (or r:embed) leads. */
  rel(el: Element, name = "id"): Rel | null {
    const id = relId(el, name);
    return id === null ? null : (this.owner(el)?.rels.get(id) ?? null);
  }

  async related(part: Part | null, type: string): Promise<Part | null> {
    for (const rel of part?.rels.values() ?? []) if (rel.type === type && !rel.external) return this.part(rel.target);
    return null;
  }
}

/** Looks for letters written two bytes each, as the old file format does. */
function hasWide(bytes: Uint8Array, word: string): boolean {
  const codes = Array.from(word, (letter) => letter.charCodeAt(0));
  for (let at = bytes.indexOf(codes[0]); at >= 0; at = bytes.indexOf(codes[0], at + 1))
    if (codes.every((code, i) => bytes[at + i * 2] === code && bytes[at + i * 2 + 1] === 0)) return true;
  return false;
}

async function open(bytes: Uint8Array): Promise<Package> {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    if (hasWide(bytes, "EncryptedPackage"))
      throw new ConvertError("This presentation is locked with a password. Take the password off and try again.");
    throw new ConvertError("This is an old PowerPoint file. Save it as .pptx in PowerPoint and try again.");
  }
  const { default: Zip } = await import("jszip");
  try {
    return new Package(await Zip.loadAsync(bytes));
  } catch {
    throw new ConvertError("This presentation is damaged and could not be opened.");
  }
}

// ---------------------------------------------------------------- colours

/** 0 to 1 each. */
type Rgba = { r: number; g: number; b: number; a: number };

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

function fromHex(hex: string): Rgba | null {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!value) return null;
  const at = (i: number) => parseInt(value.slice(i, i + 2), 16) / 255;
  return { r: at(0), g: at(2), b: at(4), a: 1 };
}

const toHex = ({ r, g, b }: Rgba) =>
  `#${[r, g, b]
    .map((value) =>
      Math.round(clamp(value) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** A see-through colour as it looks on top of another. */
const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

const each = (c: Rgba, change: (value: number) => number): Rgba => ({
  r: clamp(change(c.r)),
  g: clamp(change(c.g)),
  b: clamp(change(c.b)),
  a: c.a,
});

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function toHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function fromHsl({ h, s, l }: { h: number; s: number; l: number }, a: number): Rgba {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const at = (shift: number) => {
    const t = (((h + shift) % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    return t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return { r: clamp(at(1 / 3)), g: clamp(at(0)), b: clamp(at(-1 / 3)), a };
}

let probe: CanvasRenderingContext2D | null = null;
/** "dkBlue" and friends: the names a browser knows, shortened. */
function named(name: string): Rgba | null {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.fillStyle = "#000000";
  probe.fillStyle = name.replace(/^dk/, "dark").replace(/^lt/, "light").replace(/^med/, "medium");
  return fromHex(probe.fillStyle);
}

const SYSTEM: Record<string, string> = {
  window: "ffffff",
  btnFace: "f0f0f0",
  btnHighlight: "ffffff",
  highlight: "0078d7",
  highlightText: "ffffff",
  infoBk: "ffffe1",
  menu: "f0f0f0",
  grayText: "6d6d6d",
};

type FontSet = { latin: string; ea: string; cs: string; scripts: Record<string, string> };

type Theme = {
  colors: Record<string, Rgba>;
  major: FontSet;
  minor: FontSet;
  fills: Element[];
  lines: Element[];
  backs: Element[];
};

/** A theme and how the master uses it. `ph` is the colour a style is asked to come in. */
type Look = { theme: Theme; map: Record<string, string>; ph?: Rgba | null };

function changed(c: Rgba, mod: Element): Rgba {
  const value = share(mod) ?? 0;
  const hsl = (patch: (hsl: { h: number; s: number; l: number }) => Partial<{ h: number; s: number; l: number }>) => {
    const now = toHsl(c);
    const next = { ...now, ...patch(now) };
    // More than all the colour there is: only what comes of it has a limit.
    return fromHsl({ h: next.h, s: Math.max(0, next.s), l: clamp(next.l) }, c.a);
  };
  const turn = degrees(num(mod, "val")) / 360;
  switch (mod.localName) {
    case "alpha":
      return { ...c, a: clamp(value) };
    case "alphaMod":
      return { ...c, a: clamp(c.a * value) };
    case "alphaOff":
      return { ...c, a: clamp(c.a + value) };
    // These reckon with light, not with the numbers of a screen colour.
    case "tint":
      return each(c, (v) => fromLinear(1 - (1 - toLinear(v)) * value));
    case "shade":
      return each(c, (v) => fromLinear(toLinear(v) * value));
    case "inv":
      return each(c, (v) => fromLinear(1 - toLinear(v)));
    case "lum":
      return hsl(() => ({ l: value }));
    case "lumMod":
      return hsl(({ l }) => ({ l: l * value }));
    case "lumOff":
      return hsl(({ l }) => ({ l: l + value }));
    case "sat":
      return hsl(() => ({ s: value }));
    case "satMod":
      return hsl(({ s }) => ({ s: s * value }));
    case "satOff":
      return hsl(({ s }) => ({ s: s + value }));
    case "hue":
      return hsl(() => ({ h: turn }));
    case "hueMod":
      return hsl(({ h }) => ({ h: h * value }));
    case "hueOff":
      return hsl(({ h }) => ({ h: h + turn }));
    case "comp":
      return hsl(({ h }) => ({ h: h + 0.5 }));
    case "gray":
      return each(c, () => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    case "gamma":
      return each(c, fromLinear);
    case "invGamma":
      return each(c, toLinear);
    default:
      return c;
  }
}

/** The colour an element such as `a:srgbClr` stands for. */
function colorOf(el: Element, look: Look | null): Rgba | null {
  let base: Rgba | null = null;
  const value = attr(el, "val") ?? "";
  switch (el.localName) {
    case "srgbClr":
      base = fromHex(value);
      break;
    case "schemeClr":
      base = value === "phClr" ? (look?.ph ?? null) : (look?.theme.colors[look.map[value] ?? value] ?? null);
      break;
    case "sysClr":
      base = fromHex(attr(el, "lastClr") ?? SYSTEM[value] ?? "000000");
      break;
    case "prstClr":
      base = named(value);
      break;
    case "scrgbClr": {
      const at = (name: string) => clamp(fromLinear(clamp(share(el, name) ?? 0)));
      base = { r: at("r"), g: at("g"), b: at("b"), a: 1 };
      break;
    }
    case "hslClr":
      base = fromHsl(
        { h: degrees(num(el, "hue")) / 360, s: clamp(share(el, "sat") ?? 0), l: clamp(share(el, "lum") ?? 0) },
        1,
      );
      break;
    default:
      return null;
  }
  return base ? kids(el).reduce(changed, base) : null;
}

/** The colour inside a fill, a reference, a highlight. */
function colorIn(el: Element | null | undefined, look: Look): Rgba | null {
  for (const child of kids(el)) {
    const color = colorOf(child, look);
    if (color) return color;
  }
  return null;
}

// ---------------------------------------------------------------- fills and lines

type Paint = { kind: "none" } | { kind: "color"; color: Rgba } | { kind: "picture"; el: Element; look: Look };
const NONE: Paint = { kind: "none" };
const inColor = (color: Rgba | null): Paint => (color ? { kind: "color", color } : NONE);

/** One colour for a gradient: what it comes to on the whole. */
function average(el: Element, look: Look): Rgba | null {
  const stops = kids(kid(el, "gsLst"), "gs")
    .map((gs) => ({ at: clamp(share(gs, "pos") ?? 0), color: colorIn(gs, look) }))
    .filter((stop): stop is { at: number; color: Rgba } => stop.color !== null)
    .sort((a, b) => a.at - b.at);
  if (stops.length === 0) return null;
  const sum = { r: 0, g: 0, b: 0, a: 0 };
  const add = (c: Rgba, share: number) => {
    sum.r += c.r * share;
    sum.g += c.g * share;
    sum.b += c.b * share;
    sum.a += c.a * share;
  };
  add(stops[0].color, stops[0].at);
  add(stops[stops.length - 1].color, 1 - stops[stops.length - 1].at);
  for (let i = 1; i < stops.length; i += 1) {
    const share = (stops[i].at - stops[i - 1].at) / 2;
    add(stops[i - 1].color, share);
    add(stops[i].color, share);
  }
  return sum;
}

/** A fill element itself, as themes list them. */
function paintFrom(el: Element, look: Look, group: Paint | null = null): Paint | null {
  switch (el.localName) {
    case "noFill":
      return NONE;
    case "solidFill":
      return inColor(colorIn(el, look));
    case "gradFill":
      return inColor(average(el, look));
    case "pattFill": {
      const front = colorIn(kid(el, "fgClr"), look) ?? BLACK;
      const back = colorIn(kid(el, "bgClr"), look) ?? WHITE;
      const share = Number(/^pct(\d+)$/.exec(attr(el, "prst") ?? "")?.[1] ?? 35) / 100;
      return inColor(over({ ...front, a: front.a * share }, back));
    }
    case "blipFill":
      return { kind: "picture", el, look };
    case "grpFill":
      return group ?? NONE;
    default:
      return null;
  }
}

/** The fill a set of properties names. Null when it says nothing about it. */
function paintOf(el: Element | null | undefined, look: Look, group: Paint | null = null): Paint | null {
  for (const child of kids(el)) {
    const paint = paintFrom(child, look, group);
    if (paint) return paint;
  }
  return null;
}

/** A fill from the theme's list, in the colour the shape asks for. */
function paintRef(ref: Element | null, look: Look): Paint | null {
  const index = num(ref, "idx");
  if (!ref || index === null) return null;
  const el = index > 1000 ? look.theme.backs[index - 1001] : look.theme.fills[index - 1];
  return el ? paintFrom(el, { ...look, ph: colorIn(ref, look) }) : NONE;
}

type Stroke = {
  /** Null: no line. Left out: nothing said. */
  color?: Rgba | null;
  width?: number;
  dash?: "solid" | "dash" | "dot";
  start?: LineHead;
  end?: LineHead;
};

const HEADS: Record<string, LineHead> = {
  none: "none",
  triangle: "arrow",
  stealth: "arrow",
  arrow: "open",
  oval: "dot",
  diamond: "diamond",
};

/** Only what the line says itself. */
function strokeOf(ln: Element | null | undefined, look: Look): Stroke {
  const out: Stroke = {};
  if (!ln) return out;
  const width = num(ln, "w");
  if (width !== null) out.width = Math.max(0.25, pt(width));
  const paint = paintOf(ln, look);
  if (paint) out.color = paint.kind === "color" ? paint.color : null;
  const dash = attr(kid(ln, "prstDash"), "val");
  if (dash) out.dash = dash === "solid" ? "solid" : /^(sys)?Dot$/i.test(dash) ? "dot" : "dash";
  else if (kid(ln, "custDash")) out.dash = "dash";
  const start = attr(kid(ln, "headEnd"), "type");
  const end = attr(kid(ln, "tailEnd"), "type");
  if (start) out.start = HEADS[start] ?? "none";
  if (end) out.end = HEADS[end] ?? "none";
  return out;
}

function strokeRef(ref: Element | null, look: Look): Stroke {
  const index = num(ref, "idx");
  if (!ref || !index) return {};
  return strokeOf(look.theme.lines[index - 1], { ...look, ph: colorIn(ref, look) });
}

function toLine(stroke: Stroke, under: Rgba): FlowLine | undefined {
  if (!stroke.color || stroke.color.a < 0.01) return undefined;
  const line: FlowLine = { color: toHex(over(stroke.color, under)), width: neat(stroke.width ?? 0.75) };
  if (stroke.dash && stroke.dash !== "solid") line.dash = stroke.dash;
  return line;
}

// ---------------------------------------------------------------- theme, master, layout

const OFFICE: Record<string, string> = {
  dk1: "000000",
  lt1: "ffffff",
  dk2: "44546a",
  lt2: "e7e6e6",
  accent1: "4472c4",
  accent2: "ed7d31",
  accent3: "a5a5a5",
  accent4: "ffc000",
  accent5: "5b9bd5",
  accent6: "70ad47",
  hlink: "0563c1",
  folHlink: "954f72",
};

const MAP: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

function fontSet(el: Element | null, base: FontSet): FontSet {
  if (!el) return base;
  const face = (name: string) => attr(kid(el, name), "typeface") ?? "";
  const scripts: Record<string, string> = {};
  for (const font of kids(el, "font")) scripts[attr(font, "script") ?? ""] = attr(font, "typeface") ?? "";
  return { latin: face("latin") || base.latin, ea: face("ea"), cs: face("cs"), scripts };
}

/** A theme, or what a slide changes about one. */
function readTheme(part: Part | null, base: Theme | null): Theme {
  const el = kid(part?.root, "themeElements") ?? part?.root ?? null;
  const colors: Record<string, Rgba> = base
    ? { ...base.colors }
    : Object.fromEntries(Object.entries(OFFICE).map(([name, hex]) => [name, fromHex(hex) ?? BLACK]));
  for (const slot of kids(kid(el, "clrScheme"))) {
    const first = kids(slot)[0];
    const color = first ? colorOf(first, null) : null;
    if (color) colors[slot.localName] = color;
  }
  const plain: FontSet = { latin: "Calibri", ea: "", cs: "", scripts: {} };
  const fonts = kid(el, "fontScheme");
  const format = kid(el, "fmtScheme");
  return {
    colors,
    major: fontSet(kid(fonts, "majorFont"), base?.major ?? plain),
    minor: fontSet(kid(fonts, "minorFont"), base?.minor ?? plain),
    fills: format ? kids(kid(format, "fillStyleLst")) : (base?.fills ?? []),
    lines: format ? kids(kid(format, "lnStyleLst")) : (base?.lines ?? []),
    backs: format ? kids(kid(format, "bgFillStyleLst")) : (base?.backs ?? []),
  };
}

type Ph = { type: string; idx: string };

function placeholder(sp: Element): Ph | null {
  const nv = kids(sp).find((child) => child.localName.startsWith("nv"));
  const ph = inside(nv, "nvPr", "ph");
  return ph ? { type: attr(ph, "type") ?? "obj", idx: attr(ph, "idx") ?? "0" } : null;
}

/** Placeholders of one kind follow the same part of the master. */
const phKind = (type: string): string =>
  type === "title" || type === "ctrTitle" ? "title" : /^(dt|ftr|sldNum|hdr)$/.test(type) ? type : "body";

function placeholders(root: Element | null | undefined): { ph: Ph; sp: Element }[] {
  const out: { ph: Ph; sp: Element }[] = [];
  const walk = (el: Element | null) => {
    for (const child of kids(el)) {
      if (child.localName === "grpSp") walk(child);
      const ph = DRAWABLE.has(child.localName) ? placeholder(child) : null;
      if (ph) out.push({ ph, sp: child });
    }
  };
  walk(inside(root, "cSld", "spTree"));
  return out;
}

function matching(list: { ph: Ph; sp: Element }[], want: Ph, exact: boolean): Element | null {
  const kind = phKind(want.type);
  const same = list.filter(({ ph }) => phKind(ph.type) === kind);
  const byIndex = exact ? same.find(({ ph }) => ph.idx === want.idx) : undefined;
  const byType = same.find(({ ph }) => ph.type === want.type);
  // A body that is nowhere in the layout must not take over the place of another one.
  return (byIndex ?? (exact && kind === "body" ? undefined : (byType ?? same[0])))?.sp ?? null;
}

type Master = { part: Part; look: Look; holders: { ph: Ph; sp: Element }[] };

type Deck = {
  pkg: Package;
  w: number;
  h: number;
  /** Text outside placeholders. */
  plain: Element | null;
  tableStyles: Element[];
  masters: Map<string, Promise<Master>>;
  /** Pictures made of the drawings of masters, which are the same on many slides. */
  art: Map<Look, Map<Element, Promise<FixedImage | null>>>;
  recolored: Map<string, Promise<Uint8Array | null>>;
};

function mapOf(el: Element | null | undefined): Record<string, string> {
  return el ? Object.fromEntries(Array.from(el.attributes, (attr) => [attr.localName, attr.value])) : {};
}

async function readMaster(deck: Deck, part: Part): Promise<Master> {
  const theme = readTheme(await deck.pkg.related(part, "theme"), null);
  const look: Look = { theme, map: { ...MAP, ...mapOf(kid(part.root, "clrMap")) } };
  return { part, look, holders: placeholders(part.root) };
}

function masterOf(deck: Deck, part: Part): Promise<Master> {
  let job = deck.masters.get(part.path);
  if (!job) deck.masters.set(part.path, (job = readMaster(deck, part)));
  return job;
}

// ---------------------------------------------------------------- where things are

type Box = { x: number; y: number; w: number; h: number; angle: number; flipX: boolean; flipY: boolean };
type Group = { box: Box; inner: { x: number; y: number; w: number; h: number }; up: Group | null };

const turned = (angle: number) => ((angle % 360) + 360) % 360;

function readBox(xfrm: Element): Box {
  const off = kid(xfrm, "off");
  const ext = kid(xfrm, "ext");
  return {
    x: pt(num(off, "x") ?? 0),
    y: pt(num(off, "y") ?? 0),
    w: pt(Math.max(0, num(ext, "cx") ?? 0)),
    h: pt(Math.max(0, num(ext, "cy") ?? 0)),
    angle: degrees(num(xfrm, "rot")),
    flipX: flag(xfrm, "flipH") ?? false,
    flipY: flag(xfrm, "flipV") ?? false,
  };
}

/** Takes a box out of the groups it is in. */
function place(box: Box, group: Group | null): Box {
  let { x, y, w, h, angle, flipX, flipY } = box;
  for (let g = group; g; g = g.up) {
    const { box: to, inner } = g;
    const sx = inner.w > 0 ? to.w / inner.w : 1;
    const sy = inner.h > 0 ? to.h / inner.h : 1;
    // A box lying on its side is stretched along its own other way.
    const side = Math.round(turned(angle) / 90) % 2 === 1;
    const mid = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    let cx = to.x + (x + w / 2 - inner.x) * sx - mid.x;
    let cy = to.y + (y + h / 2 - inner.y) * sy - mid.y;
    w *= side ? sy : sx;
    h *= side ? sx : sy;
    if (to.flipX) cx = -cx;
    if (to.flipY) cy = -cy;
    const rad = (to.angle * Math.PI) / 180;
    x = mid.x + cx * Math.cos(rad) - cy * Math.sin(rad) - w / 2;
    y = mid.y + cx * Math.sin(rad) + cy * Math.cos(rad) - h / 2;
    angle = to.angle + (to.flipX !== to.flipY ? -angle : angle);
    flipX = flipX !== to.flipX;
    flipY = flipY !== to.flipY;
  }
  return { x, y, w, h, angle: turned(angle), flipX, flipY };
}

const spot = ({ x, y, w, h }: Box) => ({ x: neat(x), y: neat(y), w: neat(w), h: neat(h) });

function turnOf({ angle, flipX, flipY }: Box): { angle?: number; flipX?: true; flipY?: true } {
  const out: { angle?: number; flipX?: true; flipY?: true } = {};
  const value = neat(turned(angle));
  if (value !== 0 && value !== 360) out.angle = value;
  if (flipX) out.flipX = true;
  if (flipY) out.flipY = true;
  return out;
}

/** A point of an unturned box, where it really is. */
function pointOf(box: Box, x: number, y: number): { x: number; y: number } {
  const rad = (box.angle * Math.PI) / 180;
  const dx = (box.flipX ? box.w - x : x) - box.w / 2;
  const dy = (box.flipY ? box.h - y : y) - box.h / 2;
  return {
    x: box.x + box.w / 2 + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: box.y + box.h / 2 + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

// ---------------------------------------------------------------- outlines

type Geometry = { shape: string; adj?: number[]; custom?: Element };

function adjusted(shape: string, list: Element | null): number[] | undefined {
  const given = new Map<string, number>();
  for (const gd of kids(list, "gd")) {
    const value = /^val\s+(-?\d+(?:\.\d+)?)$/.exec(attr(gd, "fmla")?.trim() ?? "")?.[1];
    if (value !== undefined) given.set(attr(gd, "name") ?? "", Number(value));
  }
  const names = PRESETS[shape];
  if (!names || given.size === 0) return undefined;
  return names.map(({ name, value, per }) => {
    const raw = given.get(name);
    if (raw === undefined) return value;
    const own = Math.round((raw / per) * 1e5) / 1e5;
    return per === 60000 ? turned(own) : own;
  });
}

function geometryOf(spPr: Element | null): Geometry | null {
  const preset = kid(spPr, "prstGeom");
  if (preset) {
    const shape = attr(preset, "prst") ?? "rect";
    return { shape, adj: adjusted(shape, kid(preset, "avLst")) };
  }
  const custom = kid(spPr, "custGeom");
  return custom ? { shape: "rect", custom } : null;
}

type Step =
  | { to: "M" | "L"; x: number; y: number }
  | { to: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { to: "Z" };
type Outline = { fill: boolean; stroke: boolean; steps: Step[] };

/** The names a drawing's formulas may use, and the formulas themselves. */
function guides(custom: Element, w: number, h: number): (name: string | null) => number {
  const ss = Math.min(w, h);
  const known: Record<string, number> = { l: 0, t: 0, r: w, b: h, w, h, hc: w / 2, vc: h / 2, ss, ls: Math.max(w, h) };
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 16, 32]) {
    known[`wd${n}`] = w / n;
    known[`hd${n}`] = h / n;
    known[`ssd${n}`] = ss / n;
  }
  Object.assign(known, { cd2: 10800000, cd4: 5400000, cd8: 2700000, "3cd4": 16200000, "3cd8": 8100000 });
  Object.assign(known, { "5cd8": 13500000, "7cd8": 18900000 });
  const value = (name: string | null): number => (name === null ? 0 : (known[name] ?? (Number.parseFloat(name) || 0)));
  const rad = (angle: number) => (angle / 60000 / 180) * Math.PI;
  const run = (formula: string): number => {
    const [op, ...names] = formula.trim().split(/\s+/);
    const [a = 0, b = 0, c = 0] = names.map(value);
    switch (op) {
      case "*/":
        return c === 0 ? 0 : (a * b) / c;
      case "+-":
        return a + b - c;
      case "+/":
        return c === 0 ? 0 : (a + b) / c;
      case "?:":
        return a > 0 ? b : c;
      case "abs":
        return Math.abs(a);
      case "at2":
        return (Math.atan2(b, a) * 180 * 60000) / Math.PI;
      case "cat2":
        return a * Math.cos(Math.atan2(c, b));
      case "cos":
        return a * Math.cos(rad(b));
      case "max":
        return Math.max(a, b);
      case "min":
        return Math.min(a, b);
      case "mod":
        return Math.hypot(a, b, c);
      case "pin":
        return Math.min(Math.max(a, b), c);
      case "sat2":
        return a * Math.sin(Math.atan2(c, b));
      case "sin":
        return a * Math.sin(rad(b));
      case "sqrt":
        return Math.sqrt(Math.max(0, a));
      case "tan":
        return a * Math.tan(rad(b));
      default:
        return a;
    }
  };
  for (const list of ["avLst", "gdLst"])
    for (const gd of kids(kid(custom, list), "gd")) known[attr(gd, "name") ?? ""] = run(attr(gd, "fmla") ?? "");
  return value;
}

/** A hand-drawn outline, in points from the box's corner. */
function outlines(custom: Element, w: number, h: number): Outline[] {
  const value = guides(custom, w * EMU, h * EMU);
  return kids(kid(custom, "pathLst"), "path").map((path) => {
    const sx = w / (num(path, "w") || w * EMU || 1);
    const sy = h / (num(path, "h") || h * EMU || 1);
    const steps: Step[] = [];
    let at = { x: 0, y: 0 };
    let from = at;
    const point = (el: Element | undefined) => ({
      x: value(attr(el, "x")) * sx,
      y: value(attr(el, "y")) * sy,
    });
    for (const cmd of kids(path)) {
      const pts = kids(cmd, "pt").map(point);
      if (cmd.localName === "close") {
        steps.push({ to: "Z" });
        at = from;
      } else if (cmd.localName === "arcTo") {
        const rx = value(attr(cmd, "wR")) * sx;
        const ry = value(attr(cmd, "hR")) * sy;
        const start = degrees(value(attr(cmd, "stAng"))) * (Math.PI / 180);
        const sweep = degrees(value(attr(cmd, "swAng"))) * (Math.PI / 180);
        if (rx <= 0 || ry <= 0) continue;
        // Office's angles are those of rays; on an ellipse the drawn ones differ.
        const drawn = (angle: number) => {
          const flat = Math.atan2(Math.sin(angle) * rx, Math.cos(angle) * ry);
          return flat + Math.round((angle - flat) / (2 * Math.PI)) * 2 * Math.PI;
        };
        const a0 = drawn(start);
        const whole = drawn(start + sweep) - a0;
        const cx = at.x - rx * Math.cos(a0);
        const cy = at.y - ry * Math.sin(a0);
        const pieces = Math.max(1, Math.ceil(Math.abs(whole) / (Math.PI / 2) - 1e-6));
        const k = (4 / 3) * Math.tan(whole / pieces / 4);
        for (let i = 0; i < pieces; i += 1) {
          const a = a0 + (whole * i) / pieces;
          const b = a0 + (whole * (i + 1)) / pieces;
          const x = cx + rx * Math.cos(b);
          const y = cy + ry * Math.sin(b);
          steps.push({
            to: "C",
            x1: at.x - k * rx * Math.sin(a),
            y1: at.y + k * ry * Math.cos(a),
            x2: x + k * rx * Math.sin(b),
            y2: y - k * ry * Math.cos(b),
            x,
            y,
          });
          at = { x, y };
        }
      } else if (cmd.localName === "cubicBezTo" && pts.length >= 3) {
        steps.push({ to: "C", x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, ...pts[2] });
        at = pts[2];
      } else if (cmd.localName === "quadBezTo" && pts.length >= 2) {
        const [c, end] = pts;
        const part = (a: number, b: number) => a + (2 / 3) * (b - a);
        const ends = { x1: part(at.x, c.x), y1: part(at.y, c.y), x2: part(end.x, c.x), y2: part(end.y, c.y) };
        steps.push({ to: "C", ...ends, ...end });
        at = end;
      } else if (pts.length > 0) {
        const move = cmd.localName === "moveTo";
        steps.push({ to: move ? "M" : "L", ...pts[0] });
        at = pts[0];
        if (move) from = at;
      }
    }
    return { fill: attr(path, "fill") !== "none", stroke: flag(path, "stroke") !== false, steps };
  });
}

function toPath(steps: Step[]): Path2D {
  const path = new Path2D();
  for (const step of steps) {
    if (step.to === "M") path.moveTo(step.x, step.y);
    else if (step.to === "L") path.lineTo(step.x, step.y);
    else if (step.to === "C") path.bezierCurveTo(step.x1, step.y1, step.x2, step.y2, step.x, step.y);
    else path.closePath();
  }
  return path;
}

/** A drawing of a few straight strokes, as the corners of each. */
function straight(list: Outline[]): { x: number; y: number }[][] | null {
  const out: { x: number; y: number }[][] = [];
  let count = 0;
  for (const { steps, stroke } of list) {
    if (!stroke) continue;
    for (const step of steps) {
      if (step.to === "C") return null;
      const last = out[out.length - 1];
      count += 1;
      if (step.to === "M") out.push([step]);
      else if (last) last.push(step.to === "Z" ? last[0] : step);
    }
  }
  return count > 0 && count <= 24 ? out.filter((points) => points.length > 1) : null;
}

/** A drawing that is one of the plain shapes after all. */
function plainShape(list: Outline[], w: number, h: number): "rect" | "line" | null {
  if (list.length !== 1) return null;
  const points: { x: number; y: number }[] = [];
  for (const step of list[0].steps) {
    if (step.to === "C") return null;
    if (step.to !== "Z") points.push(step);
  }
  const near = (a: number, b: number) => Math.abs(a - b) < 0.3;
  if (points.length === 2) return "line";
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 5 && near(first.x, last.x) && near(first.y, last.y)) points.pop();
  if (points.length !== 4) return null;
  const corner = points.every(({ x, y }) => (near(x, 0) || near(x, w)) && (near(y, 0) || near(y, h)));
  const sides = points.every((p, i) => near(p.x, points[(i + 1) % 4].x) !== near(p.y, points[(i + 1) % 4].y));
  return corner && sides ? "rect" : null;
}

// ---------------------------------------------------------------- pictures

async function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

function canvasOf(w: number, h: number): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas.getContext("2d");
}

const bitmap = (bytes: Uint8Array, mime: string) => createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));

/** Dots for every point: the larger a picture, the less it needs to look sharp. */
const dots = (w: number, h: number) => Math.min(4, 1800 / Math.max(w, h, 1));

/** Cuts a picture to a shape. */
async function masked(image: FixedImage, shape: Path2D): Promise<FixedImage> {
  try {
    const picture = await bitmap(image.bytes, image.mime);
    const crop = image.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const from = { w: picture.width * crop.w, h: picture.height * crop.h };
    const scale = Math.max(0.5, Math.min(dots(image.w, image.h), Math.max(from.w / image.w, from.h / image.h)));
    const draw = canvasOf(image.w * scale, image.h * scale);
    if (!draw) return image;
    draw.scale(draw.canvas.width / image.w, draw.canvas.height / image.h);
    draw.clip(shape, "evenodd");
    draw.imageSmoothingQuality = "high";
    const x = picture.width * crop.x;
    const y = picture.height * crop.y;
    draw.drawImage(picture, x, y, from.w, from.h, 0, 0, image.w, image.h);
    picture.close();
    const bytes = await toPng(draw.canvas);
    if (!bytes) return image;
    const { crop: _, ...rest } = image;
    return { ...rest, bytes, mime: "image/png" };
  } catch {
    return image;
  }
}

/** A drawing no preset shape stands for, as a picture of it. */
async function drawn(list: Outline[], box: Box, fill: Rgba | null, stroke: Stroke): Promise<FixedImage | null> {
  const css = (c: Rgba) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`;
  const line = stroke.color ?? null;
  const width = stroke.width ?? 0.75;
  const edge = line ? width / 2 + 0.5 : 0.5;
  const w = box.w + edge * 2;
  const h = box.h + edge * 2;
  const scale = dots(w, h);
  const draw = canvasOf(w * scale, h * scale);
  if (!draw) return null;
  draw.scale(draw.canvas.width / w, draw.canvas.height / h);
  draw.translate(edge, edge);
  draw.lineWidth = width;
  draw.lineJoin = "round";
  if (stroke.dash === "dash") draw.setLineDash([width * 4, width * 3]);
  if (stroke.dash === "dot") draw.setLineDash([width, width * 2]);
  for (const part of list) {
    const path = toPath(part.steps);
    if (fill && part.fill) {
      draw.fillStyle = css(fill);
      draw.fill(path, "evenodd");
    }
    if (line && part.stroke) {
      draw.strokeStyle = css(line);
      draw.stroke(path);
    }
  }
  const bytes = await toPng(draw.canvas);
  if (!bytes) return null;
  const at = { ...box, x: box.x - edge, y: box.y - edge, w, h };
  return { kind: "image", ...spot(at), ...turnOf(box), bytes, mime: "image/png" };
}

const tones = new WeakMap<Uint8Array, Rgba>();
/** What a picture's colours come to on the whole. */
async function tone({ bytes, mime }: FixedImage): Promise<Rgba | null> {
  const known = tones.get(bytes);
  if (known) return known;
  const picture = await bitmap(bytes, mime);
  const draw = canvasOf(16, 16);
  if (!draw) return null;
  draw.fillStyle = "#ffffff";
  draw.fillRect(0, 0, 16, 16);
  draw.imageSmoothingQuality = "high";
  draw.drawImage(picture, 0, 0, 16, 16);
  picture.close();
  const { data } = draw.getImageData(0, 0, 16, 16);
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 1) if (i % 4 < 3) sum[i % 4] += data[i] / 255 / 256;
  const color = { r: sum[0], g: sum[1], b: sum[2], a: 1 };
  tones.set(bytes, color);
  return color;
}

/** A small picture laid out again and again. */
async function tiled(bytes: Uint8Array, mime: string, tile: Element, w: number, h: number): Promise<Uint8Array | null> {
  const picture = await bitmap(bytes, mime);
  const scale = Math.min(2, dots(w, h));
  const draw = canvasOf(w * scale, h * scale);
  const pattern = draw?.createPattern(picture, "repeat");
  if (!draw || !pattern) return null;
  // Pictures count 96 dots to the inch here, so a dot is three quarters of a point.
  const sx = (share(tile, "sx") ?? 1) * 0.75;
  const sy = (share(tile, "sy") ?? 1) * 0.75;
  pattern.setTransform(
    new DOMMatrix([sx * scale, 0, 0, sy * scale, pt(num(tile, "tx") ?? 0) * scale, pt(num(tile, "ty") ?? 0) * scale]),
  );
  draw.fillStyle = pattern;
  draw.fillRect(0, 0, draw.canvas.width, draw.canvas.height);
  return toPng(draw.canvas);
}

type Dots = Uint8ClampedArray;
/** Changes one dot of a picture. */
type Recolor = (d: Dots, i: number) => void;

/** How a picture's colours are changed. Null when they stay as they are. */
function recolorsOf(blip: Element, look: Look): Recolor[] | null {
  const out: Recolor[] = [];
  const gray = (d: Dots, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const set = (d: Dots, i: number, r: number, g: number, b: number) => {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  };
  for (const el of kids(blip)) {
    switch (el.localName) {
      case "grayscl":
        out.push((d, i) => {
          const value = gray(d, i);
          set(d, i, value, value, value);
        });
        break;
      case "biLevel": {
        const limit = (share(el, "thresh") ?? 0.5) * 255;
        out.push((d, i) => {
          const value = gray(d, i) >= limit ? 255 : 0;
          set(d, i, value, value, value);
        });
        break;
      }
      case "duotone": {
        const [dark, light] = kids(el).map((child) => colorOf(child, look));
        if (!dark || !light) break;
        out.push((d, i) => {
          const part = gray(d, i);
          const mix = (a: number, b: number) => a * (255 - part) + b * part;
          set(d, i, mix(dark.r, light.r), mix(dark.g, light.g), mix(dark.b, light.b));
        });
        break;
      }
      case "lum": {
        const bright = (share(el, "bright") ?? 0) * 255;
        const contrast = share(el, "contrast") ?? 0;
        const factor = contrast > 0 ? 1 / Math.max(0.01, 1 - contrast) : 1 + contrast;
        const value = (channel: number) => (channel - 127.5) * factor + 127.5 + bright;
        out.push((d, i) => set(d, i, value(d[i]), value(d[i + 1]), value(d[i + 2])));
        break;
      }
      case "clrChange": {
        const from = colorIn(kid(el, "clrFrom"), look);
        const to = colorIn(kid(el, "clrTo"), look);
        if (!from || !to) break;
        const near = (a: number, b: number) => Math.abs(a - b * 255) < 3;
        out.push((d, i) => {
          if (!near(d[i], from.r) || !near(d[i + 1], from.g) || !near(d[i + 2], from.b)) return;
          set(d, i, to.r * 255, to.g * 255, to.b * 255);
          d[i + 3] *= to.a;
        });
        break;
      }
      default:
        break;
    }
  }
  return out.length > 0 ? out : null;
}

async function repaint(bytes: Uint8Array, mime: string, changes: Recolor[]): Promise<Uint8Array | null> {
  const picture = await bitmap(bytes, mime);
  const scale = Math.min(1, 2400 / Math.max(picture.width, picture.height));
  const draw = canvasOf(picture.width * scale, picture.height * scale);
  if (!draw) return null;
  const { width, height } = draw.canvas;
  draw.drawImage(picture, 0, 0, width, height);
  picture.close();
  const image = draw.getImageData(0, 0, width, height);
  for (const change of changes) for (let i = 0; i < image.data.length; i += 4) change(image.data, i);
  draw.putImageData(image, 0, 0);
  return toPng(draw.canvas);
}

/** The picture behind an `a:blip`, in the colours the deck gives it. */
async function blipOf(deck: Deck, blip: Element, look: Look): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const vector = kids(kid(blip, "extLst"), "ext").map((ext) => kid(ext, "svgBlip"))[0] ?? null;
  for (const el of [blip, vector]) {
    const rel = el && deck.pkg.rel(el, "embed");
    const bytes = rel && !rel.external ? await deck.pkg.bytes(rel.target) : null;
    const mime = bytes && pictureType(bytes);
    if (!rel || !bytes || !mime) continue;
    const changes = recolorsOf(blip, look);
    if (!changes) return { bytes, mime };
    const key = [rel.target, JSON.stringify(look.map), ...kids(blip).map((child) => child.outerHTML)].join(" ");
    let job = deck.recolored.get(key);
    if (!job) deck.recolored.set(key, (job = repaint(bytes, mime, changes).catch(() => null)));
    const png = await job;
    return png ? { bytes: png, mime: "image/png" } : { bytes, mime };
  }
  return null;
}

/** The picture of a fill in its box, with the part of it that shows. */
async function pictureOf(deck: Deck, look: Look, fill: Element, box: Box): Promise<FixedImage | null> {
  const blip = kid(fill, "blip");
  const found = blip && box.w > 0 && box.h > 0 ? await blipOf(deck, blip, look) : null;
  if (!blip || !found) return null;
  const { bytes, mime } = found;

  const image: FixedImage = { kind: "image", ...spot(box), ...turnOf(box), bytes, mime };
  const alpha = share(kid(blip, "alphaModFix"), "amt");
  if (alpha !== null && alpha < 1) image.opacity = neat(alpha);
  const tile = kid(fill, "tile");
  if (tile) {
    const png = await tiled(bytes, mime, tile, box.w, box.h).catch(() => null);
    return png ? { ...image, bytes: png, mime: "image/png" } : image;
  }

  const side = (el: Element | null, name: string) => share(el, name) ?? 0;
  const src = kid(fill, "srcRect");
  const to = kid(kid(fill, "stretch"), "fillRect");
  /** Along one way: which part of the picture shows, on which part of the box. */
  const fit = (a: string, b: string) => {
    const from = side(src, a);
    const span = 1 - from - side(src, b);
    const start = side(to, a);
    const room = 1 - start - side(to, b);
    if (span <= 0 || room <= 0) return { crop: 0, part: 1, at: 0, size: 1 };
    const boxOf = (u: number) => start + ((u - from) / span) * room;
    const at = Math.max(0, start, boxOf(0));
    const end = Math.min(1, start + room, boxOf(1));
    const back = (v: number) => from + ((v - start) / room) * span;
    return { crop: back(at), part: Math.max(0, back(end) - back(at)), at, size: Math.max(0, end - at) };
  };
  const x = fit("l", "r");
  const y = fit("t", "b");
  if (x.size <= 0 || y.size <= 0) return null;
  const tiny = (value: number) => Math.abs(value) < 0.0005;
  if (!tiny(x.crop) || !tiny(y.crop) || !tiny(x.part - 1) || !tiny(y.part - 1)) {
    const exact = (value: number) => Math.round(value * 1e5) / 1e5;
    image.crop = { x: exact(x.crop), y: exact(y.crop), w: exact(x.part), h: exact(y.part) };
  }
  if (!tiny(x.size - 1) || !tiny(y.size - 1)) {
    // Less than the whole box: its middle moves with the turn of the box.
    const mid = pointOf(box, (x.at + x.size / 2) * box.w, (y.at + y.size / 2) * box.h);
    const w = box.w * x.size;
    const h = box.h * y.size;
    Object.assign(image, spot({ ...box, x: mid.x - w / 2, y: mid.y - h / 2, w, h }));
  }
  return image;
}

// ---------------------------------------------------------------- letters of picture fonts

const from = (first: number, letters: string): [number, string][] =>
  Array.from(letters, (letter, i) => [first + i, letter]);

/** Wingdings 3, which PowerPoint's own themes take their bullets from. */
const ARROWS = new Map<number, string>([
  ...from(0x21, "←→↑↓↖↗↙↘"),
  ...from(0x31, "↔↕←→↑↓"),
  ...from(0x5a, "⇐⇒⇐⇒⇐⇒⇐⇒⇐⇒⇐⇒←→↑↓↖↗↙↘⇔↕▲▼△▽◀▶◁▷◣◢◤◥◀▶▲"),
  ...from(0x80, "▼▲▼◀▶◀➤▲▼←→↑↓←→↑↓←→↑↓←→↑↓←→↑↓←→↑↓←→↑↓←→←→←→←▪▪▪▪"),
  ...from(0xb0, "➤◀➤◀➤◀▶▲▼◀▶▲▼◀▶▲▼◀▶▲▼←→↑↓"),
  ...from(0xd1, "←→↑↓↖↗↙↘←→↑↓↖↗↙↘←→↑↓↖↗↙↘◀▶▲▼◀▶▲▼"),
]);

/** Where picture fonts keep their letters. */
const PRIVATE = /[\uf020-\uf0ff]/g;

/** What a reader sees for text in a picture font. */
function pictured(letters: string, font: string): string {
  const spell = (letter: string) => ARROWS.get(letter.charCodeAt(0) & 255) ?? letter;
  const seen = /^wingdings\s*3$/i.test(font.trim())
    ? letters.replace(/[\u0021-\u00ff\uf021-\uf0ff]/g, spell)
    : plainSymbols(letters, font);
  return seen.replace(PRIVATE, "•");
}

// ---------------------------------------------------------------- text looks

type Gap = { points: number } | { part: number };
type Bullet = { kind: "none" } | { kind: "mark"; mark: string } | { kind: "number"; scheme: string; start: number };

type ParaLook = {
  left: number;
  right: number;
  first: number;
  align: FlowAlign;
  line: Gap;
  before: Gap;
  after: Gap;
  bullet: Bullet;
  /** "" : that of the text. */
  bulletFont: string;
  tabs: number[];
  tabStep: number;
};

type RunLook = {
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  caps: string;
  tracking: number;
  shift: number;
  /** Null: letters that do not show. */
  color: Rgba | null;
  outline: Rgba | null;
  back: Rgba | null;
  latin: string;
  ea: string;
  cs: string;
  sym: string;
};

const PARA: ParaLook = {
  left: 0,
  right: 0,
  first: 0,
  align: "left",
  line: { part: 1 },
  before: { points: 0 },
  after: { points: 0 },
  bullet: { kind: "none" },
  bulletFont: "",
  tabs: [],
  tabStep: 72,
};

const RUN: RunLook = {
  size: 18,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  caps: "none",
  tracking: 0,
  shift: 0,
  color: BLACK,
  outline: null,
  back: null,
  latin: "+mn-lt",
  ea: "+mn-ea",
  cs: "+mn-cs",
  sym: "",
};

const ALIGNS: Record<string, FlowAlign> = {
  l: "left",
  ctr: "center",
  r: "right",
  just: "justify",
  justLow: "justify",
  dist: "justify",
  thaiDist: "justify",
};

function gapOf(el: Element | null): Gap | null {
  const points = num(kid(el, "spcPts"), "val");
  if (points !== null) return { points: points / 100 };
  const part = share(kid(el, "spcPct"));
  return part === null ? null : { part };
}

function paraLook(el: Element | null): Partial<ParaLook> {
  const out: Partial<ParaLook> = {};
  if (!el) return out;
  const left = num(el, "marL");
  const right = num(el, "marR");
  const first = num(el, "indent");
  const step = num(el, "defTabSz");
  const align = ALIGNS[attr(el, "algn") ?? ""];
  if (left !== null) out.left = pt(left);
  if (right !== null) out.right = pt(right);
  if (first !== null) out.first = pt(first);
  if (step !== null && step > 0) out.tabStep = pt(step);
  if (align) out.align = align;
  const line = gapOf(kid(el, "lnSpc"));
  const before = gapOf(kid(el, "spcBef"));
  const after = gapOf(kid(el, "spcAft"));
  if (line) out.line = line;
  if (before) out.before = before;
  if (after) out.after = after;
  for (const child of kids(el)) {
    switch (child.localName) {
      case "buNone":
        out.bullet = { kind: "none" };
        break;
      case "buChar":
        out.bullet = { kind: "mark", mark: attr(child, "char") ?? "•" };
        break;
      case "buBlip":
        out.bullet = { kind: "mark", mark: "•" };
        break;
      case "buAutoNum":
        out.bullet = {
          kind: "number",
          scheme: attr(child, "type") ?? "arabicPeriod",
          start: num(child, "startAt") ?? 1,
        };
        break;
      case "buFont":
        out.bulletFont = attr(child, "typeface") ?? "";
        break;
      case "buFontTx":
        out.bulletFont = "";
        break;
      case "tabLst":
        out.tabs = kids(child, "tab").map((tab) => pt(num(tab, "pos") ?? 0));
        break;
      default:
        break;
    }
  }
  return out;
}

function runLook(el: Element | null, look: Look): Partial<RunLook> {
  const out: Partial<RunLook> = {};
  if (!el) return out;
  const size = num(el, "sz");
  const bold = flag(el, "b");
  const italic = flag(el, "i");
  const tracking = num(el, "spc");
  const shift = share(el, "baseline");
  const under = attr(el, "u");
  const strike = attr(el, "strike");
  const caps = attr(el, "cap");
  if (size !== null) out.size = size / 100;
  if (bold !== null) out.bold = bold;
  if (italic !== null) out.italic = italic;
  if (under !== null) out.underline = under !== "none";
  if (strike !== null) out.strike = strike !== "noStrike";
  if (caps !== null) out.caps = caps;
  if (tracking !== null) out.tracking = tracking / 100;
  if (shift !== null) out.shift = shift;
  for (const child of kids(el)) {
    const face = attr(child, "typeface");
    switch (child.localName) {
      case "latin":
        if (face) out.latin = face;
        break;
      case "ea":
        if (face) out.ea = face;
        break;
      case "cs":
        if (face) out.cs = face;
        break;
      case "sym":
        if (face) out.sym = face;
        break;
      case "ln":
        out.outline = strokeOf(child, look).color ?? null;
        break;
      case "highlight":
        out.back = colorIn(child, look);
        break;
      default: {
        const paint = paintFrom(child, look);
        if (paint?.kind === "color") out.color = paint.color;
        else if (paint?.kind === "none") out.color = null;
      }
    }
  }
  return out;
}

/** Where text takes its looks from, weakest first. */
type Layer = { list?: Element | null; run?: Partial<RunLook> };

function levelLook(layers: Layer[], level: number, look: Look): { para: ParaLook; run: RunLook } {
  const para = { ...PARA };
  const run = { ...RUN };
  for (const layer of layers) {
    const el = kid(layer.list, `lvl${level + 1}pPr`);
    Object.assign(para, paraLook(el));
    Object.assign(run, runLook(kid(el, "defRPr"), look), layer.run);
  }
  return { para, run };
}

function scriptOf(code: number): string {
  if (code < 0x590) return "";
  if (code <= 0x5ff || (code >= 0xfb1d && code <= 0xfb4f)) return "Hebr";
  if (code <= 0x8ff || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) return "Arab";
  if (code <= 0xdff) {
    const names = "Deva Beng Guru Gujr Orya Taml Telu Knda Mlym Sinh".split(" ");
    return names[Math.floor((code - 0x900) / 0x80)] ?? "";
  }
  if (code <= 0xe7f) return "Thai";
  if (code <= 0xeff) return "Laoo";
  if (code <= 0xfff) return "Tibt";
  if (code >= 0x1780 && code <= 0x17ff) return "Khmr";
  if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)) return "Hang";
  if (code >= 0xac00 && code <= 0xd7ff) return "Hang";
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) return "Jpan";
  if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) return "Han";
  return (code >= 0xff00 && code <= 0xffef) || code >= 0x20000 ? "Han" : "";
}

const EAST = new Set(["Hang", "Jpan", "Han"]);

function faceOf(face: string, look: Look): string {
  const theme = /^\+(mj|mn)-(lt|ea|cs)$/.exec(face);
  if (!theme) return face;
  const set = theme[1] === "mj" ? look.theme.major : look.theme.minor;
  return theme[2] === "lt" ? set.latin : theme[2] === "ea" ? set.ea : set.cs;
}

/** The font for letters of one script. */
function fontFor(script: string, run: RunLook, look: Look, lang: string): string {
  const latin = faceOf(run.latin, look) || look.theme.minor.latin;
  if (!script) return latin;
  const east = EAST.has(script);
  const asked = east ? run.ea : run.cs;
  const own = faceOf(asked, look);
  if (own) return own;
  const set = asked.startsWith("+mj") ? look.theme.major : look.theme.minor;
  let key = script;
  if (script === "Han")
    key = /^ja/.test(lang) ? "Jpan" : /^ko/.test(lang) ? "Hang" : /TW|HK|MO/.test(lang) ? "Hant" : "Hans";
  return set.scripts[key] || latin;
}

/** Pieces of text that are drawn in one font. */
function byFont(letters: string, run: RunLook, look: Look, lang: string): { text: string; font: string }[] {
  const out: { text: string; font: string }[] = [];
  let script: string | null = null;
  for (const letter of letters) {
    const code = letter.codePointAt(0) ?? 0;
    const own = scriptOf(code);
    // Blanks and signs go with the words they stand by.
    const loose = !own && (code < 0x30 || (code > 0x39 && code < 0x41) || (code >= 0x2000 && code < 0x2070));
    if (script === null || (own !== script && !loose)) script = own;
    const font = fontFor(script, run, look, lang);
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += letter;
    else out.push({ text: letter, font });
  }
  return out;
}

const NUMBER_MARKS: Record<string, string> = {
  arabicPeriod: "1.",
  arabicParenR: "1)",
  arabicParenBoth: "(1)",
  arabicPlain: "1",
  arabicDbPeriod: "1.",
  arabicDbPlain: "1",
  circleNumDbPlain: "(1)",
  circleNumWdBlackPlain: "(1)",
  circleNumWdWhitePlain: "(1)",
  alphaLcPeriod: "a.",
  alphaLcParenR: "a)",
  alphaLcParenBoth: "(a)",
  alphaUcPeriod: "A.",
  alphaUcParenR: "A)",
  alphaUcParenBoth: "(A)",
  romanLcPeriod: "i.",
  romanLcParenR: "i)",
  romanLcParenBoth: "(i)",
  romanUcPeriod: "I.",
  romanUcParenR: "I)",
  romanUcParenBoth: "(I)",
  hebrew2Minus: "1-",
};

// ---------------------------------------------------------------- text

type Ctx = {
  deck: Deck;
  look: Look;
  items: FixedItem[];
  /** What is behind, for colours that let it through. */
  paper: Rgba;
  /** The slide's number. */
  number: number;
  master: Master | null;
  /** Where a placeholder's looks come from, nearest first. */
  parents: (ph: Ph) => Element[];
  /** The slide's own drawing, not that of its layout or master. */
  own: boolean;
  fill: Paint | null;
};

/** How text was made to fit its box. `ends`: the room before the first and after the last paragraph counts. */
type Fit = { scale: number; cut: number; ends: boolean };

type Letters = { runs: FlowRun[]; size: number; shows: boolean };

function addRun(runs: FlowRun[], letters: string, style: FlowStyle) {
  const last = runs[runs.length - 1];
  if (last?.text !== undefined && JSON.stringify(last.style) === JSON.stringify(style)) last.text += letters;
  else runs.push({ text: letters, style });
}

function styleOf(run: RunLook, font: string, size: number, color: Rgba, paper: Rgba, link: string | null): FlowStyle {
  const style: FlowStyle = { font, size: neat(size), color: toHex(over(color, paper)) };
  if (run.bold) style.bold = true;
  if (run.italic) style.italic = true;
  if (run.underline) style.underline = true;
  if (run.strike) style.strike = true;
  if (run.shift > 0) style.script = "super";
  if (run.shift < 0) style.script = "sub";
  if (run.back) style.highlight = toHex(over(run.back, paper));
  if (run.tracking) style.tracking = neat(run.tracking);
  if (link) style.link = link;
  return style;
}

const sized = (size: number, fit: Fit) => (fit.scale === 1 ? size : Math.max(1, Math.round(size * fit.scale)));

/** The address behind a link. Jumps inside the deck have none. */
function linkOf(el: Element | null, ctx: Ctx): string | null {
  const rel = el ? ctx.deck.pkg.rel(el) : null;
  return rel?.external && /^(https?|mailto|tel|ftp):/i.test(rel.target) ? rel.target : null;
}

function readLetters(p: Element, base: RunLook, ctx: Ctx, fit: Fit, shapeLink: string | null): Letters {
  const { look, paper } = ctx;
  const runs: FlowRun[] = [];
  let size = 0;
  let shows = false;
  const put = (letters: string, rPr: Element | null) => {
    const run = { ...base, ...runLook(rPr, look) };
    const click = kid(rPr, "hlinkClick");
    const link = linkOf(click, ctx) ?? shapeLink;
    const jumps = click !== null && (ctx.deck.pkg.rel(click) !== null || Boolean(attr(click, "action")));
    let color = run.color ?? run.outline;
    if (jumps && color) {
      // Links take the theme's colour, unless newer PowerPoint was told to leave them alone.
      const keep = kids(kid(click, "extLst"), "ext").some((ext) => attr(kid(ext, "hlinkClr"), "val") === "tx");
      if (!keep) color = look.theme.colors[look.map.hlink ?? "hlink"] ?? color;
      run.underline = true;
    }
    const at = sized(run.size, fit);
    size = Math.max(size, at);
    if (!color || letters === "") return;
    if (/[^\s]/.test(letters)) shows = true;
    const lang = attr(rPr, "lang") ?? "";
    const face = faceOf(run.latin, look);
    const special = isSymbolFont(face);
    const plain = { ...run, latin: special ? "+mn-lt" : run.latin };
    const seen = special
      ? pictured(letters, face)
      : letters.replace(PRIVATE, (letter) => pictured(letter, run.sym || "Wingdings"));
    for (const { text: piece, font } of byFont(seen, plain, look, lang)) {
      if (run.caps === "small") {
        for (const bit of piece.match(/\p{Ll}+|\P{Ll}+/gu) ?? []) {
          const low = /^\p{Ll}/u.test(bit);
          addRun(runs, bit.toUpperCase(), styleOf(run, font, low ? at * 0.8 : at, color, paper, link));
        }
      } else addRun(runs, run.caps === "all" ? piece.toUpperCase() : piece, styleOf(run, font, at, color, paper, link));
    }
  };
  for (const child of kids(p)) {
    const rPr = kid(child, "rPr");
    if (child.localName === "r") put((kid(child, "t")?.textContent ?? "").replace(/[\v\r]|_x000B_/g, "\n"), rPr);
    else if (child.localName === "br") put("\n", rPr);
    else if (child.localName === "fld") {
      const number = attr(child, "type") === "slidenum";
      put(number ? String(ctx.number) : (kid(child, "t")?.textContent ?? ""), rPr);
    } else if (child.localName === "m") {
      const math = Array.from(child.getElementsByTagName("*")).filter((el) => el.localName === "t");
      put(math.map((el) => el.textContent ?? "").join(""), null);
    }
  }
  if (size === 0 || runs.length === 0) {
    const run = { ...base, ...runLook(kid(p, "endParaRPr"), look) };
    size = sized(run.size, fit);
    if (runs.length === 0) {
      const font = fontFor("", run, look, "");
      runs.push({ text: "", style: styleOf(run, font, size, run.color ?? BLACK, paper, null) });
    }
  }
  return { runs, size, shows };
}

/** PowerPoint's lines are 1.2 times the letters, whatever the font. */
const LINE = 1.2;
const gapSize = (gap: Gap, size: number) => ("points" in gap ? gap.points : gap.part * LINE * size);

type Body = { blocks: FlowPara[]; shows: boolean };

function readBody(body: Element | null, layers: Layer[], ctx: Ctx, fit: Fit, link: string | null = null): Body {
  const all: Layer[] = [...layers, { list: kid(body, "lstStyle") }];
  const looks = new Map<number, ReturnType<typeof levelLook>>();
  const blocks: FlowPara[] = [];
  /** PowerPoint's counting, per level. */
  const counts: ({ key: string; at: number } | undefined)[] = [];
  const numbers: (number | null)[] = [];
  let shows = false;
  const paras = kids(body, "p");
  paras.forEach((p, i) => {
    const pPr = kid(p, "pPr");
    const level = clamp(num(pPr, "lvl") ?? 0, 0, 8);
    let base = looks.get(level);
    if (!base) looks.set(level, (base = levelLook(all, level, ctx.look)));
    const look = { ...base.para, ...paraLook(pPr) };
    const letters = readLetters(p, base.run, ctx, fit, link);
    if (letters.shows) shows = true;
    let { left, first } = look;
    const list = letters.shows ? listOf(look, level) : null;
    // A mark that cannot be seen still keeps its room.
    if (letters.shows && !list && look.bullet.kind === "mark") first = 0;
    if (list && first > -1) {
      // No room was kept for the mark: the words stand right after it.
      const room = (list.mark.length * 0.5 + 0.25) * letters.size;
      left += first + room;
      first = -room;
    }
    const pieces = byHeight(letters);
    const before = i > 0 || fit.ends ? gapSize(look.before, pieces[0].size) : 0;
    const after = i < paras.length - 1 || fit.ends ? gapSize(look.after, pieces[pieces.length - 1].size) : 0;
    const part = "part" in look.line ? Math.max(0.1, look.line.part - fit.cut) : 0;
    pieces.forEach(({ runs, size }, k) => {
      const block: FlowPara = { kind: "para", runs };
      const start = k === 0 ? first : 0;
      if (look.align !== "left") block.align = look.align;
      if (list && k === 0) block.list = list;
      block.line = { points: neat("points" in look.line ? look.line.points : part * LINE * size) };
      if (before > 0 && k === 0) block.before = neat(before);
      if (after > 0 && k === pieces.length - 1) block.after = neat(after);
      if (Math.abs(left) > 0.01) block.left = neat(left);
      if (Math.abs(start) > 0.01) block.first = neat(start);
      if (look.right > 0.01) block.right = neat(look.right);
      if (runs.some((run) => run.text?.includes("\t"))) block.tabs = tabStops(look);
      blocks.push(block);
    });

    let count: number | null = null;
    if (look.bullet.kind === "number") {
      // An empty line neither gets a number nor starts the counting over.
      if (letters.shows) {
        const key = `${look.bullet.scheme} ${look.bullet.start}`;
        const now = counts[level];
        count = now?.key === key ? now.at + 1 : look.bullet.start;
        counts.length = level;
        counts[level] = { key, at: count };
      }
    } else counts.length = Math.min(counts.length, level);
    numbers.push(count, ...pieces.slice(1).map(() => null));
  });
  setStarts(blocks, numbers);
  return { blocks, shows };
}

/**
 * The lines of a paragraph that breaks them by hand, when they are not equally high: a paragraph
 * has one line height, so such lines become paragraphs of their own. Else the paragraph as it is.
 */
function byHeight({ runs, size }: Letters): { runs: FlowRun[]; size: number }[] {
  const lines: { runs: FlowRun[]; size: number }[] = [{ runs: [], size: 0 }];
  for (const run of runs) {
    if (run.text === undefined) continue;
    for (const [i, piece] of run.text.split("\n").entries()) {
      if (i > 0) lines.push({ runs: [], size: 0 });
      const line = lines[lines.length - 1];
      if (piece !== "" || line.runs.length === 0) line.runs.push({ text: piece, style: run.style });
      if (piece !== "" || line.size === 0) line.size = Math.max(line.size, run.style.size ?? size);
    }
  }
  const sizes = lines.map((line) => line.size);
  if (Math.max(...sizes) - Math.min(...sizes) < size * 0.05) return [{ runs, size }];
  for (const line of lines) if (line.runs.length > 1) line.runs = line.runs.filter((run) => run.text !== "");
  return lines;
}

function listOf(look: ParaLook, level: number): FlowList | null {
  const { bullet } = look;
  if (bullet.kind === "none") return null;
  if (bullet.kind === "number") return { type: "number", mark: NUMBER_MARKS[bullet.scheme] ?? "1.", level };
  // Some files hold the codes of old Windows here.
  const plain = bullet.mark
    .replace(/\ufffd+|•+/g, "•")
    .replace(/[\u0080-\u009f]/g, (sign) => new TextDecoder("windows-1252").decode(Uint8Array.of(sign.charCodeAt(0))));
  const mark = pictured(plain, look.bulletFont).trim();
  if (!mark) return null;
  // Office's hollow bullet is the letter o of a typewriter font.
  return { type: "bullet", mark: mark === "o" && /courier/i.test(look.bulletFont) ? "◦" : mark, level };
}

/**
 * Says where a list counts on from, where that is not plain: a list goes on after
 * lines of a deeper level in PowerPoint, but not after a line without a mark in the editor.
 */
function setStarts(blocks: FlowPara[], numbers: (number | null)[]) {
  const counts: number[] = [];
  const kinds: string[] = [];
  blocks.forEach(({ list }, i) => {
    if (!list) {
      counts.length = 0;
      kinds.length = 0;
      return;
    }
    const { level } = list;
    const kind = `${list.type}${list.mark}`;
    counts.length = Math.min(counts.length, level + 1);
    kinds.length = Math.min(kinds.length, level + 1);
    const goes = counts[level] !== undefined && kinds[level] === kind;
    const number = numbers[i];
    if (number !== null && number !== (goes ? counts[level] + 1 : 1)) list.start = number;
    counts[level] = number ?? 0;
    kinds[level] = kind;
  });
}

/** Its own stops, then the usual ones. */
function tabStops({ tabs, tabStep }: ParaLook): number[] {
  const out = [...tabs].sort((a, b) => a - b);
  const last = out[out.length - 1] ?? 0;
  for (let at = (Math.floor(last / tabStep + 1e-6) + 1) * tabStep; out.length < 24; at += tabStep) out.push(at);
  return out.map(neat);
}

let ruler: CanvasRenderingContext2D | null = null;
/** About how wide the longest line is, when nothing makes it wrap. */
function widthOf(blocks: FlowPara[]): number {
  ruler ??= document.createElement("canvas").getContext("2d");
  let widest = 0;
  for (const block of blocks) {
    let width = (block.left ?? 0) + (block.first ?? 0);
    for (const run of block.runs) {
      if (run.text === undefined || !ruler) continue;
      const { italic, bold, size = 18, font = "Arial" } = run.style;
      ruler.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px "${font}", Arial, sans-serif`;
      for (const [i, line] of run.text.split("\n").entries()) {
        if (i > 0) {
          widest = Math.max(widest, width);
          width = block.left ?? 0;
        }
        width += ruler.measureText(line).width;
      }
    }
    widest = Math.max(widest, width);
  }
  return widest;
}

// ---------------------------------------------------------------- shapes

type BodyLook = {
  pad: { top: number; right: number; bottom: number; left: number };
  valign: "top" | "middle" | "bottom";
  centered: boolean;
  noWrap: boolean;
  vert: string;
  rot: number;
  fit: Fit;
};

/** Settings of the text's box, from the nearest that has them. */
function bodyLook(chain: (Element | null)[]): BodyLook {
  const get = <T>(read: (el: Element) => T | null): T | null => {
    for (const el of chain) {
      const value = el ? read(el) : null;
      if (value !== null) return value;
    }
    return null;
  };
  const inset = (name: string, normal: number) => neat(pt(get((el) => num(el, name)) ?? normal));
  const anchor = get((el) => attr(el, "anchor"));
  const auto = get((el) => kid(el, "normAutofit") ?? kid(el, "spAutoFit") ?? kid(el, "noAutofit"));
  const shrunk = auto?.localName === "normAutofit";
  return {
    pad: {
      top: inset("tIns", 45720),
      right: inset("rIns", 91440),
      bottom: inset("bIns", 45720),
      left: inset("lIns", 91440),
    },
    valign: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top",
    centered: get((el) => flag(el, "anchorCtr")) ?? false,
    noWrap: get((el) => attr(el, "wrap")) === "none",
    vert: get((el) => attr(el, "vert")) ?? "horz",
    rot: degrees(get((el) => num(el, "rot"))),
    fit: {
      scale: (shrunk ? share(auto, "fontScale") : null) ?? 1,
      cut: (shrunk ? share(auto, "lnSpcReduction") : null) ?? 0,
      ends: get((el) => flag(el, "spcFirstLastPara")) ?? false,
    },
  };
}

const LINES = new Set(["line", "lineInv", "straightConnector1"]);

/** Shapes without an inside, so text in them stands on its own. */
const OPEN =
  /^(line|lineInv|straightConnector1|bentConnector\d|curvedConnector\d|arc|(left|right)(Bracket|Brace)|bracePair|bracketPair)$/;

/** Corners of a connector that goes round corners, or points along one that curves. */
function connectorPoints({ shape, adj = [] }: Geometry, w: number, h: number): { x: number; y: number }[] {
  const at = (i: number) => adj[i] ?? 0.5;
  const pairs = (...values: number[]) =>
    Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
  const a = w * at(0);
  const kind = Number(shape.slice(-1));
  const b = h * at(1);
  const c = w * at(2);
  if (shape.startsWith("bent")) {
    if (kind === 2) return pairs(0, 0, w, 0, w, h);
    if (kind === 3) return pairs(0, 0, a, 0, a, h, w, h);
    if (kind === 4) return pairs(0, 0, a, 0, a, b, w, b, w, h);
    return pairs(0, 0, a, 0, a, b, c, b, c, h, w, h);
  }
  const curves: number[][] = [];
  if (kind === 2) curves.push([0, 0, w / 2, 0, w, h / 2, w, h]);
  else if (kind === 3)
    curves.push([0, 0, a / 2, 0, a, h / 4, a, h / 2], [a, h / 2, a, (h * 3) / 4, (w + a) / 2, h, w, h]);
  else {
    const end = kind === 4 ? w : c;
    const mid = (a + end) / 2;
    curves.push(
      [0, 0, a / 2, 0, a, b / 4, a, b / 2],
      [a, b / 2, a, (b * 3) / 4, (a + mid) / 2, b, mid, b],
      [mid, b, (mid + end) / 2, b, end, (h + b) / 2, end, kind === 4 ? h : (h + b) / 2],
    );
    if (kind === 5) curves.push([end, (h + b) / 2, end, h, (end + w) / 2, h, w, h]);
  }
  const out = [{ x: 0, y: 0 }];
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of curves) {
    for (let i = 1; i <= 6; i += 1) {
      const t = i / 6;
      const u = 1 - t;
      const mix = (p0: number, p1: number, p2: number, p3: number) =>
        u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
      out.push({ x: mix(x0, x1, x2, x3), y: mix(y0, y1, y2, y3) });
    }
  }
  return out;
}

/** Lines are unturned boxes with a corner to start from. */
function pushLines(ctx: Ctx, box: Box, points: { x: number; y: number }[], stroke: Stroke) {
  if (!stroke.color) return;
  const { a } = stroke.color;
  const line = toLine({ ...stroke, color: { ...stroke.color, a: 1 } }, ctx.paper);
  if (!line || a < 0.01) return;
  const spots = points.map(({ x, y }) => pointOf(box, x, y));
  for (let i = 1; i < spots.length; i += 1) {
    const p = spots[i - 1];
    const q = spots[i];
    if (spots.length > 2 && Math.hypot(q.x - p.x, q.y - p.y) < 0.05) continue;
    ctx.items.push({
      kind: "shape",
      x: neat(Math.min(p.x, q.x)),
      y: neat(Math.min(p.y, q.y)),
      w: neat(Math.abs(q.x - p.x)),
      h: neat(Math.abs(q.y - p.y)),
      shape: "line",
      stroke: line,
      ...(q.x < p.x - 0.001 ? { flipX: true } : {}),
      ...(q.y < p.y - 0.001 ? { flipY: true } : {}),
      ...(a < 0.99 ? { opacity: neat(a) } : {}),
      ...(i === 1 && stroke.start && stroke.start !== "none" ? { start: stroke.start } : {}),
      ...(i === spots.length - 1 && stroke.end && stroke.end !== "none" ? { end: stroke.end } : {}),
    });
  }
}

/** A shape on its own. Its fill and its line may let a different share of what is behind through. */
function pushShape(ctx: Ctx, box: Box, geom: Geometry, fill: Rgba | null, stroke: Stroke) {
  const line = toLine(stroke, fill ? over(fill, ctx.paper) : ctx.paper);
  const shows = fill && fill.a >= 0.01;
  if (!shows && !line) return;
  const base = {
    kind: "shape" as const,
    ...spot(box),
    ...turnOf(box),
    shape: geom.shape,
    ...(geom.adj ? { adj: geom.adj } : {}),
  };
  if (!shows) ctx.items.push({ ...base, stroke: line });
  else if (fill.a > 0.99) ctx.items.push({ ...base, fill: toHex(fill), ...(line ? { stroke: line } : {}) });
  else {
    ctx.items.push({ ...base, fill: toHex(fill), opacity: neat(fill.a) });
    if (line) ctx.items.push({ ...base, stroke: line });
  }
}

type Words = { body: Body; look: BodyLook };

/** The words of a shape, with the shape behind them when one is given. */
function pushText(
  ctx: Ctx,
  at: Box,
  { body, look }: Words,
  back?: { geom: Geometry; fill: Rgba | null; line?: FlowLine },
) {
  let box = at;
  // Turning a shape upside down turns its words on their head instead of mirroring them.
  if (box.flipY) box = { ...box, angle: box.angle + 180, flipX: !box.flipX, flipY: false };
  let pad = look.pad;
  const side =
    look.vert === "vert" || look.vert === "eaVert" || look.vert === "mongolianVert"
      ? 90
      : look.vert === "vert270"
        ? -90
        : 0;
  if (side !== 0) {
    const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    box = {
      ...box,
      x: mid.x - box.h / 2,
      y: mid.y - box.w / 2,
      w: box.h,
      h: box.w,
      angle: box.angle + side,
      flipX: false,
    };
    pad =
      side > 0
        ? { left: pad.top, top: pad.right, right: pad.bottom, bottom: pad.left }
        : { left: pad.bottom, top: pad.left, right: pad.top, bottom: pad.right };
  }
  if (look.centered && body.blocks.every((block) => (block.align ?? "left") === "left")) {
    const room = box.w - pad.left - pad.right - widthOf(body.blocks);
    if (room > 1) pad = { ...pad, left: neat(pad.left + room / 2) };
  }
  let { blocks } = body;
  if (look.vert.startsWith("wordArtVert")) blocks = blocks.map(stacked);
  const item: FixedText = {
    kind: "text",
    ...spot(box),
    ...turnOf({ ...box, flipX: back ? box.flipX : false, angle: box.angle + look.rot }),
    blocks,
    pad,
    ...(look.valign !== "top" ? { valign: look.valign } : {}),
    ...(look.noWrap ? { noWrap: true } : {}),
  };
  if (back) {
    if (back.geom.shape !== "rect") item.shape = back.geom.shape;
    if (back.geom.adj) item.adj = back.geom.adj;
    if (back.fill) item.fill = toHex(back.fill);
    if (back.line) item.stroke = back.line;
  }
  ctx.items.push(item);
}

/** One letter under the other. */
function stacked(block: FlowPara): FlowPara {
  const runs = block.runs.map((run, i): FlowRun => {
    if (run.text === undefined) return run;
    const letters = Array.from(run.text).join("\n");
    return { text: i > 0 ? `\n${letters}` : letters, style: run.style };
  });
  return { ...block, runs, align: "center" };
}

async function drawShape(sp: Element, group: Group | null, ctx: Ctx) {
  const { deck, look } = ctx;
  const nv = kids(sp).find((child) => child.localName.startsWith("nv"));
  const props = kid(nv, "cNvPr");
  if (flag(props, "hidden")) return;
  const ph = placeholder(sp);
  if (ph && !ctx.own) return;
  const parents = ph ? ctx.parents(ph) : [];
  const chain = [sp, ...parents];
  const xfrm = chain.map((el) => inside(el, "spPr", "xfrm")).find((el) => el !== null);
  if (!xfrm) return;
  const box = place(readBox(xfrm), group);
  const geom = chain.map((el) => geometryOf(kid(el, "spPr"))).find((one) => one !== null) ?? { shape: "rect" };

  let paint: Paint | null = null;
  for (const el of chain)
    paint ??= paintOf(kid(el, "spPr"), look, ctx.fill) ?? paintRef(inside(el, "style", "fillRef"), look);
  const stroke: Stroke = {};
  for (const el of [...chain].reverse())
    Object.assign(stroke, strokeRef(inside(el, "style", "lnRef"), look), strokeOf(inside(el, "spPr", "ln"), look));

  if (sp.localName === "pic") {
    const image = await pictureOf(deck, look, kid(sp, "blipFill") ?? sp, box);
    if (image) await pushPicture(ctx, image, box, geom, stroke);
    return;
  }
  if (LINES.has(geom.shape)) {
    const up = geom.shape === "lineInv";
    pushLines(
      ctx,
      box,
      [
        { x: 0, y: up ? box.h : 0 },
        { x: box.w, y: up ? 0 : box.h },
      ],
      stroke,
    );
  } else if (/^(bent|curved)Connector/.test(geom.shape))
    pushLines(ctx, box, connectorPoints(geom, box.w, box.h), stroke);

  const txBody = kid(sp, "txBody");
  const frame = bodyLook(chain.map((el) => inside(el, "txBody", "bodyPr")));
  const fill = paint?.kind === "color" ? paint.color : null;
  const behind = fill ? over(fill, ctx.paper) : ctx.paper;
  const layers: Layer[] = [{ list: ph ? textStyle(ctx.master, ph) : deck.plain }];
  for (const el of [...chain].reverse()) {
    layers.push({ run: fontAsked(inside(el, "style", "fontRef"), look) });
    if (el !== sp) layers.push({ list: inside(el, "txBody", "lstStyle") });
  }
  const click = linkOf(kid(props, "hlinkClick"), ctx);
  const body = readBody(txBody, layers, { ...ctx, paper: behind }, frame.fit, click);
  const words = body.shows ? { body, look: frame } : null;

  if (OPEN.test(geom.shape)) {
    if (!LINES.has(geom.shape) && !/Connector\d$/.test(geom.shape)) pushShape(ctx, box, geom, fill, stroke);
    if (words) pushText(ctx, box, words);
    return;
  }

  let shape = geom;
  let frameBox = box;
  if (geom.custom) {
    const list = outlines(geom.custom, box.w, box.h);
    const plain = plainShape(list, box.w, box.h);
    const filled = paint?.kind === "picture" || (fill !== null && fill.a >= 0.01);
    const strokes = plain === "line" || (plain === null && !filled) ? straight(list) : null;
    if (strokes) {
      for (const points of strokes) pushLines(ctx, box, points, stroke);
      if (words) pushText(ctx, textArea(geom.custom, box), words);
      return;
    }
    if (paint?.kind !== "picture" && plain !== "rect" && box.w + box.h > 1) {
      // Only the words stay as they are; nothing else can be an editor shape.
      const shows = filled || (stroke.color && stroke.color.a >= 0.01);
      const make = () => drawn(list, box, fill, stroke);
      const image = !shows ? null : await (ctx.own ? make() : once(deck, look, sp, make));
      if (image) ctx.items.push(image);
      if (words) pushText(ctx, textArea(geom.custom, box), words);
      return;
    }
    shape = { shape: "rect", custom: plain === "rect" ? undefined : geom.custom };
    frameBox = plain === "rect" ? box : textArea(geom.custom, box);
  }
  if (paint?.kind === "picture") {
    const image = await pictureOf(deck, paint.look, paint.el, box);
    if (image) await pushPicture(ctx, image, box, shape, stroke);
    if (words) pushText(ctx, frameBox, words);
    return;
  }

  const apart = wordsApart(sp, box, shape, group);
  const side = frame.vert !== "horz" && !frame.vert.startsWith("wordArtVert");
  const split =
    apart !== null || frame.rot !== 0 || (side && shape.shape !== "rect") || (fill !== null && fill.a < 0.99);
  if (!words || split) pushShape(ctx, box, shape, fill, stroke);
  if (!words) return;
  if (split) pushText(ctx, apart ?? box, words);
  else {
    const back = { geom: shape, fill, line: toLine(stroke, behind) };
    const bare = !back.fill && !back.line;
    pushText(ctx, box, words, bare ? undefined : back);
  }
}

/** Diagrams keep the place of a shape's words apart. Null when it is where it would be anyway. */
function wordsApart(sp: Element, box: Box, { shape, adj }: Geometry, group: Group | null): Box | null {
  const xfrm = kid(sp, "txXfrm");
  if (!xfrm) return null;
  const own = readBox(xfrm);
  // It is turned back from the turn of its shape.
  const at = place({ ...own, angle: 0 }, group);
  const angle = turned(box.angle + own.angle);
  const round = shape === "roundRect" ? Math.min(box.w, box.h) * (adj?.[0] ?? 0.16667) * 0.29289 : 0;
  const x = shape === "ellipse" ? box.w * 0.14645 : round;
  const y = shape === "ellipse" ? box.h * 0.14645 : round;
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  const usual =
    near(at.x, box.x + x) && near(at.y, box.y + y) && near(at.w, box.w - 2 * x) && near(at.h, box.h - 2 * y);
  return usual && own.angle === 0 ? null : { ...at, angle, flipX: false, flipY: false };
}

/** The font and colour a shape's style asks for. */
function fontAsked(ref: Element | null, look: Look): Partial<RunLook> {
  const out: Partial<RunLook> = {};
  const color = colorIn(ref, look);
  if (color) out.color = color;
  if (attr(ref, "idx") === "major") out.latin = "+mj-lt";
  return out;
}

/** The room for words inside a hand-drawn outline. */
function textArea(custom: Element, box: Box): Box {
  const rect = kid(custom, "rect");
  if (!rect) return box;
  const value = guides(custom, box.w * EMU, box.h * EMU);
  const [l, t, r, b] = ["l", "t", "r", "b"].map((name) => pt(value(attr(rect, name) ?? name)));
  if (r - l < 1 || b - t < 1) return box;
  const mid = pointOf(box, (l + r) / 2, (t + b) / 2);
  return { ...box, x: mid.x - (r - l) / 2, y: mid.y - (b - t) / 2, w: r - l, h: b - t };
}

async function pushPicture(ctx: Ctx, image: FixedImage, box: Box, geom: Geometry, stroke: Stroke) {
  let shown = image;
  const { w, h } = box;
  // The editor's pictures are rectangles, so other outlines are cut out of the picture itself.
  const whole = Math.abs(image.w - w) < 0.1 && Math.abs(image.h - h) < 0.1;
  if (whole && geom.custom) {
    const list = outlines(geom.custom, w, h);
    const path = new Path2D();
    for (const part of list) path.addPath(toPath(part.steps));
    if (plainShape(list, w, h) !== "rect") shown = await masked(image, path);
  } else if (whole && (geom.shape === "ellipse" || geom.shape === "flowChartConnector")) {
    const path = new Path2D();
    path.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    shown = await masked(image, path);
  } else if (whole && /^(round(1|2Same|2Diag)?Rect|flowChartAlternateProcess)$/.test(geom.shape)) {
    const [a = 0.16667, b = 0] = geom.adj ?? [];
    const r = Math.min(w, h) * clamp(a, 0, 0.5);
    const s = Math.min(w, h) * clamp(b, 0, 0.5);
    const corners =
      geom.shape === "round1Rect"
        ? [0, r, 0, 0]
        : geom.shape === "round2SameRect"
          ? [r, r, s, s]
          : geom.shape === "round2DiagRect"
            ? [r, s, r, s]
            : r;
    const path = new Path2D();
    path.roundRect(0, 0, w, h, corners);
    shown = await masked(image, path);
  }
  ctx.items.push(shown);
  if (stroke.color) pushShape(ctx, box, geom.custom ? { shape: "rect" } : geom, null, stroke);
}

/** The master's own list of looks for a placeholder. */
function textStyle(master: Master | null, ph: Ph): Element | null {
  const kind = phKind(ph.type);
  const name = kind === "title" ? "titleStyle" : kind === "body" ? "bodyStyle" : "otherStyle";
  return inside(master?.part.root, "txStyles", name);
}

// ---------------------------------------------------------------- tables

type Side = "left" | "right" | "top" | "bottom" | "insideH" | "insideV";

/** What a table style says about one part of a table. An edge of color null is no line. */
type StylePart = { run: Partial<RunLook>; fill: Paint | null; edges: Partial<Record<Side, Stroke>> };
type TableStyle = { back: Rgba | null; parts: Record<string, StylePart> };

/** Parts of a table, each stronger than the ones before it. */
const PARTS = [
  "wholeTbl",
  "band1H",
  "band2H",
  "band1V",
  "band2V",
  "lastCol",
  "firstCol",
  "lastRow",
  "firstRow",
  "seCell",
  "swCell",
  "neCell",
  "nwCell",
];

/**
 * The styles built into PowerPoint, which decks name but seldom bring along, in the colour they
 * come in: "$". After a colour: a share of it, see-through (a), lightened (t) or darkened (s).
 * Lines: the sides, then their width in points (with # that of one of the theme's lines).
 */
const FAMILIES: Record<string, string> = {
  grid: "wholeTbl tx1 LRTBHV=1:tx1",
  themed1:
    "tblBg 2|wholeTbl dk1 LRTBHV=#1:$|band1H fill=$/40a|band1V fill=$/40a TB=#1:$|lastCol b L=#2:$ RTBH=#1:$ V=0|" +
    "firstCol b R=#2:$ LTBH=#1:$ V=0|lastRow b LR=#1:$ TB=#2:$ HV=0 fill=0|firstRow b lt1 fill=$ LRT=#1:$ B=#2:lt1 HV=0",
  themed2:
    "tblBg 3|wholeTbl lt1 LRTB=#1:$/50t HV=0|band1H fill=lt1/20a|band1V fill=lt1/20a|lastCol b L=#2:lt1|" +
    "firstCol b R=#2:lt1|lastRow b T=#2:lt1 fill=0|seCell LT=0|swCell RT=0|firstRow b B=#3:lt1 fill=0|neCell B=0",
  light1:
    "wholeTbl tx1 TB=1:$ LRHV=0|band1H fill=$/20a|band1V fill=$/20a|lastCol b|firstCol b|" +
    "lastRow b T=1:$ fill=0|firstRow b B=1:$ fill=0",
  light2:
    "wholeTbl tx1 LRTB=#1:$ HV=0|band1H TB=#1:$|band1V LR=#1:$|band2V LR=#1:$|lastCol b|firstCol b|" +
    "lastRow b T=1.5:$|firstRow b bg1 fill=$",
  light3:
    "wholeTbl tx1 LRTBHV=1:$|band1H fill=$/20a|band1V fill=$/20a|lastCol b|firstCol b|" +
    "lastRow b T=1.5:$ fill=0|firstRow b B=2:$ fill=0",
  medium1:
    "wholeTbl dk1 fill=lt1 LRTBH=1:$ V=0|band1H fill=$/20t|band1V fill=$/20t|lastCol b|firstCol b|" +
    "lastRow b T=1.5:$ fill=lt1|firstRow b lt1 fill=$",
  medium2:
    "wholeTbl dk1 fill=$/20t LRTBHV=1:lt1|band1H fill=$/40t|band1V fill=$/40t|lastCol b lt1 fill=$|" +
    "firstCol b lt1 fill=$|lastRow b lt1 T=3:lt1 fill=$|firstRow b lt1 B=3:lt1 fill=$",
  medium3:
    "wholeTbl dk1 fill=lt1 TB=2:dk1 LRHV=0|band1H fill=dk1/20t|band1V fill=dk1/20t|lastCol b lt1 fill=$|" +
    "firstCol b lt1 fill=$|lastRow b dk1 T=1.5:dk1 fill=lt1|firstRow b lt1 B=2:dk1 fill=$",
  medium4:
    "wholeTbl dk1 fill=$/20t LRTBHV=1:$|band1H fill=$/40t|band1V fill=$/40t|lastCol b|firstCol b|" +
    "lastRow b T=2:$ fill=$/20t|firstRow b fill=$/20t",
  dark1:
    "wholeTbl lt1 fill=$ LRTBHV=0|band1H fill=$/60s|band1V fill=$/60s|lastCol b L=2:lt1 fill=$/60s|" +
    "firstCol b R=2:lt1 fill=$/60s|lastRow b T=2:lt1 fill=$/40s|seCell L=0|swCell R=0|firstRow b B=2:lt1 fill=dk1|" +
    "neCell L=0|nwCell R=0",
  dark1plain:
    "wholeTbl lt1 fill=$/20t LRTBHV=0|band1H fill=$/40t|band1V fill=$/40t|lastCol b L=2:lt1 fill=$/60t|" +
    "firstCol b R=2:lt1 fill=$/60t|lastRow b T=2:lt1 fill=$/60t|seCell L=0|swCell R=0|firstRow b B=2:lt1 fill=dk1|" +
    "neCell L=0|nwCell R=0",
  dark2:
    "wholeTbl dk1 fill=$/20t LRTBHV=0|band1H fill=$/40t|band1V fill=$/40t|lastCol b|firstCol b|" +
    "lastRow b T=1.5:dk1 fill=$/20t|firstRow b lt1 fill=@",
};

/** How their names in the file begin: the plain one, then those of the six accent colours. */
const BUILT_IN: Record<string, string> = {
  grid: "5940675A",
  themed1: "- 3C2FFA5D 284E427A 69C7853C 775DCB02 35758FB7 08FB837D",
  themed2: "- D113A9D2 18603FDC 306799F8 E269D01E 327F97BB 638B1855",
  light1: "9D7B26C5 3B4B98B0 0E3FDE45 C083E6E3 D27102A9 5FD0F851 68D230F3",
  light2: "7E9639D4 69012ECD 72833802 F2DE63D5 17292A2E 5A111915 912C8C85",
  light3: "616DA210 BC89EF96 5DA37D80 8799B23B ED083AE6 BDBED569 E8B1032C",
  medium1: "793D81CF B301B821 9DCAF9ED 1FECB4D8 1E171933 FABFCF23 10A1B5D5",
  medium2: "073A0DAA 5C22544A 21E4AEA4 F5AB1C69 00A15C55 7DF18680 93296810",
  medium3: "8EC20E35 6E25E649 85BE263C EB344D84 EB9631B5 74C1A8A3 2A488322",
  medium4: "D7AC3CCA 69CF1AB2 8A107856 0505E3EF C4B1156A 22838BEF 16D9F66E",
  dark1: "E8034E78 125E5076 37CE84F3 D03447BB E929F9F4 8FD4443E AF606853",
  dark2: "5202B0CA 0660B408 - 91EBBBCC - 46F890A9 -",
};

const SIDES: Record<string, Side> = { L: "left", R: "right", T: "top", B: "bottom", H: "insideH", V: "insideV" };

function builtIn(id: string, look: Look): TableStyle | null {
  for (const [family, ids] of Object.entries(BUILT_IN)) {
    const accent = ids.split(" ").indexOf(id.slice(0, 8));
    if (accent < 0) continue;
    const black = /^(light|grid)/.test(family) ? "tx1" : "dk1";
    const main = accent === 0 ? black : `accent${accent}`;
    const color = (spec: string): Rgba | null => {
      const [name, mod] = spec.split("/");
      // Dark Style 2 comes in pairs of accent colours.
      const slot = name === "$" ? main : name === "@" ? (accent === 0 ? main : `accent${accent + 1}`) : name;
      const base = look.theme.colors[look.map[slot] ?? slot];
      if (!base || !mod) return base ?? null;
      const value = Number.parseFloat(mod) / 100;
      if (mod.endsWith("a")) return { ...base, a: value };
      const light = mod.endsWith("t");
      return each(base, (v) => fromLinear(light ? 1 - (1 - toLinear(v)) * value : toLinear(v) * value));
    };
    const style: TableStyle = { back: null, parts: {} };
    for (const line of FAMILIES[family === "dark1" && accent === 0 ? "dark1plain" : family].split("|")) {
      const [name, ...words] = line.split(" ");
      const part: StylePart = { run: {}, fill: null, edges: {} };
      for (const word of words) {
        const [key, value] = word.split("=");
        if (name === "tblBg") {
          const el = look.theme.fills[Number(word) - 1];
          const paint = el ? paintFrom(el, { ...look, ph: color("$") }) : null;
          style.back = paint?.kind === "color" ? paint.color : color("$");
        } else if (key === "b") part.run.bold = true;
        else if (value === undefined) part.run.color = color(key);
        else if (key === "fill") part.fill = value === "0" ? NONE : inColor(color(value));
        else {
          const [width, hue] = value.split(":");
          const ref = width.startsWith("#") ? strokeOf(look.theme.lines[Number(width.slice(1)) - 1], look).width : null;
          const stroke = hue ? { color: color(hue), width: ref ?? (Number.parseFloat(width) || 1) } : { color: null };
          for (const side of key) part.edges[SIDES[side]] = stroke;
        }
      }
      style.parts[name] = part;
    }
    return style;
  }
  return null;
}

/** A table style a deck brings along. */
function ownStyle(el: Element, look: Look): TableStyle {
  const style: TableStyle = { back: null, parts: {} };
  for (const part of kids(el)) {
    if (part.localName === "tblBg") {
      const paint = paintOf(kid(part, "fill"), look) ?? paintRef(kid(part, "fillRef"), look);
      style.back = paint?.kind === "color" ? paint.color : null;
      continue;
    }
    const tx = kid(part, "tcTxStyle");
    const run: Partial<RunLook> = {};
    const fontRef = kid(tx, "fontRef");
    if (attr(tx, "b")) run.bold = attr(tx, "b") === "on";
    if (attr(tx, "i")) run.italic = attr(tx, "i") === "on";
    if (attr(fontRef, "idx") === "major") run.latin = "+mj-lt";
    const hue = colorIn(tx, look) ?? colorIn(fontRef, look);
    if (hue) run.color = hue;
    const tc = kid(part, "tcStyle");
    const edges: StylePart["edges"] = {};
    for (const edge of kids(kid(tc, "tcBdr"))) {
      const ln = kid(edge, "ln");
      const stroke = { ...strokeRef(kid(edge, "lnRef"), look), ...strokeOf(ln, look) };
      // Two thin lines with a gap between them.
      if (attr(ln, "cmpd") === "dbl" && stroke.width) stroke.width /= 3;
      if (stroke.color !== undefined) edges[edge.localName as Side] = stroke;
    }
    const fill = paintOf(kid(tc, "fill"), look) ?? paintRef(kid(tc, "fillRef"), look);
    style.parts[part.localName] = { run, fill, edges };
  }
  return style;
}

type Pad = { top: number; right: number; bottom: number; left: number };

/** For every side, the padding most cells have. */
function usual(list: Pad[]): Pad {
  const of = (side: keyof Pad) => {
    const seen = new Map<number, number>();
    for (const pad of list) seen.set(pad[side], (seen.get(pad[side]) ?? 0) + 1);
    return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  };
  return { top: of("top"), right: of("right"), bottom: of("bottom"), left: of("left") };
}

/** First and last row, first and last column. */
type Area = [top: number, bottom: number, left: number, right: number];

/** The rows and columns a part of a style covers, when it covers the cell at all. */
function areaOf(part: string, r: number, c: number, R: number, C: number, on: (name: string) => boolean): Area | null {
  const top = on("firstRow");
  const bottom = on("lastRow");
  const left = on("firstCol");
  const right = on("lastCol");
  const bodyRow = !(top && r === 0) && !(bottom && r === R - 1);
  const bodyCol = !(left && c === 0) && !(right && c === C - 1);
  const row = (yes: boolean): Area | null => (yes ? [r, r, 0, C - 1] : null);
  const col = (yes: boolean): Area | null => (yes ? [0, R - 1, c, c] : null);
  const cell = (yes: boolean): Area | null => (yes ? [r, r, c, c] : null);
  switch (part) {
    case "wholeTbl":
      return [0, R - 1, 0, C - 1];
    case "band1H":
    case "band2H":
      return row(on("bandRow") && bodyRow && (r - (top ? 1 : 0)) % 2 === (part === "band1H" ? 0 : 1));
    case "band1V":
    case "band2V":
      return col(on("bandCol") && bodyCol && (c - (left ? 1 : 0)) % 2 === (part === "band1V" ? 0 : 1));
    case "firstCol":
      return col(left && c === 0);
    case "lastCol":
      return col(right && c === C - 1);
    case "firstRow":
      return row(top && r === 0);
    case "lastRow":
      return row(bottom && r === R - 1);
    case "nwCell":
      return cell(top && left && r === 0 && c === 0);
    case "neCell":
      return cell(top && right && r === 0 && c === C - 1);
    case "swCell":
      return cell(bottom && left && r === R - 1 && c === 0);
    case "seCell":
      return cell(bottom && right && r === R - 1 && c === C - 1);
    default:
      return null;
  }
}

/** A line between cells, and how strong the rule is that put it there. */
type Edge = { line: FlowLine | null; rank: number };

const EXPLICIT = 100;

/** The line along a side with several neighbours. Those that have a stronger one draw it themselves. */
function thinnest(edges: readonly (Edge | undefined)[]): FlowLine | null {
  const lines = Array.from(edges, (edge) => edge?.line ?? null);
  return lines.reduce(
    (best, line) => (best && line ? (line.width < best.width ? line : best) : null),
    lines[0] ?? null,
  );
}

/** The colour of what a box lies on. */
async function under(box: Box, { items, paper }: Ctx): Promise<Rgba> {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === "table" || item.angle || (item.opacity ?? 1) < 1) continue;
    const across = item.x <= box.x + 2 && item.x + item.w >= box.x + box.w - 2;
    if (!across || item.y > box.y + 2 || item.y + item.h < box.y + box.h - 2) continue;
    if (item.kind === "image") return (await tone(item).catch(() => null)) ?? paper;
    const fill = (item.shape ?? "rect") === "rect" ? fromHex(item.fill ?? "") : null;
    if (fill) return fill;
  }
  return paper;
}

async function readTable(tbl: Element, box: Box, context: Ctx) {
  // A cell's fill cannot be see-through, so it is mixed with what is behind it.
  const ctx = { ...context, paper: await under(box, context) };
  const { look, deck } = ctx;
  const pr = kid(tbl, "tblPr");
  const plain = (id: string | null | undefined) => (id ?? "").replace(/[{}\s]/g, "").toUpperCase();
  const id = plain(kid(pr, "tableStyleId")?.textContent);
  const kept = deck.tableStyles.find((el) => plain(attr(el, "styleId")) === id);
  // PowerPoint draws its own styles as it knows them, even when an old file says otherwise.
  const style = builtIn(id, look) ?? (kept ? ownStyle(kept, look) : id ? null : builtIn(BUILT_IN.grid, look));
  const own = paintOf(pr, look, ctx.fill);
  const back = own?.kind === "color" ? own.color : (style?.back ?? null);
  const paper = back ? over(back, ctx.paper) : ctx.paper;

  const cols = kids(kid(tbl, "tblGrid"), "gridCol").map((col) => pt(num(col, "w") ?? 0));
  const trs = kids(tbl, "tr");
  const R = trs.length;
  const C = cols.length;
  if (R === 0 || C === 0) return;
  const area = (part: string, r: number, c: number) => areaOf(part, r, c, R, C, (name) => flag(pr, name) ?? false);

  type Found = { tc: Element; tcPr: Element | null; r: number; c: number; tall: number; wide: number };
  const cells: Found[] = [];
  /** The cell that covers each square of the grid. */
  const on: (Found | undefined)[][] = trs.map(() => []);
  trs.forEach((tr, r) => {
    for (const [c, tc] of kids(tr, "tc").slice(0, C).entries()) {
      if (flag(tc, "hMerge") || flag(tc, "vMerge")) continue;
      const tall = clamp(num(tc, "rowSpan") ?? 1, 1, R - r);
      const wide = clamp(num(tc, "gridSpan") ?? 1, 1, C - c);
      const cell = { tc, tcPr: kid(tc, "tcPr"), r, c, tall, wide };
      cells.push(cell);
      for (let i = r; i < r + tall; i += 1) for (let k = c; k < c + wide; k += 1) on[i][k] ??= cell;
    }
  });

  // Neighbours share the line between them, so lines are gathered by place, not by cell.
  const upright: (Edge | undefined)[][] = trs.map(() => []);
  const level: (Edge | undefined)[][] = [...trs.map(() => []), []];
  const put = (list: (Edge | undefined)[][], r: number, c: number, stroke: Stroke | undefined, rank: number) => {
    if (!stroke || stroke.color === undefined) return;
    const line = toLine(stroke, paper) ?? null;
    const now = list[r][c];
    const wider = (line?.width ?? 0) > (now?.line?.width ?? 0);
    if (!now || rank > now.rank || (rank === now.rank && wider)) list[r][c] = { line, rank };
  };
  for (const { r, c, tall, wide } of cells) {
    const edge = (side: Side, stroke: Stroke | undefined, rank: number) => {
      if (side === "left") for (let i = r; i < r + tall; i += 1) put(upright, i, c, stroke, rank);
      if (side === "right") for (let i = r; i < r + tall; i += 1) put(upright, i, c + wide, stroke, rank);
      if (side === "top") for (let i = c; i < c + wide; i += 1) put(level, r, i, stroke, rank);
      if (side === "bottom") for (let i = c; i < c + wide; i += 1) put(level, r + tall, i, stroke, rank);
    };
    PARTS.forEach((name, rank) => {
      const part = style?.parts[name];
      const at = part && area(name, r, c);
      if (!part || !at) return;
      const [top, bottom, left, right] = at;
      edge("left", c === left ? part.edges.left : part.edges.insideV, rank);
      edge("right", c + wide > right ? part.edges.right : part.edges.insideV, rank);
      edge("top", r === top ? part.edges.top : part.edges.insideH, rank);
      edge("bottom", r + tall > bottom ? part.edges.bottom : part.edges.insideH, rank);
    });
  }
  // A cell's own lines: PowerPoint asks the cell above or to the left, and the other one only at the edge of
  // the table and along the rest of a cell that spans.
  const ownLine = (cell: Found | undefined, side: string): Stroke | undefined => {
    const ln = kid(cell?.tcPr, side);
    return ln ? { width: 1, ...strokeOf(ln, look) } : undefined;
  };
  for (let r = 0; r <= R; r += 1) {
    for (let c = 0; c <= C; c += 1) {
      const here = on[r]?.[c];
      const before = on[r]?.[c - 1];
      const above = on[r - 1]?.[c];
      if (r < R && here !== before) {
        const asked = before && (before.r === r || !here) ? ownLine(before, "lnR") : ownLine(here, "lnL");
        put(upright, r, c, asked, EXPLICIT);
      }
      if (c < C && here !== above) {
        const asked = above && (above.c === c || !here) ? ownLine(above, "lnB") : ownLine(here, "lnT");
        put(level, r, c, asked, EXPLICIT);
      }
    }
  }

  const inset = (tcPr: Element | null): Pad => {
    const at = (name: string, normal: number) => neat(pt(num(tcPr, name) ?? normal));
    return { top: at("marT", 45720), right: at("marR", 91440), bottom: at("marB", 45720), left: at("marL", 91440) };
  };
  const pad = usual(cells.map(({ tcPr }) => inset(tcPr)));
  const base = inside(ctx.master?.part.root, "txStyles", "otherStyle") ?? deck.plain;

  const rows: FlowRow[] = trs.map((tr) => ({ cells: [], h: neat(pt(num(tr, "h") ?? 0)) }));
  for (const { tc, tcPr, r, c, tall, wide } of cells) {
    const run: Partial<RunLook> = {};
    let paint: Paint | null = null;
    for (const name of PARTS) {
      const part = style?.parts[name];
      if (!part || !area(name, r, c)) continue;
      Object.assign(run, part.run);
      paint = part.fill ?? paint;
    }
    paint = paintOf(tcPr, look, ctx.fill) ?? paint;
    const fill = paint?.kind === "color" && paint.color.a >= 0.01 ? over(paint.color, paper) : back && paper;
    const fit = { scale: 1, cut: 0, ends: false };
    const { blocks } = readBody(kid(tc, "txBody"), [{ list: base }, { run }], { ...ctx, paper: fill ?? paper }, fit);
    // Tables have one padding for all cells; what a cell has beyond it goes into its paragraphs.
    const ownPad = inset(tcPr);
    const more = (side: keyof Pad) => Math.max(0, neat(ownPad[side] - pad[side]));
    for (const block of blocks) {
      if (more("left")) block.left = neat((block.left ?? 0) + more("left"));
      if (more("right")) block.right = neat((block.right ?? 0) + more("right"));
    }
    const lowest = blocks[blocks.length - 1];
    if (blocks[0] && more("top")) blocks[0].before = neat((blocks[0].before ?? 0) + more("top"));
    if (lowest && more("bottom")) lowest.after = neat((lowest.after ?? 0) + more("bottom"));

    const anchor = attr(tcPr, "anchor");
    rows[r].cells.push({
      blocks,
      ...(wide > 1 ? { colSpan: wide } : {}),
      ...(tall > 1 ? { rowSpan: tall } : {}),
      ...(fill ? { fill: toHex(fill) } : {}),
      ...(anchor === "ctr" ? { valign: "middle" as const } : anchor === "b" ? { valign: "bottom" as const } : {}),
      border: {
        top: thinnest(level[r].slice(c, c + wide)),
        right: thinnest(upright.slice(r, r + tall).map((list) => list[c + wide])),
        bottom: thinnest(level[r + tall].slice(c, c + wide)),
        left: thinnest(upright.slice(r, r + tall).map((list) => list[c])),
      },
    });
  }
  ctx.items.push({
    kind: "table",
    x: neat(box.x),
    y: neat(box.y),
    w: neat(cols.reduce((sum, width) => sum + width, 0)),
    table: { kind: "table", cols: cols.map(neat), rows, border: null, pad },
  });
}

// ---------------------------------------------------------------- the rest of a slide

/** Tables, diagrams and things of other programs. */
async function drawFrame(el: Element, group: Group | null, ctx: Ctx) {
  if (flag(inside(el, "nvGraphicFramePr", "cNvPr"), "hidden")) return;
  const ph = placeholder(el);
  if (ph && !ctx.own) return;
  const parents = ph ? ctx.parents(ph) : [];
  const xfrm = kid(el, "xfrm") ?? parents.map((up) => inside(up, "spPr", "xfrm")).find((one) => one !== null);
  if (!xfrm) return;
  const box = place(readBox(xfrm), group);
  const data = inside(el, "graphic", "graphicData");
  const tbl = kid(data, "tbl");
  if (tbl) {
    await readTable(tbl, box, ctx);
    return;
  }
  const { pkg } = ctx.deck;
  const ole = inside(data, "oleObj", "pic");
  if (ole) {
    const image = await pictureOf(ctx.deck, ctx.look, kid(ole, "blipFill") ?? ole, box);
    if (image) ctx.items.push(image);
    return;
  }
  const ids = kid(data, "relIds");
  if (!ids) return;
  // The diagram's data names the drawing PowerPoint made of it.
  const rel = pkg.rel(ids, "dm");
  const model = rel ? await pkg.part(rel.target) : null;
  const ext = kids(kid(model?.root, "extLst"), "ext").map((one) => kid(one, "dataModelExt"))[0] ?? null;
  const rels = pkg.owner(ids)?.rels ?? new Map<string, Rel>();
  const named = rels.get(attr(ext, "relId") ?? "");
  const drawing = named ?? [...rels.values()].find((one) => one.type === "diagramDrawing");
  const part = drawing ? await pkg.part(drawing.target) : null;
  const inner = { x: 0, y: 0, w: box.w, h: box.h };
  await drawTree(kid(part?.root, "spTree"), { box, inner, up: null }, ctx);
}

async function drawTree(tree: Element | null, group: Group | null, ctx: Ctx) {
  for (const el of kids(tree)) {
    try {
      if (el.localName === "sp" || el.localName === "pic" || el.localName === "cxnSp") await drawShape(el, group, ctx);
      else if (el.localName === "graphicFrame") await drawFrame(el, group, ctx);
      else if (el.localName === "grpSp" && !flag(inside(el, "nvGrpSpPr", "cNvPr"), "hidden")) {
        const pr = kid(el, "grpSpPr");
        const xfrm = kid(pr, "xfrm");
        const fill = paintOf(pr, ctx.look, ctx.fill) ?? ctx.fill;
        await drawTree(el, xfrm ? groupOf(xfrm, group) : group, { ...ctx, fill });
      }
    } catch {
      // One odd shape must not cost the whole deck.
    }
  }
}

function groupOf(xfrm: Element, up: Group | null): Group {
  const box = readBox(xfrm);
  const off = kid(xfrm, "chOff");
  const ext = kid(xfrm, "chExt");
  const at = (el: Element | null, name: string, normal: number) => (el ? pt(num(el, name) ?? 0) : normal);
  const inner = { x: at(off, "x", box.x), y: at(off, "y", box.y), w: at(ext, "cx", box.w), h: at(ext, "cy", box.h) };
  return { box, inner, up };
}

/** The paper of a slide: its own, its layout's or its master's. */
async function background(
  parts: (Part | null)[],
  look: Look,
  deck: Deck,
): Promise<{ color: Rgba; image: FixedImage | null }> {
  for (const part of parts) {
    const bg = inside(part?.root, "cSld", "bg");
    if (!bg) continue;
    const pr = kid(bg, "bgPr");
    const paint = pr ? paintOf(pr, look) : paintRef(kid(bg, "bgRef"), look);
    if (paint?.kind === "color") return { color: over(paint.color, WHITE), image: null };
    if (paint?.kind !== "picture") return { color: WHITE, image: null };
    const box = { x: 0, y: 0, w: deck.w, h: deck.h, angle: 0, flipX: false, flipY: false };
    const image = await once(deck, look, bg, () => pictureOf(deck, paint.look, paint.el, box).catch(() => null));
    return { color: (image && (await tone(image).catch(() => null))) ?? WHITE, image };
  }
  return { color: WHITE, image: null };
}

/** What a master draws is the same on all its slides. */
function once(
  deck: Deck,
  look: Look,
  key: Element,
  make: () => Promise<FixedImage | null>,
): Promise<FixedImage | null> {
  let list = deck.art.get(look);
  if (!list) deck.art.set(look, (list = new Map()));
  let job = list.get(key);
  if (!job) list.set(key, (job = make()));
  return job;
}

async function readNotes(deck: Deck, slide: Part): Promise<string> {
  const part = await deck.pkg.related(slide, "notesSlide");
  const body = placeholders(part?.root).find(({ ph }) => ph.type === "body")?.sp;
  const lines = kids(kid(body, "txBody"), "p").map((p) =>
    kids(p)
      .map((el) => (el.localName === "br" ? "\n" : (kid(el, "t")?.textContent ?? "")))
      .join(""),
  );
  return lines.join("\n").replace(/\v/g, "\n").trim();
}

async function readSlide(deck: Deck, slide: Part, number: number, fallback: Part | null): Promise<FixedPage> {
  const { pkg } = deck;
  const layout = await pkg.related(slide, "slideLayout");
  const masterPart = (await pkg.related(layout, "slideMaster")) ?? fallback;
  const master = masterPart ? await masterOf(deck, masterPart) : null;
  let look: Look = master?.look ?? { theme: readTheme(null, null), map: MAP };
  for (const part of [layout, slide]) {
    const changes = await pkg.related(part, "themeOverride");
    if (changes) look = { ...look, theme: readTheme(changes, look.theme) };
    const mapping = inside(part?.root, "clrMapOvr", "overrideClrMapping");
    if (mapping) look = { ...look, map: { ...look.map, ...mapOf(mapping) } };
  }
  const { color, image } = await background([slide, layout, masterPart], look, deck);
  const page: FixedPage = { w: neat(deck.w), h: neat(deck.h), fill: toHex(color), items: [] };
  if (image) page.items.push(image);

  const holders = placeholders(layout?.root);
  const parents = (ph: Ph): Element[] => {
    const near = matching(holders, ph, true);
    const far = matching(master?.holders ?? [], (near && placeholder(near)) ?? ph, false);
    return [near, far].filter((el): el is Element => el !== null);
  };
  const ctx: Ctx = { deck, look, items: page.items, paper: color, number, master, parents, own: false, fill: null };
  const tree = (part: Part | null) => inside(part?.root, "cSld", "spTree");
  if (flag(slide.root, "showMasterSp") !== false) {
    if (flag(layout?.root, "showMasterSp") !== false) await drawTree(tree(masterPart), null, ctx);
    await drawTree(tree(layout), null, ctx);
  }
  await drawTree(tree(slide), null, { ...ctx, own: true });
  const notes = await readNotes(deck, slide).catch(() => "");
  if (notes) page.notes = notes;
  return page;
}

/** Null for the name PowerPoint gives every deck. */
async function readTitle(pkg: Package): Promise<string | null> {
  const part = await pkg.part("docProps/core.xml").catch(() => null);
  const title = kid(part?.root, "title")?.textContent?.trim() ?? "";
  return title === "" || /^(powerpoint )?presentation$/i.test(title) ? null : title;
}

export async function readPptx(bytes: Uint8Array): Promise<FixedDoc> {
  const pkg = await open(bytes);
  const main = await pkg.main();
  if (main?.root.localName !== "presentation") throw new ConvertError("This file is not a PowerPoint presentation.");
  const size = kid(main.root, "sldSz");
  const styles = await pkg.related(main, "tableStyles");
  const deck: Deck = {
    pkg,
    w: pt(num(size, "cx") ?? 9144000),
    h: pt(num(size, "cy") ?? 6858000),
    plain: kid(main.root, "defaultTextStyle"),
    tableStyles: kids(styles?.root, "tblStyle"),
    masters: new Map(),
    art: new Map(),
    recolored: new Map(),
  };
  const fallback = await pkg.related(main, "slideMaster");
  const first = num(main.root, "firstSlideNum") ?? 1;
  const slides: { part: Part; number: number; hidden: boolean }[] = [];
  for (const [i, ref] of kids(kid(main.root, "sldIdLst"), "sldId").entries()) {
    const rel = pkg.rel(ref);
    const part = rel ? await pkg.part(rel.target) : null;
    // Hidden slides are left out, but they count.
    if (part) slides.push({ part, number: first + i, hidden: flag(part.root, "show") === false });
  }
  if (slides.length === 0) throw new ConvertError("There are no slides in this presentation.");
  const shown = slides.filter(({ hidden }) => !hidden);
  const doc: FixedDoc = { kind: "fixed", pages: [] };
  for (const { part, number } of shown.length > 0 ? shown : slides)
    doc.pages.push(await readSlide(deck, part, number, fallback));
  const title = await readTitle(pkg);
  if (title) doc.title = title;
  return doc;
}
