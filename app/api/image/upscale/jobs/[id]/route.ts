import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getUpscaleManager } from "@/lib/image/upscale-manager";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function shouldFallbackLocally(response: NextResponse): Promise<boolean> {
  if (response.status === 502 || response.status === 503) return true;
  if (response.status === 404) {
    const body = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    return body?.error === "Worker route not found.";
  }
  return false;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;

  const proxyRes = await proxyToHfWorker(request, {
    path: `/api/image/upscale/jobs/${encodeURIComponent(id)}`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const job = await getUpscaleManager().getJobAsync(id, owner.ownerId);
  if (!job) {
    return NextResponse.json({ error: "Upscale job not found or expired." }, { status: 404 });
  }
  return NextResponse.json({ job });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;

  const proxyRes = await proxyToHfWorker(request, {
    path: `/api/image/upscale/jobs/${encodeURIComponent(id)}`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const job = await getUpscaleManager().retryJob(id, owner.ownerId);
  if (!job) {
    return NextResponse.json(
      { error: "Source image unavailable or job not found for retry." },
      { status: 404 },
    );
  }
  return NextResponse.json({ job }, { status: 202 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;

  const proxyRes = await proxyToHfWorker(request, {
    path: `/api/image/upscale/jobs/${encodeURIComponent(id)}`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const deleted = await getUpscaleManager().deleteJob(id, owner.ownerId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Cannot delete running or missing upscale job." },
      { status: 404 },
    );
  }
  return NextResponse.json({ deleted: true });
}
