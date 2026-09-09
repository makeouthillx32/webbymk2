// src/lib/edge/zerotrust.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zero Trust identity-aware edge gatekeeper for Unenter Edge Platform.
// Protects internal staff decks (/house, /admin) without requiring a VPN.
// ─────────────────────────────────────────────────────────────────────────────

export interface ZeroTrustPolicy {
  pathPrefix: string;
  requireAdmin: boolean;
  allowedRoles?: string[];
}

export const ZERO_TRUST_POLICIES: ZeroTrustPolicy[] = [
  { pathPrefix: "/house", requireAdmin: true },
  { pathPrefix: "/admin", requireAdmin: true },
  { pathPrefix: "/api/tank/admin", requireAdmin: true },
  { pathPrefix: "/dashboard", requireAdmin: false },
];

export function matchesZeroTrustPolicy(pathname: string): ZeroTrustPolicy | null {
  for (const policy of ZERO_TRUST_POLICIES) {
    if (pathname === policy.pathPrefix || pathname.startsWith(`${policy.pathPrefix}/`)) {
      return policy;
    }
  }
  return null;
}

export function evaluateZeroTrustAccess(
  pathname: string,
  user: { id: string; role?: string; app_metadata?: { role?: string; is_admin?: boolean } } | null
): { allowed: boolean; reason?: string; redirectTo?: string } {
  const policy = matchesZeroTrustPolicy(pathname);
  if (!policy) return { allowed: true };

  // If no authenticated user, redirect to auth.unenter.live/sign-in
  if (!user) {
    return {
      allowed: false,
      reason: "Authentication required to access protected surface",
      redirectTo: `/sign-in?returnTo=${encodeURIComponent(pathname)}`,
    };
  }

  // If policy requires admin clearance
  if (policy.requireAdmin) {
    const isAdmin =
      user.app_metadata?.is_admin === true ||
      user.app_metadata?.role === "admin" ||
      user.role === "service_role";

    if (!isAdmin) {
      return {
        allowed: false,
        reason: "Access denied: Insufficient operator clearance",
        redirectTo: "/error?code=403_FORBIDDEN",
      };
    }
  }

  return { allowed: true };
}
