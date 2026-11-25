"use client";

import { Cpu, FileImage, Wand2 } from "lucide-react";
import { Field, OptionCard, Segmented } from "@/components/tool/kit";
import { PaidSlider, PaidToggle } from "@/components/tool/paid/PaidControls";
import { RailSection } from "@/components/tool/studio/RailSection";
import { RailColors, RailHint, RailLabel, RailPick, RailReset } from "@/components/tool/studio/RailControls";
import {
  DEFAULT_UPSCALE_SETTINGS,
  FREE_UPSCALE_MODELS,
  PRO_UPSCALE_MODEL,
  UPSCALE_ENHANCE_PRESETS,
  UPSCALE_FORMATS,
  UPSCALE_PROFILES,
  UPSCALE_TARGET_PRESETS,
  getUpscaleModelMeta,
  upscaleCredits,
  upscaleTarget,
  type UpscaleContentProfile,
  type UpscaleEngineModel,
  type UpscaleFactor,
  type UpscaleFormat,
  type UpscaleSettings,
  type UpscaleTargetPreset,
  type UpscaleTier,
} from "./model";

const FACTOR_OPTIONS = [
  { value: "2", label: "2×" },
  { value: "4", label: "4×" },
] as const;

/** Short labels for the size cap; the full wording stays in the tooltip. */
const CAP_LABELS: Record<UpscaleTargetPreset, string> = {
  exact: "Off",
  "1080p": "1080p",
  "2k": "2K",
  "4k": "4K",
};

/** What each free model is good at. The model name is shown underneath. */
const MODEL_BENEFITS: Record<UpscaleEngineModel, string> = {
  ultrasharp_v2_lite: "Fast all-rounder",
  ultrasharp_v2: "More photo detail",
  omnisr: "Anime, line art and UI",
  hat: "Small text and hard edges",
  realesrgan: "Noisy or compressed photos",
  ultrasharp: "General graphics",
  seedvr2_3b: "Best detail",
};

const CLEANUP_LABELS: Record<string, string> = {
  clean: "Remove noise",
  raw: "No clean-up",
};

const BACKDROPS = [
  { label: "White", value: "#ffffff" },
  { label: "Paper", value: "#f7f7f5" },
  { label: "Black", value: "#111113" },
];

function recommendedModelForProfile(profile: UpscaleContentProfile): UpscaleEngineModel {
  if (profile === "illustration") return "omnisr";
  if (profile === "product") return "hat";
  if (profile === "portrait") return "ultrasharp_v2";
  if (profile === "cinema") return "realesrgan";
  return "ultrasharp_v2_lite";
}

function creditsLabel(count: number) {
  return `${count} ${count === 1 ? "credit" : "credits"}`;
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
  const activeModel = getUpscaleModelMeta(settings.engineModel);
  const activeProfile = UPSCALE_PROFILES.find((profile) => profile.value === settings.profile);
  const activeFormat = UPSCALE_FORMATS.find((format) => format.value === settings.format);
  const activeCleanup = UPSCALE_ENHANCE_PRESETS.find(
    (preset) =>
      settings.denoise === preset.denoise &&
      settings.sharpen === preset.sharpen &&
      settings.colorFix === preset.colorFix &&
      settings.face === preset.face,
  );
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
    <fieldset
      disabled={disabled}
      aria-label="Upscaler settings"
      className="m-0 min-w-0 border-0 p-0"
    >
      <div className="space-y-7 pb-7">
        <Field label="Quality">
          <div className="space-y-2">
            <OptionCard
              active={settings.tier === "free"}
              title={
                <span className="flex items-baseline justify-between gap-2">
                  <span>Fast</span>
                  <span className="fb-num text-[13px] font-normal opacity-65">
                    {creditsLabel(upscaleCredits("free", settings.factor))}
                  </span>
                </span>
              }
              detail="Sharp, clean result in a few seconds."
              onClick={() => selectTier("free")}
            />
            <OptionCard
              active={settings.tier === "pro"}
              title={
                <span className="flex items-baseline justify-between gap-2">
                  <span>Best detail</span>
                  <span className="fb-num text-[13px] font-normal opacity-65">
                    {creditsLabel(upscaleCredits("pro", settings.factor))}
                  </span>
                </span>
              }
              detail="Rebuilds faces, skin and fine texture. Slower."
              onClick={() => selectTier("pro")}
            />
          </div>
          {settings.tier === "pro" && !proUpscalerReady ? (
            <RailHint>The first Best detail run needs a short warm-up.</RailHint>
          ) : null}
        </Field>

        <Field
          label="Scale"
          hint={hasImage && targetDims.width ? `${targetDims.width} × ${targetDims.height}` : undefined}
        >
          <Segmented
            label="Scale"
            options={FACTOR_OPTIONS}
            value={String(settings.factor) as "2" | "4"}
            onChange={(value) => onPatch({ factor: Number(value) as UpscaleFactor })}
          />
        </Field>

        <Field label="Limit the longest side">
          <Segmented
            label="Limit the longest side"
            options={UPSCALE_TARGET_PRESETS.map((preset) => ({
              value: preset.value,
              label: CAP_LABELS[preset.value],
              title: preset.hint,
            }))}
            value={settings.targetPreset}
            onChange={(targetPreset) => onPatch({ targetPreset })}
          />
        </Field>

        <Field label="Image type">
          <RailPick
            label="Image type"
            columns={3}
            value={settings.profile}
            options={UPSCALE_PROFILES.map((profile) => ({ value: profile.value, label: profile.label }))}
            onChange={selectProfile}
          />
          {activeProfile ? <RailHint>{activeProfile.hint}</RailHint> : null}
        </Field>
      </div>

      <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
        <RailSection
          icon={Wand2}
          title="Clean-up"
          aside={activeCleanup ? (CLEANUP_LABELS[activeCleanup.id] ?? activeCleanup.label) : "Custom"}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <RailPick
              label="Clean-up presets"
              columns={2}
              value={activeCleanup?.id}
              options={UPSCALE_ENHANCE_PRESETS.map((preset) => ({
                value: preset.id,
                label: CLEANUP_LABELS[preset.id] ?? preset.label,
              }))}
              onChange={(id) => {
                const preset = UPSCALE_ENHANCE_PRESETS.find((entry) => entry.id === id);
                if (preset) {
                  onPatch({
                    denoise: preset.denoise,
                    sharpen: preset.sharpen,
                    colorFix: preset.colorFix,
                    face: preset.face,
                  });
                }
              }}
            />

            <PaidSlider
              label="Noise removal"
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
              label="Sharpening"
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

            <PaidToggle
              title="Restore faces"
              description="Clearer eyes, skin and hair in portraits."
              checked={settings.face}
              disabled={disabled}
              onChange={(face) => onPatch({ face })}
            />
            <PaidToggle
              title="Keep original colors"
              description="Holds skin tones and white balance steady."
              checked={settings.colorFix}
              disabled={disabled}
              onChange={(colorFix) => onPatch({ colorFix })}
            />
          </div>
        </RailSection>

        <RailSection
          icon={FileImage}
          title="File format"
          aside={activeFormat?.label ?? settings.format.toUpperCase()}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <div>
              <Segmented
                label="File format"
                options={UPSCALE_FORMATS.map((format) => ({
                  value: format.value,
                  label: format.label,
                }))}
                value={settings.format}
                onChange={(format: UpscaleFormat) => onPatch({ format })}
              />
              {activeFormat ? <RailHint>{activeFormat.hint}</RailHint> : null}
            </div>

            {settings.format !== "png" ? (
              <PaidSlider
                label="Quality"
                value={settings.quality}
                min={60}
                max={100}
                step={1}
                suffix="%"
                left="Smaller file"
                right="Best quality"
                disabled={disabled}
                onChange={(quality) => onPatch({ quality })}
              />
            ) : null}

            {settings.format !== "jpg" ? (
              <PaidToggle
                title="Keep transparency"
                description="Transparent areas stay transparent."
                checked={settings.transparency}
                disabled={disabled}
                onChange={(transparency) => onPatch({ transparency })}
              />
            ) : null}

            {settings.format === "jpg" || !settings.transparency ? (
              <div>
                <RailLabel value={settings.backgroundColor}>Background fill</RailLabel>
                <RailColors
                  label="Background fill"
                  presets={BACKDROPS}
                  value={settings.backgroundColor}
                  onChange={(backgroundColor) => onPatch({ backgroundColor })}
                />
              </div>
            ) : null}

            <PaidToggle
              title="Keep photo details"
              description="Camera data and the color profile stay in the file."
              checked={settings.metadata}
              disabled={disabled}
              onChange={(metadata) => onPatch({ metadata })}
            />
          </div>
        </RailSection>

        <RailSection icon={Cpu} title="Model" aside={MODEL_BENEFITS[settings.engineModel]} defaultOpen={false}>
          {settings.tier === "pro" ? (
            <p className="text-[13.5px] leading-relaxed text-muted">
              Best detail always runs on one model ({PRO_UPSCALE_MODEL.label}). Switch to Fast to choose
              between models.
            </p>
          ) : (
            <div className="space-y-2">
              {FREE_UPSCALE_MODELS.map((model) => (
                <OptionCard
                  key={model.id}
                  active={settings.engineModel === model.id}
                  title={MODEL_BENEFITS[model.id]}
                  detail={model.label}
                  onClick={() =>
                    onPatch({
                      engineModel: model.id,
                      profile: model.recommendedProfile,
                    })
                  }
                />
              ))}
              <RailHint>
                Picking an image type chooses a model for you. Now using {activeModel.label}.
              </RailHint>
            </div>
          )}
        </RailSection>
      </div>

      <div className="pt-2">
        <RailReset
          label="Reset to defaults"
          onClick={() => (onReset ? onReset() : onPatch({ ...DEFAULT_UPSCALE_SETTINGS }))}
        />
      </div>
    </fieldset>
  );
}
