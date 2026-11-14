import { NextRequest } from "next/server";
import {
  authRequiredResponse,
  requireAuthenticatedOwner,
  resolveRequestOwnerAsync,
} from "@/lib/auth/owner";
import { createBrowserWorkerAuth, proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const owner = await resolveRequestOwnerAsync(request);
  const isSignedIn = owner.isAuthenticated && Boolean(owner.userId);
  return proxyToHfWorker(request, {
    path: "/api/video/dub/status",
    ownerId: owner.ownerId,
    isAuthenticated: isSignedIn,
    timeoutMs: 25_000,
    transformJson: (data) => ({
      ...((data && typeof data === "object" ? data : {}) as Record<string, unknown>),
      workerAuth: isSignedIn ? createBrowserWorkerAuth(owner.ownerId) : null,
    }),
  });
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  return proxyToHfWorker(request, {
    path: "/api/video/dub/status",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });
}
