import { NextRequest, NextResponse } from "next/server";
import { getTtsManager } from "@/lib/audio/tts-manager";
import {
  authRequiredResponse,
  requireAuthenticatedOwner,
  resolveRequestOwnerAsync,
} from "@/lib/auth/owner";
import { getVideoDubManager } from "@/lib/video/dub-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const ttsManager = getTtsManager();
  const dubManager = getVideoDubManager();
  const owner = await resolveRequestOwnerAsync(request);
  const wakeParam = request.nextUrl.searchParams.get("wake");
  const forceParam = request.nextUrl.searchParams.get("force");
  const isSignedIn = owner.isAuthenticated && Boolean(owner.userId);

  const pool = await ttsManager.getPoolStatus({
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

  const [jobs, storage] = await Promise.all([
    dubManager.listJobsAsync(owner.ownerId),
    ttsManager.getStorageStats(owner.ownerId),
  ]);

  return NextResponse.json({
    pool,
    jobs,
    storage,
    requiresAuth: false,
  });
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const pool = await getTtsManager().getPoolStatus({ wakeIfDown: true, force: true });
  return NextResponse.json({ pool });
}

