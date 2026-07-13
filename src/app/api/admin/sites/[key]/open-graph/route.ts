import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getPublicStorageObjectUrl,
  OPEN_GRAPH_HEIGHT,
  OPEN_GRAPH_MAX_BYTES,
  OPEN_GRAPH_WIDTH,
  SITE_ASSET_BUCKET,
} from "@/lib/siteOpenGraph";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ExistingAsset = {
  key: string;
  label: string;
  og_image_bucket: string | null;
  og_image_path: string | null;
  og_image_alt: string | null;
  og_image_updated_at: string | null;
  og_image_width: number | null;
  og_image_height: number | null;
  og_image_bytes: number | null;
  og_image_mime_type: string | null;
  og_image_original_name: string | null;
  og_image_source_width: number | null;
  og_image_source_height: number | null;
};

async function authorizeAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      response: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

async function loadZone(key: string): Promise<ExistingAsset | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("zones")
    .select(
      "key,label,og_image_bucket,og_image_path,og_image_alt,og_image_updated_at,og_image_width,og_image_height,og_image_bytes,og_image_mime_type,og_image_original_name,og_image_source_width,og_image_source_height",
    )
    .eq("key", key)
    .maybeSingle();
  return (data as ExistingAsset | null) ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await authorizeAdmin();
  if ("response" in auth) return auth.response;

  const { key } = await params;
  const zone = await loadZone(key);
  if (!zone) {
    return NextResponse.json(
      { ok: false, error: "Site not found" },
      { status: 404 },
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");
  const suppliedAlt = formData.get("alt");
  const alt =
    typeof suppliedAlt === "string" && suppliedAlt.trim()
      ? suppliedAlt.trim().slice(0, 300)
      : `${zone.label} preview`;

  if (!(image instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Choose an image to upload" },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return NextResponse.json(
      { ok: false, error: "Use a JPEG, PNG, or WebP image" },
      { status: 400 },
    );
  }
  if (image.size > OPEN_GRAPH_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image must be 8 MB or smaller" },
      { status: 400 },
    );
  }

  try {
    const input = Buffer.from(await image.arrayBuffer());
    const sourceMetadata = await sharp(input).metadata();
    if (!sourceMetadata.width || !sourceMetadata.height) {
      return NextResponse.json(
        { ok: false, error: "Could not read image dimensions" },
        { status: 400 },
      );
    }
    if (sourceMetadata.width < 600 || sourceMetadata.height < 315) {
      return NextResponse.json(
        { ok: false, error: "Image must be at least 600 x 315 pixels" },
        { status: 400 },
      );
    }
    const rendered = await sharp(input)
      .rotate()
      .resize(OPEN_GRAPH_WIDTH, OPEN_GRAPH_HEIGHT, {
        fit: "cover",
        position: "attention",
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90, progressive: true, mozjpeg: true })
      .toBuffer();

    const admin = createAdminClient();
    const safeKey = zone.key.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const objectPath = `zones/${safeKey}/open-graph/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const uploaded = await admin.storage
      .from(SITE_ASSET_BUCKET)
      .upload(objectPath, rendered, {
        cacheControl: "31536000",
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploaded.error) throw uploaded.error;

    const updatedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("zones")
      .update({
        og_image_bucket: SITE_ASSET_BUCKET,
        og_image_path: objectPath,
        og_image_alt: alt,
        og_image_updated_at: updatedAt,
        og_image_width: OPEN_GRAPH_WIDTH,
        og_image_height: OPEN_GRAPH_HEIGHT,
        og_image_bytes: rendered.length,
        og_image_mime_type: "image/jpeg",
        og_image_original_name: image.name.slice(0, 255),
        og_image_source_width: sourceMetadata.width,
        og_image_source_height: sourceMetadata.height,
        updated_at: updatedAt,
      })
      .eq("key", zone.key);

    if (updateError) {
      await admin.storage.from(SITE_ASSET_BUCKET).remove([objectPath]);
      throw updateError;
    }

    await admin.from("zone_audit_events").insert({
      actor: auth.user.id,
      action: "open_graph_image.updated",
      zone_key: zone.key,
      before: {
        bucket: zone.og_image_bucket,
        path: zone.og_image_path,
        alt: zone.og_image_alt,
      },
      after: {
        bucket: SITE_ASSET_BUCKET,
        path: objectPath,
        alt,
        width: OPEN_GRAPH_WIDTH,
        height: OPEN_GRAPH_HEIGHT,
        bytes: rendered.length,
        mimeType: "image/jpeg",
        originalName: image.name,
        sourceWidth: sourceMetadata.width,
        sourceHeight: sourceMetadata.height,
      },
      source: "dashboard",
      payload_version: "1",
    });

    if (zone.og_image_bucket && zone.og_image_path) {
      await admin.storage
        .from(zone.og_image_bucket)
        .remove([zone.og_image_path]);
    }

    return NextResponse.json({
      ok: true,
      data: {
        bucket: SITE_ASSET_BUCKET,
        path: objectPath,
        alt,
        url: getPublicStorageObjectUrl(
          SITE_ASSET_BUCKET,
          objectPath,
          updatedAt,
        ),
        updatedAt,
        width: OPEN_GRAPH_WIDTH,
        height: OPEN_GRAPH_HEIGHT,
        bytes: rendered.length,
        mimeType: "image/jpeg",
        originalName: image.name,
        sourceWidth: sourceMetadata.width,
        sourceHeight: sourceMetadata.height,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await authorizeAdmin();
  if ("response" in auth) return auth.response;

  const { key } = await params;
  const zone = await loadZone(key);
  if (!zone) {
    return NextResponse.json(
      { ok: false, error: "Site not found" },
      { status: 404 },
    );
  }
  if (!zone.og_image_path) {
    return NextResponse.json(
      { ok: false, error: "This site has no OpenGraph image" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const alt =
    typeof body?.alt === "string" && body.alt.trim()
      ? body.alt.trim().slice(0, 300)
      : `${zone.label} preview`;
  const updatedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("zones")
    .update({ og_image_alt: alt, updated_at: updatedAt })
    .eq("key", zone.key);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  await admin.from("zone_audit_events").insert({
    actor: auth.user.id,
    action: "open_graph_image.metadata_updated",
    zone_key: zone.key,
    before: { alt: zone.og_image_alt },
    after: { alt },
    source: "dashboard",
    payload_version: "1",
  });

  return NextResponse.json({ ok: true, data: { alt, updatedAt } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await authorizeAdmin();
  if ("response" in auth) return auth.response;

  const { key } = await params;
  const zone = await loadZone(key);
  if (!zone) {
    return NextResponse.json(
      { ok: false, error: "Site not found" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();
  const { error } = await admin
    .from("zones")
    .update({
      og_image_bucket: null,
      og_image_path: null,
      og_image_alt: null,
      og_image_updated_at: null,
      og_image_width: null,
      og_image_height: null,
      og_image_bytes: null,
      og_image_mime_type: null,
      og_image_original_name: null,
      og_image_source_width: null,
      og_image_source_height: null,
      updated_at: updatedAt,
    })
    .eq("key", zone.key);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  await admin.from("zone_audit_events").insert({
    actor: auth.user.id,
    action: "open_graph_image.removed",
    zone_key: zone.key,
    before: {
      bucket: zone.og_image_bucket,
      path: zone.og_image_path,
      alt: zone.og_image_alt,
    },
    after: null,
    source: "dashboard",
    payload_version: "1",
  });

  if (zone.og_image_bucket && zone.og_image_path) {
    await admin.storage.from(zone.og_image_bucket).remove([zone.og_image_path]);
  }

  return NextResponse.json({ ok: true });
}
