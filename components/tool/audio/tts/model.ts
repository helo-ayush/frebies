export type VoiceId = "aria" | "kai" | "mira" | "noah";
export type TtsLanguage = "en-US" | "en-GB" | "hi-IN" | "es-ES" | "fr-FR";
export type TtsStyle = "neutral" | "conversational" | "narration" | "cheerful";
export type TtsFormat = "mp3" | "wav";

export type TtsSettings = {
  voice: VoiceId;
  language: TtsLanguage;
  style: TtsStyle;
  speed: number;
  pitch: number;
  format: TtsFormat;
  bitrate: number;
  metadata: boolean;
  paragraphPauses: boolean;
  emphasizeNumbers: boolean;
};

export const TTS_MAX_CHARS = 10000;
export const TTS_CREDITS_PER_1K = 1;

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  voice: "aria",
  language: "en-US",
  style: "narration",
  speed: 1,
  pitch: 1,
  format: "mp3",
  bitrate: 192,
  metadata: true,
  paragraphPauses: true,
  emphasizeNumbers: false,
};

export const VOICES: {
  id: VoiceId;
  name: string;
  descriptor: string;
  hint: string;
  seed: number;
  tone: "sage" | "coral" | "ink";
}[] = [
  {
    id: "aria",
    name: "Aria",
    descriptor: "Warm · narration",
    hint: "Calm, clear and unhurried.",
    seed: 2,
    tone: "sage",
  },
  {
    id: "kai",
    name: "Kai",
    descriptor: "Bright · social",
    hint: "Energetic short-form reads.",
    seed: 5,
    tone: "coral",
  },
  {
    id: "mira",
    name: "Mira",
    descriptor: "Soft · stories",
    hint: "Gentle pacing and warmth.",
    seed: 8,
    tone: "sage",
  },
  {
    id: "noah",
    name: "Noah",
    descriptor: "Deep · documentary",
    hint: "Measured, low and confident.",
    seed: 11,
    tone: "ink",
  },
];

export const TTS_LANGUAGES: { value: TtsLanguage; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
];

export const TTS_STYLES: { value: TtsStyle; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "conversational", label: "Conversational" },
  { value: "narration", label: "Narration" },
  { value: "cheerful", label: "Cheerful" },
];

export const TTS_BITRATES = [128, 192, 320];

export const SAMPLE_SCRIPT =
  "Welcome to frebies. This is a short sample script you can preview in your browser, then replace with your own narration. Keep sentences short, land the important words, and give the listener a moment to breathe.";

export function estimateSpeechSeconds(text: string, speed: number): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (!words) return 0;
  return Math.round((words / 150) * 60 / Math.max(0.5, speed));
}

export function speechCredits(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 1000));
}

export function estimateSpeechBytes(
  duration: number,
  format: TtsFormat,
  bitrate: number,
): number {
  if (!duration) return 0;
  if (format === "wav") return Math.round(duration * 44100 * 2);
  return Math.round((duration * bitrate * 1000) / 8);
}

export function voiceMeta(id: VoiceId) {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[0];
}
