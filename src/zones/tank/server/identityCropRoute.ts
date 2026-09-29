import { readFile } from "node:fs/promises";
import { extname, isAbsolute, normalize, resolve, sep } from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "./staffAuth";

// Serves one identity crop to a signed-in staff reviewer. Split out of the
// Identity Review workspace when that screen merged into the Label Lab
// (2026-09-18): the screens merged, but both of them show crops, and this is
// the only place that turns a stored path into pixels.

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// Crops the live learner writes live in a private Storage bucket, because this
// container's view of the V: share can be a stale snapshot (after a POWER
// reboot it saw none of the crops written since). Only this bucket is served.
export const IDENTITY_CROP_BUCKET = "tank-identity-crops";

export function storageCropObject(storedPath: string): string | null {
  const prefix = `storage://${IDENTITY_CROP_BUCKET}/`;
  if (!storedPath.startsWith(prefix)) return null;
  const object = storedPath.slice(prefix.length);
  return object && !object.split("/").some((part) => part === ".." || part === "") ? object : null;
}

function safeCropPath(storedPath: string): string | null {
  const roots = [
    resolve(process.cwd(), ".temp"),
    resolve(process.env.TANK_IDENTITY_CROP_ROOT || "/archive/identity-crops"),
  ];
  const candidate = normalize(isAbsolute(storedPath) ? storedPath : resolve(process.cwd(), storedPath));
  return roots.some((root) => candidate === root || candidate.startsWith(root + sep)) ? candidate : null;
}

export async function GET_CROP(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  const url = new URL(request.url);
  const sampleId = url.searchParams.get("sample");
  const clusterKey = url.searchParams.get("cluster");
  if (!sampleId && !clusterKey) return NextResponse.json({ error: "sample or cluster is required" }, { status: 400 });

  const admin = createAdminClient();
  let storedPath: string | null = null;
  if (sampleId) {
    const { data } = await admin.from("tank_identity_training_samples").select("crop_path").eq("sample_id", sampleId).maybeSingle();
    storedPath = data?.crop_path ?? null;
  } else {
    const { data } = await admin.from("tank_identity_clusters").select("representative_crop_path").eq("cluster_key", clusterKey).maybeSingle();
    storedPath = data?.representative_crop_path ?? null;
  }
  if (!storedPath) return NextResponse.json({ error: "Crop not found" }, { status: 404 });
  if (storedPath.startsWith("storage://")) {
    const object = storageCropObject(storedPath);
    if (!object) return NextResponse.json({ error: "Crop path is outside the private identity bucket" }, { status: 400 });
    const { data, error } = await admin.storage.from(IDENTITY_CROP_BUCKET).download(object);
    if (error || !data) return NextResponse.json({ error: "Crop is indexed but not in storage" }, { status: 410 });
    return new NextResponse(Buffer.from(await data.arrayBuffer()), {
      headers: {
        "Content-Type": MIME[extname(object).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const file = safeCropPath(storedPath);
  if (!file) return NextResponse.json({ error: "Crop path is outside the private identity roots" }, { status: 400 });
  try {
    const body = await readFile(file);
    return new NextResponse(body, {
      headers: {
        "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Crop is indexed but not present on this host" }, { status: 410 });
  }
}
