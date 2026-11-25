"use client";

import { PrimaryAction } from "@/components/tool/kit";

/**
 * Run button of a studio whose engine is not wired up yet. It says so and asks
 * for nothing: no account, no upload, no credits.
 */
export function PreviewAction() {
  return (
    <PrimaryAction
      label="Not connected yet"
      disabled
      hint="A preview. Nothing is uploaded, no credits are used."
    />
  );
}
