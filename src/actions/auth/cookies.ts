import { headers, cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { CookieOptions, ProfileCookieRow, ValidRole } from "./types";
import { VALID_ROLES } from "./types";
import { isLastPageExcluded } from "@/lib/protectedRoutes";
import { CORE_DOMAIN } from "@/lib/multiZone";

const SHARED_COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? `.${CORE_DOMAIN}` : undefined;
const APP_AUTH_COOKIE_NAMES = [
  "userRole",
  "userRoleUserId",
  "userDisplayName",
  "userPermissions",
  "rememberMe",
  "lastPage",
] as const;

// "remember" no longer gates duration — it was 30 days vs 24 hours, which
// meant anyone who didn't tick the box got logged out (or at least lost
// role/display-name caching) after a single day. The intent is to hold
// people's sessions as long as possible either way: matches the real
// Supabase session cookie's own lifetime (sb-unenter-auth-token is already
// issued with a 400-day Max-Age by @supabase/ssr, independent of this
// value), so these app-level cookies — a fast cache of role/display name,
// never the source of truth for authorization (RLS and server-side role
// checks don't read them) — don't artificially expire sooner and force a
// stale re-fetch. "remember" is kept as a parameter (unused here) rather
// than removed, since callers still pass it and it may matter again if a
// real short-session mode gets added later.
export const getCookieOptions = async (_remember: boolean): Promise<CookieOptions> => {
  const headerList = await headers();
  const origin = headerList.get("origin") || "";
  const isHttps = origin.startsWith("https://");
  const isProd = process.env.NODE_ENV === "production";

  return {
    path: "/",
    secure: isProd || isHttps,
    sameSite: "lax",
    maxAge: 400 * 24 * 60 * 60,
    domain: SHARED_COOKIE_DOMAIN,
  };
};

export const getAndClearLastPage = async (): Promise<string> => {
  const store = await cookies();
  const lastPageCookie = store.getAll().find((c) => c.name === "lastPage");

  let lastPage = lastPageCookie?.value || "/";
  store.delete("lastPage");

  if (isLastPageExcluded(lastPage)) lastPage = "/";

  return lastPage;
};

export const normalizeRole = (role: unknown): ValidRole => {
  if (typeof role !== "string") return "member";
  if ((VALID_ROLES as readonly string[]).includes(role)) return role as ValidRole;
  return "member";
};

export const populateUserCookies = async (userId: string, remember = false) => {
  try {
    const supabase = await createClient();
    const store = await cookies();
    const cookieOptions = await getCookieOptions(remember);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role, display_name")
      .eq("id", userId)
      .single<ProfileCookieRow>();

    if (profileError) {
      console.error("[Auth] ❌ Profile fetch failed:", profileError.message);
      return;
    }

    const role = normalizeRole(profileData?.role);

    store.set("userRole", role, cookieOptions);
    store.set("userRoleUserId", userId, cookieOptions);
    store.set("rememberMe", remember.toString(), cookieOptions);

    if (profileData?.display_name) {
      store.set("userDisplayName", profileData.display_name, cookieOptions);
    }

    const rolePermissions = await supabase.rpc("get_role_permissions", {
      user_role_type: role,
    });

    if (!rolePermissions.error && rolePermissions.data) {
      const permissionsData = { timestamp: Date.now(), permissions: rolePermissions.data, role };
      store.set("userPermissions", JSON.stringify(permissionsData), {
        ...cookieOptions,
        maxAge: 5 * 60,
      });
    }

    console.log(`[Auth] ✅ Cookies populated (${role}) remember=${remember}`);
  } catch (error) {
    console.error("[Auth] ❌ Cookie population failed:", error);
  }
};

export const clearAuthCookies = async () => {
  const store = await cookies();
  for (const name of APP_AUTH_COOKIE_NAMES) {
    // Clear both the current host's historical cookie and the newer shared
    // Domain=.unenter.live cookie. A Set-Cookie deletion only matches the
    // original cookie when Path and Domain match.
    store.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
    if (SHARED_COOKIE_DOMAIN) {
      store.set(name, "", {
        path: "/",
        domain: SHARED_COOKIE_DOMAIN,
        secure: true,
        sameSite: "lax",
        maxAge: 0,
        expires: new Date(0),
      });
    }
  }
};
