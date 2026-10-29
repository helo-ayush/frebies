export type TrimFormat = "mp3" | "wav" | "ogg";

export type TrimSettings = {
  format: TrimFormat;
  bitrate: number;
  fadeIn: number;
  fadeOut: number;
  metadata: boolean;
};

export const DEFAULT_TRIM_SETTINGS: TrimSettings = {
  format: "mp3",
  bitrate: 192,
  fadeIn: 0,
  fadeOut: 0,
  metadata: true,
};

export const TRIM_FORMATS: { value: TrimFormat; label: string; hint: string }[] = [
  { value: "mp3", label: "MP3", hint: "Small & universal" },
  { value: "wav", label: "WAV", hint: "Lossless PCM" },
  { value: "ogg", label: "OGG", hint: "Open format" },
];

export const TRIM_BITRATES = [128, 192, 320];

export function trimFormatName(format: TrimFormat): string {
  return TRIM_FORMATS.find((entry) => entry.value === format)?.label ?? "MP3";
}
