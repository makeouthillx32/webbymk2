// zones/blog/src/app/rss.rss/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// SAFE INTERIM. Serves the feed as text/xml, which every browser (desktop AND
// iOS Safari) renders inline — no download, but crucially NO "Cannot Open Page /
// search the App Store" wall (that wall is triggered by the application/rss+xml
// MIME type on iOS, regardless of Content-Length — confirmed by testing).
//
// GOAL still open: the iOS native download SHEET. blog.gitbutler.com/rss serves
// application/rss+xml and gets the sheet, so it must send an extra header
// (almost certainly Content-Disposition) that our tools can't read remotely.
// Once we capture GitButler's full response headers (curl -D -), set that header
// here and the sheet will work. Until then this stays on the safe text/xml path.
// ─────────────────────────────────────────────────────────────────────────────

import { buildRssDocument } from "../rss/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rss = await buildRssDocument();

  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
