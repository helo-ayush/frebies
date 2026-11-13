import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { VoiceId } from "@/components/tool/audio/tts/model";
import { getR2Config, r2GetObjectBuffer } from "@/lib/storage/r2-client";

type VoiceManifestEntry = {
  id: VoiceId;
  name: string;
  description: string;
  file: string;
  text: string;
  durationSec: number;
  sampleRate: number;
};

export type CachedVoiceRef = {
  id: VoiceId;
  audioBuffer: Buffer;
  audioBase64: string;
  contentHash: string;
  text: string;
  name: string;
};

export type CachedVoiceSample = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

const cache = new Map<string, CachedVoiceRef>();
const sampleCache = new Map<string, CachedVoiceSample>();

function readManifestEntry(voiceId: VoiceId): VoiceManifestEntry | null {
  try {
    const manifestPath = path.join(process.cwd(), "lib", "audio", "voices", "manifest.json");
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<
      string,
      VoiceManifestEntry
    >;
    return manifest[voiceId] ?? null;
  } catch {
    return null;
  }
}

/** Load the curated Drama 3 preset reference clip (cached in memory per voice). */
export function getPresetVoiceReference(voiceId: VoiceId): CachedVoiceRef | null {
  const existing = cache.get(voiceId);
  if (existing) return existing;

  try {
    const entry = readManifestEntry(voiceId);
    if (!entry) return null;

    const dir = path.join(process.cwd(), "lib", "audio", "voices");
    const wavPath = path.join(dir, entry.file);
    if (!fs.existsSync(wavPath)) return null;

    const audioBuffer = fs.readFileSync(wavPath);
    const contentHash = crypto
      .createHash("sha256")
      .update(audioBuffer)
      .update(entry.text)
      .digest("hex")
      .slice(0, 12);
    const loaded: CachedVoiceRef = {
      id: voiceId,
      audioBuffer,
      audioBase64: audioBuffer.toString("base64"),
      contentHash,
      text: entry.text,
      name: entry.name,
    };
    cache.set(voiceId, loaded);
    return loaded;
  } catch {
    return null;
  }
}

/** Resolve preset reference WAV from local disk or Tigris/S3 `voices/refs/<id>.wav`. */
export async function getPresetVoiceReferenceAsync(voiceId: VoiceId): Promise<CachedVoiceRef | null> {
  const local = getPresetVoiceReference(voiceId);
  if (local) return local;

  const entry = readManifestEntry(voiceId);
  if (getR2Config().configured) {
    try {
      const remote = await r2GetObjectBuffer(`voices/refs/${voiceId}.wav`);
      if (remote && remote.buffer.length > 0) {
        const text = entry?.text ?? "";
        const contentHash = crypto
          .createHash("sha256")
          .update(remote.buffer)
          .update(text)
          .digest("hex")
          .slice(0, 12);
        const loaded: CachedVoiceRef = {
          id: voiceId,
          audioBuffer: remote.buffer,
          audioBase64: remote.buffer.toString("base64"),
          contentHash,
          text,
          name: entry?.name ?? voiceId,
        };
        cache.set(voiceId, loaded);
        return loaded;
      }
    } catch {
      // Fall through to null if remote fetch fails
    }
  }

  return null;
}

/** Load compressed sample audio for instant UI preview (Tigris primary, local WAV fallback). */
export async function getVoiceSampleAudio(voiceId: VoiceId): Promise<CachedVoiceSample | null> {
  const cached = sampleCache.get(voiceId);
  if (cached) return cached;

  if (getR2Config().configured) {
    try {
      const mp3 = await r2GetObjectBuffer(`voices/samples/${voiceId}.mp3`);
      if (mp3 && mp3.buffer.length > 0) {
        const loaded: CachedVoiceSample = {
          buffer: mp3.buffer,
          mimeType: mp3.contentType || "audio/mpeg",
          fileName: `${voiceId}-sample.mp3`,
        };
        sampleCache.set(voiceId, loaded);
        return loaded;
      }
    } catch {
      // Fall through to local fallback
    }
  }

  const localRef = getPresetVoiceReference(voiceId);
  if (localRef) {
    const loaded: CachedVoiceSample = {
      buffer: localRef.audioBuffer,
      mimeType: "audio/wav",
      fileName: `${voiceId}-sample.wav`,
    };
    sampleCache.set(voiceId, loaded);
    return loaded;
  }

  return null;
}
