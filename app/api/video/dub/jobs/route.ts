import { NextRequest, NextResponse } from "next/server";
import { VOICES, type VoiceId } from "@/components/tool/audio/tts/model";
import { getTtsManager } from "@/lib/audio/tts-manager";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getVideoDubManager } from "@/lib/video/dub-manager";
import {
  DUB_SOURCE_LANGUAGES,
  DUB_TARGET_LANGUAGES,
  DUB_TONES,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
  type DubVoiceMode,
} from "@/lib/video/dub-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  const ttsManager = getTtsManager();
  const dubManager = getVideoDubManager();

  const [jobs, pool, storage] = await Promise.all([
    dubManager.listJobsAsync(owner.ownerId),
    ttsManager.getPoolStatus({ wakeIfDown: false }),
    ttsManager.getStorageStats(owner.ownerId),
  ]);

  return NextResponse.json({ jobs, pool, storage });
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawSegs = Array.isArray(body.segments) ? body.segments : [];
    if (rawSegs.length === 0 || rawSegs.length > 250) {
      return NextResponse.json(
        { error: "Provide between 1 and 250 dialogue segments to dub." },
        { status: 400 },
      );
    }

    const segments: DubSegment[] = rawSegs
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
      .map((s, idx) => ({
        id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : `seg_${idx + 1}`,
        startSec:
          typeof s.startSec === "number" && Number.isFinite(s.startSec)
            ? Math.max(0, s.startSec)
            : idx * 4,
        endSec:
          typeof s.endSec === "number" && Number.isFinite(s.endSec)
            ? Math.max(0.4, s.endSec)
            : idx * 4 + 3.5,
        sourceText: typeof s.sourceText === "string" ? s.sourceText.trim().slice(0, 600) : "",
        translatedText:
          typeof s.translatedText === "string" ? s.translatedText.trim().slice(0, 600) : "",
      }))
      .filter((s) => s.sourceText.length > 0 || s.translatedText.length > 0);

    if (segments.length === 0) {
      return NextResponse.json({ error: "No dialogue lines provided." }, { status: 400 });
    }

    const sourceLanguage =
      typeof body.sourceLanguage === "string" &&
      DUB_SOURCE_LANGUAGES.some((l) => l.code === body.sourceLanguage)
        ? (body.sourceLanguage as DubLanguageCode)
        : "auto";

    const targetLanguage =
      typeof body.targetLanguage === "string" &&
      DUB_TARGET_LANGUAGES.some((l) => l.code === body.targetLanguage)
        ? (body.targetLanguage as DubTargetLanguageCode)
        : "hi";

    const tone =
      typeof body.tone === "string" && DUB_TONES.some((t) => t.value === body.tone)
        ? (body.tone as DubTone)
        : "natural";

    const voiceMode: DubVoiceMode = body.voiceMode === "preset" ? "preset" : "clone";
    const allowedVoices = VOICES.map((v) => v.id);
    const voiceId: VoiceId =
      typeof body.voiceId === "string" && allowedVoices.includes(body.voiceId)
        ? body.voiceId
        : "aria";

    let customVoice = null;
    if (body.customVoice && typeof body.customVoice === "object") {
      const cv = body.customVoice as Record<string, unknown>;
      if (typeof cv.audioBase64 === "string" && cv.audioBase64.length > 0) {
        if (cv.audioBase64.length > 18 * 1024 * 1024) {
          return NextResponse.json(
            { error: "Speaker voice sample is too large (max ~13 MB)." },
            { status: 400 },
          );
        }
        customVoice = {
          name: typeof cv.name === "string" ? cv.name.trim().slice(0, 48) || "Speaker sample" : "Speaker sample",
          audioBase64: cv.audioBase64,
          text: typeof cv.text === "string" ? cv.text.trim().slice(0, 400) : "",
        };
      }
    }

    if (voiceMode === "clone" && !customVoice) {
      return NextResponse.json(
        { error: "A clean speech sample is needed for voice cloning. Choose a preset voice or re-extract audio." },
        { status: 400 },
      );
    }

    const durationSeconds =
      typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
        ? Math.min(900, Math.max(1, body.durationSeconds))
        : Math.max(...segments.map((s) => s.endSec), 5);

    const backgroundLevel =
      typeof body.backgroundLevel === "number" && Number.isFinite(body.backgroundLevel)
        ? Math.max(0, Math.min(0.65, body.backgroundLevel))
        : 0.18;

    const job = await getVideoDubManager().enqueueJob({
      ownerId: owner.ownerId,
      sourceVideoName:
        typeof body.sourceVideoName === "string" && body.sourceVideoName.trim()
          ? body.sourceVideoName.trim().slice(0, 120)
          : "video.mp4",
      durationSeconds,
      sourceLanguage,
      targetLanguage,
      voiceMode,
      voiceId,
      customVoice,
      tone,
      keepBackground: body.keepBackground !== false,
      backgroundLevel,
      syncToTimeline: body.syncToTimeline !== false,
      preferredStudio:
        typeof body.preferredStudio === "string" && body.preferredStudio.trim()
          ? body.preferredStudio.trim()
          : "auto",
      segments,
      skipTranslation: body.skipTranslation === true,
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to queue video dubbing job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

