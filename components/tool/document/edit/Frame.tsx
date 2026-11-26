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

/** A small key that stays the same size at every zoom. It sits in a row of keys above what is picked. */
function Grip({
  label,
  tone,
  cursor = "pointer",
  onPress,
  onPick,
  slot,
  children,
}: {
  label: string;
  tone: "accent" | "plain" | "danger";
  cursor?: string;
  onPress?: (event: ReactPointerEvent) => void;
  onPick?: () => void;
  slot?: string;
  children: ReactNode;
}) {
  const look =
    tone === "accent"
      ? "bg-accent-deep text-white hover:bg-accent"
      : tone === "danger"
        ? "border-line-strong bg-white text-ink hover:border-danger hover:bg-danger-soft hover:text-danger"
        : "border-line-strong bg-white text-ink hover:border-ink hover:text-accent-deep";
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
      className={`pointer-events-auto relative grid shrink-0 touch-none place-items-center transition-colors ${look} ${FINGER}`}
      style={{
        width: px(24),
        height: px(22),
        cursor,
        borderWidth: tone === "accent" ? 0 : px(1),
        borderStyle: "solid",
      }}
    >
      {children}
    </button>
  );
}

/** A row of keys over the top edge of what is picked. It never lies on the thing itself. */
function Keys({
  children,
  at,
  out,
  side = out,
}: {
  children: ReactNode;
  /** Which end of the top edge the row keeps to. */
  at: "left" | "right" | "middle";
  /** How far the frame stands off the top, and off the sides. */
  out: number;
  side?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-[5] flex"
      style={{
        bottom: "100%",
        marginBottom: px(6 + out),
        gap: px(3),
        ...(at === "left"
          ? { left: px(-side) }
          : at === "right"
            ? { right: px(-side) }
            : { left: "50%", transform: "translateX(-50%)" }),
      }}
    >
      {children}
    </div>
  );
}

/** The keys a pointer finds over a text before it is picked: the one that moves it. */
export function HoverMove() {
  return (
    <span
      aria-hidden
      data-grip
      className="pointer-events-auto absolute z-[5] hidden place-items-center bg-accent-deep text-white group-hover/move:grid"
      style={{ left: px(-4), bottom: "100%", marginBottom: px(6), width: px(24), height: px(22), cursor: "move" }}
    >
      <Move style={{ width: px(12), height: px(12) }} strokeWidth={2} aria-hidden />
    </span>
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
                className={`pointer-events-auto absolute z-[4] cursor-crosshair touch-none border-accent-deep bg-white ${FINGER}`}
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
            <div className="absolute flex" style={{ left: px(10), bottom: px(8) }}>
              {locked ? (
                <Grip label="Unlock" tone="plain" onPick={() => store.patch(id, { lock: undefined })}>
                  <Lock {...ICON} />
                </Grip>
              ) : (
                <Grip label="Delete" slot="object-remove" tone="danger" onPick={() => store.remove([id])}>
                  <Trash2 {...ICON} />
                </Grip>
              )}
            </div>
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
  const zoom = store.view.zoom;
  const small = Math.min(object.w, object.h) * zoom < 34;
  // On something small the handles step out, so they neither cover it nor each other.
  const least = text ? 22 : 40;
  const pushX = Math.max(0, (least - object.w * zoom) / 2);
  const pushY = Math.max(0, (least - object.h * zoom) / 2);
  const narrow = object.w * zoom < 96;
  const turns =
    !locked &&
    !crop &&
    !table &&
    object.type !== "mark" &&
    object.type !== "link" &&
    object.type !== "field" &&
    object.type !== "note";
  const base = text ? 4 : 1;
  const out = base + pushY;
  const side = base + pushX;

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
        style={{
          left: px(-side),
          right: px(-side),
          top: px(-out),
          bottom: px(-out),
          borderWidth: px(1.5),
          borderStyle: editing || locked ? "dashed" : "solid",
        }}
      />
      {crop && object.type === "image" ? <Uncropped store={store} object={object} /> : null}
      {alone ? (
        <FrameKeys
          store={store}
          page={page}
          id={id}
          locked={locked}
          moves={(text || table) && !locked}
          turns={turns}
          removes={!locked && !crop}
          split={(text || table) && !narrow}
          out={out}
          side={side}
        />
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
            className={`pointer-events-auto absolute touch-none border-accent-deep bg-white ${FINGER}`}
            style={{
              left: `${handle.x * 100}%`,
              top: `${handle.y * 100}%`,
              width: px(side ? (handle.x === 0.5 ? 18 : 8) : 11),
              height: px(side ? (handle.y === 0.5 ? 18 : 8) : 11),
              borderWidth: px(1.5),
              borderStyle: "solid",
              cursor: cursorOf(handle, object.angle + page.rotate),
              transform: `translate(calc(-50% + ${(handle.x - 0.5) * 2 * ((text ? 4 : 0) + pushX)}px / var(--z)), calc(-50% + ${(handle.y - 0.5) * 2 * ((text ? 4 : 0) + pushY)}px / var(--z)))`,
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
    </div>
  );
}

/** Move, turn and delete above what is picked: split to the two ends of a wide box, in one row over a narrow one. */
function FrameKeys({
  store,
  page,
  id,
  locked,
  moves,
  turns,
  removes,
  split,
  out,
  side,
}: {
  store: EditorStore;
  page: Page;
  id: string;
  locked: boolean;
  moves: boolean;
  turns: boolean;
  removes: boolean;
  split: boolean;
  out: number;
  side: number;
}) {
  const move = moves ? (
    <Grip label="Move" tone="accent" cursor="move" onPress={(event) => startMove(store, page, [id], event)}>
      <Move {...ICON} />
    </Grip>
  ) : null;
  const turn = turns ? (
    <Grip label="Turn" tone="plain" cursor="grab" onPress={(event) => startTurn(store, page, id, event)}>
      <RotateCw {...ICON} />
    </Grip>
  ) : null;
  const end = locked ? (
    <Grip label="Unlock" tone="plain" onPick={() => store.patch(id, { lock: undefined })}>
      <Lock {...ICON} />
    </Grip>
  ) : removes ? (
    <Grip label="Delete" slot="object-remove" tone="danger" onPick={() => store.remove([id])}>
      <Trash2 {...ICON} />
    </Grip>
  ) : null;
  if (split)
    return (
      <>
        {move || turn ? (
          <Keys at="left" out={out} side={side}>
            {move}
            {turn}
          </Keys>
        ) : null}
        {end ? (
          <Keys at="right" out={out} side={side}>
            {end}
          </Keys>
        ) : null}
      </>
    );
  return (
    <Keys at="middle" out={out}>
      {move}
      {turn}
      {end}
    </Keys>
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
      className="pointer-events-auto absolute grid place-items-center bg-ink/[0.06] text-ink opacity-70 transition hover:bg-accent/15 hover:text-accent-deep hover:opacity-100"
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
          <Keys at={box.w * store.view.zoom < 96 ? "middle" : "left"} out={6}>
            <Grip label="Move" tone="accent" cursor="move" onPress={(event) => startMove(store, page, ids, event)}>
              <Move {...ICON} />
            </Grip>
            {box.w * store.view.zoom < 96 ? (
              <Grip label="Delete" slot="object-remove" tone="danger" onPick={() => store.remove(ids)}>
                <Trash2 {...ICON} />
              </Grip>
            ) : null}
          </Keys>
          {box.w * store.view.zoom < 96 ? null : (
            <Keys at="right" out={6}>
              <Grip label="Delete" slot="object-remove" tone="danger" onPick={() => store.remove(ids)}>
                <Trash2 {...ICON} />
              </Grip>
            </Keys>
          )}
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
                className={`pointer-events-auto absolute touch-none border-accent-deep bg-white ${FINGER}`}
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
