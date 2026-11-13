import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getGenerationStore } from "@/lib/storage/generation-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  const store = getGenerationStore();
  const deleted = await store.deleteGeneration(id, owner.ownerId);

  if (!deleted) {
    return NextResponse.json({ error: "Generation not found or already expired." }, { status: 404 });
  }

  return NextResponse.json({
    deleted: true,
    storage: await store.getStorageStats(owner.ownerId),
  });
}

