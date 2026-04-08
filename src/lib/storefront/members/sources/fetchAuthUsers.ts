// lib/storefront/members/sources/fetchAuthUsers.ts
import { AuthUserRow } from "../types";

/**
 * Fetches authenticated accounts (admin/member).
 * Implementation depends on your existing /api/get-all-users route logic.
 * We'll wire this to the actual Supabase Admin call once we confirm your schema + current route.
 */
export async function fetchAuthUsers(): Promise<AuthUserRow[]> {
  // PLACEHOLDER:
  // Option A (recommended): move the logic from /api/get-all-users into here.
  // Option B: call that route internally (not recommended long term).
  return [];
}
