"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HandleSSOCallback } from "@clerk/nextjs";
import { Wordmark } from "@/components/brand/Wordmark";
import { IsoBlock } from "@/components/site/blocks";
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
    <div className="fb-stage fb-corners relative grid min-h-dvh place-items-center px-6 text-ink">
      <div className="absolute left-[var(--fb-pad)] top-7">
        <Wordmark href="/" size={26} />
      </div>
      <div className="text-center">
        <IsoBlock label={["Opening"]} sheet open={clerkEnabled} className="mx-auto h-[clamp(160px,30vh,260px)] w-auto" />
        {clerkEnabled ? (
          <>
            <h1 className="fb-wide mt-8 text-[clamp(26px,4vw,44px)]">Letting you in</h1>
            <p role="status" className="mt-4 text-[15.5px] text-muted">
              Finishing your Google sign in.
            </p>
            <ClerkSsoCallbackRunner redirectUrl={redirectUrl} />
          </>
        ) : (
          <>
            <h1 className="fb-wide mt-8 text-[clamp(26px,4vw,44px)]">Clerk keys needed</h1>
            <p className="mt-4 text-[15.5px] text-muted">
              Add your Clerk keys in <code className="bg-panel px-1">.env.local</code> to finish Google sign in.
            </p>
            <div className="mt-7 flex justify-center gap-2.5">
              <Link href="/sign-in" className={buttonClasses("secondary", "lg")}>
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonClasses("primary", "lg")}>
                Sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
