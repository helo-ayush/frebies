import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { hasClerkServerConfig } from "@/lib/auth/clerk-config";

const isProtectedRoute = createRouteMatcher(["/account(.*)"]);

const handleClerk = clerkMiddleware(async (authFn, req) => {
  if (isProtectedRoute(req)) {
    await authFn.protect();
  }
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!hasClerkServerConfig()) {
    return NextResponse.next();
  }
  return handleClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp3|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes so resolveRequestOwnerAsync() can verify sessions
    "/(api|trpc)(.*)",
  ],
};

