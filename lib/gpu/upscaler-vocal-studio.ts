export type GpuStudioHardware = {
  device: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
};

export type GpuStudioStatusSnapshot = {
  state: "ready" | "booting" | "sleeping" | "error";
  warmupState: "ready" | "loading" | "error";
  proUpscalerReady: boolean;
  proUpscalerStep: string;
  modelsLoaded: string[];
  vocalModelsLoaded: string[];
  hardware: GpuStudioHardware | null;
  bootElapsedMs: number;
  checkedAt: number;
  lastError: string | null;
};

type RemoteHealthPayload = {
  status?: string;
  warmup?: { state?: string; error?: string | null };
  pro_upscaler?: {
    id?: string;
    status?: string;
    step?: string;
    loaded?: boolean;
    error?: string | null;
  };
  models_loaded?: Array<string | { id?: string; precision?: string }>;
  vocal_models_available?: string[];
  vocal_models_loaded?: string[];
  hardware?: {
    device?: string;
    total_gb?: number;
    used_gb?: number;
    free_gb?: number;
  };
};

type RemoteStudioPlatformPayload = {
  data?: {
    status?: string;
    runtime?: { status?: string };
  };
};

const DEFAULT_STUDIO_SLUG = "helo-ayush/Upscaler_VocalSeperator";
const DEFAULT_STUDIO_URL = "https://studio-helo-ayush-upscaler-vocalseperator.api-inference.modelscope.ai";
const CACHE_TTL_MS = 6_000;
const WAKE_DEBOUNCE_MS = 120_000;

export function getGpuStudioBaseUrl(): string {
  return (
    process.env.MODELSCOPE_VOCAL_SEPARATOR_URL ||
    process.env.MODELSCOPE_UPSCALER_URL ||
    DEFAULT_STUDIO_URL
  ).replace(/\/+$/, "");
}

export function getModelScopeApiToken(): string {
  return (process.env.MODELSCOPE_API_TOKEN || process.env.MODELSCOPE_API_KEY || "").trim();
}

export function getModelScopeOpenApiEndpoint(): string {
  return (process.env.MODELSCOPE_OPENAPI_ENDPOINT || "https://www.modelscope.ai").replace(/\/+$/, "");
}

export function getGpuStudioSlug(): string {
  return (
    process.env.MODELSCOPE_VOCAL_SEPARATOR_STUDIO ||
    process.env.MODELSCOPE_UPSCALER_STUDIO ||
    DEFAULT_STUDIO_SLUG
  ).trim();
}

export function buildGpuStudioAuthHeaders(): Record<string, string> {
  const token = getModelScopeApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let cachedSnapshot: GpuStudioStatusSnapshot | null = null;
let lastCheckedAt = 0;
let lastWakeAt = 0;
let bootStartedAt: number | null = null;
let statusInFlight: Promise<GpuStudioStatusSnapshot> | null = null;

async function fetchJsonSafe<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: T | null }> {
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
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

async function triggerStudioDeploy(): Promise<void> {
  const now = Date.now();
  if (now - lastWakeAt < WAKE_DEBOUNCE_MS) return;
  const token = getModelScopeApiToken();
  if (!token) return;
  const [owner, repo] = getGpuStudioSlug().split("/");
  if (!owner || !repo) return;

  lastWakeAt = now;
  if (!bootStartedAt) bootStartedAt = now;
  await fetchJsonSafe(
    `${getModelScopeOpenApiEndpoint()}/openapi/v1/studios/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/deploy`,
    { method: "POST", headers: buildGpuStudioAuthHeaders() },
    15_000,
  );
}

async function pollOnce(wakeIfDown: boolean): Promise<GpuStudioStatusSnapshot> {
  const now = Date.now();
  const headers = buildGpuStudioAuthHeaders();
  const baseUrl = getGpuStudioBaseUrl();

  const health = await fetchJsonSafe<RemoteHealthPayload>(
    `${baseUrl}/health`,
    { method: "GET", headers },
    9_000,
  );

  if (health.ok && health.data && health.data.status === "online") {
    const warmupRaw = (health.data.warmup?.state || "ready").toLowerCase();
    const warmupState: GpuStudioStatusSnapshot["warmupState"] =
      warmupRaw === "error" ? "error" : warmupRaw === "loading" ? "loading" : "ready";

    const proLoaded = Boolean(
      health.data.pro_upscaler?.loaded === true || health.data.pro_upscaler?.status === "ready",
    );
    const proStep = health.data.pro_upscaler?.step || (proLoaded ? "ready" : "loading");
    const modelsLoaded = (health.data.models_loaded || [])
      .map((item) => (typeof item === "string" ? item : item?.id || ""))
      .filter(Boolean);
    const vocalModelsLoaded = (health.data.vocal_models_loaded || []).filter(Boolean);

    const isReady = warmupState === "ready";
    if (isReady) {
      bootStartedAt = null;
    } else if (!bootStartedAt) {
      bootStartedAt = now;
    }

    const hw = health.data.hardware;
    const hardware: GpuStudioHardware | null =
      hw && typeof hw.device === "string"
        ? {
            device: hw.device,
            total_gb: Number(hw.total_gb ?? 0),
            used_gb: Number(hw.used_gb ?? 0),
            free_gb: Number(hw.free_gb ?? 0),
          }
        : null;

    const snap: GpuStudioStatusSnapshot = {
      state: isReady ? "ready" : warmupState === "error" ? "error" : "booting",
      warmupState,
      proUpscalerReady: proLoaded,
      proUpscalerStep: proStep,
      modelsLoaded,
      vocalModelsLoaded,
      hardware,
      bootElapsedMs: bootStartedAt ? Math.max(0, now - bootStartedAt) : 0,
      checkedAt: now,
      lastError: health.data.warmup?.error || health.data.pro_upscaler?.error || null,
    };
    cachedSnapshot = snap;
    lastCheckedAt = now;
    return snap;
  }

  // Check ModelScope platform API to distinguish sleeping vs building/deploying
  let platformStatus = "";
  const token = getModelScopeApiToken();
  const [owner, repo] = getGpuStudioSlug().split("/");
  if (token && owner && repo) {
    const meta = await fetchJsonSafe<RemoteStudioPlatformPayload>(
      `${getModelScopeOpenApiEndpoint()}/openapi/v1/studios/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { method: "GET", headers },
      8_000,
    );
    platformStatus = (
      meta.data?.data?.runtime?.status ||
      meta.data?.data?.status ||
      ""
    ).toLowerCase();
  }

  const isActiveBoot =
    platformStatus === "building" ||
    platformStatus === "deploying" ||
    platformStatus === "running" ||
    platformStatus === "starting";

  if (wakeIfDown && !isActiveBoot) {
    await triggerStudioDeploy();
  } else if (wakeIfDown && !bootStartedAt) {
    bootStartedAt = now;
  }

  const state: GpuStudioStatusSnapshot["state"] = isActiveBoot
    ? "booting"
    : wakeIfDown
      ? "booting"
      : "sleeping";

  if (state === "booting" && !bootStartedAt) {
    bootStartedAt = now;
  }

  const snap: GpuStudioStatusSnapshot = {
    state,
    warmupState: "loading",
    proUpscalerReady: false,
    proUpscalerStep: state === "sleeping" ? "sleeping" : "booting",
    modelsLoaded: [],
    vocalModelsLoaded: [],
    hardware: null,
    bootElapsedMs: bootStartedAt ? Math.max(0, now - bootStartedAt) : 0,
    checkedAt: now,
    lastError: null,
  };
  cachedSnapshot = snap;
  lastCheckedAt = now;
  return snap;
}

export async function getGpuStudioStatus(opts?: {
  wakeIfDown?: boolean;
  force?: boolean;
}): Promise<GpuStudioStatusSnapshot> {
  const now = Date.now();
  if (!opts?.force && cachedSnapshot && now - lastCheckedAt < CACHE_TTL_MS) {
    if (opts?.wakeIfDown && cachedSnapshot.state === "sleeping") {
      // Fall through to wake the sleeping studio
    } else {
      return {
        ...cachedSnapshot,
        bootElapsedMs: bootStartedAt ? Math.max(0, now - bootStartedAt) : 0,
      };
    }
  }

  if (statusInFlight && !opts?.force) {
    return statusInFlight;
  }

  statusInFlight = pollOnce(Boolean(opts?.wakeIfDown)).finally(() => {
    statusInFlight = null;
  });
  return statusInFlight;
}

export async function ensureGpuStudioReady(
  timeoutMs = 240_000,
  options?: { requireProUpscaler?: boolean },
): Promise<GpuStudioStatusSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let first = true;

  while (Date.now() < deadline) {
    const snap = await getGpuStudioStatus({ wakeIfDown: first, force: true });
    first = false;
    if (snap.state === "ready") {
      if (!options?.requireProUpscaler || snap.proUpscalerReady) {
        return snap;
      }
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }

  const finalSnap = await getGpuStudioStatus({ wakeIfDown: false, force: true });
  return finalSnap;
}
