"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { Eye, EyeOff, KeyRound, UserPlus } from "lucide-react";
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

type SignUpMethod = "code" | "password";
type SignUpStep = "details" | "verify_email" | "missing_fields";

function SignUpView({
  step,
  method,
  email,
  password,
  firstName,
  lastName,
  username,
  missingFields,
  code,
  showPassword,
  busy,
  oauthBusy,
  error,
  showCaptchaSlot,
  onEmailChange,
  onPasswordChange,
  onFirstNameChange,
  onLastNameChange,
  onUsernameChange,
  onCodeChange,
  onTogglePasswordVisibility,
  onSwitchMethod,
  onGoogleClick,
  onSubmitDetails,
  onSubmitCode,
  onSubmitMissingFields,
  onResendCode,
  onResetFlow,
}: {
  step: SignUpStep;
  method: SignUpMethod;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  missingFields: string[];
  code: string;
  showPassword: boolean;
  busy: boolean;
  oauthBusy: boolean;
  error: ParsedAuthError | null;
  showCaptchaSlot: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onTogglePasswordVisibility: () => void;
  onSwitchMethod: (next: SignUpMethod) => void;
  onGoogleClick: () => void;
  onSubmitDetails: (e: FormEvent) => void;
  onSubmitCode: (e: FormEvent) => void;
  onSubmitMissingFields: (e: FormEvent) => void;
  onResendCode: () => Promise<boolean>;
  onResetFlow: () => void;
}) {
  const showSignInHint =
    error?.code === "form_identifier_exists" ||
    error?.code === "identifier_already_exists";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">
          Create your account
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Get 25 free AI credits and save your voice generations cleanly.
        </p>
      </div>

      {error && (
        <AuthErrorBanner
          message={error.message}
          actionLabel={showSignInHint ? "Already have an account? Sign in →" : undefined}
          actionHref={
            showSignInHint
              ? `/sign-in${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`
              : undefined
          }
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === "details" && (
          <motion.div
            key="signup-details"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
            <GoogleOAuthButton
              label="Sign up with Google"
              loading={oauthBusy}
              disabled={busy}
              onClick={onGoogleClick}
            />

            <div className="relative flex items-center py-0.5">
              <span className="h-px flex-1 bg-black/[0.08]" />
              <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                or create with email
              </span>
              <span className="h-px flex-1 bg-black/[0.08]" />
            </div>

            <form onSubmit={onSubmitDetails} className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="block text-[12px] font-medium text-ink">
                  Email address
                </label>
                <Input
                  id="signup-email"
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
                        htmlFor="signup-password"
                        className="block text-[12px] font-medium text-ink"
                      >
                        Create password
                      </label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          minLength={8}
                          placeholder="At least 8 characters"
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

              {showCaptchaSlot && <div id="clerk-captcha" className="pt-0.5" />}

              <GlossySubmitButton
                label={method === "code" ? "Continue with 6-digit code" : "Create account"}
                busyLabel="Preparing your account…"
                busy={busy}
                disabled={oauthBusy || !email.trim() || (method === "password" && !password)}
                icon={method === "code" ? <UserPlus size={15} aria-hidden /> : <KeyRound size={15} aria-hidden />}
              />
            </form>

            <div className="flex items-center justify-center pt-0.5">
              <button
                type="button"
                onClick={() => onSwitchMethod(method === "code" ? "password" : "code")}
                className="rounded-full border border-transparent px-3 py-1 text-[12px] font-medium text-muted transition-all duration-200 hover:-translate-y-px hover:border-white/95 hover:bg-white/80 hover:text-ink hover:shadow-sm"
              >
                {method === "code"
                  ? "Set a password instead"
                  : "Sign up passwordless with 6-digit code"}
              </button>
            </div>
          </motion.div>
        )}

        {step === "verify_email" && (
          <motion.div
            key="signup-otp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <AuthCodeVerification
              email={email}
              title="Verification code sent to"
              submitLabel="Verify & activate account"
              code={code}
              onCodeChange={onCodeChange}
              onSubmit={onSubmitCode}
              onResend={onResendCode}
              onChangeEmail={onResetFlow}
              busy={busy}
            />
          </motion.div>
        )}

        {step === "missing_fields" && (
          <motion.form
            key="signup-missing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            onSubmit={onSubmitMissingFields}
            className="space-y-3.5"
          >
            <div className="rounded-[12px] border border-white/85 bg-white/70 px-3.5 py-2.5 text-[12.5px] text-ink backdrop-blur-sm">
              Finish a quick required detail to complete your sign-up.
            </div>

            {(missingFields.includes("first_name") || missingFields.includes("last_name")) && (
              <div className="grid grid-cols-2 gap-2.5">
                {missingFields.includes("first_name") && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="signup-first-name"
                      className="block text-[12px] font-medium text-ink"
                    >
                      First name
                    </label>
                    <Input
                      id="signup-first-name"
                      type="text"
                      required
                      placeholder="Alex"
                      value={firstName}
                      onChange={(e) => onFirstNameChange(e.target.value)}
                    />
                  </div>
                )}
                {missingFields.includes("last_name") && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="signup-last-name"
                      className="block text-[12px] font-medium text-ink"
                    >
                      Last name
                    </label>
                    <Input
                      id="signup-last-name"
                      type="text"
                      required
                      placeholder="Rivera"
                      value={lastName}
                      onChange={(e) => onLastNameChange(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {missingFields.includes("username") && (
              <div className="space-y-1.5">
                <label htmlFor="signup-username" className="block text-[12px] font-medium text-ink">
                  Username
                </label>
                <Input
                  id="signup-username"
                  type="text"
                  required
                  placeholder="alexrivera"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                />
              </div>
            )}

            {missingFields.includes("password") && (
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-missing-password"
                  className="block text-[12px] font-medium text-ink"
                >
                  Create password
                </label>
                <div className="relative">
                  <Input
                    id="signup-missing-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    className="pr-10"
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
            )}

            <GlossySubmitButton
              label="Complete sign up"
              busyLabel="Finishing setup…"
              busy={busy}
            />
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClerkSignUpFlow({
  redirectUrl,
  initialEmail,
}: {
  redirectUrl: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [method, setMethod] = useState<SignUpMethod>("code");
  const [step, setStep] = useState<SignUpStep>("details");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [localError, setLocalError] = useState<ParsedAuthError | null>(null);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const busy = fetchStatus === "fetching";
  const activeError = localError ?? extractSignalError(errors);
  const missingFields = Array.isArray(signUp.missingFields)
    ? signUp.missingFields.map(String)
    : [];

  async function finalizeSignUp() {
    const res = await signUp.finalize({
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

  async function advanceAfterCreateOrVerify() {
    if (signUp.status === "complete") {
      await finalizeSignUp();
      return;
    }

    if (signUp.unverifiedFields.includes("email_address")) {
      const sendRes = await signUp.verifications.sendEmailCode();
      if (sendRes.error) {
        setLocalError(parseClerkAuthError(sendRes.error));
        return;
      }
      setCode("");
      setStep("verify_email");
      return;
    }

    if (signUp.missingFields.length > 0) {
      setStep("missing_fields");
      return;
    }

    setLocalError({
      message: "Sign-up requires additional verification in your Clerk settings.",
      code: null,
    });
  }

  async function handleGoogleClick() {
    setLocalError(null);
    setOauthBusy(true);
    try {
      const callbackUrl = `${AUTH_ROUTES.ssoCallback}?intent=signUp&redirect_url=${encodeURIComponent(redirectUrl)}`;
      const res = await signUp.sso({
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

  async function handleSubmitDetails(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    try {
      const res =
        method === "password"
          ? await signUp.password({ emailAddress: trimmedEmail, password })
          : await signUp.create({ emailAddress: trimmedEmail });

      if (res.error) {
        setLocalError(parseClerkAuthError(res.error));
        return;
      }

      if (signUp.isTransferable) {
        setLocalError({
          message: "An account already exists with this email address.",
          code: "form_identifier_exists",
        });
        return;
      }

      await advanceAfterCreateOrVerify();
    } catch (err) {
      setLocalError(parseClerkAuthError(err));
    }
  }

  async function handleSubmitCode(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (code.trim().length < 6) return;

    try {
      const res = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (res.error) {
        setLocalError(parseClerkAuthError(res.error));
        return;
      }

      if (signUp.status === "complete") {
        await finalizeSignUp();
        return;
      }

      if (signUp.missingFields.length > 0) {
        setStep("missing_fields");
        return;
      }

      setLocalError({
        message: "Verification succeeded, please complete remaining required details.",
        code: null,
      });
    } catch (err) {
      setLocalError(parseClerkAuthError(err));
    }
  }

  async function handleSubmitMissingFields(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      const res = await signUp.update({
        ...(missingFields.includes("first_name") && firstName.trim()
          ? { firstName: firstName.trim() }
          : {}),
        ...(missingFields.includes("last_name") && lastName.trim()
          ? { lastName: lastName.trim() }
          : {}),
        ...(missingFields.includes("username") && username.trim()
          ? { username: username.trim() }
          : {}),
        ...(missingFields.includes("password") && password ? { password } : {}),
      });
      if (res.error) {
        setLocalError(parseClerkAuthError(res.error));
        return;
      }

      await advanceAfterCreateOrVerify();
    } catch (err) {
      setLocalError(parseClerkAuthError(err));
    }
  }

  async function handleResendCode(): Promise<boolean> {
    setLocalError(null);
    const res = await signUp.verifications.sendEmailCode();
    if (res.error) {
      setLocalError(parseClerkAuthError(res.error));
      return false;
    }
    return true;
  }

  async function handleResetFlow() {
    setLocalError(null);
    setCode("");
    setStep("details");
    await signUp.reset();
  }

  return (
    <SignUpView
      step={step}
      method={method}
      email={email}
      password={password}
      firstName={firstName}
      lastName={lastName}
      username={username}
      missingFields={missingFields}
      code={code}
      showPassword={showPassword}
      busy={busy}
      oauthBusy={oauthBusy}
      error={activeError}
      showCaptchaSlot={true}
      onEmailChange={(v) => {
        setLocalError(null);
        setEmail(v);
      }}
      onPasswordChange={(v) => {
        setLocalError(null);
        setPassword(v);
      }}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onUsernameChange={setUsername}
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
      onSubmitDetails={handleSubmitDetails}
      onSubmitCode={handleSubmitCode}
      onSubmitMissingFields={handleSubmitMissingFields}
      onResendCode={handleResendCode}
      onResetFlow={handleResetFlow}
    />
  );
}

function PreviewSignUpFlow({ initialEmail }: { initialEmail: string }) {
  const [method, setMethod] = useState<SignUpMethod>("code");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ParsedAuthError | null>(null);

  function showPendingKeysError() {
    setError({
      message:
        "Clerk publishable and secret keys are not set in .env.local yet. Add them and restart the dev server to create accounts.",
      code: null,
    });
  }

  return (
    <SignUpView
      step="details"
      method={method}
      email={email}
      password={password}
      firstName=""
      lastName=""
      username=""
      missingFields={[]}
      code=""
      showPassword={showPassword}
      busy={false}
      oauthBusy={false}
      error={error}
      showCaptchaSlot={false}
      onEmailChange={(v) => {
        setError(null);
        setEmail(v);
      }}
      onPasswordChange={(v) => {
        setError(null);
        setPassword(v);
      }}
      onFirstNameChange={() => {}}
      onLastNameChange={() => {}}
      onUsernameChange={() => {}}
      onCodeChange={() => {}}
      onTogglePasswordVisibility={() => setShowPassword((prev) => !prev)}
      onSwitchMethod={(next) => {
        setError(null);
        setMethod(next);
      }}
      onGoogleClick={showPendingKeysError}
      onSubmitDetails={(e) => {
        e.preventDefault();
        showPendingKeysError();
      }}
      onSubmitCode={(e) => {
        e.preventDefault();
        showPendingKeysError();
      }}
      onSubmitMissingFields={(e) => {
        e.preventDefault();
        showPendingKeysError();
      }}
      onResendCode={async () => false}
      onResetFlow={() => {}}
    />
  );
}

export function SignUpClient() {
  const { clerkEnabled } = useAuthSession();
  const searchParams = useSearchParams();
  const redirectUrl = sanitizeRedirectUrl(searchParams.get("redirect_url"), AUTH_ROUTES.afterAuth);
  const initialEmail = searchParams.get("email")?.trim() ?? "";

  return (
    <AuthShell mode="sign-up" redirectUrl={redirectUrl}>
      {clerkEnabled ? (
        <ClerkSignUpFlow redirectUrl={redirectUrl} initialEmail={initialEmail} />
      ) : (
        <PreviewSignUpFlow initialEmail={initialEmail} />
      )}
    </AuthShell>
  );
}
