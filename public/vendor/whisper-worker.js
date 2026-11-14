/**
 * Browser Whisper speech-recognition runner for Video Dubbing.
 * - Primary mode: `new Worker("/vendor/whisper-worker.js", { type: "module" })`
 * - Fallback mode: main-thread dynamic `import(/* webpackIgnore: true *\/ "/vendor/whisper-worker.js")`
 * Keeps zero top-level external imports so worker boot never fails opaquely before message handling.
 */

let cachedTranscriber = null;
let cachedModelId = null;

function formatError(err) {
  if (!err) return "Unknown speech recognition error";
  if (typeof err === "string") return err;
  return err.message ? String(err.message) : String(err);
}

async function importTransformers(sources) {
  let lastError = null;
  for (const src of sources || []) {
    try {
      const mod = await import(src.moduleUrl);
      if (mod && typeof mod.pipeline === "function" && mod.env) {
        return { mod, wasmBase: src.wasmBase || "" };
      }
      lastError = new Error(`Invalid transformers module exports from ${src.moduleUrl}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(formatError(err));
    }
  }
  throw lastError || new Error("Could not load speech recognition library from CDN.");
}

async function hasWorkingWebGpu() {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function loadPipeline(mod, modelId, wasmBase, progressCb) {
  if (cachedTranscriber && cachedModelId === modelId) {
    return cachedTranscriber;
  }

  let cacheAvailable = false;
  try {
    cacheAvailable = typeof caches !== "undefined" && Boolean(caches);
  } catch {
    cacheAvailable = false;
  }

  mod.env.allowLocalModels = false;
  mod.env.useBrowserCache = cacheAvailable;

  const wasmCfg = mod.env?.backends?.onnx?.wasm;
  if (wasmCfg) {
    if (wasmBase) {
      wasmCfg.wasmPaths = wasmBase;
    }
    wasmCfg.proxy = false;
    if (typeof self !== "undefined" && !self.crossOriginIsolated) {
      wasmCfg.numThreads = 1;
    }
  }

  if (await hasWorkingWebGpu()) {
    try {
      cachedTranscriber = await mod.pipeline("automatic-speech-recognition", modelId, {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        progress_callback: progressCb,
      });
      cachedModelId = modelId;
      return cachedTranscriber;
    } catch {
      // Fall back cleanly to universal WASM backend when WebGPU kernel init fails
    }
  }

  cachedTranscriber = await mod.pipeline("automatic-speech-recognition", modelId, {
    device: "wasm",
    dtype: "q8",
    progress_callback: progressCb,
  });
  cachedModelId = modelId;
  return cachedTranscriber;
}

export async function runWhisperPipeline({ sources, audio, language, modelId }, emit) {
  emit({
    type: "progress",
    phase: "loading_model",
    percent: 3,
    label: "Loading speech recognition engine...",
  });

  const { mod, wasmBase } = await importTransformers(sources);
  const fileProgress = new Map();

  const asr = await loadPipeline(mod, modelId, wasmBase, (ev) => {
    if (!ev) return;
    if (ev.status === "progress" && ev.file && typeof ev.progress === "number") {
      fileProgress.set(ev.file, Math.max(0, Math.min(100, ev.progress)));
      const vals = Array.from(fileProgress.values());
      const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
      emit({
        type: "progress",
        phase: "loading_model",
        percent: Math.round(avg),
        label: `Downloading on-device Whisper speech model (${Math.round(avg)}%)...`,
      });
    } else if (ev.status === "initiate") {
      emit({
        type: "progress",
        phase: "loading_model",
        percent: 8,
        label: "Preparing speech recognition engine...",
      });
    }
  });

  emit({
    type: "progress",
    phase: "transcribing",
    percent: 55,
    label: "Listening & segmenting spoken dialogue...",
  });

  const opts = {
    chunk_length_s: 28,
    stride_length_s: 5,
    return_timestamps: true,
    task: "transcribe",
  };
  if (language && language !== "auto") {
    opts.language = language;
  }

  return await asr(audio, opts);
}

const isDedicatedWorker =
  typeof WorkerGlobalScope !== "undefined" &&
  typeof self !== "undefined" &&
  self instanceof WorkerGlobalScope &&
  typeof self.document === "undefined";

if (isDedicatedWorker) {
  self.onmessage = async (event) => {
    const payload = event.data || {};
    if (payload.type !== "transcribe") return;

    try {
      const result = await runWhisperPipeline(payload, (msg) => self.postMessage(msg));
      self.postMessage({ type: "done", result });
    } catch (error) {
      self.postMessage({
        type: "error",
        message: formatError(error),
      });
    }
  };

  self.postMessage({ type: "ready" });
}

