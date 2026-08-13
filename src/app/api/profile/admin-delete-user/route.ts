import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function DELETE(req: Request) {
  // Was previously unauthenticated — auth.getUser() was called but its
  // result was never checked before proceeding, so any caller (signed in or
  // not) could soft-delete any account by uuid. Fixed 2026-08-10 alongside
  // the invite-system audit.
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const body = (await req.json().catch(() => null)) as { uuid?: string } | null;
  const uuid = body?.uuid;
  if (!uuid) return NextResponse.json({ error: "Missing UUID" }, { status: 400 });

  const supabase = guard.admin;
  const { error } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString(), deleted_by: guard.userId })
    .eq("id", uuid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "✅ Profile flagged for deletion", uuid });
}
