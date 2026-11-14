import type { TtsStyle, VoiceId } from "@/components/tool/audio/tts/model";

export const MAX_DUB_DURATION_SEC = 7200; // 2 hours
export const MAX_DUB_DURATION_MIN = 120;
export const DUB_TRIP_DURATION_SEC = 30 * 60; // 30 minutes per trip (2 hours = 4 trips)
export const DURATION_MATCH_TOLERANCE_SEC = 1.8;

export type DubTimeTripWindow = {
  tripIndex: number;
  totalTrips: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  label: string;
};

/**
 * Divide any media duration (up to 2 hours / 7200s) into sequential 30-minute processing
 * trips (e.g., 2h = 4 trips: 0m–30m, 30m–60m, 60m–90m, 90m–120m) so long videos are
 * never extracted, transcribed, or translated in a single monolithic pass.
 */
export function computeDubTripWindows(
  totalDurationSec: number,
  tripDurationSec = DUB_TRIP_DURATION_SEC,
): DubTimeTripWindow[] {
  const safeTotal = Math.min(MAX_DUB_DURATION_SEC, Math.max(0.1, totalDurationSec));
  const step = Math.max(60, tripDurationSec);
  const count = Math.max(1, Math.ceil(safeTotal / step));
  const windows: DubTimeTripWindow[] = [];

  for (let i = 0; i < count; i += 1) {
    const startSec = Number((i * step).toFixed(2));
    const endSec = Number(Math.min(safeTotal, (i + 1) * step).toFixed(2));
    const durationSec = Number(Math.max(0.1, endSec - startSec).toFixed(2));
    const startMin = Math.round(startSec / 60);
    const endMin = Math.max(startMin + 1, Math.round(endSec / 60));
    windows.push({
      tripIndex: i,
      totalTrips: count,
      startSec,
      endSec,
      durationSec,
      label: `Trip ${i + 1}/${count} (${startMin}m–${endMin}m)`,
    });
  }

  return windows;
}

export type DubLanguageCode =
  | "auto"
  | "en"
  | "hi"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it"
  | "ja"
  | "ko"
  | "zh"
  | "ar"
  | "ru";

export type DubTargetLanguageCode = Exclude<DubLanguageCode, "auto">;

export type DubTone = "natural" | "conversational" | "narration" | "cheerful";

export type DubVoiceMode = "clone" | "preset";

export type DubCloneSource = "auto_vad" | "custom_upload" | "saved_voice";

export type DubOutputFormat = "mp4" | "webm";

export type DubBindAudioMode = "keep_both" | "replace" | "mix_ducked";

export type DubBindSubtitleMode =
  | "soft_both"
  | "soft_translated"
  | "soft_original"
  | "burn_translated"
  | "burn_original"
  | "burn_dual"
  | "none";

export const DUB_EXPRESSION_TAGS = [
  { tag: "[excited]", label: "Excited" },
  { tag: "[cheerful]", label: "Cheerful" },
  { tag: "[calm]", label: "Calm" },
  { tag: "[conversational]", label: "Natural" },
  { tag: "[serious]", label: "Serious" },
  { tag: "[confident]", label: "Confident" },
  { tag: "[empathetic]", label: "Empathetic" },
  { tag: "[curious]", label: "Curious" },
  { tag: "[surprised]", label: "Surprised" },
  { tag: "[sad]", label: "Sad" },
  { tag: "[whispers]", label: "Whispers" },
  { tag: "[sighs]", label: "Sighs" },
  { tag: "[laughs]", label: "Laughs" },
  { tag: "[chuckling]", label: "Chuckling" },
  { tag: "[gasp]", label: "Gasp" },
  { tag: "[hesitant]", label: "Hesitant" },
] as const;

export const DUB_SOURCE_LANGUAGES: {
  code: DubLanguageCode;
  label: string;
  deepgramCode?: string;
}[] = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English", deepgramCode: "en" },
  { code: "hi", label: "Hindi", deepgramCode: "hi" },
  { code: "es", label: "Spanish", deepgramCode: "es" },
  { code: "fr", label: "French", deepgramCode: "fr" },
  { code: "de", label: "German", deepgramCode: "de" },
  { code: "pt", label: "Portuguese", deepgramCode: "pt" },
  { code: "it", label: "Italian", deepgramCode: "it" },
  { code: "ja", label: "Japanese", deepgramCode: "ja" },
  { code: "ko", label: "Korean", deepgramCode: "ko" },
  { code: "zh", label: "Chinese", deepgramCode: "zh" },
  { code: "ar", label: "Arabic", deepgramCode: "ar" },
  { code: "ru", label: "Russian", deepgramCode: "ru" },
];

export const DUB_TARGET_LANGUAGES: {
  code: DubTargetLanguageCode;
  label: string;
  nativeName: string;
  charsPerSec: number;
  iso639_2: string;
}[] = [
  { code: "hi", label: "Hindi", nativeName: "हिन्दी", charsPerSec: 11.5, iso639_2: "hin" },
  { code: "en", label: "English", nativeName: "English", charsPerSec: 12.5, iso639_2: "eng" },
  { code: "es", label: "Spanish", nativeName: "Español", charsPerSec: 13, iso639_2: "spa" },
  { code: "fr", label: "French", nativeName: "Français", charsPerSec: 12.5, iso639_2: "fra" },
  { code: "de", label: "German", nativeName: "Deutsch", charsPerSec: 12.5, iso639_2: "deu" },
  { code: "pt", label: "Portuguese", nativeName: "Português", charsPerSec: 13, iso639_2: "por" },
  { code: "it", label: "Italian", nativeName: "Italiano", charsPerSec: 13, iso639_2: "ita" },
  { code: "ja", label: "Japanese", nativeName: "日本語", charsPerSec: 5.5, iso639_2: "jpn" },
  { code: "ko", label: "Korean", nativeName: "한국어", charsPerSec: 6.5, iso639_2: "kor" },
  { code: "zh", label: "Chinese (Mandarin)", nativeName: "中文", charsPerSec: 4.5, iso639_2: "zho" },
  { code: "ar", label: "Arabic", nativeName: "العربية", charsPerSec: 11.5, iso639_2: "ara" },
  { code: "ru", label: "Russian", nativeName: "Русский", charsPerSec: 12.5, iso639_2: "rus" },
];

export const DUB_TONES: { value: DubTone; label: string; hint: string; ttsStyle: TtsStyle }[] = [
  { value: "natural", label: "Natural", hint: "Faithful to original delivery", ttsStyle: "neutral" },
  { value: "conversational", label: "Conversational", hint: "Warm casual pacing", ttsStyle: "conversational" },
  { value: "narration", label: "Documentary", hint: "Steady informative read", ttsStyle: "narration" },
  { value: "cheerful", label: "Energetic", hint: "Upbeat creator energy", ttsStyle: "cheerful" },
];

export type DeepgramWord = {
  word: string;
  punctuatedWord: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
};

export type DubSegment = {
  id: string;
  startSec: number;
  endSec: number;
  sourceText: string;
  translatedText: string;
  speaker?: number;
  speakerLabel?: string;
};

export type DubAlignedSegment = DubSegment & {
  alignedStartSec: number;
  alignedEndSec: number;
  spokenDurationSec: number;
  speedApplied: number;
};

export type VadReferenceInfo = {
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  speaker?: number;
};

export type DubJobStatus =
  | "queued"
  | "waiting_for_server"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "mixing"
  | "completed"
  | "failed";

export type DubSettings = {
  sourceLanguage: DubLanguageCode;
  targetLanguage: DubTargetLanguageCode;
  voiceMode: DubVoiceMode;
  cloneSource: DubCloneSource;
  voiceId: VoiceId;
  tone: DubTone;
  keepBackground: boolean;
  backgroundLevel: number; // 0..0.65 (fraction of original audio kept during dialogue)
  syncToTimeline: boolean;
  embedSubtitles: boolean;
  preferredStudio: string;
};

export const DEFAULT_DUB_SETTINGS: DubSettings = {
  sourceLanguage: "auto",
  targetLanguage: "hi",
  voiceMode: "clone",
  cloneSource: "auto_vad",
  voiceId: "aria",
  tone: "natural",
  keepBackground: true,
  backgroundLevel: 0.32,
  syncToTimeline: true,
  embedSubtitles: true,
  preferredStudio: "auto",
};

export type DubJobSnapshot = {
  id: string;
  ownerId: string;
  status: DubJobStatus;
  progress: number;
  stageLabel: string;
  assignedStudioLabel: string | null;
  bootElapsedMs: number;
  elapsedMs: number;
  segmentsDone: number;
  segmentsTotal: number;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number;
  ttlMs: number;
  storageProvider: "local" | "r2" | null;
  audioUrl: string | null;
  downloadUrl: string | null;
  videoUrl: string | null;
  videoDownloadUrl: string | null;
  mimeType: string | null;
  byteLength: number | null;
  durationSeconds: number;
  peaks: number[];
  sourceLanguage: string;
  detectedLanguage?: string | null;
  targetLanguage: string;
  voiceLabel: string;
  keepBackground: boolean;
  backgroundLevel: number;
  fileName: string;
  sourceVideoName: string;
  mediaKind: "video" | "audio";
  srtText: string;
  vttText: string;
  sourceSrtText: string;
  sourceVttText: string;
  dualSrtText: string;
  vadReferenceInfo: VadReferenceInfo | null;
  modelUsed?: string | null;
  segments: DubAlignedSegment[];
  error: string | null;
};

export function dubCredits(durationSeconds: number): number {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 30;
  return Math.max(5, Math.ceil(safeDuration / 60) * 5);
}

export function getDubLanguageLabel(code: string): string {
  if (code === "auto") return "Auto-detect";
  return (
    DUB_TARGET_LANGUAGES.find((l) => l.code === code)?.label ??
    DUB_SOURCE_LANGUAGES.find((l) => l.code === code)?.label ??
    code.toUpperCase()
  );
}

export function getIso639_2Code(code: string): string {
  const clean = code.toLowerCase().split("-")[0];
  const found = DUB_TARGET_LANGUAGES.find((l) => l.code === clean);
  if (found) return found.iso639_2;
  return "und";
}

/**
 * Strip Fish Audio Drama 3 bracket/XML direction tags (e.g. [excited], [whispers],
 * <emphasis>, </emphasis>, <slow>, <|speaker:0|>) when rendering clean human subtitles.
 */
export function stripDramaTagsForSubtitles(text: string): string {
  return text
    .replace(/<\|speaker:\d+\|>/gi, " ")
    .replace(/<\/?(?:emphasis|slow|fast|whisper)>/gi, " ")
    .replace(/\[(?:excited|whispers?|sighs?|laughs?|chuckl(?:e|ing)|calm|cheerful|conversational|pause|gasps?|sad|angry|nervous|happy|serious|confident|empathetic|curious|surprised|hesitant|sarcastically|slow|fast|deliberate|warm|dramatic)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSubtitleTimestamp(seconds: number, separator: "," | "."): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const secs = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mins = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(ms).padStart(3, "0")}`;
}

export function buildSrtFromSegments(
  segments: (Pick<DubSegment, "startSec" | "endSec" | "sourceText" | "translatedText"> & {
    alignedStartSec?: number;
    alignedEndSec?: number;
  })[],
  useTranslated = true,
): string {
  const lines: string[] = [];
  let idx = 1;
  for (const seg of segments) {
    const rawText = useTranslated ? seg.translatedText || seg.sourceText : seg.sourceText;
    const text = stripDramaTagsForSubtitles(rawText);
    if (!text) continue;
    const start = Math.max(
      0,
      useTranslated && typeof seg.alignedStartSec === "number" ? seg.alignedStartSec : seg.startSec,
    );
    const end = Math.max(
      start + 0.35,
      useTranslated && typeof seg.alignedEndSec === "number" ? seg.alignedEndSec : seg.endSec,
    );
    lines.push(String(idx));
    lines.push(`${formatSubtitleTimestamp(start, ",")} --> ${formatSubtitleTimestamp(end, ",")}`);
    lines.push(text);
    lines.push("");
    idx += 1;
  }
  return lines.length > 0 ? `${lines.join("\n").trim()}\n` : "";
}

export function buildVttFromSegments(
  segments: (Pick<DubSegment, "startSec" | "endSec" | "sourceText" | "translatedText"> & {
    alignedStartSec?: number;
    alignedEndSec?: number;
  })[],
  useTranslated = true,
): string {
  const lines: string[] = ["WEBVTT", ""];
  for (const seg of segments) {
    const rawText = useTranslated ? seg.translatedText || seg.sourceText : seg.sourceText;
    const text = stripDramaTagsForSubtitles(rawText);
    if (!text) continue;
    const start = Math.max(
      0,
      useTranslated && typeof seg.alignedStartSec === "number" ? seg.alignedStartSec : seg.startSec,
    );
    const end = Math.max(
      start + 0.35,
      useTranslated && typeof seg.alignedEndSec === "number" ? seg.alignedEndSec : seg.endSec,
    );
    lines.push(`${formatSubtitleTimestamp(start, ".")} --> ${formatSubtitleTimestamp(end, ".")}`);
    lines.push(text);
    lines.push("");
  }
  return lines.length > 2 ? `${lines.join("\n").trim()}\n` : "";
}

export function buildDualSrtFromSegments(
  segments: (Pick<DubSegment, "startSec" | "endSec" | "sourceText" | "translatedText"> & {
    alignedStartSec?: number;
    alignedEndSec?: number;
  })[],
): string {
  const lines: string[] = [];
  let idx = 1;
  for (const seg of segments) {
    const trans = stripDramaTagsForSubtitles(seg.translatedText || "");
    const orig = stripDramaTagsForSubtitles(seg.sourceText || "");
    if (!trans && !orig) continue;
    const start = Math.max(
      0,
      typeof seg.alignedStartSec === "number" ? seg.alignedStartSec : seg.startSec,
    );
    const end = Math.max(
      start + 0.35,
      typeof seg.alignedEndSec === "number" ? seg.alignedEndSec : seg.endSec,
    );
    lines.push(String(idx));
    lines.push(`${formatSubtitleTimestamp(start, ",")} --> ${formatSubtitleTimestamp(end, ",")}`);
    if (trans && orig && trans !== orig) {
      lines.push(trans);
      lines.push(orig);
    } else {
      lines.push(trans || orig);
    }
    lines.push("");
    idx += 1;
  }
  return lines.length > 0 ? `${lines.join("\n").trim()}\n` : "";
}

function parseTimestampToken(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 2) {
    const m = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
  }
  if (parts.length === 3) {
    const h = Number.parseFloat(parts[0]);
    const m = Number.parseFloat(parts[1]);
    const s = Number.parseFloat(parts[2]);
    return Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s) ? h * 3600 + m * 60 + s : null;
  }
  return null;
}

/** Parse SRT or WebVTT caption text into timeline segments. */
export function parseSubtitleText(raw: string): DubSegment[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/^WEBVTT[^\n]*\n+/i, "").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const segments: DubSegment[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const timeLineIdx = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIdx === -1) continue;

    const match = lines[timeLineIdx].match(/([^\s]+)\s*-->\s*([^\s]+)/);
    if (!match) continue;
    const startSec = parseTimestampToken(match[1]);
    const endSec = parseTimestampToken(match[2]);
    if (startSec === null || endSec === null) continue;

    const textLines = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!textLines) continue;

    segments.push({
      id: `seg_${segments.length + 1}`,
      startSec: Number(Math.max(0, startSec).toFixed(2)),
      endSec: Number(Math.max(startSec + 0.4, endSec).toFixed(2)),
      sourceText: textLines,
      translatedText: "",
    });
  }

  return segments;
}
