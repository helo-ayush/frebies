"use client";

import { memo, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { TableArt, useTableLay } from "./Art";
import { Words } from "./TextView";
import { startCol, startMove, startRow, toPage, track } from "./interact";
import type { Page, TableObject } from "./model";
import { plainText } from "./model";
import { apply, invert, placement } from "./engine/matrix";
import { ownerOf, wholeArea } from "./engine/table";
import { useEditor, type CellAt, type EditorStore } from "./store";

/** A table on the page: typed in cell by cell, picked by dragging, widened by its lines. */
export const TableView = memo(function TableView({
  store,
  page,
  table,
  reachable,
}: {
  store: EditorStore;
  page: Page;
  table: TableObject;
  reachable: boolean;
}) {
  const { id } = table;
  const editing = useEditor(store, (s) => s.view.editing === id);
  const cell = useEditor(store, (s) => (s.view.editing === id ? s.view.cell : null));
  const area = useEditor(store, (s) =>
    s.view.selection.length === 1 && s.view.selection[0] === id ? s.view.area : null,
  );
  const selected = useEditor(store, (s) => s.view.selection.includes(id));
  const lay = useTableLay(table);

  // The fonts may have come after the table was measured.
  useLayoutEffect(() => {
    if (Math.abs(lay.h - table.h) < 0.05 && Math.abs(lay.w - table.w) < 0.05) return;
    store.silent((doc) => {
      const now = doc.objects[id];
      return now?.type === "table"
        ? { ...doc, objects: { ...doc.objects, [id]: { ...now, w: lay.w, h: lay.h } } }
        : doc;
    });
  }, [lay, table.h, table.w, id, store]);

  // What is below makes room as rows grow or come.
  const last = useRef({ x: table.x, y: table.y, w: table.w, h: table.h });
  useEffect(() => {
    const before = last.current;
    last.current = { x: table.x, y: table.y, w: table.w, h: table.h };
    if (Math.abs(before.h - table.h) < 0.5 || before.y !== table.y || !selected) return;
    store.afterGrow(id, before);
  }, [table.x, table.y, table.w, table.h, id, selected, store]);

  const cellAt = (event: { clientX: number; clientY: number }): CellAt => {
    const p = toPage(store, page, event.clientX, event.clientY);
    const local = apply(invert(placement(table.x, table.y, table.angle)), p.x, p.y);
    const find = (stops: number[], value: number) => {
      const at = stops.findIndex((stop, i) => i > 0 && value < stop);
      return Math.max(0, Math.min(stops.length - 2, at < 0 ? stops.length - 2 : at - 1));
    };
    return ownerOf(table, find(lay.ys, local.y), find(lay.xs, local.x));
  };

  const press = (event: ReactPointerEvent) => {
    if (event.button !== 0 || !reachable) return;
    event.stopPropagation();
    if (table.lock) {
      event.preventDefault();
      store.select([id]);
      return;
    }
    if (event.shiftKey && !editing && !selected) {
      event.preventDefault();
      store.select([...store.view.selection, id]);
      return;
    }
    if (event.altKey) {
      event.preventDefault();
      startMove(store, page, [id], event);
      return;
    }
    const from = cellAt(event);
    if (event.shiftKey && (area || cell)) {
      event.preventDefault();
      const first = area ? { r: area.r0, c: area.c0 } : (cell as CellAt);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      store.pickCells(id, wholeArea(table, { r0: first.r, c0: first.c, r1: from.r, c1: from.c }));
      return;
    }
    const here = editing && cell?.r === from.r && cell.c === from.c;
    const touch = event.pointerType === "touch";
    const spot = { x: event.clientX, y: event.clientY };
    // Inside the cell being typed in the browser does its own work, until the pointer leaves it.
    if (!here && !touch) {
      event.preventDefault();
      store.caret = spot;
      store.select([id], id, from);
    }
    let picking = false;
    let anchored = false;
    track(
      event,
      (next) => {
        if (touch) return;
        const to = cellAt(next);
        if (picking || to.r !== from.r || to.c !== from.c) {
          if (!picking) {
            picking = true;
            document.getSelection()?.removeAllRanges();
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }
          store.pickCells(id, wholeArea(table, { r0: from.r, c0: from.c, r1: to.r, c1: to.c }));
          return;
        }
        if (here) return;
        // The press opened the cell, so dragging on selects its words.
        const at = document.caretRangeFromPoint?.(next.clientX, next.clientY);
        const root = document.querySelector(`[data-text-box="${id}:${from.r},${from.c}"]`);
        const selection = document.getSelection();
        if (!at || !root?.contains(at.startContainer) || !selection || selection.rangeCount === 0) return;
        if (!anchored) {
          if (Math.hypot(next.clientX - spot.x, next.clientY - spot.y) < 3) return;
          anchored = true;
        }
        selection.extend(at.startContainer, at.startOffset);
      },
      (next, cancelled) => {
        if (!touch || cancelled || here) return;
        if (Math.hypot(next.clientX - spot.x, next.clientY - spot.y) > 10) return;
        store.caret = spot;
        store.select([id], id, from);
      },
    );
  };

  const line = (event: ReactPointerEvent, start: typeof startCol, at: number) => {
    if (event.button !== 0 || !reachable || table.lock) return;
    event.preventDefault();
    event.stopPropagation();
    if (!selected) store.select([id]);
    start(store, page, id, at, event);
  };
  const wide = "calc(7px / var(--z))";
  const back = "calc(-3.5px / var(--z))";

  return (
    <div
      onPointerDown={press}
      className={`relative ${reachable ? (editing ? "cursor-text" : "cursor-cell") : ""}`}
      style={{ width: lay.w, height: lay.h }}
    >
      <TableArt table={table} lay={lay} />
      {lay.cells.map(({ r, c, cell: own, inner }) => {
        const typing = editing && cell?.r === r && cell.c === c;
        return (
          <div key={`${r},${c}`} className="absolute z-[2]" style={{ left: inner.x, top: inner.y }}>
            <Words store={store} id={id} cell={{ r, c }} body={own} wrap w={inner.w} editing={typing} />
          </div>
        );
      })}
      {area
        ? lay.cells
            .filter(({ r, c }) => r >= area.r0 && r <= area.r1 && c >= area.c0 && c <= area.c1)
            .map(({ r, c, box }) => (
              <span
                key={`a${r},${c}`}
                className="pointer-events-none absolute z-[3] bg-accent/[0.16]"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              />
            ))
        : null}
      {selected && !area && !editing ? (
        <span className="pointer-events-none absolute inset-0 z-[3] bg-accent/[0.06]" />
      ) : null}
      {reachable && !table.lock
        ? lay.xs
            .slice(1)
            .map((x, c) => (
              <span
                key={`x${c}`}
                onPointerDown={(event) => line(event, startCol, c)}
                className="absolute z-[4] cursor-col-resize touch-none hover:bg-accent/40"
                style={{ left: x, marginLeft: back, top: 0, width: wide, height: lay.h }}
              />
            ))
        : null}
      {reachable && !table.lock
        ? lay.ys
            .slice(1)
            .map((y, r) => (
              <span
                key={`y${r}`}
                onPointerDown={(event) => line(event, startRow, r)}
                className="absolute z-[4] cursor-row-resize touch-none hover:bg-accent/40"
                style={{ top: y, marginTop: back, left: 0, height: wide, width: lay.w }}
              />
            ))
        : null}
      {/* Cells without words are still found by a screen reader. */}
      <span className="sr-only">
        Table, {table.cells.length} rows, {table.cols.length} columns.{" "}
        {table.cells[0]?.map((item) => plainText(item.runs)).join(", ")}
      </span>
    </div>
  );
});
