"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

type DottedGlowBackgroundProps = {
  className?: string;
  gap?: number;
  radius?: number;
  color?: string;
  glowColor?: string;
  opacity?: number;
  speed?: number;
};

/**
 * Aceternity UI · DottedGlowBackground (compact adaptation).
 * Canvas dots with slow glow pulses; static frame when motion is reduced.
 */
export function DottedGlowBackground({
  className,
  gap = 20,
  radius = 1.1,
  color = "rgba(15,15,16,0.20)",
  glowColor = "rgba(229,94,64,0.75)",
  opacity = 0.8,
  speed = 0.6,
}: DottedGlowBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let columns = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let frame = 0;
    const phases: number[] = [];

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      columns = Math.ceil(width / gap) + 1;
      rows = Math.ceil(height / gap) + 1;
      phases.length = 0;
      for (let index = 0; index < columns * rows; index += 1) {
        phases.push(((index * 37) % 100) / 100);
      }
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          const x = column * gap;
          const y = row * gap;
          const pulse = reducedMotion
            ? 0.35
            : (Math.sin(time * 0.0006 * speed + phases[index] * Math.PI * 2) + 1) / 2;

          if (pulse > 0.72) {
            context.beginPath();
            context.fillStyle = glowColor.replace(/[\d.]+\)$/, `${0.22 + (pulse - 0.72) * 0.9})`);
            context.arc(x, y, radius * 2.1, 0, Math.PI * 2);
            context.fill();
          }

          context.beginPath();
          context.fillStyle = color;
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [gap, radius, color, glowColor, speed, reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ opacity }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
