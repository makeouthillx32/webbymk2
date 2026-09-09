import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/utils/supabase/admin";

const OBJECT_PATH = /^clips\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/;

function publicObjectUrl(path: string) {
  const base = (
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://db.unenter.live"
  ).replace(/\/$/, "");
  return `${base}/storage/v1/object/public/tank-soundboard/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function soundKey(name: string, path: string) {
  const slug =
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "sound";
  return `${slug}-${createHash("sha256").update(path).digest("hex").slice(0, 10)}`;
}

export async function handleAdminSfxPost(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const category = typeof body.category === "string" ? body.category.trim().toLowerCase().slice(0, 40) : "general";
  const iconUrl = typeof body.iconUrl === "string" ? body.iconUrl.trim() : null;
  const tokenCost = typeof body.tokenCost === "number" && body.tokenCost >= 0 ? body.tokenCost : 75;

  if (!OBJECT_PATH.test(path) || !name) {
    return NextResponse.json({ error: "Invalid soundboard object path or name." }, { status: 400 });
  }

  const admin = createAdminClient();
  const row = {
    sound_key: soundKey(name, path),
    name: name.replace(/\.[^.]+$/, ""),
    file_url: publicObjectUrl(path),
    icon_url: iconUrl,
    category: /^[a-z0-9][a-z0-9_-]{0,39}$/.test(category) ? category : "general",
    default_volume: 1,
    is_premium: false,
    token_cost: tokenCost,
    is_active: true,
  };

  const { data, error } = await admin
    .from("tank_sfx_library")
    .upsert(row, { onConflict: "sound_key" })
    .select("id, sound_key, name, file_url, icon_url, category, token_cost")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, sfx: data });
}

export async function handleAdminSfxPatch(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const soundKeyVal = typeof body.soundKey === "string" ? body.soundKey : null;

  if (!id && !soundKeyVal) {
    return NextResponse.json({ error: "id or soundKey is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 100);
  }
  if (typeof body.category === "string" && body.category.trim()) {
    updates.category = body.category.trim().toLowerCase().slice(0, 40);
  }
  if ("iconUrl" in body) {
    updates.icon_url = typeof body.iconUrl === "string" && body.iconUrl.trim() ? body.iconUrl.trim() : null;
  }
  if (typeof body.tokenCost === "number" && body.tokenCost >= 0) {
    updates.token_cost = body.tokenCost;
  }
  if (typeof body.defaultVolume === "number") {
    updates.default_volume = Math.max(0, Math.min(1, body.defaultVolume));
  }
  if (typeof body.isActive === "boolean") {
    updates.is_active = body.isActive;
  }

  const admin = createAdminClient();
  let query = admin.from("tank_sfx_library").update(updates);
  if (id) query = query.eq("id", id);
  else if (soundKeyVal) query = query.eq("sound_key", soundKeyVal);

  const { data, error } = await query
    .select("id, sound_key, name, file_url, icon_url, category, token_cost, default_volume, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, sfx: data });
}

export async function handleAdminSfxDelete(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  const id = typeof body.id === "string" ? body.id : null;

  const admin = createAdminClient();
  let query = admin.from("tank_sfx_library").delete();
  if (id) {
    query = query.eq("id", id);
  } else if (OBJECT_PATH.test(path)) {
    query = query.eq("file_url", publicObjectUrl(path));
  } else {
    return NextResponse.json({ error: "Invalid soundboard object or ID." }, { status: 400 });
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
