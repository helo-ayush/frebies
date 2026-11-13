export type VoiceId = string;
export type VoiceCategory = "all" | "narration" | "conversational" | "storytelling" | "documentary";
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
  temperature: number;
  topP: number;
  preferredStudio: string;
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
  temperature: 0.72,
  topP: 0.8,
  preferredStudio: "auto",
};

export const DRAMA_EXPRESSION_TAGS = [
  { tag: "[calm]", label: "Calm" },
  { tag: "[conversational]", label: "Natural" },
  { tag: "[cheerful]", label: "Cheerful" },
  { tag: "[excited]", label: "Excited" },
  { tag: "[whisper]", label: "Whisper" },
  { tag: "[sigh]", label: "Sigh" },
  { tag: "[laugh]", label: "Laugh" },
  { tag: "[pause]", label: "Pause" },
] as const;

export type VoicePreset = {
  id: VoiceId;
  name: string;
  descriptor: string;
  hint: string;
  seed: number;
  tone: "sage" | "coral" | "ink";
  category: Exclude<VoiceCategory, "all">;
};

export const VOICES: VoicePreset[] = [
  {
    id: "aria",
    name: "Aria",
    descriptor: "Warm · narration",
    hint: "Calm, clear and unhurried.",
    seed: 2,
    tone: "sage",
    category: "narration",
  },
  {
    id: "kai",
    name: "Kai",
    descriptor: "Bright · social",
    hint: "Energetic short-form reads.",
    seed: 5,
    tone: "coral",
    category: "conversational",
  },
  {
    id: "mira",
    name: "Mira",
    descriptor: "Soft · stories",
    hint: "Gentle pacing and warmth.",
    seed: 8,
    tone: "sage",
    category: "storytelling",
  },
  {
    id: "noah",
    name: "Noah",
    descriptor: "Deep · documentary",
    hint: "Measured, low and confident.",
    seed: 11,
    tone: "ink",
    category: "documentary",
  },
  {
    id: "sarah",
    name: "Sarah",
    descriptor: "Soft · news",
    hint: "Clear, steady and reassuring.",
    seed: 14,
    tone: "sage",
    category: "narration",
  },
  {
    id: "laura",
    name: "Laura",
    descriptor: "Upbeat · social",
    hint: "Bright energy for hooks and reels.",
    seed: 17,
    tone: "coral",
    category: "conversational",
  },
  {
    id: "alice",
    name: "Alice",
    descriptor: "British · clear",
    hint: "Crisp UK delivery for explainers.",
    seed: 20,
    tone: "sage",
    category: "narration",
  },
  {
    id: "matilda",
    name: "Matilda",
    descriptor: "Warm · stories",
    hint: "Engaging pacing for long reads.",
    seed: 23,
    tone: "sage",
    category: "storytelling",
  },
  {
    id: "jessica",
    name: "Jessica",
    descriptor: "Lively · natural",
    hint: "Natural rhythm like talking to a friend.",
    seed: 26,
    tone: "coral",
    category: "conversational",
  },
  {
    id: "lily",
    name: "Lily",
    descriptor: "British · story",
    hint: "Rich UK tone for fiction and lore.",
    seed: 29,
    tone: "sage",
    category: "storytelling",
  },
  {
    id: "river",
    name: "River",
    descriptor: "Calm · neutral",
    hint: "Even cadence for tutorials and UI.",
    seed: 32,
    tone: "ink",
    category: "conversational",
  },
  {
    id: "george",
    name: "George",
    descriptor: "British · deep",
    hint: "Rich UK timbre for history and film.",
    seed: 35,
    tone: "ink",
    category: "documentary",
  },
  {
    id: "brian",
    name: "Brian",
    descriptor: "Deep · resonant",
    hint: "Cinematic weight and authority.",
    seed: 38,
    tone: "ink",
    category: "documentary",
  },
  {
    id: "daniel",
    name: "Daniel",
    descriptor: "British · studio",
    hint: "Sharp UK studio clarity.",
    seed: 41,
    tone: "ink",
    category: "narration",
  },
  {
    id: "roger",
    name: "Roger",
    descriptor: "Confident · bold",
    hint: "Poised commercial and launch reads.",
    seed: 44,
    tone: "ink",
    category: "narration",
  },
  {
    id: "charlie",
    name: "Charlie",
    descriptor: "Casual · friendly",
    hint: "Approachable Aussie conversational style.",
    seed: 47,
    tone: "coral",
    category: "conversational",
  },
  {
    id: "callum",
    name: "Callum",
    descriptor: "Gravelly · drama",
    hint: "Gritty intensity for suspense reads.",
    seed: 50,
    tone: "ink",
    category: "documentary",
  },
  {
    id: "liam",
    name: "Liam",
    descriptor: "Crisp · creator",
    hint: "Fast-paced YouTube and explainers.",
    seed: 53,
    tone: "coral",
    category: "conversational",
  },
  {
    id: "will",
    name: "Will",
    descriptor: "Friendly · warm",
    hint: "Easygoing and approachable pacing.",
    seed: 56,
    tone: "sage",
    category: "conversational",
  },
  {
    id: "eric",
    name: "Eric",
    descriptor: "Smooth · steady",
    hint: "Balanced corporate and course voice.",
    seed: 59,
    tone: "sage",
    category: "narration",
  },
  {
    id: "chris",
    name: "Chris",
    descriptor: "Relaxed · chatty",
    hint: "Casual everyday conversational feel.",
    seed: 62,
    tone: "coral",
    category: "conversational",
  },
  {
    id: "bill",
    name: "Bill",
    descriptor: "Mature · steady",
    hint: "Grounded classic documentary storytelling.",
    seed: 65,
    tone: "ink",
    category: "documentary",
  },
  {
    id: "harry",
    name: "Harry",
    descriptor: "Dynamic · vivid",
    hint: "High-energy fiction and character lines.",
    seed: 68,
    tone: "coral",
    category: "storytelling",
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

export function formatElapsedClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export type CustomVoiceInput = {
  name: string;
  audioBase64: string;
  text: string;
  durationLabel?: string;
};

export type SavedCustomVoice = CustomVoiceInput & {
  id: string;
  durationSeconds?: number;
  createdAt: number;
};
