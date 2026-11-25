"use client";

import { SlidersHorizontal } from "lucide-react";
import { Field, OptionCard, Segmented } from "@/components/tool/kit";
import { PaidToggle } from "@/components/tool/paid/PaidControls";
import { RailReset } from "@/components/tool/studio/RailControls";
import { RailSection } from "@/components/tool/studio/RailSection";
import {
  DEFAULT_VOCAL_SETTINGS,
  VOCAL_ENGINE_MODELS,
  VOCAL_SAMPLE_RATES,
  type VocalBitrate,
  type VocalChannelMode,
  type VocalEngineModel,
  type VocalOutputFormat,
  type VocalSampleRate,
  type VocalSettings,
  type VocalStemOutputMode,
} from "./model";

const STEM_CHOICES: { value: VocalStemOutputMode; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "vocals", label: "Vocals" },
  { value: "instrumental", label: "Instrumental" },
];

const STEM_HINT: Record<VocalStemOutputMode, string> = {
  both: "Two files",
  vocals: "Acapella only",
  instrumental: "Karaoke track only",
};

/** What each separation model is good at, in plain words. The model name stays as detail. */
const ENGINE_COPY: Record<VocalEngineModel, { title: string; detail: string }> = {
  bs_roformer: { title: "Best overall", detail: "Cleanest vocals and backing track" },
  kim_vocal_2: { title: "Cleanest vocals", detail: "Dry acapella with the least bleed" },
  uvr_mdx_inst_hq3: { title: "Best instrumental", detail: "Keeps drums, bass and reverb intact" },
};

const FORMAT_CHOICES: { value: VocalOutputFormat; label: string }[] = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
];

const BITRATE_OPTIONS: VocalBitrate[] = [192, 256, 320];

const SAMPLE_RATE_HINT: Record<VocalSampleRate, string> = {
  44100: "Standard for music",
  48000: "Matches video projects",
  24000: "Smaller files, fine for speech",
};

const CHANNEL_CHOICES: { value: VocalChannelMode; label: string }[] = [
  { value: "stereo", label: "Stereo" },
  { value: "mono", label: "Mono" },
];

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
  return (
    // A disabled fieldset locks every control inside it while a track is uploading.
    <fieldset
      disabled={disabled}
      className={`min-w-0 transition-opacity ${disabled ? "opacity-60" : ""}`}
    >
      <div className="space-y-7 pb-7">
      <Field label="What you need" hint={STEM_HINT[settings.stems]}>
        <Segmented
          label="Stems to extract"
          options={STEM_CHOICES}
          value={settings.stems}
          onChange={(stems) => onPatch({ stems })}
        />
      </Field>

      <Field label="Tuned for">
        <div className="space-y-2">
          {VOCAL_ENGINE_MODELS.map((model) => {
            const copy = ENGINE_COPY[model.id];
            return (
              <OptionCard
                key={model.id}
                active={settings.engineModel === model.id}
                title={copy.title}
                detail={`${copy.detail} · ${model.shortLabel}`}
                onClick={() => onPatch({ engineModel: model.id })}
              />
            );
          })}
        </div>
      </Field>

      <Field label="File format" hint={settings.format === "mp3" ? "Smaller files" : "Lossless, larger files"}>
        <Segmented
          label="File format"
          options={FORMAT_CHOICES}
          value={settings.format}
          onChange={(format) => onPatch({ format })}
        />
        {settings.format === "mp3" ? (
          <Segmented
            className="mt-2"
            label="MP3 bitrate"
            options={BITRATE_OPTIONS.map((bitrate) => ({
              value: String(bitrate),
              label: `${bitrate} kbps`,
            }))}
            value={String(settings.bitrate)}
            onChange={(bitrate) => onPatch({ bitrate: Number(bitrate) as VocalBitrate })}
          />
        ) : null}
      </Field>

      </div>

      <div className="-mx-4 border-t border-line px-4 sm:-mx-5 sm:px-5">
      <RailSection icon={SlidersHorizontal} title="Fine-tuning" defaultOpen={false}>
        <div className="space-y-6">
          <Field label="Sample rate" hint={SAMPLE_RATE_HINT[settings.sampleRate]}>
            <Segmented
              label="Sample rate"
              options={VOCAL_SAMPLE_RATES.map((rate) => ({
                value: String(rate.id),
                label: rate.label,
              }))}
              value={String(settings.sampleRate)}
              onChange={(rate) => onPatch({ sampleRate: Number(rate) as VocalSampleRate })}
            />
          </Field>

          <Field label="Channels">
            <Segmented
              label="Channels"
              options={CHANNEL_CHOICES}
              value={settings.channelMode}
              onChange={(channelMode) => onPatch({ channelMode })}
            />
          </Field>

          <div className="space-y-4">
            <PaidToggle
              title="Cut bass bleed from vocals"
              description="Filters kick and sub-bass below 70 Hz out of the vocal track."
              checked={settings.debleed}
              onChange={(debleed) => onPatch({ debleed })}
            />
            <PaidToggle
              title="Even out the volume"
              description="Raises each track to a peak of -1 dB without clipping."
              checked={settings.normalize}
              onChange={(normalize) => onPatch({ normalize })}
            />
            <PaidToggle
              title="Keep backing vocals"
              description="Preserves harmonies and doubled background vocals."
              checked={settings.keepBacking}
              onChange={(keepBacking) => onPatch({ keepBacking })}
            />
            <PaidToggle
              title="Tag the files"
              description="Writes the track name and stem type into each file."
              checked={settings.metadata}
              onChange={(metadata) => onPatch({ metadata })}
            />
          </div>
        </div>
      </RailSection>

      </div>

      <div className="pt-2">
        <RailReset
          label="Reset to defaults"
          onClick={() => (onReset ? onReset() : onPatch({ ...DEFAULT_VOCAL_SETTINGS }))}
        />
      </div>
    </fieldset>
  );
}
