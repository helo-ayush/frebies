"use client";

import { useState } from "react";
import {
  Check,
  Cloud,
  Eraser,
  ImagePlus,
  Lock,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { ArrowRightGlyph, ToolGlyph } from "@/components/icons/NavGlyph";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { PaidRunCard } from "@/components/tool/paid/PaidRunCard";
import { useImageQueue } from "@/components/tool/studio/useImageQueue";
import { RemoverControls } from "./RemoverControls";
import {
  DEFAULT_REMOVER_SETTINGS,
  REMOVER_COST,
  formatBytes,
  type RemoverSettings,
} from "./model";

export function RemoveBackgroundStudio({ maxSizeMB = 25 }: { maxSizeMB?: number }) {
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

  const [settings, setSettings] = useState<RemoverSettings>(DEFAULT_REMOVER_SETTINGS);
  const [gateOpen, setGateOpen] = useState(false);

  function patch(next: Partial<RemoverSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return (
    <section
      id="remove-background"
      aria-label="Background removal studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/image/remove-background" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Cutout studio</h2>
            <p className="mt-0.5 text-micro text-faint">
              Transparent PNG in one pass.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#a8432c]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {REMOVER_COST} credit
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
              className={`checkerboard relative flex min-h-[430px] flex-1 flex-col items-center justify-center overflow-hidden rounded-[16px] border px-5 py-10 text-center transition-colors ${
                dragging ? "border-accent/60" : "border-dashed border-[#c9cec3]"
              }`}
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/55" />
              <div className="relative flex flex-col items-center rounded-[20px] border border-white bg-white/85 px-7 py-8 shadow-[0_18px_40px_rgba(45,45,35,0.08)] backdrop-blur">
                <span className="grid h-16 w-16 place-items-center rounded-[20px] border border-line bg-[#f5f2ec] text-ink">
                  <Eraser size={26} strokeWidth={1.4} aria-hidden />
                </span>
                <p className="mt-4 font-display text-[24px] font-semibold tracking-[-0.03em] text-ink">
                  Drop an image to cut out
                </p>
                <p className="mt-2 max-w-sm text-ui leading-relaxed text-muted">
                  Products, portraits and screenshots. One credit, transparent PNG with
                  refined edges.
                </p>
                <button
                  type="button"
                  onClick={() => openPicker()}
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-5 text-ui font-medium text-white transition-colors hover:bg-[#2a2a2b]"
                >
                  Choose an image
                  <ArrowRightGlyph size={13} />
                </button>
                <p className="mt-4 text-[10px] text-faint">
                  JPG, PNG or WebP · up to {maxSizeMB} MB
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[9.5px] text-muted">
                    <Check size={9} aria-hidden />
                    Transparent PNG
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[9.5px] text-muted">
                    <Sparkles size={9} className="text-accent" aria-hidden />
                    1 credit
                  </span>
                </div>
              </div>
              <span className="relative mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[9px] text-muted backdrop-blur">
                <span className="checkerboard h-3 w-3 rounded-[2px] border border-line" aria-hidden />
                The checkered area is transparency
              </span>
            </div>
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`checkerboard relative flex min-h-[430px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border p-6 transition-colors ${
                dragging ? "border-accent/60" : "border-[#dfe2da]"
              }`}
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/15" />
              <span className="absolute left-4 top-4 z-10 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium tabular-nums text-muted backdrop-blur">
                Source · {activeItem.width || "—"} × {activeItem.height || "—"}
              </span>
              <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-[#fff7f3]/95 px-2 py-1 text-[9px] font-medium text-[#a8432c] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                {REMOVER_COST} credit · cutout
              </span>

              <img
                src={activeItem.preview}
                alt={`Source for ${activeItem.file.name}`}
                draggable={false}
                className="relative z-[1] max-h-full max-w-full select-none rounded-[10px] object-contain shadow-[0_18px_44px_rgba(45,45,35,0.18)]"
              />

              <span className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-1.5 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] text-muted backdrop-blur">
                <Lock size={9} aria-hidden />
                Cutout appears after the run
              </span>
              <span className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-md border border-line bg-white/90 px-2 py-1 text-[9px] font-medium text-muted backdrop-blur">
                <Eraser size={9} aria-hidden />
                Transparent PNG
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            tabIndex={-1}
            aria-label="Choose an image to remove the background from"
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
                <ToolGlyph path="/image/remove-background" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium text-ink">{activeItem.file.name}</p>
                <p className="mt-0.5 text-micro text-faint">
                  {formatBytes(activeItem.file.size)}
                  {activeItem.width ? ` · ${activeItem.width} × ${activeItem.height}px` : ""}
                  {` · ${settings.format.toUpperCase()} out`}
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
                onClick={() => removeItem(activeItem.id)}
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
              {REMOVER_COST} credit per image · no watermark
            </p>
          </div>
        </div>

        <PaidRail
          label="Cutout settings"
          footer={
            <PaidRunCard
              cost={REMOVER_COST}
              verb="cut out"
              ready={Boolean(activeItem)}
              onRun={() => setGateOpen(true)}
            />
          }
        >
          <RemoverControls
            settings={settings}
            onPatch={patch}
            hasImage={Boolean(activeItem)}
          />
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="remove this background"
        cost={REMOVER_COST}
      />
    </section>
  );
}
