import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getSiteIconObjectPaths,
  getSiteIconUrls,
  SITE_ICON_MIN_SOURCE_SIZE,
  SITE_ICON_VARIANTS,
} from "@/lib/siteIcon";
import { OPEN_GRAPH_MAX_BYTES, SITE_ASSET_BUCKET } from "@/lib/siteOpenGraph";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ExistingIcon = {
  key: string;
  label: string;
  site_icon_bucket: string | null;
  site_icon_path: string | null;
  site_icon_updated_at: string | null;
  site_icon_original_name: string | null;
  site_icon_source_width: number | null;
  site_icon_source_height: number | null;
  site_icon_bytes: number | null;
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

async function loadZone(key: string): Promise<ExistingIcon | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("zones")
    .select(
      "key,label,site_icon_bucket,site_icon_path,site_icon_updated_at,site_icon_original_name,site_icon_source_width,site_icon_source_height,site_icon_bytes",
    )
    .eq("key", key)
    .maybeSingle();
  return (data as ExistingIcon | null) ?? null;
}

async function removeIconObjects(
  bucket: string | null,
  pathPrefix: string | null,
) {
  if (!bucket || !pathPrefix) return;
  await createAdminClient()
    .storage.from(bucket)
    .remove(getSiteIconObjectPaths(pathPrefix));
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
  if (!(image instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Choose an icon to upload" },
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

  const admin = createAdminClient();
  const uploadedPaths: string[] = [];

  try {
    const input = Buffer.from(await image.arrayBuffer());
    const sourceMetadata = await sharp(input).metadata();
    if (!sourceMetadata.width || !sourceMetadata.height) {
      return NextResponse.json(
        { ok: false, error: "Could not read image dimensions" },
        { status: 400 },
      );
    }
    if (
      sourceMetadata.width < SITE_ICON_MIN_SOURCE_SIZE ||
      sourceMetadata.height < SITE_ICON_MIN_SOURCE_SIZE
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `Icon must be at least ${SITE_ICON_MIN_SOURCE_SIZE} x ${SITE_ICON_MIN_SOURCE_SIZE} pixels`,
        },
        { status: 400 },
      );
    }

    const safeKey = zone.key.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const pathPrefix = `zones/${safeKey}/icons/${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    let totalBytes = 0;

    for (const variant of SITE_ICON_VARIANTS) {
      const rendered = await sharp(input)
        .rotate()
        .resize(variant.size, variant.size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      const objectPath = `${pathPrefix}/${variant.fileName}`;
      const uploaded = await admin.storage
        .from(SITE_ASSET_BUCKET)
        .upload(objectPath, rendered, {
          cacheControl: "31536000",
          contentType: "image/png",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;
      uploadedPaths.push(objectPath);
      totalBytes += rendered.length;
    }

    const updatedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("zones")
      .update({
        site_icon_bucket: SITE_ASSET_BUCKET,
        site_icon_path: pathPrefix,
        site_icon_updated_at: updatedAt,
        site_icon_original_name: image.name.slice(0, 255),
        site_icon_source_width: sourceMetadata.width,
        site_icon_source_height: sourceMetadata.height,
        site_icon_bytes: totalBytes,
        updated_at: updatedAt,
      })
      .eq("key", zone.key);

    if (updateError) throw updateError;

    await admin.from("zone_audit_events").insert({
      actor: auth.user.id,
      action: "site_icon.updated",
      zone_key: zone.key,
      before: {
        bucket: zone.site_icon_bucket,
        path: zone.site_icon_path,
      },
      after: {
        bucket: SITE_ASSET_BUCKET,
        path: pathPrefix,
        originalName: image.name,
        sourceWidth: sourceMetadata.width,
        sourceHeight: sourceMetadata.height,
        bytes: totalBytes,
      },
      source: "dashboard",
      payload_version: "1",
    });

    await removeIconObjects(zone.site_icon_bucket, zone.site_icon_path);

    return NextResponse.json({
      ok: true,
      data: {
        bucket: SITE_ASSET_BUCKET,
        path: pathPrefix,
        updatedAt,
        originalName: image.name,
        sourceWidth: sourceMetadata.width,
        sourceHeight: sourceMetadata.height,
        bytes: totalBytes,
        urls: getSiteIconUrls(SITE_ASSET_BUCKET, pathPrefix, updatedAt),
      },
    });
  } catch (error) {
    if (uploadedPaths.length) {
      await admin.storage.from(SITE_ASSET_BUCKET).remove(uploadedPaths);
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
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
      site_icon_bucket: null,
      site_icon_path: null,
      site_icon_updated_at: null,
      site_icon_original_name: null,
      site_icon_source_width: null,
      site_icon_source_height: null,
      site_icon_bytes: null,
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
    action: "site_icon.removed",
    zone_key: zone.key,
    before: {
      bucket: zone.site_icon_bucket,
      path: zone.site_icon_path,
    },
    after: null,
    source: "dashboard",
    payload_version: "1",
  });

  await removeIconObjects(zone.site_icon_bucket, zone.site_icon_path);
  return NextResponse.json({ ok: true });
}
