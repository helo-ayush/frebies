"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { mountHeroFigure } from "./figure-runtime";

export function HeroFigureMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current?.firstElementChild;
    if (!stage) return;
    return mountHeroFigure(stage);
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
