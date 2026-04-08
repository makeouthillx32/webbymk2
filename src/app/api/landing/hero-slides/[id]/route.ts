// app/api/landing/hero-slides/[id]/route.ts
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (!gate.ok) return jsonError(401, "unauthorized", "Not signed in");

  const patch = await req.json();

  const { data, error } = await gate.supabase
    .from("hero_slides")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return jsonError(500, "db_error", error.message, error);
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireAdmin();
  if (!gate.ok) return jsonError(401, "unauthorized", "Not signed in");

  // Grab row first so we can delete the image from storage
  const { data: slide, error: readErr } = await gate.supabase
    .from("hero_slides")
    .select("id,bucket_name,object_path")
    .eq("id", params.id)
    .single();

  if (readErr) return jsonError(404, "not_found", "Slide not found", readErr);

  const { error: storageErr } = await gate.supabase.storage
    .from(slide.bucket_name)
    .remove([slide.object_path]);

  if (storageErr) return jsonError(500, "storage_error", storageErr.message, storageErr);

  const { error: delErr } = await gate.supabase.from("hero_slides").delete().eq("id", params.id);
  if (delErr) return jsonError(500, "db_error", delErr.message, delErr);

  return NextResponse.json({ ok: true, data: { deleted: true } });
}