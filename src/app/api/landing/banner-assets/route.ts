// src/app/api/landing/banner-assets/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Interactive-banner asset slots for the Core home hero.
//
//   GET    → current asset for each slot (null = using the bundled default)
//   POST   → upload a replacement (multipart: `slot`, `file`)
//   DELETE → clear a slot (?slot=heroVideoWebm) and revert to the default
//
// Sibling of api/landing/footer-artwork — same auth shape (cookie client to
// identify, service role to write), different slot map and MIME rules because
// these are multi-megabyte video/model files rather than small decorations.
// Deliberately NOT merged with that route: the size caps, allowed types and
// revert semantics differ enough that one generic handler would be a pile of
// conditionals pretending to be shared code.
//
// Writes land in the same site_assets registry the storefront resolver reads
// (src/lib/siteAssets.ts), so an upload is live on next page load — no rebuild.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminClient } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "landing-assets";
const SCOPE = "core-landing";

type SlotDef = {
  key: string;          // site_assets.asset_key
  label: string;
  hint: string;
  kind: "video" | "model";
  mimes: Record<string, string>; // mime -> extension
  maxBytes: number;
};

const SLOTS: Record<string, SlotDef> = {
  heroVideoWebm: {
    key: "hero.video.webm",
    label: "Hero video (WebM)",
    hint: "4K loop behind the 3D scene. WebM is what modern browsers use.",
    kind: "video",
    mimes: { "video/webm": "webm" },
    maxBytes: 32 * 1024 * 1024,
  },
  heroVideoMp4: {
    key: "hero.video.mp4",
    label: "Hero video (MP4)",
    hint: "Same loop, MP4 fallback for browsers without WebM.",
    kind: "video",
    mimes: { "video/mp4": "mp4" },
    maxBytes: 32 * 1024 * 1024,
  },
  bannerBackdrop: {
    key: "banner.backdrop.webm",
    label: "Starry backdrop",
    hint: "Looping backdrop inside the interactive banner.",
    kind: "video",
    mimes: { "video/webm": "webm", "video/mp4": "mp4" },
    maxBytes: 32 * 1024 * 1024,
  },
  bannerModel: {
    key: "banner.model.glb",
    label: "3D model (.glb)",
    hint: "The rotating logo mesh. glTF binary.",
    kind: "model",
    mimes: { "model/gltf-binary": "glb", "application/octet-stream": "glb" },
    maxBytes: 32 * 1024 * 1024,
  },
};

function isSlot(v: unknown): v is keyof typeof SLOTS {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SLOTS, v);
}

const publicUrl = (path: string) =>
  `https://db.unenter.live/storage/v1/object/public/${BUCKET}/${path}`;

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const gate = await requireAdminClient(supabase);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("site_assets")
      .select("asset_key, public_url, format, updated_at")
      .eq("scope", SCOPE)
      .in("asset_key", Object.values(SLOTS).map((s) => s.key));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byKey = new Map((data ?? []).map((r) => [r.asset_key, r]));
    return NextResponse.json({
      slots: Object.entries(SLOTS).map(([slot, def]) => {
        const row = byKey.get(def.key);
        return {
          slot,
          key: def.key,
          label: def.label,
          hint: def.hint,
          kind: def.kind,
          accept: Object.keys(def.mimes).join(","),
          maxBytes: def.maxBytes,
          url: row?.public_url ?? null,
          format: row?.format ?? null,
          updatedAt: row?.updated_at ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[banner-assets] GET failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireAdminClient(supabase);
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

    const def = SLOTS[slot];
    // Browsers frequently report .glb as application/octet-stream, so fall back
    // to the extension rather than rejecting a valid model on MIME alone.
    let ext = def.mimes[file.type];
    if (!ext && def.kind === "model" && file.name.toLowerCase().endsWith(".glb")) ext = "glb";
    if (!ext) {
      return NextResponse.json(
        { error: `unsupported type "${file.type || "unknown"}" for ${def.label}` },
        { status: 415 }
      );
    }
    if (file.size > def.maxBytes) {
      return NextResponse.json(
        {
          error: `file is ${(file.size / 1024 / 1024).toFixed(1)} MB — max ${
            def.maxBytes / 1024 / 1024
          } MB`,
        },
        { status: 413 }
      );
    }

    const admin = createAdminClient();
    const path = `core/${slot}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || (ext === "glb" ? "model/gltf-binary" : undefined),
      upsert: true,
      // Short TTL: the URL is stable, so a long cache would leave you staring at
      // the previous video after uploading a new one.
      cacheControl: "60",
    });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { error: rowErr } = await admin.from("site_assets").upsert(
      {
        scope: SCOPE,
        asset_key: def.key,
        kind: def.kind,
        storage_bucket: BUCKET,
        storage_path: path,
        public_url: publicUrl(path),
        format: ext,
        is_active: true,
      },
      { onConflict: "scope,asset_key" }
    );
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, slot, url: publicUrl(path), bytes: file.size });
  } catch (err) {
    console.error("[banner-assets] POST failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireAdminClient(supabase);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const slot = new URL(request.url).searchParams.get("slot");
    if (!isSlot(slot)) {
      return NextResponse.json(
        { error: `slot must be one of: ${Object.keys(SLOTS).join(", ")}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    // Drop the registry row first — that is what the resolver reads, so the
    // revert is visible immediately even if the object delete lags.
    const { error } = await admin
      .from("site_assets")
      .delete()
      .eq("scope", SCOPE)
      .eq("asset_key", SLOTS[slot].key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, slot, reverted: true });
  } catch (err) {
    console.error("[banner-assets] DELETE failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
