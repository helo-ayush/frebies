import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { AUTH_ROUTES, hasClerkServerConfig } from "@/lib/auth/clerk-config";

export const OWNER_COOKIE_NAME = "frebies_owner_id";

export type OwnerContext = {
  ownerId: string;
  userId: string | null;
  guestId: string | null;
  isAuthenticated: boolean;
  safeKeySegment: string;
};

const VALID_TOKEN_RE = /^[a-zA-Z0-9_-]{6,72}$/;

export function toSafeOwnerSegment(ownerId: string): string {
  return ownerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "guest_anonymous";
}

function readCookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function extractGuestId(request?: NextRequest | Request | null): string | null {
  if (!request) return null;
  let rawGuest: string | null = null;
  if ("cookies" in request && typeof request.cookies?.get === "function") {
    rawGuest = request.cookies.get(OWNER_COOKIE_NAME)?.value ?? null;
  } else {
    rawGuest = readCookieFromHeader(request.headers.get("cookie"), OWNER_COOKIE_NAME);
  }
  return rawGuest && VALID_TOKEN_RE.test(rawGuest) ? rawGuest : null;
}

/**
 * Synchronous guest-cookie fallback owner resolver.
 */
export function resolveRequestOwner(request?: NextRequest | Request | null): OwnerContext {
  const guestId = extractGuestId(request);
  if (guestId) {
    const ownerId = `guest:${guestId}`;
    return {
      ownerId,
      userId: null,
      guestId,
      isAuthenticated: false,
      safeKeySegment: toSafeOwnerSegment(ownerId),
    };
  }

  const fallbackId = "guest:anonymous";
  return {
    ownerId: fallbackId,
    userId: null,
    guestId: null,
    isAuthenticated: false,
    safeKeySegment: toSafeOwnerSegment(fallbackId),
  };
}

/**
 * Resolves the ownership identity for a server API request.
 * Prefers a verified Clerk user session (`user:${userId}`) when Clerk is configured,
 * falling back cleanly to the `frebies_owner_id` guest cookie.
 */
export async function resolveRequestOwnerAsync(
  request?: NextRequest | Request | null,
): Promise<OwnerContext> {
  const guestId = extractGuestId(request);

  if (hasClerkServerConfig()) {
    try {
      const session = await auth();
      if (session?.userId) {
        const ownerId = `user:${session.userId}`;
        return {
          ownerId,
          userId: session.userId,
          guestId,
          isAuthenticated: true,
          safeKeySegment: toSafeOwnerSegment(ownerId),
        };
      }
    } catch {
      // Fall back to guest cookie if auth context is unavailable
    }
  }

  return resolveRequestOwner(request);
}

/**
 * Requires an active authenticated Clerk user for restricted pro tool & generation endpoints.
 */
export async function requireAuthenticatedOwner(
  request?: NextRequest | Request | null,
): Promise<OwnerContext | null> {
  const owner = await resolveRequestOwnerAsync(request);
  if (!owner.isAuthenticated || !owner.userId) {
    return null;
  }
  return owner;
}

export function authRequiredResponse(
  message = "Please sign in to use this tool and access your private generation history.",
) {
  return NextResponse.json(
    {
      error: message,
      code: "AUTH_REQUIRED",
      signInUrl: AUTH_ROUTES.signIn,
    },
    { status: 401 },
  );
}

