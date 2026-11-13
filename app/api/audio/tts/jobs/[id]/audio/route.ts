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

  const download = request.nextUrl.searchParams.get("download") === "1";
  const preferSigned = request.nextUrl.searchParams.get("signed") === "1";

  if (preferSigned) {
    const signedUrl = await manager.getSignedJobAudioUrl(id, {
      ownerId: owner.ownerId,
      download,
    });
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, 302);
    }
  }

  const asset = await manager.readJobAudio(id, owner.ownerId);
  if (!asset) {
    return NextResponse.json({ error: "Audio file not ready, evicted, or expired." }, { status: 404 });
  }

  const remainingSeconds = Math.max(0, Math.floor((asset.expiresAt - Date.now()) / 1000));
  const disposition = download ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(asset.buffer), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.buffer.length),
      "Content-Disposition": `${disposition}; filename="${asset.fileName}"`,
      "Cache-Control": `private, max-age=${remainingSeconds}`,
      "Accept-Ranges": "bytes",
    },
  });
}

