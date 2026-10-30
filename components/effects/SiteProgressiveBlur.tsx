"use client";

import { useEffect, useState } from "react";

import { ProgressiveBlur } from "@/components/magicui/progressive-blur";

/**
 * Progressive blur along the bottom edge of the viewport.
 *
 * Place one instance per layout so it can respect that layout's chrome: the
 * workbench instance starts after the sidebar, while marketing pages use the
 * full width. It fades out at the end of the page so footers stay readable.
 */
export function SiteProgressiveBlur({ className = "" }: { className?: string }) {
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const documentElement = document.documentElement;
      const remaining =
        documentElement.scrollHeight - window.innerHeight - window.scrollY;
      setAtEnd(remaining < 120);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(document.body);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 h-16 transition-opacity duration-300 motion-reduce:transition-none sm:h-[76px] ${className}`}
      style={{ opacity: atEnd ? 0 : 1 }}
    >
      <ProgressiveBlur
        position="bottom"
        height="100%"
        blurLevels={[0.5, 1, 1.5, 2, 3, 4, 6, 8]}
      />
    </div>
  );
}
