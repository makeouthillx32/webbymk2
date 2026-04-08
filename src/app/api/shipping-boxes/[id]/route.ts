import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

// PATCH update a box
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const body = await req.json();
  const { id } = params;
  const { name, length_in, width_in, height_in, is_default, is_active } = body;

  // If setting as default, clear existing default first
  if (is_default) {
    await supabase
      .from("shipping_boxes")
      .update({ is_default: false })
      .eq("is_default", true)
      .neq("id", id);
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (length_in !== undefined) updates.length_in = length_in;
  if (width_in !== undefined) updates.width_in = width_in;
  if (height_in !== undefined) updates.height_in = height_in;
  if (is_default !== undefined) updates.is_default = is_default;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("shipping_boxes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return jsonError(500, "UPDATE_FAILED", error.message);
  return NextResponse.json({ ok: true, data });
}

// DELETE a box
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { id } = params;

  // Check it's not the default
  const { data: box } = await supabase
    .from("shipping_boxes")
    .select("is_default")
    .eq("id", id)
    .single();

  if (box?.is_default) {
    return jsonError(400, "CANNOT_DELETE_DEFAULT", "Set another box as default before deleting this one");
  }

  const { error } = await supabase.from("shipping_boxes").delete().eq("id", id);
  if (error) return jsonError(500, "DELETE_FAILED", error.message);
  return NextResponse.json({ ok: true });
}