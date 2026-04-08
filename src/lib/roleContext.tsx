"use client";

/**
 * Role Context — Desert Cowgirl
 * 
 * Single source of truth for the current user's role, derived from profiles.role.
 * Synced with Supabase auth changes via the existing supabase-auth-change event.
 *
 * Contracts enforced:
 *   - Guest Contract v1: unauthenticated = "guest"
 *   - Member Contract v1: authenticated with profiles.role = "member"
 *   - Admin Contract v1: authenticated with profiles.role = "admin"
 *
 * Usage:
 *   const { role, isGuest, isMember, isAdmin, isLoading } = useRole();
 *   useHallMonitor({ require: "member" }); // auto-redirect or 403
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type StoreRole = "guest" | "member" | "admin";

export interface RoleState {
  /** Normalized role string from profiles.role. "guest" when unauthenticated. */
  role: StoreRole;
  /** True while the role is being fetched after an auth change. */
  isRoleLoading: boolean;
  /** Derived booleans — avoids string comparisons throughout the app. */
  isGuest: boolean;
  isMember: boolean;
  isAdmin: boolean;
  /** Force a re-fetch of role from the server. Useful after role promotion. */
  refreshRole: () => void;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const VALID_ROLES: StoreRole[] = ["guest", "member", "admin"];

function normalizeRole(raw: unknown): StoreRole {
  if (typeof raw === "string" && (VALID_ROLES as string[]).includes(raw)) {
    return raw as StoreRole;
  }
  return "member"; // safe default for authenticated users with unknown role
}

async function fetchRoleFromProfile(userId: string): Promise<StoreRole> {
  try {
    const res = await fetch(`/api/profile/${userId}`, { credentials: "same-origin" });
    if (!res.ok) {
      console.warn(`[RoleContext] Profile fetch ${res.status} — defaulting to "member"`);
      return "member";
    }
    const data = await res.json();
    return normalizeRole(data?.role);
  } catch (err) {
    console.error("[RoleContext] Profile fetch error:", err);
    return "member";
  }
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const RoleContext = createContext<RoleState | undefined>(undefined);

export function useRole(): RoleState {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

interface RoleProviderProps {
  children: React.ReactNode;
  /**
   * Optional: pass the initial user id from the server-side session
   * so we can kick off the profile fetch immediately without waiting
   * for the first supabase-auth-change event.
   */
  initialUserId?: string | null;
}

export function RoleProvider({ children, initialUserId }: RoleProviderProps) {
  const [role, setRole] = useState<StoreRole>(initialUserId ? "member" : "guest");
  const [isRoleLoading, setIsRoleLoading] = useState(!!initialUserId);
  const currentUserIdRef = useRef<string | null>(initialUserId ?? null);
  const refreshCountRef = useRef(0);

  const resolveRole = useCallback(async (userId: string | null) => {
    if (!userId) {
      setRole("guest");
      setIsRoleLoading(false);
      currentUserIdRef.current = null;
      console.log("[RoleContext] 👤 Guest (no session)");
      return;
    }

    // Skip if same user and we already have a role resolved
    if (userId === currentUserIdRef.current && !isRoleLoading) return;

    currentUserIdRef.current = userId;
    setIsRoleLoading(true);

    const resolved = await fetchRoleFromProfile(userId);
    
    // Guard: user might have signed out while we were fetching
    if (currentUserIdRef.current !== userId) return;

    setRole(resolved);
    setIsRoleLoading(false);
    console.log(`[RoleContext] ✅ Role resolved: ${resolved} (uid: ${userId.slice(0, 8)}…)`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshRole = useCallback(() => {
    refreshCountRef.current += 1;
    const uid = currentUserIdRef.current;
    if (uid) {
      setIsRoleLoading(true);
      fetchRoleFromProfile(uid).then((resolved) => {
        if (currentUserIdRef.current === uid) {
          setRole(resolved);
          setIsRoleLoading(false);
          console.log(`[RoleContext] 🔄 Role refreshed: ${resolved}`);
        }
      });
    }
  }, []);

  // ── Initial fetch ──
  useEffect(() => {
    if (initialUserId) {
      resolveRole(initialUserId);
    }
  }, [initialUserId, resolveRole]);

  // ── Listen to the existing auth broadcast from provider.tsx ──
  useEffect(() => {
    const handleAuthChange = (e: Event) => {
      const { event, session } = (e as CustomEvent).detail ?? {};
      const userId = session?.user?.id ?? null;

      console.log(`[RoleContext] 📡 Auth event: ${event}, userId: ${userId?.slice(0, 8) ?? "null"}`);

      if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null;
        setRole("guest");
        setIsRoleLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        resolveRole(userId);
      }
    };

    window.addEventListener("supabase-auth-change", handleAuthChange);
    return () => window.removeEventListener("supabase-auth-change", handleAuthChange);
  }, [resolveRole]);

  const value: RoleState = {
    role,
    isRoleLoading,
    isGuest: role === "guest",
    isMember: role === "member",
    isAdmin: role === "admin",
    refreshRole,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

// ─────────────────────────────────────────────
// useHallMonitor — Contract enforcement hook
// ─────────────────────────────────────────────

type RequiredRole = "guest" | "member" | "admin" | "any-auth";

interface HallMonitorOptions {
  /**
   * Minimum role required to access this page/component.
   *   "any-auth"  — must be signed in (member or admin)
   *   "member"    — must be member or admin
   *   "admin"     — must be admin only
   *   "guest"     — public, no enforcement (noop)
   */
  require: RequiredRole;
  /**
   * Where to redirect guests (unauthenticated).
   * Defaults to /sign-in?next=<currentPath>
   */
  guestRedirect?: string;
  /**
   * Where to redirect members who hit admin-only pages.
   * Defaults to showing a 403 state (onForbidden fires).
   */
  forbiddenRedirect?: string;
  /**
   * Called when access is forbidden (wrong role, authenticated).
   * Use this to show a 403 UI instead of redirecting.
   */
  onForbidden?: () => void;
}

/**
 * useHallMonitor
 * 
 * Drop into any page or component to enforce the access contracts.
 * 
 * @example
 * // In a profile page — requires sign-in
 * useHallMonitor({ require: "any-auth" });
 *
 * @example
 * // In a dashboard page — requires admin
 * useHallMonitor({ require: "admin" });
 *
 * @example
 * // Show custom 403 UI instead of redirect
 * const [forbidden, setForbidden] = useState(false);
 * useHallMonitor({ require: "admin", onForbidden: () => setForbidden(true) });
 */
export function useHallMonitor({
  require,
  guestRedirect,
  forbiddenRedirect,
  onForbidden,
}: HallMonitorOptions): { isChecking: boolean; isForbidden: boolean } {
  const { role, isRoleLoading, isGuest, isAdmin, isMember } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [isForbidden, setIsForbidden] = useState(false);

  useEffect(() => {
    // Still loading — don't enforce yet
    if (isRoleLoading) return;

    // Public route — no enforcement
    if (require === "guest") return;

    // ── Guest trying to access protected route ──
    if (isGuest) {
      const next = encodeURIComponent(pathname);
      const target = guestRedirect ?? `/sign-in?next=${next}`;
      console.log(`[HallMonitor] 🚪 Guest → redirecting to ${target}`);
      router.replace(target);
      return;
    }

    // ── Authenticated user — check role ──
    const hasAccess =
      require === "any-auth"
        ? !isGuest
        : require === "member"
        ? isMember || isAdmin // admin inherits member access
        : require === "admin"
        ? isAdmin
        : true;

    if (!hasAccess) {
      console.log(`[HallMonitor] 🚫 Role "${role}" cannot access "${require}" route`);
      setIsForbidden(true);

      if (forbiddenRedirect) {
        router.replace(forbiddenRedirect);
      } else if (onForbidden) {
        onForbidden();
      } else {
        // Default: redirect members away from admin pages
        router.replace("/profile/me");
      }
    } else {
      setIsForbidden(false);
    }
  }, [
    role,
    isRoleLoading,
    isGuest,
    isAdmin,
    isMember,
    require,
    pathname,
    guestRedirect,
    forbiddenRedirect,
    onForbidden,
    router,
  ]);

  return {
    isChecking: isRoleLoading,
    isForbidden,
  };
}

// ─────────────────────────────────────────────
// Role-gating component helper
// ─────────────────────────────────────────────

interface ShowForProps {
  roles: StoreRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * ShowFor — render children only if the current user has one of the given roles.
 * 
 * @example
 * <ShowFor roles={["admin"]}>
 *   <DashboardLink />
 * </ShowFor>
 *
 * @example
 * <ShowFor roles={["member", "admin"]} fallback={<SignInPrompt />}>
 *   <AccountMenu />
 * </ShowFor>
 */
export function ShowFor({ roles, children, fallback = null }: ShowForProps) {
  const { role, isRoleLoading } = useRole();
  if (isRoleLoading) return null;
  if (!roles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}