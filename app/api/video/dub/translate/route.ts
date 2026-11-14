import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { translateDubSegments } from "@/lib/video/dub-translate";
import {
  DUB_SOURCE_LANGUAGES,
  DUB_TARGET_LANGUAGES,
  DUB_TONES,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
} from "@/lib/video/dub-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawSegs = Array.isArray(body.segments) ? body.segments : [];
    if (rawSegs.length === 0 || rawSegs.length > 300) {
      return NextResponse.json(
        { error: "Provide between 1 and 300 timestamped segments to translate." },
        { status: 400 },
      );
    }

    const segments: DubSegment[] = rawSegs
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
      .map((s, idx) => ({
        id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : `seg_${idx + 1}`,
        startSec: typeof s.startSec === "number" && Number.isFinite(s.startSec) ? Math.max(0, s.startSec) : idx * 4,
        endSec: typeof s.endSec === "number" && Number.isFinite(s.endSec) ? Math.max(0.4, s.endSec) : idx * 4 + 3.5,
        sourceText: typeof s.sourceText === "string" ? s.sourceText.trim().slice(0, 600) : "",
        translatedText: typeof s.translatedText === "string" ? s.translatedText.trim().slice(0, 600) : "",
      }))
      .filter((s) => s.sourceText.length > 0);

    if (segments.length === 0) {
      return NextResponse.json({ error: "No dialogue text present to translate." }, { status: 400 });
    }

    const targetCode =
      typeof body.targetLanguage === "string" &&
      DUB_TARGET_LANGUAGES.some((l) => l.code === body.targetLanguage)
        ? (body.targetLanguage as DubTargetLanguageCode)
        : "hi";

    const sourceCode =
      typeof body.sourceLanguage === "string" &&
      DUB_SOURCE_LANGUAGES.some((l) => l.code === body.sourceLanguage)
        ? (body.sourceLanguage as DubLanguageCode)
        : "auto";

    const tone =
      typeof body.tone === "string" && DUB_TONES.some((t) => t.value === body.tone)
        ? (body.tone as DubTone)
        : "natural";

    const result = await translateDubSegments({
      segments,
      sourceLanguage: sourceCode,
      targetLanguage: targetCode,
      tone,
    });

    return NextResponse.json({
      ok: true,
      ownerId: owner.ownerId,
      detectedLanguage: result.detectedLanguage,
      segments: result.segments,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

