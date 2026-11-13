import { NextRequest, NextResponse } from "next/server";
import { VOICES } from "@/components/tool/audio/tts/model";
import { getVoiceSampleAudio } from "@/lib/audio/voice-presets";
import { getR2Config, r2CreateSignedDownloadUrl } from "@/lib/storage/r2-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const voice = VOICES.find((entry) => entry.id === id);
  if (!voice) {
    return NextResponse.json({ error: "Voice preset not found." }, { status: 404 });
  }

  if (request.nextUrl.searchParams.get("signed") === "1" && getR2Config().configured) {
    const signedUrl = await r2CreateSignedDownloadUrl(`voices/samples/${voice.id}.mp3`, {
      expiresInSeconds: 3600,
      fileName: `${voice.id}-sample.mp3`,
      download: false,
    }).catch(() => null);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, 302);
    }
  }

  const sample = await getVoiceSampleAudio(voice.id);
  if (!sample) {
    return NextResponse.json({ error: "Voice sample audio not available." }, { status: 404 });
  }

  const totalLength = sample.buffer.length;
  const rangeHeader = request.headers.get("range");

  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(totalLength - 1, Number.parseInt(match[2], 10)) : totalLength - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start <= end && end < totalLength) {
        const slice = sample.buffer.subarray(start, end + 1);
        return new NextResponse(new Uint8Array(slice), {
          status: 206,
          headers: {
            "Content-Type": sample.mimeType,
            "Content-Length": String(slice.length),
            "Content-Range": `bytes ${start}-${end}/${totalLength}`,
            "Accept-Ranges": "bytes",
            "Content-Disposition": `inline; filename="${sample.fileName}"`,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        });
      }
    }
  }

  return new NextResponse(new Uint8Array(sample.buffer), {
    status: 200,
    headers: {
      "Content-Type": sample.mimeType,
      "Content-Length": String(totalLength),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${sample.fileName}"`,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

