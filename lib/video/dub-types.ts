import type { TtsStyle, VoiceId } from "@/components/tool/audio/tts/model";

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

export type DubOutputFormat = "mp4" | "webm";

export const DUB_SOURCE_LANGUAGES: {
  code: DubLanguageCode;
  label: string;
  whisperCode?: string;
}[] = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English", whisperCode: "en" },
  { code: "hi", label: "Hindi", whisperCode: "hi" },
  { code: "es", label: "Spanish", whisperCode: "es" },
  { code: "fr", label: "French", whisperCode: "fr" },
  { code: "de", label: "German", whisperCode: "de" },
  { code: "pt", label: "Portuguese", whisperCode: "pt" },
  { code: "it", label: "Italian", whisperCode: "it" },
  { code: "ja", label: "Japanese", whisperCode: "ja" },
  { code: "ko", label: "Korean", whisperCode: "ko" },
  { code: "zh", label: "Chinese", whisperCode: "zh" },
  { code: "ar", label: "Arabic", whisperCode: "ar" },
  { code: "ru", label: "Russian", whisperCode: "ru" },
];

export const DUB_TARGET_LANGUAGES: {
  code: DubTargetLanguageCode;
  label: string;
  nativeName: string;
  charsPerSec: number;
}[] = [
  { code: "hi", label: "Hindi", nativeName: "हिन्दी", charsPerSec: 13 },
  { code: "en", label: "English", nativeName: "English", charsPerSec: 15 },
  { code: "es", label: "Spanish", nativeName: "Español", charsPerSec: 15 },
  { code: "fr", label: "French", nativeName: "Français", charsPerSec: 14 },
  { code: "de", label: "German", nativeName: "Deutsch", charsPerSec: 14 },
  { code: "pt", label: "Portuguese", nativeName: "Português", charsPerSec: 15 },
  { code: "it", label: "Italian", nativeName: "Italiano", charsPerSec: 15 },
  { code: "ja", label: "Japanese", nativeName: "日本語", charsPerSec: 6 },
  { code: "ko", label: "Korean", nativeName: "한국어", charsPerSec: 7 },
  { code: "zh", label: "Chinese (Mandarin)", nativeName: "中文", charsPerSec: 5 },
  { code: "ar", label: "Arabic", nativeName: "العربية", charsPerSec: 13 },
  { code: "ru", label: "Russian", nativeName: "Русский", charsPerSec: 14 },
];

export const DUB_TONES: { value: DubTone; label: string; hint: string; ttsStyle: TtsStyle }[] = [
  { value: "natural", label: "Natural", hint: "Faithful to original delivery", ttsStyle: "neutral" },
  { value: "conversational", label: "Conversational", hint: "Warm casual pacing", ttsStyle: "conversational" },
  { value: "narration", label: "Documentary", hint: "Steady informative read", ttsStyle: "narration" },
  { value: "cheerful", label: "Energetic", hint: "Upbeat creator energy", ttsStyle: "cheerful" },
];

export type DubSegment = {
  id: string;
  startSec: number;
  endSec: number;
  sourceText: string;
  translatedText: string;
  speakerLabel?: string;
};

export type DubAlignedSegment = DubSegment & {
  alignedStartSec: number;
  alignedEndSec: number;
  spokenDurationSec: number;
  speedApplied: number;
};

export type DubJobStatus =
  | "queued"
  | "waiting_for_server"
  | "translating"
  | "synthesizing"
  | "mixing"
  | "completed"
  | "failed";

export type DubSettings = {
  sourceLanguage: DubLanguageCode;
  targetLanguage: DubTargetLanguageCode;
  voiceMode: DubVoiceMode;
  voiceId: VoiceId;
  tone: DubTone;
  keepBackground: boolean;
  backgroundLevel: number; // 0..0.6 (fraction of original audio kept during dialogue)
  syncToTimeline: boolean;
  embedSubtitles: boolean;
  preferredStudio: string;
};

export const DEFAULT_DUB_SETTINGS: DubSettings = {
  sourceLanguage: "auto",
  targetLanguage: "hi",
  voiceMode: "clone",
  voiceId: "aria",
  tone: "natural",
  keepBackground: true,
  backgroundLevel: 0.18,
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
  targetLanguage: string;
  voiceLabel: string;
  keepBackground: boolean;
  backgroundLevel: number;
  fileName: string;
  sourceVideoName: string;
  srtText: string;
  vttText: string;
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
  segments.forEach((seg, index) => {
    const text = (useTranslated ? seg.translatedText || seg.sourceText : seg.sourceText).trim();
    if (!text) return;
    const start = Math.max(0, useTranslated && typeof seg.alignedStartSec === "number" ? seg.alignedStartSec : seg.startSec);
    const end = Math.max(start + 0.3, useTranslated && typeof seg.alignedEndSec === "number" ? seg.alignedEndSec : seg.endSec);
    lines.push(String(index + 1));
    lines.push(`${formatSubtitleTimestamp(start, ",")} --> ${formatSubtitleTimestamp(end, ",")}`);
    lines.push(text);
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}

export function buildVttFromSegments(
  segments: (Pick<DubSegment, "startSec" | "endSec" | "sourceText" | "translatedText"> & {
    alignedStartSec?: number;
    alignedEndSec?: number;
  })[],
  useTranslated = true,
): string {
  const lines: string[] = ["WEBVTT", ""];
  segments.forEach((seg) => {
    const text = (useTranslated ? seg.translatedText || seg.sourceText : seg.sourceText).trim();
    if (!text) return;
    const start = Math.max(0, useTranslated && typeof seg.alignedStartSec === "number" ? seg.alignedStartSec : seg.startSec);
    const end = Math.max(start + 0.3, useTranslated && typeof seg.alignedEndSec === "number" ? seg.alignedEndSec : seg.endSec);
    lines.push(`${formatSubtitleTimestamp(start, ".")} --> ${formatSubtitleTimestamp(end, ".")}`);
    lines.push(text);
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
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

    let timeLineIdx = lines.findIndex((line) => line.includes("-->"));
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

