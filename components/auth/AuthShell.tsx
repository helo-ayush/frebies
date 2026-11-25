"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Arrow, MaskLines, Rule, Sq, useMedia } from "@/components/site/kit";
import { buttonClasses } from "@/components/ui/Button";
import { useAuthSession } from "./AuthContext";

const MachineFront = dynamic(
  () => import("@/components/site/MachineCanvas").then((module) => module.MachineFront),
  { ssr: false },
);

// ---- The machine on the left reacts to the form on the right ------------------------
type Stage = {
  /** Push the machine's button. */
  press: (on: boolean) => void;
  /** Two lines for its display; null puts the greeting back. */
  show: (lines: [string, string] | null) => void;
};

const StageContext = createContext<Stage>({ press: () => undefined, show: () => undefined });
export const useAuthStage = () => useContext(StageContext);

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
    <div
      key={message}
      role="alert"
      className="fb-unfold border border-l-[4px] border-danger/40 border-l-danger bg-danger-soft px-4 py-3 text-[14px] leading-relaxed text-danger"
    >
      <p>{message}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-1.5 inline-flex items-center gap-2 font-semibold underline underline-offset-4 hover:text-ink"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

const COPY = {
  "sign-in": {
    lines: ["Welcome", "back."],
    display: ["HELLO", "AGAIN"] as [string, string],
    note: "Pick up your AI credits and everything you made in the last 24 hours.",
  },
  "sign-up": {
    lines: ["25 credits,", "on us."],
    display: ["YOURS", "25"] as [string, string],
    note: "For voices, dubbing, upscaling and vocal splits. Free tools never ask for an account.",
  },
};

export function AuthShell({
  mode,
  redirectUrl,
  email = "",
  children,
}: {
  mode: "sign-in" | "sign-up";
  redirectUrl: string;
  /** Kept when switching between the two pages. */
  email?: string;
  children: ReactNode;
}) {
  const { clerkEnabled, isLoaded, isSignedIn, user, signOut } = useAuthSession();
  const wide = useMedia("(min-width: 1024px)");
  const [pressed, setPressed] = useState(false);
  const [lines, setLines] = useState<[string, string] | null>(null);
  const stage = useMemo<Stage>(() => ({ press: setPressed, show: setLines }), []);
  const copy = COPY[mode];
  const [from, to] = lines ?? copy.display;

  const query = new URLSearchParams();
  if (redirectUrl && redirectUrl !== "/dashboard") query.set("redirect_url", redirectUrl);
  if (email) query.set("email", email);
  const suffix = query.size > 0 ? `?${query}` : "";

  return (
    <StageContext.Provider value={stage}>
      <div className="grid min-h-dvh bg-canvas text-ink lg:h-dvh lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_minmax(440px,40%)]">
        {/* The machine */}
        <section aria-hidden className="relative hidden overflow-hidden lg:block">
          <Rule vertical className="absolute inset-y-0 left-[38%]" />
          <Rule className="absolute inset-x-0 top-[57%]" />
          <span className="fb-grid-bg absolute inset-x-0 bottom-0 top-[57%] opacity-60 [background-size:54px_54px] [mask-image:linear-gradient(180deg,black,transparent)]" />
          <span className="fb-hatch absolute bottom-0 left-[38%] right-0 top-[84%] opacity-70" />

          {wide ? (
            <MachineFront
              pressed={pressed}
              from={from}
              to={to}
              className="absolute -right-[7%] bottom-0 left-[17%] top-[31%]"
            />
          ) : null}

          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-[var(--fb-pad)] pt-7">
            <Wordmark href="/" size={26} />
          </div>
          <MaskLines
            key={mode}
            immediate
            as="p"
            lines={copy.lines}
            className="fb-wide absolute left-[var(--fb-pad)] top-[clamp(84px,12.5vh,128px)] text-[clamp(52px,min(6.6vw,13vh),118px)]"
          />
          <div className="absolute bottom-9 left-[var(--fb-pad)] w-[clamp(150px,15vw,230px)] max-xl:hidden">
            <Sq />
            <p className="mt-4 text-[14.5px] uppercase leading-[1.38]">{copy.note}</p>
          </div>
        </section>

        {/* The form */}
        <main className="flex min-h-dvh flex-col border-line bg-panel lg:min-h-0 lg:overflow-y-auto lg:border-l">
          <div className="flex h-[64px] shrink-0 items-stretch border-b border-line lg:h-[72px]">
            <span className="flex flex-1 items-center pl-5 lg:hidden">
              <Wordmark href="/" size={24} />
            </span>
            <nav aria-label="Account" className="flex items-stretch max-lg:hidden lg:flex-1">
              <ModeTab href={`/sign-in${suffix}`} active={mode === "sign-in"}>
                Sign in
              </ModeTab>
              <ModeTab href={`/sign-up${suffix}`} active={mode === "sign-up"}>
                Sign up
              </ModeTab>
            </nav>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 border-l border-line px-5 text-[13.5px] font-medium uppercase transition-colors hover:bg-ink hover:text-white lg:px-7"
            >
              All tools
              <Arrow />
            </Link>
          </div>
          <nav aria-label="Account" className="flex h-[56px] shrink-0 border-b border-line lg:hidden">
            <ModeTab href={`/sign-in${suffix}`} active={mode === "sign-in"}>
              Sign in
            </ModeTab>
            <ModeTab href={`/sign-up${suffix}`} active={mode === "sign-up"}>
              Sign up
            </ModeTab>
          </nav>

          <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-6 py-8 sm:px-10">
            {!clerkEnabled ? (
              <div role="note" className="mb-6 border border-l-[4px] border-line-strong border-l-accent px-4 py-3 text-[13.5px] leading-relaxed">
                <p className="font-semibold">Clerk keys pending</p>
                <p className="mt-1 text-muted">
                  Add <code className="bg-canvas px-1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
                  <code className="bg-canvas px-1">CLERK_SECRET_KEY</code> in <code className="bg-canvas px-1">.env.local</code>.
                </p>
              </div>
            ) : null}

            {isLoaded && isSignedIn && user ? (
              <div>
                <h1 className="fb-wide text-[clamp(27px,3vw,38px)]">You are in</h1>
                <div className="mt-7 flex items-center gap-4 border border-line-strong bg-white p-4">
                  {user.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.imageUrl}
                      alt={user.fullName ?? user.email ?? "Signed-in user"}
                      className="h-12 w-12 object-cover"
                    />
                  ) : (
                    <span className="grid h-12 w-12 shrink-0 place-items-center bg-ink text-[15px] font-semibold text-white">
                      {user.initials}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-semibold">{user.fullName ?? "Signed in"}</p>
                    {user.email ? <p className="truncate text-[14px] text-muted">{user.email}</p> : null}
                  </div>
                </div>
                <Link
                  href={redirectUrl || "/dashboard"}
                  className="fb-run mt-4"
                  onPointerEnter={() => setPressed(true)}
                  onPointerLeave={() => setPressed(false)}
                >
                  <span className="fb-run-icon">
                    <Arrow size={18} />
                  </span>
                  <span className="fb-run-label">Continue</span>
                </Link>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className={buttonClasses("secondary", "lg", "mt-2.5 w-full")}
                >
                  <LogOut size={16} aria-hidden />
                  Sign out
                </button>
              </div>
            ) : (
              children
            )}
          </div>

          <p className="shrink-0 border-t border-line px-6 py-4 text-center text-[13px] leading-relaxed text-muted sm:px-10">
            Free tools stay unlimited without an account.
          </p>
        </main>
      </div>
    </StageContext.Provider>
  );
}

function ModeTab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-1 items-center justify-center border-l border-line px-6 text-[14px] font-semibold uppercase transition-colors first:border-l-0 lg:flex-none lg:px-8 ${
        active ? "bg-ink text-white" : "text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
      {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[4px] bg-accent" /> : null}
    </Link>
  );
}

/** Title and one line above a form. */
export function AuthHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <h1 className="fb-wide text-[clamp(27px,3vw,38px)]">{title}</h1>
      {children ? <p className="mt-3 text-[15px] leading-[1.5] text-muted">{children}</p> : null}
    </div>
  );
}

/** Rule with a word in the middle. */
export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-faint">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Pushes the machine's button for as long as something is happening. */
export function useStagePress(on: boolean) {
  const { press } = useAuthStage();
  useEffect(() => {
    if (!on) return;
    press(true);
    return () => press(false);
  }, [on, press]);
}
