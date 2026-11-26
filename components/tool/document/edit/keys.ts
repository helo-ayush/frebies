import {
  alignSelection,
  cellLooks,
  clearLook,
  groupSelection,
  indentSelection,
  listSelection,
  setScript,
  shapeWords,
  styleSelection,
  tableDo,
  targetsOf,
  ungroupSelection,
} from "./commands";
import { backToText } from "./BarParts";
import { isBold, isItalic, withEmphasis } from "./engine/fonts";
import { GRID } from "./interact";
import { isCover, isLine, type Tool } from "./model";
import { SYMBOLS, styleOfSelection, type EditorStore } from "./store";

/** The keyboard of the editor. */

const TOOLS: Record<string, Tool> = {
  v: "select",
  t: "text",
  p: "pen",
  h: "highlight",
  w: "whiteout",
  l: "line",
  r: "shape:rect",
  o: "shape:ellipse",
  n: "note",
};

export type KeyWork = {
  download: () => void;
  open: () => void;
  print: () => void;
  shortcuts: () => void;
  /** Leaves the full screen. False when it was not there. */
  shrink: () => boolean;
};

/** True when the key did something here. */
export function pressKey(store: EditorStore, event: KeyboardEvent, work: KeyWork): boolean {
  const target = event.target as HTMLElement | null;
  const inText = Boolean(target?.isContentEditable);
  const inField =
    !inText &&
    Boolean(target?.closest("input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select"));
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const { selection, editing, tool, find, area } = store.view;
  const hasText = targetsOf(store).length > 0;
  const words = (change: () => void): true => {
    change();
    requestAnimationFrame(() => backToText(store));
    return true;
  };

  if (mod && !event.altKey) {
    switch (key) {
      case "s":
        work.download();
        return true;
      case "p":
        work.print();
        return true;
      case "o":
        work.open();
        return true;
      case "f":
        store.setView({ find: { ...find, open: true } });
        return true;
      default:
        break;
    }
    if (inField) return false;
    if (key === "z") {
      if (event.shiftKey) store.redo();
      else store.undo();
      return true;
    }
    if (key === "y") {
      store.redo();
      return true;
    }
    if (hasText) {
      const look = styleOfSelection(store);
      if (look && !event.shiftKey && (key === "b" || key === "i" || key === "u"))
        return words(() =>
          styleSelection(
            store,
            (style) =>
              key === "u"
                ? { ...style, underline: !look.underline }
                : withEmphasis(style, key === "b" ? { bold: !isBold(look) } : { italic: !isItalic(look) }),
            null,
            true,
          ),
        );
      if (key === "k" && !event.shiftKey) {
        document.querySelector<HTMLButtonElement>("[data-link-button]")?.click();
        return true;
      }
      if (key === "\\") return words(() => clearLook(store));
      if (key === "." && !event.shiftKey) return words(() => setScript(store, "super", true));
      if (key === "," && !event.shiftKey) return words(() => setScript(store, "sub", true));
      if ((key === "]" || key === "[") && editing) return words(() => indentSelection(store, key === "]" ? 1 : -1));
      if (event.shiftKey && look) {
        const { code } = event;
        if (code === "KeyX")
          return words(() => styleSelection(store, (style) => ({ ...style, strike: !look.strike }), null, true));
        if (code === "KeyL") return words(() => alignSelection(store, "left"));
        if (code === "KeyE") return words(() => alignSelection(store, "center"));
        if (code === "KeyR") return words(() => alignSelection(store, "right"));
        if (code === "KeyJ") return words(() => alignSelection(store, "justify"));
        if (code === "Digit7") return words(() => listSelection(store, { type: "number", mark: "1." }));
        if (code === "Digit8") return words(() => listSelection(store, { type: "bullet", mark: "•" }));
        if (code === "Period" || code === "Comma")
          return words(() => {
            const by = code === "Period" ? 1 : -1;
            const step = look.size >= 20 ? 2 : 1;
            styleSelection(
              store,
              (style) => ({ ...style, size: Math.max(1, Math.round((style.size + by * step) * 10) / 10) }),
              "size",
            );
          });
      }
    }
    if (inText) return false;
    if (key === "g") {
      if (event.shiftKey) ungroupSelection(store);
      else groupSelection(store);
      return true;
    }
    if ((key === "]" || key === "[") && selection.length > 0) {
      store.order(selection, key === "]" ? "up" : "down");
      return true;
    }
    if (key === "d" && selection.length > 0) {
      store.duplicate(selection);
      return true;
    }
    if (key === "a") {
      const page = store.here;
      if (page) store.select(page.objects.filter((id) => store.doc.objects[id] && !store.doc.objects[id].lock));
      return true;
    }
    if ((key === "c" || key === "x") && selection.length > 0 && (window.getSelection()?.toString() ?? "") === "") {
      store.copy(selection);
      if (key === "x") store.remove(selection);
      return true;
    }
    return false;
  }

  if (event.key === "Escape") {
    if (document.querySelector("[data-editor-panel]")) return false;
    if (store.view.painter) store.setView({ painter: null });
    else if (store.view.crop) store.setView({ crop: null });
    else if (store.view.cropArea) store.setView({ cropArea: null });
    else if (editing) {
      (document.activeElement as HTMLElement | null)?.blur();
      store.select([editing]);
    } else if (area) store.pickCells(selection[0], null);
    else if (tool !== "select") store.setTool("select");
    else if (selection.length > 0) {
      if (inField) (document.activeElement as HTMLElement | null)?.blur();
      store.select([]);
    } else if (find.open) store.setView({ find: { ...find, open: false, hits: [] } });
    else if (store.view.marked.length > 0) store.setView({ marked: [] });
    else return work.shrink();
    return true;
  }
  if (inText || inField || mod || event.altKey) return false;
  if (event.key === "?") {
    work.shortcuts();
    return true;
  }

  if (selection.length > 0) {
    const first = store.doc.objects[selection[0]];
    if (event.key === "Delete" || event.key === "Backspace") {
      // Picked cells are emptied; the table itself goes when it is picked as a whole.
      if (area && first?.type === "table") tableDo(store, "clear");
      else store.remove(selection);
      return true;
    }
    if (first && selection.length === 1 && !first.lock) {
      const closed = first.type === "shape" && !isLine(first) && !isCover(first) && !SYMBOLS.has(first.kind);
      if (event.key === "Enter" || event.key === "F2") {
        if (first.type === "text") store.select(selection, selection[0]);
        else if (first.type === "table")
          store.select(selection, selection[0], area ? { r: area.r0, c: area.c0 } : { r: 0, c: 0 });
        else if (closed) shapeWords(store, first.id);
        else return false;
        return true;
      }
      // Typing with a shape or a cell picked goes into it.
      if (
        event.key.length === 1 &&
        event.key !== " " &&
        !event.isComposing &&
        (closed || (first.type === "table" && area))
      ) {
        if (closed) shapeWords(store, first.id);
        else if (first.type === "table" && area) {
          cellLooks(store, (cell) => ({ runs: [{ text: "", style: cell.runs[0].style }], paras: undefined }));
          store.select([first.id], first.id, { r: area.r0, c: area.c0 });
        }
        const { editing: into, cell } = store.view;
        const body = into ? store.bodyOf(into, cell) : null;
        if (into && body) {
          const letter = event.key;
          void import("./engine/typing").then(({ insertText }) => {
            const now = store.bodyOf(into, cell);
            if (!now) return;
            const end = now.runs.reduce((sum, run) => sum + run.text.length, 0);
            store.type(into, cell, insertText(now, end, end, letter), `type:${into}`);
          });
        }
        return true;
      }
    }
    if (event.key.startsWith("Arrow")) {
      const { prefs } = store.view;
      const step = prefs.grid ? GRID : event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const free = selection.filter((id) => !store.doc.objects[id]?.lock);
      if (free.length > 0) store.patchMany(free, (object) => ({ x: object.x + dx, y: object.y + dy }), "nudge");
      return true;
    }
  }
  if (target?.closest("button, a, [role=button]") && (event.key === "Enter" || event.key === " ")) return false;
  if (event.key === "PageDown" || event.key === "PageUp") {
    const { pages } = store.doc;
    const at = pages.findIndex((page) => page.id === store.view.page);
    const next = pages[at + (event.key === "PageDown" ? 1 : -1)];
    if (next) store.show(next.id);
    return true;
  }
  if (!event.shiftKey && TOOLS[key]) {
    store.setTool(TOOLS[key]);
    return true;
  }
  return false;
}
