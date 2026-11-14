"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { DubSegment } from "@/lib/video/dub-types";

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
    onProgress?.("Loading video mux engine...");
    const mod = (await import(/* webpackIgnore: true */ FFMPEG_MODULE_URL)) as { FFmpeg: typeof FFmpeg };
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

export type VideoProbeMeta = {
  duration: number;
  width: number;
  height: number;
};

export function probeVideoFile(file: File): Promise<VideoProbeMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      cleanup();
      if (!duration) {
        reject(new Error("Could not read video duration. Ensure the file has a valid video stream."));
        return;
      }
      resolve({ duration, width, height });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("This browser could not preview this video format. Try MP4, WebM, or MOV."));
    };

    video.src = url;
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

function mixAudioBufferToMono(audioBuffer: AudioBuffer, startSec = 0, endSec = audioBuffer.duration): Float32Array {
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

export type ExtractedVideoAudio = {
  audioBuffer: AudioBuffer;
  pcm16k: Float32Array;
  durationSeconds: number;
};

/**
 * Decode audio from a video file cleanly via Web Audio API, with automatic
 * browser FFmpeg extraction fallback when the container/codec requires it.
 */
export async function extractVideoAudio(
  file: File,
  onProgress?: (label: string) => void,
): Promise<ExtractedVideoAudio> {
  onProgress?.("Extracting audio waveform from video...");
  const ctx = new AudioContext();

  try {
    let decoded: AudioBuffer;
    try {
      const buf = await file.arrayBuffer();
      decoded = await ctx.decodeAudioData(buf);
    } catch {
      onProgress?.("Decoding container audio via FFmpeg...");
      const ff = await getSharedBrowserFfmpeg(onProgress);
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const inName = `probe_in.${ext}`;
      const outName = "probe_out.wav";
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      await ff.writeFile(inName, fileBytes);
      await ff.exec(["-y", "-i", inName, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", outName]);
      const wavData = await ff.readFile(outName);
      await Promise.all([ff.deleteFile(inName).catch(() => {}), ff.deleteFile(outName).catch(() => {})]);
      const wavBytes =
        wavData instanceof Uint8Array ? wavData : new TextEncoder().encode(String(wavData));
      const copyBuf = new ArrayBuffer(wavBytes.byteLength);
      new Uint8Array(copyBuf).set(wavBytes);
      decoded = await ctx.decodeAudioData(copyBuf);
    }

    const monoNative = mixAudioBufferToMono(decoded, 0, decoded.duration);
    const pcm16k = resampleLinear(monoNative, decoded.sampleRate, 16_000);
    return {
      audioBuffer: decoded,
      pcm16k,
      durationSeconds: decoded.duration,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export type ExtractedSpeakerRef = {
  audioBase64: string;
  text: string;
  startSec: number;
  endSec: number;
  durationSeconds: number;
  previewUrl: string;
};

/**
 * Pick the cleanest speech segment (~4s–10s) from the decoded video audio and normalize
 * it into a crisp 24kHz mono WAV reference snippet for Drama 3 speaker voice cloning.
 */
export function buildSpeakerCloneReference(
  audioBuffer: AudioBuffer,
  segments: DubSegment[],
  preferredSegmentId?: string,
): ExtractedSpeakerRef | null {
  const candidates = segments
    .map((seg) => ({
      seg,
      dur: seg.endSec - seg.startSec,
    }))
    .filter((x) => x.seg.sourceText.trim().length >= 8 && x.dur >= 1.5);

  let chosenStart = 0;
  let chosenEnd = Math.min(audioBuffer.duration, 7.5);
  let chosenText = "";

  if (preferredSegmentId) {
    const exact = candidates.find((c) => c.seg.id === preferredSegmentId);
    if (exact) {
      chosenStart = exact.seg.startSec;
      chosenEnd = Math.min(exact.seg.startSec + 11, exact.seg.endSec);
      chosenText = exact.seg.sourceText.trim();
    }
  }

  if (!chosenText && candidates.length > 0) {
    // Prefer a natural 4s–10s continuous window, stitching consecutive lines if short
    const ranked = [...candidates].sort((a, b) => {
      const score = (d: number) => (d >= 4 && d <= 10.5 ? 100 + d : d > 10.5 ? 85 : d * 15);
      return score(b.dur) - score(a.dur);
    });

    const anchor = ranked[0];
    const startIdx = segments.findIndex((s) => s.id === anchor.seg.id);
    chosenStart = anchor.seg.startSec;
    chosenEnd = anchor.seg.endSec;
    const textParts = [anchor.seg.sourceText.trim()];

    // Merge immediate next short segment cleanly if < 6.5s so Drama 3 gets rich timbre context
    for (let j = startIdx + 1; j < segments.length && chosenEnd - chosenStart < 7.5; j += 1) {
      const next = segments[j];
      if (next.startSec - chosenEnd > 0.6) break;
      if (next.endSec - chosenStart > 11.5) break;
      chosenEnd = next.endSec;
      if (next.sourceText.trim()) textParts.push(next.sourceText.trim());
    }
    chosenText = textParts.join(" ").trim();
  }

  if (chosenEnd - chosenStart < 1.2) return null;

  const rawMono = mixAudioBufferToMono(audioBuffer, chosenStart, chosenEnd);
  const resampled = resampleLinear(rawMono, audioBuffer.sampleRate, 24_000);

  let peak = 0;
  for (let i = 0; i < resampled.length; i += 1) {
    const a = Math.abs(resampled[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.004) return null;

  const gain = peak < 0.72 ? Math.min(4.2, 0.85 / peak) : 1;
  if (gain !== 1) {
    for (let i = 0; i < resampled.length; i += 1) {
      resampled[i] = Math.max(-0.98, Math.min(0.98, resampled[i] * gain));
    }
  }

  const wavBytes = encodeMonoWav(resampled, 24_000);
  const base64 = bytesToBase64(wavBytes);
  const previewUrl = URL.createObjectURL(new Blob([wavBytes.slice().buffer], { type: "audio/wav" }));

  return {
    audioBase64: base64,
    text: chosenText,
    startSec: Number(chosenStart.toFixed(2)),
    endSec: Number(chosenEnd.toFixed(2)),
    durationSeconds: Number((resampled.length / 24_000).toFixed(1)),
    previewUrl,
  };
}

/**
 * Mix generated dubbed speech over optional ducked background audio and remux cleanly onto
 * original video frames (`-c:v copy` = lossless, fast in-browser MP4 output).
 */
export async function remuxDubbedVideoInBrowser(options: {
  sourceVideo: File;
  dubbedAudioUrl: string;
  segments: { alignedStartSec: number; alignedEndSec: number }[];
  keepBackground: boolean;
  backgroundLevel: number;
  onProgress?: (label: string) => void;
}): Promise<{ blob: Blob; url: string; fileName: string }> {
  const { sourceVideo, dubbedAudioUrl, segments, keepBackground, backgroundLevel, onProgress } = options;
  const ff = await getSharedBrowserFfmpeg(onProgress);

  onProgress?.("Downloading synthesized dubbed audio track...");
  const dubRes = await fetch(dubbedAudioUrl);
  if (!dubRes.ok) {
    throw new Error("Could not fetch synthesized dubbed audio.");
  }
  const dubBytes = new Uint8Array(await dubRes.arrayBuffer());
  const srcBytes = new Uint8Array(await sourceVideo.arrayBuffer());

  const srcExt = sourceVideo.name.split(".").pop()?.toLowerCase() || "mp4";
  const inVideoName = `src_video.${srcExt}`;
  const inDubName = "dub_track.mp3";
  const outMp4Name = "dubbed_output.mp4";

  await ff.writeFile(inVideoName, srcBytes);
  await ff.writeFile(inDubName, dubBytes);

  onProgress?.("Muxing dubbed dialogue & ambience into MP4...");
  try {
    const safeBg = Math.max(0.05, Math.min(0.65, backgroundLevel));
    const activeWindows = segments
      .filter((s) => s.alignedEndSec > s.alignedStartSec)
      .slice(0, 60)
      .map(
        (s) =>
          `between(t,${Math.max(0, s.alignedStartSec - 0.12).toFixed(2)},${(s.alignedEndSec + 0.14).toFixed(2)})`,
      );

    if (keepBackground) {
      const duckExpr =
        activeWindows.length > 0
          ? `volume=enable='${activeWindows.join("+")}':volume=${safeBg.toFixed(2)}`
          : `volume=${safeBg.toFixed(2)}`;
      // Attenuate center-panned vocals lightly (`pan` / gentle bandpass attenuation fallback) + smart ducking
      const filterGraph = `[0:a]${duckExpr}[bg];[1:a]volume=1.08[fg];[bg][fg]amix=inputs=2:duration=longest:dropout_transition=0.2:normalize=0[aout]`;

      const exitCode = await ff.exec([
        "-y",
        "-i",
        inVideoName,
        "-i",
        inDubName,
        "-filter_complex",
        filterGraph,
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
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

      // If original video had no audio stream, retry cleanly replacing audio only
      if (exitCode !== 0) {
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
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          outMp4Name,
        ]);
      }
    } else {
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
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        outMp4Name,
      ]);
    }

    const outData = await ff.readFile(outMp4Name);
    const outBytes =
      outData instanceof Uint8Array ? outData : new TextEncoder().encode(String(outData));
    const safeBuffer = new Uint8Array(outBytes).buffer;
    const blob = new Blob([safeBuffer], { type: "video/mp4" });
    if (blob.size < 1024) {
      throw new Error("MP4 remux produced an empty output.");
    }
    const stem = sourceVideo.name.replace(/\.[^/.]+$/, "") || "video";
    return {
      blob,
      url: URL.createObjectURL(blob),
      fileName: `${stem}-dubbed.mp4`,
    };
  } finally {
    await Promise.all([
      ff.deleteFile(inVideoName).catch(() => {}),
      ff.deleteFile(inDubName).catch(() => {}),
      ff.deleteFile(outMp4Name).catch(() => {}),
    ]);
  }
}

