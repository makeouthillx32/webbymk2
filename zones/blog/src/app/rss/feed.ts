// RSS 2.0 feed for blog.unenter.live.

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { renderMarkdown } from "@/zones/blog/_components/markdown";
import {
  fetchPostImageMap,
  resolvePostRefs,
} from "@/zones/blog/_components/postImages";

// Feed scale controls — keep the feed fast and standard-sized as the blog grows.
// Every item still carries title/link/excerpt/media; only the most-recent
// FULL_CONTENT_LIMIT posts inline the full <content:encoded> (and do the storage
// lookup that resolves post:// slots). Beyond that, readers follow <link>.
const MAX_ITEMS = 50;
const FULL_CONTENT_LIMIT = 25;

type Row = {
  slug: string;
  title: Record<string, string> | null;
  excerpt: Record<string, string> | null;
  content: Record<string, string> | null;
  content_format: "md" | "html" | null;
  cover_image: string | null;
  author: string | null;
  published_at: string | null;
  updated_at: string | null;
  tags: string[] | null;
  blog_authors: { name: string } | null;
  blog_post_tags: { blog_tags: { name: string } | null }[] | null;
};

const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function clean(value: string): string {
  return value.replace(INVALID_XML, "");
}

function esc(value: string): string {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value: string): string {
  return `<![CDATA[${clean(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

const pick = (value: Record<string, string> | null | undefined) =>
  (value?.en ?? Object.values(value ?? {})[0] ?? "").toString();

function absoluteUrl(origin: string, value: string | null): string | null {
  if (!value || value.startsWith("post://")) return null;
  try {
    return new URL(value, `${origin}/`).toString();
  } catch {
    return null;
  }
}

function imageMime(url: string): string {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

// Feed readers strip data-* attributes and never run JS, so an interactive
// chart <figure> would render as dead markup (just the "enable JavaScript"
// fallback). In the feed, swap each chart for its caption + a link back to the
// live, interactive version on the site. The website itself renders the real
// chart — this transform only touches <content:encoded>.
function feedSafeCharts(html: string, link: string): string {
  return html.replace(
    /<figure class="blog-chart"[\s\S]*?<\/figure>/g,
    (figure) => {
      const m = figure.match(
        /<figcaption class="blog-chart-caption">([\s\S]*?)<\/figcaption>/,
      );
      const caption = (m?.[1] ?? "Interactive chart").trim();
      return `<p>\u{1F4CA} <strong>${caption}</strong> — <a href="${esc(link)}">view the interactive chart</a></p>`;
    },
  );
}

function postTags(post: Row): string[] {
  const joined = (post.blog_post_tags ?? [])
    .map((relation) => relation.blog_tags?.name?.trim())
    .filter((name): name is string => Boolean(name));
  return [...new Set(joined.length > 0 ? joined : (post.tags ?? []))];
}

function rssDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime())
    ? new Date(0).toUTCString()
    : date.toUTCString();
}

export async function buildRssDocument() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "blog.unenter.live";
  const origin = `https://${host}`;

  let rows: Row[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("blog_posts")
      .select(
        `
        slug, title, excerpt, content, content_format, cover_image, author,
        published_at, updated_at, tags,
        blog_authors ( name ),
        blog_post_tags ( blog_tags ( name ) )
      `,
      )
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(MAX_ITEMS);
    if (error) throw error;
    rows = (data ?? []) as unknown as Row[];
  } catch {
    // Keep the endpoint valid when the content backend is unavailable.
    rows = [];
  }

  const lastChanged = rows.reduce<string | null>((latest, post) => {
    const candidate = post.updated_at ?? post.published_at;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate) > new Date(latest) ? candidate : latest;
  }, null);
  const lastPublished = rows[0]?.published_at ?? rows[0]?.updated_at ?? null;

  const items = (
    await Promise.all(
      rows.map(async (post, index) => {
        const link = `${origin}/${post.slug}`;
        const wantFull = index < FULL_CONTENT_LIMIT;
        const sourceContent = wantFull ? pick(post.content) : "";
        const needsImageMap =
          wantFull &&
          (sourceContent.includes("post://") ||
            Boolean(post.cover_image?.startsWith("post://")));
        const imageMap = needsImageMap
          ? await fetchPostImageMap(post.slug)
          : new Map<string, string>();
        const content = resolvePostRefs(sourceContent, imageMap);
        const renderedHtml = !wantFull
          ? ""
          : post.content_format === "html"
            ? content
            : renderMarkdown(content).html;
        const contentHtml = renderedHtml
          ? feedSafeCharts(renderedHtml, link)
          : "";
        const resolvedCover = post.cover_image?.startsWith("post://")
          ? (imageMap.get(post.cover_image.slice("post://".length)) ?? null)
          : post.cover_image;
        const cover = absoluteUrl(origin, resolvedCover);
        const mime = cover ? imageMime(cover) : null;
        const author =
          post.blog_authors?.name?.trim() || post.author?.trim() || "";
        const categories = postTags(post)
          .map((tag) => `      <category>${cdata(tag)}</category>`)
          .join("\n");
        // dc:creator (name) only — a bare RSS <author> requires a real email,
        // and the validator flags carrying both. dc:creator is the right home
        // for a display name.
        const authorXml = author
          ? `      <dc:creator>${cdata(author)}</dc:creator>\n`
          : "";
        const mediaXml =
          cover && mime
            ? `      <enclosure url="${esc(cover)}" length="0" type="${mime}"/>\n` +
              `      <media:content url="${esc(cover)}" type="${mime}" medium="image"/>\n` +
              `      <media:thumbnail url="${esc(cover)}"/>\n`
            : "";
        const contentXml = contentHtml
          ? `      <content:encoded>${cdata(contentHtml)}</content:encoded>\n`
          : "";

        return `    <item>
      <title>${cdata(pick(post.title))}</title>
      <description>${cdata(pick(post.excerpt))}</description>
${contentXml}      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${rssDate(post.published_at ?? post.updated_at)}</pubDate>
${authorXml}${mediaXml}${categories ? `${categories}\n` : ""}    </item>`;
      }),
    )
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${cdata("Unenter Blog")}</title>
    <link>${esc(origin)}</link>
    <description>${cdata("Notes, builds, and field reports from unenter.live.")}</description>
    <language>en</language>
    <copyright>${cdata(`Copyright ${new Date().getUTCFullYear()} Unenter`)}</copyright>
    <managingEditor>noreply@unenter.live (Unenter)</managingEditor>
    <webMaster>noreply@unenter.live (Unenter)</webMaster>
    <lastBuildDate>${rssDate(lastChanged)}</lastBuildDate>
    <pubDate>${rssDate(lastPublished)}</pubDate>
    <generator>Unenter Blog RSS</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <ttl>60</ttl>
    <image>
      <url>${esc(`${origin}/default-site-icon.png`)}</url>
      <title>${cdata("Unenter Blog")}</title>
      <link>${esc(origin)}</link>
      <width>144</width>
      <height>144</height>
    </image>
    <atom:link href="${esc(`${origin}/rss`)}" rel="self" type="application/rss+xml"/>
    <atom:link href="${esc(origin)}" rel="alternate" type="text/html"/>
${items}
  </channel>
</rss>
`;

  return xml;
}
