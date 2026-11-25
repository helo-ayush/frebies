"use client";

import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightGlyph, LockGlyph } from "@/components/icons/NavGlyph";

/** Run button for the paid audio tools: what it costs, then one loud action. */
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
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">Cost</span>
        <span className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 text-[12px] font-medium tabular-nums text-accent-deep">
          {credits}
          {unit ? <span className="ml-1 font-normal">{unit}</span> : null}
        </span>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={!ready}
        className={buttonClasses("accent", "xl", "w-full px-4")}
      >
        {!ready ? (
          emptyLabel
        ) : (
          <>
            {guest && <LockGlyph size={13} />}
            <span className="truncate">
              Sign in to {verb} · {credits}
            </span>
            <ArrowRightGlyph size={14} />
          </>
        )}
      </button>

      <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
        {note ?? "No credits are used until the run starts. Failed runs are refunded."}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
        New accounts get 25 free credits. Uploaded files are deleted within 1 hour.
      </p>
    </div>
  );
}
