// app/u/img/[slug]/route.ts
/**
 * Image Access by Friendly Slug
 *
 * Pretty URLs for web-public images stored in the documents bucket's public/
 * folder, matched by slugified filename.
 *
 * Usage:
 * <img src="/u/img/tin-haul-boot" />
 *
 * Streams bytes via a service-role client (see lib/serveDocumentFile), gated to
 * the public/ folder — the documents bucket is private and must not leak.
 */

import { NextRequest, NextResponse } from "next/server";
import { serviceClient, streamPublicDocument, isPublicStoragePath } from "@/lib/serveDocumentFile";

/**
 * "TInHaul_5.webp" -> "tinhaul-5"
 * "Roper_106.avif" -> "roper-106"
 */
function slugifyFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const supabase = serviceClient();

    // Only consider public images — keeps private docs out of slug matching.
    const { data: documents, error } = await supabase
      .from("documents")
      .select("name, storage_path, mime_type")
      .eq("type", "file")
      .like("mime_type", "image/%")
      .like("storage_path", "public/%")
      .is("deleted_at", null);

    if (error || !documents) {
      return NextResponse.json({ error: "Failed to search images" }, { status: 500 });
    }

    const document = documents.find(
      (doc) => slugifyFileName(doc.name) === slug.toLowerCase()
    );

    if (!document || !document.storage_path || !isPublicStoragePath(document.storage_path)) {
      return NextResponse.json(
        { error: "Image not found", slug, hint: "Use /cdn/public/filename.ext" },
        { status: 404 }
      );
    }

    return streamPublicDocument(document.storage_path, document.mime_type);
  } catch (error) {
    console.error("Image slug route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return GET(req, context);
}
