import { createReadStream, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Streams one archived segment off the archive disk.
//
// Archive segments used to live in Supabase Storage and be handed out as
// signed URLs. That put an unbounded, always-growing dataset inside Docker's
// virtual disk on C: — which grows on every write and never shrinks on delete —
// and one night of recording took the host to 5% free and brought the whole
// stack down. Segments are now written straight to the archive volume, so they
// need something to serve them.
//
// Access is decided by the database, not by this route: the segment row is read
// through the caller's own RLS-scoped client, so a viewer who cannot see the
// row cannot fetch the file. There is deliberately no second copy of the
// members-only rule here to drift out of step with the first.

export const dynamic = "force-dynamic";

const ARCHIVE_ROOT = process.env.TANK_ARCHIVE_LOCAL_ROOT || "/archive";

/**
 * Resolves a stored path to a real file, refusing anything that escapes the
 * archive root. The path comes from our own database rather than the request,
 * but a traversal check is cheap and this is the one place that turns a string
 * into a filesystem read.
 */
function resolveWithinArchive(storagePath: string): string | null {
  const full = normalize(join(ARCHIVE_ROOT, storagePath));
  if (full !== ARCHIVE_ROOT && !full.startsWith(ARCHIVE_ROOT + sep)) return null;
  return full;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to watch archives" }, { status: 401 });
  }

  // RLS decides visibility. A row the caller may not see comes back empty.
  const { data: segment } = await supabase
    .from("tank_archive_segments")
    .select("storage_path, cold_path, tier")
    .eq("id", id)
    .maybeSingle();

  if (!segment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stored = (segment as any).cold_path || (segment as any).storage_path;
  if (!stored) {
    return NextResponse.json({ error: "Segment has no file" }, { status: 404 });
  }

  const file = resolveWithinArchive(stored);
  if (!file) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    // Indexed but missing: the drain moved it, or a move failed after the row
    // was written. Say so plainly rather than serving an empty body.
    return NextResponse.json({ error: "File not on this host" }, { status: 410 });
  }

  // Range support is what makes scrubbing work; without it the browser can only
  // play a segment straight through from the beginning.
  const range = request.headers.get("range");
  const baseHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    // Private: these are members-only recordings, so no shared cache should
    // ever hold a copy.
    "Cache-Control": "private, max-age=3600",
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || start >= size || end >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const stream = createReadStream(file, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(file);
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
