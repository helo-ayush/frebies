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
const MIN_ATEMPO = 0.85;
const MAX_ATEMPO = 1.28;

export type FittedSegmentAudio = {
  segment: DubSegment;
  pcm16Mono: Buffer;
  sampleRate: number;
  actualDurationSec: number;
  speedApplied: number;
};

/**
 * Resample & time-stretch a synthesized segment WAV so it fits cleanly inside its
 * scene window using pitch-preserving ffmpeg filters when available.
 */
async function normalizeAndFitWav(
  rawWav: Buffer,
  targetSampleRate: number,
  tempoFactor: number,
): Promise<{ pcm16Mono: Buffer; durationSec: number }> {
  const trimmedFirst = (() => {
    const parsed = parseWav(rawWav);
    const cleaned = trimChunkSilence(parsed.pcmData, parsed.sampleRate, parsed.numChannels, parsed.bitsPerSample);
    return { parsed, cleaned };
  })();

  const clampedTempo = Math.max(MIN_ATEMPO, Math.min(MAX_ATEMPO, tempoFactor));
  const needsResample =
    trimmedFirst.parsed.sampleRate !== targetSampleRate ||
    trimmedFirst.parsed.numChannels !== 1 ||
    trimmedFirst.parsed.bitsPerSample !== 16;
  const needsTempo = Math.abs(clampedTempo - 1) > 0.03;

  const trimmedWav = buildWav(
    trimmedFirst.cleaned,
    trimmedFirst.parsed.sampleRate,
    trimmedFirst.parsed.numChannels,
    trimmedFirst.parsed.bitsPerSample,
    trimmedFirst.parsed.audioFormat,
  );

  const rawDuration =
    trimmedFirst.cleaned.length /
    ((trimmedFirst.parsed.bitsPerSample / 8) * trimmedFirst.parsed.numChannels) /
    trimmedFirst.parsed.sampleRate;

  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg || (!needsResample && !needsTempo)) {
    return {
      pcm16Mono: trimmedFirst.cleaned,
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

/**
 * Fit all synthesized segment WAVs into a single continuous dubbed speech track aligned
 * to the video's timeline without harsh overlapping or awkward clipping.
 */
export async function assembleDubbedSpeechTrack(options: {
  segments: DubSegment[];
  rawWavs: Buffer[];
  totalDurationSec: number;
  syncToTimeline: boolean;
  voiceLabel: string;
  title: string;
}): Promise<{
  mp3Buffer: Buffer;
  wavBuffer: Buffer;
  peaks: number[];
  durationSeconds: number;
  alignedSegments: DubAlignedSegment[];
}> {
  const { segments, rawWavs, syncToTimeline } = options;
  if (segments.length !== rawWavs.length || segments.length === 0) {
    throw new Error("Segment count mismatch while assembling dubbed audio.");
  }

  const prepared: {
    seg: DubSegment;
    pcm16: Buffer;
    durationSec: number;
    speedApplied: number;
    startSec: number;
  }[] = [];

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

    prepared.push({
      seg,
      pcm16: copyPcm,
      durationSec: fitted.durationSec,
      speedApplied: Number(Math.max(MIN_ATEMPO, Math.min(MAX_ATEMPO, desiredTempo)).toFixed(2)),
      startSec: Math.max(0, seg.startSec),
    });
  }

  // Place sequentially along timeline canvas (prevent collisions cleanly)
  const alignedSegments: DubAlignedSegment[] = [];
  let cursorSec = 0;
  let canvasEndSec = Math.max(1, options.totalDurationSec);

  const placements: { startSample: number; pcm16: Buffer }[] = [];
  for (const item of prepared) {
    const startSec = Math.max(cursorSec + (cursorSec > 0 ? 0.03 : 0), item.startSec);
    const alignedEndSec = startSec + item.durationSec;
    cursorSec = alignedEndSec;
    canvasEndSec = Math.max(canvasEndSec, alignedEndSec + 0.15);

    placements.push({
      startSample: Math.round(startSec * OUTPUT_SAMPLE_RATE),
      pcm16: item.pcm16,
    });

    alignedSegments.push({
      ...item.seg,
      alignedStartSec: Number(startSec.toFixed(2)),
      alignedEndSec: Number(alignedEndSec.toFixed(2)),
      spokenDurationSec: Number(item.durationSec.toFixed(2)),
      speedApplied: item.speedApplied,
    });
  }

  const totalFrames = Math.ceil(canvasEndSec * OUTPUT_SAMPLE_RATE);
  const floatCanvas = new Float32Array(totalFrames);

  for (const place of placements) {
    const segSamples = Math.floor(place.pcm16.length / 2);
    for (let s = 0; s < segSamples; s += 1) {
      const dst = place.startSample + s;
      if (dst >= totalFrames) break;
      floatCanvas[dst] += place.pcm16.readInt16LE(s * 2) / 32768;
    }
  }

  // Write peak-safe PCM16 canvas
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
    wavBuffer,
    peaks,
    durationSeconds: Number((totalFrames / OUTPUT_SAMPLE_RATE).toFixed(2)),
    alignedSegments,
  };
}

