// app/api/apply-invite/route.ts
// Signed-in user redeems an invite code to change their own role. Deliberately
// NOT admin-gated — the whole point is a regular user applying a code an
// admin already handed them. Previously used the deprecated
// @supabase/auth-helpers-nextjs client, whose default cookie name doesn't
// match this app's pinned "sb-unenter-auth-token" cookie (see
// utils/supabase/server.ts), so auth.getUser() here likely returned no user
// most of the time regardless of who was signed in — switched to the app's
// standard client 2026-08-10. Also now reads/writes through the admin client
// once identity is confirmed, since invites/roles got RLS-locked to
// service_role-only in the same pass (see migration
// invite_security_lockdown_and_role_ladder).
//
// Note: invite_specializations / user_specializations (steps 4-5 below) do
// not exist in the live schema — that block is a no-op today, left in place
// rather than silently dropped so it's obvious this needs a real table (or
// removal) before it's relied on.
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(req: Request) {
  const { invite } = await req.json();

  if (!invite || typeof invite !== "string") {
    return NextResponse.json({ error: "invite code is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No authenticated user" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Find invite
  const { data: inviteData, error: inviteError } = await admin
    .from("invites")
    .select("role_id, code, expires_at, max_uses")
    .eq("code", invite)
    .single();

  if (inviteError || !inviteData) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 400 });
  }

  // 2. Get role name
  const { data: roleData } = await admin
    .from("roles")
    .select("role")
    .eq("id", inviteData.role_id)
    .single();

  if (!roleData) {
    return NextResponse.json({ error: "Role not found" }, { status: 400 });
  }

  // 3. Update user profile with role
  await admin.from("profiles").update({ role: roleData.role }).eq("id", user.id);

  // 4. Fetch specializations attached to the invite (no-op today, see header note)
  const { data: specializations } = await admin
    .from("invite_specializations")
    .select("specialization_id, created_by")
    .eq("invite_code", invite);

  // 5. Manually insert specializations (if any)
  if (specializations && specializations.length > 0) {
    const inserts = specializations.map((spec) => ({
      user_id: user.id,
      specialization_id: spec.specialization_id,
      assigned_by: spec.created_by,
    }));

    await admin.from("user_specializations").insert(inserts);
  }

  // 6. Delete invite after use
  await admin.from("invites").delete().eq("code", invite);

  return NextResponse.json({ success: true, role: roleData.role });
}
