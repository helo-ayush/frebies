"use client";

import { ArrowRightGlyph, LockGlyph } from "@/components/icons/NavGlyph";

export function PaidRunCard({
  cost,
  verb,
  ready,
  guest = true,
  onRun,
  note,
  emptyLabel = "Add an image to run",
}: {
  cost: number;
  verb: string;
  ready: boolean;
  guest?: boolean;
  onRun: () => void;
  note?: string;
  emptyLabel?: string;
}) {
  const credits = `${cost} ${cost === 1 ? "credit" : "credits"}`;

  return (
    <div className="rounded-[14px] border border-[#2a2a2e] bg-[#131315] p-4 text-white shadow-[0_18px_38px_rgba(15,15,16,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/45">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          AI run
        </span>
        <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/75">
          {credits}
        </span>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={!ready}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-white text-[12.5px] font-medium text-ink transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
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

      <p className="mt-2.5 text-[10px] leading-relaxed text-white/45">
        {note ?? "No credits are used until the run starts. Failed runs are refunded."}
      </p>

      <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5 text-[9px] text-white/35">
        <span>New accounts get 25 free credits</span>
        <span>Files deleted in 1h</span>
      </div>
    </div>
  );
}
