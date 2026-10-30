import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { AudioFormat, BitDepth, ConverterSettings } from "./model";

export type ConversionResult = {
  blob: Blob;
  mime: string;
};

export type EncodeOptions = {
  bitrate: number;
  vbr: boolean;
  metadata: boolean;
  title: string;
  artist: string;
};

export class ConversionCancelled extends Error {
  constructor() {
    super("Conversion cancelled");
  }
}

const MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

const CORE_BASES = [
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm",
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
];

// The @ffmpeg/ffmpeg module creates a worker via `new URL(..., import.meta.url)`,
// which bundlers cannot statically resolve and browsers only allow same-origin.
// The ESM files are vendored in /public/vendor/ffmpeg and imported at runtime so
// the worker and its relative imports resolve against our own origin.
const FFMPEG_MODULE_URL = "/vendor/ffmpeg/index.js";

async function importFfmpegModule(): Promise<{ FFmpeg: typeof FFmpeg }> {
  const module = await import(/* webpackIgnore: true */ FFMPEG_MODULE_URL);
  return module as { FFmpeg: typeof FFmpeg };
}

const SILENCE_LEVEL = 0.00316; // -50 dBFS
const EDGE_PAD_SECONDS = 0.08;
const NORMALIZE_TARGET = 0.891; // -1 dBFS
const YIELD_EVERY = 8_000_000;

let ffmpegInstance: FFmpeg | null = null;
let loadingEngine: Promise<FFmpeg> | null = null;
let runCounter = 0;

// ---------------------------------------------------------------- engine load

async function downloadToBlob(
  url: string,
  type: string,
  onProgress?: (value: number) => void,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0 && onProgress) onProgress(Math.min(1, received / total));
    }
  }
  return URL.createObjectURL(new Blob(chunks, { type }));
}

export function ensureEngine(
  onProgress: (value: number, label: string) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance) return Promise.resolve(ffmpegInstance);
  if (loadingEngine) return loadingEngine;

  loadingEngine = (async () => {
    const { FFmpeg } = await importFfmpegModule();
    let lastError: unknown = null;
    for (const base of CORE_BASES) {
      try {
        onProgress(0.03, "Downloading the conversion engine…");
        const coreURL = await downloadToBlob(`${base}/ffmpeg-core.js`, "text/javascript");
        const wasmURL = await downloadToBlob(
          `${base}/ffmpeg-core.wasm`,
          "application/wasm",
          (value) =>
            onProgress(0.05 + value * 0.95, `Downloading engine · ${Math.round(value * 100)}%`),
        );
        const ffmpeg = new FFmpeg();
        await ffmpeg.load({ coreURL, wasmURL });
        ffmpegInstance = ffmpeg;
        return ffmpeg;
      } catch (error) {
        lastError = error;
      }
    }
    const detail = lastError instanceof Error ? ` (${lastError.message})` : "";
    throw new Error(`The conversion engine could not be downloaded. Check your connection and try again.${detail}`);
  })();

  const promise = loadingEngine;
  promise
    .catch(() => {
      // handled by the caller
    })
    .finally(() => {
      if (loadingEngine === promise) loadingEngine = null;
    });
  return promise;
}

export function cancelEngine(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // instance may already be stopped
    }
    ffmpegInstance = null;
  }
  loadingEngine = null;
}

// ---------------------------------------------------------------- PCM pipeline

type ProcessedPcm = { channels: Float32Array[]; sampleRate: number };

async function forEachSample(
  channels: Float32Array[],
  isCancelled: () => boolean,
  visit: (channel: Float32Array, index: number) => void,
): Promise<boolean> {
  let count = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      visit(channel, index);
      count += 1;
      if (count % YIELD_EVERY === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (isCancelled()) return false;
      }
    }
  }
  return true;
}

async function resampleAndMix(
  source: AudioBuffer,
  settings: ConverterSettings,
): Promise<AudioBuffer> {
  const channelCount = settings.channels === "mono" ? 1 : 2;
  if (
    Math.abs(source.sampleRate - settings.sampleRate) < 1 &&
    source.numberOfChannels === channelCount
  ) {
    return source;
  }
  const length = Math.max(1, Math.ceil(source.duration * settings.sampleRate));
  const offline = new OfflineAudioContext(channelCount, length, settings.sampleRate);
  const node = offline.createBufferSource();
  node.buffer = source;
  node.connect(offline.destination);
  node.start(0);
  return offline.startRendering();
}

function trimSilenceEdges(channels: Float32Array[], sampleRate: number): Float32Array[] {
  const frames = channels[0].length;
  let start = -1;
  for (let index = 0; index < frames; index += 1) {
    for (const channel of channels) {
      if (Math.abs(channel[index]) > SILENCE_LEVEL) {
        start = index;
        break;
      }
    }
    if (start >= 0) break;
  }
  if (start < 0) return channels;

  let end = frames;
  for (let index = frames - 1; index >= 0; index -= 1) {
    for (const channel of channels) {
      if (Math.abs(channel[index]) > SILENCE_LEVEL) {
        end = index + 1;
        break;
      }
    }
    if (end < frames) break;
  }

  const pad = Math.round(EDGE_PAD_SECONDS * sampleRate);
  const trimmedStart = Math.max(0, start - pad);
  const trimmedEnd = Math.min(frames, end + pad);
  if (trimmedEnd - trimmedStart < Math.round(0.2 * sampleRate)) return channels;
  return channels.map((channel) => channel.slice(trimmedStart, trimmedEnd));
}

async function normalizePeak(
  channels: Float32Array[],
  isCancelled: () => boolean,
): Promise<boolean> {
  let peak = 0;
  const scanned = await forEachSample(channels, isCancelled, (channel, index) => {
    const magnitude = Math.abs(channel[index]);
    if (magnitude > peak) peak = magnitude;
  });
  if (!scanned) return false;
  if (peak < 1e-6) return true;
  const gain = NORMALIZE_TARGET / peak;
  if (Math.abs(gain - 1) < 1e-4) return true;
  return forEachSample(channels, isCancelled, (channel, index) => {
    channel[index] *= gain;
  });
}

async function processPcm(
  source: AudioBuffer,
  settings: ConverterSettings,
  isCancelled: () => boolean,
): Promise<ProcessedPcm | null> {
  const rendered = await resampleAndMix(source, settings);
  if (isCancelled()) return null;

  let channels = Array.from({ length: rendered.numberOfChannels }, (_, channel) =>
    new Float32Array(rendered.getChannelData(channel)),
  );

  if (settings.trimSilence) {
    channels = trimSilenceEdges(channels, rendered.sampleRate);
  }
  if (isCancelled()) return null;

  if (settings.normalize) {
    const completed = await normalizePeak(channels, isCancelled);
    if (!completed) return null;
  }
  return { channels, sampleRate: rendered.sampleRate };
}

// ---------------------------------------------------------------- WAV writer

function buildInfoChunk(metadata?: { title: string; artist: string }): Uint8Array {
  const title = metadata?.title.trim() ?? "";
  const artist = metadata?.artist.trim() ?? "";
  if (!title && !artist) return new Uint8Array(0);
  let body = "";
  if (title) body += `INAM${title}\u0000`;
  if (artist) body += `IART${artist}\u0000`;
  const bytes = new TextEncoder().encode(body);
  // RIFF chunks must end on an even byte; a trailing pad byte is not counted
  // in the chunk size field.
  const chunk = new Uint8Array(12 + bytes.length + (bytes.length % 2));
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 0x4c495354, false); // "LIST"
  view.setUint32(4, bytes.length + 4, true);
  view.setUint32(8, 0x494e464f, false); // "INFO"
  chunk.set(bytes, 12);
  return chunk;
}

function writeInt24(view: DataView, offset: number, value: number): void {
  const clamped = Math.max(-0x800000, Math.min(0x7fffff, Math.round(value)));
  view.setUint8(offset, clamped & 0xff);
  view.setUint8(offset + 1, (clamped >> 8) & 0xff);
  view.setUint8(offset + 2, (clamped >> 16) & 0xff);
}

export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: BitDepth,
  metadata?: { title: string; artist: string },
): Blob {
  const frames = channels[0].length;
  const bytesPerSample = bitDepth === 16 ? 2 : bitDepth === 24 ? 3 : 4;
  const blockAlign = channels.length * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const info = buildInfoChunk(metadata);
  const riffSize = 4 + 8 + 16 + 8 + dataBytes + info.length;
  const buffer = new ArrayBuffer(8 + riffSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeAscii = (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset, text.charCodeAt(index));
      offset += 1;
    }
  };

  writeAscii("RIFF");
  view.setUint32(offset, riffSize, true);
  offset += 4;
  writeAscii("WAVE");
  writeAscii("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, bitDepth === 32 ? 3 : 1, true);
  offset += 2;
  view.setUint16(offset, channels.length, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitDepth, true);
  offset += 2;

  if (info.length > 0) {
    for (const byte of info) {
      view.setUint8(offset, byte);
      offset += 1;
    }
  }

  writeAscii("data");
  view.setUint32(offset, dataBytes, true);
  offset += 4;

  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      if (bitDepth === 16) {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      } else if (bitDepth === 24) {
        writeInt24(view, offset, sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
      } else {
        view.setFloat32(offset, sample, true);
      }
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ---------------------------------------------------------------- ffmpeg encode

function buildEncodeArgs(format: AudioFormat, options: EncodeOptions, outputName: string): string[] {
  const args: string[] = [];
  const title = options.title.trim();
  const artist = options.artist.trim();
  if (options.metadata && title) args.push("-metadata", `title=${title}`);
  if (options.metadata && artist) args.push("-metadata", `artist=${artist}`);

  if (format === "mp3") {
    args.push("-c:a", "libmp3lame");
    if (options.vbr) args.push("-q:a", "2");
    else args.push("-b:a", `${options.bitrate}k`);
  } else if (format === "ogg") {
    args.push("-c:a", "libvorbis");
    if (options.vbr) args.push("-q:a", "4");
    else args.push("-b:a", `${options.bitrate}k`);
  } else if (format === "m4a") {
    args.push("-c:a", "aac", "-b:a", `${options.bitrate}k`, "-movflags", "+faststart");
  }
  args.push(outputName);
  return args;
}

export async function encodeWithFfmpeg(
  ffmpeg: FFmpeg,
  input: Blob,
  format: AudioFormat,
  options: EncodeOptions,
  onProgress: (value: number, label: string) => void,
): Promise<Blob> {
  const runId = ++runCounter;
  const inputName = `in-${runId}.wav`;
  const outputName = `out-${runId}.${format}`;
  await ffmpeg.writeFile(inputName, new Uint8Array(await input.arrayBuffer()));

  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 60) logs.shift();
  };
  const onEvent = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    const value = Math.min(1, Math.max(0, progress));
    onProgress(value, `Encoding ${format.toUpperCase()} · ${Math.round(value * 100)}%`);
  };
  ffmpeg.on("progress", onEvent);
  ffmpeg.on("log", onLog);

  try {
    const code = await ffmpeg.exec([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputName,
      ...buildEncodeArgs(format, options, outputName),
    ]);
    if (code !== 0) {
      throw new Error(logs.slice(-3).join(" ") || `Encoding failed (exit code ${code}).`);
    }
    const data = await ffmpeg.readFile(outputName);
    const bytes =
      data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
    return new Blob([bytes], { type: MIME[format] });
  } finally {
    ffmpeg.off("progress", onEvent);
    ffmpeg.off("log", onLog);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // best effort cleanup
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // best effort cleanup
    }
  }
}

// ---------------------------------------------------------------- orchestration

export async function convertAudio(
  source: AudioBuffer,
  settings: ConverterSettings,
  onProgress: (value: number, label: string) => void,
  isCancelled: () => boolean,
): Promise<ConversionResult> {
  const needsEngine = settings.format !== "wav";
  const ffmpeg = needsEngine
    ? await ensureEngine((value, label) => onProgress(value * 0.35, label))
    : null;

  if (isCancelled()) throw new ConversionCancelled();

  onProgress(0.35, "Processing audio…");
  const pcm = await processPcm(source, settings, isCancelled);
  if (!pcm) throw new ConversionCancelled();

  onProgress(0.52, `Writing ${settings.format.toUpperCase()}…`);
  if (settings.format === "wav") {
    const blob = encodeWav(
      pcm.channels,
      pcm.sampleRate,
      settings.bitDepth,
      settings.metadata ? { title: settings.title, artist: settings.artist } : undefined,
    );
    onProgress(1, "Done");
    return { blob, mime: MIME.wav };
  }

  const inputWav = encodeWav(pcm.channels, pcm.sampleRate, 16);
  const blob = await encodeWithFfmpeg(ffmpeg as FFmpeg, inputWav, settings.format, settings, (value, label) =>
    onProgress(0.52 + value * 0.48, label),
  );
  onProgress(1, "Done");
  return { blob, mime: MIME[settings.format] };
}
