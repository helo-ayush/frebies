export type StemMode = "two" | "four";
export type StemModel = "fast" | "balanced" | "best";
export type StemFormat = "wav" | "mp3";

export type VocalSettings = {
  mode: StemMode;
  model: StemModel;
  format: StemFormat;
  bitrate: number;
  backingVocals: boolean;
  normalize: boolean;
  metadata: boolean;
};

export const DEFAULT_VOCAL_SETTINGS: VocalSettings = {
  mode: "two",
  model: "balanced",
  format: "wav",
  bitrate: 320,
  backingVocals: true,
  normalize: true,
  metadata: true,
};

export const STEM_MODELS: { value: StemModel; label: string; hint: string }[] = [
  { value: "fast", label: "Fast", hint: "Quick separation for previews and short clips." },
  { value: "balanced", label: "Balanced", hint: "Clean stems for most songs and recordings." },
  { value: "best", label: "Best", hint: "The cleanest separation, with a longer run." },
];

export const STEM_FORMATS: { value: StemFormat; label: string; hint: string }[] = [
  { value: "wav", label: "WAV", hint: "Lossless stems, ready to mix" },
  { value: "mp3", label: "MP3", hint: "Smaller, compressed stems" },
];

export const STEM_BITRATES = [192, 256, 320];

export function stemCredits(duration: number): number {
  return Math.max(4, Math.ceil(duration / 60) * 4);
}

export const STEMS = {
  two: [
    { id: "vocals", label: "Vocals", hint: "Lead and backing voices", seed: 3, tone: "coral" as const },
    { id: "instrumental", label: "Instrumental", hint: "Everything else", seed: 7, tone: "sage" as const },
  ],
  four: [
    { id: "vocals", label: "Vocals", hint: "Lead and backing voices", seed: 3, tone: "coral" as const },
    { id: "drums", label: "Drums", hint: "Kit and percussion", seed: 5, tone: "ink" as const },
    { id: "bass", label: "Bass", hint: "Low end and sub", seed: 9, tone: "sage" as const },
    { id: "other", label: "Other", hint: "Keys, guitars and more", seed: 13, tone: "sage" as const },
  ],
};
