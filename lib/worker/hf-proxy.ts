import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export type BrowserWorkerAuth = {
  url: string;
  token: string;
  expiresAt: number;
};

export function getHfWorkerUrl(): string {
  return (process.env.HF_WORKER_URL || "https://helo-ayush-compiler2.hf.space").replace(/\/+$/, "");
}

export function getWorkerSecret(): string {
  return process.env.WORKER_SECRET || "frebies_hf_worker_secret_2026_9f8a7b6c5d4e";
}

export function createBrowserWorkerAuth(ownerId: string): BrowserWorkerAuth {
  const encodedOwner = Buffer.from(ownerId, "utf8").toString("base64url");
  const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  const sig = crypto
    .createHmac("sha256", getWorkerSecret())
    .update(`${encodedOwner}.${expiresAt}`)
    .digest("hex");

  return {
    url: getHfWorkerUrl(),
    token: `${encodedOwner}.${expiresAt}.${sig}`,
    expiresAt,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function wakeHfSpaceIfSleeping(): Promise<void> {
  const baseUrl = getHfWorkerUrl();
  await fetch(`${baseUrl}/health`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
}

export async function proxyToHfWorker(
  request: NextRequest,
  options: {
    path: string;
    ownerId: string;
    isAuthenticated: boolean;
    timeoutMs?: number;
    method?: string;
    transformJson?: (data: unknown) => unknown;
  },
): Promise<NextResponse> {
  const baseUrl = getHfWorkerUrl();
  const targetUrl = `${baseUrl}${options.path}${request.nextUrl.search}`;
  const method = (options.method || request.method || "GET").toUpperCase();
  const timeoutMs = options.timeoutMs ?? 25_000;

  let bodyBytes: Uint8Array | undefined;
  const contentType = request.headers.get("content-type");
  if (method !== "GET" && method !== "HEAD") {
    const ab = await request.arrayBuffer();
    if (ab.byteLength > 0) {
      bodyBytes = new Uint8Array(ab);
    }
  }

  const maxAttempts = method === "GET" ? 3 : 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers = new Headers();
    headers.set("x-worker-secret", getWorkerSecret());
    headers.set("x-owner-id", options.ownerId);
    headers.set("x-owner-authenticated", options.isAuthenticated ? "1" : "0");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body: bodyBytes ? Buffer.from(bodyBytes) : undefined,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (isRetryableStatus(upstream.status) && attempt < maxAttempts) {
        await wakeHfSpaceIfSleeping();
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }

      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (location) {
          return NextResponse.redirect(location, 302);
        }
      }

      const upstreamCt = upstream.headers.get("content-type") || "application/json; charset=utf-8";
      if (upstreamCt.includes("application/json")) {
        const text = await upstream.text();
        let parsed: unknown;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          return new NextResponse(text, {
            status: upstream.status,
            headers: { "Content-Type": upstreamCt, "Cache-Control": "no-store" },
          });
        }
        const finalPayload =
          upstream.ok && options.transformJson ? options.transformJson(parsed) : parsed;
        return NextResponse.json(finalPayload, {
          status: upstream.status,
          headers: { "Cache-Control": "no-store" },
        });
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      const outHeaders = new Headers();
      outHeaders.set("Content-Type", upstreamCt);
      outHeaders.set("Cache-Control", upstream.headers.get("cache-control") || "no-store");
      const disp = upstream.headers.get("content-disposition");
      if (disp) outHeaders.set("Content-Disposition", disp);
      const len = upstream.headers.get("content-length");
      if (len) outHeaders.set("Content-Length", len);

      return new NextResponse(new Uint8Array(buf), {
        status: upstream.status,
        headers: outHeaders,
      });
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await wakeHfSpaceIfSleeping();
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
    }
  }

  const msg =
    lastError instanceof Error
      ? lastError.message
      : "HF media worker is waking up from sleep. Please retry in a few seconds.";
  return NextResponse.json({ error: msg }, { status: 503 });
}
