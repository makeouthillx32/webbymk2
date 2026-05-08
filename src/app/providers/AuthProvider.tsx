"use client";

// src/app/providers/AuthProvider.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Auth + session concern — isolated from theme.
//
// Exports:
//   AuthContext           — raw context (for advanced consumers)
//   useAuth               — hook; throws if called outside AuthProviderWrapper
//   useIOSSessionRefresh  — convenience hook over useAuth().refreshSession
//   AuthProviderWrapper   — component; owns Supabase client, session state,
//                           auth listeners, iOS session persistence, and
//                           protected-route redirect logic.
//
// Internal (not exported):
//   IOSSessionManager     — sets up iOS visibilitychange / pageshow handlers
//   InternalAuthProvider  — consumes session from SessionContextProvider,
//                           drives user state + router refresh + redirect
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, User } from "@supabase/auth-helpers-nextjs";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { iosSessionHelpers } from "@/lib/cookieUtils";
import { getBrowserSupabaseUrl } from "@/lib/multiZone";
import { usePathname, useRouter } from "next/navigation";
import { authLogger } from "@/lib/authLogger";
import { RoleProvider } from "@/lib/roleContext";
import { isAuthRoute, isProtectedRoute } from "@/lib/protectedRoutes";

// ── Context type ──────────────────────────────────────────────────────────────

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  refreshSession: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProviderWrapper");
  return context;
};

export function useIOSSessionRefresh() {
  const { refreshSession } = useAuth();
  return { refreshSession };
}

// ── iOS session persistence ───────────────────────────────────────────────────
// Registers the iosSessionHelpers handlers once on mount. Kept as a dedicated
// component so it can be moved / reused independently of the auth state tree.

function IOSSessionManager({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const cleanup = iosSessionHelpers.setupIOSHandlers();
    console.log("[AuthProvider] 🍎 iOS session persistence initialized");
    return cleanup;
  }, []);
  return <>{children}</>;
}

// ── InternalAuthProvider ──────────────────────────────────────────────────────
// Sits *inside* SessionContextProvider so it can call useRouter / usePathname
// safely. Drives user state, router refresh on user change, and protected-route
// redirect for unauthenticated guests.

function InternalAuthProvider({
  children,
  forceRefreshSession,
  session,
  isLoading,
}: {
  children: React.ReactNode;
  forceRefreshSession: () => void;
  session: Session | null;
  isLoading: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const refreshSession = () => {
    iosSessionHelpers.refreshSession();
    console.log("[AuthProvider] 🔄 Manual session refresh triggered (iosSessionHelpers)");
    forceRefreshSession();
  };

  const lastUserIdRef = useRef<string | null>(null);

  // Sync user state from session and trigger a router refresh on user change
  // so server components re-render with the new auth state.
  useEffect(() => {
    const nextUserId = session?.user?.id ?? null;
    if (nextUserId) setUser(session!.user);
    else setUser(null);

    if (lastUserIdRef.current !== nextUserId) {
      lastUserIdRef.current = nextUserId;
      router.refresh();
    }
  }, [session, router]);

  // Redirect unauthenticated users away from protected routes.
  useEffect(() => {
    if (isLoading) return;
    if (!session && isProtectedRoute(pathname) && !isAuthRoute(pathname)) {
      const target = pathname + (location.search || "");
      console.log(`[AuthProvider] Redirecting guest to sign-in from protected route: ${pathname}`);
      router.replace(`/sign-in?next=${encodeURIComponent(target)}`);
    }
  }, [session, isLoading, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, refreshSession }}>
      <RoleProvider initialUserId={user?.id ?? null}>
        <IOSSessionManager>{children}</IOSSessionManager>
      </RoleProvider>
    </AuthContext.Provider>
  );
}

// ── AuthProviderWrapper ───────────────────────────────────────────────────────
// Public component. Creates the Supabase browser client, manages session state,
// wires up onAuthStateChange + visibilitychange/pageshow listeners, and
// provides SessionContextProvider + InternalAuthProvider to the tree.

export function AuthProviderWrapper({
  children,
  session: propSession,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  // NEXT_PUBLIC_SUPABASE_URL_BROWSER is the browser-accessible URL.
  // NEXT_PUBLIC_SUPABASE_URL may be the Docker-internal kong hostname which
  // browsers cannot resolve. Always prefer the browser-specific variable.
  const supabase = useMemo(
    () =>
      createBrowserClient(
        getBrowserSupabaseUrl(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [initialSession, setInitialSession] = useState<Session | null>(propSession ?? null);
  const [liveSession, setLiveSession]       = useState<Session | null>(propSession ?? null);
  const [sessionFetched, setSessionFetched] = useState(!!propSession);

  const isAuthLoading    = !sessionFetched;
  const pendingRefreshRef = useRef(false);

  // ── forceRefreshSession ────────────────────────────────────────────────────
  // Called by InternalAuthProvider (manual refresh), iOS handlers, and the
  // ?refresh=true query-param flow. Safe to call from any closure — supabase
  // is stable (useMemo with empty deps).

  const forceRefreshSession = () => {
    supabase.auth
      .getSession()
      .then(({ data: { session: fetchedSession } }) => {
        console.log(
          "[AuthProvider] ✅ Forced session fetched:",
          fetchedSession ? "authenticated" : "not authenticated"
        );

        if (fetchedSession?.user) {
          authLogger.memberSessionRestored(
            fetchedSession.user.id,
            fetchedSession.user.email || ""
          );
        }

        setInitialSession(fetchedSession);
        setLiveSession(fetchedSession);
        setSessionFetched(true);
      })
      .catch((e) => console.error("[AuthProvider] ❌ Forced session fetch failed:", e));
  };

  // ── ?refresh=true handling ─────────────────────────────────────────────────
  // Post-login redirect lands with ?refresh=true. Strip the param and force an
  // immediate session sync so the UI reflects the newly authenticated state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("refresh") === "true") {
      console.log("[AuthProvider] 🔑 ?refresh=true detected — forcing immediate session sync");
      pendingRefreshRef.current = true;
      params.delete("refresh");
      const newUrl =
        window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
      setTimeout(() => {
        pendingRefreshRef.current = false;
        forceRefreshSession();
      }, 200);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial client-side session fetch ─────────────────────────────────────
  useEffect(() => {
    if (!sessionFetched) {
      console.log("[AuthProvider] 🔄 Fetching session client-side...");
      forceRefreshSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFetched]);

  // ── Auth state change listener ─────────────────────────────────────────────
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log(
        "[AuthProvider] 🔄 Auth state changed:",
        event,
        newSession ? "authenticated" : "not authenticated"
      );

      // Suppress the null INITIAL_SESSION that fires immediately after login
      // while a forced refresh is already in flight.
      if (event === "INITIAL_SESSION" && !newSession && pendingRefreshRef.current) {
        console.log("[AuthProvider] ⏳ Skipping null INITIAL_SESSION — post-login refresh pending");
        return;
      }

      setInitialSession(newSession);
      setLiveSession(newSession);
      setSessionFetched(true);

      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED"
      ) {
        console.log("[AuthProvider] 📢 Broadcasting auth event to components:", event);
        window.dispatchEvent(
          new CustomEvent("supabase-auth-change", {
            detail: { event, session: newSession },
          })
        );
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // ── iOS / background-tab session refresh ───────────────────────────────────
  // visibilitychange fires when a backgrounded tab comes back; pageshow fires
  // on bfcache restores. Both cases need a fresh session check on iOS Safari.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        console.log("[AuthProvider] 👀 visibilitychange => refreshing session");
        iosSessionHelpers.refreshSession();
        forceRefreshSession();
      }
    };

    const onPageShow = () => {
      console.log("[AuthProvider] 📲 pageshow => refreshing session");
      iosSessionHelpers.refreshSession();
      forceRefreshSession();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={initialSession}>
      <InternalAuthProvider
        forceRefreshSession={forceRefreshSession}
        session={liveSession}
        isLoading={isAuthLoading}
      >
        {children}
      </InternalAuthProvider>
    </SessionContextProvider>
  );
}
