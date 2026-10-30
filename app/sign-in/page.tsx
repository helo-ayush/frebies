import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiteProgressiveBlur } from "@/components/effects/SiteProgressiveBlur";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Sign in | frebies",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-white text-ink lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)]">
      <section className="relative hidden overflow-hidden border-r border-line bg-[#f7f5f1] p-10 lg:flex lg:flex-col xl:p-14">
        <Wordmark href="/" />
        <div className="relative z-10 my-auto max-w-[520px] py-16">
          <p className="flex items-center gap-2 text-micro font-medium text-muted">
            <Sparkles size={13} className="text-accent" aria-hidden />
            A little more room to create
          </p>
          <h2 className="mt-5 font-display text-[clamp(2.5rem,4vw,4.3rem)] font-semibold leading-[1.02] tracking-[-0.05em]">
            Your files,<br />your history,<br />one calm place.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            Sign in when you want AI tools and saved work. The everyday toolbox stays free and open.
          </p>
          <ul className="mt-8 space-y-3 text-ui text-muted">
            {["25 free credits for new accounts", "Your inputs stay in place through sign-in", "Failed AI runs are refunded"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-line bg-white"><Check size={11} /></span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffe2b8_0%,#ff9d4d_38%,#e55e40_75%,#9c321d_100%)] opacity-80" />
        <div aria-hidden className="absolute -bottom-12 right-64 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eee8ff_0%,#b9a7e8_45%,#7b82c7_100%)] opacity-75" />
        <p className="relative z-10 text-micro text-faint">Free tools never need an account.</p>
      </section>

      <section className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <Link href="/dashboard" className="absolute right-5 top-5 inline-flex items-center gap-1.5 text-ui text-muted hover:text-ink sm:right-8 sm:top-7">
          Back to tools <ArrowRight size={13} aria-hidden />
        </Link>

        <div className="w-full max-w-[400px]">
          <div className="lg:hidden"><Wordmark href="/" /></div>
          <div className="mt-10 lg:mt-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[30px] font-semibold tracking-[-0.035em]">Welcome to frebies</h1>
              <Badge tone="soon">Preview</Badge>
            </div>
            <p className="mt-2.5 text-ui leading-relaxed text-muted">
              Sign in to use AI tools, save your recent work and claim 25 free credits.
            </p>
          </div>

          <div className="mt-8">
            <button type="button" disabled className={buttonClasses("secondary", "md", "h-11 w-full")}>
              <span className="grid h-5 w-5 place-items-center rounded-full border border-line text-[12px] font-semibold">G</span>
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-3 text-micro text-faint">
              <span className="h-px flex-1 bg-line" /><span>or continue with email</span><span className="h-px flex-1 bg-line" />
            </div>

            <label htmlFor="email" className="block text-ui font-medium text-ink">Email address</label>
            <div className="relative mt-2">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
              <input
                id="email"
                type="email"
                disabled
                placeholder="you@example.com"
                className="h-11 w-full rounded-[10px] border border-line bg-white pl-10 pr-3 text-ui text-ink outline-none placeholder:text-faint disabled:opacity-60"
              />
            </div>
            <button type="button" disabled className={buttonClasses("primary", "md", "mt-3 h-11 w-full")}>
              Send a 6-digit code
              <ArrowRight size={14} aria-hidden />
            </button>

            <div className="mt-5 flex gap-2.5 rounded-[11px] border border-line bg-rail p-3.5">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <p className="text-micro leading-relaxed text-muted">
                Authentication is not connected yet. This preview shows the planned password-free sign-in experience.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-micro leading-relaxed text-faint">
            No passwords to remember. We will email a short-lived code when sign-in is connected.
          </p>
          <Link href="/dashboard" className="mt-7 inline-flex items-center gap-1.5 text-ui text-muted transition-colors hover:text-ink">
            <ArrowLeft size={14} aria-hidden />
            Continue browsing as a guest
          </Link>
        </div>
      </section>
      <SiteProgressiveBlur />
    </main>
  );
}
