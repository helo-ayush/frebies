import { buildFallbackSegmentsFromWords } from "./dub-deepgram";
import {
  DUB_TARGET_LANGUAGES,
  getDubLanguageLabel,
  type DeepgramWord,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
} from "./dub-types";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELSCOPE_CHAT_URL = "https://api-inference.modelscope.ai/v1/chat/completions";
const SEGMENT_BATCH_SIZE = 20;
const WORD_MACRO_BATCH_TARGET = 200;

export type TranslateDubInput = {
  segments: DubSegment[];
  sourceLanguage: DubLanguageCode | string;
  targetLanguage: DubTargetLanguageCode;
  tone: DubTone;
};

export type ChunkAndTranslateInput = {
  words: DeepgramWord[];
  sourceLanguage: DubLanguageCode | string;
  targetLanguage: DubTargetLanguageCode;
  tone: DubTone;
  autoTranslate?: boolean;
};

export type TranslateDubResult = {
  detectedLanguage: string;
  segments: DubSegment[];
  modelUsed: string;
};

function getOpenRouterKey(): string {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

function getModelScopeToken(): string {
  return (process.env.MODELSCOPE_API_TOKEN || process.env.MODELSCOPE_API_KEY || "").trim();
}

function getOpenRouterModels(): string[] {
  const configured = (process.env.OPENROUTER_DUB_MODEL || "").trim();
  const defaults = [
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    "openai/gpt-4o-mini",
    "qwen/qwen-2.5-72b-instruct",
  ];
  return Array.from(new Set([configured, ...defaults].filter(Boolean)));
}

function targetCharsPerSecond(code: DubTargetLanguageCode): number {
  return DUB_TARGET_LANGUAGES.find((l) => l.code === code)?.charsPerSec ?? 14;
}

function toneInstruction(tone: DubTone): string {
  switch (tone) {
    case "conversational":
      return "Tone is warm, spontaneous everyday spoken speech. Favor subtle natural tags like [conversational], [laughs], or [sighs] only where the context genuinely fits.";
    case "narration":
      return "Tone is calm, clear documentary narration. Favor [calm] and occasional <emphasis> on key facts; avoid goofy tags.";
    case "cheerful":
      return "Tone is lively, energetic creator storytelling. Use [excited], [cheerful], [laughs], or <emphasis> naturally at upbeat moments.";
    default:
      return "Preserve the speaker's natural delivery and emotion using Drama 3 tags ([calm], [excited], [whispers], [sighs], [laughs], <emphasis>) only when genuine emotion or pacing shifts occur.";
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
    throw new Error("LLM did not return structured JSON output.");
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

async function postChatCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  maxTokens?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75_000);

  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        ...params.extraHeaders,
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.25,
        max_tokens: params.maxTokens ?? 2400,
        ...params.extraBody,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${params.model} returned HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error(`${params.model} returned empty output.`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function callDubLlmWithCascade(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; modelUsed: string }> {
  const orKey = getOpenRouterKey();
  const errors: string[] = [];

  if (orKey) {
    const models = getOpenRouterModels();
    outer: for (const model of models) {
      const tokenBudgets = [2400, 1200];
      for (let i = 0; i < tokenBudgets.length; i += 1) {
        try {
          const content = await postChatCompletion({
            url: OPENROUTER_CHAT_URL,
            apiKey: orKey,
            model,
            systemPrompt,
            userPrompt,
            maxTokens: tokenBudgets[i],
            extraHeaders: {
              "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://frebies.app",
              "X-Title": "frebies AI Dubbing Studio",
            },
            extraBody: model.startsWith("openai/") || model.startsWith("google/")
              ? { response_format: { type: "json_object" } }
              : undefined,
          });
          return { content, modelUsed: model };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`openrouter/${model}: ${msg}`);
          if (/\b401\b/.test(msg)) break outer;
          if (!/\b402\b/.test(msg)) break;
        }
      }
    }
  }

  const msKey = getModelScopeToken();
  if (msKey) {
    for (const model of ["Qwen/Qwen3.5-35B-A3B", "Qwen/Qwen3.8-27B"]) {
      try {
        const content = await postChatCompletion({
          url: MODELSCOPE_CHAT_URL,
          apiKey: msKey,
          model,
          systemPrompt,
          userPrompt,
          extraBody: { enable_thinking: false },
          maxTokens: 4096,
        });
        return { content, modelUsed: model };
      } catch (err) {
        errors.push(`modelscope/${model}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  throw new Error(
    errors[0] || "Neither OPENROUTER_API_KEY nor MODELSCOPE_API_TOKEN is configured for dubbing translation.",
  );
}

/**
 * Partition long word-timestamp streams at natural pause boundaries so up to 2 hours of
 * speech can be semantically chunked and translated in parallel without context overflow.
 */
function splitWordsIntoMacroBatches(words: DeepgramWord[]): DeepgramWord[][] {
  if (words.length <= WORD_MACRO_BATCH_TARGET) {
    return words.length > 0 ? [words] : [];
  }

  const batches: DeepgramWord[][] = [];
  let start = 0;

  while (start < words.length) {
    const hardEnd = Math.min(words.length, start + WORD_MACRO_BATCH_TARGET + 60);
    if (hardEnd >= words.length) {
      batches.push(words.slice(start));
      break;
    }

    // Look for the cleanest sentence end + pause gap near WORD_MACRO_BATCH_TARGET
    let splitAt = Math.min(words.length, start + WORD_MACRO_BATCH_TARGET);
    let bestScore = -1;
    const scanFrom = Math.max(start + 140, start + WORD_MACRO_BATCH_TARGET - 80);

    for (let i = scanFrom; i < hardEnd - 1; i += 1) {
      const gap = Math.max(0, words[i + 1].start - words[i].end);
      const endsSent = /[.!?।。！？]$/.test(words[i].punctuatedWord) ? 1 : 0;
      const score = gap * 4 + endsSent * 1.5;
      if (score > bestScore) {
        bestScore = score;
        splitAt = i + 1;
      }
    }

    batches.push(words.slice(start, splitAt));
    start = splitAt;
  }

  return batches;
}

const DRAMA3_TAG_PROMPT = [
  "Fish Audio Drama 3 expression tags you may weave naturally into translatedText:",
  "- Emotion / delivery tags at phrase starts: [excited], [whispers], [sighs], [laughs], [calm], [cheerful], [conversational]",
  "- Inline pacing / stress tags around key words: <emphasis>...</emphasis>, <slow>...</slow>, <fast>...</fast>",
  "- Rules: Use tags tastefully ONLY when the spoken context, punctuation, or emotion justifies them. Do NOT overuse tags on neutral declarative sentences, and NEVER invent ungrounded sound effects or translator notes.",
].join("\n");

async function chunkAndTranslateWordBatch(
  batchWords: DeepgramWord[],
  batchIndex: number,
  input: ChunkAndTranslateInput,
  contextTail: string,
): Promise<{ detectedLanguage: string; segments: DubSegment[]; modelUsed: string }> {
  const sourceLabel =
    input.sourceLanguage === "auto" ? "auto-detected source language" : getDubLanguageLabel(input.sourceLanguage);
  const targetLabel = getDubLanguageLabel(input.targetLanguage);
  const cps = targetCharsPerSecond(input.targetLanguage);
  const autoTranslate = input.autoTranslate !== false;

  const systemPrompt = [
    "You are an expert AI video dubbing script director and semantic segmenter.",
    "You receive word-by-word ASR timestamps (`w`: word, `s`: start seconds, `e`: end seconds, `spk`: speaker id).",
    "Task 1 — Semantic & Pause-Based Chunking:",
    "- Group consecutive words into clean, natural dubbing sentence/phrase segments using timestamp gaps (pauses >= 0.25s), speaker switches, punctuation, and semantic completeness.",
    "- Ideal chunk length is roughly 2.0s to 8.5s (1–2 natural spoken clauses). Never split in the middle of an idiom or verb phrase unless there is a very long pause.",
    "- Every word in the input must belong cleanly to exactly one chunk in strict chronological order, using `s` of the chunk's first word for `startSec` and `e` of the chunk's last word for `endSec`.",
    autoTranslate
      ? [
          `Task 2 — Spoken Dubbing Translation (${sourceLabel} -> ${targetLabel}) + Drama 3 Expression Tags:`,
          `- Translate each chunk into fluent, natural spoken ${targetLabel} sized carefully to fit its speaking window (~${cps} chars/sec * durationSec).`,
          `- ${toneInstruction(input.tone)}`,
          DRAMA3_TAG_PROMPT,
        ].join("\n")
      : `Clean up punctuation for sourceText and leave translatedText as empty string "".`,
    'Respond ONLY with valid JSON matching: {"detectedLanguage":"<language name>","segments":[{"startSec":0.12,"endSec":4.35,"speaker":0,"sourceText":"...","translatedText":"..."}]}',
  ].join("\n");

  const payload = {
    previousContext: contextTail || undefined,
    targetLanguage: targetLabel,
    targetCharsPerSec: cps,
    words: batchWords.map((w) => ({
      w: w.punctuatedWord,
      s: Number(w.start.toFixed(2)),
      e: Number(w.end.toFixed(2)),
      spk: w.speaker ?? 0,
    })),
  };

  try {
    const { content, modelUsed } = await callDubLlmWithCascade(systemPrompt, JSON.stringify(payload));
    const parsed = extractJsonObject(content);
    const detectedLanguage =
      typeof parsed.detectedLanguage === "string" && parsed.detectedLanguage.trim()
        ? parsed.detectedLanguage.trim()
        : getDubLanguageLabel(input.sourceLanguage);

    const rawSegs = Array.isArray(parsed.segments) ? parsed.segments : [];
    const minStart = batchWords[0]?.start ?? 0;
    const maxEnd = batchWords[batchWords.length - 1]?.end ?? minStart + 1;

    const segments: DubSegment[] = [];
    let lastEnd = 0;

    for (let i = 0; i < rawSegs.length; i += 1) {
      const item = rawSegs[i];
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const sourceText = typeof obj.sourceText === "string" ? obj.sourceText.trim() : "";
      const translatedText = typeof obj.translatedText === "string" ? obj.translatedText.trim() : "";
      if (!sourceText && !translatedText) continue;

      const rawS = typeof obj.startSec === "number" && Number.isFinite(obj.startSec) ? obj.startSec : minStart;
      const rawE = typeof obj.endSec === "number" && Number.isFinite(obj.endSec) ? obj.endSec : rawS + 2;
      const clampedS = Math.max(lastEnd, Math.max(0, rawS));
      const clampedE = Math.min(maxEnd + 0.5, Math.max(clampedS + 0.35, rawE));
      lastEnd = clampedS;

      segments.push({
        id: `seg_${batchIndex}_${segments.length + 1}`,
        startSec: Number(clampedS.toFixed(2)),
        endSec: Number(clampedE.toFixed(2)),
        sourceText: sourceText || translatedText,
        translatedText: autoTranslate ? translatedText || sourceText : "",
        speaker: typeof obj.speaker === "number" ? obj.speaker : 0,
      });
    }

    if (segments.length > 0) {
      return { detectedLanguage, segments, modelUsed };
    }
  } catch {
    // Fall back deterministically below so one noisy JSON batch never kills a long video dub
  }

  const fallback = buildFallbackSegmentsFromWords(batchWords);
  if (!autoTranslate) {
    return {
      detectedLanguage: getDubLanguageLabel(input.sourceLanguage),
      segments: fallback,
      modelUsed: "fallback-gap-segmenter",
    };
  }
  const translatedFallback = await translateDubSegments({
    segments: fallback,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    tone: input.tone,
  });
  return translatedFallback;
}

/**
 * Primary OpenRouter pipeline: takes Deepgram word-by-word timestamps and asks OpenRouter
 * to semantically chunk lines at natural pause/meaning boundaries AND batch-translate with
 * Fish Audio Drama 3 expression tags. Handles up to 2 hours via concurrent macro-batches.
 */
export async function chunkAndTranslateWordsWithOpenRouter(
  input: ChunkAndTranslateInput,
): Promise<TranslateDubResult> {
  if (input.words.length === 0) {
    return {
      detectedLanguage: getDubLanguageLabel(input.sourceLanguage),
      segments: [],
      modelUsed: "none",
    };
  }

  const macroBatches = splitWordsIntoMacroBatches(input.words);
  const results: Array<{ detectedLanguage: string; segments: DubSegment[]; modelUsed: string }> =
    new Array(macroBatches.length);

  // Process up to 3 macro-batches in parallel for speed on long videos
  const concurrency = Math.min(3, macroBatches.length);
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= macroBatches.length) return;
      const prevBatch = idx > 0 ? macroBatches[idx - 1] : null;
      const contextTail = prevBatch
        ? prevBatch
            .slice(-18)
            .map((w) => w.punctuatedWord)
            .join(" ")
        : "";
      results[idx] = await chunkAndTranslateWordBatch(macroBatches[idx], idx, input, contextTail);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const mergedSegments: DubSegment[] = [];
  for (const part of results) {
    if (!part) continue;
    for (const seg of part.segments) {
      mergedSegments.push({
        ...seg,
        id: `seg_${mergedSegments.length + 1}`,
      });
    }
  }

  return {
    detectedLanguage: results[0]?.detectedLanguage || getDubLanguageLabel(input.sourceLanguage),
    segments: mergedSegments,
    modelUsed: results[0]?.modelUsed || getOpenRouterModels()[0],
  };
}

async function translateBatch(
  batch: DubSegment[],
  contextBefore: DubSegment[],
  input: TranslateDubInput,
): Promise<{ detectedLanguage: string; translations: Map<string, string>; modelUsed: string }> {
  const sourceLabel =
    input.sourceLanguage === "auto" ? "auto-detected source language" : getDubLanguageLabel(input.sourceLanguage);
  const targetLabel = getDubLanguageLabel(input.targetLanguage);
  const cps = targetCharsPerSecond(input.targetLanguage);

  const systemPrompt = [
    "You are an expert audiovisual dubbing localization specialist for Fish Audio Drama 3.",
    `Translate spoken dialogue lines from ${sourceLabel} into natural spoken ${targetLabel}.`,
    toneInstruction(input.tone),
    DRAMA3_TAG_PROMPT,
    "Timing-sync rules:",
    "- Keep each translated line concise so a voice actor can speak it smoothly inside its scene time window (`targetChars`).",
    "- Preserve numbers, proper nouns, and conversational flow.",
    "- Never output translator notes or markdown outside the JSON object.",
    "- If source is already in target language, refine punctuation and add appropriate Drama 3 delivery tags cleanly.",
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

  const { content, modelUsed } = await callDubLlmWithCascade(systemPrompt, JSON.stringify(payload));
  const parsed = extractJsonObject(content);
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
 * Batch-translate existing/imported timestamped video segments via OpenRouter
 * with Drama 3 expression tags and timing-fit constraints.
 */
export async function translateDubSegments(input: TranslateDubInput): Promise<TranslateDubResult> {
  const nonEmpty = input.segments.filter((s) => s.sourceText.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("No dialogue lines available to translate.");
  }

  const out: DubSegment[] = input.segments.map((seg) => ({ ...seg }));
  let detectedLanguage = input.sourceLanguage === "auto" ? "Auto" : getDubLanguageLabel(input.sourceLanguage);
  let modelUsed = getOpenRouterModels()[0];

  for (let start = 0; start < nonEmpty.length; start += SEGMENT_BATCH_SIZE) {
    const batch = nonEmpty.slice(start, start + SEGMENT_BATCH_SIZE);
    const contextBefore =
      start > 0 ? out.filter((s) => batch[0] && s.endSec <= batch[0].startSec + 0.1).slice(-2) : [];
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
