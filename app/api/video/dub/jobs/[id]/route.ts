import { NextRequest } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  return proxyToHfWorker(request, {
    path: `/api/video/dub/jobs/${encodeURIComponent(id)}`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  return proxyToHfWorker(request, {
    path: `/api/video/dub/jobs/${encodeURIComponent(id)}`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  return proxyToHfWorker(request, {
    path: `/api/video/dub/jobs/${encodeURIComponent(id)}`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 115_000,
  });
}
