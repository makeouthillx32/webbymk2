// lib/require-admin.ts
// Shared admin guard for privileged API routes. Identifies the caller with
// the cookie-bound client (so it reflects their real session), then requires
// profiles.role = 'admin' before any privileged read/write. Returns a
// service-role admin client for the route to use afterward (so the actual
// query isn't blocked by RLS once the caller has already been verified).
//
// Extracted from lib/creator-admin.ts's requireCreatorAdmin() — that guard
// was correct, it just needed a non-creator-specific name so other admin
// routes (invites, etc.) could reuse it instead of duplicating it or,
// worse, shipping with no guard at all (see the 2026-08-10 invite-system
// privilege-escalation fix — invites/roles had RLS off + full anon grants
// and none of the invite routes checked who was calling).
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireAdminClient(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false as const, status: 401 as const, message: error?.message ?? "Authentication required" };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false as const, status: 403 as const, message: "Admin access required" };
  }

  return { ok: true as const, user: data.user };
}

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }

  return { admin, userId: user.id };
}
