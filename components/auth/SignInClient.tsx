"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Input } from "@/components/aceternity/input";
import { AUTH_ROUTES, sanitizeRedirectUrl } from "@/lib/auth/clerk-config";
import {
  extractSignalError,
  parseClerkAuthError,
  type ParsedAuthError,
} from "@/lib/auth/clerk-errors";
import { useAuthSession } from "./AuthContext";
import { AuthCodeVerification } from "./AuthCodeVerification";
import { AuthErrorBanner, AuthShell } from "./AuthShell";
import { GlossySubmitButton } from "./GlossySubmitButton";
import { GoogleOAuthButton } from "./GoogleOAuthButton";

type SignInMethod = "code" | "password";
type SignInStep = "credentials" | "verify_email_code" | "verify_second_factor";

function SignInView({
  step,
  method,
  email,
  password,
  code,
  showPassword,
  busy,
  oauthBusy,
  error,
  onEmailChange,
  onPasswordChange,
  onCodeChange,
  onTogglePasswordVisibility,
  onSwitchMethod,
  onGoogleClick,
  onSubmitCredentials,
  onSubmitCode,
  onResendCode,
  onResetFlow,
}: {
  step: SignInStep;
  method: SignInMethod;
  email: string;
  password: string;
  code: string;
  showPassword: boolean;
  busy: boolean;
  oauthBusy: boolean;
  error: ParsedAuthError | null;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onTogglePasswordVisibility: () => void;
  onSwitchMethod: (next: SignInMethod) => void;
  onGoogleClick: () => void;
  onSubmitCredentials: (e: FormEvent) => void;
  onSubmitCode: (e: FormEvent) => void;
  onResendCode: () => Promise<boolean>;
  onResetFlow: () => void;
}) {
  const showSignUpHint =
    error?.code === "form_identifier_not_found" ||
    error?.code === "identifier_not_found";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">
          Sign in to frebies
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Use Google or your email address to open your workspace.
        </p>
      </div>

      {error && (
        <AuthErrorBanner
          message={error.message}
          actionLabel={showSignUpHint ? "No account yet? Create one →" : undefined}
          actionHref={
            showSignUpHint
              ? `/sign-up${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`
              : undefined
          }
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === "credentials" ? (
          <motion.div
            key="signin-credentials"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
            <GoogleOAuthButton
              label="Continue with Google"
              loading={oauthBusy}
              disabled={busy}
              onClick={onGoogleClick}
            />

            <div className="relative flex items-center py-0.5">
              <span className="h-px flex-1 bg-black/[0.08]" />
              <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                or sign in with email
              </span>
              <span className="h-px flex-1 bg-black/[0.08]" />
            </div>

            <form onSubmit={onSubmitCredentials} className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="signin-email" className="block text-[12px] font-medium text-ink">
                  Email address
                </label>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="bg-white/85 backdrop-blur-sm"
                />
              </div>

              <AnimatePresence initial={false}>
                {method === "password" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1.5 pt-0.5">
                      <label
                        htmlFor="signin-password"
                        className="block text-[12px] font-medium text-ink"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <Input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => onPasswordChange(e.target.value)}
                          className="bg-white/85 pr-10 backdrop-blur-sm"
                        />
                        <button
                          type="button"
                          onClick={onTogglePasswordVisibility}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-faint transition-colors hover:text-ink"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <GlossySubmitButton
                label={method === "code" ? "Send 6-digit code" : "Sign in"}
                busyLabel={method === "code" ? "Sending 6-digit code…" : "Signing in…"}
                busy={busy}
                disabled={oauthBusy || !email.trim() || (method === "password" && !password)}
                icon={method === "code" ? <Mail size={15} aria-hidden /> : <KeyRound size={15} aria-hidden />}
              />
            </form>

            <div className="flex items-center justify-center pt-0.5">
              <button
                type="button"
                onClick={() => onSwitchMethod(method === "code" ? "password" : "code")}
                className="rounded-full border border-transparent px-3 py-1 text-[12px] font-medium text-muted transition-all duration-200 hover:-translate-y-px hover:border-white/95 hover:bg-white/80 hover:text-ink hover:shadow-sm"
              >
                {method === "code" ? "Sign in with password instead" : "Use a 6-digit email code instead"}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="signin-otp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <AuthCodeVerification
              email={email}
              title={
                step === "verify_second_factor"
                  ? "Security check · Code sent to"
                  : "6-digit code sent to"
              }
              submitLabel="Verify & sign in"
              code={code}
              onCodeChange={onCodeChange}
              onSubmit={onSubmitCode}
              onResend={onResendCode}
              onChangeEmail={onResetFlow}
              busy={busy}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClerkSignInFlow({
  redirectUrl,
  initialEmail,
}: {
  redirectUrl: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [method, setMethod] = useState<SignInMethod>("code");
  const [step, setStep] = useState<SignInStep>("credentials");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);
  const [localError, setLocalError] = useState<ParsedAuthError | null>(null);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const busy = fetchStatus === "fetching";
  const activeError = localError ?? extractSignalError(errors);

  async function finalizeSession() {
    const res = await signIn.finalize({
      navigate: async ({ decorateUrl }) => {
        const destination = decorateUrl(redirectUrl);
        if (destination.startsWith("http")) {
          window.location.href = destination;
          return;
        }
        router.replace(destination);
      },
    });
    if (res.error) {
      setLocalError(parseClerkAuthError(res.error));
      return;
    }
    router.refresh();
  }

  async function handleGoogleClick() {
    setLocalError(null);
    setOauthBusy(true);
    try {
      const callbackUrl = `${AUTH_ROUTES.ssoCallback}?intent=signIn&redirect_url=${encodeURIComponent(redirectUrl)}`;
      const res = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl,
        redirectCallbackUrl: callbackUrl,
      });
      if (res.error) {
        setLocalError(parseClerkAuthError(res.error));
        setOauthBusy(false);
      }
    } catch (err) {
      setLocalError(parseClerkAuthError(err));
      setOauthBusy(false);
    }
  }

  async function handleSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    try {
      if (method === "code") {
        const res = await signIn.emailCode.sendCode({ emailAddress: trimmedEmail });
        if (res.error) {
          setLocalError(parseClerkAuthError(res.error));
          return;
        }
        setCode("");
        setStep("verify_email_code");
        return;
      }

      const res = await signIn.password({ emailAddress: trimmedEmail, password });
      if (res.error) {
        setLocalError(parseClerkAuthError(res.error));
        return;
      }

      if (signIn.status === "complete") {
        await finalizeSession();
        return;
      }

      if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
        const mfaRes = await signIn.mfa.sendEmailCode();
        if (mfaRes.error) {
          setLocalError(parseClerkAuthError(mfaRes.error));
          return;
        }
        setCode("");
        setStep("verify_second_factor");
        return;
      }

      setLocalError({
        message: "Additional verification is required. Try signing in with your 6-digit email code.",
        code: null,
      });
    } catch (err) {
      setLocalError(parseClerkAuthError(err));
    }
  }

  async function handleSubmitCode(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const trimmedCode = code.trim();
    if (trimmedCode.length < 6) return;

    try {
      const res =
        step === "verify_second_factor"
          ? await signIn.mfa.verifyEmailCode({ code: trimmedCode })
          : await signIn.emailCode.verifyCode({ code: trimmedCode });

      if (res.error) {
        setLocalError(parseClerkAuthError(res.error));
        return;
      }

      if (signIn.status === "complete") {
        await finalizeSession();
        return;
      }

      if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
        const mfaRes = await signIn.mfa.sendEmailCode();
        if (mfaRes.error) {
          setLocalError(parseClerkAuthError(mfaRes.error));
          return;
        }
        setCode("");
        setStep("verify_second_factor");
        return;
      }

      setLocalError({
        message: `Unexpected sign-in status (${signIn.status ?? "unknown"}). Please try again.`,
        code: null,
      });
    } catch (err) {
      setLocalError(parseClerkAuthError(err));
    }
  }

  async function handleResendCode(): Promise<boolean> {
    setLocalError(null);
    const res =
      step === "verify_second_factor"
        ? await signIn.mfa.sendEmailCode()
        : await signIn.emailCode.sendCode();
    if (res.error) {
      setLocalError(parseClerkAuthError(res.error));
      return false;
    }
    return true;
  }

  async function handleResetFlow() {
    setLocalError(null);
    setCode("");
    setStep("credentials");
    await signIn.reset();
  }

  return (
    <SignInView
      step={step}
      method={method}
      email={email}
      password={password}
      code={code}
      showPassword={showPassword}
      busy={busy}
      oauthBusy={oauthBusy}
      error={activeError}
      onEmailChange={(v) => {
        setLocalError(null);
        setEmail(v);
      }}
      onPasswordChange={(v) => {
        setLocalError(null);
        setPassword(v);
      }}
      onCodeChange={(v) => {
        setLocalError(null);
        setCode(v);
      }}
      onTogglePasswordVisibility={() => setShowPassword((prev) => !prev)}
      onSwitchMethod={(next) => {
        setLocalError(null);
        setMethod(next);
      }}
      onGoogleClick={handleGoogleClick}
      onSubmitCredentials={handleSubmitCredentials}
      onSubmitCode={handleSubmitCode}
      onResendCode={handleResendCode}
      onResetFlow={handleResetFlow}
    />
  );
}

function PreviewSignInFlow({ initialEmail }: { initialEmail: string }) {
  const [method, setMethod] = useState<SignInMethod>("code");
  const [step, setStep] = useState<SignInStep>("credentials");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<ParsedAuthError | null>(null);

  function showPendingKeysError() {
    setError({
      message:
        "Clerk publishable and secret keys are not set in .env.local yet. Add them and restart the dev server to authenticate.",
      code: null,
    });
  }

  return (
    <SignInView
      step={step}
      method={method}
      email={email}
      password={password}
      code={code}
      showPassword={showPassword}
      busy={false}
      oauthBusy={false}
      error={error}
      onEmailChange={(v) => {
        setError(null);
        setEmail(v);
      }}
      onPasswordChange={(v) => {
        setError(null);
        setPassword(v);
      }}
      onCodeChange={setCode}
      onTogglePasswordVisibility={() => setShowPassword((prev) => !prev)}
      onSwitchMethod={(next) => {
        setError(null);
        setMethod(next);
      }}
      onGoogleClick={showPendingKeysError}
      onSubmitCredentials={(e) => {
        e.preventDefault();
        showPendingKeysError();
      }}
      onSubmitCode={(e) => {
        e.preventDefault();
        showPendingKeysError();
      }}
      onResendCode={async () => {
        showPendingKeysError();
        return false;
      }}
      onResetFlow={() => setStep("credentials")}
    />
  );
}

export function SignInClient() {
  const { clerkEnabled } = useAuthSession();
  const searchParams = useSearchParams();
  const redirectUrl = sanitizeRedirectUrl(searchParams.get("redirect_url"), AUTH_ROUTES.afterAuth);
  const initialEmail = searchParams.get("email")?.trim() ?? "";

  return (
    <AuthShell mode="sign-in" redirectUrl={redirectUrl}>
      {clerkEnabled ? (
        <ClerkSignInFlow redirectUrl={redirectUrl} initialEmail={initialEmail} />
      ) : (
        <PreviewSignInFlow initialEmail={initialEmail} />
      )}
    </AuthShell>
  );
}
