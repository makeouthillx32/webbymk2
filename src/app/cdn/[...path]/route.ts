// app/cdn/[...path]/route.ts
/**
 * CDN-Style File Access
 *
 * Clean, CDN-like URLs for web-public assets stored in the (private)
 * `documents` bucket under the `public/` folder.
 *
 * Usage in HTML:
 * <img src="/cdn/public/tin-haul-boot.webp" />
 *
 * The documents bucket is PRIVATE, so we stream the bytes ourselves via a
 * service-role client (see lib/serveDocumentFile), gated to the public/ folder.
 */

import { NextRequest, NextResponse } from "next/server";
import { serviceClient, streamPublicDocument, PUBLIC_PREFIX } from "@/lib/serveDocumentFile";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;

    if (!path || path.length === 0) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    // ["public","tin-haul.webp"] -> "public/tin-haul.webp"
    const fullPath = path.join("/");

    // SECURITY: only the public/ folder is web-servable.
    if (!fullPath.startsWith(PUBLIC_PREFIX)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = serviceClient();

    // Resolve storage_path: exact path first…
    let { data: document } = await supabase
      .from("documents")
      .select("storage_path, mime_type")
      .eq("path", fullPath)
      .eq("type", "file")
      .is("deleted_at", null)
      .single();

    // …then fall back to name within the requested folder.
    if (!document) {
      const fileName = path[path.length - 1];
      const folderPath = path.slice(0, -1).join("/") + "/";
      const { data: docByName } = await supabase
        .from("documents")
        .select("storage_path, mime_type")
        .eq("name", fileName)
        .eq("parent_path", folderPath)
        .eq("type", "file")
        .is("deleted_at", null)
        .single();
      document = docByName;
    }

    if (!document || !document.storage_path) {
      return NextResponse.json({ error: "File not found", path: fullPath }, { status: 404 });
    }

    return streamPublicDocument(document.storage_path, document.mime_type);
  } catch (error) {
    console.error("CDN route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return GET(req, context);
}
