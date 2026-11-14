import { NextRequest } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  return proxyToHfWorker(request, {
    path: "/api/video/dub/jobs",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  return proxyToHfWorker(request, {
    path: "/api/video/dub/jobs",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 115_000,
  });
}
