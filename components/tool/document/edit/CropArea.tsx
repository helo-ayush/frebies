"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { toPage, track, type Handle } from "./interact";
import { pageBox, type Page } from "./model";
import type { Box } from "./engine/matrix";
import type { EditorStore } from "./store";

const HANDLES: Handle[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 0.5 },
  { x: 1, y: 1 },
  { x: 0.5, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0.5 },
];

const px = (value: number) => `calc(${value}px / var(--z))`;

/** What will be left of a page: move it, pull its edges. */
export function CropArea({ store, page, box }: { store: EditorStore; page: Page; box: Box }) {
  const whole = pageBox(page);
  const set = (next: Box) => store.setView({ cropArea: { page: page.id, box: next } });

  const move = (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const from = toPage(store, page, event.clientX, event.clientY);
    track(
      event,
      (next) => {
        const p = toPage(store, page, next.clientX, next.clientY);
        const x = Math.max(whole.x, Math.min(whole.x + whole.w - box.w, box.x + p.x - from.x));
        const y = Math.max(whole.y, Math.min(whole.y + whole.h - box.h, box.y + p.y - from.y));
        set({ ...box, x, y });
      },
      () => undefined,
    );
  };
  const pull = (event: ReactPointerEvent, handle: Handle) => {
    event.preventDefault();
    event.stopPropagation();
    track(
      event,
      (next) => {
        const p = toPage(store, page, next.clientX, next.clientY);
        let x0 = box.x;
        let y0 = box.y;
        let x1 = box.x + box.w;
        let y1 = box.y + box.h;
        // Pulled past the paper, room is added around it.
        if (handle.x === 0) x0 = Math.min(p.x, x1 - 20);
        if (handle.x === 1) x1 = Math.max(p.x, x0 + 20);
        if (handle.y === 0) y0 = Math.min(p.y, y1 - 20);
        if (handle.y === 1) y1 = Math.max(p.y, y0 + 20);
        const near = 5 / store.view.zoom;
        if (Math.abs(x0 - whole.x) < near) x0 = whole.x;
        if (Math.abs(y0 - whole.y) < near) y0 = whole.y;
        if (Math.abs(x1 - whole.x - whole.w) < near) x1 = whole.x + whole.w;
        if (Math.abs(y1 - whole.y - whole.h) < near) y1 = whole.y + whole.h;
        set({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      },
      () => undefined,
    );
  };

  return (
    <div
      className="pointer-events-auto absolute z-[6] cursor-move touch-none border-accent"
      onPointerDown={move}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderWidth: px(1.5),
        borderStyle: "solid",
        boxShadow: "0 0 0 9999px rgba(29,28,31,0.42)",
        clipPath: "inset(-9999px)",
      }}
    >
      {HANDLES.map((handle) => (
        <span
          key={`${handle.x}${handle.y}`}
          onPointerDown={(event) => pull(event, handle)}
          className="absolute touch-none border-ink bg-white [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[calc(-9px/var(--z))] [@media(pointer:coarse)]:before:content-['']"
          style={{
            left: `${handle.x * 100}%`,
            top: `${handle.y * 100}%`,
            width: px(handle.x === 0.5 ? 18 : 12),
            height: px(handle.y === 0.5 ? 18 : 12),
            borderWidth: px(1.5),
            borderStyle: "solid",
            transform: "translate(-50%, -50%)",
            cursor:
              handle.x === 0.5
                ? "ns-resize"
                : handle.y === 0.5
                  ? "ew-resize"
                  : handle.x === handle.y
                    ? "nwse-resize"
                    : "nesw-resize",
          }}
        />
      ))}
    </div>
  );
}
