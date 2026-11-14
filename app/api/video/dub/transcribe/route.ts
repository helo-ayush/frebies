import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import {
  prepareAudioForDeepgramAndVad,
  transcribeAudioWithDeepgram,
} from "@/lib/video/dub-deepgram";
import { chunkAndTranslateWordsWithOpenRouter } from "@/lib/video/dub-translate";
import {
  DUB_SOURCE_LANGUAGES,
  DUB_TARGET_LANGUAGES,
  DUB_TONES,
  MAX_DUB_DURATION_SEC,
  type DubLanguageCode,
  type DubTargetLanguageCode,
  type DubTone,
} from "@/lib/video/dub-types";
import { extractVad20sCloneReference } from "@/lib/video/dub-vad";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  try {
    const form = await request.formData();
    const audioField = form.get("audio");
    if (!(audioField instanceof Blob) || audioField.size === 0) {
      return NextResponse.json(
        { error: "Extracted audio payload is required for Deepgram transcription." },
        { status: 400 },
      );
    }

    if (audioField.size > 160 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Uploaded audio exceeds 160 MB limit." },
        { status: 400 },
      );
    }

    const rawSourceLang = form.get("sourceLanguage");
    const sourceLanguage: DubLanguageCode =
      typeof rawSourceLang === "string" &&
      DUB_SOURCE_LANGUAGES.some((l) => l.code === rawSourceLang)
        ? (rawSourceLang as DubLanguageCode)
        : "auto";

    const rawTargetLang = form.get("targetLanguage");
    const targetLanguage: DubTargetLanguageCode =
      typeof rawTargetLang === "string" &&
      DUB_TARGET_LANGUAGES.some((l) => l.code === rawTargetLang)
        ? (rawTargetLang as DubTargetLanguageCode)
        : "hi";

    const rawTone = form.get("tone");
    const tone: DubTone =
      typeof rawTone === "string" && DUB_TONES.some((t) => t.value === rawTone)
        ? (rawTone as DubTone)
        : "natural";

    const autoTranslate = form.get("autoTranslate") !== "false";
    const rawTripOffset = form.get("tripOffsetSec");
    const tripOffsetSec =
      typeof rawTripOffset === "string" && Number.isFinite(Number(rawTripOffset))
        ? Math.max(0, Number(rawTripOffset))
        : 0;
    const skipVad = form.get("skipVad") === "true";
    const fileNameField = audioField instanceof File ? audioField.name : "extracted.wav";
    const extHint = fileNameField.split(".").pop()?.toLowerCase();

    const rawBuffer = Buffer.from(await audioField.arrayBuffer());
    const prepared = await prepareAudioForDeepgramAndVad(
      rawBuffer,
      audioField.type || "audio/wav",
      extHint,
    );

    if (prepared.durationSeconds + tripOffsetSec > MAX_DUB_DURATION_SEC + 15) {
      return NextResponse.json(
        { error: "Media duration exceeds the maximum 2-hour (120 minute) limit." },
        { status: 400 },
      );
    }

    const dg = await transcribeAudioWithDeepgram({
      audioBuffer: prepared.deepgramPayload,
      mimeType: prepared.deepgramMimeType,
      sourceLanguage,
      durationSeconds: prepared.durationSeconds,
    });

    const durationSeconds = Math.max(
      prepared.durationSeconds || 0,
      dg.durationSeconds || 0,
    );
    if (durationSeconds + tripOffsetSec > MAX_DUB_DURATION_SEC + 15) {
      return NextResponse.json(
        { error: "Media duration exceeds the maximum 2-hour (120 minute) limit." },
        { status: 400 },
      );
    }

    const vadRef = skipVad
      ? null
      : extractVad20sCloneReference({
          wavBuffer: prepared.wav24kBuffer,
          words: dg.words,
          targetDurationSec: 20,
        });
    if (vadRef && tripOffsetSec > 0) {
      vadRef.info.startSec = Number((vadRef.info.startSec + tripOffsetSec).toFixed(2));
      vadRef.info.endSec = Number((vadRef.info.endSec + tripOffsetSec).toFixed(2));
    }

    const alignedWords =
      tripOffsetSec > 0
        ? dg.words.map((w) => ({
            ...w,
            start: Number((w.start + tripOffsetSec).toFixed(3)),
            end: Number((w.end + tripOffsetSec).toFixed(3)),
          }))
        : dg.words;

    const chunked =
      alignedWords.length > 0
        ? await chunkAndTranslateWordsWithOpenRouter({
            words: alignedWords,
            sourceLanguage: dg.detectedLanguage || sourceLanguage,
            targetLanguage,
            tone,
            autoTranslate,
          })
        : {
            detectedLanguage: dg.detectedLanguage,
            segments: [],
            modelUsed: dg.modelUsed,
          };

    return NextResponse.json({
      ok: true,
      ownerId: owner.ownerId,
      detectedLanguage: chunked.detectedLanguage || dg.detectedLanguage,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      wordsCount: dg.words.length,
      deepgramModel: dg.modelUsed,
      llmModel: chunked.modelUsed,
      segments: chunked.segments,
      speakerRef: vadRef
        ? {
            audioBase64: vadRef.audioBase64,
            text: vadRef.info.text,
            startSec: vadRef.info.startSec,
            endSec: vadRef.info.endSec,
            durationSec: vadRef.info.durationSec,
            speaker: vadRef.info.speaker,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deepgram transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
