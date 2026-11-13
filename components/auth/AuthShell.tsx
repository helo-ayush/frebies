"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { DottedGlowBackground } from "@/components/aceternity/dotted-glow-background";
import { Spotlight } from "@/components/aceternity/spotlight";
import { BorderBeam } from "@/components/magicui/border-beam";
import { useAuthSession } from "./AuthContext";
import { AuthShowcaseBento } from "./AuthShowcaseBento";

export function AuthErrorBanner({
  message,
  actionLabel,
  actionHref,
}: {
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <motion.div
      key={message}
      role="alert"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: [0, -5, 5, -3, 3, 0] }}
      transition={{ duration: 0.36 }}
      className="rounded-[12px] border border-[#f2c4ba]/90 bg-[#fff3f0]/90 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#9e331f] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-md"
    >
      <p>{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-1.5 inline-flex items-center font-medium text-[#7e2514] underline underline-offset-2 hover:text-ink"
        >
          {actionLabel}
        </Link>
      )}
    </motion.div>
  );
}

export function AuthShell({
  mode,
  redirectUrl,
  children,
}: {
  mode: "sign-in" | "sign-up";
  redirectUrl: string;
  children: ReactNode;
}) {
  const { clerkEnabled, isLoaded, isSignedIn, user, signOut } = useAuthSession();
  const isSignUp = mode === "sign-up";
  const querySuffix =
    redirectUrl && redirectUrl !== "/dashboard"
      ? `?redirect_url=${encodeURIComponent(redirectUrl)}`
      : "";

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#f4f1ea] text-ink max-lg:overflow-y-auto lg:fixed lg:inset-0 lg:h-dvh lg:overflow-hidden">
      {/* Multi-layer liquid aurora ambient backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="auth-drift absolute -left-32 -top-28 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_45%_45%,rgba(255,148,96,0.42),rgba(255,205,165,0.18)_55%,transparent_75%)] blur-3xl" />
        <div
          className="auth-drift absolute right-[-120px] top-[12%] h-[580px] w-[580px] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(255,180,108,0.46),rgba(229,94,64,0.16)_52%,transparent_74%)] blur-3xl"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="auth-drift absolute bottom-[-160px] right-[18%] h-[460px] w-[520px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(176,148,255,0.34),rgba(130,178,255,0.12)_55%,transparent_76%)] blur-3xl"
          style={{ animationDelay: "-9s" }}
        />
      </div>

      <DottedGlowBackground
        className="inset-0 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_82%)]"
        gap={24}
        radius={1.05}
        color="rgba(15,15,16,0.15)"
        glowColor="rgba(229,94,64,0.65)"
        opacity={0.48}
        speed={0.45}
      />

      <Spotlight className="-left-24 -top-40 md:-top-24 lg:left-24" fill="#ffd4a3" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1160px] items-center justify-center px-5 py-6 sm:px-8 lg:h-full lg:py-4">
        <main className="grid w-full items-center gap-8 lg:grid-cols-[1.06fr_0.94fr] lg:gap-12">
          <AuthShowcaseBento mode={mode} />

          {/* Right Liquid-Glass Auth Card */}
          <section className="group/card relative mx-auto w-full max-w-[444px]">
            {/* Ambient specular halo behind glass card */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 rounded-[34px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,170,110,0.28),transparent_60%),radial-gradient(circle_at_80%_85%,rgba(176,148,255,0.22),transparent_60%)] opacity-85 blur-2xl transition-opacity duration-500 group-hover/card:opacity-100"
            />

            <div className="auth-glass-card relative overflow-hidden rounded-[26px] p-6 sm:p-7">
              <BorderBeam
                size={125}
                duration={8}
                colorFrom="#ff9d4d"
                colorTo="#e55e40"
                radius={26}
                borderWidth={1.4}
              />

              {/* Subtle curved specular gloss highlight along upper card rim */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0)_100%)]"
              />

              <div className="relative z-10">
                {/* Spring-animated Sign in / Sign up pill switcher */}
                <nav
                  aria-label="Authentication mode"
                  className="relative grid grid-cols-2 gap-1 rounded-[14px] border border-black/[0.06] bg-black/[0.045] p-1 shadow-[inset_0_1px_2px_rgba(15,15,16,0.06)]"
                >
                  <Link
                    href={`/sign-in${querySuffix}`}
                    aria-current={!isSignUp ? "page" : undefined}
                    className={`relative rounded-[10px] px-3 py-2 text-center text-[13px] font-medium transition-all duration-200 ${
                      !isSignUp
                        ? "text-ink"
                        : "text-muted hover:bg-white/55 hover:text-ink"
                    }`}
                  >
                    {!isSignUp && (
                      <motion.span
                        layoutId="auth-mode-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-[10px] border border-white/90 bg-white shadow-[0_3px_10px_-3px_rgba(15,15,16,0.14),inset_0_1px_0_rgba(255,255,255,1)]"
                      />
                    )}
                    <span className="relative z-10">Sign in</span>
                  </Link>

                  <Link
                    href={`/sign-up${querySuffix}`}
                    aria-current={isSignUp ? "page" : undefined}
                    className={`relative rounded-[10px] px-3 py-2 text-center text-[13px] font-medium transition-all duration-200 ${
                      isSignUp
                        ? "text-ink"
                        : "text-muted hover:bg-white/55 hover:text-ink"
                    }`}
                  >
                    {isSignUp && (
                      <motion.span
                        layoutId="auth-mode-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-[10px] border border-white/90 bg-white shadow-[0_3px_10px_-3px_rgba(15,15,16,0.14),inset_0_1px_0_rgba(255,255,255,1)]"
                      />
                    )}
                    <span className="relative z-10">Sign up</span>
                  </Link>
                </nav>

                {!clerkEnabled && (
                  <div
                    role="note"
                    className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-[#eadfce] bg-[#fdf9f2]/90 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#725b3b] backdrop-blur-sm"
                  >
                    <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#9b7949]" aria-hidden />
                    <div>
                      <p className="font-medium text-[#5c482c]">Clerk keys pending</p>
                      <p className="mt-0.5">
                        Add{" "}
                        <code className="rounded bg-[#f3eadb] px-1 py-0.5 text-[11px]">
                          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                        </code>{" "}
                        and{" "}
                        <code className="rounded bg-[#f3eadb] px-1 py-0.5 text-[11px]">
                          CLERK_SECRET_KEY
                        </code>{" "}
                        in <code className="rounded bg-[#f3eadb] px-1 py-0.5 text-[11px]">.env.local</code>.
                      </p>
                    </div>
                  </div>
                )}

                {isLoaded && isSignedIn && user ? (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center gap-3.5 rounded-[15px] border border-white/90 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_18px_-8px_rgba(15,15,16,0.10)]">
                      {user.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.imageUrl}
                          alt={user.fullName ?? user.email ?? "Signed-in user"}
                          className="h-11 w-11 rounded-full object-cover ring-2 ring-white shadow-sm"
                        />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-semibold text-white ring-2 ring-white shadow-sm">
                          {user.initials}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">
                          {user.fullName ?? "Signed in"}
                        </p>
                        {user.email && (
                          <p className="truncate text-[12px] text-muted">{user.email}</p>
                        )}
                      </div>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22c55e] ring-4 ring-[#22c55e]/20" />
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <Link
                        href={redirectUrl || "/dashboard"}
                        className="group/cta auth-glossy-cta relative inline-flex h-11 w-full select-none items-center justify-center overflow-hidden rounded-[12px] px-4 text-[13.5px] font-medium text-white transition-all duration-200 active:scale-[0.985]"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent"
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -inset-y-4 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-all duration-700 group-hover/cta:left-[120%] group-hover/cta:opacity-100"
                        />
                        <span className="relative z-10">Continue to workspace</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-black/10 bg-white/70 text-[13px] font-medium text-ink transition-all duration-200 hover:-translate-y-px hover:border-black/15 hover:bg-white hover:shadow-sm"
                      >
                        <LogOut size={14} aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">{children}</div>
                )}

                <div className="mt-4 border-t border-black/[0.06] pt-3 text-center">
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Free converters stay unlimited without an account. Sign in to sync AI credits &amp; your 24-hour library.
                  </p>
                  <Link
                    href="/dashboard"
                    className="group/back mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium text-muted transition-colors hover:bg-white/65 hover:text-ink"
                  >
                    <ArrowLeft
                      size={12}
                      className="transition-transform duration-200 group-hover/back:-translate-x-0.5"
                      aria-hidden
                    />
                    Return to studio
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
