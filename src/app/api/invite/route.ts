// app/api/invite/route.ts
// Admin: list invites. Was previously unguarded (any caller, even
// unauthenticated, could list them) and read via the deprecated
// @supabase/auth-helpers-nextjs client, whose default cookie name doesn't
// match this app's pinned "sb-unenter-auth-token" cookie (see
// utils/supabase/server.ts) — so auth.getUser() here silently returned no
// user regardless of who was signed in. Fixed 2026-08-10 alongside the
// invites/roles RLS lockdown (see migration
// invite_security_lockdown_and_role_ladder).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  // invites.role_id stores the role name directly ("admin", "marketing", …)
  // — roles.id IS the role name too (it's a self-mapping text lookup table,
  // not a surrogate key), so joining roles!role_id(role) just to decode
  // role_id back to itself was a no-op fetch on every page load. Also drops
  // stale rows from before the 2026-08-10 role-ladder migration that carry
  // no role_id/inviter_id at all — they can never be redeemed and only
  // clutter this list.
  const { data, error } = await guard.admin
    .from("invites")
    .select(
      `
      code,
      role_id,
      created_at,
      expires_at,
      inviter_id,
      profiles!inviter_id (
        avatar_url
      )
    `
    )
    .not("role_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/invite error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const defaultAvatarUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/default-avatar.png`;

  const invites = (data ?? []).map((i) => ({
    code: i.code,
    role: i.role_id,
    inviter: {
      name: i.inviter_id, // still fallback to UUID
      avatar: (i.profiles as any)?.[0]?.avatar_url || defaultAvatarUrl,
    },
    expires_at: i.expires_at,
  }));

  return NextResponse.json(invites);
}
