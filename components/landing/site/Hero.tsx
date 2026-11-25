"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { tools } from "@/lib/registry/tools";
import { Arrow, EASE, MaskLines, Sq } from "@/components/site/kit";
import { ToolSearch } from "@/components/site/ToolSearch";

const MachineHero = dynamic(() => import("@/components/site/MachineCanvas").then((module) => module.MachineHero), { ssr: false });

const freeCount = tools.filter((tool) => tool.tier === "free").length;

const FORMATS = [
  "JPG", "PNG", "WEBP", "AVIF", "HEIC", "SVG", "PDF", "TIFF", "GIF", "ICO",
  "MP3", "WAV", "M4A", "OGG", "MP4", "MOV", "WEBM", "SRT",
];

/** Where the track moves within the pinned scroll. */
const MOVE_FROM = 0.07;
const MOVE_TO = 0.74;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - Math.pow(1 - value, 3);
const easeInOut = (value: number) => (value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2);
const travel = (p: number) => easeInOut(clamp01((p - MOVE_FROM) / (MOVE_TO - MOVE_FROM)));

/**
 * The band behind the machine. Coral pages fill in cell by cell, close up into
 * one solid sheet that carries the page sideways, then peel away from the right
 * to uncover the statement underneath.
 */
function drawBand(
  canvas: HTMLCanvasElement,
  title: HTMLElement | null,
  p: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (W === 0 || H === 0) return;
  if (canvas.width !== Math.round(W * ratio) || canvas.height !== Math.round(H * ratio)) {
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const phone = W < 768;
  const shift = -W * travel(p);
  const pitch = phone ? Math.max(44, W * 0.15) : Math.max(64, W * 0.066);
  const slant = H * 0.82;
  const start = phone ? W * 0.5 : W * 0.6;
  const cells = Math.ceil((W * 1.82 - start) / pitch);
  const line = "rgba(24,24,27,0.2)";

  // Technical grid the files ride in on, and the one they land on.
  const cell = H / 3;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = cell * 0.4; x < start + slant * 0.5; x += cell) {
    const sx = Math.round(x + shift) + 0.5;
    if (sx < -1 || sx > W + 1) continue;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
  }
  for (let x = W * (phone ? 1.55 : 1.8); x < W * 2; x += cell) {
    const sx = Math.round(x + shift) + 0.5;
    if (sx < -1 || sx > W + 1) continue;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
  }
  for (const row of [1, 2]) {
    const y = Math.round(row * cell) + 0.5;
    ctx.moveTo(Math.max(0, shift), y);
    ctx.lineTo(start + slant * 0.5 + shift, y);
    ctx.moveTo(W * (phone ? 1.55 : 1.8) + shift, y);
    ctx.lineTo(W * 2 + shift, y);
  }
  ctx.stroke();

  const slab = (left: number, width: number) => {
    ctx.beginPath();
    ctx.moveTo(left + slant, 0);
    ctx.lineTo(left + slant + width, 0);
    ctx.lineTo(left + width, H);
    ctx.lineTo(left, H);
    ctx.closePath();
  };

  let front = 0;
  for (let index = 0; index < cells; index += 1) {
    const track = start + index * pitch;
    const left = track + shift;

    // Outlined pages, only on the first panel and at the left edge of the second.
    const outlined = track < W * 0.96 || (track > W * 1.0 && track < W * 1.12);
    if (outlined && left > -slant - pitch && left < W) {
      slab(left, pitch * 0.5);
      ctx.strokeStyle = line;
      ctx.stroke();
    }

    const grow = easeOut(clamp01((p - (0.045 + index * 0.0165)) / 0.12));
    const peel = easeInOut(clamp01((p - (0.5 + (cells - 1 - index) * 0.0135)) / 0.16));
    if (grow > 0) front = Math.max(front, track + pitch * grow);
    const width = pitch * grow * (1 - peel);
    if (width > 0.4 && left > -slant - pitch && left < W + slant) {
      slab(left - 0.4, width + 0.8);
      ctx.fillStyle = "#f2552c";
      ctx.fill();
    }
  }

  // The statement only exists where the coral has already been.
  if (title) {
    const edge = front - (W + title.offsetLeft);
    title.style.clipPath =
      p > 0.5
        ? "none"
        : `polygon(-40px -30%, ${edge + slant}px -30%, ${edge}px 130%, -40px 130%)`;
  }
}

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressRef = useRef(0);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 190, damping: 34, mass: 0.35 });
  const x = useTransform(progress, (value) => `${-100 * travel(value)}vw`);
  const machineX = useTransform(progress, (value) => `${-118 * travel(value)}vw`);
  const copyY = useTransform(progress, [0.44, 0.66], ["110%", "0%"]);
  const lowerY = useTransform(progress, [0.5, 0.74], [46, 0]);
  const lowerOpacity = useTransform(progress, [0.5, 0.68], [0, 1]);

  const paint = useCallback((value: number) => {
    progressRef.current = travel(value);
    if (canvasRef.current) drawBand(canvasRef.current, titleRef.current, value);
  }, []);

  useMotionValueEvent(progress, "change", paint);

  useEffect(() => {
    const redraw = () => paint(progress.get());
    redraw();
    const node = canvasRef.current;
    if (!node) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(node);
    return () => observer.disconnect();
  }, [paint, progress]);

  const headline = "fb-wide text-[11.2vw] md:text-[min(7.1vw,11svh)]";

  return (
    <section ref={sectionRef} aria-label="Introduction" className={reduce ? "relative h-[200svh]" : "relative h-[360vh]"}>
      <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-clip">
        {/* Band frame stays put while everything slides over it */}
        <div aria-hidden className="absolute inset-x-0 top-[46%] h-[18%] border-y border-[var(--fb-line-strong)]" />

        <motion.div style={{ x }} className="absolute inset-y-0 left-0 flex w-[200vw]">
          {/* ---------- Panel A ---------- */}
          <div className="relative h-full w-screen shrink-0">
            <span aria-hidden className="absolute bottom-0 left-[31%] top-0 hidden w-px bg-[var(--fb-line)] md:block" />
            <span aria-hidden className="absolute bottom-0 left-[83%] top-0 hidden w-px bg-[var(--fb-line)] md:block" />

            <h1 className="sr-only">Every tool you need, mostly free.</h1>
            <div aria-hidden className="absolute left-[var(--fb-pad)] top-[calc(var(--fb-nav)+2svh)]">
              <MaskLines immediate delay={0.1} className={headline} lines={["Every tool", "you need,"]} />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.55 }}
              className="absolute left-[68%] top-[calc(var(--fb-nav)+4.4svh)] hidden w-[27%] md:block lg:left-[calc(83%+20px)] lg:w-[calc(17%-20px-var(--fb-pad))]"
            >
              <Sq />
              <p className="mt-4 text-[14px] uppercase leading-[1.35] lg:text-[15px]">
                Convert, compress, merge and trim. {tools.length} tools, {freeCount} of them free, most running right in your browser.
              </p>
            </motion.div>

            <div aria-hidden className="absolute bottom-[calc(88px+1svh)] right-[var(--fb-pad)] md:bottom-[8svh] md:left-[59%] md:right-auto">
              <MaskLines
                immediate
                delay={0.24}
                className={`${headline} max-md:text-right`}
                lines={["Mostly", <span key="free">free<span className="text-[var(--fb-coral)]">.</span></span>]}
              />
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1, delay: 0.7, ease: EASE }}
                style={{ originX: 0 }}
                className="mt-5 hidden items-center md:flex"
              >
                <span className="fb-sq" />
                <span className="h-px flex-1 bg-[var(--fb-line-strong)]" />
                <span className="fb-label pl-4">Keep scrolling //</span>
              </motion.div>
            </div>

            <ToolSearch
              hotkey
              className="!absolute bottom-0 left-0 z-10 w-full border-t border-[var(--fb-line)] md:h-[12svh] md:w-[31%]"
            />
          </div>

          {/* ---------- Panel B ---------- */}
          <div className="relative h-full w-screen shrink-0">
            <span aria-hidden className="absolute bottom-0 left-[18%] top-0 hidden w-px bg-[var(--fb-line)] md:block" />
            <span aria-hidden className="absolute bottom-0 left-[82%] top-0 hidden w-px bg-[var(--fb-line)] md:block" />

            <div className="absolute bottom-[calc(54%+4svh)] left-[var(--fb-pad)] right-[var(--fb-pad)] overflow-hidden md:left-[calc(18%+18px)] md:right-auto md:w-[clamp(320px,31vw,470px)]">
              <motion.div style={{ y: copyY }} className="fb-body space-y-4">
                <p>
                  Most file sites ask you to send the file to them. You wait for the upload, wait in a queue, then
                  wait for the download.
                </p>
                <p>
                  Frebies sends the tool to you instead. It loads with the page and does the work on your own device.
                </p>
              </motion.div>
            </div>

            <div className="absolute left-[calc(82%-96px)] top-[calc(var(--fb-nav)+9svh)] hidden w-[84px] text-right lg:block">
              <p className="fb-label">Runs in your browser</p>
            </div>
            <span aria-hidden className="fb-sq absolute left-[calc(82%-6px)] top-[calc(var(--fb-nav)+9svh+2px)] hidden lg:block" />

            <div className="absolute inset-x-0 top-[46%] flex h-[18%] items-center">
              <h2
                ref={titleRef}
                className="fb-wide ml-[var(--fb-pad)] text-[7.5vw] md:ml-[calc(18%+18px)] md:text-[min(4.9vw,7.6svh)]"
              >
                The tool comes
                <br />
                to your file
              </h2>
            </div>

            <motion.div
              style={{ y: lowerY, opacity: lowerOpacity }}
              className="absolute bottom-0 left-0 right-0 top-[64%] flex flex-col justify-end md:left-[18%] md:right-[18%]"
            >
              <div className="flex items-center gap-3 px-[var(--fb-pad)] md:px-[18px]">
                <span className="fb-sq" aria-hidden />
                <p className="fb-label">Reads and writes //</p>
              </div>
              <div className="fb-marquee-wrap mt-[2svh] overflow-hidden py-[1.5svh] [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
                <div className="fb-marquee flex w-max items-center">
                  {[...FORMATS, ...FORMATS].map((format, index) => (
                    <span key={index} aria-hidden={index >= FORMATS.length} className="fb-wide px-6 text-[clamp(20px,2.1vw,34px)] md:px-9">
                      {format}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-[2svh] flex min-h-[74px] flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-[var(--fb-panel)] px-[var(--fb-pad)] py-4 md:px-6">
                <Link href="/dashboard" className="fb-link">
                  Browse all {tools.length} tools
                  <Arrow />
                </Link>
                <p className="fb-label">No account / no watermark / no install</p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-[46%] h-[18%] w-full" />

        <motion.div
          style={{ x: machineX }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.35 }}
          className="pointer-events-none absolute inset-0"
        >
          <MachineHero progressRef={progressRef} className="absolute inset-0" />
        </motion.div>
      </div>
    </section>
  );
}
