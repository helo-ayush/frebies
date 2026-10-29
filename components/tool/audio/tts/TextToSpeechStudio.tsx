"use client";

import { useEffect, useState } from "react";
import { Check, Pause, Play, Sparkles, TriangleAlert } from "lucide-react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { AudioRunCard } from "@/components/tool/audio/AudioRunCard";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { formatTime } from "@/components/tool/audio/format";
import { TtsControls } from "./TtsControls";
import {
  DEFAULT_TTS_SETTINGS,
  SAMPLE_SCRIPT,
  TTS_MAX_CHARS,
  estimateSpeechSeconds,
  speechCredits,
  type TtsSettings,
} from "./model";

export function TextToSpeechStudio() {
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [text, setText] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const characters = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const duration = estimateSpeechSeconds(text, settings.speed);
  const credits = speechCredits(text);
  const hasText = text.trim().length > 0;

  function patch(next: Partial<TtsSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function togglePreview() {
    if (!speechSupported) {
      setPreviewError("Browser voice preview is not available here, but generation still works.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!hasText) return;
    setPreviewError(null);
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 600));
    utterance.rate = Math.min(2, Math.max(0.5, settings.speed));
    utterance.pitch = Math.min(2, Math.max(0.5, settings.pitch));
    utterance.lang = settings.language;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setPreviewError("The browser could not play this preview. Generation still uses the studio voice.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section
      id="text-to-speech"
      aria-label="Text to speech studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/audio/text-to-speech" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Voice studio</h2>
            <p className="mt-0.5 text-micro text-faint">Script in, voice out.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#a8432c]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />1 credit / 1k
            chars
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <Sparkles size={10} className="text-[#8fae9f]" aria-hidden />
            AI voice
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
        </div>
      </div>

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_396px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-line bg-[#fffdfa]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  Script
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setText(SAMPLE_SCRIPT);
                    setPreviewError(null);
                  }}
                  className="h-7 rounded-full border border-line bg-white px-2.5 text-[10px] font-medium text-muted transition-colors hover:border-[#d8d4cb] hover:text-ink"
                >
                  Load sample
                </button>
                {text && (
                  <button
                    type="button"
                    onClick={() => {
                      setText("");
                      setPreviewError(null);
                      if (speechSupported) window.speechSynthesis.cancel();
                      setSpeaking(false);
                    }}
                    className="h-7 rounded-full px-2 text-[10px] font-medium text-faint transition-colors hover:text-ink"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={text}
              maxLength={TTS_MAX_CHARS}
              onChange={(event) => {
                setText(event.target.value);
                setPreviewError(null);
                if (speaking && speechSupported) {
                  window.speechSynthesis.cancel();
                  setSpeaking(false);
                }
              }}
              placeholder="Paste or type your script here. Short sentences, a clear opening and a gentle close work best."
              aria-label="Voiceover script"
              className="min-h-[240px] w-full flex-1 resize-none bg-transparent px-4 py-4 font-display text-[15px] leading-[1.75] text-ink outline-none placeholder:text-[#b0a89b] sm:min-h-[300px]"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5 text-[10px]">
              <div className="flex flex-wrap items-center gap-3 text-faint">
                <span className="tabular-nums">
                  <span className="font-medium text-ink">{characters.toLocaleString()}</span> /{" "}
                  {TTS_MAX_CHARS.toLocaleString()} chars
                </span>
                <span className="hidden sm:inline">{words} words</span>
                <span className="tabular-nums">≈ {formatTime(duration)}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[9.5px] font-medium text-[#a8432c]">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                {credits} {credits === 1 ? "credit" : "credits"}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[13px] border border-line bg-[#faf8f3] p-3">
            <button
              type="button"
              onClick={togglePreview}
              disabled={!hasText || !speechSupported}
              aria-label={speaking ? "Stop preview" : "Preview script"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-[#2a2a2b] disabled:pointer-events-none disabled:opacity-35"
            >
              {speaking ? (
                <Pause size={14} fill="currentColor" aria-hidden />
              ) : (
                <Play size={14} fill="currentColor" className="ml-0.5" aria-hidden />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-medium text-ink">System voice preview</span>
                <span className="rounded-full border border-line bg-white px-1.5 py-0.5 text-[8.5px] text-faint">
                  Local
                </span>
              </div>
              <div className="mt-1.5">
                <MiniWaveform
                  bars={42}
                  height={26}
                  progress={speaking ? 0.66 : 0.18}
                  seed={4}
                  tone={speaking ? "coral" : "sage"}
                />
              </div>
            </div>
          </div>

          {previewError && (
            <p role="status" className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-[#786344]">
              <TriangleAlert size={11} className="mt-px shrink-0" aria-hidden />
              {previewError}
            </p>
          )}

          <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
            <Check size={11} className="mt-px shrink-0 text-[#8fae9f]" aria-hidden />
            Preview is a local browser voice. The generated AI voice is rendered on the
            run, and the script stays here until you sign in.
          </p>
        </div>

        <PaidRail
          label="Voice settings"
          footer={
            <AudioRunCard
              cost={credits}
              verb="generate voice"
              ready={hasText}
              emptyLabel="Write a script to run"
              onRun={() => setGateOpen(true)}
              note="1 credit per 1,000 characters, minimum 1. No credits are used until the run starts; failed runs are refunded."
            />
          }
        >
          <TtsControls settings={settings} onPatch={patch} />
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="generate this voice"
        cost={credits}
      />
    </section>
  );
}
