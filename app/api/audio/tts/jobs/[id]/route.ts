import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getTtsManager } from "@/lib/audio/tts-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  const manager = getTtsManager();
  const job = manager.getJob(id, owner.ownerId);
  if (!job) {
    return NextResponse.json({ error: "Generation job not found or expired." }, { status: 404 });
  }
  const pool = manager.getCachedPoolSnapshot();
  const storage = manager.getCachedStorageStats(owner.ownerId);
  return NextResponse.json({ job, pool, storage });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  const manager = getTtsManager();
  const job = await manager.retryJob(id, owner.ownerId);
  if (!job) {
    return NextResponse.json({ error: "Generation job not found or expired." }, { status: 404 });
  }
  const pool = manager.getCachedPoolSnapshot();
  const storage = manager.getCachedStorageStats(owner.ownerId);
  return NextResponse.json({ job, pool, storage });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  const manager = getTtsManager();
  const deleted = await manager.deleteJob(id, owner.ownerId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Cannot delete an active job or unknown generation." },
      { status: 400 },
    );
  }
  return NextResponse.json({
    deleted: true,
    pool: manager.getCachedPoolSnapshot(),
    storage: await manager.getStorageStats(owner.ownerId),
  });
}

