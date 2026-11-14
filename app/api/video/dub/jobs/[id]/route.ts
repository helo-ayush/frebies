import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getVideoDubManager } from "@/lib/video/dub-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  const job = await getVideoDubManager().getJobAsync(id, owner.ownerId);
  if (!job) {
    return NextResponse.json({ error: "Dubbing job not found or expired." }, { status: 404 });
  }
  return NextResponse.json({ job });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;
  const ok = await getVideoDubManager().deleteJob(id, owner.ownerId);
  if (!ok) {
    return NextResponse.json({ error: "Dubbing job not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Optionally attach a remuxed MP4 video (up to 45 MB) to the user's 24h private vault
 * so re-downloading later returns the finished video file directly.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();
  const { id } = await context.params;

  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof Blob)) {
      return NextResponse.json({ error: "Missing video file payload." }, { status: 400 });
    }
    if (entry.size <= 0 || entry.size > 45 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Cloud vault MP4 archive accepts files up to 45 MB (larger MP4s download directly from browser)." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    const nameRaw = form.get("fileName");
    const fileName =
      typeof nameRaw === "string" && nameRaw.trim()
        ? nameRaw.trim().slice(0, 120)
        : `dubbed-${id}.mp4`;

    const updated = await getVideoDubManager().attachMuxedVideo({
      jobId: id,
      ownerId: owner.ownerId,
      videoBuffer: buffer,
      fileName,
      mimeType: entry.type || "video/mp4",
    });

    if (!updated) {
      return NextResponse.json({ error: "Dubbing job not found for your account." }, { status: 404 });
    }
    return NextResponse.json({ job: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not attach dubbed video";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

