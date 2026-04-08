import { headers, cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { CookieOptions, ProfileCookieRow, ValidRole } from "./types";
import { VALID_ROLES } from "./types";

const EXCLUDED_LASTPAGE = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/callback/oauth",
  "/auth/logout",
];

const EXCLUDED_PREFIXES = ["/dashboard", "/settings", "/protected"];

export const getCookieOptions = async (remember: boolean): Promise<CookieOptions> => {
  const headerList = await headers();
  const origin = headerList.get("origin") || "";
  const isHttps = origin.startsWith("https://");
  const isProd = process.env.NODE_ENV === "production";

  return {
    path: "/",
    secure: isProd || isHttps,
    sameSite: "lax",
    maxAge: remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60,
  };
};

export const getAndClearLastPage = async (): Promise<string> => {
  const store = await cookies();
  const lastPageCookie = store.getAll().find((c) => c.name === "lastPage");

  let lastPage = lastPageCookie?.value || "/";
  store.delete("lastPage");

  const pageWithoutHash = lastPage.split("#")[0].split("?")[0];
  const isExcluded =
    EXCLUDED_LASTPAGE.includes(pageWithoutHash) ||
    EXCLUDED_PREFIXES.some((prefix) => pageWithoutHash.startsWith(prefix));

  if (isExcluded) lastPage = "/";

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
  store.delete("userRole");
  store.delete("userRoleUserId");
  store.delete("userDisplayName");
  store.delete("userPermissions");
  store.delete("rememberMe");
  store.delete("lastPage");
};