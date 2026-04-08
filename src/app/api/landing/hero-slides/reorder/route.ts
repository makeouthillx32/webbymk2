// app/api/landing/hero-slides/reorder/route.ts
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

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return jsonError(401, "unauthorized", "Not signed in");

  const body = (await req.json()) as { order: { id: string; position: number }[] };
  const order = body?.order ?? [];

  // Do sequential updates (fine for small lists)
  let updated = 0;
  for (const item of order) {
    const { error } = await gate.supabase
      .from("hero_slides")
      .update({ position: item.position })
      .eq("id", item.id);

    if (error) return jsonError(500, "db_error", error.message, error);
    updated++;
  }

  return NextResponse.json({ ok: true, data: { updated } });
}