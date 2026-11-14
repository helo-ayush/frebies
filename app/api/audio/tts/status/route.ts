import { NextRequest } from "next/server";
import {
  authRequiredResponse,
  requireAuthenticatedOwner,
  resolveRequestOwnerAsync,
} from "@/lib/auth/owner";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/audio/tts/status?wake=1
 * Proxies TTS studio status, queue, and storage metadata to the persistent HF worker.
 */
export async function GET(request: NextRequest) {
  const owner = await resolveRequestOwnerAsync(request);
  const isSignedIn = owner.isAuthenticated && Boolean(owner.userId);
  return proxyToHfWorker(request, {
    path: "/api/audio/tts/status",
    ownerId: owner.ownerId,
    isAuthenticated: isSignedIn,
    timeoutMs: 25_000,
  });
}

/**
 * POST /api/audio/tts/status explicitly wakes sleeping studios on the HF worker.
 */
export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  return proxyToHfWorker(request, {
    path: "/api/audio/tts/status",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });
}
