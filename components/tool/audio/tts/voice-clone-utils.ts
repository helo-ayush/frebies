"use client";

import type { SavedCustomVoice } from "./model";

const STORAGE_KEY = "frebies.tts.customVoices.v1";
const MAX_SAVED_VOICES = 4;

export const MAX_CLONE_SECONDS = 20;
const TARGET_CLONE_SAMPLE_RATE = 24_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function encodeMonoWavBytes(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    pos += 2;
  }

  return new Uint8Array(buf);
}

function mixAndResample(decoded: AudioBuffer, maxSeconds: number): {
  samples: Float32Array;
  sampleRate: number;
  durationSeconds: number;
} {
  const srcRate = decoded.sampleRate;
  const maxSrcFrames = Math.min(decoded.length, Math.floor(maxSeconds * srcRate));
  const channels = Math.max(1, decoded.numberOfChannels);

  // Mix down to mono Float32 first
  const mono = new Float32Array(maxSrcFrames);
  for (let ch = 0; ch < channels; ch += 1) {
    const channelData = decoded.getChannelData(ch);
    for (let i = 0; i < maxSrcFrames; i += 1) {
      mono[i] += channelData[i] / channels;
    }
  }

  // Normalize peak gently if very quiet (helps clean voice cloning)
  let peak = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const abs = Math.abs(mono[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.01 && peak < 0.7) {
    const gain = Math.min(4, 0.85 / peak);
    for (let i = 0; i < mono.length; i += 1) {
      mono[i] *= gain;
    }
  }

  if (srcRate <= TARGET_CLONE_SAMPLE_RATE) {
    return {
      samples: mono,
      sampleRate: srcRate,
      durationSeconds: Number((maxSrcFrames / srcRate).toFixed(1)),
    };
  }

  const ratio = srcRate / TARGET_CLONE_SAMPLE_RATE;
  const targetLen = Math.max(1, Math.floor(maxSrcFrames / ratio));
  const resampled = new Float32Array(targetLen);
  for (let i = 0; i < targetLen; i += 1) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(maxSrcFrames - 1, i0 + 1);
    const frac = srcIdx - i0;
    resampled[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }

  return {
    samples: resampled,
    sampleRate: TARGET_CLONE_SAMPLE_RATE,
    durationSeconds: Number((targetLen / TARGET_CLONE_SAMPLE_RATE).toFixed(1)),
  };
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read audio clip."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decode recorded/uploaded audio in-browser and normalize to compact <=20s mono 24 kHz WAV
 * so ModelScope Drama 3 `/v1/voices` receives clean audio well within its 30s limit.
 */
export async function normalizeReferenceAudio(
  input: Blob,
  maxSeconds = MAX_CLONE_SECONDS,
): Promise<{
  audioBase64: string;
  previewUrl: string;
  durationSeconds?: number;
}> {
  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  if (AudioCtx) {
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
      const raw = await input.arrayBuffer();
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      const { samples, sampleRate, durationSeconds } = mixAndResample(decoded, maxSeconds);
      const wavBytes = encodeMonoWavBytes(samples, sampleRate);
      const wavBlob = new Blob([wavBytes.slice().buffer], { type: "audio/wav" });
      return {
        audioBase64: bytesToBase64(wavBytes),
        previewUrl: URL.createObjectURL(wavBlob),
        durationSeconds,
      };
    } catch {
      // Fallback below if browser cannot decode exotic container directly
    } finally {
      if (ctx) {
        void ctx.close().catch(() => {});
      }
    }
  }

  const fallbackB64 = await readBlobAsBase64(input);
  return {
    audioBase64: fallbackB64,
    previewUrl: URL.createObjectURL(input),
  };
}

export function wavBase64ToPreviewUrl(audioBase64: string): string {
  const clean = audioBase64.replace(/^data:[^,]+,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function storageKeyForUser(userId?: string | null): string | null {
  const clean = userId?.trim();
  if (!clean) return null;
  return `${STORAGE_KEY}.${clean}`;
}

export function loadSavedClonedVoices(userId?: string | null): SavedCustomVoice[] {
  if (typeof window === "undefined") return [];
  const key = storageKeyForUser(userId);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedCustomVoice =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as SavedCustomVoice).id === "string" &&
        typeof (item as SavedCustomVoice).name === "string" &&
        typeof (item as SavedCustomVoice).audioBase64 === "string",
    );
  } catch {
    return [];
  }
}

export function persistSavedClonedVoices(voices: SavedCustomVoice[], userId?: string | null): void {
  if (typeof window === "undefined") return;
  const key = storageKeyForUser(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(voices.slice(0, MAX_SAVED_VOICES)),
    );
  } catch {
    // Gracefully ignore if browser localStorage quota is full
  }
}

