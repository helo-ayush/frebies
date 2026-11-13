import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getGenerationStore } from "@/lib/storage/generation-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/generations?tool=audio/text-to-speech&limit=50
 * Generic listing endpoint across all tools, strictly scoped to the signed-in Clerk user.
 */
export async function GET(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const store = getGenerationStore();

  const toolSlug = request.nextUrl.searchParams.get("tool")?.trim() || undefined;
  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, limitRaw) : 50;

  const [records, storage] = await Promise.all([
    store.listGenerations({
      ownerId: owner.ownerId,
      toolSlug,
      limit,
    }),
    store.getStorageStats(owner.ownerId),
  ]);

  const now = Date.now();
  const items = records.map((rec) => ({
    id: rec.id,
    toolSlug: rec.toolSlug,
    fileName: rec.fileName,
    mimeType: rec.mimeType,
    byteLength: rec.byteLength,
    storageProvider: rec.storageProvider,
    createdAt: rec.createdAt,
    completedAt: rec.completedAt,
    expiresAt: rec.expiresAt,
    remainingMs: Math.max(0, rec.expiresAt - now),
    durationSeconds: rec.durationSeconds ?? null,
    fileUrl: `/api/generations/${rec.id}/file`,
    downloadUrl: `/api/generations/${rec.id}/file?download=1`,
    meta: rec.meta ?? null,
  }));

  return NextResponse.json({
    owner: {
      ownerId: owner.ownerId,
      isAuthenticated: owner.isAuthenticated,
    },
    storage,
    items,
  });
}

