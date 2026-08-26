import { buildRssDocument } from "./feed";

export const dynamic = "force-dynamic";

// Serve the feed INLINE at /rss to match GitButler exactly: Content-Type
// application/rss+xml, no redirect, no Content-Disposition. Desktop renders the
// XML in-page and iOS handles the feed natively, so the browser URL stays a
// clean blog.unenter.live/rss (no .xml hop). /rss.xml still serves the same feed
// for existing subscribers; ?download=1 keeps the attachment escape hatch.
export async function GET(request: Request) {
  const source = new URL(request.url);
  if (source.searchParams.get("download") === "1") {
    return new Response(null, {
      status: 307,
      headers: { Location: "/rss/download" },
    });
  }

  const rss = await buildRssDocument();

  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
