import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildAtempoChain,
  buildWav,
  computeWavPeaks,
  parseWav,
  postProcessWav,
  resolveFfmpegPath,
  trimChunkSilence,
} from "@/lib/audio/wav-utils";
import type { DubAlignedSegment, DubSegment } from "./dub-types";

const execFileAsync = promisify(execFile);

const OUTPUT_SAMPLE_RATE = 44_100;
const MIN_ATEMPO = 0.84;
const MAX_ATEMPO = 1.32;

/**
 * Resample & time-stretch a synthesized segment WAV so it fits cleanly inside its
 * scene window using pitch-preserving ffmpeg filters when available.
 */
async function normalizeAndFitWav(
  rawWav: Buffer,
  targetSampleRate: number,
  tempoFactor: number,
): Promise<{ pcm16Mono: Buffer; durationSec: number }> {
  const parsed = parseWav(rawWav);
  const cleaned = trimChunkSilence(
    parsed.pcmData,
    parsed.sampleRate,
    parsed.numChannels,
    parsed.bitsPerSample,
  );

  const clampedTempo = Math.max(MIN_ATEMPO, Math.min(MAX_ATEMPO, tempoFactor));
  const needsResample =
    parsed.sampleRate !== targetSampleRate || parsed.numChannels !== 1 || parsed.bitsPerSample !== 16;
  const needsTempo = Math.abs(clampedTempo - 1) > 0.03;

  const trimmedWav = buildWav(
    cleaned,
    parsed.sampleRate,
    parsed.numChannels,
    parsed.bitsPerSample,
    parsed.audioFormat,
  );

  const rawDuration = cleaned.length / ((parsed.bitsPerSample / 8) * parsed.numChannels) / parsed.sampleRate;

  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg || (!needsResample && !needsTempo)) {
    return {
      pcm16Mono: cleaned,
      durationSec: rawDuration,
    };
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-dubfit-"));
  const inPath = path.join(workDir, "in.wav");
  const outPath = path.join(workDir, "out.wav");

  try {
    await fsp.writeFile(inPath, trimmedWav);
    const filters: string[] = [];
    if (needsTempo) {
      filters.push(...buildAtempoChain(clampedTempo));
    }

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inPath,
      ...(filters.length > 0 ? ["-filter:a", filters.join(",")] : []),
      "-ar",
      String(targetSampleRate),
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outPath,
    ];

    await execFileAsync(ffmpeg, args);
    const processed = await fsp.readFile(outPath);
    const parsedOut = parseWav(processed);
    const durationSec = parsedOut.pcmData.length / 2 / parsedOut.sampleRate;
    return {
      pcm16Mono: parsedOut.pcmData,
      durationSec,
    };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Smooth leading/trailing 10ms fade to prevent clicks when mixing on a timeline canvas. */
function applySoftEdgeFades(pcm16: Buffer, sampleRate: number): void {
  const totalSamples = Math.floor(pcm16.length / 2);
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.01), Math.floor(totalSamples / 4));
  if (fadeSamples <= 1) return;

  for (let i = 0; i < fadeSamples; i += 1) {
    const gainIn = i / fadeSamples;
    const inByte = i * 2;
    pcm16.writeInt16LE(Math.round(pcm16.readInt16LE(inByte) * gainIn), inByte);

    const outIdx = totalSamples - 1 - i;
    const outByte = outIdx * 2;
    pcm16.writeInt16LE(Math.round(pcm16.readInt16LE(outByte) * gainIn), outByte);
  }
}

function buildWavHeader(pcmDataBytes: number, sampleRate: number, numChannels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(Math.min(0xffffffff, 36 + pcmDataBytes), 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(Math.min(0xffffffff, pcmDataBytes), 40);
  return header;
}

/**
 * Mix optional original audio bed ducked underneath active speech windows into a single MP3 via ffmpeg.
 */
async function mixSpeechAndBackgroundToMp3(params: {
  speechWavPath: string;
  backgroundWavBuffer: Buffer;
  backgroundLevel: number;
  isInstrumentalStem?: boolean;
  title: string;
  voiceLabel: string;
  outMp3Path: string;
  ffmpeg: string;
}): Promise<Buffer> {
  const bgPath = path.join(path.dirname(params.speechWavPath), "bg.wav");
  await fsp.writeFile(bgPath, params.backgroundWavBuffer);
  const bgGain = Math.max(0.05, Math.min(0.65, params.backgroundLevel));
  const bgVolume = params.isInstrumentalStem
    ? Math.min(0.95, Math.max(0.28, bgGain * 2.4))
    : Math.max(0.18, bgGain * 1.35);
  const scRatio = params.isInstrumentalStem ? 3.5 : 6;

  // sidechaincompress ducks original audio whenever dubbed speech is active, without hitting
  // command-line length limits even for 2-hour videos with hundreds of segments.
  const filterComplex =
    `[0:a]aresample=${OUTPUT_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=mono[sp];` +
    `[sp]asplit=2[sp_sc][sp_mix];` +
    `[1:a]aresample=${OUTPUT_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=mono,volume=${bgVolume.toFixed(2)}[bg];` +
    `[bg][sp_sc]sidechaincompress=threshold=0.018:ratio=${scRatio}:attack=30:release=260:makeup=1[bg_ducked];` +
    `[bg_ducked][sp_mix]amix=inputs=2:duration=first:dropout_transition=0.25:normalize=0,alimiter=limit=0.96[aout]`;

  try {
    await execFileAsync(params.ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      params.speechWavPath,
      "-i",
      bgPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[aout]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-metadata",
      `title=${params.title}`,
      "-metadata",
      "artist=frebies AI Dubbing Studio",
      "-metadata",
      `comment=Voice: ${params.voiceLabel}`,
      params.outMp3Path,
    ]);
  } catch {
    // Simple constant-ducked fallback mix if sidechaincompress isn't supported in a build
    const simpleFilter =
      `[1:a]aresample=${OUTPUT_SAMPLE_RATE},volume=${bgGain.toFixed(2)}[bg];` +
      `[0:a]aresample=${OUTPUT_SAMPLE_RATE}[sp];` +
      `[bg][sp]amix=inputs=2:duration=first:normalize=0[aout]`;
    await execFileAsync(params.ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      params.speechWavPath,
      "-i",
      bgPath,
      "-filter_complex",
      simpleFilter,
      "-map",
      "[aout]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      params.outMp3Path,
    ]);
  }

  return await fsp.readFile(params.outMp3Path);
}

/**
 * Fit all synthesized segment WAVs into a single continuous dubbed speech track aligned
 * to the video/audio timeline without collisions or OOM (supports up to 2 hours via
 * window-chunked disk WAV assembly).
 */
export async function assembleDubbedSpeechTrack(options: {
  segments: DubSegment[];
  rawWavs: Buffer[];
  totalDurationSec: number;
  syncToTimeline: boolean;
  voiceLabel: string;
  title: string;
  keepBackground?: boolean;
  backgroundLevel?: number;
  backgroundWavBuffer?: Buffer | null;
  isInstrumentalStem?: boolean;
}): Promise<{
  mp3Buffer: Buffer;
  mimeType: "audio/mpeg" | "audio/wav";
  peaks: number[];
  durationSeconds: number;
  alignedSegments: DubAlignedSegment[];
}> {
  const { segments, rawWavs, syncToTimeline } = options;
  if (segments.length !== rawWavs.length || segments.length === 0) {
    throw new Error("Segment count mismatch while assembling dubbed audio.");
  }

  const placements: { startSample: number; pcm16: Buffer }[] = [];
  const alignedSegments: DubAlignedSegment[] = [];
  let cursorSec = 0;
  let canvasEndSec = Math.max(1, options.totalDurationSec);

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];
    const initialParsed = parseWav(rawWavs[i]);
    const cleaned = trimChunkSilence(
      initialParsed.pcmData,
      initialParsed.sampleRate,
      initialParsed.numChannels,
      initialParsed.bitsPerSample,
    );
    const spokenSec =
      cleaned.length / ((initialParsed.bitsPerSample / 8) * initialParsed.numChannels) / initialParsed.sampleRate;

    const slotEndLimit = nextSeg
      ? Math.max(seg.endSec, Math.min(seg.endSec + 0.65, nextSeg.startSec - 0.04))
      : Math.max(seg.endSec + 1.2, options.totalDurationSec);
    const availableWindowSec = Math.max(0.55, slotEndLimit - seg.startSec);

    let desiredTempo = 1;
    if (syncToTimeline && spokenSec > availableWindowSec * 1.04) {
      desiredTempo = Math.min(MAX_ATEMPO, spokenSec / availableWindowSec);
    }

    const fitted = await normalizeAndFitWav(rawWavs[i], OUTPUT_SAMPLE_RATE, desiredTempo);
    const copyPcm = Buffer.from(fitted.pcm16Mono);
    applySoftEdgeFades(copyPcm, OUTPUT_SAMPLE_RATE);

    const startSec = Math.max(cursorSec + (cursorSec > 0 ? 0.03 : 0), Math.max(0, seg.startSec));
    const alignedEndSec = startSec + fitted.durationSec;
    cursorSec = alignedEndSec;
    canvasEndSec = Math.max(canvasEndSec, alignedEndSec + 0.15);

    placements.push({
      startSample: Math.round(startSec * OUTPUT_SAMPLE_RATE),
      pcm16: copyPcm,
    });

    alignedSegments.push({
      ...seg,
      alignedStartSec: Number(startSec.toFixed(2)),
      alignedEndSec: Number(alignedEndSec.toFixed(2)),
      spokenDurationSec: Number(fitted.durationSec.toFixed(2)),
      speedApplied: Number(Math.max(MIN_ATEMPO, Math.min(MAX_ATEMPO, desiredTempo)).toFixed(2)),
    });
  }

  const totalFrames = Math.ceil(canvasEndSec * OUTPUT_SAMPLE_RATE);
  const finalDurationSec = Number((totalFrames / OUTPUT_SAMPLE_RATE).toFixed(2));
  const ffmpeg = resolveFfmpegPath();

  // Fast in-memory assembly for short clips (<= 5 minutes) when no disk mix is needed
  if (canvasEndSec <= 300 && !(options.keepBackground && options.backgroundWavBuffer && ffmpeg)) {
    const floatCanvas = new Float32Array(totalFrames);
    for (const place of placements) {
      const segSamples = Math.floor(place.pcm16.length / 2);
      for (let s = 0; s < segSamples; s += 1) {
        const dst = place.startSample + s;
        if (dst >= totalFrames) break;
        floatCanvas[dst] += place.pcm16.readInt16LE(s * 2) / 32768;
      }
    }

    const outPcm = Buffer.alloc(totalFrames * 2);
    for (let i = 0; i < totalFrames; i += 1) {
      const sample = Math.max(-0.99, Math.min(0.99, floatCanvas[i]));
      outPcm.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), i * 2);
    }

    const wavBuffer = buildWav(outPcm, OUTPUT_SAMPLE_RATE, 1, 16, 1);
    const peaks = computeWavPeaks(outPcm, 16, 1, 80);
    const encoded = await postProcessWav(wavBuffer, OUTPUT_SAMPLE_RATE, {
      format: "mp3",
      bitrate: 192,
      speed: 1,
      pitch: 1,
      metadata: true,
      voiceName: options.voiceLabel,
      title: options.title.slice(0, 64) || "frebies dubbed audio",
    });

    return {
      mp3Buffer: encoded.buffer,
      mimeType: encoded.mimeType,
      peaks,
      durationSeconds: finalDurationSec,
      alignedSegments,
    };
  }

  // Memory-safe chunked WAV writer for up to 2 hours or background ducking mix
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-dub-assemble-"));
  const speechWavPath = path.join(workDir, "speech_canvas.wav");
  const outMp3Path = path.join(workDir, "dubbed.mp3");

  try {
    const CHUNK_FRAMES = OUTPUT_SAMPLE_RATE * 20; // 20s rolling window (~1.7MB float buffer)
    const fh = await fsp.open(speechWavPath, "w");
    const peakBuckets = 80;
    const bucketRaw = new Float32Array(peakBuckets);

    try {
      await fh.write(buildWavHeader(totalFrames * 2, OUTPUT_SAMPLE_RATE, 1, 16), 0, 44, 0);

      for (let winStart = 0; winStart < totalFrames; winStart += CHUNK_FRAMES) {
        const winLen = Math.min(CHUNK_FRAMES, totalFrames - winStart);
        const winEnd = winStart + winLen;
        const winFloat = new Float32Array(winLen);

        for (const place of placements) {
          const segSamples = Math.floor(place.pcm16.length / 2);
          const segStart = place.startSample;
          const segEnd = segStart + segSamples;
          if (segEnd <= winStart || segStart >= winEnd) continue;

          const overlapStart = Math.max(winStart, segStart);
          const overlapEnd = Math.min(winEnd, segEnd);
          for (let f = overlapStart; f < overlapEnd; f += 1) {
            winFloat[f - winStart] += place.pcm16.readInt16LE((f - segStart) * 2) / 32768;
          }
        }

        const winPcm = Buffer.allocUnsafe(winLen * 2);
        for (let i = 0; i < winLen; i += 1) {
          const sample = Math.max(-0.99, Math.min(0.99, winFloat[i]));
          const abs = Math.abs(sample);
          const bucket = Math.min(peakBuckets - 1, Math.floor(((winStart + i) / totalFrames) * peakBuckets));
          if (abs > bucketRaw[bucket]) bucketRaw[bucket] = abs;
          winPcm.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), i * 2);
        }

        await fh.write(winPcm, 0, winPcm.length, 44 + winStart * 2);
      }
    } finally {
      await fh.close();
    }

    const loudest = Math.max(...Array.from(bucketRaw), 0.001);
    const peaks = Array.from(bucketRaw).map((v) =>
      Math.max(0.06, Math.min(1, Math.pow(v / loudest, 0.72))),
    );

    if (!ffmpeg) {
      const wavBuf = await fsp.readFile(speechWavPath);
      return {
        mp3Buffer: wavBuf,
        mimeType: "audio/wav",
        peaks,
        durationSeconds: finalDurationSec,
        alignedSegments,
      };
    }

    if (options.keepBackground && options.backgroundWavBuffer && options.backgroundWavBuffer.length > 44) {
      const mp3Buffer = await mixSpeechAndBackgroundToMp3({
        speechWavPath,
        backgroundWavBuffer: options.backgroundWavBuffer,
        backgroundLevel: options.backgroundLevel ?? 0.18,
        isInstrumentalStem: options.isInstrumentalStem,
        title: options.title.slice(0, 64) || "frebies dubbed audio",
        voiceLabel: options.voiceLabel,
        outMp3Path,
        ffmpeg,
      });
      return {
        mp3Buffer,
        mimeType: "audio/mpeg",
        peaks,
        durationSeconds: finalDurationSec,
        alignedSegments,
      };
    }

    await execFileAsync(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      speechWavPath,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-metadata",
      `title=${options.title.slice(0, 64) || "frebies dubbed audio"}`,
      "-metadata",
      "artist=frebies AI Dubbing Studio",
      "-metadata",
      `comment=Voice: ${options.voiceLabel}`,
      outMp3Path,
    ]);
    const mp3Buffer = await fsp.readFile(outMp3Path);
    return {
      mp3Buffer,
      mimeType: "audio/mpeg",
      peaks,
      durationSeconds: finalDurationSec,
      alignedSegments,
    };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
