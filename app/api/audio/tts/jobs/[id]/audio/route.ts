import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getGenerationStore } from "@/lib/storage/generation-store";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;

  const download = request.nextUrl.searchParams.get("download") === "1";
  const preferSigned = request.nextUrl.searchParams.get("signed") === "1";

  if (preferSigned) {
    const signedUrl = await getGenerationStore()
      .getSignedDownloadUrl(id, {
        ownerId: owner.ownerId,
        download,
        expiresInSeconds: 3600,
      })
      .catch(() => null);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, 302);
    }
  }

  return proxyToHfWorker(request, {
    path: `/api/audio/tts/jobs/${encodeURIComponent(id)}/audio`,
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 30_000,
  });
}
