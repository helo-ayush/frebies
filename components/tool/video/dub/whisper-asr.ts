"use client";

import type { DubSegment } from "@/lib/video/dub-types";

export type AsrProgress = {
  phase: "loading_model" | "transcribing" | "finalizing";
  percent: number;
  label: string;
};

export type AsrResult = {
  detectedLanguage: string;
  segments: DubSegment[];
};

type TransformersSource = {
  moduleUrl: string;
  wasmBase: string;
};

// Same-origin worker with zero top-level external imports (like /vendor/ffmpeg & /vendor/pdf.worker).
const WHISPER_WORKER_URL = "/vendor/whisper-worker.js";
const WHISPER_MODEL_ID = "onnx-community/whisper-base";

// Use self-contained browser builds (dist/transformers.min.js) rather than bundler dist/transformers.web.min.js,
// because transformers.web.min.js contains bare `onnxruntime-web` specifiers that browsers reject in ESM workers.
const TRANSFORMERS_SOURCES: TransformersSource[] = [
  {
    moduleUrl: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js",
    wasmBase: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/",
  },
  {
    moduleUrl: "https://unpkg.com/@huggingface/transformers@3.8.1/dist/transformers.min.js",
    wasmBase: "https://unpkg.com/@huggingface/transformers@3.8.1/dist/",
  },
  {
    moduleUrl: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm",
    wasmBase: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/",
  },
];

class WorkerBootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerBootError";
  }
}

function normalizeWhisperOutput(raw: unknown, durationSec: number): AsrResult {
  const obj = (raw ?? {}) as {
    text?: string;
    chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>;
    language?: string;
  };

  const detectedLanguage =
    typeof obj.language === "string" && obj.language.trim() ? obj.language.trim() : "auto";

  const chunks = Array.isArray(obj.chunks) ? obj.chunks : [];
  const segments: DubSegment[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const c = chunks[i];
    const text = (c.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const rawStart = Array.isArray(c.timestamp) && typeof c.timestamp[0] === "number" ? c.timestamp[0] : 0;
    const nextStart =
      chunks[i + 1]?.timestamp && typeof chunks[i + 1].timestamp?.[0] === "number"
        ? chunks[i + 1].timestamp![0]!
        : durationSec;
    const rawEnd =
      Array.isArray(c.timestamp) && typeof c.timestamp[1] === "number"
        ? c.timestamp[1]
        : Math.min(durationSec, Math.max(rawStart + 1.5, nextStart));

    // Merge tiny <1.2s adjacent crumbs smoothly when gap is negligible
    const prev = segments[segments.length - 1];
    if (
      prev &&
      rawStart - prev.endSec < 0.35 &&
      (prev.endSec - prev.startSec < 1.4 || prev.sourceText.length < 28) &&
      prev.sourceText.length + text.length < 150
    ) {
      prev.endSec = Number(Math.max(prev.endSec, rawEnd).toFixed(2));
      prev.sourceText = `${prev.sourceText} ${text}`.trim();
      continue;
    }

    segments.push({
      id: `seg_${segments.length + 1}`,
      startSec: Number(Math.max(0, rawStart).toFixed(2)),
      endSec: Number(Math.max(rawStart + 0.5, rawEnd).toFixed(2)),
      sourceText: text,
      translatedText: "",
    });
  }

  if (segments.length === 0 && typeof obj.text === "string" && obj.text.trim()) {
    segments.push({
      id: "seg_1",
      startSec: 0,
      endSec: Number(Math.max(2, durationSec).toFixed(2)),
      sourceText: obj.text.trim(),
      translatedText: "",
    });
  }

  return { detectedLanguage, segments };
}

type TranscribeOptions = {
  pcm16k: Float32Array;
  durationSec: number;
  languageHint?: string;
  onProgress?: (progress: AsrProgress) => void;
  signal?: AbortSignal;
};

/**
 * Run multilingual Whisper speech recognition inside a same-origin module Web Worker,
 * with automatic main-thread fallback if Web Workers are restricted in the current browser.
 */
export async function transcribeAudioInBrowser(options: TranscribeOptions): Promise<AsrResult> {
  if (options.signal?.aborted) {
    throw new Error("Transcription cancelled.");
  }

  try {
    return await runInDedicatedWorker(options);
  } catch (err) {
    if (options.signal?.aborted) throw err;
    if (err instanceof WorkerBootError) {
      return await runOnMainThread(options);
    }
    throw err;
  }
}

function runInDedicatedWorker(options: TranscribeOptions): Promise<AsrResult> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new WorkerBootError("Web Workers are not available in this browser."));
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(WHISPER_WORKER_URL, { type: "module" });
    } catch (err) {
      reject(new WorkerBootError(err instanceof Error ? err.message : "Could not spawn speech worker."));
      return;
    }

    let settled = false;
    let workerReady = false;
    let bootTimeout = 0;

    const cleanup = () => {
      window.clearTimeout(bootTimeout);
      worker.terminate();
      options.signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Transcription cancelled."));
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });

    bootTimeout = window.setTimeout(() => {
      if (settled || workerReady) return;
      settled = true;
      cleanup();
      reject(new WorkerBootError("Speech worker timed out during initialization."));
    }, 6000);

    worker.onmessage = (event) => {
      const msg = event.data as
        | { type: "ready" }
        | { type: "progress"; phase: AsrProgress["phase"]; percent: number; label: string }
        | { type: "done"; result: unknown }
        | { type: "error"; message: string };

      if (!msg) return;
      if (msg.type === "ready") {
        workerReady = true;
        window.clearTimeout(bootTimeout);
        return;
      }

      if (msg.type === "progress") {
        workerReady = true;
        window.clearTimeout(bootTimeout);
        options.onProgress?.({ phase: msg.phase, percent: msg.percent, label: msg.label });
      } else if (msg.type === "done") {
        if (settled) return;
        settled = true;
        window.clearTimeout(bootTimeout);
        cleanup();
        options.onProgress?.({
          phase: "finalizing",
          percent: 100,
          label: "Dialogue segments extracted",
        });
        resolve(normalizeWhisperOutput(msg.result, options.durationSec));
      } else if (msg.type === "error") {
        if (settled) return;
        settled = true;
        window.clearTimeout(bootTimeout);
        cleanup();
        reject(new Error(msg.message || "Speech transcription failed."));
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(bootTimeout);
      cleanup();
      const details = [err.message, err.filename ? `${err.filename}:${err.lineno}` : ""]
        .filter(Boolean)
        .join(" ");
      if (!workerReady) {
        reject(new WorkerBootError(details || "Module Web Worker failed to boot."));
      } else {
        reject(new Error(details || "Speech worker crashed during transcription."));
      }
    };

    // Clone buffer before transfer so caller retains pcm16k for playback/speaker cloning
    const transferable = new Float32Array(options.pcm16k);
    worker.postMessage(
      {
        type: "transcribe",
        sources: TRANSFORMERS_SOURCES,
        audio: transferable,
        language: options.languageHint || "auto",
        modelId: WHISPER_MODEL_ID,
      },
      [transferable.buffer],
    );
  });
}

async function runOnMainThread(options: TranscribeOptions): Promise<AsrResult> {
  const runnerPath: string = WHISPER_WORKER_URL;
  const mod = (await import(/* webpackIgnore: true */ runnerPath)) as {
    runWhisperPipeline: (
      payload: {
        sources: TransformersSource[];
        audio: Float32Array;
        language: string;
        modelId: string;
      },
      emit: (msg: { type: "progress"; phase: AsrProgress["phase"]; percent: number; label: string }) => void,
    ) => Promise<unknown>;
  };

  if (options.signal?.aborted) {
    throw new Error("Transcription cancelled.");
  }

  const result = await mod.runWhisperPipeline(
    {
      sources: TRANSFORMERS_SOURCES,
      audio: new Float32Array(options.pcm16k),
      language: options.languageHint || "auto",
      modelId: WHISPER_MODEL_ID,
    },
    (msg) => {
      if (!options.signal?.aborted && msg.type === "progress") {
        options.onProgress?.({ phase: msg.phase, percent: msg.percent, label: msg.label });
      }
    },
  );

  if (options.signal?.aborted) {
    throw new Error("Transcription cancelled.");
  }

  options.onProgress?.({
    phase: "finalizing",
    percent: 100,
    label: "Dialogue segments extracted",
  });
  return normalizeWhisperOutput(result, options.durationSec);
}
