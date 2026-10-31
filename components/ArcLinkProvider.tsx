"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArcProvider, type ArcLinkComponent } from "@/components/arc/lib/arc-provider";

/** Routes Arc component links through Next so internal navigation stays client side. */
export function ArcLinkProvider({ children }: { children: ReactNode }) {
  return <ArcProvider link={Link as unknown as ArcLinkComponent}>{children}</ArcProvider>;
}
