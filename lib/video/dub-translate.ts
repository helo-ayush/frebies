import {
  DUB_TARGET_LANGUAGES,
  getDubLanguageLabel,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
} from "./dub-types";

const MODELSCOPE_CHAT_URL = "https://api-inference.modelscope.ai/v1/chat/completions";
const PRIMARY_TRANSLATE_MODEL = "Qwen/Qwen3.5-35B-A3B";
const FALLBACK_TRANSLATE_MODEL = "Qwen/Qwen3.8-27B";
const BATCH_SIZE = 24;

export type TranslateDubInput = {
  segments: DubSegment[];
  sourceLanguage: DubLanguageCode | string;
  targetLanguage: DubTargetLanguageCode;
  tone: DubTone;
};

export type TranslateDubResult = {
  detectedLanguage: string;
  segments: DubSegment[];
  modelUsed: string;
};

function getToken(): string {
  return (process.env.MODELSCOPE_API_TOKEN || process.env.MODELSCOPE_API_KEY || "").trim();
}

function targetCharsPerSecond(code: DubTargetLanguageCode): number {
  return DUB_TARGET_LANGUAGES.find((l) => l.code === code)?.charsPerSec ?? 14;
}

function toneInstruction(tone: DubTone): string {
  switch (tone) {
    case "conversational":
      return "Use warm, everyday spoken phrasing that sounds like someone talking naturally on camera.";
    case "narration":
      return "Use clear, calm, authoritative documentary narration phrasing.";
    case "cheerful":
      return "Use lively, engaging, upbeat creator-style spoken phrasing.";
    default:
      return "Preserve the speaker's exact intent, emotion, and natural spoken cadence.";
  }
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Translator did not return structured JSON output.");
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

async function callModelScopeChat(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const token = getToken();
  if (!token) {
    throw new Error("MODELSCOPE_API_TOKEN is missing on the server.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch(MODELSCOPE_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        enable_thinking: false,
        temperature: 0.25,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Translation model ${model} returned HTTP ${res.status}: ${detail.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error(`Translation model ${model} returned empty output.`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function translateBatch(
  batch: DubSegment[],
  contextBefore: DubSegment[],
  input: TranslateDubInput,
): Promise<{ detectedLanguage: string; translations: Map<string, string>; modelUsed: string }> {
  const sourceLabel = input.sourceLanguage === "auto" ? "auto-detected source language" : getDubLanguageLabel(input.sourceLanguage);
  const targetLabel = getDubLanguageLabel(input.targetLanguage);
  const cps = targetCharsPerSecond(input.targetLanguage);

  const systemPrompt = [
    "You are an expert audiovisual dubbing localization specialist.",
    `Translate spoken dialogue lines from ${sourceLabel} into natural spoken ${targetLabel}.`,
    toneInstruction(input.tone),
    "Timing-sync rules:",
    "- Keep each translated line concise so a voice actor can speak it smoothly inside its scene time window (targetChars).",
    "- Preserve numbers, names, punctuation for natural pauses, and conversational flow.",
    "- Never leave translator notes, brackets, markdown, or explanations inside translatedText.",
    "- If the source is already in the target language, polish punctuation cleanly without breaking meaning.",
    'Respond ONLY as valid JSON: {"detectedLanguage":"<language name>","segments":[{"id":"...","translatedText":"..."}]}',
  ].join("\n");

  const payload = {
    contextBefore: contextBefore.map((seg) => ({
      sourceText: seg.sourceText,
      translatedText: seg.translatedText || undefined,
    })),
    targetLanguage: targetLabel,
    segments: batch.map((seg) => {
      const durationSec = Math.max(0.6, Number((seg.endSec - seg.startSec).toFixed(2)));
      return {
        id: seg.id,
        durationSec,
        targetChars: Math.max(12, Math.round(durationSec * cps)),
        text: seg.sourceText.trim(),
      };
    }),
  };

  let rawResponse: string;
  let modelUsed = PRIMARY_TRANSLATE_MODEL;
  try {
    rawResponse = await callModelScopeChat(PRIMARY_TRANSLATE_MODEL, systemPrompt, JSON.stringify(payload));
  } catch (primaryErr) {
    modelUsed = FALLBACK_TRANSLATE_MODEL;
    try {
      rawResponse = await callModelScopeChat(FALLBACK_TRANSLATE_MODEL, systemPrompt, JSON.stringify(payload));
    } catch {
      throw primaryErr;
    }
  }

  const parsed = extractJsonObject(rawResponse);
  const detectedLanguage =
    typeof parsed.detectedLanguage === "string" && parsed.detectedLanguage.trim()
      ? parsed.detectedLanguage.trim()
      : input.sourceLanguage === "auto"
        ? "English"
        : getDubLanguageLabel(input.sourceLanguage);

  const translations = new Map<string, string>();
  const outSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
  for (const item of outSegments) {
    if (!item || typeof item !== "object") continue;
    const obj = item as { id?: unknown; translatedText?: unknown };
    if (typeof obj.id === "string" && typeof obj.translatedText === "string") {
      translations.set(obj.id, obj.translatedText.trim());
    }
  }

  return { detectedLanguage, translations, modelUsed };
}

/**
 * Translate timestamped video segments into the target dubbing language while
 * keeping timing length and cross-segment context coherent.
 */
export async function translateDubSegments(input: TranslateDubInput): Promise<TranslateDubResult> {
  const nonEmpty = input.segments.filter((s) => s.sourceText.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("No dialogue lines available to translate.");
  }

  const out: DubSegment[] = input.segments.map((seg) => ({ ...seg }));
  let detectedLanguage = input.sourceLanguage === "auto" ? "Auto" : getDubLanguageLabel(input.sourceLanguage);
  let modelUsed = PRIMARY_TRANSLATE_MODEL;

  for (let start = 0; start < nonEmpty.length; start += BATCH_SIZE) {
    const batch = nonEmpty.slice(start, start + BATCH_SIZE);
    const contextBefore = start > 0 ? out.filter((s) => batch[0] && s.endSec <= batch[0].startSec + 0.1).slice(-2) : [];
    const res = await translateBatch(batch, contextBefore, input);
    if (start === 0) {
      detectedLanguage = res.detectedLanguage;
      modelUsed = res.modelUsed;
    }

    for (const targetSeg of out) {
      const translated = res.translations.get(targetSeg.id);
      if (translated) {
        targetSeg.translatedText = translated;
      }
    }
  }

  // Fallback safeguard if model skipped any segment ID
  for (const seg of out) {
    if (!seg.translatedText.trim()) {
      seg.translatedText = seg.sourceText.trim();
    }
  }

  return {
    detectedLanguage,
    segments: out,
    modelUsed,
  };
}

