"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Check, Download, ImagePlus, Sparkles } from "lucide-react";

const STEPS = [
  {
    title: "Drop your files",
    copy: "Open a tool and drop files straight in. There is no sign-up wall and nothing to install.",
  },
  {
    title: "Tune what matters",
    copy: "Pick a format, a size or a page range. You see the result update before you commit to it.",
  },
  {
    title: "Download and go",
    copy: "One button, one file or a ZIP of the batch. No watermark and no waiting in a queue.",
  },
] as const;

const FILES = [
  { name: "beach.heic", tone: "#e55e40", from: { x: -260, y: -170, r: -24 }, to: { x: -86, y: 6, r: -9 } },
  { name: "invoice.png", tone: "#e89a1c", from: { x: 40, y: -250, r: 14 }, to: { x: 0, y: -8, r: 2 } },
  { name: "team.jpg", tone: "#1f9d8b", from: { x: 300, y: -140, r: 30 }, to: { x: 86, y: 8, r: 10 } },
];

function FlyingFile({
  progress,
  file,
  index,
  compact,
}: {
  progress: MotionValue<number>;
  file: (typeof FILES)[number];
  index: number;
  /** Phone-sized mock: shorter travel and smaller tiles. */
  compact: boolean;
}) {
  const start = 0.03 + index * 0.05;
  const end = start + 0.16;
  const k = compact ? 0.5 : 1;
  const x = useTransform(progress, [start, end], [file.from.x * k, file.to.x * k], { clamp: true });
  const y = useTransform(progress, [start, end], [file.from.y * k, file.to.y * k], { clamp: true });
  const rotate = useTransform(progress, [start, end], [file.from.r, file.to.r], { clamp: true });
  const opacity = useTransform(progress, [start, start + 0.04, 0.3, 0.36], [0, 1, 1, 0]);

  return (
    <motion.div
      style={{ x, y, rotate, opacity }}
      className={`absolute left-1/2 top-1/2 rounded-[12px] border border-white bg-white shadow-[0_18px_34px_-14px_rgba(15,15,16,0.4)] ${
        compact ? "-ml-[27px] -mt-[36px] w-[54px] p-1" : "-ml-[46px] -mt-[58px] w-[92px] p-2"
      }`}
    >
      <div
        className={`rounded-[7px] ${compact ? "h-[38px]" : "h-[62px]"}`}
        style={{ background: `linear-gradient(150deg, ${file.tone}33, ${file.tone})` }}
      />
      <p className={`truncate font-semibold text-ink ${compact ? "mt-1 text-[11px] leading-tight" : "mt-1.5 text-[11px]"}`}>
        {file.name}
      </p>
    </motion.div>
  );
}

/** The product, miniaturised. Everything in it is driven by the page scroll. */
function StudioMock({
  progress,
  step,
  compact,
}: {
  progress: MotionValue<number>;
  step: number;
  compact: boolean;
}) {
  const dropOpacity = useTransform(progress, [0.28, 0.36], [1, 0]);
  const previewOpacity = useTransform(progress, [0.3, 0.4], [0, 1]);
  const previewScale = useTransform(progress, [0.3, 0.42], [0.94, 1]);
  const knob = useTransform(progress, [0.38, 0.62], [94, 58], { clamp: true });
  const knobLeft = useTransform(knob, (value) => `${value}%`);
  const fill = useTransform(knob, (value) => `${value}%`);
  const sizeLabel = useTransform(progress, [0.38, 0.62], [4.2, 1.3], { clamp: true });
  const sizeText = useTransform(sizeLabel, (value) => `${value.toFixed(1)} MB`);
  const savedText = useTransform(sizeLabel, (value) => `−${Math.round((1 - value / 4.2) * 100)}%`);
  const formatX = useTransform(progress, [0.4, 0.5], ["0%", "200%"], { clamp: true });
  const resultY = useTransform(progress, [0.66, 0.76], [28, 0], { clamp: true });
  const resultOpacity = useTransform(progress, [0.66, 0.74], [0, 1]);
  const sparkle = useTransform(progress, [0.7, 0.82], [0, 1], { clamp: true });

  return (
    <div className="overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_60px_120px_-50px_rgba(15,15,16,0.45)]">
      {/* window chrome */}
      <div className="flex h-11 items-center gap-2 border-b border-line bg-[#fcfbf9] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e9e5dc]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e9e5dc]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e9e5dc]" />
        <span className="ml-3 flex h-6 flex-1 items-center rounded-full bg-card px-3 text-[11.5px] text-faint">
          frebies  ›  image  ›  compress
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_38%]">
        {/* stage */}
        <div className="relative aspect-[1/0.95] bg-paper p-3 sm:aspect-[1/0.86]">
          <motion.div
            style={{ opacity: dropOpacity }}
            className="absolute inset-3 flex flex-col items-center justify-center rounded-[16px] border-[1.5px] border-dashed border-[#d6d1c6] bg-white text-center"
          >
            <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-ink text-white sm:h-12 sm:w-12">
              <ImagePlus size={19} aria-hidden />
            </span>
            <p className="mt-3 px-2 font-display text-[14px] font-semibold tracking-[-0.02em] text-ink sm:text-[17px]">
              Drop your images here
            </p>
            <span className="mt-3 rounded-full bg-[linear-gradient(180deg,#e9623f,#cf4a2c)] px-4 py-1.5 text-[12px] font-semibold text-white">
              Choose images
            </span>
          </motion.div>

          {FILES.map((file, index) => (
            <FlyingFile key={file.name} progress={progress} file={file} index={index} compact={compact} />
          ))}

          <motion.div
            style={{ opacity: previewOpacity, scale: previewScale }}
            className="absolute inset-3 overflow-hidden rounded-[16px] border border-line"
          >
            <div className="absolute inset-0 bg-[linear-gradient(170deg,#fde3c4_0%,#f6b78d_46%,#e55e40_47%,#8d3520_100%)]" />
            <div className="absolute right-[18%] top-[16%] h-[18%] w-[18%] rounded-full bg-[#fff4dd] [aspect-ratio:1]" />
            <div className="absolute bottom-0 left-0 h-[46%] w-[58%] bg-[#22342d] [clip-path:polygon(0_100%,38%_18%,62%_56%,82%_32%,100%_100%)]" />
            <div className="absolute left-2.5 top-2.5 flex gap-1.5">
              <span className="rounded-md bg-black/65 px-2 py-1 text-[11px] font-semibold text-white">3 images</span>
              <motion.span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold tabular-nums text-ink">
                {sizeText}
              </motion.span>
            </div>
          </motion.div>

          <motion.div
            style={{ y: resultY, opacity: resultOpacity }}
            className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-[14px] border border-[#cfe6d8] bg-success-soft px-2.5 py-2 shadow-pop sm:inset-x-5 sm:bottom-5 sm:gap-2.5 sm:px-3 sm:py-2.5"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success text-white">
              <Check size={15} strokeWidth={3} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-ink">3 images ready</span>
              <span className="block text-[11.5px] text-[#3f6b54]">3.9 MB · saved 69%</span>
            </span>
            <motion.span style={{ scale: sparkle, opacity: sparkle }} className="ml-auto text-success">
              <Sparkles size={18} aria-hidden />
            </motion.span>
          </motion.div>
        </div>

        {/* rail */}
        <div className="flex flex-col border-l border-line bg-white">
          <div className="border-b border-line p-3">
            <div className="relative h-10 overflow-hidden rounded-[12px]">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={step}
                  initial={{ y: 22, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -22, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`absolute inset-0 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] text-[12.5px] font-semibold ${
                    step === 0
                      ? "bg-[#e9e6df] text-[#9a958b]"
                      : step === 1
                        ? "bg-[linear-gradient(180deg,#e9623f,#cf4a2c)] text-white shadow-cta"
                        : "bg-[linear-gradient(180deg,#27906a,#1f7a4d)] text-white"
                  }`}
                >
                  {step === 2 && <Download size={14} aria-hidden />}
                  {step === 0 ? "Compress" : step === 1 ? (compact ? "Compress 3" : "Compress 3 images") : compact ? "Download" : "Download ZIP"}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="space-y-4 p-3">
            <div>
              <p className="text-[12px] font-semibold text-ink">Format</p>
              <div className="relative mt-1.5 grid grid-cols-3 rounded-[10px] bg-card p-1 text-center text-[11.5px] font-medium text-muted">
                <motion.span
                  style={{ x: formatX }}
                  className="absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/3)] rounded-[7px] bg-white shadow-[0_1px_2px_rgba(15,15,16,0.14)]"
                />
                <span className="relative py-1.5">JPG</span>
                <span className="relative py-1.5">PNG</span>
                <span className="relative py-1.5">WebP</span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-semibold text-ink">Quality</p>
                <motion.span className="text-[11.5px] font-semibold tabular-nums text-success">{savedText}</motion.span>
              </div>
              <div className="relative mt-3 h-1 rounded-full bg-[#e9e6df]">
                <motion.span style={{ width: fill }} className="absolute inset-y-0 left-0 rounded-full bg-ink" />
                <motion.span
                  style={{ left: knobLeft }}
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-white shadow"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {[72, 54, 64].map((width, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="h-3 w-5 rounded-full bg-[#e9e6df]" />
                  <span className="h-2 rounded-full bg-[#efece6]" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pinned section: the page stops, and scrolling plays the product through
 * drop → tune → download while a tilted studio window settles flat.
 */
export function ScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    setStep(value < 0.34 ? 0 : value < 0.66 ? 1 : 2);
  });

  const rotateX = useTransform(progress, [0, 0.5, 1], [14, 4, 0]);
  const rotateY = useTransform(progress, [0, 0.5, 1], [-18, -6, 0]);
  const rotateZ = useTransform(progress, [0, 1], [3, 0]);
  const lift = useTransform(progress, [0, 1], [30, 0]);
  const railFill = useTransform(progress, [0, 1], ["0%", "100%"]);
  const haloX = useTransform(progress, [0, 1], ["-70%", "-30%"]);

  return (
    <section id="how" ref={ref} className="relative h-[330vh] scroll-mt-0">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-clip">
        <motion.div
          aria-hidden
          style={{ x: haloX, y: "-50%" }}
          className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[900px] rounded-full bg-[radial-gradient(ellipse,rgba(253,168,43,0.16),transparent_62%)]"
        />

        <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-8 px-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent-deep">How it works</p>
            <h2 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-ink">
              Open a tool.
              <br />
              Be done in a minute.
            </h2>

            {/* Desktop: all three steps with a progress rail */}
            <ol className="relative mt-9 hidden space-y-1 lg:block">
              <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-line" />
              <motion.span
                aria-hidden
                style={{ height: railFill }}
                className="absolute left-[15px] top-3 w-px origin-top bg-accent"
              />
              {STEPS.map((item, index) => {
                const active = step === index;
                const done = step > index;
                return (
                  <li
                    key={item.title}
                    className={`relative flex gap-4 rounded-2xl py-3 pr-4 transition-opacity duration-500 ${
                      active ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <span
                      className={`relative z-10 grid h-[31px] w-[31px] shrink-0 place-items-center rounded-full border text-[13px] font-semibold transition-colors duration-500 ${
                        active
                          ? "border-ink bg-ink text-white"
                          : done
                            ? "border-accent bg-accent text-white"
                            : "border-line bg-white text-muted"
                      }`}
                    >
                      {done ? <Check size={14} strokeWidth={3} aria-hidden /> : index + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-[21px] font-semibold tracking-[-0.025em] text-ink">
                        {item.title}
                      </h3>
                      <p className="mt-1 max-w-[380px] text-[15px] leading-relaxed text-muted">{item.copy}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Mobile: only the current step */}
            <div className="mt-5 min-h-[104px] lg:hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-[13px] font-semibold text-accent-deep">Step {step + 1} of 3</p>
                  <h3 className="mt-1 font-display text-[21px] font-semibold tracking-[-0.025em] text-ink">
                    {STEPS[step].title}
                  </h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">{STEPS[step].copy}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="[perspective:1600px]">
            <motion.div
              style={{ rotateX, rotateY, rotateZ, y: lift, transformStyle: "preserve-3d" }}
              className="mx-auto w-full max-w-[680px] will-change-transform"
            >
              <StudioMock progress={progress} step={step} compact={compact} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
