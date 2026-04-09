// app/api/landing/static-pages/[id]/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false as const };
  return { ok: true as const, supabase };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return jsonError(401, "unauthorized", "Not signed in");

  const { id } = await params;
  const patch = await req.json();

  const { data, error } = await gate.supabase
    .from("static_pages")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return jsonError(500, "db_error", error.message, error);
  return NextResponse.json({ ok: true, data });
}