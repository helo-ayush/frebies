import { NextRequest, NextResponse } from "next/server";
import {
  authRequiredResponse,
  requireAuthenticatedOwner,
  resolveRequestOwnerAsync,
} from "@/lib/auth/owner";
import { getTtsManager } from "@/lib/audio/tts-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/audio/tts/status?wake=1
 * Returns ModelScope studio pool status and, when signed in, recent TTS jobs + storage stats
 * strictly scoped to the authenticated Clerk user.
 */
export async function GET(request: NextRequest) {
  const manager = getTtsManager();
  const owner = await resolveRequestOwnerAsync(request);
  const wakeParam = request.nextUrl.searchParams.get("wake");
  const forceParam = request.nextUrl.searchParams.get("force");
  const isSignedIn = owner.isAuthenticated && Boolean(owner.userId);

  const pool = await manager.getPoolStatus({
    wakeIfDown: isSignedIn && (wakeParam === "1" || wakeParam === "true"),
    force: isSignedIn && (forceParam === "1" || forceParam === "true"),
  });

  if (!isSignedIn) {
    return NextResponse.json({
      pool,
      jobs: [],
      storage: null,
      requiresAuth: true,
    });
  }

  const storage = await manager.getStorageStats(owner.ownerId);

  return NextResponse.json({
    pool,
    jobs: await manager.listJobsAsync(owner.ownerId),
    storage,
    requiresAuth: false,
  });
}

/**
 * POST /api/audio/tts/status explicitly wakes sleeping studios,
 * or restarts a specific studio when `{ studioId }` is provided.
 */
export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const manager = getTtsManager();
  let studioId: string | null = null;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { studioId?: unknown };
      if (typeof body.studioId === "string" && body.studioId.trim()) {
        studioId = body.studioId.trim();
      }
    }
  } catch {
    // Empty or non-JSON body defaults to waking sleeping studios
  }

  const pool = studioId
    ? await manager.restartStudio(studioId)
    : await manager.getPoolStatus({ wakeIfDown: true, force: true });

  const storage = await manager.getStorageStats(owner.ownerId);

  return NextResponse.json({
    pool,
    jobs: await manager.listJobsAsync(owner.ownerId),
    storage,
  });
}

