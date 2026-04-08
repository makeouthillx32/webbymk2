// app/api/saved-carts/route.ts
// GET — returns the viewer's recent saved cart snapshots (newest first, max 10)

import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}
function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const sessionId = request.headers.get("x-session-id");
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    if (!userId && !sessionId) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    let query = supabase
      .from("saved_carts")
      .select("id, label, trigger, source_share_name, items, item_count, subtotal_cents, created_at")
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    query = userId
      ? query.eq("user_id", userId)
      : query.eq("session_id", sessionId!);

    const { data, error } = await query;
    if (error) return jsonError(500, "FETCH_FAILED", "Failed to fetch saved carts");

    return jsonOk(data ?? []);
  } catch (err) {
    console.error("GET /api/saved-carts error:", err);
    return jsonError(500, "INTERNAL", "Internal server error");
  }
}