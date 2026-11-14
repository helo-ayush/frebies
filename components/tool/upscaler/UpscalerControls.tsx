"use client";

import { useState, type ReactNode } from "react";
import { Cpu, RotateCcw, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import {
  DEFAULT_UPSCALE_SETTINGS,
  FREE_UPSCALE_MODELS,
  PRO_UPSCALE_MODEL,
  UPSCALE_ENHANCE_PRESETS,
  UPSCALE_FORMATS,
  UPSCALE_PROFILES,
  UPSCALE_TARGET_PRESETS,
  getUpscaleModelMeta,
  upscaleTarget,
  type UpscaleContentProfile,
  type UpscaleEngineModel,
  type UpscaleFormat,
  type UpscaleSettings,
  type UpscaleTier,
} from "./model";

export type UpscaleSettingsTab = "engine" | "enhance" | "output";

function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        {children}
      </span>
      {aside ? <span className="text-[11px] text-faint">{aside}</span> : null}
    </div>
  );
}

function chipClass(selected: boolean) {
  return selected
    ? "border-ink bg-ink text-white shadow-sm"
    : "border-line bg-white text-ink hover:border-ink/30 hover:bg-rail";
}

const TAB_META: { id: UpscaleSettingsTab; label: string; icon: ReactNode }[] = [
  { id: "engine", label: "Engine", icon: <Cpu size={13} aria-hidden /> },
  { id: "enhance", label: "Enhance", icon: <Wand2 size={13} aria-hidden /> },
  { id: "output", label: "Output", icon: <SlidersHorizontal size={13} aria-hidden /> },
];

const BACKDROP_SWATCHES = ["#ffffff", "#f7f7f5", "#111113"] as const;

function recommendedModelForProfile(profile: UpscaleContentProfile): UpscaleEngineModel {
  if (profile === "illustration") return "omnisr";
  if (profile === "product") return "hat";
  if (profile === "portrait") return "ultrasharp_v2";
  if (profile === "cinema") return "realesrgan";
  return "ultrasharp_v2_lite";
}

export function UpscalerControls({
  settings,
  onPatch,
  onReset,
  sourceWidth,
  sourceHeight,
  hasImage,
  proUpscalerReady = false,
  disabled = false,
}: {
  settings: UpscaleSettings;
  onPatch: (patch: Partial<UpscaleSettings>) => void;
  onReset?: () => void;
  sourceWidth: number;
  sourceHeight: number;
  hasImage: boolean;
  proUpscalerReady?: boolean;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<UpscaleSettingsTab>("engine");

  const activeModel = getUpscaleModelMeta(settings.engineModel);
  const targetDims = upscaleTarget(sourceWidth, sourceHeight, settings.factor, settings.targetPreset);

  function selectTier(tier: UpscaleTier) {
    if (tier === "pro") {
      onPatch({ tier: "pro", engineModel: "seedvr2_3b" });
    } else {
      onPatch({
        tier: "free",
        engineModel:
          settings.engineModel === "seedvr2_3b" ? "ultrasharp_v2_lite" : settings.engineModel,
      });
    }
  }

  function selectProfile(profile: UpscaleContentProfile) {
    const preset = UPSCALE_PROFILES.find((p) => p.value === profile);
    const patch: Partial<UpscaleSettings> = {
      profile,
      ...(preset ? { denoise: preset.denoise, sharpen: preset.sharpen } : {}),
    };
    if (settings.tier === "free") {
      patch.engineModel = recommendedModelForProfile(profile);
    }
    onPatch(patch);
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Upscaler settings"
        className="grid grid-cols-3 gap-1 rounded-xl bg-[#f3f3f1] p-1"
      >
        {TAB_META.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item.id)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-medium transition-all ${
                selected
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(15,15,16,0.08)]"
                  : "text-muted hover:text-ink"
              }`}
            >
              <span className={selected ? "text-accent" : ""}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "engine" ? (
        <div className="space-y-4">
          <div>
            <SectionLabel aside={settings.tier === "pro" ? "FP8 DiT" : "Fast FP16"}>
              Engine tier
            </SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectTier("free")}
                className={`rounded-xl border p-2.5 text-left transition ${chipClass(
                  settings.tier === "free",
                )}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold">Free · Lite</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
                      settings.tier === "free"
                        ? "bg-white/15 text-white"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    FP16
                  </span>
                </div>
                <p
                  className={`mt-1 text-[10.5px] leading-snug ${
                    settings.tier === "free" ? "text-white/75" : "text-faint"
                  }`}
                >
                  Instant RRDB & Transformer models
                </p>
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => selectTier("pro")}
                className={`rounded-xl border p-2.5 text-left transition ${chipClass(
                  settings.tier === "pro",
                )}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold">
                    <Sparkles size={11} className="text-accent" aria-hidden />
                    Pro · 3B
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
                      settings.tier === "pro"
                        ? "bg-accent text-white"
                        : proUpscalerReady
                          ? "bg-accent-soft text-accent"
                          : "bg-[#f3f3f1] text-muted"
                    }`}
                  >
                    FP8
                  </span>
                </div>
                <p
                  className={`mt-1 text-[10.5px] leading-snug ${
                    settings.tier === "pro" ? "text-white/75" : "text-faint"
                  }`}
                >
                  SeedVR2-3B generative diffusion
                </p>
              </button>
            </div>
          </div>

          {settings.tier === "pro" ? (
            <div className="rounded-xl border border-accent/25 bg-accent-soft/45 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink">
                  {PRO_UPSCALE_MODEL.label}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-accent shadow-sm">
                  {proUpscalerReady ? "Ready on L20 GPU" : "FP8 · L20 GPU"}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {PRO_UPSCALE_MODEL.hint}
              </p>
            </div>
          ) : (
            <div>
              <SectionLabel aside={activeModel.precision}>Free model</SectionLabel>
              <div className="grid max-h-[210px] gap-1.5 overflow-y-auto pr-0.5">
                {FREE_UPSCALE_MODELS.map((m) => {
                  const selected = settings.engineModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onPatch({
                          engineModel: m.id,
                          profile: m.recommendedProfile,
                        })
                      }
                      className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition ${chipClass(
                        selected,
                      )}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-medium">{m.shortLabel}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium ${
                              selected ? "bg-white/15 text-white" : "bg-[#f3f3f1] text-muted"
                            }`}
                          >
                            {m.badge}
                          </span>
                        </div>
                        <p
                          className={`mt-0.5 line-clamp-2 text-[10.5px] leading-snug ${
                            selected ? "text-white/75" : "text-faint"
                          }`}
                        >
                          {m.hint}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <SectionLabel>Content profile</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {UPSCALE_PROFILES.map((p) => {
                const selected = settings.profile === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectProfile(p.value)}
                    title={p.hint}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${chipClass(
                      selected,
                    )}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel>Scale</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {([2, 4] as const).map((factor) => {
                  const selected = settings.factor === factor;
                  return (
                    <button
                      key={factor}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPatch({ factor })}
                      className={`h-9 rounded-lg border text-[12.5px] font-semibold transition ${chipClass(
                        selected,
                      )}`}
                    >
                      {factor}×
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <SectionLabel
                aside={
                  hasImage && targetDims.width
                    ? `${targetDims.width}×${targetDims.height}`
                    : undefined
                }
              >
                Target cap
              </SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {UPSCALE_TARGET_PRESETS.map((preset) => {
                  const selected = settings.targetPreset === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      disabled={disabled}
                      title={preset.hint}
                      onClick={() => onPatch({ targetPreset: preset.value })}
                      className={`h-9 rounded-lg border px-1.5 text-[10.5px] font-medium transition ${chipClass(
                        selected,
                      )}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "enhance" ? (
        <div className="space-y-4">
          <div>
            <SectionLabel>Quick presets</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {UPSCALE_ENHANCE_PRESETS.map((preset) => {
                const selected =
                  settings.denoise === preset.denoise &&
                  settings.sharpen === preset.sharpen &&
                  settings.colorFix === preset.colorFix &&
                  settings.face === preset.face;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onPatch({
                        denoise: preset.denoise,
                        sharpen: preset.sharpen,
                        colorFix: preset.colorFix,
                        face: preset.face,
                      })
                    }
                    className={`rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition ${chipClass(
                      selected,
                    )}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <PaidSlider
            label="Denoise cleanup"
            value={settings.denoise}
            min={0}
            max={100}
            step={5}
            suffix="%"
            left="Off"
            right="Strong"
            disabled={disabled}
            onChange={(denoise) => onPatch({ denoise })}
          />

          <PaidSlider
            label="Post-upscale sharpen"
            value={settings.sharpen}
            min={0}
            max={100}
            step={5}
            suffix="%"
            left="Soft"
            right="Crisp"
            disabled={disabled}
            onChange={(sharpen) => onPatch({ sharpen })}
          />

          <div className="space-y-2.5 pt-1">
            <PaidToggle
              title="Face & eye recovery"
              description="Prioritize facial clarity and natural hair detail"
              checked={settings.face}
              disabled={disabled}
              onChange={(face) => onPatch({ face })}
            />
            <PaidToggle
              title="LAB color fidelity lock"
              description="Preserve original skin tones and white balance"
              checked={settings.colorFix}
              disabled={disabled}
              onChange={(colorFix) => onPatch({ colorFix })}
            />
          </div>
        </div>
      ) : null}

      {tab === "output" ? (
        <div className="space-y-4">
          <div>
            <SectionLabel>Export format</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {UPSCALE_FORMATS.map((fmt) => {
                const selected = settings.format === fmt.value;
                return (
                  <button
                    key={fmt.value}
                    type="button"
                    disabled={disabled}
                    title={fmt.hint}
                    onClick={() => onPatch({ format: fmt.value as UpscaleFormat })}
                    className={`h-9 rounded-lg border text-[12px] font-semibold transition ${chipClass(
                      selected,
                    )}`}
                  >
                    {fmt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              {UPSCALE_FORMATS.find((f) => f.value === settings.format)?.hint}
            </p>
          </div>

          {settings.format !== "png" ? (
            <PaidSlider
              label={`${settings.format.toUpperCase()} compression quality`}
              value={settings.quality}
              min={60}
              max={100}
              step={1}
              suffix="%"
              left="60% small"
              right="100% max"
              disabled={disabled}
              onChange={(quality) => onPatch({ quality })}
            />
          ) : null}

          {settings.format !== "jpg" ? (
            <PaidToggle
              title="Preserve alpha transparency"
              description="Keep transparent PNG/WebP background matte"
              checked={settings.transparency}
              disabled={disabled}
              onChange={(transparency) => onPatch({ transparency })}
            />
          ) : null}

          {settings.format === "jpg" || !settings.transparency ? (
            <div>
              <SectionLabel aside={settings.backgroundColor}>Flatten backdrop</SectionLabel>
              <div className="flex items-center gap-2">
                {BACKDROP_SWATCHES.map((hex) => {
                  const selected = settings.backgroundColor.toLowerCase() === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPatch({ backgroundColor: hex })}
                      className={`h-7 w-7 rounded-lg border transition ${
                        selected ? "ring-2 ring-ink ring-offset-1" : "border-line"
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Set backdrop ${hex}`}
                    />
                  );
                })}
                <input
                  type="color"
                  disabled={disabled}
                  value={settings.backgroundColor}
                  onChange={(e) => onPatch({ backgroundColor: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-white p-0.5"
                  aria-label="Custom backdrop color"
                />
              </div>
            </div>
          ) : null}

          <PaidToggle
            title="Keep EXIF & ICC profile"
            description="Retain color management & camera metadata on export"
            checked={settings.metadata}
            disabled={disabled}
            onChange={(metadata) => onPatch({ metadata })}
          />
        </div>
      ) : null}

      <div className="border-t border-line pt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => (onReset ? onReset() : onPatch({ ...DEFAULT_UPSCALE_SETTINGS }))}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-ink"
        >
          <RotateCcw size={12} aria-hidden />
          Reset defaults
        </button>
      </div>
    </div>
  );
}
