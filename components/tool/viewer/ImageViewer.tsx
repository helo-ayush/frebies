"use client";

/**
 * The image viewing window used by every image tool: rulers in image pixels, a
 * checker behind transparency, zoom and pan by mouse, trackpad, touch and
 * keyboard, a before/after wipe, and a full-window mode.
 *
 * The result, the original and the wipe always share one rectangle on screen,
 * so switching between them never moves the picture.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Grid2x2, Maximize, Minus, Plus, X } from "lucide-react";
import { ToolTabs } from "@/components/tool/kit";

export type ViewSource = {
  src: string;
  width: number;
  height: number;
  /** Short name on the tag: "Original", "WebP". */
  label: string;
  /** After the name: usually the file size. */
  note?: string;
  alt?: string;
  /** How the picture sits in its own frame; only matters when their shapes differ. */
  objectFit?: "contain" | "cover" | "fill";
  /** Painted behind the picture instead of the checker. */
  backdrop?: string;
};

export type ViewMode = "after" | "before" | "compare";

const MIN_Z = 0.02;
const MAX_Z = 32;
/** Never blow a tiny image up past this just to fill the window. */
const MAX_FIT = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type View = { z: number | null; x: number; y: number };
const FIT: View = { z: null, x: 0, y: 0 };

type Gesture = {
  kind: "pan" | "split" | "pinch";
  x: number;
  y: number;
  viewX: number;
  viewY: number;
  z: number;
  dist: number;
};

/** Result / Original / Compare, for the bar above the viewer. */
export function ViewTabs({
  mode,
  onChange,
  afterLabel = "Result",
  beforeLabel = "Original",
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  afterLabel?: string;
  beforeLabel?: string;
}) {
  return (
    <ToolTabs
      label="Preview"
      value={mode}
      onChange={onChange}
      options={[
        { value: "after", label: afterLabel },
        { value: "before", label: beforeLabel },
        { value: "compare", label: "Compare" },
      ]}
    />
  );
}

export function ImageViewer({
  before,
  after = null,
  mode = "after",
  onModeChange,
  busy = false,
  busyLabel,
  dragging = false,
  dropLabel = "Drop to add",
  title,
  inDialog = false,
  className = "",
  children,
}: {
  before: ViewSource;
  after?: ViewSource | null;
  mode?: ViewMode;
  /** Lets the full-window bar offer the same Result / Original / Compare tabs. */
  onModeChange?: (mode: ViewMode) => void;
  /** Sweeps a scan line over the picture. */
  busy?: boolean;
  busyLabel?: string;
  /** A file is being held over the stage. */
  dragging?: boolean;
  dropLabel?: string;
  /** Shown in the full-window bar. */
  title?: string;
  /** Already filling a dialog: no full-window key, and a plain wheel zooms. */
  inDialog?: boolean;
  className?: string;
  /** Extra overlay inside the viewport. */
  children?: ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(FIT);
  const [split, setSplit] = useState(0.5);
  const [checker, setChecker] = useState(true);
  const [full, setFull] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const help = useId();

  const portRef = useRef<HTMLDivElement | null>(null);
  const crossX = useRef<HTMLSpanElement | null>(null);
  const crossY = useRef<HTMLSpanElement | null>(null);
  const readout = useRef<HTMLSpanElement | null>(null);

  const shownMode: ViewMode = after ? mode : "before";
  const reference = after ?? before;
  const current = shownMode === "before" ? before : reference;

  useLayoutEffect(() => {
    const node = portRef.current;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A different picture starts from fit; a new render of the same one keeps its place.
  useEffect(() => setView(FIT), [before.src]);

  const pad = box.w < 520 ? 14 : 34;
  const narrow = box.w > 0 && box.w < 440;
  const fit =
    box.w > 0 && box.h > 0
      ? clamp(
          Math.min(
            (box.w - pad * 2) / Math.max(1, reference.width),
            (box.h - pad * 2) / Math.max(1, reference.height),
          ),
          MIN_Z,
          MAX_FIT,
        )
      : 0;
  const z = view.z ?? fit;
  const w = reference.width * z;
  const h = reference.height * z;
  const left = (box.w - w) / 2 + view.x;
  const top = (box.h - h) / 2 + view.y;
  const zoomed = view.z !== null;
  /** Screen pixels per pixel of the picture that is actually showing. */
  const scale = w / Math.max(1, current.width);
  const pixelated = scale >= 2;

  const bound = useCallback(
    (next: View): View => {
      if (next.z === null) return FIT;
      const limitX = Math.max(0, (reference.width * next.z - box.w) / 2 + 48);
      const limitY = Math.max(0, (reference.height * next.z - box.h) / 2 + 48);
      return { z: next.z, x: clamp(next.x, -limitX, limitX), y: clamp(next.y, -limitY, limitY) };
    },
    [box.h, box.w, reference.height, reference.width],
  );

  /** Zoom to `next` keeping the point (px, py), in viewport pixels, where it is. */
  const zoomTo = useCallback(
    (next: number, px?: number, py?: number) => {
      setView((from) => {
        const z1 = from.z ?? fit;
        const z2 = clamp(next, MIN_Z, MAX_Z);
        if (!z1) return from;
        const cx = (px ?? box.w / 2) - box.w / 2;
        const cy = (py ?? box.h / 2) - box.h / 2;
        const k = z2 / z1;
        return bound({ z: z2, x: cx - (cx - from.x) * k, y: cy - (cy - from.y) * k });
      });
    },
    [bound, box.h, box.w, fit],
  );

  const actual = current.width / Math.max(1, reference.width);

  // Ctrl + wheel (and trackpad pinch) zooms. A plain wheel keeps scrolling the
  // page, except in the full window, where there is nothing else to scroll.
  const wheelState = useRef({ z, full: full || inDialog, zoomTo });
  wheelState.current = { z, full: full || inDialog, zoomTo };
  useEffect(() => {
    const node = portRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      const state = wheelState.current;
      if (!event.ctrlKey && !event.metaKey && !state.full) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const step = Math.exp(-clamp(event.deltaY, -120, 120) * (event.ctrlKey ? 0.0075 : 0.0032));
      state.zoomTo(state.z * step, event.clientX - rect.left, event.clientY - rect.top);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // ---- Pointer: pan, pinch and the wipe --------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const visLeft = Math.max(0, left);
  const visRight = Math.min(box.w, left + w);
  const splitX = visLeft + (visRight - visLeft) * split;

  function local(event: ReactPointerEvent) {
    const rect = portRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function moveSplit(x: number) {
    const span = visRight - visLeft;
    if (span > 0) setSplit(clamp((x - visLeft) / span, 0, 1));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        viewX: view.x,
        viewY: view.y,
        z,
        dist: Math.hypot(a.x - b.x, a.y - b.y),
      };
      portRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    const base = { x: point.x, y: point.y, viewX: view.x, viewY: view.y, z, dist: 0 };
    const onHandle = (event.target as HTMLElement).closest("[data-split-handle]");
    if (shownMode === "compare" && (onHandle || !zoomed)) {
      gesture.current = { kind: "split", ...base };
      moveSplit(point.x);
    } else if (zoomed) {
      gesture.current = { kind: "pan", ...base };
      setGrabbing(true);
    } else {
      return;
    }
    portRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const point = local(event);
    trackCursor(point.x, point.y);
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, point);
    const active = gesture.current;
    if (!active) return;

    if (active.kind === "split") {
      moveSplit(point.x);
    } else if (active.kind === "pan") {
      setView(bound({ z: active.z, x: active.viewX + point.x - active.x, y: active.viewY + point.y - active.y }));
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const z2 = clamp(active.z * (dist / Math.max(1, active.dist)), MIN_Z, MAX_Z);
      const k = z2 / active.z;
      const cx = active.x - box.w / 2;
      const cy = active.y - box.h / 2;
      const mx = (a.x + b.x) / 2 - active.x;
      const my = (a.y + b.y) / 2 - active.y;
      setView(
        z2 <= fit
          ? FIT
          : bound({ z: z2, x: cx - (cx - active.viewX) * k + mx, y: cy - (cy - active.viewY) * k + my }),
      );
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
    setGrabbing(false);
  }

  function trackCursor(x: number, y: number) {
    if (crossX.current) crossX.current.style.transform = `translateX(${x}px)`;
    if (crossY.current) crossY.current.style.transform = `translateY(${y}px)`;
    if (readout.current) {
      const px = Math.floor((x - left) / scale);
      const py = Math.floor((y - top) / scale);
      const inside = px >= 0 && py >= 0 && px < current.width && py < current.height;
      readout.current.textContent = inside ? `X ${px}   Y ${py}` : "";
    }
  }

  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,[data-split-handle]")) return;
    if (zoomed) {
      setView(FIT);
      return;
    }
    const rect = portRef.current!.getBoundingClientRect();
    const target = actual > fit * 1.05 ? actual : fit * 2;
    zoomTo(target, event.clientX - rect.left, event.clientY - rect.top);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const pan = (dx: number, dy: number) =>
      setView((from) => (from.z === null ? from : bound({ z: from.z, x: from.x + dx, y: from.y + dy })));
    switch (event.key) {
      case "+":
      case "=":
        zoomTo(z * 1.25);
        break;
      case "-":
      case "_":
        zoomTo(z / 1.25);
        break;
      case "0":
        setView(FIT);
        break;
      case "1":
        zoomTo(actual);
        break;
      case "ArrowLeft":
        if (!zoomed) return;
        pan(60, 0);
        break;
      case "ArrowRight":
        if (!zoomed) return;
        pan(-60, 0);
        break;
      case "ArrowUp":
        if (!zoomed) return;
        pan(0, 60);
        break;
      case "ArrowDown":
        if (!zoomed) return;
        pan(0, -60);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ---- Full window ------------------------------------------------------------
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFull(false);
      }
    };
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey, true);
    portRef.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [full]);

  const clip = w > 0 ? clamp((splitX - left) / w, 0, 1) * 100 : 50;
  const percent = Math.round(scale * 100);
  const backing = checker ? "fb-checker" : "bg-white";

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${
        full ? "fixed inset-0 z-[80] bg-canvas" : "relative max-lg:min-h-[max(320px,44svh)]"
      } ${className}`}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label={full ? "Image viewer" : undefined}
    >
      {full ? (
        <div className="flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel py-2 pl-5 pr-3">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title ?? current.label}</p>
          {after && onModeChange ? (
            <ViewTabs mode={mode} onChange={onModeChange} afterLabel={after.label} beforeLabel={before.label} />
          ) : null}
          <button
            type="button"
            onClick={() => setFull(false)}
            aria-label="Close full window"
            data-slot="viewer-close"
            className="grid h-10 w-10 place-items-center bg-ink text-white transition-colors hover:bg-accent-deep"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] sm:grid-cols-[22px_minmax(0,1fr)] sm:grid-rows-[22px_minmax(0,1fr)]">
        <span aria-hidden className="hidden border-b border-r border-line bg-panel sm:block" />
        <Ruler axis="x" length={box.w} origin={left} scale={scale} extent={current.width} crossRef={crossX} />
        <Ruler axis="y" length={box.h} origin={top} scale={scale} extent={current.height} crossRef={crossY} />

        <div
          ref={portRef}
          tabIndex={0}
          role="group"
          aria-label={`Image viewer, ${current.alt ?? current.label}`}
          aria-describedby={help}
          data-slot="image-viewer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          className="fb-stage group/view relative min-h-0 min-w-0 select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          style={{
            touchAction: zoomed ? "none" : "pan-y",
            cursor: zoomed ? (grabbing ? "grabbing" : "grab") : shownMode === "compare" ? "ew-resize" : "default",
          }}
        >
          <p id={help} className="sr-only">
            Plus and minus zoom, zero fits, one shows actual size, arrow keys move a zoomed image.
          </p>

          {box.w > 0 ? (
            <div
              className={`absolute left-0 top-0 ${backing}`}
              style={{
                width: w,
                height: h,
                transform: `translate(${left}px, ${top}px)`,
                boxShadow: "0 0 0 1px rgba(24,24,27,.22)",
              }}
            >
              {shownMode !== "after" || !after ? (
                <img
                  src={before.src}
                  alt={before.alt ?? before.label}
                  draggable={false}
                  className="absolute inset-0 h-full w-full max-w-none"
                  style={{
                    imageRendering: pixelated ? "pixelated" : "auto",
                    objectFit: before.objectFit ?? "contain",
                    background: before.backdrop,
                  }}
                />
              ) : null}
              {after && shownMode !== "before" ? (
                <img
                  src={after.src}
                  alt={after.alt ?? after.label}
                  draggable={false}
                  className={`absolute inset-0 h-full w-full max-w-none ${shownMode === "compare" ? backing : ""}`}
                  style={{
                    imageRendering: pixelated ? "pixelated" : "auto",
                    objectFit: after.objectFit ?? "contain",
                    background: after.backdrop,
                    clipPath: shownMode === "compare" ? `inset(0 0 0 ${clip}%)` : undefined,
                  }}
                />
              ) : null}
              {busy ? (
                <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                  <span className="absolute inset-0 bg-canvas/30" />
                  <span className="fb-scanline absolute inset-x-0 top-0 h-full" />
                </span>
              ) : null}
            </div>
          ) : null}

          {/* The wipe */}
          {after && shownMode === "compare" && box.w > 0 ? (
            <div
              data-split-handle
              role="slider"
              tabIndex={0}
              aria-label={`Compare ${before.label} with ${after.label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split * 100)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.1 : 0.02;
                if (event.key === "ArrowLeft") setSplit((value) => clamp(value - step, 0, 1));
                else if (event.key === "ArrowRight") setSplit((value) => clamp(value + step, 0, 1));
                else if (event.key === "Home") setSplit(0);
                else if (event.key === "End") setSplit(1);
                else return;
                event.preventDefault();
              }}
              className="group/handle absolute inset-y-0 z-[2] w-11 -translate-x-1/2 cursor-ew-resize outline-none"
              style={{ left: splitX, touchAction: "none" }}
            >
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-accent" />
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center bg-accent-deep text-white transition-colors group-hover/handle:bg-ink group-focus-visible/handle:bg-ink"
              >
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M6 1 1 6l5 5M14 1l5 5-5 5M1 6h18" />
                </svg>
              </span>
            </div>
          ) : null}

          {/* Tags */}
          {after && shownMode === "compare" ? (
            <>
              <Tag source={before} className="left-3 top-3" bare={narrow} />
              <Tag source={after} className="right-3 top-3" loud bare={narrow} />
            </>
          ) : (
            <Tag source={current} className="left-3 top-3" loud={Boolean(after) && shownMode === "after"} />
          )}
          {busy ? (
            <span
              role="status"
              className={`absolute right-3 z-[3] inline-flex h-7 items-center gap-2 bg-accent-deep px-2.5 text-[12px] font-semibold uppercase text-white ${
                after && shownMode === "compare" ? "top-12" : "top-3"
              }`}
            >
              <span aria-hidden className="fb-blink h-2 w-2 bg-white" />
              {busyLabel ?? "Working"}
            </span>
          ) : null}

          {/* Pixel under the pointer */}
          <span
            ref={readout}
            aria-hidden
            className="fb-num pointer-events-none absolute bottom-3 left-3 z-[3] hidden whitespace-pre bg-panel/85 px-1.5 text-[12px] text-muted opacity-0 transition-opacity group-hover/view:opacity-100 sm:block"
          />

          {/* Zoom */}
          <div
            role="group"
            aria-label="Zoom"
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute bottom-3 right-3 z-[3] flex border border-line-strong bg-panel"
          >
            <ZoomKey label="Zoom out" onClick={() => zoomTo(z / 1.25)} className={narrow ? "hidden" : ""}>
              <Minus size={14} aria-hidden />
            </ZoomKey>
            <button
              type="button"
              onClick={() => zoomTo(actual)}
              title="Show actual pixels"
              aria-label={`Zoom ${percent}%. Show actual pixels`}
              className={`fb-num h-9 min-w-[58px] border-line-strong px-2 text-[12.5px] font-medium transition-colors hover:bg-hover ${narrow ? "" : "border-l"}`}
            >
              {percent}%
            </button>
            <ZoomKey label="Zoom in" onClick={() => zoomTo(z * 1.25)} className={narrow ? "hidden" : ""}>
              <Plus size={14} aria-hidden />
            </ZoomKey>
            <button
              type="button"
              onClick={() => setView(FIT)}
              aria-pressed={!zoomed}
              className={`h-9 border-l border-line-strong px-3 text-[12.5px] font-medium uppercase transition-colors ${
                zoomed ? "hover:bg-hover" : "bg-ink text-white"
              }`}
            >
              Fit
            </button>
            <ZoomKey
              label={checker ? "Hide transparency grid" : "Show transparency grid"}
              onClick={() => setChecker((value) => !value)}
              pressed={checker}
            >
              <Grid2x2 size={15} aria-hidden />
            </ZoomKey>
            {inDialog ? null : (
              <ZoomKey
                label={full ? "Close full window" : "Open full window"}
                onClick={() => setFull((value) => !value)}
                slot={full ? "viewer-close" : "viewer-open"}
              >
                {full ? <X size={15} aria-hidden /> : <Maximize size={14} aria-hidden />}
              </ZoomKey>
            )}
          </div>

          {children}

          {dragging ? (
            <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center border-[3px] border-accent bg-canvas/85">
              <p className="fb-wide text-[clamp(22px,2.6vw,38px)]">{dropLabel}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ZoomKey({
  children,
  label,
  onClick,
  pressed,
  className = "",
  slot,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  className?: string;
  slot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      data-slot={slot}
      className={`grid h-9 w-9 place-items-center border-l border-line-strong transition-colors first:border-l-0 hover:bg-ink hover:text-white ${
        pressed === false ? "text-faint" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Tag({
  source,
  className = "",
  loud = false,
  bare = false,
}: {
  source: ViewSource;
  className?: string;
  loud?: boolean;
  /** No room for the size: the name alone. */
  bare?: boolean;
}) {
  return (
    <span
      className={`pointer-events-none absolute z-[3] inline-flex h-7 max-w-[46%] items-center gap-2 px-2.5 text-[12px] font-semibold uppercase ${
        loud ? "bg-accent-deep text-white" : "bg-ink text-white"
      } ${className}`}
    >
      <span className="truncate">{source.label}</span>
      {source.note && !bare ? <span className="fb-num truncate font-normal text-white/80">{source.note}</span> : null}
    </span>
  );
}

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** Edge scale in image pixels, with the picture's extent marked in coral. */
export function Ruler({
  axis,
  length,
  origin,
  scale,
  extent,
  from = 0,
  to,
  crossRef,
}: {
  axis: "x" | "y";
  length: number;
  origin: number;
  scale: number;
  extent: number;
  /** The stretch marked in coral, in image pixels. Defaults to the whole picture. */
  from?: number;
  to?: number;
  crossRef?: RefObject<HTMLSpanElement>;
}) {
  const horizontal = axis === "x";
  const step = STEPS.find((value) => value * scale >= 72) ?? STEPS[STEPS.length - 1];
  const minor = step / 5;
  const marks: { at: number; value: number; major: boolean }[] = [];
  if (scale > 0 && length > 0) {
    const first = Math.floor(-origin / scale / minor);
    const last = Math.ceil((length - origin) / scale / minor);
    for (let index = first; index <= last && marks.length < 400; index += 1) {
      marks.push({ at: origin + index * minor * scale, value: index * minor, major: index % 5 === 0 });
    }
  }
  const path = marks
    .map(({ at, major }) => {
      const p = Math.round(at) + 0.5;
      const from = major ? 10 : 17;
      return horizontal ? `M${p} ${from}V22` : `M${from} ${p}H22`;
    })
    .join("");

  return (
    <div
      aria-hidden
      className={`relative hidden overflow-hidden bg-panel text-faint sm:block ${
        horizontal ? "border-b border-line" : "border-r border-line"
      }`}
    >
      <svg width={horizontal ? length : 22} height={horizontal ? 22 : length} className="absolute left-0 top-0">
        <path d={path} stroke="currentColor" strokeOpacity="0.55" fill="none" shapeRendering="crispEdges" />
        {horizontal ? (
          <rect x={origin + from * scale} y={19} width={Math.max(0, ((to ?? extent) - from) * scale)} height={2} fill="#f2552c" />
        ) : (
          <rect x={19} y={origin + from * scale} width={2} height={Math.max(0, ((to ?? extent) - from) * scale)} fill="#f2552c" />
        )}
      </svg>
      {marks
        .filter((mark) => mark.major && mark.value >= 0 && mark.value <= extent)
        .map((mark) => (
          <span
            key={mark.value}
            className="fb-num absolute text-[10px] leading-none"
            style={
              horizontal
                ? { left: Math.round(mark.at) + 4, top: 4 }
                : { left: 4, top: Math.round(mark.at) + 5, writingMode: "vertical-rl" }
            }
          >
            {mark.value}
          </span>
        ))}
      {crossRef ? (
        <span
          ref={crossRef}
          className={`absolute left-0 top-0 bg-ink ${horizontal ? "h-full w-px" : "h-px w-full"}`}
          style={{ transform: horizontal ? "translateX(-4px)" : "translateY(-4px)" }}
        />
      ) : null}
    </div>
  );
}
