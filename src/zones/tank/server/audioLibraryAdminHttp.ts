import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/utils/supabase/admin";

const OBJECT_PATH = /^clips\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/;

function publicObjectUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || "https://db.unenter.live").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/tank-soundboard/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function soundKey(name: string, path: string) {
  const slug = name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "sound";
  return `${slug}-${createHash("sha256").update(path).digest("hex").slice(0, 10)}`;
}

export async function handleAdminSfxPost(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const path = typeof body.path === "string" ? body.path : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const category = typeof body.category === "string" ? body.category.trim().toLowerCase().slice(0, 40) : "general";
  if (!OBJECT_PATH.test(path) || !name) return NextResponse.json({ error: "Invalid soundboard object." }, { status: 400 });
  const admin = createAdminClient();
  const row = {
    sound_key: soundKey(name, path),
    name: name.replace(/\.[^.]+$/, ""),
    file_url: publicObjectUrl(path),
    category: /^[a-z0-9][a-z0-9_-]{0,39}$/.test(category) ? category : "general",
    default_volume: 1,
    is_premium: false,
    token_cost: 75,
    is_active: true,
  };
  const { data, error } = await admin.from("tank_sfx_library").upsert(row, { onConflict: "sound_key" }).select("id, sound_key").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, sfx: { id: data.id, soundKey: data.sound_key } });
}

export async function handleAdminSfxDelete(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const path = typeof body.path === "string" ? body.path : "";
  if (!OBJECT_PATH.test(path)) return NextResponse.json({ error: "Invalid soundboard object." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("tank_sfx_library").delete().eq("file_url", publicObjectUrl(path));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
