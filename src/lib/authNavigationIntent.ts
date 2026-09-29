const AUTH_NAVIGATION_INTENT_KEY = "__auth_navigation_intent";
const AUTH_NAVIGATION_INTENT_TTL_MS = 10 * 60 * 1000;

type AuthNavigationIntent = {
  createdAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSessionStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Mark this browser tab as the owner of the next interactive sign-in. */
export function markAuthNavigationIntent(
  now = Date.now(),
  storage: StorageLike | null = getSessionStorage(),
): void {
  if (!storage) return;
  try {
    const intent: AuthNavigationIntent = { createdAt: now };
    storage.setItem(
      AUTH_NAVIGATION_INTENT_KEY,
      JSON.stringify(intent),
    );
  } catch {
    // AuthProvider retains a visible-tab fallback when storage is unavailable.
  }
}

export function hasFreshAuthNavigationIntent(
  now = Date.now(),
  storage: StorageLike | null = getSessionStorage(),
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(AUTH_NAVIGATION_INTENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<AuthNavigationIntent>;
    const createdAt = parsed.createdAt;
    if (
      typeof createdAt !== "number" ||
      !Number.isFinite(createdAt) ||
      createdAt > now + 5_000 ||
      now - createdAt > AUTH_NAVIGATION_INTENT_TTL_MS
    ) {
      storage.removeItem(AUTH_NAVIGATION_INTENT_KEY);
      return false;
    }
    return true;
  } catch {
    try {
      storage.removeItem(AUTH_NAVIGATION_INTENT_KEY);
    } catch {}
    return false;
  }
}

export function clearAuthNavigationIntent(
  storage: StorageLike | null = getSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(AUTH_NAVIGATION_INTENT_KEY);
  } catch {}
}
