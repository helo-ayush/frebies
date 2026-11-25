"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { dropHeldFile, readHeldFile } from "@/lib/held-file";

/**
 * Puts the file (and settings) a guest left behind at the sign-in gate back on
 * the stage. `file` is what the tool has loaded now.
 */
export function useHeldFile(file: File | null, restore: (file: File, settings: unknown) => void) {
  const pathname = usePathname();
  const latest = useRef({ file, restore });
  latest.current = { file, restore };
  const had = useRef(false);

  useEffect(() => {
    let off = false;
    void readHeldFile(pathname).then((held) => {
      if (off || !held) return;
      void dropHeldFile(pathname);
      if (!latest.current.file) latest.current.restore(held.file, held.settings);
    });
    return () => {
      off = true;
    };
  }, [pathname]);

  // Taking the file off the stage means it is not wanted later either.
  useEffect(() => {
    if (file) {
      had.current = true;
    } else if (had.current) {
      had.current = false;
      void dropHeldFile(pathname);
    }
  }, [file, pathname]);
}
