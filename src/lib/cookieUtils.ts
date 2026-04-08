// lib/cookieUtils.ts
const DEFAULT_PATH = "/";
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60;
const DEFAULT_SAME_SITE = "lax";

interface CookieOptions {
  path?: string;
  maxAge?: number;
  expires?: Date;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
  domain?: string;
}

interface StorageItem<T> {
  value: T;
  expiry: number | null;
  timestamp: number;
  userId?: string;
  version?: string;
}

const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

export const CACHE_EXPIRY = {
  MINUTE: 60,
  HOUR: 60 * 60,
  DAY: 24 * 60 * 60,
  WEEK: 7 * 24 * 60 * 60,
} as const;

export const CACHE_KEYS = {
  CURRENT_USER: "current_user",
  USER_PROFILE: (userId: string) => `user_profile_${userId}`,
  USER_PERMISSIONS: (userId: string) => `user_permissions_${userId}`,
  USER_THEME: (userId: string) => `user_theme_${userId}`,
  THEMES: "available_themes",
  THEME_FONTS: "theme_fonts",
  THEME_METADATA: "theme_metadata",
} as const;

const USER_ROLE_CACHE_KEYS = {
  USER_PROFILE: (userId: string) => `profile_${userId}`,
  USER_PERMISSIONS: (userId: string) => `permissions_${userId}`,
  USER_THEME: (userId: string) => `theme_${userId}`,
} as const;

/**
 * IMPORTANT:
 * - Treat "role/audience" as derived from session + DB profile.
 * - Do NOT treat "userRole" as an auth cookie.
 * - Do NOT do iOS "backup" for roles.
 */
const isAuthCookieName = (name: string): boolean => {
  // NOTE: removed "userRole" on purpose
  return (
    name.includes("auth") ||
    name.includes("session") ||
    name.includes("supabase")
  );
};

export const setCookie = (
  name: string,
  value: string,
  options?: CookieOptions
): void => {
  try {
    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    cookieString += `; path=${options?.path || DEFAULT_PATH}`;

    const isIOS = isIOSDevice();
    const isAuthCookie = isAuthCookieName(name);

    if (options?.expires) {
      cookieString += `; expires=${options.expires.toUTCString()}`;
    } else if (options?.maxAge !== undefined) {
      cookieString += `; max-age=${options.maxAge}`;
    } else {
      const maxAge = isIOS && isAuthCookie ? 30 * 24 * 60 * 60 : DEFAULT_MAX_AGE;
      cookieString += `; max-age=${maxAge}`;
    }

    // Auth cookies: keep strict defaults
    if (isAuthCookie) {
      cookieString += "; secure";
      cookieString += "; samesite=lax";
    } else {
      if (options?.domain) cookieString += `; domain=${options.domain}`;
      if (
        options?.secure ||
        (typeof window !== "undefined" && window.location.protocol === "https:")
      )
        cookieString += "; secure";
      if (options?.httpOnly) cookieString += "; httponly";
      cookieString += `; samesite=${options?.sameSite || DEFAULT_SAME_SITE}`;
    }

    if (typeof document !== "undefined") {
      document.cookie = cookieString;

      // iOS fallback ONLY for auth cookies (NOT roles)
      if (isIOS && isAuthCookie) {
        try {
          localStorage.setItem(
            `backup_${name}`,
            JSON.stringify({
              value,
              timestamp: Date.now(),
              maxAge: options?.maxAge || 30 * 24 * 60 * 60,
            })
          );
        } catch {}
      }
    }
  } catch (e) {
    console.error(`[Cookie] Error setting ${name}:`, e);
  }
};

export const getCookie = (name: string): string | null => {
  try {
    if (typeof document === "undefined") return null;

    const cookies = document.cookie.split(";").map((c) => c.trim());
    const encodedName = encodeURIComponent(name);
    const cookie = cookies.find((c) => c.startsWith(`${encodedName}=`));

    if (cookie) {
      const value = cookie.split("=")[1];
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }

    // iOS fallback ONLY for auth cookies (NOT roles)
    const isIOS = isIOSDevice();
    const isAuthCookie = isAuthCookieName(name);

    if (isIOS && isAuthCookie && typeof localStorage !== "undefined") {
      try {
        const backupData = localStorage.getItem(`backup_${name}`);
        if (backupData) {
          const parsed = JSON.parse(backupData);
          const age = (Date.now() - parsed.timestamp) / 1000;
          if (age < parsed.maxAge) return parsed.value;
          localStorage.removeItem(`backup_${name}`);
        }
      } catch {}
    }

    return null;
  } catch (e) {
    console.error(`[Cookie] Error getting ${name}:`, e);
    return null;
  }
};

export const removeCookie = (
  name: string,
  options?: Pick<CookieOptions, "path" | "domain">
): void => {
  setCookie(name, "", { ...options, expires: new Date(0), maxAge: 0 });
  if (isIOSDevice()) {
    try {
      localStorage.removeItem(`backup_${name}`);
    } catch {}
  }
};

export const setJSONCookie = <T>(
  name: string,
  value: T,
  options?: CookieOptions
): void => {
  try {
    setCookie(name, JSON.stringify(value), options);
  } catch (e) {
    console.error(`[Cookie] Error stringifying JSON for cookie ${name}:`, e);
  }
};

export const getJSONCookie = <T>(name: string, defaultValue?: T): T | null => {
  const cookie = getCookie(name);
  if (!cookie) return defaultValue || null;
  try {
    return JSON.parse(cookie) as T;
  } catch {
    removeCookie(name);
    return defaultValue || null;
  }
};

const CACHE_VERSION = "1.2.0";

export const storage = {
  set: <T>(key: string, value: T, expiryInSeconds?: number, userId?: string): void => {
    const item: StorageItem<T> = {
      value,
      expiry: expiryInSeconds ? Date.now() + expiryInSeconds * 1000 : null,
      timestamp: Date.now(),
      userId,
      version: CACHE_VERSION,
    };

    const serializedItem = JSON.stringify(item);

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, serializedItem);
        return;
      }
    } catch {}

    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(key, serializedItem);
        return;
      }
    } catch {}

    try {
      if (serializedItem.length < 3000) {
        setJSONCookie(key, item, { maxAge: expiryInSeconds || DEFAULT_MAX_AGE });
        return;
      }
    } catch {}
  },

  get: <T>(key: string, defaultValue?: T, expectedUserId?: string): T | null => {
    const sources = [
      { name: "localStorage", storage: typeof localStorage !== "undefined" ? localStorage : null },
      { name: "sessionStorage", storage: typeof sessionStorage !== "undefined" ? sessionStorage : null },
      { name: "cookie", storage: { getItem: (k: string) => getJSONCookie(k) } },
    ];

    for (const { storage: source } of sources) {
      if (!source) continue;
      try {
        const rawItem = (source as any).getItem(key);
        if (!rawItem) continue;

        const item: StorageItem<T> =
          typeof rawItem === "string" ? JSON.parse(rawItem) : rawItem;

        if (item.version !== CACHE_VERSION) {
          storage.remove(key);
          continue;
        }

        if (item.expiry && Date.now() > item.expiry) {
          storage.remove(key);
          continue;
        }

        if (expectedUserId && item.userId && item.userId !== expectedUserId) continue;

        return item.value;
      } catch {
        continue;
      }
    }

    return defaultValue || null;
  },

  remove: (key: string): void => {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch {}
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
    } catch {}
    try {
      removeCookie(key);
    } catch {}
  },

  has: (key: string, expectedUserId?: string): boolean =>
    storage.get(key, undefined, expectedUserId) !== null,

  debug: (key: string): { [source: string]: any } => {
    const result: { [source: string]: any } = {};

    try {
      if (typeof localStorage !== "undefined") {
        const item = localStorage.getItem(key);
        result.localStorage = item
          ? { exists: true, size: item.length, preview: item.slice(0, 100) + "..." }
          : { exists: false };
      }
    } catch (e: any) {
      result.localStorage = { error: e?.message || String(e) };
    }

    try {
      if (typeof sessionStorage !== "undefined") {
        const item = sessionStorage.getItem(key);
        result.sessionStorage = item
          ? { exists: true, size: item.length, preview: item.slice(0, 100) + "..." }
          : { exists: false };
      }
    } catch (e: any) {
      result.sessionStorage = { error: e?.message || String(e) };
    }

    try {
      const item = getCookie(key);
      result.cookie = item
        ? { exists: true, size: item.length, preview: item.slice(0, 100) + "..." }
        : { exists: false };
    } catch (e: any) {
      result.cookie = { error: e?.message || String(e) };
    }

    return result;
  },

  cleanup: (): void => {
    const storages = [
      { storage: typeof localStorage !== "undefined" ? localStorage : null },
      { storage: typeof sessionStorage !== "undefined" ? sessionStorage : null },
    ];

    storages.forEach(({ storage: store }) => {
      if (!store) return;
      const keysToRemove: string[] = [];

      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key) continue;

        try {
          const item = store.getItem(key);
          if (!item) continue;
          const parsed: StorageItem<any> = JSON.parse(item);
          if ((parsed as any).expiry && Date.now() > (parsed as any).expiry) keysToRemove.push(key);
        } catch {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((k) => store.removeItem(k));
    });
  },
};

if (typeof window !== "undefined") {
  storage.cleanup();
  setInterval(() => {
    storage.cleanup();
  }, 10 * 60 * 1000);
}

export const getLastPageForRedirect = (): string => {
  const lastPage = getCookie("lastPage");
  if (!lastPage) return "/";

  const excludedPages = ["/sign-in", "/sign-up", "/forgot-password", "/protected/reset-password"];
  if (excludedPages.includes(lastPage)) return "/";

    // ✅ Also exclude any /protected/* path
  if (lastPage.startsWith("/protected/")) return "/";


  if (lastPage.startsWith("/#")) return "/";

  return lastPage;
};

/**
 * NOTE:
 * If you *must* store a UI hint for role/audience, keep it minimal,
 * but do NOT let it override DB/session truth.
 */
const VALID_USER_ROLES = ["admin", "member", "guest"] as const;
type ValidUserRole = (typeof VALID_USER_ROLES)[number];

export const userRoleCookies = {
  setUserRole: (role: string, userId?: string): boolean => {
    try {
      if (!VALID_USER_ROLES.includes(role as ValidUserRole)) return false;

      const cookieOptions: CookieOptions = {
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
        secure: typeof window !== "undefined" && window.location.protocol === "https:",
        sameSite: "lax",
      };

      setCookie("userRole", role, cookieOptions);
      if (userId) setCookie("userRoleUserId", userId, cookieOptions);

      return true;
    } catch {
      return false;
    }
  },

  getUserRole: (expectedUserId?: string): ValidUserRole | null => {
    try {
      const role = getCookie("userRole");
      const storedUserId = getCookie("userRoleUserId");

      if (!role || !VALID_USER_ROLES.includes(role as ValidUserRole)) {
        if (role) userRoleCookies.clearUserRole();
        return null;
      }

      if (expectedUserId && storedUserId && storedUserId !== expectedUserId) {
        userRoleCookies.clearUserRole();
        return null;
      }

      return role as ValidUserRole;
    } catch {
      return null;
    }
  },

  isRoleValidForUser: (userId: string): boolean => getCookie("userRoleUserId") === userId,

  clearUserRole: (): void => {
    try {
      removeCookie("userRole");
      removeCookie("userRoleUserId");
    } catch {}
  },

  updateRoleIfChanged: (newRole: string, userId?: string): boolean => {
    const currentRole = userRoleCookies.getUserRole(userId);
    if (currentRole !== (newRole as any)) return userRoleCookies.setUserRole(newRole, userId);
    return true;
  },
};

/**
 * iOS helpers: keep cleanup, but DO NOT re-set role cookies.
 * (Role should always come from session/profile at runtime.)
 */
export const iosSessionHelpers = {
  setupIOSHandlers: (): (() => void) | undefined => {
    if (!isIOSDevice()) return undefined;

    const handleVisibilityChange = () => {
      // Intentionally no-op for roles
      // If you need auth refresh, do it via Supabase client/session, not cookie role replay.
      return;
    };

    const handlePageShow = (_event: PageTransitionEvent) => {
      handleVisibilityChange();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    const refreshInterval = setInterval(() => {
      handleVisibilityChange();
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      clearInterval(refreshInterval);
    };
  },

  refreshSession: (): void => {
    // Intentionally no-op for roles
    return;
  },
};

export const cacheHelper = {
  cacheUserProfile: (userId: string, profileData: any): void => {
    storage.set(USER_ROLE_CACHE_KEYS.USER_PROFILE(userId), profileData, CACHE_EXPIRY.HOUR, userId);
  },
  getCachedUserProfile: (userId: string): any | null =>
    storage.get(USER_ROLE_CACHE_KEYS.USER_PROFILE(userId), null, userId),

  cacheUserPermissions: (userId: string, permissionsData: any): void => {
    storage.set(
      USER_ROLE_CACHE_KEYS.USER_PERMISSIONS(userId),
      permissionsData,
      CACHE_EXPIRY.HOUR,
      userId
    );
  },
  getCachedUserPermissions: (userId: string): any | null =>
    storage.get(USER_ROLE_CACHE_KEYS.USER_PERMISSIONS(userId), null, userId),

  cacheThemes: (themes: any[]): void => {
    storage.set(CACHE_KEYS.THEMES, themes, CACHE_EXPIRY.DAY);
  },
  getCachedThemes: (): any[] | null => storage.get(CACHE_KEYS.THEMES),

  cacheThemeFonts: (fonts: any[]): void => {
    storage.set(CACHE_KEYS.THEME_FONTS, fonts, CACHE_EXPIRY.WEEK);
  },
  getCachedThemeFonts: (): any[] | null => {
    const fonts = storage.get(CACHE_KEYS.THEME_FONTS);
    return fonts && Array.isArray(fonts) ? fonts : null;
  },

  cacheUserTheme: (userId: string, themeData: any): void => {
    storage.set(CACHE_KEYS.USER_THEME(userId), themeData, CACHE_EXPIRY.WEEK, userId);
  },
  getCachedUserTheme: (userId: string): any | null =>
    storage.get(CACHE_KEYS.USER_THEME(userId), null, userId),

  invalidateThemeCaches: (): void => {
    storage.remove(CACHE_KEYS.THEMES);
    storage.remove(CACHE_KEYS.THEME_FONTS);
    storage.remove(CACHE_KEYS.THEME_METADATA);
  },
};

export const roleDebug = {
  getDebugInfo: (userId?: string): any => ({
    cookies: {
      userRole: getCookie("userRole"),
      userRoleUserId: getCookie("userRoleUserId"),
      themeId: getCookie("themeId"),
      lastPage: getCookie("lastPage"),
    },
    storage: userId
      ? {
          profile: storage.debug(USER_ROLE_CACHE_KEYS.USER_PROFILE(userId)),
          permissions: storage.debug(USER_ROLE_CACHE_KEYS.USER_PERMISSIONS(userId)),
        }
      : null,
    validation: {
      validRoles: VALID_USER_ROLES,
      isRoleValid: userId ? userRoleCookies.isRoleValidForUser(userId) : "N/A",
      isIOSDevice: isIOSDevice(),
    },
  }),

  logDebugInfo: (userId?: string): void => {
    const info = roleDebug.getDebugInfo(userId);
    console.group("[RoleDebug]");
    console.log(info);
    console.groupEnd();
  },
};

export const profileCache = {
  setProfile: (userId: string, profileData: any): void => {
    // Cache only. DO NOT write role cookies here.
    storage.set(USER_ROLE_CACHE_KEYS.USER_PROFILE(userId), profileData, CACHE_EXPIRY.HOUR, userId);
  },

  getProfile: (userId: string): any | null =>
    storage.get(USER_ROLE_CACHE_KEYS.USER_PROFILE(userId), null, userId),

  setPermissions: (userId: string, permissions: any): void => {
    storage.set(
      USER_ROLE_CACHE_KEYS.USER_PERMISSIONS(userId),
      permissions,
      CACHE_EXPIRY.HOUR,
      userId
    );
  },

  getPermissions: (userId: string): any | null =>
    storage.get(USER_ROLE_CACHE_KEYS.USER_PERMISSIONS(userId), null, userId),

  clearUserCaches: (userId: string): void => {
    storage.remove(USER_ROLE_CACHE_KEYS.USER_PROFILE(userId));
    storage.remove(USER_ROLE_CACHE_KEYS.USER_PERMISSIONS(userId));
    userRoleCookies.clearUserRole();
  },
};
