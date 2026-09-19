// src/zones/tank/public/pendingVerification.ts
// ─────────────────────────────────────────────────────────────────────────────
// Remembering that somebody signed up but never finished.
//
// THE DEAD END THIS EXISTS TO REMOVE. A viewer registers, the verify screen
// appears, and then they refresh, close the tab, or come back tomorrow. Now
// they are in the one state Tank had no path out of:
//
//   · they cannot sign in — the account is unverified
//   · they cannot register — the address already exists
//   · the verify screen with its "resend" button is gone
//
// That is exactly where Christin sat after the http://kong links went out: a
// real person, a real account, and nothing on screen offering a way forward.
// The only recovery was an admin deleting the account by hand.
//
// So the browser remembers the pending address and puts the verify screen back
// on the next visit. Deliberately NOT a cookie or a server session: the person
// is not authenticated yet, and this is a convenience hint, never a credential.
// It holds an email address and nothing else — no token, no password, nothing
// that grants access on its own.
// ─────────────────────────────────────────────────────────────────────────────

import { safeStorage } from "@/lib/safeStorage";

const KEY = "tank_pending_verification";

/**
 * How long to keep offering to finish a signup.
 *
 * Long enough to cover "I'll do it tonight" and a weekend, short enough that a
 * shared or borrowed browser is not still volunteering a stranger's address
 * weeks later.
 */
export const PENDING_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingVerification = { email: string; at: number };

export function rememberPendingVerification(email: string): void {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return;
  try {
    safeStorage.setItem(KEY, JSON.stringify({ email: clean, at: Date.now() }));
  } catch {
    // Private windows and blocked site data throw here. Losing the hint costs
    // the viewer a click on "finish signing up"; it must never cost them the page.
  }
}

export function clearPendingVerification(): void {
  try {
    safeStorage.removeItem(KEY);
  } catch {}
}

/**
 * The address waiting to be verified, if there is one and it is still fresh.
 *
 * Expired or malformed entries are cleared on read rather than returned, so a
 * stale hint cannot keep reopening a screen the viewer has moved past.
 */
export function readPendingVerification(
  now: number = Date.now(),
): PendingVerification | null {
  try {
    const raw = safeStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingVerification>;
    const email = typeof parsed?.email === "string" ? parsed.email.trim().toLowerCase() : "";
    const at = typeof parsed?.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0;

    if (!email || !at || now - at > PENDING_VERIFICATION_TTL_MS) {
      clearPendingVerification();
      return null;
    }
    return { email, at };
  } catch {
    clearPendingVerification();
    return null;
  }
}
