"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/nextjs";

export type AuthSessionUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  imageUrl: string | null;
  initials: string;
};

export type AuthSessionState = {
  clerkEnabled: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthSessionUser | null;
  signOut: () => Promise<void>;
};

const DEFAULT_STATE: AuthSessionState = {
  clerkEnabled: false,
  isLoaded: true,
  isSignedIn: false,
  user: null,
  signOut: async () => {},
};

const AuthSessionContext = createContext<AuthSessionState>(DEFAULT_STATE);

function computeInitials(
  firstName: string | null,
  lastName: string | null,
  fullName: string | null,
  email: string | null,
): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  if (f || l) return `${f}${l}`.toUpperCase();
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? "FR").toUpperCase();
  }
  if (email?.trim()) return email.trim().slice(0, 2).toUpperCase();
  return "FR";
}

function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const handleSignOut = useCallback(async () => {
    await clerkSignOut({ redirectUrl: "/dashboard" });
  }, [clerkSignOut]);

  const mappedUser = useMemo<AuthSessionUser | null>(() => {
    if (!isSignedIn || !user) return null;
    const email =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null;
    const firstName = user.firstName ?? null;
    const lastName = user.lastName ?? null;
    const fullName =
      user.fullName ?? ([firstName, lastName].filter(Boolean).join(" ") || null);

    return {
      id: user.id,
      firstName,
      lastName,
      fullName,
      email,
      imageUrl: user.hasImage ? user.imageUrl : null,
      initials: computeInitials(firstName, lastName, fullName, email),
    };
  }, [isSignedIn, user]);

  const value = useMemo<AuthSessionState>(
    () => ({
      clerkEnabled: true,
      isLoaded,
      isSignedIn: Boolean(isLoaded && isSignedIn && mappedUser),
      user: mappedUser,
      signOut: handleSignOut,
    }),
    [handleSignOut, isLoaded, isSignedIn, mappedUser],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

/**
 * Provides a safe auth session object across client components whether Clerk
 * keys are configured yet or pending in `.env.local`.
 */
export function AuthSessionProvider({
  clerkEnabled,
  children,
}: {
  clerkEnabled: boolean;
  children: ReactNode;
}) {
  if (clerkEnabled) {
    return <ClerkSessionBridge>{children}</ClerkSessionBridge>;
  }

  return <AuthSessionContext.Provider value={DEFAULT_STATE}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionState {
  return useContext(AuthSessionContext);
}

