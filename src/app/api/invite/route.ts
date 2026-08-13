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

  // join roles on role_id to get the actual role name
  const { data, error } = await guard.admin
    .from("invites")
    .select(
      `
      code,
      role_id,
      roles!role_id (
        role
      ),
      created_at,
      max_uses,
      expires_at,
      inviter_id,
      profiles!inviter_id (
        avatar_url
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/invite error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const defaultAvatarUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/default-avatar.png`;

  const invites = (data ?? []).map((i) => ({
    code: i.code,
    role: (i.roles as any)?.[0]?.role ?? i.role_id, // decoded role name
    inviter: {
      name: i.inviter_id, // still fallback to UUID
      avatar: (i.profiles as any)?.[0]?.avatar_url || defaultAvatarUrl,
    },
    uses: 0,
    max_uses: i.max_uses,
    expires_at: i.expires_at,
  }));

  return NextResponse.json(invites);
}
