// src/app/api/blog/admin/settings/route.ts
// GET   — all blog chrome settings
// PATCH — upsert one or more settings keys

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { jsonError, requireAdmin } from "../_lib";

const ALLOWED_KEYS = ["header", "footer", "promo", "newsletter"] as const;

export async function GET() {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { data, error } = await supabase.from("blog_settings").select("key, value");
  if (error) return jsonError(500, "BLOG_SETTINGS_LIST_FAILED", error.message, error);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[row.key] = row.value;
  return NextResponse.json({ ok: true, data: settings });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError(400, "BAD_REQUEST", "JSON object required");

  const rows = Object.entries(body)
    .filter(([key]) => (ALLOWED_KEYS as readonly string[]).includes(key))
    .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));

  if (rows.length === 0) {
    return jsonError(400, "BAD_REQUEST", `No valid keys. Allowed: ${ALLOWED_KEYS.join(", ")}`);
  }

  const { error } = await supabase.from("blog_settings").upsert(rows, { onConflict: "key" });
  if (error) return jsonError(500, "BLOG_SETTINGS_SAVE_FAILED", error.message, error);

  return NextResponse.json({ ok: true, saved: rows.map((r) => r.key) });
}
