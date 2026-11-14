"use client";

export type BrowserWorkerAuth = {
  url: string;
  token: string;
  expiresAt: number;
};

const VERCEL_SAFE_PROXY_BYTES = 4 * 1024 * 1024;

/**
 * Submits multipart form uploads directly to the HF worker to bypass Vercel's
 * 4.5 MB serverless body limit, falling back to the Next.js proxy for <= 4 MB files.
 */
export async function submitWorkerMultipartForm({
  workerAuth,
  refreshStatusUrl,
  onWorkerAuth,
  workerPath,
  proxyPath,
  form,
  fileSizeBytes,
}: {
  workerAuth: BrowserWorkerAuth | null;
  refreshStatusUrl: string;
  onWorkerAuth?: (next: BrowserWorkerAuth | null) => void;
  workerPath: string;
  proxyPath: string;
  form: FormData;
  fileSizeBytes: number;
}): Promise<Response> {
  let activeAuth = workerAuth;
  if (!activeAuth || activeAuth.expiresAt <= Date.now() + 60_000) {
    try {
      const statusRes = await fetch(refreshStatusUrl, { cache: "no-store" });
      if (statusRes.ok) {
        const statusData = (await statusRes.json().catch(() => null)) as {
          workerAuth?: BrowserWorkerAuth | null;
        } | null;
        if (statusData?.workerAuth) {
          activeAuth = statusData.workerAuth;
          onWorkerAuth?.(activeAuth);
        }
      }
    } catch {
      // Ignore refresh failure and fall back below
    }
  }

  let directError: string | null = null;
  if (activeAuth && activeAuth.expiresAt > Date.now() + 10_000) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const direct = await fetch(`${activeAuth.url}${workerPath}`, {
          method: "POST",
          headers: { "x-worker-token": activeAuth.token },
          body: form,
        });
        if (direct.status < 500) {
          return direct;
        }
        directError = `Worker returned HTTP ${direct.status}`;
        if ((direct.status === 502 || direct.status === 503) && attempt === 1) {
          await fetch(`${activeAuth.url}/health`, { cache: "no-store" }).catch(() => null);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        break;
      } catch (err) {
        directError = err instanceof Error ? err.message : "Network error contacting worker";
        if (attempt === 1) {
          await fetch(`${activeAuth.url}/health`, { cache: "no-store" }).catch(() => null);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
      }
    }
  }

  if (fileSizeBytes > VERCEL_SAFE_PROXY_BYTES) {
    throw new Error(
      directError
        ? `Direct upload to media worker failed (${directError}) and file exceeds Vercel's 4.5 MB proxy limit. Please try again in a few seconds.`
        : "Upload requires direct worker authorization because file exceeds Vercel's 4.5 MB proxy limit. Please refresh and sign in again.",
    );
  }

  const proxyRes = await fetch(proxyPath, {
    method: "POST",
    body: form,
  });
  if (proxyRes.status === 413) {
    throw new Error(
      "File exceeds the 4.5 MB web proxy limit. Direct upload to the HF worker was unavailable—please retry.",
    );
  }
  return proxyRes;
}
