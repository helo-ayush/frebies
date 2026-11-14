import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveFfmpegPath } from "@/lib/audio/wav-utils";
import {
  DUB_SOURCE_LANGUAGES,
  DUB_TRIP_DURATION_SEC,
  computeDubTripWindows,
  type DeepgramWord,
  type DubLanguageCode,
  type DubSegment,
} from "./dub-types";

const execFileAsync = promisify(execFile);

export type DeepgramTranscriptionResult = {
  transcript: string;
  words: DeepgramWord[];
  detectedLanguage: string;
  durationSeconds: number;
  modelUsed: string;
};

function getDeepgramApiKey(): string {
  const key = (process.env.DEEPGRAM_API_KEY || "").trim();
  if (!key) {
    throw new Error(
      "DEEPGRAM_API_KEY is not configured on the server. Add DEEPGRAM_API_KEY to .env.local to enable Deepgram transcription.",
    );
  }
  return key;
}

function normalizeExtension(ext?: string): string {
  const clean = (ext || "wav").toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean || "wav";
}

/**
 * Decode any uploaded browser audio buffer (`wav`, `mp3`, `webm`, `ogg`, `m4a`, `aac`, `flac`)
 * into canonical 24 kHz mono 16-bit PCM WAV (for precision VAD & Drama 3 cloning) plus an
 * optional compact 16 kHz mono MP3 for fast Deepgram upload on long (up to 2 hour) files.
 */
export async function prepareAudioForDeepgramAndVad(
  rawAudioBuffer: Buffer,
  mimeType = "audio/wav",
  fileExtHint?: string,
): Promise<{
  wav24kBuffer: Buffer;
  deepgramPayload: Buffer;
  deepgramMimeType: string;
  durationSeconds: number;
}> {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) {
    return {
      wav24kBuffer: rawAudioBuffer,
      deepgramPayload: rawAudioBuffer,
      deepgramMimeType: mimeType || "audio/wav",
      durationSeconds: 0,
    };
  }

  const ext = normalizeExtension(
    fileExtHint ||
      (mimeType.includes("mpeg")
        ? "mp3"
        : mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("ogg")
            ? "ogg"
            : mimeType.includes("mp4") || mimeType.includes("aac")
              ? "m4a"
              : mimeType.includes("flac")
                ? "flac"
                : "wav"),
  );

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-dg-prep-"));
  const inPath = path.join(workDir, `input.${ext}`);
  const outWavPath = path.join(workDir, "audio_24k_mono.wav");
  const outMp3Path = path.join(workDir, "deepgram_16k.mp3");

  try {
    await fsp.writeFile(inPath, rawAudioBuffer);

    // 1) Decode to canonical 24 kHz mono PCM WAV for VAD + Drama 3 speaker cloning
    await execFileAsync(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "24000",
      "-c:a",
      "pcm_s16le",
      outWavPath,
    ]);
    const wav24kBuffer = await fsp.readFile(outWavPath);
    const durationSeconds = Math.max(0, (wav24kBuffer.length - 44) / (24000 * 2));

    // 2) Always transcode uncompressed / non-compact payloads above 256 KB to lightweight 16 kHz mono MP3 (48 kbps)
    // so Deepgram direct uploads never hit HTTP 408 SLOW_UPLOAD on large WAV/WebM files.
    let deepgramPayload = rawAudioBuffer;
    let deepgramMimeType = mimeType || "audio/wav";
    const isAlreadyCompact = /mpeg|mp3|ogg|opus/i.test(mimeType) && rawAudioBuffer.length <= 2 * 1024 * 1024;
    if (rawAudioBuffer.length > 256 * 1024 && !isAlreadyCompact) {
      await execFileAsync(ffmpeg, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        outWavPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "48k",
        outMp3Path,
      ]);
      deepgramPayload = await fsp.readFile(outMp3Path);
      deepgramMimeType = "audio/mpeg";
    }

    return {
      wav24kBuffer,
      deepgramPayload,
      deepgramMimeType,
      durationSeconds,
    };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

type DeepgramRawWord = {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: number;
};

type DeepgramResponse = {
  metadata?: {
    duration?: number;
  };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        words?: DeepgramRawWord[];
      }>;
    }>;
  };
  err_code?: string;
  err_msg?: string;
};

async function callDeepgramListen(params: {
  audioBuffer: Buffer;
  mimeType: string;
  model: "nova-3" | "nova-2";
  sourceLanguage: DubLanguageCode;
}): Promise<DeepgramTranscriptionResult> {
  const apiKey = getDeepgramApiKey();
  const qs = new URLSearchParams({
    model: params.model,
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    diarize: "true",
  });

  if (params.sourceLanguage && params.sourceLanguage !== "auto") {
    const langMeta = DUB_SOURCE_LANGUAGES.find((l) => l.code === params.sourceLanguage);
    qs.set("language", langMeta?.deepgramCode || params.sourceLanguage);
  } else {
    qs.set("detect_language", "true");
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(90_000, Math.min(240_000, params.audioBuffer.length / 400));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://api.deepgram.com/v1/listen?${qs.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": params.mimeType || "audio/wav",
      },
      body: new Uint8Array(params.audioBuffer),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Deepgram (${params.model}) HTTP ${res.status}: ${detail.slice(0, 240)}`);
    }

    const json = (await res.json()) as DeepgramResponse;
    if (json.err_msg) {
      throw new Error(`Deepgram (${params.model}): ${json.err_msg}`);
    }

    const channel = json.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];
    const rawWords = Array.isArray(alt?.words) ? alt.words : [];

    const words: DeepgramWord[] = rawWords
      .filter((w) => typeof w.word === "string" && typeof w.start === "number" && typeof w.end === "number")
      .map((w) => ({
        word: String(w.word || "").trim(),
        punctuatedWord: String(w.punctuated_word || w.word || "").trim(),
        start: Number(Math.max(0, w.start || 0).toFixed(3)),
        end: Number(Math.max(w.start || 0, w.end || 0).toFixed(3)),
        confidence: typeof w.confidence === "number" ? Number(w.confidence.toFixed(3)) : 0.9,
        speaker: typeof w.speaker === "number" ? w.speaker : 0,
      }))
      .filter((w) => w.punctuatedWord.length > 0);

    const detectedLanguage =
      channel?.detected_language?.trim() ||
      (params.sourceLanguage !== "auto" ? params.sourceLanguage : "en");

    const transcript =
      (alt?.transcript || "").trim() || words.map((w) => w.punctuatedWord).join(" ").trim();

    const durationSeconds = Number(
      (
        json.metadata?.duration ||
        (words.length > 0 ? words[words.length - 1].end : 0)
      ).toFixed(2),
    );

    return {
      transcript,
      words,
      detectedLanguage,
      durationSeconds,
      modelUsed: params.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

function offsetDeepgramResult(
  result: DeepgramTranscriptionResult,
  offsetSec: number,
): DeepgramTranscriptionResult {
  if (!offsetSec) return result;
  return {
    ...result,
    words: result.words.map((w) => ({
      ...w,
      start: Number((w.start + offsetSec).toFixed(3)),
      end: Number((w.end + offsetSec).toFixed(3)),
    })),
  };
}

async function transcribeSinglePayloadWithDeepgram(params: {
  audioBuffer: Buffer;
  mimeType: string;
  sourceLanguage: DubLanguageCode;
}): Promise<DeepgramTranscriptionResult> {
  try {
    const primary = await callDeepgramListen({
      audioBuffer: params.audioBuffer,
      mimeType: params.mimeType,
      model: "nova-3",
      sourceLanguage: params.sourceLanguage,
    });
    if (primary.words.length > 0 || params.sourceLanguage === "auto") {
      return primary;
    }
    const secondary = await callDeepgramListen({
      audioBuffer: params.audioBuffer,
      mimeType: params.mimeType,
      model: "nova-2",
      sourceLanguage: params.sourceLanguage,
    });
    return secondary.words.length > 0 ? secondary : primary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/401|403/i.test(msg)) {
      throw new Error("Deepgram API authentication failed. Please verify DEEPGRAM_API_KEY.");
    }
    return await callDeepgramListen({
      audioBuffer: params.audioBuffer,
      mimeType: params.mimeType,
      model: "nova-2",
      sourceLanguage: params.sourceLanguage,
    });
  }
}

/**
 * Transcribe extracted audio using Deepgram (`nova-3` with automatic `nova-2` fallback).
 * Automatically slices media longer than 30 minutes into sequential 30-minute trips
 * (e.g., 2 hours = 4 trips) so payloads stay compact and fast without timeouts.
 */
export async function transcribeAudioWithDeepgram(params: {
  audioBuffer: Buffer;
  mimeType?: string;
  sourceLanguage?: DubLanguageCode;
  durationSeconds?: number;
  tripOffsetSec?: number;
  onTripProgress?: (tripIndex: number, totalTrips: number, label: string) => void;
}): Promise<DeepgramTranscriptionResult> {
  const mimeType = params.mimeType || "audio/wav";
  const sourceLanguage = params.sourceLanguage || "auto";
  const baseOffsetSec = params.tripOffsetSec || 0;
  const totalDurationSec = params.durationSeconds || 0;
  const ffmpeg = resolveFfmpegPath();

  if (ffmpeg && totalDurationSec > DUB_TRIP_DURATION_SEC + 30) {
    const trips = computeDubTripWindows(totalDurationSec, DUB_TRIP_DURATION_SEC);
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frebies-dg-trips-"));
    const ext = mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3" : mimeType.includes("ogg") ? "ogg" : "wav";
    const srcPath = path.join(workDir, `source.${ext}`);

    try {
      await fsp.writeFile(srcPath, params.audioBuffer);
      const mergedWords: DeepgramWord[] = [];
      const transcriptParts: string[] = [];
      let detectedLanguage: string = sourceLanguage === "auto" ? "en" : sourceLanguage;
      let modelUsed = "nova-3";

      for (const trip of trips) {
        params.onTripProgress?.(trip.tripIndex, trips.length, trip.label);
        const tripOutPath = path.join(workDir, `trip_${trip.tripIndex}.mp3`);
        await execFileAsync(ffmpeg, [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          trip.startSec.toFixed(2),
          "-t",
          trip.durationSec.toFixed(2),
          "-i",
          srcPath,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "32k",
          tripOutPath,
        ]);

        const tripBuf = await fsp.readFile(tripOutPath);
        if (tripBuf.length < 256) continue;

        const rawRes = await transcribeSinglePayloadWithDeepgram({
          audioBuffer: tripBuf,
          mimeType: "audio/mpeg",
          sourceLanguage,
        });
        const aligned = offsetDeepgramResult(rawRes, baseOffsetSec + trip.startSec);
        if (trip.tripIndex === 0 && aligned.detectedLanguage) {
          detectedLanguage = aligned.detectedLanguage;
        }
        modelUsed = aligned.modelUsed || modelUsed;
        if (aligned.transcript) transcriptParts.push(aligned.transcript);
        mergedWords.push(...aligned.words);
      }

      return {
        transcript: transcriptParts.join(" ").trim(),
        words: mergedWords,
        detectedLanguage,
        durationSeconds: Number(totalDurationSec.toFixed(2)),
        modelUsed,
      };
    } finally {
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  params.onTripProgress?.(
    0,
    1,
    totalDurationSec > 0 ? `Trip 1/1 (0m–${Math.max(1, Math.ceil(totalDurationSec / 60))}m)` : "Trip 1/1",
  );
  const single = await transcribeSinglePayloadWithDeepgram({
    audioBuffer: params.audioBuffer,
    mimeType,
    sourceLanguage,
  });
  return offsetDeepgramResult(single, baseOffsetSec);
}

/**
 * Deterministic fallback segmenter from word-by-word timestamps (used only if LLM chunking fails).
 */
export function buildFallbackSegmentsFromWords(words: DeepgramWord[]): DubSegment[] {
  if (words.length === 0) return [];
  const out: DubSegment[] = [];
  let current: DeepgramWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((w) => w.punctuatedWord).join(" ").trim();
    if (text) {
      out.push({
        id: `seg_${out.length + 1}`,
        startSec: Number(current[0].start.toFixed(2)),
        endSec: Number(Math.max(current[0].start + 0.35, current[current.length - 1].end).toFixed(2)),
        sourceText: text,
        translatedText: "",
        speaker: current[0].speaker,
      });
    }
    current = [];
  };

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const prev = current[current.length - 1];
    if (prev) {
      const gap = w.start - prev.end;
      const span = w.end - current[0].start;
      const prevEndsSentence = /[.!?।。！？]$/.test(prev.punctuatedWord);
      const speakerChanged = typeof w.speaker === "number" && typeof prev.speaker === "number" && w.speaker !== prev.speaker;

      if (
        gap >= 0.65 ||
        speakerChanged ||
        (prevEndsSentence && (gap >= 0.2 || span >= 3.2)) ||
        span >= 8.5 ||
        current.length >= 24
      ) {
        flush();
      }
    }
    current.push(w);
  }
  flush();
  return out;
}
