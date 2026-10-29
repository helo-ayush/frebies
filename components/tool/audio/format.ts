export function formatTime(seconds: number, precise = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const minutes = Math.floor(seconds / 60);
  const whole = Math.floor(seconds % 60);
  if (!precise) {
    return `${minutes}:${String(whole).padStart(2, "0")}`;
  }
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes}:${String(whole).padStart(2, "0")}.${tenths}`;
}

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }
  const match = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  const fraction = match[3] ? Number.parseFloat(`0.${match[3]}`) : 0;
  return minutes * 60 + seconds + fraction;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function estimateEncodedBytes(duration: number, bitrateKbps: number): number {
  return Math.max(0, Math.round((duration * bitrateKbps * 1000) / 8));
}

export function estimatePcmBytes(
  duration: number,
  sampleRate: number,
  channels: number,
  bits = 16,
): number {
  return Math.max(0, Math.round(duration * sampleRate * channels * (bits / 8)));
}

export function fileFormatLabel(file: { name: string; type: string }): string {
  const extension = file.name.split(".").pop()?.toUpperCase();
  if (extension) return extension;
  if (file.type === "audio/mpeg") return "MP3";
  if (file.type === "audio/wav" || file.type === "audio/x-wav") return "WAV";
  if (file.type === "audio/ogg") return "OGG";
  if (file.type.includes("m4a") || file.type === "audio/mp4") return "M4A";
  return "AUDIO";
}

export function creditsForCharacters(characters: number): number {
  return Math.max(1, Math.ceil(characters / 1000));
}

export function creditsForMinutes(durationSeconds: number, creditsPerMinute: number): number {
  return Math.max(creditsPerMinute, Math.ceil(durationSeconds / 60) * creditsPerMinute);
}
