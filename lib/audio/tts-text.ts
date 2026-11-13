import type { TtsStyle } from "@/components/tool/audio/tts/model";

export type SpeechChunk = {
  text: string;
  pauseAfterMs: number;
  maxNewTokens: number;
};

const MAX_CHUNK_CHARS = 280;

const STYLE_TAG: Record<TtsStyle, string | null> = {
  neutral: null,
  conversational: "[conversational]",
  narration: "[calm]",
  cheerful: "[cheerful]",
};

function normalizeFigures(text: string): string {
  return text
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1, $2, $3")
    .replace(/\$([0-9]+(?:\.[0-9]+)?)/g, "$1 dollars")
    .replace(/([0-9]+(?:\.[0-9]+)?)%/g, "$1 percent");
}

function sanitizeControlTokens(text: string): string {
  // Strip structural chat/codec tokens AND unsupported XML/SSML tags (<emphasis>, <slow>, etc.)
  // so Drama 3 never hallucinates silence trying to parse angle-bracket tags
  return text
    .replace(/<\|(?:im_start|im_end|voice|text|interleave|semantic:[^|]*|speaker:(?!0\|)[0-9]+)\|>/gi, " ")
    .replace(/<\/?(?:emphasis|slow|fast|break|prosody|speak|voice|say-as|sub|phoneme|audio|p|s)\b[^>]*>/gi, " ")
    .replace(/<\/?[a-z][a-z0-9_-]*>/gi, " ");
}

/**
 * Bound Drama 3 output tokens cleanly based on spoken word count (~21.5 audio tokens/sec)
 * so runaway trailing silence stops early instead of padding several empty seconds.
 */
export function estimateMaxNewTokens(text: string): number {
  const spokenOnly = text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .trim();
  const words = spokenOnly ? spokenOnly.split(/\s+/).length : 0;
  return Math.min(900, Math.max(220, Math.round(words * 13) + 110));
}

function splitParagraphToSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?\n]+[.!?]+(?:\s*\[pause\])*|[^.!?\n]+$/gi);
  if (!matches) return [paragraph];
  return matches.map((m) => m.trim()).filter(Boolean);
}

/**
 * Split scripts into balanced paragraph & sentence chunks (<280 chars) so chunks
 * synthesize fast, spread across multiple GPU workers, and keep pause timing intact.
 */
export function prepareSpeechChunks(
  rawText: string,
  options: {
    style: TtsStyle;
    paragraphPauses: boolean;
    emphasizeNumbers: boolean;
  },
): SpeechChunk[] {
  const cleaned = sanitizeControlTokens(rawText).replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const styleTag = STYLE_TAG[options.style];
  const chunks: SpeechChunk[] = [];

  paragraphs.forEach((rawParagraph, pIndex) => {
    const paragraph = options.emphasizeNumbers ? normalizeFigures(rawParagraph) : rawParagraph;
    // Split on explicit [pause] cues first so pauses become exact calibrated PCM silence
    const pauseSegments = paragraph.split(/(\s*\[pause\]\s*)/gi);
    const paraUnits: { text: string; extraPauseMs: number }[] = [];

    for (let s = 0; s < pauseSegments.length; s += 1) {
      const token = pauseSegments[s];
      if (!token || !token.trim()) continue;
      if (/^\[pause\]$/i.test(token.trim())) {
        if (paraUnits.length > 0) {
          paraUnits[paraUnits.length - 1].extraPauseMs += 420;
        }
        continue;
      }

      const sentences = splitParagraphToSentences(token.trim());
      let current = "";
      for (const sentence of sentences) {
        if (sentence.length > MAX_CHUNK_CHARS) {
          if (current) {
            paraUnits.push({ text: current, extraPauseMs: 0 });
            current = "";
          }
          const words = sentence.split(/\s+/);
          let part = "";
          for (const w of words) {
            if (part && part.length + 1 + w.length > MAX_CHUNK_CHARS) {
              paraUnits.push({ text: part, extraPauseMs: 0 });
              part = w;
            } else {
              part = part ? `${part} ${w}` : w;
            }
          }
          if (part) paraUnits.push({ text: part, extraPauseMs: 0 });
          continue;
        }

        if (current && current.length + 1 + sentence.length > MAX_CHUNK_CHARS) {
          paraUnits.push({ text: current, extraPauseMs: 0 });
          current = sentence;
        } else {
          current = current ? `${current} ${sentence}` : sentence;
        }
      }
      if (current) paraUnits.push({ text: current, extraPauseMs: 0 });
    }

    const isLastPara = pIndex === paragraphs.length - 1;
    paraUnits.forEach((unit, cIndex) => {
      const isLastInPara = cIndex === paraUnits.length - 1;
      const strippedChunk = unit.text.trim();
      if (!strippedChunk) {
        if (chunks.length > 0 && unit.extraPauseMs > 0) {
          chunks[chunks.length - 1].pauseAfterMs += unit.extraPauseMs;
        }
        return;
      }

      const hasLeadingDirection = /^(\[|<[a-z])/i.test(strippedChunk);
      const prefixed = styleTag && !hasLeadingDirection ? `${styleTag} ${strippedChunk}` : strippedChunk;

      let pauseAfterMs = 90;
      if (isLastInPara && !isLastPara) {
        pauseAfterMs = options.paragraphPauses ? 380 : 120;
      } else if (isLastInPara && isLastPara) {
        pauseAfterMs = 0;
      }
      pauseAfterMs += unit.extraPauseMs;

      chunks.push({
        text: prefixed,
        pauseAfterMs,
        maxNewTokens: estimateMaxNewTokens(prefixed),
      });
    });
  });

  return chunks;
}
