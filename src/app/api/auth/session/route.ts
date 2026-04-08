import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient("regular");
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return NextResponse.json({ session: null, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ session: data.session ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { session: null, error: e instanceof Error ? e.message : "unknown_error" },
      { status: 200 }
    );
  }
}