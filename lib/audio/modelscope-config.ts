export type StudioConfig = {
  id: string;
  label: string;
  owner: string;
  repo: string;
  slug: string;
  apiUrl: string;
  msFunUrl: string;
  token: string;
};

export type PoolSettings = {
  openApiEndpoint: string;
  token: string;
  maxConcurrentPerStudio: number;
  wakeAllOnVisit: boolean;
  studios: StudioConfig[];
};

const DEFAULT_STUDIOS = ["helo-ayush/AudioTTS3", "helo-ayush/AudioTTS2"];

function cleanList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStudioFromUrl(rawUrl: string): { owner: string; repo: string; apiUrl: string } | null {
  const normalized = rawUrl.replace(/\/+$/, "");
  const apiMatch = normalized.match(/^https?:\/\/studio-([a-z0-9-]+?)-([a-z0-9]+)\.api-inference\.modelscope\.(ai|cn)$/i);
  if (apiMatch) {
    return { owner: apiMatch[1], repo: apiMatch[2], apiUrl: normalized };
  }
  const funMatch = normalized.match(/^https?:\/\/([a-z0-9-]+?)-([a-z0-9]+)\.ms\.fun$/i);
  if (funMatch) {
    return {
      owner: funMatch[1],
      repo: funMatch[2],
      apiUrl: `https://studio-${funMatch[1]}-${funMatch[2]}.api-inference.modelscope.ai`,
    };
  }
  return null;
}

function buildStudioConfig(spec: string, pairedUrl: string | undefined, defaultToken: string): StudioConfig | null {
  let owner = "";
  let repo = "";
  let apiUrl = pairedUrl ? pairedUrl.replace(/\/+$/, "") : "";

  if (spec.includes("/")) {
    const [o, r] = spec.split("/", 2).map((s) => s.trim());
    if (o && r) {
      owner = o;
      repo = r;
    }
  } else if (spec.startsWith("http")) {
    const parsed = parseStudioFromUrl(spec);
    if (parsed) {
      owner = parsed.owner;
      repo = parsed.repo;
      apiUrl = apiUrl || parsed.apiUrl;
    }
  }

  if (!owner && apiUrl) {
    const parsed = parseStudioFromUrl(apiUrl);
    if (parsed) {
      owner = parsed.owner;
      repo = parsed.repo;
    }
  }

  if (!owner || !repo) return null;

  const slug = repo.toLowerCase();
  const ownerSlug = owner.toLowerCase();
  const resolvedApiUrl = apiUrl || `https://studio-${ownerSlug}-${slug}.api-inference.modelscope.ai`;
  const msFunUrl = `https://${ownerSlug}-${slug}.ms.fun`;

  return {
    id: `${owner}/${repo}`,
    label: repo,
    owner,
    repo,
    slug,
    apiUrl: resolvedApiUrl,
    msFunUrl,
    token: defaultToken,
  };
}

export function loadPoolSettings(): PoolSettings {
  const token = (process.env.MODELSCOPE_API_TOKEN || process.env.MODELSCOPE_API_KEY || "").trim();
  const openApiEndpoint = (process.env.MODELSCOPE_OPENAPI_ENDPOINT || "https://www.modelscope.ai").replace(/\/+$/, "");

  const maxConcurrentRaw = Number.parseInt(process.env.MODELSCOPE_MAX_CONCURRENT_PER_STUDIO || "1", 10);
  const maxConcurrentPerStudio = Number.isFinite(maxConcurrentRaw) && maxConcurrentRaw > 0 ? Math.min(4, maxConcurrentRaw) : 1;
  const wakeAllOnVisit = (process.env.MODELSCOPE_WAKE_ALL_ON_VISIT || "true").toLowerCase() !== "false";

  const studioSpecs = cleanList(process.env.MODELSCOPE_TTS_STUDIOS);
  const studioUrls = cleanList(process.env.MODELSCOPE_TTS_URLS);

  const specs = studioSpecs.length > 0 ? studioSpecs : studioUrls.length > 0 ? studioUrls : DEFAULT_STUDIOS;
  const studios: StudioConfig[] = [];
  const seen = new Set<string>();

  specs.forEach((spec, idx) => {
    const cfg = buildStudioConfig(spec, studioUrls[idx], token);
    if (cfg && !seen.has(cfg.id.toLowerCase())) {
      seen.add(cfg.id.toLowerCase());
      studios.push(cfg);
    }
  });

  // Also ensure any extra URLs not matched by specs are included
  studioUrls.forEach((url) => {
    const parsed = parseStudioFromUrl(url);
    if (!parsed) return;
    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (!seen.has(key)) {
      const cfg = buildStudioConfig(`${parsed.owner}/${parsed.repo}`, url, token);
      if (cfg) {
        seen.add(key);
        studios.push(cfg);
      }
    }
  });

  return {
    openApiEndpoint,
    token,
    maxConcurrentPerStudio,
    wakeAllOnVisit,
    studios,
  };
}

