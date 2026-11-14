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

/**
 * Layer 2 (Prosodic Pause Expansion): detect brief internal low-energy clause breaks (60–420ms)
 * inside a synthesized sentence and gently lengthen them instead of leaving a dead gap after the sentence.
 */
function expandInternalClausePauses(
  pcm16Mono: Buffer,
  sampleRate: number,
  targetExtraSec: number,
): Buffer {
  const totalSamples = Math.floor(pcm16Mono.length / 2);
  if (
    targetExtraSec <= 0.06 ||
    sampleRate <= 0 ||
    totalSamples < Math.floor(sampleRate * 0.55)
  ) {
    return pcm16Mono;
  }

  const windowSamples = Math.max(1, Math.floor(sampleRate * 0.02)); // 20ms windows
  const numWins = Math.floor(totalSamples / windowSamples);
  const startGuardWin = Math.ceil(0.18 / 0.02); // skip first 180ms
  const endGuardWin = numWins - Math.ceil(0.2 / 0.02); // skip last 200ms
  if (endGuardWin - startGuardWin < 6) {
    return pcm16Mono;
  }

  const winRms = new Float32Array(numWins);
  let peakWinRms = 0;
  for (let w = 0; w < numWins; w += 1) {
    const startSample = w * windowSamples;
    const endSample = startSample + windowSamples;
    let sumSq = 0;
    for (let s = startSample; s < endSample; s += 1) {
      const val = pcm16Mono.readInt16LE(s * 2);
      sumSq += val * val;
    }
    const rms = Math.sqrt(sumSq / windowSamples);
    winRms[w] = rms;
    if (rms > peakWinRms) peakWinRms = rms;
  }

  // Adaptive low-energy threshold catches clause breaths without ever splitting voiced phones
  const pauseRmsThreshold = Math.min(360, Math.max(120, peakWinRms * 0.035));
  const rawRuns: { startWin: number; endWin: number }[] = [];

  let w = startGuardWin;
  while (w < endGuardWin) {
    if (winRms[w] < pauseRmsThreshold) {
      const runStart = w;
      while (w < endGuardWin && winRms[w] < pauseRmsThreshold) {
        w += 1;
      }
      const runWins = w - runStart;
      // Only expand genuine clause pauses between 60ms (3 wins) and 420ms (21 wins)
      if (runWins >= 3 && runWins <= 21) {
        rawRuns.push({ startWin: runStart, endWin: w });
      }
    } else {
      w += 1;
    }
  }

  if (rawRuns.length === 0) {
    return pcm16Mono;
  }

  const maxInsertSec = Math.min(targetExtraSec * 0.65, rawRuns.length * 0.18, 0.48);
  const minPerRunSamples = Math.floor(sampleRate * 0.035);
  let activeRuns = rawRuns;
  let insertSamplesPerRun = Math.floor((maxInsertSec * sampleRate) / activeRuns.length);

  // If distributing across too many tiny pauses makes each insert trivial, focus on the longest pauses
  if (insertSamplesPerRun < minPerRunSamples && activeRuns.length > 1) {
    const maxCount = Math.max(1, Math.floor((maxInsertSec * sampleRate) / minPerRunSamples));
    activeRuns = [...rawRuns]
      .sort((a, b) => (b.endWin - b.startWin) - (a.endWin - a.startWin))
      .slice(0, maxCount)
      .sort((a, b) => a.startWin - b.startWin);
    insertSamplesPerRun = Math.floor((maxInsertSec * sampleRate) / activeRuns.length);
  }

  if (insertSamplesPerRun < minPerRunSamples) {
    return pcm16Mono;
  }

  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(windowSamples / 2));
  const chunks: Buffer[] = [];
  let cursorSample = 0;

  for (const run of activeRuns) {
    const midSample = Math.floor(((run.startWin + run.endWin) / 2) * windowSamples);
    if (midSample <= cursorSample) continue;

    const leftPart = Buffer.from(pcm16Mono.subarray(cursorSample * 2, midSample * 2));
    const leftSamples = Math.floor(leftPart.length / 2);
    const leftFade = Math.min(fadeSamples, leftSamples);
    for (let i = 0; i < leftFade; i += 1) {
      const idx = (leftSamples - 1 - i) * 2;
      const gain = i / Math.max(1, leftFade);
      leftPart.writeInt16LE(Math.round(leftPart.readInt16LE(idx) * gain), idx);
    }

    chunks.push(leftPart);
    chunks.push(Buffer.alloc(insertSamplesPerRun * 2));
    cursorSample = midSample;
  }

  const tailPart = Buffer.from(pcm16Mono.subarray(cursorSample * 2));
  const tailSamples = Math.floor(tailPart.length / 2);
  const rightFade = Math.min(fadeSamples, tailSamples);
  for (let i = 0; i < rightFade; i += 1) {
    const idx = i * 2;
    const gain = i / Math.max(1, rightFade);
    tailPart.writeInt16LE(Math.round(tailPart.readInt16LE(idx) * gain), idx);
  }
  chunks.push(tailPart);

  return Buffer.concat(chunks);
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
    const prevSeg = i > 0 ? segments[i - 1] : null;
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

    const originalSlotSec = Math.max(0.45, seg.endSec - seg.startSec);
    const sameSpeaker = prevSeg ? (seg.speaker ?? 0) === (prevSeg.speaker ?? 0) : false;
    const originalInterGapSec = prevSeg ? Math.max(0, seg.startSec - prevSeg.endSec) : seg.startSec;

    // Layer 4a (Elastic Pull-Forward): when continuous speech finishes early, pull the next
    // segment gently closer (bounded <= 0.72s from its anchor) so natural pauses stay 0.25–0.45s
    // instead of turning into 1.5–2s dead air.
    let targetStartSec = Math.max(0, seg.startSec);
    if (syncToTimeline && i > 0 && cursorSec < seg.startSec) {
      const rawGapSec = seg.startSec - cursorSec;
      const naturalPauseFloor = sameSpeaker
        ? Math.min(0.45, Math.max(0.24, originalInterGapSec + 0.12))
        : Math.min(0.65, Math.max(0.38, originalInterGapSec + 0.18));
      if (rawGapSec > naturalPauseFloor + 0.12 && originalInterGapSec < 0.85) {
        const pullBackSec = Math.min(
          sameSpeaker ? 0.72 : 0.35,
          (rawGapSec - naturalPauseFloor) * (sameSpeaker ? 0.65 : 0.4),
        );
        targetStartSec = Math.max(cursorSec + 0.04, seg.startSec - pullBackSec);
      }
    }
    const wasPulledEarly = targetStartSec < seg.startSec - 0.02;

    const slotEndLimit = nextSeg
      ? Math.max(seg.endSec, Math.min(seg.endSec + 0.65, nextSeg.startSec - 0.04))
      : Math.max(seg.endSec + 1.2, options.totalDurationSec);
    const availableWindowSec = Math.max(0.55, slotEndLimit - Math.min(seg.startSec, targetStartSec));

    // Layer 3 (Bi-Directional Tempo Fit): gently speed up overflowing lines (<= 1.32x) OR
    // gently relax fast lines down to 0.88x so compact English fills its visual slot naturally.
    let desiredTempo = 1;
    if (syncToTimeline && spokenSec > availableWindowSec * 1.03) {
      desiredTempo = Math.min(MAX_ATEMPO, spokenSec / availableWindowSec);
    } else if (syncToTimeline && spokenSec < originalSlotSec * 0.93) {
      desiredTempo = Math.max(0.88, spokenSec / (originalSlotSec * 0.96));
    }

    const fitted = await normalizeAndFitWav(rawWavs[i], OUTPUT_SAMPLE_RATE, desiredTempo);

    // Layer 2 (Prosodic Clause Pause Expansion): if a short segment still leaves dead air
    // after tempo fitting, absorb up to 0.48s inside its internal comma/clause pauses.
    let copyPcm = Buffer.from(fitted.pcm16Mono);
    if (syncToTimeline && originalSlotSec - fitted.durationSec > 0.18) {
      copyPcm = Buffer.from(
        expandInternalClausePauses(copyPcm, OUTPUT_SAMPLE_RATE, originalSlotSec - fitted.durationSec),
      );
    }
    applySoftEdgeFades(copyPcm, OUTPUT_SAMPLE_RATE);

    const segmentDurationSec = copyPcm.length / 2 / OUTPUT_SAMPLE_RATE;

    // Layer 4b (Subtle Slot Centering): center slightly short phrases inside their visual
    // mouth-movement window rather than front-loading at millisecond zero.
    if (syncToTimeline && !wasPulledEarly && segmentDurationSec < originalSlotSec - 0.18) {
      const leadHeadroom = Math.max(0, slotEndLimit - (targetStartSec + segmentDurationSec) - 0.05);
      const leadCenterSec = Math.min(
        0.14,
        (originalSlotSec - segmentDurationSec) * 0.22,
        leadHeadroom,
      );
      if (leadCenterSec > 0.02) {
        targetStartSec += leadCenterSec;
      }
    }

    const startSec = Math.max(cursorSec + (cursorSec > 0 ? 0.03 : 0), targetStartSec);
    const alignedEndSec = startSec + segmentDurationSec;
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
      spokenDurationSec: Number(segmentDurationSec.toFixed(2)),
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
