// src/zones/blog/Page.tsx
// Core: Blog list page — served at blog.unenter.live/
// Layout: GitButler-style — featured hero post, mixed card grid, newsletter band.

import { Metadata }     from "next";
import { cookies }      from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { FeaturedCard, GridCard, RowCard } from "./_components/Cards";
import NewsletterBand   from "./_components/NewsletterBand";
import { fetchBlogSettings } from "./_components/settings";
import { resolvePostCover } from "./_components/postImages";
import type { BlogPostSummary } from "./_components/helpers";

export const metadata: Metadata = {
  title:       "Blog | Unenter",
  description: "Latest news, guides, and updates from the Unenter team.",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawPost {
  id:           string;
  slug:         string;
  title:        Record<string, string>;
  excerpt:      Record<string, string>;
  cover_image:  string | null;
  author:       string | null;
  tags:         string[];
  published_at: string | null;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPosts(locale: string): Promise<BlogPostSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, cover_image, author, tags, published_at, blog_authors ( name )")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[blog/page] fetch error:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as (RawPost & { blog_authors: { name: string } | null })[];
  return Promise.all(rows.map(async (row) => ({
    id:          row.id,
    slug:        row.slug,
    title:       row.title?.[locale]   ?? row.title?.en   ?? "",
    excerpt:     row.excerpt?.[locale] ?? row.excerpt?.en ?? "",
    coverImage:  await resolvePostCover(row.slug, row.cover_image),
    author:      row.blog_authors?.name ?? row.author,
    tags:        row.tags ?? [],
    publishedAt: row.published_at,
  })));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlogPage() {
  const cookieStore = await cookies();
  const locale      = (cookieStore.get("Next-Locale")?.value ?? "en") as string;

  const [posts, { promo, newsletter }] = await Promise.all([
    fetchPosts(locale),
    fetchBlogSettings(),
  ]);

  const [featured, ...rest] = posts;
  const gridPosts = rest.slice(0, 4);
  const rowPosts  = rest.slice(4);

  return (
    <>
      {/* Posts — GitButler-style: straight into the featured card, no hero band */}
      <section className="pb-14 pt-8 md:pb-20 md:pt-12">
        <div className="container">
          <div className="mx-auto max-w-4xl">
            <h1 className="sr-only">Blog</h1>
            {posts.length === 0 ? (
              <p className="py-20 text-center text-lg text-[hsl(var(--muted-foreground))]">
                No posts published yet — check back soon.
              </p>
            ) : (
              <div className="space-y-14 md:space-y-20">
                <FeaturedCard post={featured} />

                {gridPosts.length > 0 && (
                  <div className="grid gap-10 md:grid-cols-2 md:gap-x-8 md:gap-y-14">
                    {gridPosts.map((post) => (
                      <GridCard key={post.id} post={post} />
                    ))}
                  </div>
                )}

                {/* Promo band (dashboard-managed, blog_settings.promo) */}
                {promo.enabled && promo.title && (
                  <a
                    href={promo.url}
                    className="group flex items-center justify-between gap-6 rounded-2xl bg-[hsl(var(--accent))] px-8 py-10 text-[hsl(var(--accent-foreground))] md:px-12 md:py-14"
                  >
                    <span className="max-w-md font-serif text-2xl leading-snug md:text-4xl">
                      {promo.title}
                    </span>
                    {promo.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={promo.image} alt="" className="hidden h-24 w-auto shrink-0 md:block" />
                    ) : (
                      <svg
                        width="48" height="24" viewBox="0 0 48 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        className="shrink-0 transition-transform group-hover:translate-x-2"
                        aria-hidden
                      >
                        <path d="M2 12h42M36 4l8 8-8 8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </a>
                )}

                {rowPosts.length > 0 && (
                  <div className="space-y-10">
                    {rowPosts.map((post) => (
                      <RowCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <NewsletterBand {...newsletter} />
    </>
  );
}
