"use client";

import { useEffect, useState } from "react";
import { AudioLines, Cloud, Layers3, TriangleAlert } from "lucide-react";
import { ToolGlyph } from "@/components/icons/NavGlyph";
import { CreditGate } from "@/components/tool/paid/CreditGate";
import { PaidRail } from "@/components/tool/paid/PaidRail";
import { AudioDropzone } from "@/components/tool/audio/AudioDropzone";
import { AudioFileMeta } from "@/components/tool/audio/AudioFileMeta";
import { AudioPlayer } from "@/components/tool/audio/AudioPlayer";
import { AudioRunCard } from "@/components/tool/audio/AudioRunCard";
import { MiniWaveform } from "@/components/tool/audio/MiniWaveform";
import { useAudioFile } from "@/components/tool/audio/useAudioFile";
import { fileFormatLabel } from "@/components/tool/audio/format";
import { VocalControls } from "./VocalControls";
import {
  DEFAULT_VOCAL_SETTINGS,
  STEMS,
  stemCredits,
  type VocalSettings,
} from "./model";

export function VocalRemoverStudio({ maxSizeMB = 50 }: { maxSizeMB?: number }) {
  const { item, error, dragging, inputRef, openPicker, onPick, onDragOver, onDragLeave, onDrop, clear } =
    useAudioFile({ maxSizeMB, maxDurationMin: 10 });
  const [settings, setSettings] = useState<VocalSettings>(DEFAULT_VOCAL_SETTINGS);
  const [gateOpen, setGateOpen] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const [solo, setSolo] = useState<string | null>(null);

  const credits = stemCredits(item?.duration ?? 0);
  const stems = STEMS[settings.mode];

  useEffect(() => {
    setSolo(null);
    setMuted([]);
  }, [settings.mode]);

  function patch(next: Partial<VocalSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function toggleMute(id: string) {
    setMuted((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  return (
    <section
      id="vocal-remover"
      aria-label="Vocal remover studio"
      className="scroll-mt-20 overflow-hidden rounded-[26px] border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#fdfdfc] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-white text-ink">
            <ToolGlyph path="/audio/vocal-remover" size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-ink">Stem studio</h2>
            <p className="mt-0.5 text-micro text-faint">Pull a track apart.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-medium text-[#a8432c]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />4 credits / min
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-muted">
            <Cloud size={10} aria-hidden />
            Cloud AI
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#eadfce] bg-[#fdf9f2] px-2.5 py-1 text-[10px] font-medium text-[#786344]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c48c4a]" aria-hidden />
            Interface preview
          </span>
        </div>
      </div>

      <div className="grid lg:h-[780px] lg:grid-cols-[minmax(0,1fr)_396px]">
        <div className="flex min-h-0 min-w-0 flex-col p-4 sm:p-5">
          {!item ? (
            <AudioDropzone
              title="Drop a track to separate"
              description="Songs, covers and recordings. Choose two stems for karaoke or four for a full remix session."
              buttonLabel="Choose audio"
              limits={`MP3, WAV, M4A or OGG · up to ${maxSizeMB} MB`}
              onChoose={() => openPicker()}
              dragging={dragging}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              chips={
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <AudioLines size={9} className="text-accent" aria-hidden />
                    Vocals + instrumental
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
                    <Layers3 size={9} aria-hidden />
                    Up to 4 stems
                  </span>
                </>
              }
            />
          ) : (
            <>
              <div className="rounded-[16px] border border-line bg-[#faf8f3] p-2.5">
                <AudioPlayer
                  src={item.url}
                  duration={item.duration}
                  peaks={item.peaks}
                  fileName={item.name}
                  formatLabel={fileFormatLabel(item.file)}
                />
              </div>

              <AudioFileMeta
                item={item}
                formatLabel={fileFormatLabel(item.file)}
                onReplace={() => openPicker()}
                onRemove={() => {
                  clear();
                  setMuted([]);
                  setSolo(null);
                }}
              />

              <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[16px] border border-line bg-[#fbfaf7] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-faint">
                    Stems · {stems.length}
                  </span>
                  <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[9px] text-faint">
                    Preview after run
                  </span>
                </div>

                {settings.mode === "two" ? (
                  <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                    {stems.map((stem) => (
                      <StemCard
                        key={stem.id}
                        stem={stem}
                        peaks={item.peaks}
                        wide
                        isMuted={muted.includes(stem.id)}
                        isSolo={solo === stem.id}
                        dimmed={(Boolean(solo) && solo !== stem.id) || muted.includes(stem.id)}
                        onMute={() => toggleMute(stem.id)}
                        onSolo={() =>
                          setSolo((current) => (current === stem.id ? null : stem.id))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 gap-2">
                    {stems.map((stem) => (
                      <StemCard
                        key={stem.id}
                        stem={stem}
                        peaks={item.peaks}
                        isMuted={muted.includes(stem.id)}
                        isSolo={solo === stem.id}
                        dimmed={(Boolean(solo) && solo !== stem.id) || muted.includes(stem.id)}
                        onMute={() => toggleMute(stem.id)}
                        onSolo={() =>
                          setSolo((current) => (current === stem.id ? null : stem.id))
                        }
                      />
                    ))}
                  </div>
                )}

                <p className="mt-2 px-1 text-[9px] leading-relaxed text-faint">
                  Mute and solo are saved with the job. Stems are generated when the AI run
                  finishes.
                </p>
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
            tabIndex={-1}
            aria-label="Choose a track to separate"
            className="sr-only"
            onChange={onPick}
          />

          {error && (
            <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-ui text-[#a13d30]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <PaidRail
          label="Stem settings"
          footer={
            <AudioRunCard
              cost={credits}
              verb="separate stems"
              ready={Boolean(item)}
              emptyLabel="Add a track to separate"
              onRun={() => setGateOpen(true)}
              note="4 credits per started minute, minimum 4. No credits are used until the run starts; failed runs are refunded."
            />
          }
        >
          <VocalControls settings={settings} onPatch={patch} />
        </PaidRail>
      </div>

      <CreditGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        action="separate this track"
        cost={credits}
      />
    </section>
  );
}

function StemCard({
  stem,
  peaks,
  wide = false,
  isMuted,
  isSolo,
  dimmed,
  onMute,
  onSolo,
}: {
  stem: { id: string; label: string; hint: string; seed: number; tone: "coral" | "sage" | "ink" };
  peaks: number[];
  wide?: boolean;
  isMuted: boolean;
  isSolo: boolean;
  dimmed: boolean;
  onMute: () => void;
  onSolo: () => void;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col justify-between rounded-[11px] border bg-white transition-opacity ${
        isSolo ? "border-ink" : "border-line"
      } ${dimmed ? "opacity-50" : ""} ${wide ? "flex-1 p-3.5" : "p-2.5"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stem.tone === "coral"
                  ? "bg-accent"
                  : stem.tone === "ink"
                    ? "bg-ink"
                    : "bg-[#8fae9f]"
              }`}
            />
            {stem.label}
          </span>
          <span className="mt-0.5 block text-[8.5px] text-faint">{stem.hint}</span>
        </div>
        <div className="flex items-center gap-1">
          <StemButton label={isMuted ? `Unmute ${stem.label}` : `Mute ${stem.label}`} active={isMuted} onClick={onMute} variant="ink">
            M
          </StemButton>
          <StemButton label={isSolo ? `Unsolo ${stem.label}` : `Solo ${stem.label}`} active={isSolo} onClick={onSolo} variant="accent">
            S
          </StemButton>
        </div>
      </div>

      <div className={wide ? "my-2" : "mt-2"}>
        <MiniWaveform
          peaks={peaks}
          bars={wide ? 56 : 30}
          height={wide ? 54 : 26}
          progress={0.4 + (stem.seed % 5) * 0.08}
          seed={stem.seed}
          tone={stem.tone}
        />
      </div>

      <div className="flex items-center justify-between text-[8px] text-faint">
        <span>after run</span>
        <span className="rounded-full border border-line px-1.5 py-0.5 text-[7.5px]">stem</span>
      </div>
    </div>
  );
}

function StemButton({
  children,
  label,
  active,
  onClick,
  variant,
}: {
  children: string;
  label: string;
  active: boolean;
  onClick: () => void;
  variant: "ink" | "accent";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`grid h-6 w-6 place-items-center rounded-[5px] border text-[8.5px] font-semibold transition-colors ${
        active
          ? variant === "accent"
            ? "border-accent bg-accent text-white"
            : "border-ink bg-ink text-white"
          : "border-line bg-white text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
