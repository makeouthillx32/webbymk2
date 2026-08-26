// src/lib/safeStorage.ts
// Universal Resilient Storage Adapter with Auto-Eviction & QuotaExceeded Self-Healing
// Prevents Safari/WebKit quota exhaustion from crashing Auth, Supabase, or App state.

const MEMORY_FALLBACK = new Map<string, string>();

const PROTECTED_KEYS = new Set([
  "sb-unenter-auth-token",
  "unenter_session_id",
  "rememberMe",
  "themeId",
  "theme",
  "themeType",
  "unenter_promo_code",
  "unenter_discount_cents",
  "unenter_promo_data",
  "cookieConsent",
  "tank_mobile_chat_size",
  "tank_room_mode",
  "tank_room_slug",
  "tank_room_origin",
  "tank_chat_target",
  "unenter_pos_favorites",
  "tank_settings_v1",
  "tank:assigned-room-key",
  "tank_local_profile",
]);

const EVICTION_CANDIDATE_PATTERNS = [
  /^tank_session_chat_/i,
  /^tank_chat_draft/i,
  /^chat_history_/i,
  /^analytics_/i,
  /^unenter_temp_/i,
  /^unenter-preloader-/i,
  /_cache$/i,
  /_temp$/i,
  /^debug_/i,
];

function isQuotaExceededError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014)
  );
}

function evictNonEssentialKeys(): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  let evictedCount = 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || PROTECTED_KEYS.has(key)) continue;

      if (EVICTION_CANDIDATE_PATTERNS.some((pattern) => pattern.test(key))) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
      evictedCount++;
    }

    // If no candidate patterns matched and quota is still exhausted, evict oldest non-protected keys
    if (evictedCount === 0) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && !PROTECTED_KEYS.has(key)) {
          window.localStorage.removeItem(key);
          evictedCount++;
          if (evictedCount >= 5) break;
        }
      }
    }
  } catch {
    // ignore
  }
  return evictedCount;
}

export const safeStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      if (window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {
      // localStorage read restricted/blocked
    }
    return MEMORY_FALLBACK.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      MEMORY_FALLBACK.set(key, value);
      return;
    }

    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) {
        console.warn(
          `[safeStorage] QuotaExceededError on key "${key}". Running auto-eviction...`,
        );
        const evicted = evictNonEssentialKeys();
        if (evicted > 0) {
          try {
            window.localStorage.setItem(key, value);
            return;
          } catch {
            // still full, fallback to memory
          }
        }
      }
    }

    // Final safety fallback: in-memory persistence ensures zero thrown exceptions
    MEMORY_FALLBACK.set(key, value);
  },

  removeItem(key: string): void {
    if (typeof window === "undefined") {
      MEMORY_FALLBACK.delete(key);
      return;
    }
    try {
      if (window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
    MEMORY_FALLBACK.delete(key);
  },

  clear(): void {
    if (typeof window === "undefined") {
      MEMORY_FALLBACK.clear();
      return;
    }
    try {
      if (window.localStorage) {
        window.localStorage.clear();
      }
    } catch {
      // ignore
    }
    MEMORY_FALLBACK.clear();
  },

  cleanStaleEntries(): void {
    evictNonEssentialKeys();
  },
};

export default safeStorage;
