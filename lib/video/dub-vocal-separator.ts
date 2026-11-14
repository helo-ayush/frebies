import { buildWav, parseWav } from "@/lib/audio/wav-utils";

export type VocalSeparatorModel = "bs_roformer" | "uvr_mdx_inst_hq3" | "kim_vocal_2";

export type SeparatedStemsResult = {
  vocalsWav24k: Buffer | null;
  instrumentalWav24k: Buffer | null;
  modelUsed: string | null;
  separated: boolean;
  error?: string;
};

const DEFAULT_SEPARATOR_STUDIO = "helo-ayush/Upscaler_VocalSeperator";
const MAX_SINGLE_STEM_CHUNK_BYTES = 14 * 1024 * 1024;
const MAX_DUAL_STEM_CHUNK_BYTES = 8 * 1024 * 1024; // Keeps dual-stem base64 payloads safely under ModelScope's 32 MB limit

function getSeparatorBaseUrl(): string {
  return (
    process.env.MODELSCOPE_VOCAL_SEPARATOR_URL ||
    "https://studio-helo-ayush-upscaler-vocalseperator.api-inference.modelscope.ai"
  ).replace(/\/+$/, "");
}

function getModelScopeToken(): string {
  return (process.env.MODELSCOPE_API_TOKEN || process.env.MODELSCOPE_API_KEY || "").trim();
}

function getOpenApiEndpoint(): string {
  return (process.env.MODELSCOPE_OPENAPI_ENDPOINT || "https://www.modelscope.ai").replace(/\/+$/, "");
}

function buildAuthHeaders(): Record<string, string> {
  const token = getModelScopeToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await res.text().catch(() => "");
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureVocalSeparatorReady(timeoutMs = 210_000): Promise<boolean> {
  const baseUrl = getSeparatorBaseUrl();
  const headers = buildAuthHeaders();
  const deadline = Date.now() + timeoutMs;

  // Quick check first
  try {
    const quick = await fetchJsonWithTimeout<{ status?: string; vocal_models_available?: string[] }>(
      `${baseUrl}/health`,
      { method: "GET", headers },
      8_000,
    );
    if (quick.ok && Array.isArray(quick.data?.vocal_models_available)) {
      return true;
    }
  } catch {
    // Studio may be asleep or booting
  }

  // Wake via ModelScope OpenAPI /deploy if needed
  const studioSlug = (process.env.MODELSCOPE_VOCAL_SEPARATOR_STUDIO || DEFAULT_SEPARATOR_STUDIO).trim();
  const [owner, repo] = studioSlug.split("/");
  if (owner && repo && getModelScopeToken()) {
    await fetchJsonWithTimeout(
      `${getOpenApiEndpoint()}/openapi/v1/studios/${owner}/${repo}/deploy`,
      { method: "POST", headers },
      15_000,
    ).catch(() => null);
  }

  while (Date.now() < deadline) {
    try {
      const check = await fetchJsonWithTimeout<{ status?: string; vocal_models_available?: string[] }>(
        `${baseUrl}/health`,
        { method: "GET", headers },
        8_000,
      );
      if (check.ok && Array.isArray(check.data?.vocal_models_available)) {
        return true;
      }
    } catch {
      // Still booting
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }
  return false;
}

/**
 * Separates vocals and instrumental/BGM stems using the dedicated 48 GB NVIDIA L20 studio
 * (BS-RoFormer ViperX FP16 by default). Automatically chunks long 24 kHz mono WAVs and
 * falls back cleanly without throwing if the remote GPU studio is unavailable.
 */
export async function separateAudioStemsWithGpu(
  wav24kBuffer: Buffer,
  options?: {
    model?: VocalSeparatorModel;
    returnVocals?: boolean;
    returnInstrumental?: boolean;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<SeparatedStemsResult> {
  const returnVocals = options?.returnVocals ?? true;
  const returnInstrumental = options?.returnInstrumental ?? true;
  const model = options?.model ?? "bs_roformer";

  if (!returnVocals && !returnInstrumental) {
    return { vocalsWav24k: null, instrumentalWav24k: null, modelUsed: null, separated: false };
  }

  let parsed;
  try {
    parsed = parseWav(wav24kBuffer);
  } catch (err) {
    return {
      vocalsWav24k: null,
      instrumentalWav24k: null,
      modelUsed: null,
      separated: false,
      error: err instanceof Error ? err.message : "Invalid WAV buffer",
    };
  }

  const ready = await ensureVocalSeparatorReady(120_000);
  if (!ready) {
    return {
      vocalsWav24k: null,
      instrumentalWav24k: null,
      modelUsed: null,
      separated: false,
      error: "Vocal separator GPU studio did not become ready in time",
    };
  }

  const bytesPerSample = Math.max(1, (parsed.bitsPerSample / 8) * parsed.numChannels);
  const alignedBytesPerSec = parsed.sampleRate * bytesPerSample;
  const maxRawChunkBytes =
    returnVocals && returnInstrumental ? MAX_DUAL_STEM_CHUNK_BYTES : MAX_SINGLE_STEM_CHUNK_BYTES;
  const chunkSeconds = Math.max(10, Math.floor(maxRawChunkBytes / Math.max(1, alignedBytesPerSec)));
  const maxChunkBytes = chunkSeconds * alignedBytesPerSec;

  const pcmChunks: Buffer[] = [];
  for (let offset = 0; offset < parsed.pcmData.length; offset += maxChunkBytes) {
    const slice = parsed.pcmData.subarray(offset, Math.min(parsed.pcmData.length, offset + maxChunkBytes));
    if (slice.length >= bytesPerSample * 100) {
      pcmChunks.push(slice);
    }
  }
  if (pcmChunks.length === 0) {
    pcmChunks.push(parsed.pcmData);
  }

  const vocalPcmParts: Buffer[] = [];
  const instPcmParts: Buffer[] = [];
  const baseUrl = getSeparatorBaseUrl();
  const headers = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(),
  };
  let modelUsed: string = model;

  try {
    for (let i = 0; i < pcmChunks.length; i += 1) {
      options?.onProgress?.(i, pcmChunks.length);
      const chunkWav = buildWav(
        pcmChunks[i],
        parsed.sampleRate,
        parsed.numChannels,
        parsed.bitsPerSample,
        parsed.audioFormat,
      );

      const payload = JSON.stringify({
        audio_base64: chunkWav.toString("base64"),
        model,
        sample_rate: parsed.sampleRate,
        mono: parsed.numChannels === 1,
        return_vocals: returnVocals,
        return_instrumental: returnInstrumental,
      });

      let res = await fetchJsonWithTimeout<{
        status?: string;
        model?: string;
        vocals_base64?: string | null;
        instrumental_base64?: string | null;
        detail?: string;
      }>(`${baseUrl}/separate`, { method: "POST", headers, body: payload }, 180_000);

      if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
        await ensureVocalSeparatorReady(90_000);
        res = await fetchJsonWithTimeout(
          `${baseUrl}/separate`,
          { method: "POST", headers, body: payload },
          180_000,
        );
      }

      if (!res.ok || !res.data || res.data.status !== "success") {
        throw new Error(res.data?.detail || `Vocal separator HTTP ${res.status}: ${res.text.slice(0, 160)}`);
      }

      if (res.data.model) modelUsed = res.data.model;

      if (returnVocals) {
        if (!res.data.vocals_base64) throw new Error("Vocal separator returned empty vocals stem.");
        vocalPcmParts.push(parseWav(Buffer.from(res.data.vocals_base64, "base64")).pcmData);
      }
      if (returnInstrumental) {
        if (!res.data.instrumental_base64) throw new Error("Vocal separator returned empty instrumental stem.");
        instPcmParts.push(parseWav(Buffer.from(res.data.instrumental_base64, "base64")).pcmData);
      }
      options?.onProgress?.(i + 1, pcmChunks.length);
    }

    return {
      vocalsWav24k: returnVocals ? buildWav(Buffer.concat(vocalPcmParts), parsed.sampleRate, parsed.numChannels, 16, 1) : null,
      instrumentalWav24k: returnInstrumental ? buildWav(Buffer.concat(instPcmParts), parsed.sampleRate, parsed.numChannels, 16, 1) : null,
      modelUsed,
      separated: true,
    };
  } catch (err) {
    return {
      vocalsWav24k: null,
      instrumentalWav24k: null,
      modelUsed: null,
      separated: false,
      error: err instanceof Error ? err.message : "Vocal separation failed",
    };
  }
}
