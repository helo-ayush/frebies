"use client";

const OWNER_COOKIE_NAME = "frebies_owner_id";

function randomGuestToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Ensures the browser has a stable guest identifier cookie before API calls fire,
 * so each visitor's 24h generations are isolated cleanly (and easy to migrate to a signed-in user later).
 */
export function ensureGuestOwnerCookie(): string {
  if (typeof document === "undefined") return "anonymous";
  const prefix = `${OWNER_COOKIE_NAME}=`;
  const existing = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (existing) {
    const val = decodeURIComponent(existing.slice(prefix.length));
    if (/^[a-zA-Z0-9_-]{6,72}$/.test(val)) return val;
  }
  const token = `g_${randomGuestToken()}`;
  document.cookie = `${OWNER_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; SameSite=Lax`;
  return token;
}

