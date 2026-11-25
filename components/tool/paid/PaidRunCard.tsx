"use client";

import type { ReactNode } from "react";
import { LockGlyph } from "@/components/icons/NavGlyph";
import { Note, PrimaryAction } from "@/components/tool/kit";

/**
 * Primary action of a credit-based studio. Sits in the rail's action slot, so
 * it docks to the top of the rail on desktop and the bottom of the screen on
 * phones. The cost is part of the label: no separate price pills.
 */
export function PaidRunCard({
  cost,
  verb,
  ready,
  guest = true,
  onRun,
  hint,
  emptyLabel = "Add a file to run",
}: {
  cost: number;
  /** Lower-case action, e.g. "extract text". */
  verb: string;
  ready: boolean;
  guest?: boolean;
  onRun: () => void;
  /** One short line under the button. Defaults to the price per run. */
  hint?: ReactNode;
  emptyLabel?: string;
}) {
  const credits = `${cost} ${cost === 1 ? "credit" : "credits"}`;
  const action = guest ? `Sign in to ${verb}` : verb.charAt(0).toUpperCase() + verb.slice(1);

  return (
    <PrimaryAction
      tone="accent"
      label={ready ? `${action} · ${credits}` : emptyLabel}
      icon={ready && guest ? <LockGlyph size={14} /> : undefined}
      disabled={!ready}
      onClick={onRun}
      hint={hint ?? `${credits} per run · new accounts get 25 free`}
      className="[&_button]:px-4"
    />
  );
}

/**
 * The one status line of a studio whose engine is not wired up yet. Render it
 * once, as the first thing in the rail, directly under the action.
 */
export function NotConnectedNote({ children }: { children?: ReactNode }) {
  return (
    <Note tone="warn">
      {children ??
        "This tool is not connected yet. You can try the controls, but nothing is processed and no credits are used."}
    </Note>
  );
}
