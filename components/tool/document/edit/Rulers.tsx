"use client";

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { UNITS } from "./engine/margins";
import { track } from "./interact";
import { pageBox, shownSize, type Margin, type Page } from "./model";
import { pagesLike } from "./pages";
import { useEditor, type EditorStore } from "./store";

const THICK = 16;

/** Along the top and the left of a page: lengths, and the margins to pull. */
export function Rulers({ store, page, zoom }: { store: EditorStore; page: Page; zoom: number }) {
  const unit = useEditor(store, (s) => s.view.prefs.unit);
  const size = shownSize(page);
  const { points } = UNITS[unit];
  const marks = useMemo(() => {
    // A labelled mark wherever there is room for one.
    const bases = unit === "pt" ? [10, 50, 100] : unit === "mm" ? [5, 10, 20, 50] : [0.5, 1, 2, 5];
    const step = bases.find((value) => value * points * zoom >= 34) ?? bases[bases.length - 1];
    const list = (length: number) => {
      const out: { at: number; label: string | null }[] = [];
      const small = step / 5;
      for (let i = 0; i * small * points <= length; i += 1) {
        const whole = i % 5 === 0;
        out.push({ at: i * small * points * zoom, label: whole ? String(Math.round(i * small * 100) / 100) : null });
      }
      return out;
    };
    return { x: list(size.w), y: list(size.h) };
  }, [unit, points, zoom, size.w, size.h]);

  const { margin } = page;
  const pulls = margin && page.rotate === 0;
  const box = pageBox(page);

  const pull = (event: ReactPointerEvent, side: keyof Margin) => {
    if (!margin) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = pagesLike(store, page);
    const key = `drag:margin:${side}:${event.timeStamp}`;
    const from = side === "left" || side === "right" ? event.clientX : event.clientY;
    const first = margin[side];
    const most = (side === "left" || side === "right" ? box.w : box.h) * 0.45;
    track(
      event,
      (next) => {
        const now = side === "left" || side === "right" ? next.clientX : next.clientY;
        const sign = side === "left" || side === "top" ? 1 : -1;
        const value = Math.max(0, Math.min(most, Math.round((first + (sign * (now - from)) / zoom) * 2) / 2));
        store.patchPages(ids, (item) => ({ margin: { ...(item.margin ?? margin), [side]: value } }), key);
      },
      () => undefined,
    );
  };

  const grip = "absolute z-[2] touch-none bg-[#1c6fb3] hover:bg-accent";
  return (
    <>
      <div
        className="absolute left-0 overflow-hidden border-b border-line-strong bg-panel"
        style={{ top: -THICK - 1, width: size.w * zoom, height: THICK }}
      >
        {margin && page.rotate === 0 ? (
          <span
            className="absolute inset-y-0 bg-white"
            style={{ left: margin.left * zoom, width: Math.max(0, (box.w - margin.left - margin.right) * zoom) }}
          />
        ) : null}
        <svg width={size.w * zoom} height={THICK} className="absolute inset-0" aria-hidden>
          {marks.x.map(({ at, label }, i) => (
            <g key={i}>
              <path d={`M${at} ${THICK}V${label ? 8 : 12}`} stroke="#57565c" strokeWidth="1" />
              {label && label !== "0" ? (
                <text x={at + 2} y={9} fontSize="8.5" fill="#57565c" className="fb-num">
                  {label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
        {pulls ? (
          <>
            <span
              title="Left margin"
              onPointerDown={(event) => pull(event, "left")}
              className={`${grip} cursor-ew-resize`}
              style={{ left: margin.left * zoom - 3, top: 0, width: 6, height: THICK }}
            />
            <span
              title="Right margin"
              onPointerDown={(event) => pull(event, "right")}
              className={`${grip} cursor-ew-resize`}
              style={{ left: (box.w - margin.right) * zoom - 3, top: 0, width: 6, height: THICK }}
            />
          </>
        ) : null}
      </div>
      <div
        className="absolute top-0 overflow-hidden border-r border-line-strong bg-panel"
        style={{ left: -THICK - 1, width: THICK, height: size.h * zoom }}
      >
        {margin && page.rotate === 0 ? (
          <span
            className="absolute inset-x-0 bg-white"
            style={{ top: margin.top * zoom, height: Math.max(0, (box.h - margin.top - margin.bottom) * zoom) }}
          />
        ) : null}
        <svg width={THICK} height={size.h * zoom} className="absolute inset-0" aria-hidden>
          {marks.y.map(({ at, label }, i) => (
            <g key={i}>
              <path d={`M${THICK} ${at}H${label ? 8 : 12}`} stroke="#57565c" strokeWidth="1" />
              {label && label !== "0" ? (
                <text
                  x={9}
                  y={at + 2}
                  fontSize="8.5"
                  fill="#57565c"
                  className="fb-num"
                  transform={`rotate(-90 9 ${at + 2})`}
                  textAnchor="end"
                >
                  {label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
        {pulls ? (
          <>
            <span
              title="Top margin"
              onPointerDown={(event) => pull(event, "top")}
              className={`${grip} cursor-ns-resize`}
              style={{ top: margin.top * zoom - 3, left: 0, height: 6, width: THICK }}
            />
            <span
              title="Bottom margin"
              onPointerDown={(event) => pull(event, "bottom")}
              className={`${grip} cursor-ns-resize`}
              style={{ top: (box.h - margin.bottom) * zoom - 3, left: 0, height: 6, width: THICK }}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
