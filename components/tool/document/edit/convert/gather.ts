import { fontLabel, isBold, isItalic, pdfFont } from "../engine/fonts";
import { apply, bounds, corners, objectBounds, placement, type Box } from "../engine/matrix";
import { inkPath, scaledPath, toSvg } from "../engine/shapes";
import { layTable } from "../engine/table";
import { SOFT, loadBody } from "../engine/text-dom";
import { gridOf, touching, type Unit } from "../engine/vectors";
import {
  allParas,
  isCover,
  isLine,
  marginBox,
  pageBox,
  plainText,
  splitParas,
  type Edge,
  type EditObject,
  type InkObject,
  type Page,
  type Para,
  type PathObject,
  type Run,
  type ShapeObject,
  type Style,
  type TableObject,
  type TextBody,
  type TextObject,
} from "../model";
import { SYMBOLS, blockBox, pictureBox, type EditorStore } from "../store";
import { natural } from "./lay";
import type { SheetCell, SheetOut } from "./xlsx-out";
import type {
  FixedDoc,
  FixedItem,
  FixedPage,
  FlowBlock,
  FlowBox,
  FlowCell,
  FlowDoc,
  FlowImage,
  FlowLine,
  FlowPara,
  FlowRun,
  FlowSection,
  FlowStyle,
  FlowTable,
} from "./flow";

/** The edited document the way other programs keep theirs: text that flows, or things in their places. */

// ---------------------------------------------------------------- words

const familyOf = (id: string): string => {
  if (!id.startsWith("pdf:")) return id;
  const font = pdfFont(id);
  if (!font) return "lib:arimo";
  const bare = fontLabel(id)
    .replace(/\s+(bold|italic|regular|oblique)\b/gi, "")
    .trim();
  return /^(g_|f\d|font|[A-Z]{6}\+)/i.test(bare) ? font.match : bare;
};

function flowStyle(style: Style): FlowStyle {
  return {
    font: familyOf(style.font),
    size: Math.round(style.size * 2) / 2,
    color: style.color,
    bold: isBold(style) || undefined,
    italic: isItalic(style) || undefined,
    underline: (style.underline && !style.link) || undefined,
    strike: style.strike || undefined,
    script: style.script,
    highlight: style.back,
    link: style.link && !style.link.startsWith("#page:") ? style.link : undefined,
    tracking: Math.abs(style.tracking) > 0.35 ? Math.round(style.tracking * 10) / 10 : undefined,
  };
}

/** The library's own font for the largest letters. */
function matchOf(runs: readonly Run[]): string {
  const { style } = runs.reduce((best, run) => (run.style.size > best.style.size ? run : best), runs[0]);
  return style.font.startsWith("pdf:") ? (pdfFont(style.font)?.match ?? "lib:arimo") : style.font;
}

const flowRuns = (runs: readonly Run[]): FlowRun[] =>
  runs.map((run) => ({ text: run.text.split(SOFT).join("\n"), style: flowStyle(run.style) }));

/** Paragraphs of a text. `left`: how far its box is from the margin. */
function flowParas(body: TextBody, left = 0, before = 0): FlowPara[] {
  const groups = splitParas(body.runs);
  const paras = allParas(body);
  return groups.map((runs, i): FlowPara => {
    const para: Para = paras[i] ?? {};
    const size = Math.max(1, ...runs.map((run) => run.style.size));
    const leading = para.leading ?? body.leading;
    const own = (para.left ?? 0) + left;
    return {
      kind: "para",
      runs: flowRuns(runs),
      align: para.align ?? body.align,
      list: para.list
        ? { type: para.list.type, mark: para.list.mark, level: para.list.level, start: para.list.start }
        : undefined,
      left: own > 1 ? own : undefined,
      right: para.right || undefined,
      first: para.list ? -para.list.gap : para.first || undefined,
      before: (para.before ?? 0) + (i === 0 ? before : 0) || undefined,
      after: para.after || undefined,
      line: { times: Math.max(0.6, Math.round((leading / (size * natural(matchOf(runs)))) * 100) / 100) },
      fill: para.fill,
    };
  });
}

const flowLine = (edge: Edge | null | undefined): FlowLine | null | undefined =>
  edge === undefined
    ? undefined
    : edge === null
      ? null
      : { color: edge.color, width: edge.width, dash: edge.dash === "dashdot" ? "dash" : edge.dash };

export function flowTable(table: TableObject): FlowTable {
  const lay = layTable(table);
  return {
    kind: "table",
    cols: table.cols,
    border: flowLine(table.edge) ?? null,
    pad: { top: table.pad.y, right: table.pad.x, bottom: table.pad.y, left: table.pad.x },
    rows: table.cells.map((row, r) => ({
      h: Math.max(table.rows[r], lay.ys[r + 1] - lay.ys[r] - 4),
      head: r === 0 && table.head ? true : undefined,
      cells: row
        .filter((cell) => !cell.covered)
        .map((cell): FlowCell => {
          const border: FlowCell["border"] = {};
          let any = false;
          for (const side of ["top", "right", "bottom", "left"] as const) {
            const line = flowLine(cell.edges?.[side]);
            if (line === undefined) continue;
            border[side] = line;
            any = true;
          }
          return {
            blocks: flowParas(cell),
            colSpan: cell.cols,
            rowSpan: cell.rows,
            fill: cell.fill ?? undefined,
            valign: cell.valign,
            border: any ? border : undefined,
          };
        }),
    })),
  };
}

// ---------------------------------------------------------------- drawings as pictures

async function drawn(object: InkObject | PathObject): Promise<FlowImage | null> {
  const scale = 4;
  const pad = Math.max(2, object.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.min(4000, Math.ceil((object.w + pad * 2) * scale)));
  canvas.height = Math.max(1, Math.min(4000, Math.ceil((object.h + pad * 2) * scale)));
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.scale(scale, scale);
  c.translate(pad, pad);
  c.globalAlpha = object.opacity;
  const path = new Path2D(toSvg(object.type === "ink" ? inkPath(object) : scaledPath(object)));
  if (object.type === "path" && object.fill) {
    c.fillStyle = object.fill;
    c.fill(path, object.evenOdd ? "evenodd" : "nonzero");
  }
  if (object.stroke && object.width > 0) {
    c.strokeStyle = object.stroke;
    c.lineWidth = object.width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke(path);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const at = apply(placement(object.x, object.y, 0), -pad, -pad);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mime: "image/png",
    w: object.w + pad * 2,
    h: object.h + pad * 2,
    float: { x: at.x, y: at.y, from: "page" },
    angle: object.angle || undefined,
  };
}

// ---------------------------------------------------------------- everything on a page

type Item =
  | { kind: "text"; box: Box; object: TextObject }
  | { kind: "table"; box: Box; table: TableObject }
  | { kind: "image"; box: Box; image: FlowImage; whole: boolean }
  | { kind: "rule"; box: Box; color: string; width: number }
  | { kind: "box"; box: Box; shape: ShapeObject }
  | { kind: "art"; box: Box; image: FlowImage };

/** What can be read of a page, the file's own and what was put on it. */
async function itemsOf(store: EditorStore, page: Page): Promise<Item[]> {
  const out: Item[] = [];
  const view = pageBox(page);
  const seen = (box: Box) =>
    box.x < view.x + view.w && box.y < view.y + view.h && box.x + box.w > view.x && box.y + box.h > view.y;
  const covers = page.objects
    .map((id) => store.doc.objects[id])
    .filter((object): object is ShapeObject => isCover(object));
  const covered = (box: Box) =>
    covers.some((cover) => {
      const c = objectBounds(cover);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h;
    });

  if (page.source !== null) {
    const text = await store.textOf(page.source, page.index).catch(() => null);
    const inTable = new Set<string>();
    const cuts = new Set(page.pathCuts);
    const units = store.unitsOn(page).filter((unit) => !unit.ops.some((op) => cuts.has(op)));
    const done = new Set<Unit>();
    for (const unit of units) {
      if (done.has(unit)) continue;
      const whole = touching(units, unit, page);
      whole.forEach((part) => done.add(part));
      if (whole.length >= 4 && gridOf(whole)) {
        const made = await store.tableFrom(page, whole);
        if (made && (made.table.cells.length > 1 || made.table.cols.length > 1)) {
          made.blocks.forEach((block) => inTable.add(block.key));
          out.push({ kind: "table", box: objectBounds(made.table), table: made.table });
          continue;
        }
      }
      for (const part of whole) {
        const { line } = part;
        if (line && Math.abs(line.y1 - line.y0) < 0.5 && Math.abs(line.x1 - line.x0) > view.w * 0.3)
          out.push({ kind: "rule", box: part.box, color: line.color, width: line.width });
      }
    }
    for (const block of text?.blocks ?? []) {
      if (page.cuts[block.key] || inTable.has(block.key)) continue;
      const box = blockBox(block);
      if (!seen(box) || covered(box)) continue;
      out.push({ kind: "text", box, object: await store.blockObject(block, page) });
    }
    for (const picture of await store.picturesOf(page)) {
      if (page.imageCuts.includes(picture.index)) continue;
      const box = pictureBox(picture);
      if (!seen(box) || covered(box)) continue;
      const asset = await store.pictureAsset(page, picture).catch(() => null);
      if (!asset) continue;
      out.push({
        kind: "image",
        box,
        whole: picture.whole,
        image: {
          bytes: asset.bytes,
          mime: asset.mime,
          w: picture.w,
          h: picture.h,
          crop: picture.crop ?? undefined,
          angle: picture.angle || undefined,
        },
      });
    }
    const { fields } = await store.notesOf(page);
    for (const field of fields) {
      const value = store.doc.values[`${page.source}:${field.name}`] ?? field.value;
      const words = typeof value === "string" ? value : value ? "✓" : "";
      if (words.trim() === "" || (field.kind === "radio" && value !== field.option)) continue;
      const style: Style = {
        ...store.freshStyle(),
        size: field.size || Math.max(7, Math.min(12, field.box.h * 0.6)),
        font: "lib:arimo",
        color: "#000000",
      };
      const object: TextObject = {
        id: "",
        type: "text",
        ...field.box,
        angle: 0,
        opacity: 1,
        runs: [{ text: field.kind === "radio" ? "●" : words, style }],
        align: "left",
        leading: style.size * 1.2,
        wrap: true,
      };
      out.push({ kind: "text", box: field.box, object });
    }
  }

  for (const id of page.objects) {
    const object = store.doc.objects[id] as EditObject | undefined;
    if (!object) continue;
    const box = objectBounds(object);
    if (!seen(box)) continue;
    switch (object.type) {
      case "text":
        if (plainText(object.runs).trim() !== "" && !covered(box)) out.push({ kind: "text", box, object });
        break;
      case "table":
        out.push({ kind: "table", box, table: object });
        break;
      case "image": {
        const asset = store.assets.get(object.asset);
        if (asset && !covered(box))
          out.push({
            kind: "image",
            box,
            whole: false,
            image: {
              bytes: asset.bytes,
              mime: asset.mime,
              w: object.w,
              h: object.h,
              crop: object.crop,
              angle: object.angle || undefined,
            },
          });
        break;
      }
      case "shape":
        if (isCover(object)) break;
        if (isLine(object) && object.h < 0.5 && object.w > view.w * 0.3 && object.angle === 0)
          out.push({ kind: "rule", box, color: object.stroke ?? "#000000", width: object.width });
        else out.push({ kind: "box", box, shape: object });
        break;
      case "ink":
      case "path": {
        const image = await drawn(object);
        if (image) out.push({ kind: "art", box, image });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Reading order: down the page, column after column where there are any. */
function inOrder<T extends { box: Box }>(items: readonly T[], depth = 0): T[] {
  if (items.length < 2 || depth > 40) return [...items];
  const gaps = (from: (box: Box) => number, to: (box: Box) => number) => {
    const list = [...items].sort((a, b) => from(a.box) - from(b.box));
    const out: { at: number; size: number; count: number }[] = [];
    let end = to(list[0].box);
    list.forEach((item, i) => {
      if (i === 0) return;
      const start = from(item.box);
      if (start > end) out.push({ at: (start + end) / 2, size: start - end, count: i });
      end = Math.max(end, to(item.box));
    });
    return out;
  };
  const split = (inFirst: (item: T) => boolean) => {
    const a = items.filter(inFirst);
    const b = items.filter((item) => !inFirst(item));
    return [...inOrder(a, depth + 1), ...inOrder(b, depth + 1)];
  };
  const height = (list: readonly T[]) =>
    Math.max(...list.map((item) => item.box.y + item.box.h)) - Math.min(...list.map((item) => item.box.y));
  const whole = height(items);
  const columns = gaps(
    (box) => box.x,
    (box) => box.x + box.w,
  ).filter(({ size }) => size >= 9);
  for (const gap of columns.sort((a, b) => b.size - a.size)) {
    const a = items.filter((item) => item.box.x + item.box.w / 2 < gap.at);
    const b = items.filter((item) => item.box.x + item.box.w / 2 >= gap.at);
    // Columns run side by side for a good part of the way, and hold more than a label each.
    if (a.length >= 2 && b.length >= 2 && Math.min(height(a), height(b)) > Math.max(60, whole * 0.4))
      return split((item) => item.box.x + item.box.w / 2 < gap.at);
  }
  const rows = gaps(
    (box) => box.y,
    (box) => box.y + box.h,
  );
  if (rows.length > 0) {
    const best = rows.reduce((top, gap) => (gap.size > top.size ? gap : top));
    return split((item) => item.box.y + item.box.h / 2 < best.at);
  }
  return [...items].sort((a, b) => (Math.abs(a.box.y - b.box.y) > 4 ? a.box.y - b.box.y : a.box.x - b.box.x));
}

function boxFlow(shape: ShapeObject, page: Page): FlowBox {
  const view = pageBox(page);
  const symbol = SYMBOLS.has(shape.kind)
    ? { check: "✓", cross: "✗", dot: "●" }[shape.kind as "check" | "cross" | "dot"]
    : null;
  const blocks: FlowPara[] = symbol
    ? [
        {
          kind: "para",
          runs: [{ text: symbol, style: { size: Math.max(6, shape.h), color: shape.stroke ?? "#000000" } }],
          align: "center",
        },
      ]
    : shape.text && plainText(shape.text.runs) !== ""
      ? flowParas(shape.text)
      : [];
  return {
    kind: "box",
    x: shape.x - view.x,
    y: shape.y - view.y,
    from: "page",
    w: shape.w,
    h: shape.h,
    shape: symbol ? "rect" : isLine(shape) ? "line" : shape.kind,
    blocks,
    fill: symbol ? undefined : (shape.fill ?? undefined),
    stroke:
      symbol || !shape.stroke || shape.width <= 0
        ? undefined
        : { color: shape.stroke, width: shape.width, dash: shape.dash === "dashdot" ? "dash" : shape.dash },
    valign: shape.text?.valign,
  };
}

type Edges = { head: Item[]; foot: Item[] };

/** Words in the margins: what runs along the head or the foot of the pages. */
function edgesOf(items: readonly Item[], inner: Box): Edges {
  const texts = items.filter((item) => item.kind === "text" && item.object.angle === 0);
  return {
    head: texts.filter((item) => item.box.y + item.box.h <= inner.y + 2),
    foot: texts.filter((item) => item.box.y >= inner.y + inner.h - 2),
  };
}

/** The same on every page, page numbers aside. `number`: what this page is counted as. */
const pattern = (items: readonly Item[], number: number) =>
  items
    .map((item) => (item.kind === "text" ? plainText(item.object.runs).trim() : ""))
    .map((text) => text.replace(new RegExp(`(^|[^0-9])${number}(?![0-9])`), "$1{page}"))
    .sort()
    .join("|");

const merged = (a: FlowPara, b: FlowPara): FlowPara => {
  const last = a.runs[a.runs.length - 1];
  const glue =
    last?.text !== undefined && !/[\s-]$/.test(last.text) ? [{ text: " ", style: last.style ?? {} } as FlowRun] : [];
  return { ...a, runs: [...a.runs, ...glue, ...b.runs], after: b.after };
};

export async function gatherFlow(
  store: EditorStore,
  pages: readonly Page[],
  onProgress?: (done: number, total: number) => void,
): Promise<FlowDoc> {
  const sections: FlowSection[] = [];
  const { decor } = store.doc;
  let key = "";
  const all: Item[][] = [];
  for (const page of pages) all.push(await itemsOf(store, page));
  // What runs along the margins of all the pages becomes a header or footer of the document.
  const running: Record<"head" | "foot", boolean> = { head: false, foot: false };
  for (const side of ["head", "foot"] as const) {
    if (decor?.[side === "head" ? "header" : "footer"]) continue;
    const seen = pages.map((page, i) =>
      page.margin ? pattern(edgesOf(all[i], marginBox(page))[side], store.doc.pages.indexOf(page) + 1) : "",
    );
    const given = seen.filter((text) => text !== "");
    running[side] = given.length > 0 && given.length >= pages.length * 0.5 && new Set(given).size === 1;
  }
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const view = pageBox(page);
    let items = all[i];
    for (const item of items) {
      if (item.kind === "text") await loadBody(item.object);
      else if (item.kind === "table")
        for (const row of item.table.cells) for (const cell of row) if (!cell.covered) await loadBody(cell);
    }
    const inner = page.margin
      ? marginBox(page)
      : (() => {
          // Without margins the text's own edges count.
          const texts = items.filter((item) => item.kind === "text" || item.kind === "table").map((item) => item.box);
          if (texts.length === 0) return { x: view.x + 36, y: view.y + 36, w: view.w - 72, h: view.h - 72 };
          const x = Math.max(view.x + 18, Math.min(...texts.map((box) => box.x)));
          const y = Math.max(view.y + 18, Math.min(...texts.map((box) => box.y)));
          const right = Math.min(view.x + view.w - 18, Math.max(...texts.map((box) => box.x + box.w)));
          return {
            x,
            y,
            w: Math.max(60, Math.max(right, view.x + view.w - (x - view.x)) - x),
            h: Math.max(60, view.y + view.h - 36 - y),
          };
        })();
    const margin = {
      top: Math.max(0, inner.y - view.y),
      left: Math.max(0, inner.x - view.x),
      right: Math.max(0, view.x + view.w - inner.x - inner.w),
      bottom: Math.max(0, view.y + view.h - inner.y - inner.h),
    };
    const own = [view.w, view.h, margin.top, margin.left, margin.right].map((value) => Math.round(value / 6)).join();
    const started = own === key && sections.length > 0;
    if (!started) {
      key = own;
      const style = decor ? flowStyle(decor.bandStyle) : undefined;
      const band = (words: { left: string; center: string; right: string } | undefined): FlowBlock[] | undefined =>
        words && (words.left || words.center || words.right)
          ? [
              {
                kind: "para",
                align: words.left || words.right ? "left" : "center",
                runs: [
                  {
                    text: words.left || words.right ? `${words.left}\t${words.center}\t${words.right}` : words.center,
                    style: style ?? {},
                  },
                ],
                tabs: [view.w / 2 - margin.left, view.w - margin.left - margin.right],
              },
            ]
          : undefined;
      sections.push({
        w: view.w,
        h: view.h,
        margin,
        blocks: [],
        header: band(decor?.header),
        footer: band(decor?.footer),
        headerAt: decor?.bandAt,
        footerAt: decor?.bandAt,
      });
    }
    if (running.head || running.foot) {
      const edges = edgesOf(items, inner);
      const number = store.doc.pages.indexOf(page) + 1;
      const section = sections[sections.length - 1];
      const blocksOf = (list: readonly Item[]): FlowBlock[] =>
        inOrder(list).flatMap((item): FlowBlock[] => {
          if (item.kind !== "text") return [];
          const middle = item.box.x + item.box.w / 2 - (view.x + view.w / 2);
          const align = Math.abs(middle) < 8 ? "center" : middle > 0 ? "right" : "left";
          const token = new RegExp(`(^|[^0-9])${number}(?![0-9])`);
          let done = false;
          return flowParas(item.object).map((para) => ({
            ...para,
            align,
            left: undefined,
            runs: para.runs.map((run) => {
              if (done || run.text === undefined || !token.test(run.text)) return run;
              done = true;
              return { ...run, text: run.text.replace(token, "$1{page}") };
            }),
          }));
        });
      if (running.head && edges.head.length > 0) {
        section.header ??= blocksOf(edges.head);
        section.headerAt ??= Math.max(8, Math.min(...edges.head.map((item) => item.box.y)) - view.y);
      }
      if (running.foot && edges.foot.length > 0) {
        section.footer ??= blocksOf(edges.foot);
        section.footerAt ??= Math.max(
          8,
          view.y + view.h - Math.max(...edges.foot.map((item) => item.box.y + item.box.h)),
        );
      }
      const gone = new Set<Item>([...(running.head ? edges.head : []), ...(running.foot ? edges.foot : [])]);
      items = items.filter((item) => !gone.has(item));
    }
    const { blocks } = sections[sections.length - 1];
    const before = blocks.length;
    const flowing = items.filter(
      (item) =>
        item.kind === "text" || item.kind === "table" || item.kind === "rule" || (item.kind === "image" && !item.whole),
    );
    const standing = items.filter((item) => !flowing.includes(item));
    for (const item of standing) {
      if (item.kind === "image") {
        const k = Math.min(1, inner.w / item.image.w, inner.h / item.image.h);
        blocks.push({
          kind: "para",
          runs: [{ image: { ...item.image, w: item.image.w * k, h: item.image.h * k } }],
          align: "center",
        });
      } else if (item.kind === "art") {
        const float = item.image.float
          ? { ...item.image.float, x: item.image.float.x - view.x, y: item.image.float.y - view.y }
          : undefined;
        blocks.push({ kind: "para", runs: [{ image: { ...item.image, float } }] });
      } else if (item.kind === "box") blocks.push(boxFlow(item.shape, page));
    }
    let last: Box | null = null;
    for (const item of inOrder(flowing)) {
      const gap: number = last ? Math.max(0, Math.min(36, item.box.y - (last.y + last.h))) : 0;
      const left = Math.max(0, item.box.x - inner.x);
      if (item.kind === "text") {
        const { object } = item;
        const centred = object.align === "center" || object.align === "right";
        // A line in the middle of the page is centred, however it was made.
        const middle =
          Math.abs(item.box.x + item.box.w / 2 - (inner.x + inner.w / 2)) < 4 &&
          item.box.w < inner.w * 0.8 &&
          left > 12;
        const paras = flowParas(object, centred || middle ? 0 : left > 3 ? left : 0, gap);
        if (middle && object.align === "left") for (const para of paras) if (!para.list) para.align = "center";
        // Text that went on from the page before is one paragraph again.
        const tail = blocks[blocks.length - 1];
        if (object.cont && tail?.kind === "para" && paras.length > 0) {
          blocks[blocks.length - 1] = merged(tail, paras[0]);
          blocks.push(...paras.slice(1));
        } else blocks.push(...paras);
      } else if (item.kind === "table") {
        if (gap > 3 && blocks.length > before) blocks.push({ kind: "para", runs: [{ text: "", style: { size: 4 } }] });
        blocks.push({ ...flowTable(item.table), left: left > 3 ? left : undefined });
      } else if (item.kind === "image") {
        const k = Math.min(1, inner.w / item.image.w);
        const centre = item.box.x + item.box.w / 2 - (inner.x + inner.w / 2);
        const align = Math.abs(centre) < 12 ? "center" : centre > inner.w * 0.2 ? "right" : "left";
        blocks.push({
          kind: "para",
          runs: [{ image: { ...item.image, w: item.image.w * k, h: item.image.h * k } }],
          align,
          before: gap || undefined,
        });
      } else if (item.kind === "rule") blocks.push({ kind: "rule", color: item.color, width: item.width });
      last = item.box;
    }
    // Every page starts on a new one, unless its first text only goes on.
    const first = blocks[before];
    const goesOn = items.some((item) => item.kind === "text" && item.object.cont);
    if (started && first && !goesOn) {
      if (first.kind === "para") blocks[before] = { ...first, breakBefore: true };
      else blocks.splice(before, 0, { kind: "break" });
    }
    onProgress?.(i + 1, pages.length);
  }
  return {
    kind: "flow",
    title: store.doc.meta?.title || store.name,
    author: store.doc.meta?.author || undefined,
    sections,
  };
}

// ---------------------------------------------------------------- pages where everything has its place

/** The corner a thing would have before it is turned about its middle. */
function unturned(object: { x: number; y: number; w: number; h: number; angle: number }): {
  x: number;
  y: number;
  angle?: number;
} {
  if (!object.angle) return { x: object.x, y: object.y };
  const middle = apply(placement(object.x, object.y, object.angle), object.w / 2, object.h / 2);
  return { x: middle.x - object.w / 2, y: middle.y - object.h / 2, angle: object.angle };
}

export async function gatherFixed(
  store: EditorStore,
  pages: readonly Page[],
  onProgress?: (done: number, total: number) => void,
): Promise<FixedDoc> {
  const out: FixedPage[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const view = pageBox(page);
    const at = (p: { x: number; y: number; angle?: number }) => ({ x: p.x - view.x, y: p.y - view.y, angle: p.angle });
    const items: FixedItem[] = [];
    const art = await store.artOf(page, 2).catch(() => null);
    if (art)
      items.push({
        kind: "image",
        x: -view.x,
        y: -view.y,
        w: page.w,
        h: page.h,
        bytes: new Uint8Array(await art.arrayBuffer()),
        mime: "image/png",
      });
    const text = (
      object:
        | TextObject
        | (TextBody & { x: number; y: number; w: number; h: number; angle: number; opacity: number; wrap: boolean }),
    ) => {
      // A little wider than it is: other programs' letters are never quite as wide as these.
      const slack = object.wrap ? 4 : Math.max(10, object.w * 0.08);
      const shift = object.align === "center" ? slack / 2 : object.align === "right" ? slack : 0;
      const place = unturned({ ...object, x: object.x - shift, w: object.w + slack });
      items.push({
        kind: "text",
        ...at(place),
        w: object.w + slack,
        h: object.h,
        blocks: flowParas(object),
        pad: { top: 0, right: 0, bottom: 0, left: 0 },
        noWrap: !object.wrap || undefined,
        opacity: object.opacity < 1 ? object.opacity : undefined,
        fill: "fill" in object && object.fill ? object.fill : undefined,
      });
    };
    const inner = await itemsOf(store, page);
    // Pictures first, so the words of the page stay on top of them.
    const pictures = inner.filter((item) => item.kind === "image" && item.whole);
    for (const item of [...pictures, ...inner.filter((one) => !pictures.includes(one))]) {
      switch (item.kind) {
        case "text":
          await loadBody(item.object);
          text(item.object);
          break;
        case "table":
          items.push({
            kind: "table",
            x: item.table.x - view.x,
            y: item.table.y - view.y,
            w: item.table.w,
            table: flowTable(item.table),
          });
          break;
        case "image":
          items.push({
            kind: "image",
            x: item.box.x + item.box.w / 2 - item.image.w / 2 - view.x,
            y: item.box.y + item.box.h / 2 - item.image.h / 2 - view.y,
            w: item.image.w,
            h: item.image.h,
            angle: item.image.angle,
            bytes: item.image.bytes,
            mime: item.image.mime,
            crop: item.image.crop,
          });
          break;
        case "art":
          if (item.image.float)
            items.push({
              kind: "image",
              x: item.image.float.x - view.x,
              y: item.image.float.y - view.y,
              w: item.image.w,
              h: item.image.h,
              angle: item.image.angle,
              bytes: item.image.bytes,
              mime: item.image.mime,
            });
          break;
        case "rule":
          // The page's own lines are in its drawing already.
          if (page.source === null || !art)
            items.push({
              kind: "shape",
              x: item.box.x - view.x,
              y: item.box.y - view.y,
              w: item.box.w,
              h: 0,
              shape: "line",
              stroke: { color: item.color, width: item.width },
            });
          break;
        case "box": {
          const { shape } = item;
          const flow = boxFlow(shape, page);
          const place = at(unturned(shape));
          if (isLine(shape)) {
            const back = Boolean(shape.back);
            items.push({
              kind: "shape",
              ...place,
              w: shape.w,
              h: shape.h,
              shape: "line",
              stroke: flow.stroke,
              // Drawn from its start: turned round, the line starts at the other end.
              flipY: (shape.flip ?? false) !== back || undefined,
              flipX: back || undefined,
              start: shape.start,
              end: shape.end ?? (shape.kind === "arrow" ? "arrow" : undefined),
              opacity: shape.opacity < 1 ? shape.opacity : undefined,
            });
          } else if (flow.blocks.length > 0)
            items.push({
              kind: "text",
              ...place,
              w: shape.w,
              h: shape.h,
              blocks: flow.blocks,
              valign: flow.valign ?? "middle",
              pad: shape.text
                ? { top: shape.text.pad, right: shape.text.pad, bottom: shape.text.pad, left: shape.text.pad }
                : { top: 0, right: 0, bottom: 0, left: 0 },
              shape: flow.shape,
              adj: shape.adj,
              fill: flow.fill,
              stroke: flow.stroke,
              opacity: shape.opacity < 1 ? shape.opacity : undefined,
              flipX: shape.flipX,
              flipY: shape.flipY,
            });
          else
            items.push({
              kind: "shape",
              ...place,
              w: shape.w,
              h: shape.h,
              shape: shape.kind,
              adj: shape.adj,
              fill: flow.fill,
              stroke: flow.stroke,
              opacity: shape.opacity < 1 ? shape.opacity : undefined,
              flipX: shape.flipX,
              flipY: shape.flipY,
            });
          break;
        }
      }
    }
    // Header, footer and watermark.
    if (store.doc.decor) {
      const { decorOf } = await import("../engine/decor");
      const index = store.doc.pages.findIndex((item) => item.id === page.id);
      for (const item of decorOf(
        store.doc,
        page,
        { index, count: store.doc.pages.length, name: store.name },
        store.assets,
      )) {
        if (item.kind !== "text") continue;
        const box = bounds(
          corners(placement(0, 0, 0), { x: 0, y: 0, w: item.laid.wrap ? item.laid.w : 400, h: item.laid.leading }),
        );
        text({ ...item.laid, x: item.x, y: item.y, w: box.w, h: box.h, angle: item.angle, opacity: item.opacity });
      }
    }
    out.push({ w: view.w, h: view.h, fill: page.paper, items });
    onProgress?.(i + 1, pages.length);
  }
  return { kind: "fixed", title: store.doc.meta?.title || store.name, pages: out };
}

// ---------------------------------------------------------------- rows and columns

/** The tables of the document as sheets. A page without any gives its words in rows and columns. */
export async function gatherSheets(
  store: EditorStore,
  pages: readonly Page[],
  onProgress?: (done: number, total: number) => void,
): Promise<SheetOut[]> {
  const out: SheetOut[] = [];
  const cellText = (body: TextBody) => plainText(body.runs).split(SOFT).join("\n").replace(/ /g, " ");
  for (let i = 0; i < pages.length; i += 1) {
    const items = await itemsOf(store, pages[i]);
    const tables = items
      .filter((item): item is Extract<Item, { kind: "table" }> => item.kind === "table")
      .sort((a, b) => a.box.y - b.box.y);
    const number = store.doc.pages.indexOf(pages[i]) + 1;
    tables.forEach(({ table }, k) => {
      out.push({
        name: tables.length > 1 ? `Page ${number} table ${k + 1}` : `Page ${number}`,
        cols: table.cols,
        rows: table.cells.map((row) =>
          row
            .filter((cell) => !cell.covered)
            .map((cell): SheetCell => {
              const align = cell.paras?.[0]?.align ?? cell.align;
              return {
                text: cellText(cell),
                bold: cell.runs.every((run) => isBold(run.style)) || undefined,
                fill: cell.fill ?? undefined,
                align: align === "justify" ? "left" : align,
                colSpan: cell.cols,
                rowSpan: cell.rows,
              };
            }),
        ),
      });
    });
    if (tables.length === 0) {
      // Words on the same height are a row; where they start makes the columns.
      type Part = { x: number; y: number; w: number; h: number; text: string; bold: boolean };
      const parts: Part[] = items.flatMap((item): Part[] => {
        if (item.kind !== "text") return [];
        const lines = cellText(item.object).split("\n");
        const h = item.box.h / Math.max(1, lines.length);
        return lines.map((text, line) => ({
          x: item.box.x,
          y: item.box.y + line * h,
          w: item.box.w,
          h,
          text,
          bold: item.object.runs.every((run) => isBold(run.style)),
        }));
      });
      const words = parts.filter((part) => part.text.trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x);
      const rows: Part[][] = [];
      for (const part of words) {
        const row = rows[rows.length - 1];
        if (row && Math.abs(row[0].y + row[0].h / 2 - part.y - part.h / 2) < Math.min(row[0].h, part.h) * 0.5)
          row.push(part);
        else rows.push([part]);
      }
      const starts: number[] = [];
      for (const x of words.map((part) => part.x).sort((a, b) => a - b))
        if (starts.length === 0 || x - starts[starts.length - 1] > 18) starts.push(x);
      const at = (x: number) => Math.max(0, starts.filter((start) => start <= x + 1).length - 1);
      if (rows.length > 0)
        out.push({
          name: `Page ${number}`,
          cols: starts.map((x, k) => Math.max(40, (starts[k + 1] ?? x + 160) - x)),
          rows: rows.map((row) => {
            const cells: SheetCell[] = [];
            for (const part of row.sort((a, b) => a.x - b.x)) {
              const c = at(part.x);
              while (cells.length < c) cells.push({ text: "" });
              if (cells.length > c) cells[cells.length - 1].text += ` ${part.text}`;
              else cells.push({ text: part.text, bold: part.bold || undefined });
            }
            return cells;
          }),
        });
    }
    onProgress?.(i + 1, pages.length);
  }
  return out.length > 0 ? out : [{ name: "Sheet 1", rows: [[{ text: "" }]] }];
}
