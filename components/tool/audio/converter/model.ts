export type AudioFormat = "mp3" | "wav" | "m4a" | "ogg";
export type ChannelMode = "stereo" | "mono";

export type ConverterSettings = {
  format: AudioFormat;
  bitrate: number;
  sampleRate: number;
  channels: ChannelMode;
  normalize: boolean;
  trimSilence: boolean;
  metadata: boolean;
};

export const DEFAULT_CONVERTER_SETTINGS: ConverterSettings = {
  format: "mp3",
  bitrate: 192,
  sampleRate: 44100,
  channels: "stereo",
  normalize: true,
  trimSilence: false,
  metadata: true,
};

export const AUDIO_FORMATS: {
  value: AudioFormat;
  label: string;
  hint: string;
  lossless: boolean;
}[] = [
  { value: "mp3", label: "MP3", hint: "Universal", lossless: false },
  { value: "wav", label: "WAV", hint: "Lossless", lossless: true },
  { value: "m4a", label: "M4A", hint: "Apple", lossless: false },
  { value: "ogg", label: "OGG", hint: "Open", lossless: false },
];

export const BITRATES = [64, 96, 128, 192, 320];

export const SAMPLE_RATES = [
  { value: 22050, label: "22.05 kHz" },
  { value: 44100, label: "44.1 kHz" },
  { value: 48000, label: "48 kHz" },
  { value: 96000, label: "96 kHz" },
];

export function isLossless(format: AudioFormat): boolean {
  return format === "wav";
}

export function formatName(format: AudioFormat): string {
  return AUDIO_FORMATS.find((entry) => entry.value === format)?.label ?? "MP3";
}

export function estimateOutputBytes(settings: ConverterSettings, duration: number): number {
  if (!duration) return 0;
  if (settings.format === "wav") {
    return Math.round(duration * settings.sampleRate * (settings.channels === "mono" ? 1 : 2) * 2);
  }
  const formatFactor = settings.format === "m4a" ? 1.03 : settings.format === "ogg" ? 0.97 : 1;
  return Math.round((duration * settings.bitrate * 1000 * formatFactor) / 8);
}
