import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

export type ParsedAuthError = {
  message: string;
  code: string | null;
};

type MinimalClerkError = {
  code?: string;
  message?: string;
  longMessage?: string;
};

type ErrorsBag = {
  global?: Array<{ message?: string; longMessage?: string; code?: string }> | null;
  raw?: unknown[] | null;
  fields?: object;
};

function asMinimalError(value: unknown): MinimalClerkError | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as MinimalClerkError;
  if (typeof candidate.longMessage === "string" || typeof candidate.message === "string") {
    return candidate;
  }
  return null;
}

/**
 * Extracts a clean, user-facing error message and machine code from Clerk's
 * v7 future hook errors, thrown API errors, or generic exceptions.
 */
export function parseClerkAuthError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): ParsedAuthError {
  if (!err) return { message: fallback, code: null };

  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    if (first) {
      return {
        message: first.longMessage || first.message || fallback,
        code: first.code ?? null,
      };
    }
  }

  if (typeof err === "object" && err !== null) {
    const record = err as MinimalClerkError;
    if (typeof record.longMessage === "string" || typeof record.message === "string") {
      return {
        message: record.longMessage || record.message || fallback,
        code: typeof record.code === "string" ? record.code : null,
      };
    }
  }

  if (err instanceof Error && err.message) {
    return { message: err.message, code: null };
  }

  return { message: fallback, code: null };
}

/**
 * Reads the first field or global error from a Clerk signal `errors` object.
 */
export function extractSignalError(errors: ErrorsBag | undefined | null): ParsedAuthError | null {
  if (!errors) return null;

  if (errors.fields) {
    for (const rawFieldErr of Object.values(errors.fields as Record<string, unknown>)) {
      const fieldErr = asMinimalError(rawFieldErr);
      if (fieldErr) {
        return {
          message: fieldErr.longMessage || fieldErr.message || "Invalid input.",
          code: fieldErr.code ?? null,
        };
      }
    }
  }

  const globalErr = errors.global?.[0];
  if (globalErr && (globalErr.longMessage || globalErr.message)) {
    return {
      message: globalErr.longMessage || globalErr.message || "Authentication failed.",
      code: globalErr.code ?? null,
    };
  }

  return null;
}
