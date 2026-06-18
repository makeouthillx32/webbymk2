// lib/serveDocumentFile.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Streams files out of the PRIVATE `documents` bucket.
//
// The `documents` bucket is not public (it also holds private folders such as
// `financial/`), so we cannot hand the browser a `/object/public/...` URL.
// Instead these helpers download the bytes server-side with a service-role
// client and stream them back through the app. Two consequences:
//   1. Access is gated to the `public/` folder — private folders never leak.
//   2. The browser only ever talks to this app; the internal Supabase host
//      (kong:8000) is never exposed to the client.
//
// Do NOT import this from client components — it uses the service-role key.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const DOCUMENTS_BUCKET = "documents";
export const PUBLIC_PREFIX = "public/";

/**
 * Service-role client. Aliased to the single shared factory so there's one
 * place that builds the admin client. Reads the private bucket via the internal
 * Supabase URL (kong); never expose to the browser.
 */
export const serviceClient = createAdminClient;

/** True only for objects under the web-public `public/` folder. */
export function isPublicStoragePath(storagePath?: string | null): boolean {
  return !!storagePath && storagePath.startsWith(PUBLIC_PREFIX);
}

/**
 * Download an object from the documents bucket and return it as a streamed
 * NextResponse with long-lived immutable caching. Refuses anything outside the
 * `public/` folder with a 403.
 */
export async function streamPublicDocument(
  storagePath: string,
  mimeType?: string | null
): Promise<NextResponse> {
  if (!isPublicStoragePath(storagePath)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = serviceClient();
  const { data: blob, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error || !blob) {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  }

  const buf = Buffer.from(await blob.arrayBuffer());

  // Long-lived immutable caching in production; never cache in dev so the dev
  // workspace doesn't serve stale assets (no more "disable cache" workarounds).
  const cacheControl =
    process.env.NODE_ENV === "production"
      ? "public, max-age=31536000, immutable"
      : "no-store, must-revalidate";

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": mimeType || blob.type || "application/octet-stream",
      "Cache-Control": cacheControl,
      "Content-Length": String(buf.length),
    },
  });
}
