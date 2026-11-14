import { buildFallbackSegmentsFromWords } from "./dub-deepgram";
import {
  DUB_TARGET_LANGUAGES,
  DUB_TRIP_DURATION_SEC,
  computeDubTripWindows,
  getDubLanguageLabel,
  type DeepgramWord,
  type DubLanguageCode,
  type DubSegment,
  type DubTargetLanguageCode,
  type DubTone,
} from "./dub-types";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELSCOPE_CHAT_URL = "https://api-inference.modelscope.ai/v1/chat/completions";
const SEGMENT_BATCH_SIZE = 90;
const TRIP_LLM_MAX_WORDS = 1400;

export type TranslateDubInput = {
  segments: DubSegment[];
  sourceLanguage: DubLanguageCode | string;
  targetLanguage: DubTargetLanguageCode;
  tone: DubTone;
  onTripProgress?: (tripIndex: number, totalTrips: number, label: string) => void;
};

export type ChunkAndTranslateInput = {
  words: DeepgramWord[];
  sourceLanguage: DubLanguageCode | string;
  targetLanguage: DubTargetLanguageCode;
  tone: DubTone;
  autoTranslate?: boolean;
  onTripProgress?: (tripIndex: number, totalTrips: number, label: string) => void;
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
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    "openai/gpt-4o-mini",
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
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
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
  const timer = setTimeout(() => controller.abort(), 110_000);

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
        max_tokens: params.maxTokens ?? 16384,
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

function buildExtraBodyForModel(model: string): Record<string, unknown> | undefined {
  if (model.startsWith("nvidia/nemotron")) {
    return { reasoning: { effort: "low" } };
  }
  if (model.startsWith("openai/") || model.startsWith("google/")) {
    return { response_format: { type: "json_object" } };
  }
  return undefined;
}

async function callDubLlmWithCascade(
  systemPrompt: string,
  userPrompt: string,
  preferredMaxTokens = 16384,
): Promise<{ content: string; modelUsed: string }> {
  const orKey = getOpenRouterKey();
  const errors: string[] = [];

  if (orKey) {
    const models = getOpenRouterModels();
    outer: for (const model of models) {
      const tokenBudgets = model.endsWith(":free")
        ? [preferredMaxTokens, 8192]
        : [Math.min(preferredMaxTokens, 8192), 4096, 2400];

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
            extraBody: buildExtraBodyForModel(model),
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
 * Find the cleanest sentence-end + pause-gap word boundary near a target index or timestamp.
 */
function findBestWordSplitIndex(words: DeepgramWord[], minIdx: number, maxIdx: number): number {
  const safeMin = Math.max(1, minIdx);
  const safeMax = Math.min(words.length - 1, maxIdx);
  if (safeMax <= safeMin) return safeMin;

  let splitAt = Math.floor((safeMin + safeMax) / 2);
  let bestScore = -1;

  for (let i = safeMin; i <= safeMax; i += 1) {
    const gap = Math.max(0, words[i].start - words[i - 1].end);
    const endsSent = /[.!?।。！？]$/.test(words[i - 1].punctuatedWord) ? 1 : 0;
    const spkSwitch =
      typeof words[i].speaker === "number" &&
      typeof words[i - 1].speaker === "number" &&
      words[i].speaker !== words[i - 1].speaker
        ? 1.2
        : 0;
    const score = gap * 4 + endsSent * 1.5 + spkSwitch;
    if (score > bestScore) {
      bestScore = score;
      splitAt = i;
    }
  }
  return splitAt;
}

/**
 * Partition word-timestamp streams into 30-minute chronological trips (e.g., 2 hours = 4 trips),
 * snapping each cut to the cleanest sentence/pause boundary within +-45s of the 30m mark.
 */
function splitWordsIntoTimeTrips(
  words: DeepgramWord[],
  tripDurationSec = DUB_TRIP_DURATION_SEC,
): Array<{ tripIndex: number; label: string; words: DeepgramWord[] }> {
  if (words.length === 0) return [];
  const lastEnd = words[words.length - 1].end;
  const firstStart = words[0].start;
  const spanSec = lastEnd - firstStart;

  if (spanSec <= tripDurationSec + 30) {
    const startMin = Math.floor(firstStart / 60);
    const endMin = Math.max(startMin + 1, Math.ceil(lastEnd / 60));
    return [{ tripIndex: 0, label: `Trip 1/1 (${startMin}m–${endMin}m)`, words }];
  }

  const baseWindows = computeDubTripWindows(lastEnd, tripDurationSec);
  const trips: Array<{ tripIndex: number; label: string; words: DeepgramWord[] }> = [];
  let cursor = 0;

  for (let t = 0; t < baseWindows.length && cursor < words.length; t += 1) {
    const win = baseWindows[t];
    if (t === baseWindows.length - 1) {
      trips.push({ tripIndex: trips.length, label: win.label, words: words.slice(cursor) });
      break;
    }

    const boundarySec = win.endSec;
    let lo = cursor + 1;
    let hi = words.length - 1;
    while (lo < words.length && words[lo].start < boundarySec - 45) lo += 1;
    while (hi > lo && words[hi].end > boundarySec + 45) hi -= 1;

    let cutIdx = lo;
    if (hi > lo) {
      cutIdx = findBestWordSplitIndex(words, lo, hi);
    } else {
      while (cutIdx < words.length && words[cutIdx].start < boundarySec) cutIdx += 1;
    }

    cutIdx = Math.max(cursor + 1, Math.min(words.length, cutIdx));
    trips.push({
      tripIndex: trips.length,
      label: win.label,
      words: words.slice(cursor, cutIdx),
    });
    cursor = cutIdx;
  }

  if (cursor < words.length && trips.length > 0) {
    trips[trips.length - 1].words.push(...words.slice(cursor));
  }

  return trips.map((tr, idx) => ({
    ...tr,
    tripIndex: idx,
    label: tr.label.replace(/\/\d+/, `/${trips.length}`),
  }));
}

function splitWordSubBatches(words: DeepgramWord[], maxWords = TRIP_LLM_MAX_WORDS): DeepgramWord[][] {
  if (words.length <= maxWords) return words.length > 0 ? [words] : [];
  const batches: DeepgramWord[][] = [];
  let start = 0;
  while (start < words.length) {
    if (words.length - start <= maxWords + 120) {
      batches.push(words.slice(start));
      break;
    }
    const splitAt = findBestWordSplitIndex(
      words,
      start + Math.floor(maxWords * 0.72),
      start + maxWords,
    );
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

async function callChunkAndTranslateWindow(
  batchWords: DeepgramWord[],
  batchTag: string,
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
    "Task 1 — Tight Semantic & Pause-Based Clause Chunking:",
    "- Group consecutive words into natural dubbing sentence/clause segments using timestamp gaps (pauses >= 0.22s), speaker switches, punctuation, and grammatical clause boundaries.",
    "- Ideal chunk duration is roughly 1.8s to 6.2s (1–2 natural spoken clauses). Avoid lumping long multi-sentence thoughts into an 8–9s megachunk where translated English finishes 2s early. Never split in the middle of an idiom or core verb phrase unless there is a clear pause.",
    "- Every word in the input must belong cleanly to exactly one chunk in strict chronological order, using `s` of the chunk's first word for `startSec` and `e` of the chunk's last word for `endSec`.",
    autoTranslate
      ? [
          `Task 2 — Isochronous Spoken Dubbing Translation (${sourceLabel} -> ${targetLabel}) + Drama 3 Expression Tags:`,
          `- Each chunk occupies a speaking window of durationSec = (endSec - startSec), with targetChars = round(durationSec * ${cps}). Write ISOCHRONOUS spoken ${targetLabel} dialogue that fills ~85% to 105% of targetChars (minChars = round(targetChars * 0.85), maxChars = round(targetChars * 1.10)).`,
          `- ANTI-SILENCE RULE: When translating from syllable-dense or longer-spoken languages (e.g., Hindi, Spanish, French, Japanese, Arabic) into compact English, NEVER write overly compressed or terse summary phrases that finish 1–2 seconds early and leave awkward dead air. Instead, match the original spoken cadence by naturally expanding phrasing using idiomatic conversational ${targetLabel}, natural spoken connectors (e.g., "you see,", "right now,", "in fact,", "honestly,"), clear emphatic wording, and natural clause punctuation (\`,\`, \`—\`, \`...\`) so the voice actor speaks smoothly across the full time slot without changing facts or adding off-topic filler.`,
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

  const { content, modelUsed } = await callDubLlmWithCascade(
    systemPrompt,
    JSON.stringify(payload),
    16384,
  );
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
      id: `seg_${batchTag}_${segments.length + 1}`,
      startSec: Number(clampedS.toFixed(2)),
      endSec: Number(clampedE.toFixed(2)),
      sourceText: sourceText || translatedText,
      translatedText: autoTranslate ? translatedText || sourceText : "",
      speaker: typeof obj.speaker === "number" ? obj.speaker : 0,
    });
  }

  if (segments.length === 0) {
    throw new Error("OpenRouter returned zero segments for this window.");
  }

  // Guard against truncated LLM output dropping the tail of a large 30-min trip
  const coveredEnd = segments[segments.length - 1].endSec;
  const totalWindowSpan = Math.max(0.1, maxEnd - minStart);
  const coveredSpan = Math.max(0, coveredEnd - segments[0].startSec);
  if (batchWords.length > 350 && coveredSpan < totalWindowSpan * 0.68) {
    throw new Error("Window output truncated early; bisecting for full coverage.");
  }

  return { detectedLanguage, segments, modelUsed };
}

async function chunkAndTranslateWordWindowWithBisect(
  batchWords: DeepgramWord[],
  batchTag: string,
  input: ChunkAndTranslateInput,
  contextTail: string,
  depth = 0,
): Promise<{ detectedLanguage: string; segments: DubSegment[]; modelUsed: string }> {
  try {
    return await callChunkAndTranslateWindow(batchWords, batchTag, input, contextTail);
  } catch {
    if (batchWords.length >= 240 && depth < 3) {
      const midIdx = findBestWordSplitIndex(
        batchWords,
        Math.floor(batchWords.length * 0.38),
        Math.floor(batchWords.length * 0.62),
      );
      const leftWords = batchWords.slice(0, midIdx);
      const rightWords = batchWords.slice(midIdx);
      const leftRes = await chunkAndTranslateWordWindowWithBisect(
        leftWords,
        `${batchTag}a`,
        input,
        contextTail,
        depth + 1,
      );
      const rightContext = leftWords
        .slice(-18)
        .map((w) => w.punctuatedWord)
        .join(" ");
      const rightRes = await chunkAndTranslateWordWindowWithBisect(
        rightWords,
        `${batchTag}b`,
        input,
        rightContext,
        depth + 1,
      );
      return {
        detectedLanguage: leftRes.detectedLanguage || rightRes.detectedLanguage,
        segments: [...leftRes.segments, ...rightRes.segments],
        modelUsed: rightRes.modelUsed || leftRes.modelUsed,
      };
    }
  }

  const fallback = buildFallbackSegmentsFromWords(batchWords);
  if (input.autoTranslate === false) {
    return {
      detectedLanguage: getDubLanguageLabel(input.sourceLanguage),
      segments: fallback,
      modelUsed: "fallback-gap-segmenter",
    };
  }
  return await translateDubSegments({
    segments: fallback,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    tone: input.tone,
  });
}

/**
 * Primary OpenRouter (Nemotron 3 Ultra) pipeline: divides long media into 30-minute
 * chronological trips (e.g., 2 hours = 4 trips of 30 minutes each), semantically chunks
 * Deepgram word timestamps at pause gaps, and batch-translates with Drama 3 expression tags.
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

  const trips = splitWordsIntoTimeTrips(input.words, DUB_TRIP_DURATION_SEC);
  const mergedSegments: DubSegment[] = [];
  let detectedLanguage = getDubLanguageLabel(input.sourceLanguage);
  let modelUsed = getOpenRouterModels()[0];
  let prevContextTail = "";

  for (const trip of trips) {
    input.onTripProgress?.(trip.tripIndex, trips.length, trip.label);

    const subBatches = splitWordSubBatches(trip.words, TRIP_LLM_MAX_WORDS);
    for (let sIdx = 0; sIdx < subBatches.length; sIdx += 1) {
      const subWords = subBatches[sIdx];
      const part = await chunkAndTranslateWordWindowWithBisect(
        subWords,
        `${trip.tripIndex}_${sIdx}`,
        input,
        prevContextTail,
      );

      if (mergedSegments.length === 0 && part.detectedLanguage) {
        detectedLanguage = part.detectedLanguage;
      }
      if (part.modelUsed && part.modelUsed !== "fallback-gap-segmenter") {
        modelUsed = part.modelUsed;
      }
      for (const seg of part.segments) {
        mergedSegments.push({
          ...seg,
          id: `seg_${mergedSegments.length + 1}`,
        });
      }
      prevContextTail = subWords
        .slice(-18)
        .map((w) => w.punctuatedWord)
        .join(" ");
    }
  }

  return {
    detectedLanguage,
    segments: mergedSegments,
    modelUsed,
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
    "Isochronous Timing-Sync Rules:",
    "- Match each translated line's character budget (`minChars` to `maxChars`, aiming right around `targetChars`) so the voice actor fills the full scene window (`durationSec`) without rushing or finishing 1–2 seconds early.",
    "- When translating from syllable-heavy/longer-spoken source languages into compact English, avoid overly terse literal phrasing that ends prematurely and creates awkward silence gaps. Naturally expand phrasing with idiomatic conversational wording, subtle spoken connectors, and mid-sentence clause punctuation (`,`, `—`, `...`) so the delivery matches `durationSec` cleanly while keeping exact meaning.",
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
      const targetChars = Math.max(12, Math.round(durationSec * cps));
      return {
        id: seg.id,
        durationSec,
        minChars: Math.max(8, Math.round(targetChars * 0.85)),
        targetChars,
        maxChars: Math.max(16, Math.round(targetChars * 1.12)),
        text: seg.sourceText.trim(),
      };
    }),
  };

  const { content, modelUsed } = await callDubLlmWithCascade(
    systemPrompt,
    JSON.stringify(payload),
    12288,
  );
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
 * Batch-translate existing/imported timestamped video segments via OpenRouter (Nemotron 3 Ultra)
 * grouped by 30-minute time trips, with Drama 3 expression tags and timing-fit constraints.
 */
export async function translateDubSegments(input: TranslateDubInput): Promise<TranslateDubResult> {
  const nonEmpty = input.segments.filter((s) => s.sourceText.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("No dialogue lines available to translate.");
  }

  const out: DubSegment[] = input.segments.map((seg) => ({ ...seg }));
  let detectedLanguage = input.sourceLanguage === "auto" ? "Auto" : getDubLanguageLabel(input.sourceLanguage);
  let modelUsed = getOpenRouterModels()[0];

  const tripMap = new Map<number, DubSegment[]>();
  for (const seg of nonEmpty) {
    const tripIdx = Math.max(0, Math.floor(seg.startSec / DUB_TRIP_DURATION_SEC));
    const arr = tripMap.get(tripIdx) ?? [];
    arr.push(seg);
    tripMap.set(tripIdx, arr);
  }
  const tripEntries = Array.from(tripMap.entries()).sort((a, b) => a[0] - b[0]);

  for (let t = 0; t < tripEntries.length; t += 1) {
    const [tripBucket, tripSegs] = tripEntries[t];
    const startMin = tripBucket * 30;
    const endMin = startMin + 30;
    input.onTripProgress?.(t, tripEntries.length, `Trip ${t + 1}/${tripEntries.length} (${startMin}m–${endMin}m)`);

    for (let start = 0; start < tripSegs.length; start += SEGMENT_BATCH_SIZE) {
      const batch = tripSegs.slice(start, start + SEGMENT_BATCH_SIZE);
      const firstBatchSeg = batch[0];
      const contextBefore = firstBatchSeg
        ? out.filter((s) => s.endSec <= firstBatchSeg.startSec + 0.1).slice(-2)
        : [];
      const res = await translateBatch(batch, contextBefore, input);
      if (t === 0 && start === 0) {
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
