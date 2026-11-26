"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Run, TextBody } from "./model";
import { plainText, sliceRuns, tidyParas, allParas, paraAt } from "./model";
import { pasteCells, setScript, styleSelection, tabCell } from "./commands";
import { isBold, isItalic, withEmphasis } from "./engine/fonts";
import {
  SOFT,
  bodyFonts,
  caretRect,
  getSelection,
  loadBody,
  rangeOffsets,
  readText,
  setSelection,
  showText,
} from "./engine/text-dom";
import { rowsFromText } from "./engine/table";
import {
  insertBody,
  insertText,
  linkByTyping,
  listByTyping,
  pressBackspace,
  pressEnter,
  pressTab,
  signByTyping,
  type Typed,
} from "./engine/typing";
import { styleOfSelection, useEditor, type CellAt, type EditorStore } from "./store";

const EDITABLE: "plaintext-only" | "true" = (() => {
  if (typeof document === "undefined") return "true";
  const probe = document.createElement("div");
  try {
    probe.contentEditable = "plaintext-only";
    return probe.contentEditable === "plaintext-only" ? "plaintext-only" : "true";
  } catch {
    return "true";
  }
})();

/** The letter before or after a place, however many units it takes. */
function beside(text: string, at: number, back: boolean): number {
  type Segment = { segment: string };
  const Segmenter = (Intl as unknown as { Segmenter?: new () => { segment: (text: string) => Iterable<Segment> } })
    .Segmenter;
  const part = back ? text.slice(Math.max(0, at - 24), at) : text.slice(at, at + 24);
  if (part === "") return at;
  const list = Segmenter ? [...new Segmenter().segment(part)].map((item) => item.segment) : [...part];
  return back ? at - list[list.length - 1].length : at + list[0].length;
}

/**
 * Words on the page: shown, and typed in. They live in the store: every key is
 * turned into a change there, and the browser shows the result.
 */
export function Words({
  store,
  id,
  cell,
  body,
  wrap,
  w,
  max,
  editing,
  onSize,
  className = "",
}: {
  store: EditorStore;
  id: string;
  cell: CellAt | null;
  body: TextBody;
  wrap: boolean;
  w: number;
  max?: number;
  editing: boolean;
  onSize?: (w: number, h: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** The runs the browser already shows, because a keyboard composed them there. */
  const shown = useRef<Run[] | null>(null);
  const composing = useRef(false);
  const soft = useRef(false);
  const [tick, setTick] = useState(0);
  const where = useRef({ id, cell });
  where.current = { id, cell };
  const range = useEditor(store, (s) => (editing ? s.view.range : null));
  const spell = useEditor(store, (s) => s.view.prefs.spell);

  const { runs, paras, align, leading } = body;
  const width = wrap ? w : 0;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (editing && composing.current && shown.current === runs) return;
    const wanted = editing ? (store.view.range ?? getSelection(root)) : null;
    showText(root, { runs, paras, align, leading, wrap, w: width, max });
    if (editing && wanted && document.activeElement === root) setSelection(root, wanted.from, wanted.to);
  }, [runs, paras, align, leading, wrap, width, max, editing, tick, store]);

  // A selection made by a command, not by the pointer.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!editing || !range || !root || composing.current || document.activeElement !== root) return;
    const now = getSelection(root);
    if (!now || now.from !== range.from || now.to !== range.to) setSelection(root, range.from, range.to);
  }, [editing, range]);

  // The size the words take, for handles, snapping and drops.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !onSize) return;
    const css = getComputedStyle(root);
    const height = Number.parseFloat(css.height);
    if (height > 0) onSize(Number.parseFloat(css.width), height);
  });

  useEffect(() => {
    let off = false;
    void loadBody({ runs, paras }).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
    // Only new fonts matter here, not every letter.
  }, [bodyFonts({ runs, paras })]); // eslint-disable-line react-hooks/exhaustive-deps

  // The caret goes where the text was pressed, or where it was sent.
  useEffect(() => {
    const root = ref.current;
    if (!editing || !root) return;
    const preset = store.view.range;
    root.focus({ preventScroll: true });
    const at = store.caret;
    store.caret = null;
    const spot = at ? document.caretRangeFromPoint?.(at.x, at.y) : null;
    if (preset && !at) setSelection(root, preset.from, preset.to);
    else if (spot && root.contains(spot.startContainer)) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(spot);
    } else {
      const now = store.bodyOf(where.current.id, where.current.cell);
      const end = now ? plainText(now.runs).length : 0;
      setSelection(root, end, end);
    }
    const selection = getSelection(root);
    if (selection) store.setView({ range: selection });
  }, [editing, store]);

  useEffect(() => {
    const root = ref.current;
    if (!editing || !root) return;

    const now = (): TextBody | null => store.bodyOf(where.current.id, where.current.cell);
    const put = (next: Typed, key: string | null = `type:${where.current.id}`) =>
      store.type(where.current.id, where.current.cell, next, key);

    /** Typed or pasted words, and what they set off. */
    const insert = (text: string, at: { from: number; to: number }) => {
      const own = now();
      if (!own) return;
      put(insertText(own, at.from, at.to, text, store.view.pending ?? undefined));
      if (!store.view.prefs.auto || text !== " ") return;
      const after = now();
      const caret = store.view.range?.from;
      if (!after || caret === undefined) return;
      // A step of its own: undo gives back what was typed.
      const changed = listByTyping(after, caret) ?? signByTyping(after, caret) ?? linkByTyping(after, caret);
      if (changed) put(changed, null);
    };

    const selectionNow = () => {
      const own = now();
      const end = own ? plainText(own.runs).length : 0;
      return getSelection(root) ?? store.view.range ?? { from: end, to: end };
    };

    const paste = (data: DataTransfer | null, at: { from: number; to: number }) => {
      const text = (data?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n");
      const own = now();
      if (text === "" || !own) return;
      const rows = where.current.cell ? rowsFromText(text) : null;
      if (rows && pasteCells(store, rows)) return;
      if (store.words && store.words.text === text) put(insertBody(own, at.from, at.to, store.words.body), null);
      else
        put(
          insertText(
            own,
            at.from,
            at.to,
            text.replace(/\n+$/, (ends) => (ends.length > 1 ? "\n" : "")),
            store.view.pending ?? undefined,
          ),
          null,
        );
    };

    const onBeforeInput = (event: InputEvent) => {
      const kind = event.inputType;
      if (composing.current || event.isComposing || kind === "insertCompositionText" || !event.cancelable) return;
      event.preventDefault();
      const own = now();
      if (!own) return;
      const target = event.getTargetRanges?.()[0];
      const ranged = target ? rangeOffsets(root, target) : null;
      const at = selectionNow();
      const style = store.view.pending ?? undefined;
      switch (kind) {
        case "insertParagraph":
          put(pressEnter(own, at.from, at.to, false, style), null);
          return;
        case "insertLineBreak":
          // Plain-text editing knows no other kind of line end: Shift makes the difference.
          put(pressEnter(own, at.from, at.to, soft.current, style), soft.current ? `type:${where.current.id}` : null);
          return;
        case "insertFromPaste":
        case "insertFromPasteAsQuotation":
          paste(event.dataTransfer, at);
          return;
        case "insertFromDrop":
          paste(event.dataTransfer, ranged ?? at);
          return;
        case "insertReplacementText":
          insert((event.dataTransfer?.getData("text/plain") ?? event.data ?? "").replace(/\r\n?/g, "\n"), ranged ?? at);
          return;
        case "historyUndo":
          store.undo();
          return;
        case "historyRedo":
          store.redo();
          return;
        case "formatBold":
        case "formatItalic":
        case "formatUnderline": {
          const look = styleOfSelection(store);
          if (!look) return;
          styleSelection(
            store,
            (item) =>
              kind === "formatUnderline"
                ? { ...item, underline: !look.underline }
                : withEmphasis(item, kind === "formatBold" ? { bold: !isBold(look) } : { italic: !isItalic(look) }),
            null,
            true,
          );
          return;
        }
        default:
          break;
      }
      if (kind.startsWith("delete")) {
        if (at.from === at.to && kind === "deleteContentBackward") {
          const special = pressBackspace(own, at.from, at.to);
          if (special) {
            put(special, null);
            return;
          }
        }
        let { from, to } = at.from === at.to && ranged ? ranged : at;
        if (from === to) {
          const text = plainText(own.runs);
          const back = !kind.endsWith("Forward");
          const other = beside(text, from, back);
          [from, to] = back ? [other, from] : [from, other];
        }
        if (from === to) return;
        put(insertText(own, from, to, ""));
        return;
      }
      if (kind.startsWith("insert") && event.data !== null) insert(event.data.replace(/\r\n?/g, "\n"), at);
    };

    // What a keyboard composes is done by the browser, and read back.
    const onInput = () => {
      const own = now();
      if (!own) return;
      const next = readText(root, own.runs[0].style);
      const at = getSelection(root) ?? { from: 0, to: 0 };
      shown.current = next.runs;
      put({ ...next, ...at });
      if (!composing.current) setTick((value) => value + 1);
    };
    const onStart = () => {
      composing.current = true;
    };
    const onEnd = () => {
      composing.current = false;
      shown.current = null;
      const own = now();
      const at = getSelection(root);
      if (own && at) {
        const next = readText(root, own.runs[0].style);
        if (plainText(next.runs) !== plainText(own.runs)) put({ ...next, ...at });
        else store.setView({ range: at });
      }
      setTick((value) => value + 1);
    };

    const onSelect = () => {
      if (document.activeElement !== root || composing.current) return;
      const selection = getSelection(root);
      if (!selection) return;
      const range = store.view.range;
      if (range && range.from === selection.from && range.to === selection.to) return;
      store.setView({ range: selection, pending: null });
    };

    const onCopy = (event: ClipboardEvent) => {
      const own = now();
      const at = getSelection(root);
      if (!own || !at || at.from === at.to || !event.clipboardData) return;
      event.preventDefault();
      const text = plainText(own.runs).slice(at.from, at.to).split(SOFT).join("\n");
      const first = paraAt(own.runs, at.from).index;
      const last = paraAt(own.runs, at.to).index;
      store.words = {
        text,
        body: { runs: sliceRuns(own.runs, at.from, at.to), paras: tidyParas(allParas(own).slice(first, last + 1)) },
      };
      event.clipboardData.setData("text/plain", text);
      if (event.type === "cut") put(insertText(own, at.from, at.to, ""), null);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      soft.current = event.key === "Enter" && event.shiftKey;
      const own = now();
      const at = getSelection(root);
      if (!own || !at) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Tab" && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        if (where.current.cell && !mod) tabCell(store, event.shiftKey ? -1 : 1);
        else put(pressTab(own, at.from, at.to, event.shiftKey, store.view.pending ?? undefined), null);
        return;
      }
      if (mod && !event.altKey && (event.key === "." || event.key === ",")) {
        event.preventDefault();
        setScript(store, event.key === "." ? "super" : "sub", true);
        return;
      }
      if (!where.current.cell || mod || event.altKey || event.shiftKey || at.from !== at.to) return;
      // Past the edge of a cell, the arrows go on to the next one.
      const step = cellStep(event.key, root, own, at.from);
      if (step && stepCell(store, where.current.id, where.current.cell, step)) event.preventDefault();
    };
    const noDrag = (event: Event) => event.preventDefault();

    root.addEventListener("beforeinput", onBeforeInput);
    root.addEventListener("input", onInput);
    root.addEventListener("compositionstart", onStart);
    root.addEventListener("compositionend", onEnd);
    root.addEventListener("copy", onCopy);
    root.addEventListener("cut", onCopy);
    root.addEventListener("keydown", onKey);
    root.addEventListener("dragstart", noDrag);
    document.addEventListener("selectionchange", onSelect);
    return () => {
      composing.current = false;
      shown.current = null;
      root.removeEventListener("beforeinput", onBeforeInput);
      root.removeEventListener("input", onInput);
      root.removeEventListener("compositionstart", onStart);
      root.removeEventListener("compositionend", onEnd);
      root.removeEventListener("copy", onCopy);
      root.removeEventListener("cut", onCopy);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("dragstart", noDrag);
      document.removeEventListener("selectionchange", onSelect);
    };
  }, [editing, store]);

  const empty = plainText(runs) === "";
  return (
    <div
      ref={ref}
      data-text-box={cell ? `${id}:${cell.r},${cell.c}` : id}
      data-empty={empty || undefined}
      contentEditable={editing ? EDITABLE : undefined}
      suppressContentEditableWarning
      role={editing ? "textbox" : undefined}
      aria-multiline={editing || undefined}
      aria-label={editing ? "Text on the page" : undefined}
      spellCheck={editing && spell}
      className={`outline-none ${editing ? "cursor-text select-text" : "select-none"} ${className}`}
      style={{ caretColor: runs[0]?.style.color }}
    />
  );
}

/** Which way an arrow leaves the text, if it does. */
function cellStep(key: string, root: HTMLElement, body: TextBody, at: number): { r: number; c: number } | null {
  const length = plainText(body.runs).length;
  if (key === "ArrowLeft") return at === 0 ? { r: 0, c: -1 } : null;
  if (key === "ArrowRight") return at === length ? { r: 0, c: 1 } : null;
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const caret = caretRect(root, at);
  const box = root.getBoundingClientRect();
  if (!caret) return null;
  const line = Math.max(6, caret.height * 1.1);
  if (key === "ArrowUp") return caret.top - box.top < line * 0.7 ? { r: -1, c: 0 } : null;
  return box.bottom - caret.bottom < line * 0.7 ? { r: 1, c: 0 } : null;
}

function stepCell(store: EditorStore, id: string, cell: CellAt, by: { r: number; c: number }): boolean {
  const table = store.doc.objects[id];
  if (table?.type !== "table") return false;
  let { r, c } = cell;
  const own = table.cells[r]?.[c];
  // Over the whole of a joined cell.
  if (by.r > 0) r += (own?.rows ?? 1) - 1;
  if (by.c > 0) c += (own?.cols ?? 1) - 1;
  for (;;) {
    r += by.r;
    c += by.c;
    const next = table.cells[r]?.[c];
    if (!next) return false;
    if (next.covered) continue;
    store.caret = null;
    store.select([id], id, { r, c });
    const body = store.bodyOf(id, { r, c });
    const at = by.c > 0 || by.r > 0 ? 0 : body ? plainText(body.runs).length : 0;
    store.setView({ range: { from: at, to: at } });
    return true;
  }
}
