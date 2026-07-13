// zones/blog/src/app/rss/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// RSS 2.0 feed for the blog zone → blog.unenter.live/rss
//
// The Butler's-Log-style header RSS icon links here. Feed readers consume the
// XML directly; browsers show it (and offer "download") — standard RSS behavior.
// Served as application/rss+xml so aggregators recognize it.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type Row = {
  slug: string;
  title: Record<string, string> | null;
  excerpt: Record<string, string> | null;
  published_at: string | null;
  updated_at: string | null;
  tags: string[] | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const pick = (v: Record<string, string> | null | undefined) =>
  (v?.en ?? Object.values(v ?? {})[0] ?? "").toString();

export async function GET() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "blog.unenter.live";
  const origin = `https://${host}`;

  let rows: Row[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, title, excerpt, published_at, updated_at, tags")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(50);
    rows = (data ?? []) as Row[];
  } catch {
    rows = []; // backend down → still return a valid (empty) feed, never 500
  }

  const lastBuild = new Date().toUTCString();
  const items = rows
    .map((p) => {
      const link = `${origin}/${p.slug}`;
      const pub = p.published_at ?? p.updated_at ?? new Date().toISOString();
      const cats = (p.tags ?? [])
        .map((t) => `<category>${esc(t)}</category>`)
        .join("");
      return `    <item>
      <title>${esc(pick(p.title))}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${new Date(pub).toUTCString()}</pubDate>
      <description>${esc(pick(p.excerpt))}</description>
${cats ? "      " + cats + "\n" : ""}    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Unenter Blog</title>
    <link>${origin}</link>
    <description>Notes, builds, and field reports from unenter.live.</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${origin}/rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  // Match GitButler's Butler's-Log EXACTLY (verified against their live /rss):
  // serve the feed INLINE with the proper feed MIME and NO Content-Disposition.
  // Result = identical behavior on every platform:
  //   • desktop browsers render the XML in-page (viewable, like GitButler)
  //   • feed readers subscribe and parse it normally
  //   • iOS handles it with its native feed behavior (same as GitButler, since
  //     the headers are byte-for-byte the same)
  // The download/confirm/App-Store dialogs we chased earlier were all
  // self-inflicted: the `download` attribute (removed), the octet-stream type,
  // and the attachment disposition. GitButler forces none of that — it just
  // serves the feed inline. Do the same.
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
