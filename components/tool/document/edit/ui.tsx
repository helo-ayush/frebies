"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pipette } from "lucide-react";

/** Small controls of the editor's bars. None of them take the caret out of the text being edited. */

const keepCaret = (event: { preventDefault: () => void; pointerType?: string }) => event.preventDefault();

export function BarButton({
  label,
  hint,
  active,
  disabled,
  onClick,
  children,
  className = "",
  slot,
  sound,
}: {
  label: string;
  /** Keyboard shortcut. */
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  slot?: string;
  sound?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={hint ? `${label} (${hint})` : label}
      disabled={disabled}
      data-slot={slot}
      data-sound={sound}
      onMouseDown={keepCaret}
      onClick={onClick}
      className={`grid h-9 min-w-9 shrink-0 place-items-center px-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active ? "bg-ink text-white" : "hover:bg-hover"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** A word and an icon, for the things that are not obvious from a picture. */
export function BarText({
  label,
  onClick,
  icon,
  disabled,
  danger,
  active,
  title,
  sound,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  sound?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={active}
      data-sound={sound}
      onMouseDown={keepCaret}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-2.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active ? "bg-ink text-white" : danger ? "hover:bg-danger hover:text-white" : "hover:bg-hover"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export const Rule = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line-strong" />;

/** A panel that opens under its button, above everything, and closes when left. */
export function Pop({
  button,
  children,
  width = 220,
  label,
  align = "left",
}: {
  button: (open: boolean, toggle: () => void, ref: RefObject<HTMLButtonElement>) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  label: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; max: number } | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    const put = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const room = window.innerWidth - width - 8;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = panel.current?.scrollHeight ?? 200;
      const up = below < Math.min(height, 220) && above > below;
      const max = Math.max(140, up ? above : below);
      setPlace({
        left: Math.max(8, Math.min(room, align === "right" ? rect.right - width : rect.left)),
        top: up ? Math.max(8, rect.top - 4 - Math.min(height + 2, max)) : rect.bottom + 4,
        max,
      });
    };
    put();
    window.addEventListener("resize", put);
    return () => window.removeEventListener("resize", put);
  }, [open, width, align]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      anchor.current?.focus();
    };
    const gone = (event: Event) => {
      if (panel.current && event.target instanceof Node && panel.current.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", gone, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", gone, true);
    };
  }, [open]);

  return (
    <>
      {button(open, () => setOpen((value) => !value), anchor as RefObject<HTMLButtonElement>)}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panel}
              role="group"
              aria-label={label}
              data-editor-panel
              className="fixed z-[120] overflow-y-auto overscroll-contain border border-ink bg-panel text-ink shadow-[6px_6px_0_rgba(24,24,27,0.16)]"
              style={{ left: place?.left ?? -9999, top: place?.top ?? 0, width, maxHeight: place?.max }}
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function MenuRow({
  label,
  hint,
  icon,
  active,
  onClick,
  sound,
}: {
  label: ReactNode;
  hint?: string;
  icon?: ReactNode;
  active?: boolean;
  onClick: () => void;
  sound?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-sound={sound}
      onMouseDown={keepCaret}
      onClick={onClick}
      className={`flex min-h-[42px] w-full items-center gap-3 border-b border-line px-3 py-2 text-left text-[14px] transition-colors last:border-b-0 ${
        active ? "bg-ink text-white" : "hover:bg-hover"
      }`}
    >
      {icon ? <span className="grid w-6 shrink-0 place-items-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? (
        <span className={`fb-num shrink-0 text-[12px] ${active ? "text-white/60" : "text-faint"}`}>{hint}</span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------- colour

const SWATCHES = [
  "#000000",
  "#1d1c1f",
  "#57565c",
  "#a5a4a2",
  "#ffffff",
  "#d8431b",
  "#f2552c",
  "#f59e0b",
  "#ffd23f",
  "#7ac943",
  "#16803c",
  "#0f8a8a",
  "#1c7ed6",
  "#1e3a8a",
  "#7c3aed",
  "#d6336c",
];

type Dropper = { open: () => Promise<{ sRGBHex: string }> };

export function ColorPick({
  label,
  value,
  onChange,
  onNone,
  icon,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  /** Offers "none", for fills and outlines. */
  onNone?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const [canPick, setCanPick] = useState(false);
  useEffect(() => setCanPick("EyeDropper" in window), []);
  return (
    <Pop
      label={label}
      width={212}
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-expanded={open}
          title={label}
          disabled={disabled}
          onMouseDown={keepCaret}
          onClick={toggle}
          className={`flex h-9 shrink-0 items-center gap-1.5 px-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30 ${open ? "bg-hover" : "hover:bg-hover"}`}
        >
          {icon ? <span className="grid place-items-center">{icon}</span> : null}
          <span
            className={`block h-[18px] w-[26px] border border-ink/40 ${value ? "" : "bg-white bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),#d8431b_calc(50%-1px),#d8431b_calc(50%+1px),transparent_calc(50%+1px))]"}`}
            style={value ? { background: value } : undefined}
          />
          <ChevronDown size={12} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div className="p-3">
          <div className="grid grid-cols-8 gap-1">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                data-sound="select"
                onMouseDown={keepCaret}
                onClick={() => {
                  onChange(color);
                  close();
                }}
                className={`h-[19px] border ${value?.toLowerCase() === color ? "border-ink outline outline-2 outline-accent" : "border-ink/25 hover:border-ink"}`}
                style={{ background: color }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 border border-line-strong bg-white px-2 text-[12.5px]">
              <input
                type="color"
                value={value ?? "#000000"}
                onChange={(event) => onChange(event.target.value)}
                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                aria-label={`${label}, any colour`}
              />
              <span className="fb-num truncate uppercase">{value ?? "Any"}</span>
            </label>
            {canPick ? (
              <button
                type="button"
                title="Pick a colour from the screen"
                aria-label="Pick a colour from the screen"
                onMouseDown={keepCaret}
                onClick={() => {
                  const Ctor = (window as unknown as { EyeDropper: new () => Dropper }).EyeDropper;
                  void new Ctor()
                    .open()
                    .then((result) => onChange(result.sRGBHex))
                    .catch(() => undefined);
                }}
                className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong bg-white hover:bg-ink hover:text-white"
              >
                <Pipette size={15} aria-hidden />
              </button>
            ) : null}
          </div>
          {onNone ? (
            <button
              type="button"
              onMouseDown={keepCaret}
              onClick={() => {
                onNone();
                close();
              }}
              className="mt-2 flex h-9 w-full items-center justify-between border border-line-strong bg-white px-2.5 text-[13px] hover:bg-hover"
            >
              None
              {value === null ? <Check size={14} aria-hidden /> : null}
            </button>
          ) : null}
        </div>
      )}
    </Pop>
  );
}

// ---------------------------------------------------------------- numbers

/** A number with steps and a list of common values. */
export function NumberBox({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  width = 52,
  presets,
  suffix,
  onDone,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  width?: number;
  presets?: readonly number[];
  suffix?: string;
  /** Enter was pressed: give the caret back. */
  onDone?: () => void;
  disabled?: boolean;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = value === null ? "" : String(Math.round(value * 100) / 100);
  const set = (next: number) => {
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next * 100) / 100)));
  };
  const take = () => {
    if (typed !== null && typed.trim() !== "") set(Number.parseFloat(typed));
    setTyped(null);
  };
  return (
    <span className="flex h-9 shrink-0 items-center border border-line-strong bg-white">
      <input
        aria-label={label}
        title={label}
        inputMode="decimal"
        disabled={disabled}
        value={typed ?? shown}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setTyped(event.target.value.replace(/[^\d.-]/g, ""))}
        onBlur={take}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            take();
            onDone?.();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setTyped(null);
            set((value ?? 0) + (event.key === "ArrowUp" ? step : -step));
          } else if (event.key === "Escape") {
            setTyped(null);
            onDone?.();
          }
        }}
        className="fb-num h-full bg-transparent px-2 text-[13.5px] outline-none focus-visible:outline-none disabled:opacity-40"
        style={{ width }}
      />
      {suffix ? <span className="pr-2 text-[12px] text-faint">{suffix}</span> : null}
      {presets ? (
        <Pop
          label={label}
          width={92}
          button={(open, toggle, ref) => (
            <button
              ref={ref}
              type="button"
              aria-label={`${label} list`}
              aria-expanded={open}
              disabled={disabled}
              onMouseDown={keepCaret}
              onClick={toggle}
              className="grid h-full w-6 place-items-center border-l border-line hover:bg-hover disabled:opacity-40"
            >
              <ChevronDown size={12} aria-hidden />
            </button>
          )}
        >
          {(close) =>
            presets.map((preset) => (
              <button
                key={preset}
                type="button"
                data-sound="select"
                onMouseDown={keepCaret}
                onClick={() => {
                  set(preset);
                  close();
                }}
                className={`fb-num block h-8 w-full px-3 text-left text-[13.5px] ${value === preset ? "bg-ink text-white" : "hover:bg-hover"}`}
              >
                {preset}
              </button>
            ))
          }
        </Pop>
      ) : null}
    </span>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}) {
  return (
    <label className="block px-3 py-2.5 text-[13px]">
      <span className="flex justify-between">
        {label}
        <span className="fb-num text-muted">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range mt-2.5 w-full"
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
    </label>
  );
}
