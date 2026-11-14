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
  const store = getGenerationStore();

  const download = request.nextUrl.searchParams.get("download") === "1";
  const preferSigned = request.nextUrl.searchParams.get("signed") === "1";

  if (preferSigned) {
    const signedUrl = await store.getSignedDownloadUrl(id, {
      ownerId: owner.ownerId,
      download,
      expiresInSeconds: 3600,
    });
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, 302);
    }
  }

  const asset = await store.readArtifact(id, owner.ownerId);
  if (!asset) {
    return proxyToHfWorker(request, {
      path: `/api/generations/${encodeURIComponent(id)}/file`,
      ownerId: owner.ownerId,
      isAuthenticated: true,
      timeoutMs: 45_000,
    });
  }

  const remainingSeconds = Math.max(0, Math.floor((asset.record.expiresAt - Date.now()) / 1000));
  const disposition = download ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(asset.buffer), {
    status: 200,
    headers: {
      "Content-Type": asset.record.mimeType,
      "Content-Length": String(asset.buffer.length),
      "Content-Disposition": `${disposition}; filename="${asset.record.fileName}"`,
      "Cache-Control": `private, max-age=${remainingSeconds}`,
      "Accept-Ranges": "bytes",
    },
  });
}

