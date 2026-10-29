const rawUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
