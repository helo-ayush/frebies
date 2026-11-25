"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { Move, RotateCw } from "lucide-react";
import type { EditObject, ImageObject, Page } from "./model";
import {
  lineEnds,
  startCrop,
  startEnd,
  startMove,
  startResize,
  startTurn,
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

/** Handles around what is selected. Sizes stay the same at every zoom. */
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
  const line = object.type === "shape" && (object.kind === "line" || object.kind === "arrow");
  const stop = (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const px = (value: number) => `calc(${value}px / var(--z))`;

  if (line) {
    return (
      <>
        {lineEnds(object).map((end, i) => (
          <span
            key={i}
            data-handle
            onPointerDown={(event) => {
              stop(event);
              startEnd(store, page, id, i as 0 | 1, event);
            }}
            className="pointer-events-auto absolute z-[4] cursor-crosshair touch-none border-ink bg-white"
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
        ))}
      </>
    );
  }

  const text = object.type === "text";
  const handles = !alone
    ? []
    : text
      ? [...CORNERS, SIDES[1], SIDES[3]]
      : object.type === "mark" || object.type === "ink"
        ? object.type === "ink"
          ? CORNERS
          : []
        : [...CORNERS, ...SIDES];
  const small = Math.min(object.w, object.h) * store.view.zoom < 34;

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
        style={{ inset: px(text ? -4 : -1), borderWidth: px(1.5), borderStyle: editing ? "dashed" : "solid" }}
      />
      {crop && object.type === "image" ? <Uncropped store={store} object={object} /> : null}
      {text && alone ? (
        <span
          data-handle
          title="Move"
          onPointerDown={(event) => {
            stop(event);
            startMove(store, page, [id], event);
          }}
          className="pointer-events-auto absolute z-[2] grid cursor-move touch-none place-items-center bg-accent-deep text-white"
          style={{ left: px(-4), top: px(-32), width: px(26), height: px(24) }}
        >
          <Move aria-hidden style={{ width: px(13), height: px(13) }} strokeWidth={2} />
        </span>
      ) : null}
      {/* The edge of a text box moves it while the inside is being typed in. */}
      {text && editing
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
      {handles.map((handle) => {
        const side = handle.x === 0.5 || handle.y === 0.5;
        if (side && small && !text) return null;
        return (
          <span
            key={`${handle.x}${handle.y}`}
            data-handle
            onPointerDown={(event) => {
              stop(event);
              if (crop) startCrop(store, page, id, handle, event);
              else startResize(store, page, id, handle, event);
            }}
            className="pointer-events-auto absolute touch-none border-ink bg-white [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[calc(-9px/var(--z))] [@media(pointer:coarse)]:before:content-['']"
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
      {alone && !crop && object.type !== "mark" && object.type !== "link" && object.type !== "field" ? (
        <span
          data-handle
          title="Turn"
          onPointerDown={(event) => {
            stop(event);
            startTurn(store, page, id, event);
          }}
          className="pointer-events-auto absolute z-[2] grid cursor-grab touch-none place-items-center bg-ink text-white"
          style={{
            left: text ? px(37) : "50%",
            top: px(text ? -32 : -36),
            width: px(26),
            height: px(24),
            transform: "translateX(-50%)",
          }}
        >
          <RotateCw aria-hidden style={{ width: px(13), height: px(13) }} strokeWidth={2} />
        </span>
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
