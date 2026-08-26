// lib/research/requireResearcherRole.ts
//
// Research-checkout gate: being signed in isn't enough on its own — the
// signed-in profile also needs role='researcher' (a deliberate opt-in
// upgrade at /research-access, see requestResearcherAccessAction in
// src/actions/auth/actions.ts) or 'admin'. Previously every research-cart/
// checkout route only checked `auth.getUser()`, so any shop member could
// buy research compounds — and briefly, every new signup anywhere on the
// platform (Tank included) got researcher for free just by accepting the
// general ToS. Both fixed; this is now the only path in.
import type { SupabaseClient } from "@supabase/supabase-js";

export const RESEARCHER_ROLES = ["researcher", "admin"] as const;

export type RequireResearcherResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function requireResearcherRole(
  supabase: SupabaseClient,
  userId: string
): Promise<RequireResearcherResult> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, code: "ROLE_LOOKUP_FAILED", message: error.message };
  }

  if (!profile || !RESEARCHER_ROLES.includes(profile.role as (typeof RESEARCHER_ROLES)[number])) {
    return {
      ok: false,
      status: 403,
      code: "RESEARCHER_REQUIRED",
      message:
        "A researcher account is required to purchase research compounds. Accept the research-use terms at /research-access to unlock checkout.",
    };
  }

  return { ok: true };
}
