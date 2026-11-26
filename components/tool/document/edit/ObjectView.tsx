"use client";

import { memo, useState, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { ObjectArt, Parts, TextBack, placeCss } from "./Art";
import { NoteView } from "./NoteView";
import { TableView } from "./TableView";
import { Words } from "./TextView";
import { applyPainter, shapeWords } from "./commands";
import { doublePress, startMove, track } from "./interact";
import { isCover, isLine, type EditObject, type Page, type ShapeObject, type TextObject } from "./model";
import { wordsBox } from "./engine/shape-text";
import { inkPath, scaledPath, shapeParts, toSvg } from "./engine/shapes";
import { bodyFonts, loadBody } from "./engine/text-dom";
import { SYMBOLS, blockBox, useEditor, type EditorStore } from "./store";

const canHoldWords = (object: EditObject): object is ShapeObject =>
  object.type === "shape" && !isLine(object) && !isCover(object) && !SYMBOLS.has(object.kind);

function ShapeView({ store, shape, editing }: { store: EditorStore; shape: ShapeObject; editing: boolean }) {
  const { text } = shape;
  const [, setTick] = useState(0);
  const fonts = text ? bodyFonts(text) : "";
  useEffect(() => {
    if (!text) return;
    let off = false;
    void loadBody(text).then(() => {
      if (!off) setTick((value) => value + 1);
    });
    return () => {
      off = true;
    };
  }, [fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = text ? wordsBox(shape, text) : null;
  return (
    <span className="relative block" style={{ width: shape.w, height: shape.h }}>
      <Parts parts={shapeParts(shape)} w={shape.w} h={shape.h} />
      {text && box ? (
        <span className="absolute block" style={{ left: box.x, top: box.y }}>
          <Words store={store} id={shape.id} cell={null} body={text} wrap w={box.w} editing={editing} />
        </span>
      ) : null}
    </span>
  );
}

function TextView({
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
  const { id } = object;
  return (
    <div className="relative z-0" style={{ backgroundColor: cover ?? undefined }}>
      <TextBack object={object} />
      <Words
        store={store}
        id={id}
        cell={null}
        body={object}
        wrap={object.wrap}
        w={object.w}
        max={object.max}
        editing={editing}
        onSize={(width, height) => {
          const now = store.doc.objects[id];
          if (now?.type !== "text") return;
          if (Math.abs(height - now.h) > 0.6 || (!now.wrap && Math.abs(width - now.w) > 0.6))
            store.grow(id, now.wrap ? now.w : width, height);
        }}
      />
    </div>
  );
}

/** One object on the page: how it looks, and what a press on it does. */
export const ObjectView = memo(function ObjectView({
  store,
  page,
  id,
  stale,
}: {
  store: EditorStore;
  page: Page;
  id: string;
  stale: boolean;
}) {
  const object = useEditor(store, (s) => s.doc.objects[id] as EditObject | undefined);
  const editing = useEditor(store, (s) => s.view.editing === id);
  const selected = useEditor(store, (s) => s.view.selection.includes(id));
  const tool = useEditor(store, (s) => s.view.tool);
  useEditor(store, (s) => object?.type === "mark" && s.view.editing !== null);
  if (!object) return null;

  const busy = store.view.editing !== null;
  const reachable =
    (tool === "select" && !(object.type === "mark" && busy)) ||
    (tool === "text" && (object.type === "text" || object.type === "table")) ||
    (tool === "link" && object.type === "link") ||
    (tool === "note" && object.type === "note");

  const edit = (spot: { x: number; y: number }) => {
    store.caret = spot;
    if (tool === "text") store.setView({ tool: "select" });
    store.select([id], id);
  };

  /** A press that did not become a drag. */
  const clicked = (spot: { x: number; y: number }, was: boolean, double: boolean, fresh: boolean) => {
    const now = store.doc.objects[id];
    if (!now) return;
    if (store.view.painter && (now.type === "text" || (now.type === "shape" && now.text))) {
      store.select([id]);
      applyPainter(store);
      return;
    }
    const { selection } = store.view;
    const family = store.withGroups([id]);
    if (double && fresh && now.ops && now.type !== "image" && now.type !== "text") {
      // Pressed twice: the whole drawing this is a part of.
      const unit = store.drawingOf(page.id, now)[0];
      if (unit)
        void store.openDrawing(page.id, unit).then((ids) => {
          if (ids.length > 0) store.select([...new Set([id, ...ids])]);
        });
      return;
    }
    if (now.lock) return;
    if (family.length > 1 && !was) return;
    if (now.type === "text") edit(spot);
    else if (double && canHoldWords(now) && !now.lock) {
      store.caret = spot;
      shapeWords(store, id);
    } else if (was && selection.length > 1) store.select([id]);
    else if (was && now.type === "mark") {
      // Pressed again: reach for the words under the mark.
      const under = document
        .elementsFromPoint(spot.x, spot.y)
        .find((node) => node instanceof HTMLElement && (node.dataset.block || node.dataset.kind === "text"));
      if (!(under instanceof HTMLElement)) return;
      if (under.dataset.object) {
        store.caret = spot;
        store.select([under.dataset.object], under.dataset.object);
      } else if (under.dataset.block) {
        const key = under.dataset.block;
        const block = store.block(page, key);
        if (!block) return;
        void store.openBlock(page.id, key, store.sample(page.id, blockBox(block))).then((opened) => {
          if (!opened) return;
          store.caret = spot;
          store.select([opened], opened);
        });
      }
    }
  };

  const press = (event: ReactPointerEvent) => {
    if (event.button !== 0 || !reachable) return;
    event.stopPropagation();
    if (editing) return;
    const spot = { x: event.clientX, y: event.clientY };
    const family = store.withGroups([id]);
    const was = selected;
    const double = doublePress(store.press, event);
    const fresh = double && store.press?.fresh === id;
    store.press = { time: performance.now(), ...spot, fresh: was && !fresh ? null : id };

    if (event.pointerType === "touch" && !selected) {
      // A finger may be scrolling: wait and see.
      track(
        event,
        () => undefined,
        (next, cancelled) => {
          if (cancelled || Math.hypot(next.clientX - spot.x, next.clientY - spot.y) > 10) return;
          const now = store.doc.objects[id];
          if (now?.type === "text" && family.length === 1 && !now.lock) edit(spot);
          else store.select(family);
        },
      );
      return;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    event.preventDefault();
    const { selection } = store.view;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const set = new Set(family);
      store.select(selected ? selection.filter((item) => !set.has(item)) : [...selection, ...family]);
      return;
    }
    const ids = selected ? selection : family;
    if (!selected) store.select(family);
    startMove(store, page, ids, event, (moved) => {
      if (!moved) clicked(spot, was, double, fresh);
    });
  };

  const common = { onPointerDown: press, "data-object": id, "data-kind": object.type };

  if (object.type === "link") {
    return (
      <div
        {...common}
        style={{ ...placeCss(object), width: object.w, height: object.h }}
        className={`border border-dashed border-accent-deep bg-accent/10 ${reachable ? "pointer-events-auto cursor-move" : ""}`}
      />
    );
  }
  if (object.type === "table") {
    return (
      <div
        data-object={id}
        data-kind="table"
        style={placeCss(object)}
        className={reachable ? "pointer-events-auto" : "pointer-events-none"}
      >
        <TableView store={store} page={page} table={object} reachable={reachable} />
      </div>
    );
  }

  const cover = object.type === "text" && stale && object.block ? (page.covers[object.block] ?? null) : null;
  // Only what is drawn can be pressed: not the empty middle of a line or a frame.
  const outline =
    isLine(object) || object.type === "ink"
      ? "line"
      : (object.type === "path" && !object.fill) ||
          (object.type === "shape" && !object.fill && !object.text && !isCover(object) && !SYMBOLS.has(object.kind))
        ? "stroke"
        : null;
  return (
    <div
      {...common}
      style={placeCss(object)}
      className={`${reachable && !outline ? "pointer-events-auto" : "pointer-events-none"} ${selected ? "touch-none" : ""} ${
        editing
          ? ""
          : `${object.lock ? "cursor-default" : "cursor-move"} ${reachable && !selected && !outline ? "hover:shadow-[0_0_0_calc(1.5px/var(--z))_#f2552c]" : ""}`
      }`}
    >
      {object.type === "text" ? (
        <TextView store={store} object={object} editing={editing} cover={cover} />
      ) : object.type === "shape" ? (
        <ShapeView store={store} shape={object} editing={editing} />
      ) : object.type === "note" ? (
        <NoteView store={store} page={page} note={object} selected={selected} />
      ) : (
        <ObjectArt object={object} store={store} />
      )}
      {outline && reachable ? (
        <svg
          width={Math.max(1, object.w)}
          height={Math.max(1, object.h)}
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          aria-hidden
        >
          <path
            d={
              object.type === "ink"
                ? toSvg(inkPath(object))
                : object.type === "path"
                  ? toSvg(scaledPath(object))
                  : object.type === "shape"
                    ? shapeParts(object)
                        .map((part) => toSvg(part.path))
                        .join("")
                    : ""
            }
            fill={outline === "stroke" && selected ? "transparent" : "none"}
            stroke="transparent"
            strokeWidth={Math.max("width" in object ? (object.width ?? 1) : 1, 12 / store.view.zoom)}
            className="pointer-events-auto cursor-move"
          />
        </svg>
      ) : null}
    </div>
  );
});
