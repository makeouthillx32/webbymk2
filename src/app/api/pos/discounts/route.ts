// app/api/pos/discounts/route.ts
// Returns all active, infinite-use discounts for the POS discount picker.

import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("discounts")
      .select("id, code, label, type, percent_off, amount_off_cents")
      .eq("is_active", true)
      .is("max_uses", null)           // infinite-use only
      .order("label", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ discounts: data ?? [] });
  } catch (err: any) {
    console.error("[pos/discounts]", err);
    return NextResponse.json({ discounts: [] }, { status: 500 });
  }
}