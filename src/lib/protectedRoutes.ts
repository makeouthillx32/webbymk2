// lib/protectedRoutes.ts
//
// Single source of truth for protected route prefixes.
// Consumed by both middleware.ts (server) and provider.tsx (client fallback).
// Add/remove prefixes here — both layers update automatically.

export const PROTECTED_PREFIXES = [
  "/profile",
  "/dashboard",
  "/settings",
  "/protected",
  "/research-access",
] as const;

export const AUTH_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
] as const;

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

// ── Post-auth "last page" redirect exclusions ────────────────────────────
// Single source of truth for what the last-page-capture/redirect flow must
// never send someone back to: the auth pages themselves (would loop), and
// PROTECTED_PREFIXES (dashboard/settings/etc — those should only ever be
// reached by deliberate navigation, never an implicit post-auth landing
// spot). Consumed by both the server-side capture (actions/auth/cookies.ts)
// and the client-side OAuth callback (auth/callback/oauth/page.tsx) — kept
// here so the two can't silently drift out of sync again. Fixed 2026-08-12.
export const LAST_PAGE_EXCLUDED_EXACT = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/callback/oauth",
  "/auth/logout",
] as const;

export const LAST_PAGE_EXCLUDED_PREFIXES = [
  ...PROTECTED_PREFIXES,
  "/auth/",
] as const;

export function isLastPageExcluded(pathname: string): boolean {
  const clean = pathname.split("#")[0].split("?")[0];
  return (
    (LAST_PAGE_EXCLUDED_EXACT as readonly string[]).includes(clean) ||
    LAST_PAGE_EXCLUDED_PREFIXES.some((prefix) => clean.startsWith(prefix))
  );
}