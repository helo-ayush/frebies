"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Cloud,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { ArrowRightGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import { UpscalerControls } from "./UpscalerControls";
import {
  DEFAULT_UPSCALE_SETTINGS,
  UPSCALE_COST,
  formatBytes,
  upscaleTarget,
  type UpscaleSettings,
} from "./model";

type Loupe = {
  left: number;
  top: number;
  size: number;
  backgroundSize: string;
  backgroundPosition: string;
};

export function UpscalerStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
  const {
    activeItem,
    error,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    removeItem,
  } = useImageQueue({ maxFiles: 1, maxSizeMB, noun: "image" });

  const [settings, setSettings] = useState<UpscaleSettings>(DEFAULT_UPSCALE_SETTINGS);
  const [gateOpen, setGateOpen] = useState(false);
  const [loupe, setLoupe] = useState<Loupe | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const sourceWidth = activeItem?.width ?? 0;
  const sourceHeight = activeItem?.height ?? 0;
  const target = upscaleTarget(sourceWidth, sourceHeight, settings.factor);

  function patch(next: Partial<UpscaleSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || !activeItem) {
      setLoupe(null);
      return;
    }
    if (event.pointerType !== "mouse") {
      setLoupe(null);
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const localX = event.clientX - imageRect.left;
    const localY = event.clientY - imageRect.top;

    if (localX < 0 || localY < 0 || localX > imageRect.width || localY > imageRect.height) {
      setLoupe(null);
      return;
    }

    const size = 136;
    const zoom = settings.factor === 4 ? 4 : 3;
    const left = Math.min(
      Math.max(event.clientX - stageRect.left - size / 2, 12),
      stageRect.width - size - 12,
    );
    const top = Math.min(
      Math.max(event.clientY - stageRect.top - size / 2, 12),
      stageRect.height - size - 12,
    );

    setLoupe({
      left,
      top,
      size,
      backgroundSize: `${imageRect.width * zoom}px ${imageRect.height * zoom}px`,
      backgroundPosition: `${-(localX * zoom - size / 2)}px ${-(localY * zoom - size / 2)}px`,
    });
  }

  return (
    <section
      id="upscaler"
      aria-label="AI upscale studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/image/upscaler" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Upscale lab</h2>
            <p className="mt-0.5 text-micro text-faint">
              2× or 4× detail recovery.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#a8432c]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {UPSCALE_COST} credits
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <Cloud size={10} aria-hidden />
            Cloud AI
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
        </div>
      </div>

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_396px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!activeItem ? (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`relative flex min-h-[430px] flex-1 flex-col items-center justify-center overflow-hidden rounded-[16px] border px-5 py-10 text-center transition-colors ${
                dragging
                  ? "border-accent/60 bg-[#17110f]"
                  : "border-dashed border-[#35353a] bg-[#111113]"
              }`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.13]"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(229,94,64,0.36),transparent_68%)] blur-2xl"
              />

              <span className="relative inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.12em] text-white/55">
                <Sparkles size={10} aria-hidden />
                AI upscale lab
              </span>
              <p className="relative mt-4 font-display text-[26px] font-semibold tracking-[-0.03em] text-white">
                Drop an image to enhance
              </p>
              <p className="relative mt-2 max-w-sm text-ui leading-relaxed text-white/55">
                2× or 4× with detail and face restoration. The upload starts only when
                you run it.
              </p>
              <button
                type="button"
                onClick={() => openPicker()}
                className="relative mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-5 text-ui font-medium text-ink transition-colors hover:bg-white/90"
              >
                Choose an image
                <ArrowRightGlyph size={13} />
              </button>
              <p className="relative mt-4 text-[10px] text-white/35">
                JPG, PNG or WebP · up to {maxSizeMB} MB
              </p>
              <div className="relative mt-5 flex flex-wrap justify-center gap-1.5">
                {["2× and 4×", "Face restore", "2 credits"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9.5px] text-white/50"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={stageRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setLoupe(null)}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`relative flex min-h-[430px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border p-5 transition-colors ${
                dragging ? "border-accent/60 bg-[#17110f]" : "border-[#2a2a2e] bg-[#111113]"
              }`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.13]"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(229,94,64,0.22),transparent_70%)] blur-2xl"
              />

              <span className="absolute left-4 top-4 z-20 rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[9px] font-medium tabular-nums text-white/65 backdrop-blur">
                Source · {sourceWidth} × {sourceHeight}
              </span>
              <span className="absolute right-4 top-4 z-20 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[9px] font-medium tabular-nums text-[#ffb7a6] backdrop-blur">
                Target {settings.factor}× · {target.width} × {target.height}
              </span>

              <img
                ref={imageRef}
                src={activeItem.preview}
                alt={`Source for ${activeItem.file.name}`}
                draggable={false}
                className="relative z-10 max-h-full max-w-full select-none rounded-[10px] object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
              />

              {loupe && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-30 overflow-hidden rounded-full border-2 border-white/85 shadow-[0_14px_34px_rgba(0,0,0,0.55)]"
                  style={{
                    left: loupe.left,
                    top: loupe.top,
                    width: loupe.size,
                    height: loupe.size,
                    backgroundImage: `url("${activeItem.preview}")`,
                    backgroundSize: loupe.backgroundSize,
                    backgroundPosition: loupe.backgroundPosition,
                    backgroundRepeat: "no-repeat",
                    backgroundColor: "#111113",
                  }}
                >
                  <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[8px] font-medium uppercase tracking-[0.1em] text-white/70">
                    Source detail
                  </span>
                </div>
              )}

              <span className="absolute bottom-4 left-4 z-20 hidden items-center gap-1.5 rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[9px] text-white/50 backdrop-blur sm:inline-flex">
                <Sparkles size={9} aria-hidden />
                Hover to inspect · {settings.factor}× loupe
              </span>
              <span className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[9px] font-medium text-white/65 backdrop-blur">
                <ShieldCheck size={9} aria-hidden />
                Cloud run · deleted in 1h
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            tabIndex={-1}
            aria-label="Choose an image to upscale"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {activeItem && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[11px] border border-line bg-white px-2.5 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#f5f2ec] text-muted">
                <ToolGlyph path="/image/upscaler" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium text-ink">{activeItem.file.name}</p>
                <p className="mt-0.5 text-micro text-faint">
                  {formatBytes(activeItem.file.size)}
                  {sourceWidth ? ` · ${sourceWidth} × ${sourceHeight}px` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openPicker(activeItem.id)}
                aria-label="Replace image"
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                <ImagePlus size={11} aria-hidden />
                <span className="hidden sm:inline">Replace</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  removeItem(activeItem.id);
                  setLoupe(null);
                }}
                aria-label={`Remove ${activeItem.file.name}`}
                className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          )}

          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
            <p className="flex items-center gap-1.5 text-micro text-faint">
              <Cloud size={12} aria-hidden />
              Cloud processed · deleted within 1 hour
            </p>
            <p className="flex items-center gap-1.5 text-[10.5px] text-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {UPSCALE_COST} credits per image · no watermark
            </p>
          </div>
        </div>

        <PaidRail
          label="Upscale settings"
          footer={
            <PaidRunCard
              cost={UPSCALE_COST}
              verb="upscale"
              ready={Boolean(activeItem)}
              onRun={() => setGateOpen(true)}
            />
          }
        >
          <UpscalerControls
            settings={settings}
            onPatch={patch}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            hasImage={Boolean(activeItem)}
          />
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="upscale this image"
        cost={UPSCALE_COST}
      />
    </section>
  );
}
