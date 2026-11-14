import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ParsedWav = {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  pcmData: Buffer;
};

/** Parse a standard PCM/float RIFF WAV buffer, tolerating extra metadata chunks. */
export function parseWav(buf: Buffer): ParsedWav {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV header returned by speech engine");
  }

  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let foundFmt = false;
  let pcmData: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buf.length, dataStart + chunkSize);

    if (chunkId === "fmt " && dataStart + 16 <= buf.length) {
      audioFormat = buf.readUInt16LE(dataStart);
      numChannels = buf.readUInt16LE(dataStart + 2);
      sampleRate = buf.readUInt32LE(dataStart + 4);
      bitsPerSample = buf.readUInt16LE(dataStart + 14);
      foundFmt = true;
    } else if (chunkId === "data") {
      pcmData = buf.subarray(dataStart, dataEnd);
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (!foundFmt || !pcmData) {
    throw new Error("Incomplete WAV structure (missing fmt or data chunk)");
  }

  return { audioFormat, numChannels, sampleRate, bitsPerSample, pcmData };
}

export function buildWav(
  pcmData: Buffer,
  sampleRate: number,
  numChannels = 1,
  bitsPerSample = 16,
  audioFormat = 1,
): Buffer {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(audioFormat, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

export type WavSegment = {
  wav: Buffer;
  pauseAfterMs: number;
};

/**
 * Trim abnormal leading/trailing silence and collapse >700ms dead-air holes inside a single
 * synthesized WAV chunk while preserving ~60ms lead-in and ~100ms trailing breath tails.
 */
export function trimChunkSilence(
  pcmData: Buffer,
  sampleRate: number,
  numChannels = 1,
  bitsPerSample = 16,
): Buffer {
  if (bitsPerSample !== 16 || sampleRate <= 0 || numChannels <= 0) {
    return pcmData;
  }
  const blockAlign = (bitsPerSample / 8) * numChannels;
  const totalFrames = Math.floor(pcmData.length / blockAlign);
  const minFramesForTrim = Math.round(sampleRate * 0.35);
  if (totalFrames <= minFramesForTrim) {
    return pcmData;
  }

  const winFrames = Math.max(1, Math.round(sampleRate * 0.02)); // 20ms analysis window
  const numWins = Math.floor(totalFrames / winFrames);
  if (numWins <= 6) {
    return pcmData;
  }

  const peaks = new Float32Array(numWins);
  for (let w = 0; w < numWins; w += 1) {
    const startFrame = w * winFrames;
    const endFrame = Math.min(totalFrames, startFrame + winFrames);
    let maxVal = 0;
    for (let f = startFrame; f < endFrame; f += 2) {
      const bytePos = f * blockAlign;
      if (bytePos + 1 >= pcmData.length) break;
      const sample = Math.abs(pcmData.readInt16LE(bytePos)) / 32768;
      if (sample > maxVal) maxVal = sample;
    }
    peaks[w] = maxVal;
  }

  const SPEECH_THRESHOLD = 0.008;
  let firstActive = -1;
  let lastActive = -1;
  for (let w = 0; w < numWins; w += 1) {
    if (peaks[w] > SPEECH_THRESHOLD) {
      if (firstActive === -1) firstActive = w;
      lastActive = w;
    }
  }

  if (firstActive === -1 || lastActive - firstActive < 3) {
    return pcmData;
  }

  const startWin = Math.max(0, firstActive - 3); // ~60ms lead-in
  const endWin = Math.min(numWins, lastActive + 6); // ~120ms natural decay

  // Keep speech spans while compressing internal >700ms dead-air gaps down to ~280ms
  const GAP_THRESHOLD = 0.005;
  const MAX_INTERNAL_SILENCE_WINS = 35; // 700ms
  const KEEP_INTERNAL_SILENCE_WINS = 14; // 280ms

  const keptSlices: Buffer[] = [];
  let cursorWin = startWin;

  while (cursorWin < endWin) {
    if (peaks[cursorWin] <= GAP_THRESHOLD) {
      let gapEnd = cursorWin + 1;
      while (gapEnd < endWin && peaks[gapEnd] <= GAP_THRESHOLD) {
        gapEnd += 1;
      }
      const gapLen = gapEnd - cursorWin;
      const keepEnd = gapLen > MAX_INTERNAL_SILENCE_WINS ? cursorWin + KEEP_INTERNAL_SILENCE_WINS : gapEnd;
      keptSlices.push(pcmData.subarray(cursorWin * winFrames * blockAlign, keepEnd * winFrames * blockAlign));
      cursorWin = gapEnd;
    } else {
      let runEnd = cursorWin + 1;
      while (runEnd < endWin && peaks[runEnd] > GAP_THRESHOLD) {
        runEnd += 1;
      }
      keptSlices.push(pcmData.subarray(cursorWin * winFrames * blockAlign, runEnd * winFrames * blockAlign));
      cursorWin = runEnd;
    }
  }

  const trimmed = Buffer.concat(keptSlices);
  return trimmed.length >= blockAlign * Math.round(sampleRate * 0.15) ? trimmed : pcmData;
}

/** Stitch multiple WAV buffers sequentially, trimming dead silence and inserting calibrated pauses. */
export function concatWavSegments(segments: WavSegment[]): {
  wav: Buffer;
  durationSeconds: number;
  sampleRate: number;
  peaks: number[];
} {
  if (segments.length === 0) {
    throw new Error("No audio segments to stitch");
  }

  const parsed = segments.map((s) => {
    const wav = parseWav(s.wav);
    return {
      ...wav,
      pcmData: trimChunkSilence(wav.pcmData, wav.sampleRate, wav.numChannels, wav.bitsPerSample),
      pauseAfterMs: s.pauseAfterMs,
    };
  });

  const ref = parsed[0];
  const bytesPerSample = ref.bitsPerSample / 8;
  const blockAlign = ref.numChannels * bytesPerSample;
  const parts: Buffer[] = [];
  let totalPcmBytes = 0;

  for (let i = 0; i < parsed.length; i += 1) {
    const seg = parsed[i];
    if (
      seg.sampleRate !== ref.sampleRate ||
      seg.numChannels !== ref.numChannels ||
      seg.bitsPerSample !== ref.bitsPerSample
    ) {
      throw new Error("Mismatched WAV stream format across chunks");
    }
    parts.push(seg.pcmData);
    totalPcmBytes += seg.pcmData.length;

    if (i < parsed.length - 1 && seg.pauseAfterMs > 0) {
      const pauseFrames = Math.round((ref.sampleRate * seg.pauseAfterMs) / 1000);
      const silence = Buffer.alloc(pauseFrames * blockAlign);
      parts.push(silence);
      totalPcmBytes += silence.length;
    }
  }

  const combinedPcm = Buffer.concat(parts, totalPcmBytes);
  const wav = buildWav(combinedPcm, ref.sampleRate, ref.numChannels, ref.bitsPerSample, ref.audioFormat);
  const totalFrames = totalPcmBytes / blockAlign;
  const durationSeconds = totalFrames / ref.sampleRate;
  const peaks = computeWavPeaks(combinedPcm, ref.bitsPerSample, ref.numChannels, 80);

  return { wav, durationSeconds, sampleRate: ref.sampleRate, peaks };
}

export function computeWavPeaks(
  pcmData: Buffer,
  bitsPerSample = 16,
  numChannels = 1,
  bars = 80,
): number[] {
  if (pcmData.length < 4) return Array.from({ length: bars }, () => 0.12);
  const stepBytes = Math.max(2, (bitsPerSample / 8) * numChannels);
  const totalFrames = Math.floor(pcmData.length / stepBytes);
  if (totalFrames <= 0) return Array.from({ length: bars }, () => 0.12);

  const framesPerBar = Math.max(1, Math.floor(totalFrames / bars));
  const raw: number[] = [];

  for (let b = 0; b < bars; b += 1) {
    const startFrame = b * framesPerBar;
    const endFrame = Math.min(totalFrames, startFrame + framesPerBar);
    const sampleStride = Math.max(1, Math.floor((endFrame - startFrame) / 120));
    let maxVal = 0;

    for (let f = startFrame; f < endFrame; f += sampleStride) {
      const bytePos = f * stepBytes;
      if (bytePos + 1 >= pcmData.length) break;
      const sample = bitsPerSample === 16 ? Math.abs(pcmData.readInt16LE(bytePos)) / 32768 : 0.25;
      if (sample > maxVal) maxVal = sample;
    }
    raw.push(maxVal);
  }

  const loudest = Math.max(...raw, 0.001);
  return raw.map((v) => Math.max(0.06, Math.min(1, Math.pow(v / loudest, 0.72))));
}

export function resolveFfmpegPath(): string | null {
  const candidates = [
    process.env.FFMPEG_PATH,
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "ffmpeg",
  ].filter(Boolean) as string[];

  for (const cand of candidates) {
    if (cand === "ffmpeg" || fs.existsSync(cand)) {
      return cand;
    }
  }
  return null;
}

export function buildAtempoChain(factor: number): string[] {
  const filters: string[] = [];
  let rem = factor;
  while (rem > 2.0) {
    filters.push("atempo=2.0");
    rem /= 2.0;
  }
  while (rem < 0.5) {
    filters.push("atempo=0.5");
    rem /= 0.5;
  }
  filters.push(`atempo=${rem.toFixed(4)}`);
  return filters;
}

export type PostProcessOptions = {
  format: "mp3" | "wav";
  bitrate: number;
  speed: number;
  pitch: number;
  metadata: boolean;
  voiceName: string;
  title: string;
};

/**
 * Apply pitch-safe speed (atempo), pitch shift (asetrate + atempo compensation),
 * MP3 encoding, and ID3/RIFF metadata using local ffmpeg if available.
 */
export async function postProcessWav(
  wavBuffer: Buffer,
  sampleRate: number,
  options: PostProcessOptions,
): Promise<{
  buffer: Buffer;
  format: "mp3" | "wav";
  mimeType: string;
  durationSeconds: number;
  peaks: number[];
}> {
  const parsed = parseWav(wavBuffer);
  const rawDuration = (parsed.pcmData.length / ((parsed.bitsPerSample / 8) * parsed.numChannels)) / parsed.sampleRate;
  const rawPeaks = computeWavPeaks(parsed.pcmData, parsed.bitsPerSample, parsed.numChannels, 80);

  const speed = Math.max(0.75, Math.min(1.5, options.speed || 1));
  const pitch = Math.max(0.75, Math.min(1.5, options.pitch || 1));
  const needsFilter = Math.abs(speed - 1) > 0.01 || Math.abs(pitch - 1) > 0.01;
  const needsMp3 = options.format === "mp3";

  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) {
    return {
      buffer: wavBuffer,
      format: "wav",
      mimeType: "audio/wav",
      durationSeconds: rawDuration,
      peaks: rawPeaks,
    };
  }

  if (!needsFilter && !needsMp3 && !options.metadata) {
    return {
      buffer: wavBuffer,
      format: "wav",
      mimeType: "audio/wav",
      durationSeconds: rawDuration,
      peaks: rawPeaks,
    };
  }

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-post-"));
  const inPath = path.join(workDir, "in.wav");
  const outWavPath = path.join(workDir, "processed.wav");
  const outMp3Path = path.join(workDir, "out.mp3");

  try {
    await fsp.writeFile(inPath, wavBuffer);

    const filterChain: string[] = [];
    if (Math.abs(pitch - 1) > 0.01) {
      filterChain.push(`asetrate=${Math.round(sampleRate * pitch)}`);
      filterChain.push(`aresample=${sampleRate}`);
      filterChain.push(...buildAtempoChain(speed / pitch));
    } else if (Math.abs(speed - 1) > 0.01) {
      filterChain.push(...buildAtempoChain(speed));
    }

    let wavForMetrics = wavBuffer;
    if (filterChain.length > 0) {
      await execFileAsync(ffmpeg, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-filter:a",
        filterChain.join(","),
        "-c:a",
        "pcm_s16le",
        outWavPath,
      ]);
      wavForMetrics = await fsp.readFile(outWavPath);
    } else {
      await fsp.copyFile(inPath, outWavPath);
    }

    const finalParsed = parseWav(wavForMetrics);
    const finalDuration =
      finalParsed.pcmData.length / ((finalParsed.bitsPerSample / 8) * finalParsed.numChannels) / finalParsed.sampleRate;
    const finalPeaks = computeWavPeaks(finalParsed.pcmData, finalParsed.bitsPerSample, finalParsed.numChannels, 80);

    const metaArgs = options.metadata
      ? [
          "-metadata",
          `title=${options.title}`,
          "-metadata",
          "artist=frebies Voice Studio",
          "-metadata",
          `comment=Voice: ${options.voiceName}`,
        ]
      : ["-map_metadata", "-1"];

    if (needsMp3) {
      await execFileAsync(ffmpeg, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        outWavPath,
        "-c:a",
        "libmp3lame",
        "-b:a",
        `${options.bitrate || 192}k`,
        ...metaArgs,
        outMp3Path,
      ]);
      const mp3Buf = await fsp.readFile(outMp3Path);
      return {
        buffer: mp3Buf,
        format: "mp3",
        mimeType: "audio/mpeg",
        durationSeconds: finalDuration,
        peaks: finalPeaks,
      };
    }

    if (options.metadata) {
      const taggedWav = path.join(workDir, "tagged.wav");
      await execFileAsync(ffmpeg, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        outWavPath,
        "-c:a",
        "copy",
        ...metaArgs,
        taggedWav,
      ]);
      const buf = await fsp.readFile(taggedWav);
      return {
        buffer: buf,
        format: "wav",
        mimeType: "audio/wav",
        durationSeconds: finalDuration,
        peaks: finalPeaks,
      };
    }

    return {
      buffer: wavForMetrics,
      format: "wav",
      mimeType: "audio/wav",
      durationSeconds: finalDuration,
      peaks: finalPeaks,
    };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

