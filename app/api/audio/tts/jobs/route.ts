import { after, NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_TTS_SETTINGS,
  TTS_BITRATES,
  TTS_LANGUAGES,
  TTS_MAX_CHARS,
  TTS_STYLES,
  VOICES,
  type TtsFormat,
  type TtsLanguage,
  type TtsStyle,
  type VoiceId,
} from "@/components/tool/audio/tts/model";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getTtsManager, type TtsJobInput } from "@/lib/audio/tts-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function pickValid<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  return typeof val === "string" && allowed.includes(val as T) ? (val as T) : fallback;
}

export async function GET(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  const manager = getTtsManager();
  return NextResponse.json({
    jobs: await manager.listJobsAsync(owner.ownerId),
    pool: await manager.getPoolStatus({ wakeIfDown: false }),
    storage: await manager.getStorageStats(owner.ownerId),
  });
}

export async function POST(request: NextRequest) {
  try {
    const owner = await requireAuthenticatedOwner(request);
    if (!owner) return authRequiredResponse();
    const body = (await request.json()) as Record<string, unknown>;
    const rawText = typeof body.text === "string" ? body.text.trim() : "";

    if (!rawText) {
      return NextResponse.json({ error: "Please enter a script to synthesize." }, { status: 400 });
    }
    if (rawText.length > TTS_MAX_CHARS) {
      return NextResponse.json(
        { error: `Script exceeds ${TTS_MAX_CHARS.toLocaleString()} character limit.` },
        { status: 400 },
      );
    }

    const voice = pickValid(
      body.voice,
      VOICES.map((v) => v.id) as VoiceId[],
      DEFAULT_TTS_SETTINGS.voice,
    );
    const language = pickValid(
      body.language,
      TTS_LANGUAGES.map((l) => l.value) as TtsLanguage[],
      DEFAULT_TTS_SETTINGS.language,
    );
    const style = pickValid(
      body.style,
      TTS_STYLES.map((s) => s.value) as TtsStyle[],
      DEFAULT_TTS_SETTINGS.style,
    );
    const format = pickValid(body.format, ["mp3", "wav"] as TtsFormat[], DEFAULT_TTS_SETTINGS.format);

    const speedNum = typeof body.speed === "number" ? body.speed : DEFAULT_TTS_SETTINGS.speed;
    const pitchNum = typeof body.pitch === "number" ? body.pitch : DEFAULT_TTS_SETTINGS.pitch;
    const bitrateNum =
      typeof body.bitrate === "number" && TTS_BITRATES.includes(body.bitrate)
        ? body.bitrate
        : DEFAULT_TTS_SETTINGS.bitrate;
    const temperatureNum =
      typeof body.temperature === "number" && Number.isFinite(body.temperature)
        ? Math.min(1.2, Math.max(0.2, body.temperature))
        : DEFAULT_TTS_SETTINGS.temperature;
    const topPNum =
      typeof body.topP === "number" && Number.isFinite(body.topP)
        ? Math.min(1.0, Math.max(0.3, body.topP))
        : DEFAULT_TTS_SETTINGS.topP;
    const preferredStudio =
      typeof body.preferredStudio === "string" && body.preferredStudio.trim()
        ? body.preferredStudio.trim()
        : DEFAULT_TTS_SETTINGS.preferredStudio;

    let customVoice: TtsJobInput["customVoice"] = null;
    if (body.customVoice && typeof body.customVoice === "object") {
      const cv = body.customVoice as Record<string, unknown>;
      if (typeof cv.audioBase64 === "string" && cv.audioBase64.length > 0) {
        if (cv.audioBase64.length > 20 * 1024 * 1024) {
          return NextResponse.json({ error: "Reference voice clip is too large (max ~14 MB)." }, { status: 400 });
        }
        customVoice = {
          name: typeof cv.name === "string" && cv.name.trim() ? cv.name.trim().slice(0, 48) : "Custom voice",
          audioBase64: cv.audioBase64,
          text: typeof cv.text === "string" ? cv.text.trim().slice(0, 500) : undefined,
        };
      }
    }

    const manager = getTtsManager();
    const job = await manager.enqueueJob({
      text: rawText,
      voice,
      language,
      style,
      speed: Math.min(1.5, Math.max(0.75, speedNum)),
      pitch: Math.min(1.5, Math.max(0.75, pitchNum)),
      format,
      bitrate: bitrateNum,
      metadata: typeof body.metadata === "boolean" ? body.metadata : DEFAULT_TTS_SETTINGS.metadata,
      paragraphPauses:
        typeof body.paragraphPauses === "boolean" ? body.paragraphPauses : DEFAULT_TTS_SETTINGS.paragraphPauses,
      emphasizeNumbers:
        typeof body.emphasizeNumbers === "boolean" ? body.emphasizeNumbers : DEFAULT_TTS_SETTINGS.emphasizeNumbers,
      temperature: temperatureNum,
      topP: topPNum,
      preferredStudio,
      ownerId: owner.ownerId,
      customVoice,
    });

    after(() => manager.waitForJob(job.id));

    const pool = manager.getCachedPoolSnapshot();
    const storage = manager.getCachedStorageStats(owner.ownerId);
    return NextResponse.json({ job, pool, storage }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to queue voice generation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

