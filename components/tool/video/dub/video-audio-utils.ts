"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  DUB_TRIP_DURATION_SEC,
  DURATION_MATCH_TOLERANCE_SEC,
  MAX_DUB_DURATION_SEC,
  computeDubTripWindows,
  getIso639_2Code,
  stripDramaTagsForSubtitles,
  type DubBindAudioMode,
  type DubBindSubtitleMode,
  type DubSegment,
  type VadReferenceInfo,
} from "@/lib/video/dub-types";

const FFMPEG_MODULE_URL = "/vendor/ffmpeg/index.js";
const CORE_BASES = [
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm",
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
];

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

async function downloadBlobUrl(url: string, mime: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mime }));
}

export async function getSharedBrowserFfmpeg(
  onProgress?: (label: string) => void,
): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    onProgress?.("Loading browser FFmpeg media engine...");
    const mod = (await import(/* webpackIgnore: true */ FFMPEG_MODULE_URL)) as {
      FFmpeg: typeof FFmpeg;
    };
    let lastError: unknown = null;

    for (const base of CORE_BASES) {
      try {
        const [coreURL, wasmURL] = await Promise.all([
          downloadBlobUrl(`${base}/ffmpeg-core.js`, "text/javascript"),
          downloadBlobUrl(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        ]);
        const ff = new mod.FFmpeg();
        await ff.load({ coreURL, wasmURL });
        ffmpegSingleton = ff;
        return ff;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `Could not load browser FFmpeg core (${lastError instanceof Error ? lastError.message : "network error"}).`,
    );
  })();

  try {
    return await ffmpegLoading;
  } finally {
    ffmpegLoading = null;
  }
}

export type MediaProbeMeta = {
  kind: "video" | "audio";
  duration: number;
  width: number;
  height: number;
};

const AUDIO_FILE_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma)$/i;
const VIDEO_FILE_EXT = /\.(mp4|mov|webm|mkv|avi|m4v|ts)$/i;

export function detectMediaKind(file: File): "video" | "audio" | null {
  if (file.type.startsWith("audio/") || AUDIO_FILE_EXT.test(file.name)) return "audio";
  if (file.type.startsWith("video/") || VIDEO_FILE_EXT.test(file.name)) return "video";
  return null;
}

export function probeMediaFile(file: File): Promise<MediaProbeMeta> {
  const kind = detectMediaKind(file) ?? "video";
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    el.preload = "metadata";
    el.muted = true;
    if ("playsInline" in el) {
      (el as HTMLVideoElement).playsInline = true;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out reading ${kind} metadata.`));
    }, 10_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };

    el.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      const width = kind === "video" ? (el as HTMLVideoElement).videoWidth || 0 : 0;
      const height = kind === "video" ? (el as HTMLVideoElement).videoHeight || 0 : 0;
      cleanup();
      if (!duration) {
        reject(new Error(`Could not read ${kind} duration. Ensure the file has a valid media stream.`));
        return;
      }
      resolve({ kind, duration, width, height });
    };

    el.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          kind === "video"
            ? "Browser could not inspect this video directly; trying FFmpeg extraction..."
            : "Browser could not inspect this audio directly; trying FFmpeg conversion...",
        ),
      );
    };

    el.src = url;
  });
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    pos += 2;
  }
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mixAudioBufferToMono(
  audioBuffer: AudioBuffer,
  startSec = 0,
  endSec = audioBuffer.duration,
): Float32Array {
  const sr = audioBuffer.sampleRate;
  const startFrame = Math.max(0, Math.floor(startSec * sr));
  const endFrame = Math.min(audioBuffer.length, Math.ceil(endSec * sr));
  const count = Math.max(1, endFrame - startFrame);
  const mono = new Float32Array(count);
  const chCount = Math.max(1, audioBuffer.numberOfChannels);

  for (let ch = 0; ch < chCount; ch += 1) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < count; i += 1) {
      mono[i] += data[startFrame + i] / chCount;
    }
  }
  return mono;
}

function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

export type BrowserAudioTrip = {
  tripIndex: number;
  totalTrips: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  label: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
};

export type NormalizedBrowserAudio = {
  uploadBlob: Blob;
  uploadFileName: string;
  uploadMimeType: string;
  durationSeconds: number;
  audioBuffer: AudioBuffer | null;
  codecConverted: boolean;
  trips: BrowserAudioTrip[];
};

/**
 * Extract ONLY the audio track from the uploaded video/audio in the user's browser so heavy video
 * never hits our servers or Tigris storage. For media over 30 minutes (up to 2 hours = 4 trips),
 * extracts audio initially in clean 30-minute trips so long videos are never converted or uploaded
 * as a single monolithic pass.
 */
export async function extractAndNormalizeAudioForServer(
  file: File,
  durationHintSec = 0,
  onProgress?: (label: string, percent: number) => void,
): Promise<NormalizedBrowserAudio> {
  const isAudioFile = detectMediaKind(file) === "audio";
  const baseStem = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-") || "media";

  onProgress?.("Checking audio codec in browser...", 10);

  let decoded: AudioBuffer | null = null;
  let needsFfmpegConversion =
    file.size > 45 * 1024 * 1024 ||
    !isAudioFile ||
    durationHintSec > DUB_TRIP_DURATION_SEC + 30;

  if (file.size <= 120 * 1024 * 1024 && durationHintSec <= DUB_TRIP_DURATION_SEC + 30) {
    const ctx = new AudioContext();
    try {
      const buf = await file.arrayBuffer();
      decoded = await ctx.decodeAudioData(buf);
      if (decoded.duration > MAX_DUB_DURATION_SEC + 5) {
        throw new Error("Media duration exceeds the maximum 2-hour (120 minute) limit.");
      }

      if (decoded.duration <= DUB_TRIP_DURATION_SEC + 30) {
        const singleLabel = `Trip 1/1 (0m–${Math.max(1, Math.ceil(decoded.duration / 60))}m)`;
        if (isAudioFile && file.size <= 18 * 1024 * 1024 && /\.(mp3|wav|m4a|ogg)$/i.test(file.name)) {
          const mime = file.type || "audio/mpeg";
          return {
            uploadBlob: file,
            uploadFileName: file.name,
            uploadMimeType: mime,
            durationSeconds: decoded.duration,
            audioBuffer: decoded,
            codecConverted: false,
            trips: [
              {
                tripIndex: 0,
                totalTrips: 1,
                startSec: 0,
                endSec: Number(decoded.duration.toFixed(2)),
                durationSec: Number(decoded.duration.toFixed(2)),
                label: singleLabel,
                blob: file,
                fileName: file.name,
                mimeType: mime,
              },
            ],
          };
        }

        if (decoded.duration <= 6 * 60) {
          onProgress?.("Normalizing extracted audio waveform in browser...", 28);
          const mono = mixAudioBufferToMono(decoded, 0, decoded.duration);
          const resampled = resampleLinear(mono, decoded.sampleRate, 24_000);
          const wavBytes = encodeMonoWav(resampled, 24_000);
          if (wavBytes.byteLength <= 22 * 1024 * 1024) {
            const safeBuf = new Uint8Array(wavBytes).buffer;
            const uploadBlob = new Blob([safeBuf], { type: "audio/wav" });
            const uploadFileName = `${baseStem}-audio.wav`;
            return {
              uploadBlob,
              uploadFileName,
              uploadMimeType: "audio/wav",
              durationSeconds: decoded.duration,
              audioBuffer: decoded,
              codecConverted: !isAudioFile,
              trips: [
                {
                  tripIndex: 0,
                  totalTrips: 1,
                  startSec: 0,
                  endSec: Number(decoded.duration.toFixed(2)),
                  durationSec: Number(decoded.duration.toFixed(2)),
                  label: singleLabel,
                  blob: uploadBlob,
                  fileName: uploadFileName,
                  mimeType: "audio/wav",
                },
              ],
            };
          }
        }
      }
      needsFfmpegConversion = true;
    } catch (err) {
      if (err instanceof Error && /2-hour|120 minute/i.test(err.message)) {
        throw err;
      }
      needsFfmpegConversion = true;
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  if (needsFfmpegConversion) {
    const knownDuration = decoded?.duration || durationHintSec;
    if (knownDuration > MAX_DUB_DURATION_SEC + 5) {
      throw new Error("Media duration exceeds the maximum 2-hour (120 minute) limit.");
    }

    const isMultiTrip = knownDuration > DUB_TRIP_DURATION_SEC + 30;
    const windows = isMultiTrip
      ? computeDubTripWindows(knownDuration, DUB_TRIP_DURATION_SEC)
      : [
          {
            tripIndex: 0,
            totalTrips: 1,
            startSec: 0,
            endSec: knownDuration > 0 ? knownDuration : 0,
            durationSec: knownDuration > 0 ? knownDuration : 0,
            label: knownDuration > 0 ? `Trip 1/1 (0m–${Math.max(1, Math.ceil(knownDuration / 60))}m)` : "Trip 1/1",
          },
        ];

    onProgress?.(
      isMultiTrip
        ? `Preparing ${windows.length} × 30-min audio trips in browser (zero video upload)...`
        : "Converting & compressing audio codec in browser (zero video upload)...",
      18,
    );
    const ff = await getSharedBrowserFfmpeg((msg) => onProgress?.(msg, 20));
    const ext = file.name.split(".").pop()?.toLowerCase() || (isAudioFile ? "mp3" : "mp4");
    const inName = `extract_in.${ext}`;
    const outMp3Name = "extract_out.mp3";
    const outWavName = "extract_out.wav";
    const concatListName = "trip_concat.txt";
    const tempFilesToClean = new Set<string>([inName, outMp3Name, outWavName, concatListName]);

    const bytes = new Uint8Array(await file.arrayBuffer());
    await ff.writeFile(inName, bytes);

    try {
      if (windows.length > 1) {
        const extractedTrips: BrowserAudioTrip[] = [];
        const concatLines: string[] = [];
        const byteChunks: Uint8Array[] = [];

        for (const win of windows) {
          onProgress?.(
            `Extracting ${win.label} in browser...`,
            22 + Math.round((win.tripIndex / windows.length) * 32),
          );
          const tripFile = `trip_${win.tripIndex}.mp3`;
          tempFilesToClean.add(tripFile);

          const exitCode = await ff.exec([
            "-y",
            "-ss",
            win.startSec.toFixed(2),
            "-t",
            win.durationSec.toFixed(2),
            "-i",
            inName,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "48k",
            tripFile,
          ]);
          if (exitCode !== 0) {
            throw new Error(`Could not extract ${win.label} audio stream from this file.`);
          }

          const rawTrip = await ff.readFile(tripFile);
          const tripBytes =
            rawTrip instanceof Uint8Array ? new Uint8Array(rawTrip) : new TextEncoder().encode(String(rawTrip));
          if (tripBytes.byteLength >= 256) {
            byteChunks.push(tripBytes);
            concatLines.push(`file '${tripFile}'`);
            extractedTrips.push({
              tripIndex: extractedTrips.length,
              totalTrips: windows.length,
              startSec: win.startSec,
              endSec: win.endSec,
              durationSec: win.durationSec,
              label: win.label,
              blob: new Blob([tripBytes.buffer], { type: "audio/mpeg" }),
              fileName: `${baseStem}-trip-${win.tripIndex + 1}.mp3`,
              mimeType: "audio/mpeg",
            });
          }
        }

        if (extractedTrips.length === 0) {
          throw new Error("No audible audio stream was found inside this file.");
        }

        await ff.writeFile(concatListName, new TextEncoder().encode(concatLines.join("\n")));
        const concatExit = await ff.exec([
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          concatListName,
          "-c",
          "copy",
          outMp3Name,
        ]);

        let combinedBlob: Blob;
        if (concatExit === 0) {
          const rawCombined = await ff.readFile(outMp3Name);
          const combinedBytes =
            rawCombined instanceof Uint8Array
              ? new Uint8Array(rawCombined)
              : new TextEncoder().encode(String(rawCombined));
          combinedBlob = new Blob([combinedBytes.buffer], { type: "audio/mpeg" });
        } else {
          combinedBlob = new Blob(
            byteChunks.map((c) => new Uint8Array(c).buffer),
            { type: "audio/mpeg" },
          );
        }

        return {
          uploadBlob: combinedBlob,
          uploadFileName: `${baseStem}-audio.mp3`,
          uploadMimeType: "audio/mpeg",
          durationSeconds: knownDuration,
          audioBuffer: decoded,
          codecConverted: true,
          trips: extractedTrips.map((tr, i) => ({
            ...tr,
            tripIndex: i,
            totalTrips: extractedTrips.length,
          })),
        };
      }

      onProgress?.("Transcoding audio stream in browser...", 35);
      let exitCode = await ff.exec([
        "-y",
        "-i",
        inName,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        outMp3Name,
      ]);

      let outName = outMp3Name;
      let outMime = "audio/mpeg";
      let outFileName = `${baseStem}-audio.mp3`;

      if (exitCode !== 0) {
        exitCode = await ff.exec([
          "-y",
          "-i",
          inName,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "pcm_s16le",
          outWavName,
        ]);
        if (exitCode !== 0) {
          throw new Error("Could not extract an audio track from this file. Check that it contains audio.");
        }
        outName = outWavName;
        outMime = "audio/wav";
        outFileName = `${baseStem}-audio.wav`;
      }

      const rawOut = await ff.readFile(outName);
      const outBytes =
        rawOut instanceof Uint8Array ? new Uint8Array(rawOut) : new TextEncoder().encode(String(rawOut));
      const safeBuffer = new Uint8Array(outBytes).buffer;
      const uploadBlob = new Blob([safeBuffer], { type: outMime });

      if (uploadBlob.size < 512) {
        throw new Error("No audible audio stream was found inside this file.");
      }

      if (!decoded && uploadBlob.size <= 35 * 1024 * 1024) {
        const ctx = new AudioContext();
        try {
          decoded = await ctx.decodeAudioData(safeBuffer.slice(0));
        } catch {
          // Optional for long files; server computes exact duration cleanly
        } finally {
          await ctx.close().catch(() => {});
        }
      }

      const finalDuration = decoded?.duration || knownDuration;
      if (finalDuration > MAX_DUB_DURATION_SEC + 5) {
        throw new Error("Media duration exceeds the maximum 2-hour (120 minute) limit.");
      }

      return {
        uploadBlob,
        uploadFileName: outFileName,
        uploadMimeType: outMime,
        durationSeconds: finalDuration,
        audioBuffer: decoded,
        codecConverted: true,
        trips: [
          {
            tripIndex: 0,
            totalTrips: 1,
            startSec: 0,
            endSec: Number((finalDuration || 0).toFixed(2)),
            durationSec: Number((finalDuration || 0).toFixed(2)),
            label: finalDuration > 0 ? `Trip 1/1 (0m–${Math.max(1, Math.ceil(finalDuration / 60))}m)` : "Trip 1/1",
            blob: uploadBlob,
            fileName: outFileName,
            mimeType: outMime,
          },
        ],
      };
    } finally {
      await Promise.all(
        Array.from(tempFilesToClean).map((name) => ff.deleteFile(name).catch(() => {})),
      );
    }
  }

  throw new Error("Unable to extract audio from the selected media.");
}

export type ExtractedSpeakerRef = {
  audioBase64: string;
  text: string;
  startSec: number;
  endSec: number;
  durationSeconds: number;
  previewUrl: string;
  source: "vad_auto" | "custom_upload" | "segment_pick";
};

/**
 * Browser-side PCM RMS VAD helper to extract a clean ~20s continuous speaking chunk
 * from an AudioBuffer (used when user clicks "Use voice" on a segment, uploads a custom
 * reference audio clip, or runs local SRT caption alignment without re-calling Deepgram).
 */
export function buildVad20sReferenceFromBuffer(
  audioBuffer: AudioBuffer,
  segments?: DubSegment[],
  preferredSegmentId?: string,
  targetDurationSec = 20,
): ExtractedSpeakerRef | null {
  const totalDur = audioBuffer.duration;
  if (totalDur < 1.2) return null;

  const monoFull = mixAudioBufferToMono(audioBuffer, 0, totalDur);
  const frameLen = Math.max(1, Math.round(audioBuffer.sampleRate * 0.02));
  const numFrames = Math.floor(monoFull.length / frameLen);
  const frameRms = new Float32Array(Math.max(1, numFrames));

  for (let f = 0; f < numFrames; f += 1) {
    let sumSq = 0;
    const base = f * frameLen;
    for (let i = 0; i < frameLen; i += 4) {
      const s = monoFull[base + i];
      sumSq += s * s;
    }
    frameRms[f] = Math.sqrt(sumSq / Math.max(1, Math.ceil(frameLen / 4)));
  }

  const sortedRms = Array.from(frameRms).sort((a, b) => a - b);
  const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.15)] ?? 0.002;
  const thresh = Math.max(0.01, noiseFloor * 2.6 + 0.005);

  let chosenStart = 0;
  let chosenEnd = Math.min(totalDur, targetDurationSec);
  let chosenText = "";
  let source: ExtractedSpeakerRef["source"] = "vad_auto";

  if (preferredSegmentId && segments && segments.length > 0) {
    const idx = segments.findIndex((s) => s.id === preferredSegmentId);
    if (idx >= 0) {
      source = "segment_pick";
      chosenStart = segments[idx].startSec;
      chosenEnd = segments[idx].endSec;
      const parts = [segments[idx].sourceText.trim()];
      for (let j = idx + 1; j < segments.length && chosenEnd - chosenStart < targetDurationSec; j += 1) {
        if (segments[j].startSec - chosenEnd > 1.2) break;
        if (segments[j].endSec - chosenStart > 22) break;
        chosenEnd = segments[j].endSec;
        if (segments[j].sourceText.trim()) parts.push(segments[j].sourceText.trim());
      }
      chosenText = parts.join(" ").trim();
    }
  } else if (segments && segments.length > 0) {
    // Score contiguous multi-segment spans targeting ~20s of dense active speech
    let bestScore = -1;
    for (let i = 0; i < segments.length; i += 1) {
      let spanEnd = segments[i].endSec;
      let gapAccum = 0;
      const texts = [segments[i].sourceText.trim()];
      for (let j = i + 1; j < segments.length; j += 1) {
        const gap = Math.max(0, segments[j].startSec - spanEnd);
        if (gap > 1.4 || segments[j].endSec - segments[i].startSec > 22.5) break;
        gapAccum += gap;
        spanEnd = segments[j].endSec;
        if (segments[j].sourceText.trim()) texts.push(segments[j].sourceText.trim());
      }

      const spanDur = spanEnd - segments[i].startSec;
      if (spanDur < 3) continue;
      const fStart = Math.max(0, Math.floor(segments[i].startSec / 0.02));
      const fEnd = Math.min(frameRms.length, Math.ceil(spanEnd / 0.02));
      let voiced = 0;
      for (let f = fStart; f < fEnd; f += 1) {
        if (frameRms[f] >= thresh) voiced += 1;
      }
      const voicedRatio = voiced / Math.max(1, fEnd - fStart);
      const lenFit = 1 - Math.min(1, Math.abs(spanDur - targetDurationSec) / targetDurationSec);
      const density = 1 - gapAccum / Math.max(1, spanDur);
      const postIntro = segments[i].startSec >= 1.5 || totalDur <= 25 ? 0.08 : 0;
      const score = voicedRatio * 0.4 + lenFit * 0.3 + density * 0.3 + postIntro;

      if (score > bestScore) {
        bestScore = score;
        chosenStart = segments[i].startSec;
        chosenEnd = spanEnd;
        chosenText = texts.join(" ").trim();
      }
    }
  }

  // Pure PCM VAD sliding window if no segments or very short segments
  if (chosenEnd - chosenStart < 3 || !chosenText) {
    const winFrames = Math.min(frameRms.length, Math.max(1, Math.round(targetDurationSec / 0.02)));
    let curVoiced = 0;
    for (let i = 0; i < winFrames; i += 1) {
      if (frameRms[i] >= thresh) curVoiced += 1;
    }
    let bestStartFrame = 0;
    let bestVoiced = curVoiced;
    for (let i = 1; i <= frameRms.length - winFrames; i += 1) {
      if (frameRms[i - 1] >= thresh) curVoiced -= 1;
      if (frameRms[i + winFrames - 1] >= thresh) curVoiced += 1;
      if (curVoiced > bestVoiced) {
        bestVoiced = curVoiced;
        bestStartFrame = i;
      }
    }
    chosenStart = bestStartFrame * 0.02;
    chosenEnd = Math.min(totalDur, chosenStart + targetDurationSec);
  }

  const rawMono = mixAudioBufferToMono(audioBuffer, chosenStart, chosenEnd);
  const resampled = resampleLinear(rawMono, audioBuffer.sampleRate, 24_000);

  let peak = 0;
  for (let i = 0; i < resampled.length; i += 1) {
    const a = Math.abs(resampled[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.003) return null;

  const gain = peak < 0.72 ? Math.min(4.2, 0.85 / peak) : 1;
  if (gain !== 1) {
    for (let i = 0; i < resampled.length; i += 1) {
      resampled[i] = Math.max(-0.98, Math.min(0.98, resampled[i] * gain));
    }
  }

  const wavBytes = encodeMonoWav(resampled, 24_000);
  return {
    audioBase64: bytesToBase64(wavBytes),
    text: chosenText,
    startSec: Number(chosenStart.toFixed(2)),
    endSec: Number(chosenEnd.toFixed(2)),
    durationSeconds: Number((resampled.length / 24_000).toFixed(1)),
    previewUrl: URL.createObjectURL(new Blob([wavBytes.slice().buffer], { type: "audio/wav" })),
    source,
  };
}

/**
 * Normalize a user-uploaded custom voice cloning reference file into a clean ~20s 24 kHz mono WAV.
 */
export async function normalizeCustomCloneAudioFile(
  file: File,
  onProgress?: (label: string) => void,
): Promise<ExtractedSpeakerRef> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer | null = null;

  try {
    try {
      const raw = await file.arrayBuffer();
      decoded = await ctx.decodeAudioData(raw);
    } catch {
      onProgress?.("Converting custom voice file codec in browser...");
      const ff = await getSharedBrowserFfmpeg(onProgress);
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
      const inName = `clone_in.${ext}`;
      const outName = "clone_out.wav";
      await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
      const code = await ff.exec([
        "-y",
        "-i",
        inName,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "pcm_s16le",
        outName,
      ]);
      const data = await ff.readFile(outName);
      await Promise.all([
        ff.deleteFile(inName).catch(() => {}),
        ff.deleteFile(outName).catch(() => {}),
      ]);
      if (code !== 0) throw new Error("Could not decode custom voice reference file.");
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      decoded = await ctx.decodeAudioData(copy);
    }

    if (!decoded || decoded.duration < 2) {
      throw new Error("Voice reference audio must be at least 2 seconds of clear speech.");
    }

    const ref = buildVad20sReferenceFromBuffer(decoded, undefined, undefined, 20);
    if (!ref) {
      throw new Error("Uploaded voice clip appears silent or too quiet.");
    }
    return {
      ...ref,
      source: "custom_upload",
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function vadServerRefToExtracted(serverRef: VadReferenceInfo & { audioBase64: string }): ExtractedSpeakerRef {
  const clean = serverRef.audioBase64.replace(/^data:[^,]+,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const previewUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return {
    audioBase64: clean,
    text: serverRef.text,
    startSec: serverRef.startSec,
    endSec: serverRef.endSec,
    durationSeconds: serverRef.durationSec,
    previewUrl,
    source: "vad_auto",
  };
}

export type DurationMatchCheck = {
  matches: boolean;
  videoDuration: number;
  expectedDuration: number;
  diffSec: number;
  toleranceSec: number;
  message: string;
};

/**
 * Strictly verify that a video selected for binding matches the dubbed audio's duration.
 */
export async function verifyVideoMatchesDubDuration(
  videoFile: File,
  expectedDurationSec: number,
): Promise<DurationMatchCheck> {
  const meta = await probeMediaFile(videoFile);
  const toleranceSec = Math.max(DURATION_MATCH_TOLERANCE_SEC, expectedDurationSec * 0.02);
  const diffSec = Math.abs(meta.duration - expectedDurationSec);
  const matches = diffSec <= toleranceSec;

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return {
    matches,
    videoDuration: meta.duration,
    expectedDuration: expectedDurationSec,
    diffSec: Number(diffSec.toFixed(2)),
    toleranceSec: Number(toleranceSec.toFixed(2)),
    message: matches
      ? `Duration verified (${fmt(meta.duration)} matches ${fmt(expectedDurationSec)} dub).`
      : `Binding is not possible: selected video duration (${fmt(meta.duration)}) does not match this dubbed audio (${fmt(expectedDurationSec)}). Please select the original video.`,
  };
}

function wrapLinesForCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Browser Canvas + MediaRecorder subtitle burn-in encoder for Unicode-accurate burned captions
 * (handles Hindi, Arabic, Japanese, Korean, Chinese & Latin scripts cleanly without missing WASM fonts).
 */
async function renderBurnedSubtitlesInBrowser(params: {
  sourceVideo: File;
  dubbedAudioBytes: ArrayBuffer;
  segments: {
    startSec: number;
    endSec: number;
    alignedStartSec?: number;
    alignedEndSec?: number;
    sourceText: string;
    translatedText: string;
  }[];
  audioMode: DubBindAudioMode;
  subtitleMode: "burn_translated" | "burn_original" | "burn_dual";
  backgroundLevel: number;
  onProgress?: (label: string) => void;
}): Promise<{ blob: Blob; url: string; fileName: string }> {
  const { sourceVideo, dubbedAudioBytes, segments, audioMode, subtitleMode, backgroundLevel, onProgress } =
    params;

  onProgress?.("Preparing subtitle burn-in renderer in browser...");
  const videoUrl = URL.createObjectURL(sourceVideo);
  const videoEl = document.createElement("video");
  videoEl.src = videoUrl;
  videoEl.playsInline = true;
  videoEl.crossOrigin = "anonymous";

  const audioCtx = new AudioContext();
  try {
    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error("Could not load source video for subtitle burn-in."));
    });

    const width = videoEl.videoWidth || 1280;
    const height = videoEl.videoHeight || 720;
    const duration = videoEl.duration || 10;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("Canvas 2D context unavailable.");

    const dubbedAudioBuffer = await audioCtx.decodeAudioData(dubbedAudioBytes.slice(0));
    const dest = audioCtx.createMediaStreamDestination();

    const dubSource = audioCtx.createBufferSource();
    dubSource.buffer = dubbedAudioBuffer;
    const dubGain = audioCtx.createGain();
    dubGain.gain.value = 1.0;
    dubSource.connect(dubGain).connect(dest);

    let origSource: MediaElementAudioSourceNode | null = null;
    if (audioMode === "mix_ducked") {
      origSource = audioCtx.createMediaElementSource(videoEl);
      const bgGain = audioCtx.createGain();
      bgGain.gain.value = Math.max(0.05, Math.min(0.65, backgroundLevel));
      origSource.connect(bgGain).connect(dest);
      videoEl.muted = false;
    } else {
      videoEl.muted = true;
    }

    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const preferredMime =
      MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")
        ? "video/mp4;codecs=avc1,mp4a.40.2"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm";

    const recorder = new MediaRecorder(combined, {
      mimeType: preferredMime,
      videoBitsPerSecond: 4_500_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const donePromise = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const cues = segments.map((s) => ({
      start: typeof s.alignedStartSec === "number" ? s.alignedStartSec : s.startSec,
      end: typeof s.alignedEndSec === "number" ? s.alignedEndSec : s.endSec,
      origStart: s.startSec,
      origEnd: s.endSec,
      orig: stripDramaTagsForSubtitles(s.sourceText),
      trans: stripDramaTagsForSubtitles(s.translatedText || s.sourceText),
    }));

    let rafId = 0;
    const fontSize = Math.max(18, Math.round(height * 0.036));

    const drawFrame = () => {
      ctx2d.drawImage(videoEl, 0, 0, width, height);
      const t = videoEl.currentTime;
      const pct = Math.min(98, Math.round((t / Math.max(1, duration)) * 100));
      onProgress?.(`Burning subtitles onto video frames (${pct}%)...`);

      const active = cues.find((c) => {
        if (subtitleMode === "burn_original") {
          return t >= c.origStart - 0.05 && t <= c.origEnd + 0.1;
        }
        return t >= c.start - 0.05 && t <= c.end + 0.1;
      });

      if (active) {
        const linesToDraw: { text: string; color: string; size: number }[] = [];
        const maxBoxWidth = Math.round(width * 0.84);
        ctx2d.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;

        if (subtitleMode === "burn_translated" || subtitleMode === "burn_dual") {
          for (const l of wrapLinesForCanvas(ctx2d, active.trans, maxBoxWidth)) {
            linesToDraw.push({ text: l, color: "#ffffff", size: fontSize });
          }
        }
        if (subtitleMode === "burn_original" || subtitleMode === "burn_dual") {
          const smallSize = subtitleMode === "burn_dual" ? Math.round(fontSize * 0.82) : fontSize;
          ctx2d.font = `500 ${smallSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
          for (const l of wrapLinesForCanvas(ctx2d, active.orig, maxBoxWidth)) {
            linesToDraw.push({
              text: l,
              color: subtitleMode === "burn_dual" ? "#f6d8c7" : "#ffffff",
              size: smallSize,
            });
          }
        }

        if (linesToDraw.length > 0) {
          const lineGap = Math.round(fontSize * 1.32);
          const padX = Math.round(fontSize * 0.8);
          const padY = Math.round(fontSize * 0.45);
          const boxH = linesToDraw.length * lineGap + padY * 2;
          let maxMeasured = 0;
          for (const item of linesToDraw) {
            ctx2d.font = `600 ${item.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
            maxMeasured = Math.max(maxMeasured, ctx2d.measureText(item.text).width);
          }
          const boxW = Math.min(width * 0.92, maxMeasured + padX * 2);
          const boxX = (width - boxW) / 2;
          const boxY = height - boxH - Math.round(height * 0.06);

          ctx2d.fillStyle = "rgba(12, 12, 14, 0.78)";
          ctx2d.beginPath();
          ctx2d.roundRect(boxX, boxY, boxW, boxH, 10);
          ctx2d.fill();

          ctx2d.textAlign = "center";
          ctx2d.textBaseline = "middle";
          linesToDraw.forEach((item, idx) => {
            ctx2d.font = `600 ${item.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
            ctx2d.fillStyle = item.color;
            ctx2d.fillText(item.text, width / 2, boxY + padY + lineGap * (idx + 0.5));
          });
        }
      }

      if (!videoEl.ended && !videoEl.paused) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    recorder.start(250);
    await audioCtx.resume();
    videoEl.currentTime = 0;
    await videoEl.play();
    dubSource.start();
    rafId = requestAnimationFrame(drawFrame);

    await new Promise<void>((resolve) => {
      videoEl.onended = () => resolve();
    });

    cancelAnimationFrame(rafId);
    dubSource.stop();
    if (recorder.state !== "inactive") recorder.stop();
    await donePromise;

    const ext = preferredMime.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: preferredMime.split(";")[0] });
    const stem = sourceVideo.name.replace(/\.[^/.]+$/, "") || "video";
    return {
      blob,
      url: URL.createObjectURL(blob),
      fileName: `${stem}-dubbed-subtitled.${ext}`,
    };
  } finally {
    URL.revokeObjectURL(videoUrl);
    await audioCtx.close().catch(() => {});
  }
}

export type BindVideoOptions = {
  sourceVideo: File;
  dubbedAudioUrl: string;
  segments: {
    startSec: number;
    endSec: number;
    alignedStartSec?: number;
    alignedEndSec?: number;
    sourceText: string;
    translatedText: string;
  }[];
  audioMode: DubBindAudioMode;
  subtitleMode: DubBindSubtitleMode;
  sourceSrtText: string;
  translatedSrtText: string;
  sourceLanguageLabel?: string;
  targetLanguageLabel?: string;
  targetLanguageCode?: string;
  backgroundLevel: number;
  onProgress?: (label: string) => void;
};

/**
 * Bind finished dubbed audio (stored in Tigris/vault) onto the user's original video directly
 * in the browser, supporting dual audio tracks (`keep_both`), background mixing, soft multi-track
 * subtitles (`soft_both` / `soft_translated` / `soft_original`), or burned-in Unicode captions.
 */
export async function bindDubbedAudioToVideoInBrowser(
  options: BindVideoOptions,
): Promise<{ blob: Blob; url: string; fileName: string }> {
  const {
    sourceVideo,
    dubbedAudioUrl,
    segments,
    audioMode,
    subtitleMode,
    sourceSrtText,
    translatedSrtText,
    sourceLanguageLabel = "Original",
    targetLanguageLabel = "Dubbed",
    targetLanguageCode = "hi",
    backgroundLevel,
    onProgress,
  } = options;

  onProgress?.("Downloading dubbed audio track from vault...");
  const dubRes = await fetch(dubbedAudioUrl);
  if (!dubRes.ok) {
    throw new Error("Could not fetch synthesized dubbed audio.");
  }
  const dubArrayBuf = await dubRes.arrayBuffer();

  // If user chose hard burned-in captions on video frames, use canvas+audio renderer for crisp Unicode text
  if (
    subtitleMode === "burn_translated" ||
    subtitleMode === "burn_original" ||
    subtitleMode === "burn_dual"
  ) {
    return await renderBurnedSubtitlesInBrowser({
      sourceVideo,
      dubbedAudioBytes: dubArrayBuf,
      segments,
      audioMode,
      subtitleMode,
      backgroundLevel,
      onProgress,
    });
  }

  const ff = await getSharedBrowserFfmpeg(onProgress);
  const dubBytes = new Uint8Array(dubArrayBuf);
  const srcBytes = new Uint8Array(await sourceVideo.arrayBuffer());

  const srcExt = sourceVideo.name.split(".").pop()?.toLowerCase() || "mp4";
  const inVideoName = `src_video.${srcExt}`;
  const inDubName = "dub_track.mp3";
  const subTransName = "sub_translated.srt";
  const subOrigName = "sub_original.srt";
  const outMp4Name = "bound_output.mp4";

  await ff.writeFile(inVideoName, srcBytes);
  await ff.writeFile(inDubName, dubBytes);

  const subInputs: string[] = [];
  const subMaps: string[] = [];
  const subMeta: string[] = [];

  let nextInputIdx = 2;
  const wantTransSub =
    (subtitleMode === "soft_translated" || subtitleMode === "soft_both") &&
    translatedSrtText.trim().length > 0;
  const wantOrigSub =
    (subtitleMode === "soft_original" || subtitleMode === "soft_both") &&
    sourceSrtText.trim().length > 0;

  let subTrackIdx = 0;
  if (wantTransSub) {
    await ff.writeFile(subTransName, new TextEncoder().encode(translatedSrtText));
    subInputs.push("-i", subTransName);
    subMaps.push("-map", `${nextInputIdx}:s:0`);
    subMeta.push(
      `-metadata:s:s:${subTrackIdx}`,
      `language=${getIso639_2Code(targetLanguageCode)}`,
      `-metadata:s:s:${subTrackIdx}`,
      `title=${targetLanguageLabel}`,
      `-disposition:s:${subTrackIdx}`,
      "default",
    );
    nextInputIdx += 1;
    subTrackIdx += 1;
  }

  if (wantOrigSub) {
    await ff.writeFile(subOrigName, new TextEncoder().encode(sourceSrtText));
    subInputs.push("-i", subOrigName);
    subMaps.push("-map", `${nextInputIdx}:s:0`);
    subMeta.push(
      `-metadata:s:s:${subTrackIdx}`,
      "language=und",
      `-metadata:s:s:${subTrackIdx}`,
      `title=${sourceLanguageLabel} (Original)`,
      `-disposition:s:${subTrackIdx}`,
      wantTransSub ? "0" : "default",
    );
    nextInputIdx += 1;
    subTrackIdx += 1;
  }

  const subCodecArgs = subMaps.length > 0 ? ["-c:s", "mov_text", ...subMeta] : [];

  onProgress?.("Binding video, audio track(s) & subtitles into MP4...");
  try {
    let exitCode = 1;

    if (audioMode === "keep_both") {
      exitCode = await ff.exec([
        "-y",
        "-i",
        inVideoName,
        "-i",
        inDubName,
        ...subInputs,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-map",
        "0:a:0?",
        ...subMaps,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-metadata:s:a:0",
        `language=${getIso639_2Code(targetLanguageCode)}`,
        "-metadata:s:a:0",
        `title=Dubbed (${targetLanguageLabel})`,
        "-disposition:a:0",
        "default",
        "-metadata:s:a:1",
        `title=${sourceLanguageLabel}`,
        "-disposition:a:1",
        "0",
        ...subCodecArgs,
        "-movflags",
        "+faststart",
        "-shortest",
        outMp4Name,
      ]);
    } else if (audioMode === "mix_ducked") {
      const safeBg = Math.max(0.05, Math.min(0.65, backgroundLevel));
      const activeWindows = segments
        .filter((s) => (s.alignedEndSec ?? s.endSec) > (s.alignedStartSec ?? s.startSec))
        .slice(0, 50)
        .map((s) => {
          const st = s.alignedStartSec ?? s.startSec;
          const en = s.alignedEndSec ?? s.endSec;
          return `between(t,${Math.max(0, st - 0.12).toFixed(2)},${(en + 0.14).toFixed(2)})`;
        });
      const duckExpr =
        activeWindows.length > 0
          ? `volume=enable='${activeWindows.join("+")}':volume=${safeBg.toFixed(2)}`
          : `volume=${safeBg.toFixed(2)}`;
      const filterGraph = `[0:a]${duckExpr}[bg];[1:a]volume=1.05[fg];[bg][fg]amix=inputs=2:duration=longest:dropout_transition=0.2:normalize=0[aout]`;

      exitCode = await ff.exec([
        "-y",
        "-i",
        inVideoName,
        "-i",
        inDubName,
        ...subInputs,
        "-filter_complex",
        filterGraph,
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        ...subMaps,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        ...subCodecArgs,
        "-movflags",
        "+faststart",
        "-shortest",
        outMp4Name,
      ]);
    }

    // Fallback or "replace" mode: dubbed track replaces original audio cleanly
    if (audioMode === "replace" || exitCode !== 0) {
      exitCode = await ff.exec([
        "-y",
        "-i",
        inVideoName,
        "-i",
        inDubName,
        ...subInputs,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        ...subMaps,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-metadata:s:a:0",
        `language=${getIso639_2Code(targetLanguageCode)}`,
        "-metadata:s:a:0",
        `title=Dubbed (${targetLanguageLabel})`,
        ...subCodecArgs,
        "-movflags",
        "+faststart",
        "-shortest",
        outMp4Name,
      ]);
    }

    if (exitCode !== 0 && subMaps.length > 0) {
      // Retry without soft subtitles if container codec dislikes mov_text
      await ff.exec([
        "-y",
        "-i",
        inVideoName,
        "-i",
        inDubName,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        ...(audioMode === "keep_both" ? ["-map", "0:a:0?"] : []),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-shortest",
        outMp4Name,
      ]);
    }

    const outData = await ff.readFile(outMp4Name);
    const outBytes =
      outData instanceof Uint8Array ? outData : new TextEncoder().encode(String(outData));
    const safeBuffer = new Uint8Array(outBytes).buffer;
    const blob = new Blob([safeBuffer], { type: "video/mp4" });
    if (blob.size < 1024) {
      throw new Error("MP4 binding produced an empty output file.");
    }
    const stem = sourceVideo.name.replace(/\.[^/.]+$/, "") || "video";
    return {
      blob,
      url: URL.createObjectURL(blob),
      fileName: `${stem}-${targetLanguageCode}-${audioMode === "keep_both" ? "dual-audio" : "dubbed"}.mp4`,
    };
  } finally {
    await Promise.all([
      ff.deleteFile(inVideoName).catch(() => {}),
      ff.deleteFile(inDubName).catch(() => {}),
      ff.deleteFile(subTransName).catch(() => {}),
      ff.deleteFile(subOrigName).catch(() => {}),
      ff.deleteFile(outMp4Name).catch(() => {}),
    ]);
  }
}

/** Backwards-compatible wrapper alias if called externally. */
export async function remuxDubbedVideoInBrowser(options: {
  sourceVideo: File;
  dubbedAudioUrl: string;
  segments: { alignedStartSec: number; alignedEndSec: number }[];
  keepBackground: boolean;
  backgroundLevel: number;
  onProgress?: (label: string) => void;
}): Promise<{ blob: Blob; url: string; fileName: string }> {
  return bindDubbedAudioToVideoInBrowser({
    sourceVideo: options.sourceVideo,
    dubbedAudioUrl: options.dubbedAudioUrl,
    segments: options.segments.map((s) => ({
      startSec: s.alignedStartSec,
      endSec: s.alignedEndSec,
      alignedStartSec: s.alignedStartSec,
      alignedEndSec: s.alignedEndSec,
      sourceText: "",
      translatedText: "",
    })),
    audioMode: options.keepBackground ? "mix_ducked" : "replace",
    subtitleMode: "none",
    sourceSrtText: "",
    translatedSrtText: "",
    backgroundLevel: options.backgroundLevel,
    onProgress: options.onProgress,
  });
}
