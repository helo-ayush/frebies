"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { KeyRound, Mail } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AUTH_ROUTES, sanitizeRedirectUrl } from "@/lib/auth/clerk-config";
import {
  extractSignalError,
  parseClerkAuthError,
  type ParsedAuthError,
} from "@/lib/auth/clerk-errors";
import { useAuthSession } from "./AuthContext";
import { AuthCodeVerification } from "./AuthCodeVerification";
import { AuthDivider, AuthErrorBanner, AuthHeading, AuthShell } from "./AuthShell";
import { AuthField, AuthSubmit, PasswordInput } from "./AuthSubmit";
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
  signUpHref,
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
  /** Sign up, with the email and the page to return to. */
  signUpHref: string;
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
    <div className="space-y-6">
      <AuthHeading title="Sign in">
        {step === "credentials"
          ? "With Google, or a code sent to your email."
          : "Type the code from your email. It signs you in on the last digit."}
      </AuthHeading>

      {error && (
        <AuthErrorBanner
          message={error.message}
          actionLabel={showSignUpHint ? "No account yet? Create one" : undefined}
          actionHref={showSignUpHint ? signUpHref : undefined}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === "credentials" ? (
          <motion.div
            key="signin-credentials"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            <GoogleOAuthButton
              label="Continue with Google"
              loading={oauthBusy}
              disabled={busy}
              onClick={onGoogleClick}
            />

            <AuthDivider>or with email</AuthDivider>

            <form onSubmit={onSubmitCredentials} className="space-y-5">
              <AuthField id="signin-email" label="Email address">
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  className="fb-input !h-[52px] !text-[16px]"
                />
              </AuthField>

              <AnimatePresence initial={false}>
                {method === "password" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <AuthField id="signin-password" label="Password">
                      <PasswordInput
                        id="signin-password"
                        value={password}
                        onChange={onPasswordChange}
                        shown={showPassword}
                        onToggle={onTogglePasswordVisibility}
                        placeholder="Your password"
                        autoComplete="current-password"
                      />
                    </AuthField>
                  </motion.div>
                )}
              </AnimatePresence>

              <AuthSubmit
                label={method === "code" ? "Send me a code" : "Sign in"}
                busyLabel={method === "code" ? "Sending the code…" : "Signing in…"}
                busy={busy}
                disabled={oauthBusy || !email.trim() || (method === "password" && !password)}
                icon={method === "code" ? <Mail size={19} aria-hidden /> : <KeyRound size={19} aria-hidden />}
              />
            </form>

            <button
              type="button"
              onClick={() => onSwitchMethod(method === "code" ? "password" : "code")}
              className="text-[14px] font-semibold underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-deep"
            >
              {method === "code" ? "Use a password instead" : "Use an email code instead"}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="signin-otp"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{ duration: 0.2 }}
          >
            <AuthCodeVerification
              email={email}
              title={step === "verify_second_factor" ? "Security check, code sent to" : "Code sent to"}
              submitLabel="Sign in"
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

/** Where "create one" goes: same return page, same email. */
function otherPage(path: string, redirectUrl: string, email: string): string {
  const query = new URLSearchParams();
  if (redirectUrl && redirectUrl !== AUTH_ROUTES.afterAuth) query.set("redirect_url", redirectUrl);
  if (email.trim()) query.set("email", email.trim());
  return query.size > 0 ? `${path}?${query}` : path;
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
      signUpHref={otherPage(AUTH_ROUTES.signUp, redirectUrl, email)}
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

function PreviewSignInFlow({ redirectUrl, initialEmail }: { redirectUrl: string; initialEmail: string }) {
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
      signUpHref={otherPage(AUTH_ROUTES.signUp, redirectUrl, email)}
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
    <AuthShell mode="sign-in" redirectUrl={redirectUrl} email={initialEmail}>
      {clerkEnabled ? (
        <ClerkSignInFlow redirectUrl={redirectUrl} initialEmail={initialEmail} />
      ) : (
        <PreviewSignInFlow redirectUrl={redirectUrl} initialEmail={initialEmail} />
      )}
    </AuthShell>
  );
}
