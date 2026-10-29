"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cropPixels, cropRatioValue, type CropRatioId, type CropRect } from "./model";

type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type DragState = {
  mode: DragMode;
  startX: number;
  startY: number;
  base: CropRect;
  width: number;
  height: number;
};

const MIN_CROP = 0.04;

const CORNERS: { mode: DragMode; label: string; className: string; cursor: string }[] = [
  {
    mode: "nw",
    label: "Resize from top left",
    className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nwse-resize",
  },
  {
    mode: "ne",
    label: "Resize from top right",
    className: "left-full top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nesw-resize",
  },
  {
    mode: "sw",
    label: "Resize from bottom left",
    className: "left-0 top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nesw-resize",
  },
  {
    mode: "se",
    label: "Resize from bottom right",
    className: "left-full top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-nwse-resize",
  },
];

const EDGES: { mode: DragMode; label: string; className: string; cursor: string }[] = [
  {
    mode: "n",
    label: "Resize from the top",
    className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ns-resize",
  },
  {
    mode: "s",
    label: "Resize from the bottom",
    className: "left-1/2 top-full -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ns-resize",
  },
  {
    mode: "w",
    label: "Resize from the left",
    className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ew-resize",
  },
  {
    mode: "e",
    label: "Resize from the right",
    className: "left-full top-1/2 -translate-x-1/2 -translate-y-1/2",
    cursor: "cursor-ew-resize",
  },
];

export function CropCanvas({
  src,
  naturalWidth,
  naturalHeight,
  crop,
  ratioId,
  onChange,
  className = "",
}: {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropRect;
  ratioId: CropRatioId;
  onChange: (crop: CropRect) => void;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [rect, setRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const measure = useCallback(() => {
    const image = imageRef.current;
    const frame = frameRef.current;
    if (!image || !frame) return;
    const imageRect = image.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    if (imageRect.width < 2 || imageRect.height < 2) return;
    setRect({
      left: imageRect.left - frameRect.left,
      top: imageRect.top - frameRect.top,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [src, measure]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (imageRef.current) observer.observe(imageRef.current);
    window.addEventListener("resize", measure);
    const raf = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, [measure]);

  const imageAspect = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
  const ratio = cropRatioValue(ratioId);
  const normRatio = ratio ? ratio / imageAspect : null;
  const pixels = cropPixels(crop, naturalWidth || 1, naturalHeight || 1);

  function startDrag(event: ReactPointerEvent<HTMLElement>, mode: DragMode) {
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    overlayRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      base: crop,
      width: rect.width,
      height: rect.height,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const dx = (event.clientX - drag.startX) / drag.width;
    const dy = (event.clientY - drag.startY) / drag.height;
    onChange(nextCrop(drag.base, drag.mode, dx, dy, normRatio));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    onChange({
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    });
  }

  return (
    <div
      ref={frameRef}
      className={`relative flex h-full w-full items-center justify-center px-4 pb-4 pt-10 ${className}`}
    >
      <img
        ref={imageRef}
        src={src}
        alt="Crop source"
        draggable={false}
        onLoad={measure}
        className="max-h-full max-w-full select-none object-contain"
      />

      {rect.width > 0 && (
        <div
          ref={overlayRef}
          className="absolute z-20 touch-none select-none"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          <div
            role="group"
            aria-label={`Crop area, ${pixels.width} by ${pixels.height} pixels. Use arrow keys to move.`}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            tabIndex={0}
            onPointerDown={(event) => startDrag(event, "move")}
            onKeyDown={onKeyDown}
            className="absolute z-10 cursor-move border border-white/90 shadow-[0_0_0_9999px_rgba(15,15,16,0.46)] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
          >
            <ThirdsGrid />

            <span className="pointer-events-none absolute left-1.5 top-1.5 select-none rounded-[3px] bg-ink/70 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-white backdrop-blur-sm">
              {pixels.width} × {pixels.height}
            </span>

            {CORNERS.map((corner) => (
              <CropHandle
                key={corner.mode}
                mode={corner.mode}
                label={corner.label}
                className={corner.className}
                cursor={corner.cursor}
                onPointerDown={startDrag}
              />
            ))}

            {ratioId === "free" &&
              EDGES.map((edge) => (
                <CropHandle
                  key={edge.mode}
                  mode={edge.mode}
                  label={edge.label}
                  className={edge.className}
                  cursor={edge.cursor}
                  onPointerDown={startDrag}
                  edge
                />
              ))}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/60 bg-ink/65 px-2.5 py-1 text-[9.5px] font-medium text-white backdrop-blur-sm">
        Drag to move · handles to resize
      </div>
    </div>
  );
}

function CropHandle({
  mode,
  label,
  className,
  cursor,
  onPointerDown,
  edge = false,
}: {
  mode: DragMode;
  label: string;
  className: string;
  cursor: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, mode: DragMode) => void;
  edge?: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onPointerDown={(event) => onPointerDown(event, mode)}
      className={`absolute grid h-6 w-6 touch-none place-items-center ${className} ${cursor}`}
    >
      <span
        className={`rounded-[2px] border border-ink bg-white shadow-sm ${
          edge ? "h-1 w-4" : "h-2.5 w-2.5"
        }`}
      />
    </button>
  );
}

function ThirdsGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
      <span className="absolute inset-y-0 right-1/3 w-px bg-white/40" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
      <span className="absolute inset-x-0 bottom-1/3 h-px bg-white/40" />
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextCrop(
  base: CropRect,
  mode: DragMode,
  dx: number,
  dy: number,
  normRatio: number | null,
): CropRect {
  if (mode === "move") {
    return {
      ...base,
      x: clamp(base.x + dx, 0, 1 - base.width),
      y: clamp(base.y + dy, 0, 1 - base.height),
    };
  }

  if (!normRatio) {
    let left = base.x;
    let top = base.y;
    let right = base.x + base.width;
    let bottom = base.y + base.height;

    if (mode.includes("w")) left = clamp(base.x + dx, 0, right - MIN_CROP);
    if (mode.includes("e")) right = clamp(base.x + base.width + dx, left + MIN_CROP, 1);
    if (mode.includes("n")) top = clamp(base.y + dy, 0, bottom - MIN_CROP);
    if (mode.includes("s")) bottom = clamp(base.y + base.height + dy, top + MIN_CROP, 1);

    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // Fixed ratio: corner handles only. Anchor the opposite corner and derive
  // the width from whichever pointer axis moved the most.
  const west = mode.includes("w");
  const north = mode.includes("n");
  const anchorX = west ? base.x + base.width : base.x;
  const anchorY = north ? base.y + base.height : base.y;
  const cornerX = west ? base.x : base.x + base.width;
  const cornerY = north ? base.y : base.y + base.height;
  const pointerX = cornerX + dx;
  const pointerY = cornerY + dy;

  const desiredWidth = Math.abs(pointerX - anchorX);
  const desiredFromHeight = Math.abs(pointerY - anchorY) * normRatio;
  const maxWidth = Math.min(west ? anchorX : 1 - anchorX, (north ? anchorY : 1 - anchorY) * normRatio);
  const minWidth = Math.min(maxWidth, Math.max(MIN_CROP, MIN_CROP * normRatio));
  const width = clamp(Math.max(desiredWidth, desiredFromHeight), minWidth, maxWidth);
  const height = width / normRatio;
  const x = west ? anchorX - width : anchorX;
  const y = north ? anchorY - height : anchorY;

  return {
    x: clamp(x, 0, 1 - width),
    y: clamp(y, 0, 1 - height),
    width,
    height,
  };
}
