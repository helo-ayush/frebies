"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { KeyRound, UserPlus } from "lucide-react";
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
  signInHref,
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
  /** Sign in, with the email and the page to return to. */
  signInHref: string;
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
    <div className="space-y-6">
      <AuthHeading title="Create an account">
        {step === "verify_email"
          ? "Type the code from your email. It opens your account on the last digit."
          : step === "missing_fields"
            ? "One last detail and you are in."
            : "25 credits for the AI tools, and a library of what you make."}
      </AuthHeading>

      {error && (
        <AuthErrorBanner
          message={error.message}
          actionLabel={showSignInHint ? "Already have an account? Sign in" : undefined}
          actionHref={showSignInHint ? signInHref : undefined}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === "details" && (
          <motion.div
            key="signup-details"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            <GoogleOAuthButton
              label="Sign up with Google"
              loading={oauthBusy}
              disabled={busy}
              onClick={onGoogleClick}
            />

            <AuthDivider>or with email</AuthDivider>

            <form onSubmit={onSubmitDetails} className="space-y-5">
              <AuthField id="signup-email" label="Email address">
                <input
                  id="signup-email"
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
                    <AuthField id="signup-password" label="Password" hint="8 characters or more">
                      <PasswordInput
                        id="signup-password"
                        value={password}
                        onChange={onPasswordChange}
                        shown={showPassword}
                        onToggle={onTogglePasswordVisibility}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </AuthField>
                  </motion.div>
                )}
              </AnimatePresence>

              {showCaptchaSlot && <div id="clerk-captcha" className="empty:hidden" />}

              <AuthSubmit
                label={method === "code" ? "Send me a code" : "Create account"}
                busyLabel="Setting up…"
                busy={busy}
                disabled={oauthBusy || !email.trim() || (method === "password" && !password)}
                icon={method === "code" ? <UserPlus size={19} aria-hidden /> : <KeyRound size={19} aria-hidden />}
              />
            </form>

            <button
              type="button"
              onClick={() => onSwitchMethod(method === "code" ? "password" : "code")}
              className="text-[14px] font-semibold underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-deep"
            >
              {method === "code" ? "Set a password instead" : "Use an email code instead"}
            </button>
          </motion.div>
        )}

        {step === "verify_email" && (
          <motion.div
            key="signup-otp"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{ duration: 0.2 }}
          >
            <AuthCodeVerification
              email={email}
              title="Code sent to"
              submitLabel="Open my account"
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
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{ duration: 0.2 }}
            onSubmit={onSubmitMissingFields}
            className="space-y-5"
          >
            {(missingFields.includes("first_name") || missingFields.includes("last_name")) && (
              <div className="grid grid-cols-2 gap-3">
                {missingFields.includes("first_name") && (
                  <AuthField id="signup-first-name" label="First name">
                    <input
                      id="signup-first-name"
                      type="text"
                      required
                      autoComplete="given-name"
                      placeholder="Alex"
                      value={firstName}
                      onChange={(e) => onFirstNameChange(e.target.value)}
                      className="fb-input !h-[52px] !text-[16px]"
                    />
                  </AuthField>
                )}
                {missingFields.includes("last_name") && (
                  <AuthField id="signup-last-name" label="Last name">
                    <input
                      id="signup-last-name"
                      type="text"
                      required
                      autoComplete="family-name"
                      placeholder="Rivera"
                      value={lastName}
                      onChange={(e) => onLastNameChange(e.target.value)}
                      className="fb-input !h-[52px] !text-[16px]"
                    />
                  </AuthField>
                )}
              </div>
            )}

            {missingFields.includes("username") && (
              <AuthField id="signup-username" label="Username">
                <input
                  id="signup-username"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="alexrivera"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  className="fb-input !h-[52px] !text-[16px]"
                />
              </AuthField>
            )}

            {missingFields.includes("password") && (
              <AuthField id="signup-missing-password" label="Password" hint="8 characters or more">
                <PasswordInput
                  id="signup-missing-password"
                  value={password}
                  onChange={onPasswordChange}
                  shown={showPassword}
                  onToggle={onTogglePasswordVisibility}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                />
              </AuthField>
            )}

            <AuthSubmit
              label="Finish"
              busyLabel="Finishing…"
              busy={busy}
              icon={<UserPlus size={19} aria-hidden />}
            />
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Where "sign in" goes: same return page, same email. */
function otherPage(path: string, redirectUrl: string, email: string): string {
  const query = new URLSearchParams();
  if (redirectUrl && redirectUrl !== AUTH_ROUTES.afterAuth) query.set("redirect_url", redirectUrl);
  if (email.trim()) query.set("email", email.trim());
  return query.size > 0 ? `${path}?${query}` : path;
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
      signInHref={otherPage(AUTH_ROUTES.signIn, redirectUrl, email)}
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

function PreviewSignUpFlow({ redirectUrl, initialEmail }: { redirectUrl: string; initialEmail: string }) {
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
      signInHref={otherPage(AUTH_ROUTES.signIn, redirectUrl, email)}
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
    <AuthShell mode="sign-up" redirectUrl={redirectUrl} email={initialEmail}>
      {clerkEnabled ? (
        <ClerkSignUpFlow redirectUrl={redirectUrl} initialEmail={initialEmail} />
      ) : (
        <PreviewSignUpFlow redirectUrl={redirectUrl} initialEmail={initialEmail} />
      )}
    </AuthShell>
  );
}
