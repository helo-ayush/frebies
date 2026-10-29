"use client";

import { ArrowRightGlyph, LockGlyph } from "@/components/icons/NavGlyph";

export function AudioRunCard({
  cost,
  verb,
  unit,
  ready,
  guest = true,
  onRun,
  note,
  emptyLabel = "Add a file to run",
}: {
  cost: number;
  verb: string;
  unit?: string;
  ready: boolean;
  guest?: boolean;
  onRun: () => void;
  note?: string;
  emptyLabel?: string;
}) {
  const credits = `${cost} ${cost === 1 ? "credit" : "credits"}`;

  return (
    <div className="rounded-[14px] border border-[#eadfd5] bg-[#fffdfa] p-4 shadow-[0_10px_24px_rgba(80,50,30,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          AI audio run
        </span>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-[#a8432c]">
          {credits}
          {unit ? <span className="font-normal"> {unit}</span> : null}
        </span>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={!ready}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-ink text-[12.5px] font-medium text-white transition-colors hover:bg-[#2a2a2b] disabled:pointer-events-none disabled:opacity-40"
      >
        {!ready ? (
          emptyLabel
        ) : (
          <>
            {guest && <LockGlyph size={12} />}
            Sign in to {verb} · {credits}
            <ArrowRightGlyph size={13} />
          </>
        )}
      </button>

      <p className="mt-2.5 text-[10px] leading-relaxed text-muted">
        {note ?? "No credits are used until the run starts. Failed runs are refunded."}
      </p>

      <div className="mt-2.5 flex items-center justify-between border-t border-line-soft pt-2.5 text-[9px] text-faint">
        <span>New accounts get 25 free credits</span>
        <span>Files deleted in 1h</span>
      </div>
    </div>
  );
}

