import { buildWav, parseWav } from "@/lib/audio/wav-utils";
import type { DeepgramWord, VadReferenceInfo } from "./dub-types";

export type ExtractedVadReference = {
  audioBase64: string;
  wavBuffer: Buffer;
  info: VadReferenceInfo;
};

type FrameRmsProfile = {
  frameSec: number;
  rms: Float32Array;
  noiseFloor: number;
  speechThreshold: number;
};

const FRAME_SEC = 0.02; // 20ms VAD analysis frame
const TARGET_CLONE_SEC = 20;
const MIN_CLONE_SEC = 14;
const MAX_CLONE_SEC = 22.5;
const TARGET_SAMPLE_RATE = 24_000;

function computeFrameRms(pcm16: Buffer, sampleRate: number, numChannels: number): FrameRmsProfile {
  const bytesPerFrame = 2 * numChannels;
  const totalSamples = Math.floor(pcm16.length / bytesPerFrame);
  const hopSamples = Math.max(1, Math.round(sampleRate * FRAME_SEC));
  const numFrames = Math.max(1, Math.floor(totalSamples / hopSamples));
  const rms = new Float32Array(numFrames);

  for (let f = 0; f < numFrames; f += 1) {
    const startSample = f * hopSamples;
    const endSample = Math.min(totalSamples, startSample + hopSamples);
    let sumSq = 0;
    const step = Math.max(1, Math.floor((endSample - startSample) / 60));
    let count = 0;
    for (let s = startSample; s < endSample; s += step) {
      const val = pcm16.readInt16LE(s * bytesPerFrame) / 32768;
      sumSq += val * val;
      count += 1;
    }
    rms[f] = Math.sqrt(sumSq / Math.max(1, count));
  }

  const sorted = Array.from(rms).sort((a, b) => a - b);
  const p15 = sorted[Math.floor(sorted.length * 0.15)] ?? 0.002;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] ?? 0.08;
  const speechThreshold = Math.max(0.01, Math.min(p85 * 0.38, p15 * 2.8 + 0.006));

  return {
    frameSec: FRAME_SEC,
    rms,
    noiseFloor: p15,
    speechThreshold,
  };
}

function voicedRatioInRange(profile: FrameRmsProfile, startSec: number, endSec: number): {
  voicedRatio: number;
  meanRms: number;
  clipRatio: number;
} {
  const fStart = Math.max(0, Math.floor(startSec / profile.frameSec));
  const fEnd = Math.min(profile.rms.length, Math.ceil(endSec / profile.frameSec));
  if (fEnd <= fStart) {
    return { voicedRatio: 0, meanRms: 0, clipRatio: 0 };
  }

  let voiced = 0;
  let sum = 0;
  let clipped = 0;
  const count = fEnd - fStart;
  for (let i = fStart; i < fEnd; i += 1) {
    const val = profile.rms[i];
    sum += val;
    if (val >= profile.speechThreshold) voiced += 1;
    if (val > 0.92) clipped += 1;
  }

  return {
    voicedRatio: voiced / count,
    meanRms: sum / count,
    clipRatio: clipped / count,
  };
}

function slicePcm16Mono(
  pcmData: Buffer,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
  startSec: number,
  endSec: number,
): Int16Array {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = bytesPerSample * numChannels;
  const totalFrames = Math.floor(pcmData.length / blockAlign);
  const fStart = Math.max(0, Math.min(totalFrames, Math.floor(startSec * sampleRate)));
  const fEnd = Math.max(fStart, Math.min(totalFrames, Math.ceil(endSec * sampleRate)));
  const len = fEnd - fStart;
  const out = new Int16Array(len);

  for (let i = 0; i < len; i += 1) {
    const frameOffset = (fStart + i) * blockAlign;
    let acc = 0;
    for (let ch = 0; ch < numChannels; ch += 1) {
      const bytePos = frameOffset + ch * bytesPerSample;
      if (bitsPerSample === 16 && bytePos + 1 < pcmData.length) {
        acc += pcmData.readInt16LE(bytePos);
      }
    }
    out[i] = Math.round(acc / Math.max(1, numChannels));
  }
  return out;
}

function resampleInt16Linear(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(samples.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = Math.round(samples[i0] * (1 - frac) + samples[i1] * frac);
  }
  return out;
}

function normalizeAndEncode24kWav(samplesInt16: Int16Array, sampleRate: number): Buffer {
  const mono24 = resampleInt16Linear(samplesInt16, sampleRate, TARGET_SAMPLE_RATE);

  // Soft 12ms fade in/out to avoid boundary clicks
  const fadeSamples = Math.min(Math.floor(TARGET_SAMPLE_RATE * 0.012), Math.floor(mono24.length / 8));
  for (let i = 0; i < fadeSamples; i += 1) {
    const g = i / Math.max(1, fadeSamples);
    mono24[i] = Math.round(mono24[i] * g);
    mono24[mono24.length - 1 - i] = Math.round(mono24[mono24.length - 1 - i] * g);
  }

  let peak = 0;
  for (let i = 0; i < mono24.length; i += 1) {
    const a = Math.abs(mono24[i]);
    if (a > peak) peak = a;
  }

  const targetPeak = Math.round(0.86 * 32767);
  const gain = peak > 80 ? Math.min(4.5, targetPeak / peak) : 1;

  const pcmBuf = Buffer.alloc(mono24.length * 2);
  for (let i = 0; i < mono24.length; i += 1) {
    const scaled = Math.max(-32767, Math.min(32767, Math.round(mono24[i] * gain)));
    pcmBuf.writeInt16LE(scaled, i * 2);
  }

  return buildWav(pcmBuf, TARGET_SAMPLE_RATE, 1, 16, 1);
}

type SpeechRun = {
  startSec: number;
  endSec: number;
  durationSec: number;
  speaker: number;
  text: string;
  voicedRatio: number;
  meanRms: number;
  avgConfidence: number;
  score: number;
};

/**
 * Use PCM frame-RMS VAD + Deepgram word-by-word timestamps & speaker diarization
 * to extract the cleanest ~20 second continuous speaking chunk for Drama 3 voice cloning
 * (avoiding intro music, silence gaps, or noisy cross-talk at 0:00).
 */
export function extractVad20sCloneReference(params: {
  wavBuffer: Buffer;
  words?: DeepgramWord[];
  targetDurationSec?: number;
}): ExtractedVadReference | null {
  const { wavBuffer, words = [], targetDurationSec = TARGET_CLONE_SEC } = params;
  const parsed = parseWav(wavBuffer);
  if (parsed.bitsPerSample !== 16 || parsed.pcmData.length < parsed.sampleRate * 0.8 * 2) {
    return null;
  }

  const totalDurSec =
    parsed.pcmData.length / ((parsed.bitsPerSample / 8) * parsed.numChannels) / parsed.sampleRate;
  const profile = computeFrameRms(parsed.pcmData, parsed.sampleRate, parsed.numChannels);

  // If we have Deepgram word timestamps, find the dominant speaker and cleanest ~20s continuous span
  if (words.length > 0) {
    const speakerDur = new Map<number, number>();
    for (const w of words) {
      const spk = w.speaker ?? 0;
      speakerDur.set(spk, (speakerDur.get(spk) ?? 0) + Math.max(0.05, w.end - w.start));
    }
    let dominantSpeaker = words[0].speaker ?? 0;
    let bestSpkTime = -1;
    for (const [spk, dur] of speakerDur.entries()) {
      if (dur > bestSpkTime) {
        bestSpkTime = dur;
        dominantSpeaker = spk;
      }
    }

    // 1) Try sliding word windows of ~15s-22s on the dominant speaker with tight pause tolerance
    const domWords = words.filter((w) => (w.speaker ?? 0) === dominantSpeaker);
    const searchWords = domWords.length >= 4 ? domWords : words;

    let bestSingleWindow: SpeechRun | null = null;
    for (let i = 0; i < searchWords.length; i += 1) {
      let gapAccum = 0;
      let maxGap = 0;
      let confSum = searchWords[i].confidence;
      let wordCount = 1;

      for (let j = i + 1; j < searchWords.length; j += 1) {
        const prev = searchWords[j - 1];
        const cur = searchWords[j];
        const gap = Math.max(0, cur.start - prev.end);
        gapAccum += gap;
        if (gap > maxGap) maxGap = gap;
        confSum += cur.confidence;
        wordCount += 1;

        const span = cur.end - searchWords[i].start;
        if (maxGap > 1.35) break; // break on long silence/music break
        if (span > MAX_CLONE_SEC) break;

        if (span >= Math.min(MIN_CLONE_SEC, totalDurSec * 0.75) || j === searchWords.length - 1) {
          const padStart = Math.max(0, searchWords[i].start - 0.08);
          const padEnd = Math.min(totalDurSec, cur.end + 0.12);
          const dur = padEnd - padStart;
          if (dur < 3) continue;

          const vad = voicedRatioInRange(profile, padStart, padEnd);
          const speechDensity = 1 - gapAccum / Math.max(1, dur);
          const avgConf = confSum / wordCount;
          const lengthCloseness = 1 - Math.min(1, Math.abs(dur - targetDurationSec) / targetDurationSec);

          // Slightly prefer skipping the very first 1.5s if there's an equally good segment after 2s
          // (avoids intro stingers/greetings overlap), but never disqualifies a short video.
          const postIntroBonus = padStart >= 1.5 || totalDurSec <= 25 ? 0.08 : 0;
          const energyOk = vad.meanRms >= profile.speechThreshold * 0.7 ? 1 : 0.25;

          const score =
            vad.voicedRatio * 0.34 +
            speechDensity * 0.28 +
            avgConf * 0.2 +
            lengthCloseness * 0.18 +
            postIntroBonus -
            vad.clipRatio * 0.4;

          const finalScore = score * energyOk;
          if (!bestSingleWindow || finalScore > bestSingleWindow.score) {
            bestSingleWindow = {
              startSec: padStart,
              endSec: padEnd,
              durationSec: dur,
              speaker: dominantSpeaker,
              text: searchWords
                .slice(i, j + 1)
                .map((w) => w.punctuatedWord)
                .join(" ")
                .trim(),
              voicedRatio: vad.voicedRatio,
              meanRms: vad.meanRms,
              avgConfidence: avgConf,
              score: finalScore,
            };
          }
        }
      }
    }

    if (bestSingleWindow && bestSingleWindow.durationSec >= 12) {
      const sliced = slicePcm16Mono(
        parsed.pcmData,
        parsed.sampleRate,
        parsed.numChannels,
        parsed.bitsPerSample,
        bestSingleWindow.startSec,
        bestSingleWindow.endSec,
      );
      const wav24 = normalizeAndEncode24kWav(sliced, parsed.sampleRate);
      return {
        audioBase64: wav24.toString("base64"),
        wavBuffer: wav24,
        info: {
          startSec: Number(bestSingleWindow.startSec.toFixed(2)),
          endSec: Number(bestSingleWindow.endSec.toFixed(2)),
          durationSec: Number((sliced.length / parsed.sampleRate).toFixed(1)),
          text: bestSingleWindow.text,
          speaker: bestSingleWindow.speaker,
        },
      };
    }

    // 2) Otherwise stitch the cleanest contiguous voiced phrase runs from the dominant speaker up to ~20s
    const phraseRuns: SpeechRun[] = [];
    let runStartIdx = 0;
    for (let i = 1; i <= searchWords.length; i += 1) {
      const isBreak = i === searchWords.length || searchWords[i].start - searchWords[i - 1].end > 0.75;
      if (!isBreak) continue;
      const runWords = searchWords.slice(runStartIdx, i);
      runStartIdx = i;
      if (runWords.length === 0) continue;

      const s = Math.max(0, runWords[0].start - 0.08);
      const e = Math.min(totalDurSec, runWords[runWords.length - 1].end + 0.1);
      const dur = e - s;
      if (dur < 1.2) continue;

      const vad = voicedRatioInRange(profile, s, e);
      const avgConf = runWords.reduce((acc, w) => acc + w.confidence, 0) / runWords.length;
      phraseRuns.push({
        startSec: s,
        endSec: e,
        durationSec: dur,
        speaker: dominantSpeaker,
        text: runWords.map((w) => w.punctuatedWord).join(" ").trim(),
        voicedRatio: vad.voicedRatio,
        meanRms: vad.meanRms,
        avgConfidence: avgConf,
        score: vad.voicedRatio * 0.5 + avgConf * 0.3 + Math.min(1, dur / 8) * 0.2 - vad.clipRatio * 0.4,
      });
    }

    if (phraseRuns.length > 0) {
      const sortedRuns = [...phraseRuns].sort((a, b) => b.score - a.score);
      const selected: SpeechRun[] = [];
      let accumSec = 0;
      for (const run of sortedRuns) {
        if (accumSec >= targetDurationSec) break;
        if (accumSec + run.durationSec > MAX_CLONE_SEC && selected.length > 0) continue;
        selected.push(run);
        accumSec += run.durationSec;
      }
      // Re-order chronologically for natural prosody
      selected.sort((a, b) => a.startSec - b.startSec);

      const gapPauseSamples = Math.round(parsed.sampleRate * 0.1);
      const chunks: Int16Array[] = [];
      for (let idx = 0; idx < selected.length; idx += 1) {
        const run = selected[idx];
        const part = slicePcm16Mono(
          parsed.pcmData,
          parsed.sampleRate,
          parsed.numChannels,
          parsed.bitsPerSample,
          run.startSec,
          run.endSec,
        );
        chunks.push(part);
        if (idx < selected.length - 1) {
          chunks.push(new Int16Array(gapPauseSamples));
        }
      }

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      if (totalLen > parsed.sampleRate * 1.2) {
        const merged = new Int16Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        const wav24 = normalizeAndEncode24kWav(merged, parsed.sampleRate);
        return {
          audioBase64: wav24.toString("base64"),
          wavBuffer: wav24,
          info: {
            startSec: Number(selected[0].startSec.toFixed(2)),
            endSec: Number(selected[selected.length - 1].endSec.toFixed(2)),
            durationSec: Number((merged.length / parsed.sampleRate).toFixed(1)),
            text: selected.map((s) => s.text).join(" ").trim(),
            speaker: dominantSpeaker,
          },
        };
      }
    }
  }

  // 3) Pure PCM-VAD fallback (when no word timestamps are supplied, e.g. custom voice file upload)
  return extractPurePcmVad20sWindow(parsed, profile, totalDurSec, targetDurationSec);
}

function extractPurePcmVad20sWindow(
  parsed: ReturnType<typeof parseWav>,
  profile: FrameRmsProfile,
  totalDurSec: number,
  targetDurationSec: number,
): ExtractedVadReference | null {
  const winFrames = Math.min(
    profile.rms.length,
    Math.max(1, Math.round(Math.min(targetDurationSec, totalDurSec) / profile.frameSec)),
  );
  if (winFrames <= 5) return null;

  let curVoiced = 0;
  let curRms = 0;
  for (let i = 0; i < winFrames; i += 1) {
    if (profile.rms[i] >= profile.speechThreshold) curVoiced += 1;
    curRms += profile.rms[i];
  }

  let bestStartFrame = 0;
  let bestScore = curVoiced / winFrames;

  for (let i = 1; i <= profile.rms.length - winFrames; i += 1) {
    const outVal = profile.rms[i - 1];
    const inVal = profile.rms[i + winFrames - 1];
    if (outVal >= profile.speechThreshold) curVoiced -= 1;
    if (inVal >= profile.speechThreshold) curVoiced += 1;
    curRms += inVal - outVal;

    const ratio = curVoiced / winFrames;
    const meanRms = curRms / winFrames;
    const score = ratio * 0.75 + Math.min(0.25, meanRms);
    if (score > bestScore) {
      bestScore = score;
      bestStartFrame = i;
    }
  }

  let startSec = bestStartFrame * profile.frameSec;
  let endSec = Math.min(totalDurSec, startSec + targetDurationSec);

  // Trim pure silence from leading/trailing edges inside the selected window
  let trimStartFrame = bestStartFrame;
  const maxEndFrame = Math.min(profile.rms.length, bestStartFrame + winFrames);
  let trimEndFrame = maxEndFrame;
  while (trimStartFrame < trimEndFrame - 10 && profile.rms[trimStartFrame] < profile.speechThreshold * 0.65) {
    trimStartFrame += 1;
  }
  while (trimEndFrame > trimStartFrame + 10 && profile.rms[trimEndFrame - 1] < profile.speechThreshold * 0.65) {
    trimEndFrame -= 1;
  }
  startSec = trimStartFrame * profile.frameSec;
  endSec = Math.min(totalDurSec, trimEndFrame * profile.frameSec);

  if (endSec - startSec < 1.2) return null;
  const sliced = slicePcm16Mono(
    parsed.pcmData,
    parsed.sampleRate,
    parsed.numChannels,
    parsed.bitsPerSample,
    startSec,
    endSec,
  );
  const wav24 = normalizeAndEncode24kWav(sliced, parsed.sampleRate);
  return {
    audioBase64: wav24.toString("base64"),
    wavBuffer: wav24,
    info: {
      startSec: Number(startSec.toFixed(2)),
      endSec: Number(endSec.toFixed(2)),
      durationSec: Number((sliced.length / parsed.sampleRate).toFixed(1)),
      text: "",
    },
  };
}
