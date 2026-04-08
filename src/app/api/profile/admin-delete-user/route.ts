import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { uuid?: string } | null;
  const uuid = body?.uuid;
  if (!uuid) return NextResponse.json({ error: "Missing UUID" }, { status: 400 });
  const supabase = await createClient("service");
  const { data: me } = await supabase.auth.getUser();
  const deletedBy = me?.user?.id ?? null;
  const { error } = await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
    .eq("id", uuid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "✅ Profile flagged for deletion", uuid });
}
