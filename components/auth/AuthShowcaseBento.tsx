"use client";

import type { ReactNode } from "react";
import { AudioWaveform, Lock, Sparkles, Wand2 } from "lucide-react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { CometCard } from "@/components/aceternity/comet-card";
import { BlurFade } from "@/components/magicui/blur-fade";
import { BorderBeam } from "@/components/magicui/border-beam";

const WAVE_BARS = [0.42, 0.78, 0.55, 0.96, 0.68, 0.84, 0.48, 0.9, 0.62];

const CAPABILITY_CHIPS = [
  "Neural TTS · 23 Voices",
  "4× Image Upscaler",
  "Document OCR",
  "Vocal Remover",
];

function HoverGlassTile({ children }: { children: ReactNode }) {
  const mouseX = useMotionValue(-120);
  const mouseY = useMotionValue(-120);
  const spotlight = useMotionTemplate`radial-gradient(160px circle at ${mouseX}px ${mouseY}px, rgba(255, 175, 115, 0.24), transparent 72%)`;

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      onMouseLeave={() => {
        mouseX.set(-160);
        mouseY.set(-160);
      }}
      className="auth-glass-tile group/tile relative overflow-hidden rounded-[18px] border border-white/85 p-3.5 hover:border-white"
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100"
        style={{ background: spotlight }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

export function AuthShowcaseBento({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";

  return (
    <section className="space-y-4 sm:space-y-5">
      <BlurFade delay={0.05} duration={0.45} offset={8}>
        <h1 className="max-w-[490px] font-display text-[34px] font-semibold leading-[1.03] tracking-[-0.04em] text-ink sm:text-[42px] lg:text-[44px]">
          {isSignUp ? (
            <>
              Craft audio, visuals{" "}
              <span className="bg-gradient-to-r from-[#0f0f10] via-[#b84628] to-[#e55e40] bg-clip-text text-transparent">
                and documents fast.
              </span>
            </>
          ) : (
            <>
              Welcome back{" "}
              <span className="bg-gradient-to-r from-[#0f0f10] via-[#b84628] to-[#e55e40] bg-clip-text text-transparent">
                to your studio.
              </span>
            </>
          )}
        </h1>

        <p className="mt-2.5 max-w-[440px] text-[14.5px] leading-relaxed text-muted">
          {isSignUp
            ? "One lightweight account unlocks neural speech synthesis, AI upscaling, OCR, and a private 24-hour workspace synced across devices."
            : "Pick up your saved voices, 24-hour generation history, and remaining credits across every browser session."}
        </p>
      </BlurFade>

      {/* Interactive 3D Glossy Studio Pass */}
      <BlurFade delay={0.12} duration={0.5} offset={10}>
        <CometCard rotateDepth={7} translateDepth={5} className="max-w-[460px] rounded-[22px]">
          <div className="group/pass relative overflow-hidden rounded-[22px] border border-white/15 bg-[linear-gradient(145deg,#18181c_0%,#111114_55%,#231712_100%)] p-[18px] text-white shadow-[0_26px_60px_-20px_rgba(15,15,16,0.58),inset_0_1px_0_rgba(255,255,255,0.22)] transition-[border-color,box-shadow] duration-300 hover:border-white/30 hover:shadow-[0_30px_70px_-18px_rgba(229,94,64,0.34),inset_0_1px_0_rgba(255,255,255,0.32)]">
            <BorderBeam
              size={105}
              duration={7.5}
              colorFrom="#ffd7a8"
              colorTo="#e55e40"
              radius={22}
              borderWidth={1.35}
            />

            {/* Specular liquid gloss sweep across card corner */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffe5be_0%,#ff9d4d_36%,#e55e40_72%,transparent_100%)] opacity-65 blur-[2px] transition-all duration-500 group-hover/pass:scale-110 group-hover/pass:opacity-85"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.03)_36%,transparent_58%)]"
            />
            {/* Hover diagonal glass reflection sweep */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-y-6 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent opacity-0 transition-all duration-700 group-hover/pass:left-[125%] group-hover/pass:opacity-100"
            />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/85 backdrop-blur-md transition-colors duration-300 group-hover/pass:border-white/25 group-hover/pass:bg-white/15">
                  <Sparkles
                    size={11}
                    className="text-[#ffbf87] transition-transform duration-300 group-hover/pass:rotate-12 group-hover/pass:scale-110"
                    aria-hidden
                  />
                  Starter Studio Pass
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/65 transition-colors duration-300 group-hover/pass:text-white/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80]" />
                  No card required
                </span>
              </div>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] text-white/60">Instant balance on sign-up</p>
                  <p className="mt-0.5 text-[15px] font-medium tracking-[-0.01em] text-white">
                    Voice, Vision &amp; Document AI
                  </p>
                </div>
                <div className="text-right transition-transform duration-300 group-hover/pass:scale-105">
                  <span className="bg-gradient-to-b from-white via-[#ffe8cb] to-[#ffb27a] bg-clip-text font-display text-[40px] font-semibold leading-[0.85] tracking-[-0.05em] text-transparent">
                    25
                  </span>
                  <span className="ml-1.5 text-[11.5px] font-medium text-white/60">credits</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-white/60">
                <span>12+ everyday tools always unlimited</span>
                <span className="font-mono text-white/80">frebies.app</span>
              </div>
            </div>
          </div>
        </CometCard>
      </BlurFade>

      {/* Dual Frosted Bento Preview Tiles */}
      <BlurFade delay={0.18} duration={0.5} offset={10}>
        <div className="grid max-w-[460px] gap-3 sm:grid-cols-2">
          <HoverGlassTile>
            <div className="flex items-center justify-between">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#fff2e6] to-[#ffdcc2] text-accent ring-1 ring-accent/20 transition-transform duration-300 group-hover/tile:-rotate-6 group-hover/tile:scale-110">
                <AudioWaveform size={15} aria-hidden />
              </span>
              <div className="flex h-5 items-center gap-[3px]" aria-hidden>
                {WAVE_BARS.map((height, idx) => (
                  <span
                    key={idx}
                    className="auth-bar w-[2.5px] rounded-full bg-gradient-to-t from-accent to-[#ffaa5c] transition-transform duration-300 group-hover/tile:scale-y-110"
                    style={{
                      height: `${Math.round(height * 17)}px`,
                      animationDelay: `${idx * 0.11}s`,
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="mt-2.5 text-[13px] font-semibold text-ink">23 Studio Voices</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Instant previews &amp; natural narration
            </p>
          </HoverGlassTile>

          <HoverGlassTile>
            <div className="flex items-center justify-between">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#f1effd] to-[#e4dffb] text-[#6d4aff] ring-1 ring-[#6d4aff]/20 transition-transform duration-300 group-hover/tile:rotate-6 group-hover/tile:scale-110">
                <Lock size={14} aria-hidden />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-medium text-ink/80 shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover/tile:scale-105 group-hover/tile:ring-accent/25">
                <Wand2
                  size={10}
                  className="text-accent transition-transform duration-300 group-hover/tile:rotate-12"
                  aria-hidden
                />
                Synced
              </span>
            </div>
            <p className="mt-2.5 text-[13px] font-semibold text-ink">24h Private Vault</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Account-scoped history across devices
            </p>
          </HoverGlassTile>
        </div>
      </BlurFade>

      <BlurFade delay={0.24} duration={0.45} offset={8}>
        <div className="flex max-w-[460px] flex-wrap gap-1.5">
          {CAPABILITY_CHIPS.map((chip) => (
            <motion.span
              key={chip}
              whileHover={{ y: -2, scale: 1.04 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className="group/chip inline-flex cursor-default items-center gap-1.5 rounded-full border border-white/85 bg-white/65 px-2.5 py-1 text-[11px] font-medium text-ink/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-colors duration-200 hover:border-accent/35 hover:bg-white/95 hover:text-ink hover:shadow-[0_8px_18px_-8px_rgba(229,94,64,0.3)]"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-ink/25 transition-colors duration-200 group-hover/chip:bg-accent"
              />
              {chip}
            </motion.span>
          ))}
        </div>
      </BlurFade>
    </section>
  );
}
