import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

// GET all shipping boxes
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_boxes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return jsonError(500, "FETCH_FAILED", error.message);
  return NextResponse.json({ ok: true, data });
}

// POST create new box
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { name, length_in, width_in, height_in, is_default } = body;

  if (!name || length_in == null || width_in == null || height_in == null) {
    return jsonError(400, "MISSING_FIELDS", "name, length_in, width_in, height_in are required");
  }

  // If setting as default, clear existing default first
  if (is_default) {
    await supabase.from("shipping_boxes").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("shipping_boxes")
    .insert({ name, length_in, width_in, height_in, is_default: !!is_default })
    .select()
    .single();

  if (error) return jsonError(500, "CREATE_FAILED", error.message);
  return NextResponse.json({ ok: true, data }, { status: 201 });
}