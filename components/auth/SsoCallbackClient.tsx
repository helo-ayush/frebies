"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HandleSSOCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { DottedGlowBackground } from "@/components/aceternity/dotted-glow-background";
import { Wordmark } from "@/components/brand/Wordmark";
import { BorderBeam } from "@/components/magicui/border-beam";
import { buttonClasses } from "@/components/ui/Button";
import { AUTH_ROUTES, sanitizeRedirectUrl } from "@/lib/auth/clerk-config";
import { useAuthSession } from "./AuthContext";

function ClerkSsoCallbackRunner({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();

  return (
    <HandleSSOCallback
      navigateToApp={({ decorateUrl }) => {
        const destination = decorateUrl(redirectUrl);
        if (destination.startsWith("http")) {
          window.location.href = destination;
          return;
        }
        router.replace(destination);
      }}
      navigateToSignIn={() => {
        router.replace(
          `${AUTH_ROUTES.signIn}?redirect_url=${encodeURIComponent(redirectUrl)}`,
        );
      }}
      navigateToSignUp={() => {
        router.replace(
          `${AUTH_ROUTES.signUp}?redirect_url=${encodeURIComponent(redirectUrl)}`,
        );
      }}
    />
  );
}

export function SsoCallbackClient() {
  const { clerkEnabled } = useAuthSession();
  const searchParams = useSearchParams();
  const redirectUrl = sanitizeRedirectUrl(searchParams.get("redirect_url"), AUTH_ROUTES.afterAuth);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f4f1ea] px-5 text-ink">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="auth-drift absolute left-[20%] top-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_45%_45%,rgba(255,155,95,0.42),transparent_70%)] blur-3xl" />
        <div
          className="auth-drift absolute bottom-[10%] right-[18%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(176,148,255,0.32),transparent_72%)] blur-3xl"
          style={{ animationDelay: "-4s" }}
        />
      </div>

      <DottedGlowBackground
        className="inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
        gap={24}
        radius={1.05}
        opacity={0.45}
      />

      <div className="relative z-10 mb-6 rounded-full border border-white/85 bg-white/65 px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl">
        <Wordmark href="/dashboard" />
      </div>

      <div className="auth-glass-card relative z-10 w-full max-w-[390px] overflow-hidden rounded-[24px] p-7 text-center">
        <BorderBeam
          size={95}
          duration={6}
          colorFrom="#ff9d4d"
          colorTo="#e55e40"
          radius={24}
          borderWidth={1.35}
        />

        <div className="relative z-10">
          {clerkEnabled ? (
            <>
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-white/90 bg-white/85 text-ink shadow-sm">
                <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
              </div>
              <h1 className="mt-4 font-display text-[20px] font-semibold tracking-[-0.025em]">
                Completing Google sign-in…
              </h1>
              <p className="mt-1.5 text-[13px] text-muted">
                Just a moment while we finalize your session and open frebies.
              </p>
              <ClerkSsoCallbackRunner redirectUrl={redirectUrl} />
            </>
          ) : (
            <>
              <h1 className="font-display text-[19px] font-semibold tracking-[-0.02em]">
                Clerk keys required
              </h1>
              <p className="mt-1.5 text-[13px] text-muted">
                Add your Clerk keys in <code className="rounded bg-rail px-1 py-0.5">.env.local</code>{" "}
                to handle OAuth callbacks.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href="/sign-in" className={buttonClasses("secondary", "sm")}>
                  Sign in
                </Link>
                <Link href="/sign-up" className={buttonClasses("primary", "sm")}>
                  Sign up
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
