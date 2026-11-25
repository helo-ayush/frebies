"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IsoBlock } from "@/components/site/blocks";
import { buttonClasses } from "@/components/ui/Button";

/** Shown inside the shell when a page or tool throws, so the index and search stay usable. */
export default function WorkbenchError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[calc(100dvh-var(--fb-bar))] lg:grid-cols-[minmax(0,1fr)_minmax(320px,36%)]">
      <div className="flex flex-col justify-center px-[var(--fb-pad)] py-12">
        <p className="text-[14px] uppercase text-muted">[error // stopped]</p>
        <h1 className="fb-wide mt-5 text-[clamp(38px,5.6vw,92px)]">
          This one
          <br />
          jammed.
        </h1>
        <p className="mt-6 max-w-[460px] text-[16px] leading-[1.5] text-muted">
          Something in this page stopped working. Files you had open stayed on your device.
        </p>
        <div className="mt-8 flex max-w-[460px] flex-wrap gap-2.5">
          <button type="button" onClick={() => retry()} className="fb-run !w-auto min-w-[220px] flex-1">
            <span className="fb-run-icon">
              <svg aria-hidden width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 1.5v3h3" />
              </svg>
            </span>
            <span className="fb-run-label">Try again</span>
          </button>
          <Link href="/dashboard" className={buttonClasses("secondary", "lg", "!h-[56px] flex-1")}>
            All tools
          </Link>
        </div>
      </div>
      <div className="fb-stage fb-corners relative grid min-h-[280px] place-items-center border-line max-lg:border-t lg:border-l">
        <IsoBlock label={["JAM"]} open lift={64} className="h-[min(44vh,380px)] w-auto" />
      </div>
    </div>
  );
}
