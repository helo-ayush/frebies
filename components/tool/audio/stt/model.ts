export type SttLanguage = "auto" | "en" | "hi" | "es" | "fr";
export type SttModel = "fast" | "balanced" | "precise";
export type SttFormat = "txt" | "srt" | "vtt";

export type SttSettings = {
  language: SttLanguage;
  model: SttModel;
  timestamps: boolean;
  speakers: boolean;
  punctuation: boolean;
  format: SttFormat;
};

export const DEFAULT_STT_SETTINGS: SttSettings = {
  language: "auto",
  model: "balanced",
  timestamps: true,
  speakers: true,
  punctuation: true,
  format: "srt",
};

export const STT_LANGUAGES: { value: SttLanguage; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

export const STT_MODELS: { value: SttModel; label: string; hint: string }[] = [
  { value: "fast", label: "Fast", hint: "Quick transcripts for clear speech and short clips." },
  { value: "balanced", label: "Balanced", hint: "The right default for interviews, calls and lectures." },
  { value: "precise", label: "Precise", hint: "Slower, with the strongest accuracy on accents and noise." },
];

export const STT_FORMATS: { value: SttFormat; label: string; hint: string }[] = [
  { value: "txt", label: "TXT", hint: "Plain text, optional times" },
  { value: "srt", label: "SRT", hint: "Subtitles with timestamps" },
  { value: "vtt", label: "VTT", hint: "Web subtitles with cues" },
];

export function sttCredits(duration: number): number {
  return Math.max(2, Math.ceil(duration / 60) * 2);
}
