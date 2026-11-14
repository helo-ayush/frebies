import { NextRequest, NextResponse } from "next/server";
import { VOICES, type VoiceId } from "@/components/tool/audio/tts/model";
import { getTtsManager } from "@/lib/audio/tts-manager";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getVideoDubManager } from "@/lib/video/dub-manager";
import {
  DUB_SOURCE_LANGUAGES,
  DUB_TARGET_LANGUAGES,
  DUB_TONES,
  MAX_DUB_DURATION_SEC,
  type DubCloneSource,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
  type DubVoiceMode,
  type VadReferenceInfo,
} from "@/lib/video/dub-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

function parseSegmentsArray(rawSegs: unknown[]): DubSegment[] {
  return rawSegs
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
    .map((s, idx) => ({
      id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : `seg_${idx + 1}`,
      startSec:
        typeof s.startSec === "number" && Number.isFinite(s.startSec)
          ? Math.max(0, s.startSec)
          : idx * 4,
      endSec:
        typeof s.endSec === "number" && Number.isFinite(s.endSec)
          ? Math.max(0.35, s.endSec)
          : idx * 4 + 3.5,
      sourceText: typeof s.sourceText === "string" ? s.sourceText.trim().slice(0, 1000) : "",
      translatedText:
        typeof s.translatedText === "string" ? s.translatedText.trim().slice(0, 1200) : "",
      speaker: typeof s.speaker === "number" ? s.speaker : undefined,
    }))
    .filter((s) => s.sourceText.length > 0 || s.translatedText.length > 0);
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};
    let sourceAudioBuffer: Buffer | null = null;
    let sourceAudioMimeType = "audio/wav";
    let sourceAudioExt = "wav";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const metaRaw = form.get("payload");
      if (typeof metaRaw === "string" && metaRaw.trim()) {
        body = JSON.parse(metaRaw) as Record<string, unknown>;
      }
      const audioBlob = form.get("sourceAudio");
      if (audioBlob instanceof Blob && audioBlob.size > 0) {
        if (audioBlob.size > 160 * 1024 * 1024) {
          return NextResponse.json({ error: "Extracted audio exceeds 160 MB limit." }, { status: 400 });
        }
        sourceAudioBuffer = Buffer.from(await audioBlob.arrayBuffer());
        sourceAudioMimeType = audioBlob.type || "audio/wav";
        if (audioBlob instanceof File && audioBlob.name.includes(".")) {
          sourceAudioExt = audioBlob.name.split(".").pop()?.toLowerCase() || "wav";
        }
      }
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    const rawSegs = Array.isArray(body.segments) ? body.segments : [];
    if (rawSegs.length > 1800) {
      return NextResponse.json(
        { error: "Maximum 1,800 segments per dubbing job." },
        { status: 400 },
      );
    }

    const segments = parseSegmentsArray(rawSegs);
    if (segments.length === 0 && !sourceAudioBuffer) {
      return NextResponse.json(
        { error: "Provide transcribed segments or extracted source audio." },
        { status: 400 },
      );
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
    const cloneSource: DubCloneSource =
      body.cloneSource === "custom_upload" || body.cloneSource === "saved_voice"
        ? body.cloneSource
        : "auto_vad";

    const allowedVoices = VOICES.map((v) => v.id);
    const voiceId: VoiceId =
      typeof body.voiceId === "string" && allowedVoices.includes(body.voiceId)
        ? body.voiceId
        : "aria";

    let customVoice = null;
    if (body.customVoice && typeof body.customVoice === "object") {
      const cv = body.customVoice as Record<string, unknown>;
      if (typeof cv.audioBase64 === "string" && cv.audioBase64.length > 0) {
        if (cv.audioBase64.length > 25 * 1024 * 1024) {
          return NextResponse.json(
            { error: "Speaker voice sample is too large (max ~18 MB)." },
            { status: 400 },
          );
        }
        customVoice = {
          name:
            typeof cv.name === "string"
              ? cv.name.trim().slice(0, 60) || "Speaker voice"
              : "Speaker voice",
          audioBase64: cv.audioBase64,
          text: typeof cv.text === "string" ? cv.text.trim().slice(0, 800) : "",
        };
      }
    }

    if (voiceMode === "clone" && !customVoice && !sourceAudioBuffer) {
      return NextResponse.json(
        { error: "A clean speech sample is needed for voice cloning. Choose a preset voice or re-extract audio." },
        { status: 400 },
      );
    }

    const durationSeconds =
      typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
        ? Math.min(MAX_DUB_DURATION_SEC, Math.max(1, body.durationSeconds))
        : segments.length > 0
          ? Math.min(MAX_DUB_DURATION_SEC, Math.max(...segments.map((s) => s.endSec), 5))
          : 30;

    if (
      typeof body.durationSeconds === "number" &&
      body.durationSeconds > MAX_DUB_DURATION_SEC + 5
    ) {
      return NextResponse.json(
        { error: "Maximum supported duration is 2 hours (120 minutes)." },
        { status: 400 },
      );
    }

    const backgroundLevel =
      typeof body.backgroundLevel === "number" && Number.isFinite(body.backgroundLevel)
        ? Math.max(0, Math.min(0.65, body.backgroundLevel))
        : 0.18;

    const vadReferenceInfo =
      body.vadReferenceInfo && typeof body.vadReferenceInfo === "object"
        ? (body.vadReferenceInfo as VadReferenceInfo)
        : null;

    const job = await getVideoDubManager().enqueueJob({
      ownerId: owner.ownerId,
      sourceVideoName:
        typeof body.sourceVideoName === "string" && body.sourceVideoName.trim()
          ? body.sourceVideoName.trim().slice(0, 120)
          : "media.mp4",
      mediaKind: body.mediaKind === "audio" ? "audio" : "video",
      durationSeconds,
      sourceLanguage,
      targetLanguage,
      voiceMode,
      cloneSource,
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
      vadReferenceInfo,
      modelUsed: typeof body.modelUsed === "string" ? body.modelUsed : null,
      sourceAudioBuffer,
      sourceAudioMimeType,
      sourceAudioExt,
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to queue video dubbing job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
