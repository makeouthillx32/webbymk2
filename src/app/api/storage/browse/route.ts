// src/app/api/storage/browse/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase storage browser — buckets and objects, folder-style.
//
// Replaces the "Storage" sidebar entry that pointed at /Documents, which is a
// copy of the Orders page and rendered <OrdersManager> — clicking Storage
// opened Orders.
//
//   GET                      → list all buckets (+ public flag, size cap, mimes)
//   GET ?bucket=x&prefix=y/  → list one "folder": subfolders + files
//   DELETE ?bucket=x&path=y  → remove one object
//
// Admin-gated with the cookie client, then read/written with the service role,
// mirroring api/blog/admin/slot-image. Listing must be service-role: several
// buckets are private (tank-archives, tank-audio-cache), and a browser meant to
// show what EXISTS should show those too rather than silently omitting them.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminClient } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireAdminClient(supabase);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const admin = createAdminClient();
    const url = new URL(request.url);
    const bucket = url.searchParams.get("bucket");
    const prefix = url.searchParams.get("prefix") ?? "";

    // ── Bucket list ─────────────────────────────────────────────────────────
    if (!bucket) {
      const { data, error } = await admin.storage.listBuckets();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        buckets: (data ?? [])
          .map((b) => ({
            id: b.id,
            name: b.name,
            public: b.public,
            sizeLimit: (b as { file_size_limit?: number | null }).file_size_limit ?? null,
            mimeTypes: (b as { allowed_mime_types?: string[] | null }).allowed_mime_types ?? null,
            createdAt: b.created_at ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    // ── Object list for one prefix ──────────────────────────────────────────
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Supabase represents a "folder" as an entry with a null id. Splitting on
    // that is what makes the flat object store browsable as a tree.
    const folders: string[] = [];
    const files: {
      name: string;
      path: string;
      size: number | null;
      mimeType: string | null;
      updatedAt: string | null;
      publicUrl: string | null;
    }[] = [];

    const { data: bucketRow } = await admin.storage.getBucket(bucket);
    const isPublic = bucketRow?.public ?? false;

    for (const entry of data ?? []) {
      const isFolder = entry.id === null;
      if (isFolder) {
        folders.push(entry.name);
        continue;
      }
      const path = prefix ? `${prefix.replace(/\/$/, "")}/${entry.name}` : entry.name;
      files.push({
        name: entry.name,
        path,
        size: entry.metadata?.size ?? null,
        mimeType: entry.metadata?.mimetype ?? null,
        updatedAt: entry.updated_at ?? null,
        // Only public buckets get a usable URL; a signed URL per row would be
        // N round-trips for a listing, so private files are listed without one.
        publicUrl: isPublic
          ? admin.storage.from(bucket).getPublicUrl(path).data.publicUrl
          : null,
      });
    }

    return NextResponse.json({
      bucket,
      prefix,
      isPublic,
      folders,
      files,
      truncated: (data ?? []).length >= PAGE_SIZE,
    });
  } catch (err) {
    console.error("[storage/browse] GET failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireAdminClient(supabase);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const url = new URL(request.url);
    const bucket = url.searchParams.get("bucket");
    const path = url.searchParams.get("path");
    if (!bucket || !path) {
      return NextResponse.json({ error: "bucket and path are required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, bucket, path });
  } catch (err) {
    console.error("[storage/browse] DELETE failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
