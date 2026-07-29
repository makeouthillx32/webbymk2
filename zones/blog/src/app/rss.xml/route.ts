import { buildRssDocument } from "../rss/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const rss = await buildRssDocument();

  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
