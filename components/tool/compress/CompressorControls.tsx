"use client";

import type { CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  Globe,
  Mail,
  ShoppingBag,
  SlidersHorizontal,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type {
  CompressPreset,
  CompressSettings,
  ResizeOption,
  TargetUnit,
} from "./model";
import {
  FORMATS,
  GOALS,
  MAX_QUALITY,
  MIN_QUALITY,
  PRESETS,
  RESIZE_OPTIONS,
  formatBytes,
  formatMeta,
  impliedQuality,
  qualityBand,
  reductionPercent,
  resizeMeta,
  targetBytes,
  targetLabel,
} from "./model";

const PRESET_ICONS = {
  web: Globe,
  email: Mail,
  marketplace: ShoppingBag,
  max: Zap,
} as const;

const TARGET_CHIPS: { value: string; unit: TargetUnit }[] = [
  { value: "50", unit: "KB" },
  { value: "100", unit: "KB" },
  { value: "200", unit: "KB" },
  { value: "500", unit: "KB" },
  { value: "1", unit: "MB" },
];

const PERCENT_CHIPS = [25, 50, 70, 85];

type PanelProps = {
  settings: CompressSettings;
  onPatch: (patch: Partial<CompressSettings>) => void;
};

export function CompressorControls({
  settings,
  presetId,
  onPatch,
  onPreset,
  activeOriginal,
}: {
  settings: CompressSettings;
  presetId: string | null;
  onPatch: (patch: Partial<CompressSettings>) => void;
  onPreset: (preset: CompressPreset) => void;
  activeOriginal: number | null;
}) {
  const format = formatMeta(settings.format);
  const resize = resizeMeta(settings.resize);

  return (
    <div className="space-y-5">
      <section aria-labelledby="compressor-presets">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="compressor-presets" className="text-ui font-semibold text-ink">
            Quick presets
          </h3>
          <span className="text-[10px] text-faint">One tap targets</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.id];
            const selected = presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onPreset(preset)}
                className={`rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "border-ink bg-rail"
                    : "border-line bg-white hover:border-[#d8d4cb] hover:bg-[#fcfbf9]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon
                    size={12}
                    strokeWidth={1.7}
                    aria-hidden
                    className={selected ? "text-ink" : "text-faint"}
                  />
                  <span className="text-[11.5px] font-medium text-ink">{preset.label}</span>
                </span>
                <span className="mt-0.5 block text-[10px] text-faint">{preset.detail}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="compressor-goal">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="compressor-goal" className="text-ui font-semibold text-ink">
            Compression goal
          </h3>
          <span className="text-[10px] text-faint">Applies to all</span>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="compressor-goal"
          className="mt-2 grid grid-cols-3 gap-1 rounded-[10px] border border-line bg-[#f4f2ed] p-1"
        >
          {GOALS.map((goal) => (
            <label key={goal.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="compress-goal"
                value={goal.value}
                checked={settings.goal === goal.value}
                onChange={() => onPatch({ goal: goal.value })}
                className="peer sr-only"
              />
              <span className="block rounded-[7px] py-1.5 text-center text-[11.5px] font-medium text-muted transition-colors peer-checked:bg-white peer-checked:text-ink peer-checked:shadow-[0_1px_2px_rgba(15,15,16,0.08)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                {goal.label}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-3.5">
          {settings.goal === "quality" && <QualityPanel settings={settings} onPatch={onPatch} />}
          {settings.goal === "target" && (
            <TargetPanel
              settings={settings}
              onPatch={onPatch}
              activeOriginal={activeOriginal}
            />
          )}
          {settings.goal === "percent" && <PercentPanel settings={settings} onPatch={onPatch} />}
        </div>
      </section>

      <section aria-labelledby="compressor-output" className="border-t border-line-soft pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="compressor-output" className="text-ui font-semibold text-ink">
            Output
          </h3>
          <span className="text-[10px] text-faint">Free</span>
        </div>

        <div
          role="radiogroup"
          aria-label="Output format"
          className="mt-2 grid grid-cols-5 gap-1"
        >
          {FORMATS.map((option) => (
            <label key={option.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="compress-format"
                value={option.value}
                checked={settings.format === option.value}
                onChange={() => onPatch({ format: option.value })}
                className="peer sr-only"
              />
              <span className="block rounded-[8px] border border-line bg-white py-2 text-center text-[10.5px] font-medium text-muted transition-colors hover:border-[#d8d4cb] peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
                {option.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 min-h-[26px] text-[10px] leading-relaxed text-faint">{format.hint}</p>

        <div className="mt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="compress-resize" className="text-ui font-medium text-ink">
              Max dimension
            </label>
            <span className="text-[10px] text-faint">Longest edge</span>
          </div>
          <span className="relative mt-1.5 block">
            <select
              id="compress-resize"
              value={settings.resize}
              onChange={(event) => onPatch({ resize: event.target.value as ResizeOption })}
              className="h-9 w-full appearance-none rounded-[9px] border border-line bg-white px-2.5 pr-8 text-ui text-ink outline-none transition-colors hover:border-[#d5d1c8] focus:border-[#c3beb4]"
            >
              {RESIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden
            />
          </span>
          <p className="mt-1.5 min-h-[26px] text-[10px] leading-relaxed text-faint">{resize.hint}</p>
        </div>
      </section>

      <details className="group overflow-hidden rounded-[11px] border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
            <SlidersHorizontal size={12} className="text-muted" aria-hidden />
            Advanced settings
          </span>
          <span className="flex items-center gap-1 text-[10px] text-faint">
            6 controls
            <ChevronDown
              size={12}
              className="transition-transform group-open:rotate-180"
              aria-hidden
            />
          </span>
        </summary>

        <div className="space-y-3 border-t border-line-soft bg-[#fdfdfc] p-3">
          <ToggleRow
            label="Never enlarge the file"
            description="Keep the original whenever compression would make it bigger."
            checked={settings.keepSmaller}
            onChange={(checked) => onPatch({ keepSmaller: checked })}
          />
          <ToggleRow
            label="Remove metadata"
            description="Strip camera, GPS and edit history from the output."
            checked={settings.stripMetadata}
            onChange={(checked) => onPatch({ stripMetadata: checked })}
          />

          <div className="grid grid-cols-2 gap-2">
            <MiniSelect
              label="Chroma sampling"
              value={settings.subsampling}
              options={["Auto", "4:4:4", "4:2:2", "4:2:0"]}
              onChange={(value) => onPatch({ subsampling: value })}
            />
            <MiniSelect
              label="Color profile"
              value={settings.colorProfile}
              options={["Keep original", "sRGB", "Display P3", "Grayscale"]}
              onChange={(value) => onPatch({ colorProfile: value })}
            />
          </div>

          <ToggleRow
            label="Progressive encoding"
            description="Load gradually in browsers that support progressive files."
            checked={settings.progressive}
            onChange={(checked) => onPatch({ progressive: checked })}
          />
          <ToggleRow
            label="Sharpen after resizing"
            description="Recover a little crispness when dimensions come down."
            checked={settings.sharpen}
            onChange={(checked) => onPatch({ sharpen: checked })}
          />
        </div>
      </details>

      <p className="border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
        Sizes here are estimates. The encoder reports the exact size and checks it against
        your goal before you download.
      </p>
    </div>
  );
}

function QualityPanel({ settings, onPatch }: PanelProps) {
  const band = qualityBand(settings.quality);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor="compress-quality" className="text-ui font-medium text-ink">
          Quality
        </label>
        <span className="font-display text-[20px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
          {settings.quality}%
        </span>
      </div>
      <input
        id="compress-quality"
        type="range"
        min={MIN_QUALITY}
        max={MAX_QUALITY}
        step={1}
        value={settings.quality}
        onChange={(event) => onPatch({ quality: Number(event.target.value) })}
        aria-valuetext={`${settings.quality} percent quality, ${band.label}`}
        style={rangeFill(settings.quality, MIN_QUALITY, MAX_QUALITY)}
        className="range mt-3"
      />
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>Smallest file</span>
        <span>Best detail</span>
      </div>

      <div className="mt-2.5 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
          <span className="text-[11px] font-medium text-ink">{band.label}</span>
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{band.hint}</p>
      </div>
    </div>
  );
}

function TargetPanel({
  settings,
  onPatch,
  activeOriginal,
}: PanelProps & { activeOriginal: number | null }) {
  const target = targetBytes(settings);
  const label = targetLabel(settings);
  const oversized = activeOriginal !== null && target > 0 && target >= activeOriginal;
  const reduction =
    activeOriginal && target > 0
      ? reductionPercent(activeOriginal, Math.min(target, activeOriginal))
      : null;
  const quality =
    activeOriginal && target > 0
      ? impliedQuality(Math.min(target, activeOriginal) / activeOriginal, settings.format)
      : null;
  const extreme = reduction !== null && reduction > 85;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="compress-target" className="text-ui font-medium text-ink">
          Final size
        </label>
        <span className="text-[10px] text-faint">Per image</span>
      </div>

      <div className="mt-2 flex h-10 items-stretch overflow-hidden rounded-[10px] border border-line bg-white transition-colors focus-within:border-[#c3beb4]">
        <input
          id="compress-target"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={settings.targetValue}
          onChange={(event) =>
            onPatch({
              targetValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 6),
            })
          }
          placeholder="200"
          aria-describedby="compress-target-help"
          className="min-w-0 flex-1 bg-transparent px-3 text-[15px] font-medium tabular-nums text-ink outline-none placeholder:text-faint/70"
        />
        <div className="flex items-center gap-0.5 border-l border-line bg-[#fbfaf7] p-1">
          {(["KB", "MB"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={settings.targetUnit === unit}
              onClick={() => onPatch({ targetUnit: unit })}
              className={`h-full rounded-[7px] px-2 text-[10.5px] font-medium transition-colors ${
                settings.targetUnit === unit
                  ? "bg-ink text-white"
                  : "text-muted hover:text-ink"
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {TARGET_CHIPS.map((chip) => {
          const selected =
            settings.targetValue === chip.value && settings.targetUnit === chip.unit;
          return (
            <button
              key={`${chip.value}-${chip.unit}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onPatch({ targetValue: chip.value, targetUnit: chip.unit })}
              className={`h-7 rounded-full border px-2.5 text-[10.5px] font-medium tabular-nums transition-colors ${
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
              }`}
            >
              {chip.value} {chip.unit}
            </button>
          );
        })}
      </div>

      <div id="compress-target-help" className="mt-2.5">
        {target <= 0 ? (
          <p className="text-[10.5px] leading-relaxed text-muted">
            Enter a final size, for example 200 KB. Quality adjusts automatically to fit.
          </p>
        ) : activeOriginal === null ? (
          <p className="text-[10.5px] leading-relaxed text-muted">
            Each image is tuned to fit {label}. An estimate appears once you add one.
          </p>
        ) : oversized && settings.keepSmaller ? (
          <p className="flex items-start gap-1.5 rounded-[9px] border border-line bg-[#f4f7f1] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#4a6650]">
            <Check size={12} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden />
            <span>
              Already fits — the original is at or below {label}, so it will be kept as-is.
            </span>
          </p>
        ) : oversized ? (
          <p className="flex items-start gap-1.5 rounded-[9px] border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#786344]">
            <TriangleAlert size={12} className="mt-px shrink-0" aria-hidden />
            <span>
              {label} is larger than this image, so the output would grow. Lower the target
              or turn on «Never enlarge the file».
            </span>
          </p>
        ) : extreme ? (
          <p className="flex items-start gap-1.5 rounded-[9px] border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#786344]">
            <TriangleAlert size={12} className="mt-px shrink-0" aria-hidden />
            <span>
              Needs −{reduction}%. That is an extreme target and usually shows visible
              softness. Consider reserving quality first.
            </span>
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-[9px] border border-line bg-[#fbfaf7] px-2.5 py-2 text-[10.5px]">
            <span className="text-muted">
              To reach {label} from{" "}
              {activeOriginal ? formatBytes(activeOriginal) : "the original"}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink">
              {reduction !== null ? `−${reduction}%` : "—"}
              {quality !== null ? ` · ≈${quality}% q` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PercentPanel({ settings, onPatch }: PanelProps) {
  const equivalent = impliedQuality(1 - settings.percent / 100, "jpg");

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor="compress-percent" className="text-ui font-medium text-ink">
          Reduce file size by
        </label>
        <span className="font-display text-[20px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
          {settings.percent}%
        </span>
      </div>
      <input
        id="compress-percent"
        type="range"
        min={10}
        max={95}
        step={5}
        value={settings.percent}
        onChange={(event) => onPatch({ percent: Number(event.target.value) })}
        aria-valuetext={`Reduce file size by ${settings.percent} percent`}
        style={rangeFill(settings.percent, 10, 95)}
        className="range mt-3"
      />
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>Gentle</span>
        <span>Aggressive</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {PERCENT_CHIPS.map((value) => {
          const selected = settings.percent === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onPatch({ percent: value })}
              className={`h-7 rounded-[7px] border text-[10.5px] font-medium tabular-nums transition-colors ${
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:border-[#d8d4cb] hover:text-ink"
              }`}
            >
              −{value}%
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Output keeps about {100 - settings.percent}% of the original size, roughly{" "}
        {equivalent}% equivalent quality.
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#d8d5cf] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
    </label>
  );
}

function MiniSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-muted">{label}</span>
      <span className="relative mt-1 block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full appearance-none rounded-lg border border-line bg-white pl-2 pr-6 text-[11px] text-ink outline-none hover:border-[#d5d1c8]"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={11}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-faint"
          aria-hidden
        />
      </span>
    </label>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = ((value - min) / (max - min)) * 100;
  return { "--fill": `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties;
}


