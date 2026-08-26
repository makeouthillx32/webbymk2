// app/api/invite/[code]/route.ts
// Admin: revoke an invite. Was previously unguarded — any caller could
// delete any invite by code. Fixed 2026-08-10 alongside the invites/roles
// RLS lockdown (see migration invite_security_lockdown_and_role_ladder).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const { code } = await params;

  const { error } = await guard.admin.from("invites").delete().eq("code", code);

  if (error) {
    console.error(`DELETE /api/invite/${code} error:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
