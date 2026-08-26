// app/u/doc/[id]/route.ts
/**
 * Document Access by ID
 *
 * Short, clean URLs for accessing web-public documents by UUID.
 *
 * Usage:
 * <img src="/u/doc/51c8979e-9797-45e0-a871-bcd52d59d0f4" />
 *
 * Streams bytes via a service-role client (see lib/serveDocumentFile), gated to
 * the public/ folder. Documents outside public/ are private and return 403 —
 * authenticated private-document access is intentionally not handled here.
 */

import { NextRequest, NextResponse } from "next/server";
import { serviceClient, streamPublicDocument } from "@/lib/serveDocumentFile";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const supabase = serviceClient();

    const { data: document, error } = await supabase
      .from("documents")
      .select("storage_path, mime_type")
      .eq("id", id)
      .eq("type", "file")
      .is("deleted_at", null)
      .single();

    if (error || !document || !document.storage_path) {
      return NextResponse.json({ error: "Document not found", id }, { status: 404 });
    }

    // streamPublicDocument enforces the public/ gate (403 for private docs).
    return streamPublicDocument(document.storage_path, document.mime_type);
  } catch (error) {
    console.error("Document ID route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return GET(req, context);
}
