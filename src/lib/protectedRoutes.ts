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