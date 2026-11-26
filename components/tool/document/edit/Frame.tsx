"use client";

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { Lock, Move, Plus, RotateCw, Trash2 } from "lucide-react";
import { isLine, type EditObject, type ImageObject, type Page, type TableObject } from "./model";
import { tableDo } from "./commands";
import { objectBounds } from "./engine/matrix";
import { layTable } from "./engine/table";
import {
  adjustPoints,
  lineEnds,
  startAdjust,
  startCrop,
  startEnd,
  startMove,
  startResize,
  startResizeMany,
  startTurn,
  track,
  unionOf,
  wholePicture,
  type Handle,
} from "./interact";
import { useEditor, type EditorStore } from "./store";

const CORNERS: Handle[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const SIDES: Handle[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
];

const cursorOf = (handle: Handle, angle: number) => {
  const names = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];
  const base = handle.x === 0.5 ? 0 : handle.y === 0.5 ? 2 : handle.x === handle.y ? 3 : 1;
  return names[(((base + Math.round(angle / 45)) % 4) + 4) % 4];
};

const px = (value: number) => `calc(${value}px / var(--z))`;
const stop = (event: ReactPointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const FINGER =
  "[@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[calc(-9px/var(--z))] [@media(pointer:coarse)]:before:content-['']";

/** A small key that stays the same size at every zoom. */
function Grip({
  label,
  left,
  right,
  top,
  tone,
  cursor = "pointer",
  onPress,
  onPick,
  slot,
  children,
}: {
  label: string;
  left?: string;
  right?: string;
  top: string;
  tone: "accent" | "ink" | "plain";
  cursor?: string;
  onPress?: (event: ReactPointerEvent) => void;
  onPick?: () => void;
  slot?: string;
  children: ReactNode;
}) {
  const look =
    tone === "accent"
      ? "bg-accent-deep text-white"
      : tone === "ink"
        ? "bg-ink text-white"
        : "border-ink bg-white text-ink hover:bg-danger hover:text-white";
  return (
    <button
      type="button"
      tabIndex={-1}
      data-handle
      data-slot={slot}
      title={label}
      aria-label={label}
      onPointerDown={(event) => {
        stop(event);
        onPress?.(event);
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={`pointer-events-auto absolute z-[5] grid touch-none place-items-center ${look} ${FINGER}`}
      style={{
        left,
        right,
        top,
        width: px(22),
        height: px(20),
        cursor,
        borderWidth: tone === "plain" ? px(1) : 0,
        borderStyle: "solid",
      }}
    >
      {children}
    </button>
  );
}

const ICON = { style: { width: px(12), height: px(12) }, strokeWidth: 2, "aria-hidden": true } as const;

/** Handles around one thing that is selected. Sizes stay the same at every zoom. */
export function Frame({
  store,
  page,
  id,
  alone,
  editing,
}: {
  store: EditorStore;
  page: Page;
  id: string;
  alone: boolean;
  editing: boolean;
}) {
  const object = useEditor(store, (s) => s.doc.objects[id] as EditObject | undefined);
  const crop = useEditor(store, (s) => s.view.crop === id);
  if (!object) return null;
  const locked = Boolean(object.lock);

  if (isLine(object)) {
    const ends = lineEnds(object);
    return (
      <>
        {alone && !locked
          ? ends.map((end, i) => (
              <span
                key={i}
                data-handle
                onPointerDown={(event) => {
                  stop(event);
                  startEnd(store, page, id, i as 0 | 1, event);
                }}
                className={`pointer-events-auto absolute z-[4] cursor-crosshair touch-none border-ink bg-white ${FINGER}`}
                style={{
                  left: end.x,
                  top: end.y,
                  width: px(12),
                  height: px(12),
                  borderWidth: px(1.5),
                  borderStyle: "solid",
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))
          : null}
        <svg width="1" height="1" className="pointer-events-none absolute left-0 top-0 overflow-visible" aria-hidden>
          <path
            d={`M${ends[0].x} ${ends[0].y}L${ends[1].x} ${ends[1].y}`}
            stroke="#f2552c"
            strokeOpacity={0.85}
            style={{ strokeWidth: px(1.5) }}
            fill="none"
          />
        </svg>
        {alone ? (
          <div
            className="pointer-events-none absolute"
            style={{ left: Math.max(ends[0].x, ends[1].x), top: Math.min(ends[0].y, ends[1].y) }}
          >
            {locked ? (
              <Grip
                label="Unlock"
                left={px(12)}
                top={px(-28)}
                tone="plain"
                onPick={() => store.patch(id, { lock: undefined })}
              >
                <Lock {...ICON} />
              </Grip>
            ) : (
              <Grip
                label="Delete"
                slot="object-remove"
                left={px(12)}
                top={px(-28)}
                tone="plain"
                onPick={() => store.remove([id])}
              >
                <Trash2 {...ICON} />
              </Grip>
            )}
          </div>
        ) : null}
      </>
    );
  }

  const text = object.type === "text";
  const table = object.type === "table";
  const handles =
    !alone || locked
      ? []
      : text
        ? [...CORNERS, SIDES[1], SIDES[3]]
        : table
          ? [CORNERS[2], SIDES[1], SIDES[2]]
          : object.type === "mark" || object.type === "note"
            ? []
            : object.type === "ink"
              ? CORNERS
              : [...CORNERS, ...SIDES];
  const small = Math.min(object.w, object.h) * store.view.zoom < 34;
  const turns =
    !locked &&
    !crop &&
    !table &&
    object.type !== "mark" &&
    object.type !== "link" &&
    object.type !== "field" &&
    object.type !== "note";
  const out = text ? 4 : 1;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[4]"
      style={{
        width: object.w,
        height: object.h,
        transformOrigin: "0 0",
        transform: `translate(${object.x}px, ${object.y}px) rotate(${object.angle}deg)`,
      }}
    >
      <span
        className="absolute border-accent"
        style={{ inset: px(-out), borderWidth: px(1.5), borderStyle: editing || locked ? "dashed" : "solid" }}
      />
      {crop && object.type === "image" ? <Uncropped store={store} object={object} /> : null}
      {(text || table) && alone && !locked ? (
        <Grip
          label="Move"
          left={px(-out)}
          top={px(-24 - out)}
          tone="accent"
          cursor="move"
          onPress={(event) => startMove(store, page, [id], event)}
        >
          <Move {...ICON} />
        </Grip>
      ) : null}
      {alone && locked ? (
        <Grip
          label="Unlock"
          right={px(-out)}
          top={px(-24 - out)}
          tone="plain"
          onPick={() => store.patch(id, { lock: undefined })}
        >
          <Lock {...ICON} />
        </Grip>
      ) : null}
      {alone && !locked && !crop ? (
        <Grip
          label="Delete"
          slot="object-remove"
          right={px(-out)}
          top={px(-24 - out)}
          tone="plain"
          onPick={() => store.remove([id])}
        >
          <Trash2 {...ICON} />
        </Grip>
      ) : null}
      {/* The edge of a text box moves it while the inside is being typed in. */}
      {text && editing && !locked
        ? (["top", "bottom", "left", "right"] as const).map((side) => (
            <span
              key={side}
              data-handle
              onPointerDown={(event) => {
                stop(event);
                startMove(store, page, [id], event);
              }}
              className="pointer-events-auto absolute cursor-move touch-none"
              style={{
                [side]: px(-11),
                ...(side === "top" || side === "bottom"
                  ? { left: px(-11), right: px(-11), height: px(10) }
                  : { top: 0, bottom: 0, width: px(10) }),
              }}
            />
          ))
        : null}
      {table && alone && !locked ? <TableKeys store={store} page={page} table={object} /> : null}
      {handles.map((handle) => {
        const side = handle.x === 0.5 || handle.y === 0.5;
        if (side && small && !text && !table) return null;
        return (
          <span
            key={`${handle.x}${handle.y}`}
            data-handle
            onPointerDown={(event) => {
              stop(event);
              if (crop) startCrop(store, page, id, handle, event);
              else startResize(store, page, id, handle, event);
            }}
            className={`pointer-events-auto absolute touch-none border-ink bg-white ${FINGER}`}
            style={{
              left: `${handle.x * 100}%`,
              top: `${handle.y * 100}%`,
              width: px(side ? (handle.x === 0.5 ? 18 : 8) : 11),
              height: px(side ? (handle.y === 0.5 ? 18 : 8) : 11),
              borderWidth: px(1.5),
              borderStyle: "solid",
              cursor: cursorOf(handle, object.angle + page.rotate),
              transform: `translate(calc(-50% + ${text ? (handle.x - 0.5) * 8 : 0}px / var(--z)), calc(-50% + ${text ? (handle.y - 0.5) * 8 : 0}px / var(--z)))`,
            }}
          />
        );
      })}
      {alone && !locked && object.type === "shape"
        ? adjustPoints(object).map(({ at, which }) => (
            <span
              key={which.join()}
              data-handle
              title="Change the form"
              onPointerDown={(event) => {
                stop(event);
                startAdjust(store, page, id, which, event);
              }}
              className={`pointer-events-auto absolute z-[5] cursor-crosshair touch-none border-ink bg-[#ffd23f] ${FINGER}`}
              style={{
                left: at.x,
                top: at.y,
                width: px(11),
                height: px(11),
                borderWidth: px(1.5),
                borderStyle: "solid",
                transform: "translate(-50%, -50%) rotate(45deg)",
              }}
            />
          ))
        : null}
      {alone && turns ? (
        <Grip
          label="Turn"
          left={text ? px(20) : `calc(50% - ${px(11)})`}
          top={px(text ? -24 - out : -32)}
          tone="ink"
          cursor="grab"
          onPress={(event) => startTurn(store, page, id, event)}
        >
          <RotateCw {...ICON} />
        </Grip>
      ) : null}
    </div>
  );
}

/** Strips along a table: they pick rows and columns, and the keys at their ends add one. */
function TableKeys({ store, page, table }: { store: EditorStore; page: Page; table: TableObject }) {
  const area = useEditor(store, (s) => s.view.area);
  const lay = layTable(table);
  const rows = table.cells.length;
  const cols = table.cols.length;
  const pick = (way: "row" | "col", event: ReactPointerEvent) => {
    stop(event);
    const from = Number((event.currentTarget as HTMLElement).dataset.at);
    const first = event.shiftKey && area ? (way === "row" ? area.r0 : area.c0) : from;
    const set = (to: number) => {
      const [a, b] = first < to ? [first, to] : [to, first];
      store.pickCells(
        table.id,
        way === "row" ? { r0: a, r1: b, c0: 0, c1: cols - 1 } : { r0: 0, r1: rows - 1, c0: a, c1: b },
      );
    };
    set(from);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    track(
      event,
      (next) => {
        const under = document
          .elementsFromPoint(next.clientX, next.clientY)
          .find((node) => node instanceof HTMLElement && node.dataset.strip === way);
        if (under instanceof HTMLElement) set(Number(under.dataset.at));
      },
      () => undefined,
    );
  };
  const on = (way: "row" | "col", at: number) =>
    area !== null &&
    (way === "row"
      ? at >= area.r0 && at <= area.r1 && area.c0 === 0 && area.c1 === cols - 1
      : at >= area.c0 && at <= area.c1 && area.r0 === 0 && area.r1 === rows - 1);
  const strip = "pointer-events-auto absolute touch-none border-white transition-colors";
  void page;
  return (
    <>
      {lay.xs.slice(0, -1).map((x, c) => (
        <span
          key={`c${c}`}
          data-handle
          data-strip="col"
          data-at={c}
          title="Pick this column"
          onPointerDown={(event) => pick("col", event)}
          className={`${strip} cursor-pointer ${on("col", c) ? "bg-accent" : "bg-ink/25 hover:bg-accent"}`}
          style={{
            left: x,
            width: lay.xs[c + 1] - x,
            top: px(-10),
            height: px(8),
            borderRightWidth: px(1),
            borderStyle: "solid",
          }}
        />
      ))}
      {lay.ys.slice(0, -1).map((y, r) => (
        <span
          key={`r${r}`}
          data-handle
          data-strip="row"
          data-at={r}
          title="Pick this row"
          onPointerDown={(event) => pick("row", event)}
          className={`${strip} cursor-pointer ${on("row", r) ? "bg-accent" : "bg-ink/25 hover:bg-accent"}`}
          style={{
            top: y,
            height: lay.ys[r + 1] - y,
            left: px(-10),
            width: px(8),
            borderBottomWidth: px(1),
            borderStyle: "solid",
          }}
        />
      ))}
      <AddKey
        label="Add a column"
        style={{ left: "100%", marginLeft: px(9), top: 0, width: px(16), height: "100%" }}
        onPick={() => {
          store.pickCells(table.id, { r0: 0, r1: rows - 1, c0: cols - 1, c1: cols - 1 });
          tableDo(store, "col-right");
          store.pickCells(table.id, null);
        }}
      />
      <AddKey
        label="Add a row"
        style={{ left: 0, top: "100%", marginTop: px(9), width: "100%", height: px(16) }}
        onPick={() => {
          store.pickCells(table.id, { r0: rows - 1, r1: rows - 1, c0: 0, c1: cols - 1 });
          tableDo(store, "row-below");
          store.pickCells(table.id, null);
        }}
      />
    </>
  );
}

function AddKey({ label, style, onPick }: { label: string; style: React.CSSProperties; onPick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      data-handle
      title={label}
      aria-label={label}
      onPointerDown={stop}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className="pointer-events-auto absolute grid place-items-center bg-ink/10 text-ink opacity-70 transition hover:bg-ink hover:text-white hover:opacity-100"
      style={style}
    >
      <Plus style={{ width: px(12), height: px(12) }} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

/** Around several things: they grow and shrink together. */
export function ManyFrame({ store, page, ids }: { store: EditorStore; page: Page; ids: string[] }) {
  const objects = useEditor(store, (s) => s.doc.objects);
  const list = ids.map((id) => objects[id]).filter((object): object is EditObject => Boolean(object));
  const box = unionOf(list.map((object) => objectBounds(object)));
  if (!box || list.length < 2) return null;
  const free = list.some((object) => !object.lock);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[4]"
      style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
    >
      <span className="absolute border-accent" style={{ inset: px(-6), borderWidth: px(1), borderStyle: "dashed" }} />
      {free ? (
        <>
          <Grip
            label="Move"
            left={px(-6)}
            top={px(-30)}
            tone="accent"
            cursor="move"
            onPress={(event) => startMove(store, page, ids, event)}
          >
            <Move {...ICON} />
          </Grip>
          <Grip
            label="Delete"
            slot="object-remove"
            right={px(-6)}
            top={px(-30)}
            tone="plain"
            onPick={() => store.remove(ids)}
          >
            <Trash2 {...ICON} />
          </Grip>
          {[...CORNERS, ...SIDES].map((handle) => {
            const side = handle.x === 0.5 || handle.y === 0.5;
            if (side && Math.min(box.w, box.h) * store.view.zoom < 40) return null;
            return (
              <span
                key={`${handle.x}${handle.y}`}
                data-handle
                onPointerDown={(event) => {
                  stop(event);
                  startResizeMany(store, page, ids, handle, event);
                }}
                className={`pointer-events-auto absolute touch-none border-ink bg-white ${FINGER}`}
                style={{
                  left: `${handle.x * 100}%`,
                  top: `${handle.y * 100}%`,
                  width: px(side ? (handle.x === 0.5 ? 18 : 8) : 11),
                  height: px(side ? (handle.y === 0.5 ? 18 : 8) : 11),
                  borderWidth: px(1.5),
                  borderStyle: "solid",
                  cursor: cursorOf(handle, page.rotate),
                  transform: `translate(calc(-50% + ${(handle.x - 0.5) * 12}px / var(--z)), calc(-50% + ${(handle.y - 0.5) * 12}px / var(--z)))`,
                }}
              />
            );
          })}
        </>
      ) : null}
    </div>
  );
}

/** The parts of a picture that are cropped away, faintly. */
function Uncropped({ store, object }: { store: EditorStore; object: ImageObject }) {
  const asset = store.assets.get(object.asset);
  const whole = wholePicture(object);
  if (!asset) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.url}
      alt=""
      className="absolute max-w-none opacity-30"
      style={{
        left: whole.x,
        top: whole.y,
        width: whole.w,
        height: whole.h,
        transform:
          object.flipX || object.flipY ? `scale(${object.flipX ? -1 : 1}, ${object.flipY ? -1 : 1})` : undefined,
      }}
    />
  );
}
