const CLERK_SIGN_IN_PATH = "/sign-in";
const CLERK_SIGN_UP_PATH = "/sign-up";
const CLERK_SSO_CALLBACK_PATH = "/sso-callback";

export function isValidClerkPublishableKey(value: string | undefined | null): boolean {
  const trimmed = value?.trim() ?? "";
  return (
    trimmed.length > 16 &&
    (trimmed.startsWith("pk_test_") || trimmed.startsWith("pk_live_")) &&
    !trimmed.includes("YOUR_") &&
    !trimmed.includes("...")
  );
}

export function isValidClerkSecretKey(value: string | undefined | null): boolean {
  const trimmed = value?.trim() ?? "";
  return (
    trimmed.length > 16 &&
    (trimmed.startsWith("sk_test_") || trimmed.startsWith("sk_live_")) &&
    !trimmed.includes("YOUR_") &&
    !trimmed.includes("...")
  );
}

export function getClerkPublishableKey(): string {
  const raw = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  return isValidClerkPublishableKey(raw) ? raw : "";
}

export function hasClerkPublishableKey(): boolean {
  return getClerkPublishableKey().length > 0;
}

export function hasClerkServerConfig(): boolean {
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  return hasClerkPublishableKey() && isValidClerkSecretKey(secret);
}

/**
 * Validates post-auth redirect URLs so open redirects to external domains
 * or circular redirects back into auth pages are blocked.
 */
export function sanitizeRedirectUrl(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  const pathnameOnly = trimmed.split(/[?#]/)[0] ?? "";
  if (
    pathnameOnly === CLERK_SIGN_IN_PATH ||
    pathnameOnly.startsWith(`${CLERK_SIGN_IN_PATH}/`) ||
    pathnameOnly === CLERK_SIGN_UP_PATH ||
    pathnameOnly.startsWith(`${CLERK_SIGN_UP_PATH}/`) ||
    pathnameOnly === CLERK_SSO_CALLBACK_PATH ||
    pathnameOnly.startsWith(`${CLERK_SSO_CALLBACK_PATH}/`)
  ) {
    return fallback;
  }
  return trimmed;
}

export const AUTH_ROUTES = {
  signIn: CLERK_SIGN_IN_PATH,
  signUp: CLERK_SIGN_UP_PATH,
  ssoCallback: CLERK_SSO_CALLBACK_PATH,
  afterAuth: "/dashboard",
} as const;

