// src/app/api/landing/footer-artwork/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Footer decoration artwork slots.
//
//   GET    — current artwork for each slot (null = still using the built-in SVG)
//   POST   — upload a replacement (multipart: `slot`, `file`)
//   DELETE — clear a slot (?slot=polygon) and revert to the built-in SVG
//
// Slots map to site_assets keys under scope 'core-landing':
//   polygon → footer.decor.polygon    (bottom-left angular shape)
//   orb     → footer.decor.orb        (top-right blurred circle)
//
// ── Auth path ──────────────────────────────────────────────────────────────
// Mirrors src/app/api/blog/admin/slot-image/route.ts deliberately: identify the
// caller with the COOKIE-bound client, then do the storage write with the
// SERVICE-ROLE client. Browser→storage uploads with the client's access token
// were the 2026-07-27 failure (token lapses to anon, storage RLS rejects the
// write, saves keep working so nothing looks broken). Don't reintroduce that.
//
// ── Why SVGs are rendered via <img>, never inlined ─────────────────────────
// An uploaded SVG is untrusted markup and can carry <script>. Inlining one into
// the page would be stored XSS by the admin, for every visitor. These are
// served from db.unenter.live (a different origin from www.unenter.live) and
// rendered through <img src>, which does not execute script. Keep it that way.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireRoleClient } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "landing-assets";
const SCOPE = "core-landing";

/** slot → registry key. Anything not in here is rejected. */
const SLOTS = {
  polygon: "footer.decor.polygon",
  orb: "footer.decor.orb",
} as const;
type Slot = keyof typeof SLOTS;

const ALLOWED_MIME: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — decoration, not a hero asset

function isSlot(v: unknown): v is Slot {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SLOTS, v);
}

function publicUrl(path: string): string {
  return `https://db.unenter.live/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const gate = await requireRoleClient(supabase, ["admin", "marketing"]);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("site_assets")
      .select("asset_key, public_url, format, updated_at")
      .eq("scope", SCOPE)
      .in("asset_key", Object.values(SLOTS));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const byKey = new Map((data ?? []).map((r) => [r.asset_key, r]));
    return NextResponse.json({
      slots: (Object.keys(SLOTS) as Slot[]).map((slot) => {
        const row = byKey.get(SLOTS[slot]);
        return {
          slot,
          key: SLOTS[slot],
          // null means "no override" — the footer draws its built-in SVG.
          url: row?.public_url ?? null,
          format: row?.format ?? null,
          updatedAt: row?.updated_at ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[footer-artwork] GET failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireRoleClient(supabase, ["admin", "marketing"]);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });

    const slot = form.get("slot");
    const file = form.get("file");

    if (!isSlot(slot)) {
      return NextResponse.json(
        { error: `slot must be one of: ${Object.keys(SLOTS).join(", ")}` },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const ext = ALLOWED_MIME[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: `unsupported type "${file.type}" — allowed: ${Object.keys(ALLOWED_MIME).join(", ")}` },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `file is ${(file.size / 1024 / 1024).toFixed(1)} MB — max 2 MB` },
        { status: 413 }
      );
    }

    const admin = createAdminClient();
    // Extension is part of the path, so switching svg→png leaves the old object
    // behind. Remove every known variant for this slot before writing.
    const base = `core/footer-${slot}`;
    await admin.storage
      .from(BUCKET)
      .remove(Object.values(ALLOWED_MIME).map((e) => `${base}.${e}`))
      .catch(() => {});

    const path = `${base}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: true,
      // Short cache so a re-upload shows up quickly; the URL is stable, so a
      // long TTL would leave admins staring at their old artwork.
      cacheControl: "60",
    });
    if (upErr) {
      console.error("[footer-artwork] upload failed:", upErr.message);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const url = publicUrl(path);
    const { error: rowErr } = await admin.from("site_assets").upsert(
      {
        scope: SCOPE,
        asset_key: SLOTS[slot],
        kind: "image",
        storage_bucket: BUCKET,
        storage_path: path,
        public_url: url,
        format: ext,
        is_active: true,
      },
      { onConflict: "scope,asset_key" }
    );
    if (rowErr) {
      console.error("[footer-artwork] registry upsert failed:", rowErr.message);
      return NextResponse.json({ error: rowErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slot, url, format: ext, bytes: file.size });
  } catch (err) {
    console.error("[footer-artwork] POST failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireRoleClient(supabase, ["admin", "marketing"]);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const slot = new URL(request.url).searchParams.get("slot");
    if (!isSlot(slot)) {
      return NextResponse.json(
        { error: `slot must be one of: ${Object.keys(SLOTS).join(", ")}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    // Drop the registry row first — that is what the footer reads, so the
    // revert is visible immediately even if the object delete lags.
    const { error } = await admin
      .from("site_assets")
      .delete()
      .eq("scope", SCOPE)
      .eq("asset_key", SLOTS[slot]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.storage
      .from(BUCKET)
      .remove(Object.values(ALLOWED_MIME).map((e) => `core/footer-${slot}.${e}`))
      .catch(() => {});

    return NextResponse.json({ ok: true, slot, reverted: true });
  } catch (err) {
    console.error("[footer-artwork] DELETE failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
