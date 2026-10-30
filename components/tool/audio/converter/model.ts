export type AudioFormat = "mp3" | "wav" | "m4a" | "ogg";
export type ChannelMode = "stereo" | "mono";
export type BitDepth = 16 | 24 | 32;

export type ConverterSettings = {
  format: AudioFormat;
  bitrate: number;
  vbr: boolean;
  sampleRate: number;
  channels: ChannelMode;
  bitDepth: BitDepth;
  normalize: boolean;
  trimSilence: boolean;
  metadata: boolean;
  title: string;
  artist: string;
  outputName: string;
};

export const DEFAULT_CONVERTER_SETTINGS: ConverterSettings = {
  format: "mp3",
  bitrate: 192,
  vbr: false,
  sampleRate: 44100,
  channels: "stereo",
  bitDepth: 16,
  normalize: true,
  trimSilence: false,
  metadata: true,
  title: "",
  artist: "",
  outputName: "",
};

export const AUDIO_FORMATS: {
  value: AudioFormat;
  label: string;
  hint: string;
  lossless: boolean;
  supportsVbr: boolean;
}[] = [
  { value: "mp3", label: "MP3", hint: "Universal", lossless: false, supportsVbr: true },
  { value: "wav", label: "WAV", hint: "Lossless", lossless: true, supportsVbr: false },
  { value: "m4a", label: "M4A", hint: "Apple", lossless: false, supportsVbr: false },
  { value: "ogg", label: "OGG", hint: "Open", lossless: false, supportsVbr: true },
];

export const BITRATES = [64, 96, 128, 192, 320];

export const BIT_DEPTHS: { value: BitDepth; label: string; hint: string }[] = [
  { value: 16, label: "16-bit", hint: "Standard CD" },
  { value: 24, label: "24-bit", hint: "Studio" },
  { value: 32, label: "32-bit", hint: "Float" },
];

export const SAMPLE_RATES = [
  { value: 22050, label: "22.05 kHz" },
  { value: 44100, label: "44.1 kHz" },
  { value: 48000, label: "48 kHz" },
  { value: 96000, label: "96 kHz" },
];

export function isLossless(format: AudioFormat): boolean {
  return format === "wav";
}

export function supportsVbr(format: AudioFormat): boolean {
  return format === "mp3" || format === "ogg";
}

export function formatName(format: AudioFormat): string {
  return AUDIO_FORMATS.find((entry) => entry.value === format)?.label ?? "MP3";
}

/** Rough average bitrate used by the VBR presets, for size estimates. */
export function vbrEquivalentBitrate(format: AudioFormat): number {
  return format === "mp3" ? 190 : 128;
}

export function effectiveBitrate(settings: ConverterSettings): number {
  if (isLossless(settings.format)) return 0;
  return settings.vbr ? vbrEquivalentBitrate(settings.format) : settings.bitrate;
}

export function estimateOutputBytes(settings: ConverterSettings, duration: number): number {
  if (!duration) return 0;
  if (settings.format === "wav") {
    return Math.round(
      duration * settings.sampleRate * (settings.channels === "mono" ? 1 : 2) * (settings.bitDepth / 8),
    );
  }
  const formatFactor = settings.format === "m4a" ? 1.03 : settings.format === "ogg" ? 0.97 : 1;
  return Math.round((duration * effectiveBitrate(settings) * 1000 * formatFactor) / 8);
}

export function bitrateLabel(settings: ConverterSettings): string {
  if (settings.format === "wav") {
    const depth = BIT_DEPTHS.find((entry) => entry.value === settings.bitDepth);
    return depth?.label ?? "16-bit";
  }
  if (settings.vbr) return "VBR";
  return `${settings.bitrate} kbps`;
}

export function safeOutputName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, "-").trim();
  return cleaned || fallback;
}
