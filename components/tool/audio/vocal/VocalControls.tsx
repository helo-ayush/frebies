"use client";

import { useState, type ReactNode } from "react";
import { Cpu, RotateCcw, SlidersHorizontal, Waves } from "lucide-react";
import { PaidToggle } from "@/components/tool/paid/PaidControls";
import {
  DEFAULT_VOCAL_SETTINGS,
  STEM_OPTIONS,
  VOCAL_ENGINE_MODELS,
  VOCAL_SAMPLE_RATES,
  getVocalEngineMeta,
  type VocalBitrate,
  type VocalChannelMode,
  type VocalOutputFormat,
  type VocalSettings,
} from "./model";

export type VocalSettingsTab = "engine" | "dsp" | "output";

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

const TAB_META: { id: VocalSettingsTab; label: string; icon: ReactNode }[] = [
  { id: "engine", label: "Engine", icon: <Cpu size={13} aria-hidden /> },
  { id: "dsp", label: "Mix & DSP", icon: <Waves size={13} aria-hidden /> },
  { id: "output", label: "Output", icon: <SlidersHorizontal size={13} aria-hidden /> },
];

const BITRATE_OPTIONS: VocalBitrate[] = [192, 256, 320];

export function VocalControls({
  settings,
  onPatch,
  onReset,
  disabled = false,
}: {
  settings: VocalSettings;
  onPatch: (patch: Partial<VocalSettings>) => void;
  onReset?: () => void;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<VocalSettingsTab>("engine");
  const activeEngine = getVocalEngineMeta(settings.engineModel);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Vocal separation settings"
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
            <SectionLabel aside={activeEngine.sdr}>GPU separator model</SectionLabel>
            <div className="grid gap-1.5">
              {VOCAL_ENGINE_MODELS.map((model) => {
                const selected = settings.engineModel === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPatch({ engineModel: model.id })}
                    className={`rounded-xl border p-2.5 text-left transition ${chipClass(selected)}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold">{model.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
                          selected ? "bg-white/15 text-white" : "bg-[#f3f3f1] text-muted"
                        }`}
                      >
                        {model.badge}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-[10.5px] leading-snug ${
                        selected ? "text-white/75" : "text-faint"
                      }`}
                    >
                      {model.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Extracted stems</SectionLabel>
            <div className="grid gap-1.5">
              {STEM_OPTIONS.map((opt) => {
                const selected = settings.stems === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPatch({ stems: opt.id })}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${chipClass(
                      selected,
                    )}`}
                  >
                    <div>
                      <p className="text-[12px] font-semibold">{opt.label}</p>
                      <p
                        className={`text-[10.5px] ${selected ? "text-white/75" : "text-faint"}`}
                      >
                        {opt.hint}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "dsp" ? (
        <div className="space-y-4">
          <div>
            <SectionLabel>Sample rate</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {VOCAL_SAMPLE_RATES.map((sr) => {
                const selected = settings.sampleRate === sr.id;
                return (
                  <button
                    key={sr.id}
                    type="button"
                    disabled={disabled}
                    title={sr.hint}
                    onClick={() => onPatch({ sampleRate: sr.id })}
                    className={`h-9 rounded-lg border text-[11.5px] font-semibold transition ${chipClass(
                      selected,
                    )}`}
                  >
                    {sr.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10.5px] text-faint">
              {VOCAL_SAMPLE_RATES.find((r) => r.id === settings.sampleRate)?.hint}
            </p>
          </div>

          <div>
            <SectionLabel>Channel imaging</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(["stereo", "mono"] as VocalChannelMode[]).map((mode) => {
                const selected = settings.channelMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPatch({ channelMode: mode })}
                    className={`h-9 rounded-lg border text-[12px] font-medium capitalize transition ${chipClass(
                      selected,
                    )}`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <PaidToggle
              title="70 Hz vocal high-pass de-bleed"
              description="Trim kick & sub-bass bleed from isolated vocals"
              checked={settings.debleed}
              disabled={disabled}
              onChange={(debleed) => onPatch({ debleed })}
            />
            <PaidToggle
              title="-1.0 dBFS studio peak normalization"
              description="Optimize output loudness cleanly with zero clipping"
              checked={settings.normalize}
              disabled={disabled}
              onChange={(normalize) => onPatch({ normalize })}
            />
            <PaidToggle
              title="Preserve backing harmonies"
              description="Keep soft double-tracks and background vocal layers"
              checked={settings.keepBacking}
              disabled={disabled}
              onChange={(keepBacking) => onPatch({ keepBacking })}
            />
          </div>
        </div>
      ) : null}

      {tab === "output" ? (
        <div className="space-y-4">
          <div>
            <SectionLabel>Download format</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: "mp3", label: "MP3", hint: "Compact portable audio up to 320 kbps" },
                  { id: "wav", label: "WAV (PCM)", hint: "Uncompressed 16-bit lossless studio WAV" },
                ] as { id: VocalOutputFormat; label: string; hint: string }[]
              ).map((fmt) => {
                const selected = settings.format === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    disabled={disabled}
                    title={fmt.hint}
                    onClick={() => onPatch({ format: fmt.id })}
                    className={`h-9 rounded-lg border text-[12px] font-semibold transition ${chipClass(
                      selected,
                    )}`}
                  >
                    {fmt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {settings.format === "mp3" ? (
            <div>
              <SectionLabel>MP3 bitrate</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {BITRATE_OPTIONS.map((br) => {
                  const selected = settings.bitrate === br;
                  return (
                    <button
                      key={br}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPatch({ bitrate: br })}
                      className={`h-9 rounded-lg border text-[11.5px] font-semibold tabular-nums transition ${chipClass(
                        selected,
                      )}`}
                    >
                      {br} kbps
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <PaidToggle
            title="Embed ID3 stem metadata"
            description="Tag extracted files with track name & stem role"
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
          onClick={() => (onReset ? onReset() : onPatch({ ...DEFAULT_VOCAL_SETTINGS }))}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-ink"
        >
          <RotateCcw size={12} aria-hidden />
          Reset defaults
        </button>
      </div>
    </div>
  );
}
