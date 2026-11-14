import { NextRequest, NextResponse } from "next/server";
import {
  authRequiredResponse,
  requireAuthenticatedOwner,
  resolveRequestOwnerAsync,
} from "@/lib/auth/owner";
import { getVocalManager } from "@/lib/audio/vocal-manager";
import { createBrowserWorkerAuth, proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function shouldFallbackLocally(response: NextResponse): Promise<boolean> {
  if (response.status === 502 || response.status === 503) return true;
  if (response.status === 404) {
    const body = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    return body?.error === "Worker route not found.";
  }
  return false;
}

export async function GET(request: NextRequest) {
  const owner = await resolveRequestOwnerAsync(request);
  const isSignedIn = owner.isAuthenticated && Boolean(owner.userId);

  const proxyRes = await proxyToHfWorker(request, {
    path: "/api/audio/vocal/status",
    ownerId: owner.ownerId,
    isAuthenticated: isSignedIn,
    timeoutMs: 25_000,
    transformJson: (data) => ({
      ...((data && typeof data === "object" ? data : {}) as Record<string, unknown>),
      workerAuth: isSignedIn ? createBrowserWorkerAuth(owner.ownerId) : null,
    }),
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const manager = getVocalManager();
  const wake = request.nextUrl.searchParams.get("wake") === "1";
  const force = request.nextUrl.searchParams.get("force") === "1";
  const [status, storage] = await Promise.all([
    manager.getStatusSnapshot({ wakeIfDown: wake, force }),
    isSignedIn ? manager.getStorageStats(owner.ownerId) : Promise.resolve(manager.getCachedStorageStats(owner.ownerId)),
  ]);

  return NextResponse.json({
    status,
    storage,
    workerAuth: isSignedIn ? createBrowserWorkerAuth(owner.ownerId) : null,
  });
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  const proxyRes = await proxyToHfWorker(request, {
    path: "/api/audio/vocal/status",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const manager = getVocalManager();
  const [status, storage] = await Promise.all([
    manager.getStatusSnapshot({ wakeIfDown: true, force: true }),
    manager.getStorageStats(owner.ownerId),
  ]);
  return NextResponse.json({ status, storage });
}
