import type { StorageProviderKind } from "@/lib/storage/generation-store";

export type VocalEngineModel = "bs_roformer" | "kim_vocal_2" | "uvr_mdx_inst_hq3";
export type VocalStemOutputMode = "both" | "vocals" | "instrumental";
export type VocalSampleRate = 44100 | 48000 | 24000;
export type VocalChannelMode = "stereo" | "mono";
export type VocalOutputFormat = "mp3" | "wav";
export type VocalBitrate = 192 | 256 | 320;

/** Legacy aliases preserved for compatibility. */
export type StemMode = VocalStemOutputMode;
export type VocalModel = VocalEngineModel | "hq";
export type AudioFormat = VocalOutputFormat;
export type Bitrate = VocalBitrate;

export type VocalSettings = {
  engineModel: VocalEngineModel;
  stems: VocalStemOutputMode;
  sampleRate: VocalSampleRate;
  channelMode: VocalChannelMode;
  debleed: boolean;
  normalize: boolean;
  keepBacking: boolean;
  format: VocalOutputFormat;
  bitrate: VocalBitrate;
  metadata: boolean;
};

export const VOCAL_COST = 2;

export const DEFAULT_VOCAL_SETTINGS: VocalSettings = {
  engineModel: "bs_roformer",
  stems: "both",
  sampleRate: 44100,
  channelMode: "stereo",
  debleed: true,
  normalize: true,
  keepBacking: true,
  format: "mp3",
  bitrate: 320,
  metadata: true,
};

export type VocalEngineDescriptor = {
  id: VocalEngineModel;
  label: string;
  shortLabel: string;
  badge: string;
  sdr: string;
  hint: string;
};

export const VOCAL_ENGINE_MODELS: VocalEngineDescriptor[] = [
  {
    id: "bs_roformer",
    label: "BS-RoFormer ViperX",
    shortLabel: "BS-RoFormer",
    badge: "Best SDR · Default",
    sdr: "12.9 dB SDR",
    hint: "Flagship band-split RoFormer transformer. Cleanest studio vocal isolation and phase-intact stereo accompaniment.",
  },
  {
    id: "kim_vocal_2",
    label: "Kim Vocal 2 MDX",
    shortLabel: "Kim Vocal 2",
    badge: "Clean Acapella",
    sdr: "11.8 dB SDR",
    hint: "MDX-Net vocal specialist tuned for whisper-clean dry acapella extraction with minimal instrumental bleed.",
  },
  {
    id: "uvr_mdx_inst_hq3",
    label: "UVR-MDX Inst HQ3",
    shortLabel: "MDX Inst HQ3",
    badge: "Clean Karaoke",
    sdr: "11.4 dB SDR",
    hint: "Instrumental-first MDX model preserving punchy drums, stereo sub-bass, and natural hall reverb.",
  },
];

export const STEM_OPTIONS: { id: VocalStemOutputMode; label: string; hint: string }[] = [
  {
    id: "both",
    label: "Both Stems",
    hint: "Extract Vocals + Instrumental for full mixer & dual download",
  },
  {
    id: "vocals",
    label: "Vocals Only",
    hint: "Isolated dry vocal acapella track",
  },
  {
    id: "instrumental",
    label: "Instrumental",
    hint: "Clean karaoke / backing beat without lead vocals",
  },
];

export const VOCAL_SAMPLE_RATES: { id: VocalSampleRate; label: string; hint: string }[] = [
  { id: 44100, label: "44.1 kHz", hint: "Native RoFormer mastering rate" },
  { id: 48000, label: "48 kHz", hint: "Broadcast & video editing rate" },
  { id: 24000, label: "24 kHz", hint: "Lightweight voice / speech clarity" },
];

export type MixerPreset = {
  id: string;
  label: string;
  vocalsGain: number;
  instrumentalGain: number;
  vocalsMuted: boolean;
  instrumentalMuted: boolean;
};

export const MIXER_PRESETS: MixerPreset[] = [
  {
    id: "original",
    label: "Full Mix",
    vocalsGain: 1.0,
    instrumentalGain: 1.0,
    vocalsMuted: false,
    instrumentalMuted: false,
  },
  {
    id: "karaoke",
    label: "Karaoke",
    vocalsGain: 0,
    instrumentalGain: 1.0,
    vocalsMuted: true,
    instrumentalMuted: false,
  },
  {
    id: "acapella",
    label: "Acapella",
    vocalsGain: 1.0,
    instrumentalGain: 0,
    vocalsMuted: false,
    instrumentalMuted: true,
  },
  {
    id: "vocal_boost",
    label: "Vocal +3 dB",
    vocalsGain: 1.35,
    instrumentalGain: 0.72,
    vocalsMuted: false,
    instrumentalMuted: false,
  },
  {
    id: "practice",
    label: "Guide Vocal",
    vocalsGain: 0.28,
    instrumentalGain: 1.0,
    vocalsMuted: false,
    instrumentalMuted: false,
  },
];

export type VocalJobStatus =
  | "queued"
  | "waiting_for_server"
  | "extracting"
  | "separating"
  | "post_processing"
  | "completed"
  | "failed";

export type VocalJobSnapshot = {
  id: string;
  ownerId: string;
  status: VocalJobStatus;
  progress: number;
  stageLabel: string;
  elapsedMs: number;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  ttlMs: number;
  storageProvider: StorageProviderKind | null;
  sourceFileName: string;
  durationSec: number;
  chunkCount: number;
  engineModel: VocalEngineModel;
  modelLabel: string;
  stems: VocalStemOutputMode;
  sampleRate: VocalSampleRate;
  channelMode: VocalChannelMode;
  debleed: boolean;
  normalize: boolean;
  format: VocalOutputFormat;
  bitrate: VocalBitrate;
  vocalsUrl: string | null;
  vocalsDownloadUrl: string | null;
  vocalsFileName: string | null;
  vocalsByteLength: number | null;
  vocalsPeaks: number[];
  instrumentalUrl: string | null;
  instrumentalDownloadUrl: string | null;
  instrumentalFileName: string | null;
  instrumentalByteLength: number | null;
  instrumentalPeaks: number[];
  error: string | null;
};

export function getVocalEngineMeta(id: VocalEngineModel): VocalEngineDescriptor {
  return VOCAL_ENGINE_MODELS.find((m) => m.id === id) ?? VOCAL_ENGINE_MODELS[0];
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatElapsedClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}
