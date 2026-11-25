"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Run, TextObject } from "./model";
import { plainText, replaceText } from "./model";
import { loadFaces } from "./engine/fonts";
import { getSelection, needsSplit, readText, setSelection, showText, stylesOf } from "./engine/text-dom";
import type { EditorStore } from "./store";

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

/** A text box: shown, and typed in. The words live in the store; the browser only edits them. */
export function TextView({
  store,
  object,
  editing,
  cover,
}: {
  store: EditorStore;
  object: TextObject;
  editing: boolean;
  cover: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** The runs the browser already shows, because they were typed here. */
  const shown = useRef<Run[] | null>(null);
  const [tick, setTick] = useState(0);
  const latest = useRef(object);
  latest.current = object;

  const { runs, align, leading, wrap, w, indent, hang } = object;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (editing && shown.current === runs) {
      // Typed: the letters are there, only the box may have changed.
      return;
    }
    const wanted = editing ? (store.view.range ?? getSelection(root)) : null;
    showText(root, { runs, align, leading, wrap, w, indent, hang });
    shown.current = runs;
    if (editing && wanted && document.activeElement === root) setSelection(root, wanted.from, wanted.to);
  }, [runs, align, leading, wrap, w, indent, hang, editing, tick, store]);

  // The size the words take, for handles, snapping and drops.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    if (height === 0) return;
    const now = latest.current;
    if (Math.abs(height - now.h) > 0.6 || (!now.wrap && Math.abs(width - now.w) > 0.6)) {
      store.silent((doc) => {
        const here = doc.objects[now.id];
        if (here?.type !== "text") return doc;
        return { ...doc, objects: { ...doc.objects, [now.id]: { ...here, h: height, w: here.wrap ? here.w : width } } };
      });
    }
  });

  useEffect(() => {
    let off = false;
    void loadFaces(stylesOf(runs), plainText(runs)).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
    // Only new fonts matter here, not every letter.
  }, [
    stylesOf(runs)
      .map((style) => `${style.font}${style.bold}${style.italic}`)
      .join(),
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Put the caret where the text was pressed.
  useEffect(() => {
    const root = ref.current;
    if (!editing || !root) return;
    root.focus({ preventScroll: true });
    const at = store.caret;
    store.caret = null;
    const spot = at ? document.caretRangeFromPoint?.(at.x, at.y) : null;
    if (spot && root.contains(spot.startContainer)) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(spot);
    } else {
      const end = plainText(latest.current.runs).length;
      setSelection(root, end, end);
    }
    const selection = getSelection(root);
    if (selection) store.setView({ range: selection });
  }, [editing, store]);

  useEffect(() => {
    const root = ref.current;
    if (!editing || !root) return;

    const insert = (text: string, style = store.view.pending ?? undefined) => {
      const at = getSelection(root) ??
        store.view.range ?? { from: plainText(latest.current.runs).length, to: plainText(latest.current.runs).length };
      const next = replaceText(latest.current.runs, at.from, at.to, text, style);
      const caret = at.from + text.length;
      store.setView({ range: { from: caret, to: caret } });
      store.patch<TextObject>(latest.current.id, { runs: next }, `type:${latest.current.id}`);
      store.setView({ pending: null });
    };

    const onBeforeInput = (event: InputEvent) => {
      const kind = event.inputType;
      if (event.isComposing || kind === "insertCompositionText") return;
      if (kind === "insertParagraph" || kind === "insertLineBreak") {
        event.preventDefault();
        insert("\n");
      } else if (kind === "insertFromPaste" || kind === "insertFromDrop" || kind === "insertReplacementText") {
        const text = event.dataTransfer?.getData("text/plain") ?? event.data;
        if (text === null || text === undefined) return;
        event.preventDefault();
        if (kind === "insertReplacementText") {
          const target = event.getTargetRanges()[0];
          if (target) {
            const live = document.createRange();
            live.setStart(target.startContainer, target.startOffset);
            live.setEnd(target.endContainer, target.endOffset);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(live);
          }
        }
        insert(text.replace(/\r\n?/g, "\n"));
      } else if (kind === "insertText" && store.view.pending && event.data) {
        event.preventDefault();
        insert(event.data);
      } else if (kind === "historyUndo" || kind === "historyRedo" || kind.startsWith("format")) {
        event.preventDefault();
      }
    };
    const onInput = (event: Event) => {
      const fallback = latest.current.runs[0]?.style ?? store.view.prefs.text;
      const next = readText(root, fallback);
      shown.current = next;
      const composing = (event as InputEvent).isComposing;
      if (
        !composing &&
        (plainText(next) === "" || needsSplit(next) || root.querySelector("font, b, i, u, style") !== null)
      )
        shown.current = null;
      const selection = getSelection(root);
      if (selection) store.setView({ range: selection });
      store.patch<TextObject>(latest.current.id, { runs: next }, `type:${latest.current.id}`);
    };
    const onSelect = () => {
      if (document.activeElement !== root) return;
      const selection = getSelection(root);
      if (!selection) return;
      const now = store.view.range;
      if (now && now.from === selection.from && now.to === selection.to) return;
      store.setView({ range: selection, pending: null });
    };
    root.addEventListener("beforeinput", onBeforeInput);
    root.addEventListener("input", onInput);
    document.addEventListener("selectionchange", onSelect);
    return () => {
      root.removeEventListener("beforeinput", onBeforeInput);
      root.removeEventListener("input", onInput);
      document.removeEventListener("selectionchange", onSelect);
    };
  }, [editing, store]);

  const empty = plainText(runs) === "";
  return (
    <div
      ref={ref}
      data-text-box={object.id}
      data-empty={empty || undefined}
      contentEditable={editing ? EDITABLE : undefined}
      suppressContentEditableWarning
      role={editing ? "textbox" : undefined}
      aria-multiline={editing || undefined}
      aria-label={editing ? "Text on the page" : undefined}
      spellCheck={false}
      className={`outline-none ${editing ? "cursor-text select-text" : "select-none"}`}
      style={{ backgroundColor: cover ?? undefined, caretColor: runs[0]?.style.color }}
    />
  );
}
