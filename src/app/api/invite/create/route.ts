// app/api/invite/create/route.ts
// Admin: mint an invite for a given role. Was previously unguarded — any
// caller (no auth required at all) could POST here with { role: "admin" }
// and hand themselves an admin invite link, then redeem it. Fixed 2026-08-10
// alongside the invites/roles RLS lockdown (see migration
// invite_security_lockdown_and_role_ladder). Also now records who minted
// the invite (inviter_id was always null before).
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const { role } = await req.json();

  if (!role || typeof role !== "string") {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }

  // 1. Look up role ID
  const { data: roleData, error: roleError } = await guard.admin
    .from("roles")
    .select("id")
    .eq("role", role)
    .single();

  if (roleError || !roleData) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // 2. Create invite
  const code = randomUUID();
  const { error: insertError } = await guard.admin
    .from("invites")
    .insert([{ code, role_id: roleData.id, inviter_id: guard.userId }]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 3. Generate invite link with `role` param included for Open Graph preview
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/sign-up?invite=${code}&role=${role}`;

  return NextResponse.json({ inviteLink: url });
}
