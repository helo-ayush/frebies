import { objectBounds } from "./engine/matrix";
import { loadFaces } from "./engine/fonts";
import { measureBox } from "./engine/text-dom";
import { DEFAULT_STYLE, marginBox, uid, type ShapeObject, type Style, type TextObject } from "./model";
import { leadingOf, type EditorStore } from "./store";

/** Ready-made things to put on a page. */

type Spot = { page: string; x: number; y: number } | null;

export type StampKind = { text: string; color: string };
export const STAMPS: readonly StampKind[] = [
  { text: "Approved", color: "#16803c" },
  { text: "Rejected", color: "#ad1f1a" },
  { text: "Draft", color: "#57565c" },
  { text: "Final", color: "#1e3a8a" },
  { text: "Confidential", color: "#ad1f1a" },
  { text: "Paid", color: "#16803c" },
  { text: "Copy", color: "#1c5fc4" },
  { text: "Urgent", color: "#d8431b" },
];

/** A stamp is a frame with its word inside, so it can be changed like any shape. */
export function addStamp(store: EditorStore, stamp: StampKind, spot: Spot) {
  const page = (spot && store.page(spot.page)) || store.here;
  if (!page) return;
  const style: Style = { ...DEFAULT_STYLE, size: 22, bold: true, color: stamp.color, tracking: 1.5 };
  const text = stamp.text.toUpperCase();
  void loadFaces([style], text).then(() => {
    const leading = 26;
    const size = measureBox({ runs: [{ text, style }], align: "center", leading, wrap: false, w: 0 });
    const w = size.w + 30;
    const h = 42;
    const box = marginBox(page);
    const x = spot?.x ?? box.x + box.w / 2;
    const y = spot?.y ?? box.y + box.h / 3;
    const object: ShapeObject = {
      id: uid("g"),
      type: "shape",
      kind: "rect",
      x: x - w / 2,
      y: y - h / 2,
      w,
      h,
      angle: -8,
      opacity: 0.9,
      stroke: stamp.color,
      fill: null,
      width: 3,
      dash: "solid",
      text: { runs: [{ text, style }], align: "center", leading, valign: "middle", pad: 4 },
    };
    store.add(page.id, object);
    store.setView({ tool: "select" });
    store.show(page.id, objectBounds(object));
  });
}

const today = () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** Words at a place: today's date, a symbol. Into the text being typed when there is one. */
export function addWords(store: EditorStore, text: string, spot: Spot, patch: Partial<Style> = {}) {
  const { editing, cell, range } = store.view;
  const body = editing ? store.bodyOf(editing, cell) : null;
  if (editing && body && range) {
    void import("./engine/typing").then(({ insertText }) => {
      const now = store.bodyOf(editing, cell);
      if (now)
        store.type(editing, cell, insertText(now, range.from, range.to, text, store.view.pending ?? undefined), null);
    });
    return;
  }
  const page = (spot && store.page(spot.page)) || store.here;
  if (!page) return;
  const style = { ...store.freshStyle(), ...patch };
  const leading = leadingOf(style);
  const box = marginBox(page);
  const object: TextObject = {
    id: uid("t"),
    type: "text",
    x: spot?.x ?? box.x + box.w / 2,
    y: (spot?.y ?? box.y + box.h / 3) - leading / 2,
    w: 10,
    h: leading,
    angle: 0,
    opacity: 1,
    runs: [{ text, style }],
    align: "left",
    leading,
    wrap: false,
  };
  store.add(page.id, object);
  store.setView({ tool: "select" });
}

export const addDate = (store: EditorStore, spot: Spot) => addWords(store, today(), spot);
