// src/zones/blog/[slug]/Page.tsx
// Core: Blog post detail page — served at blog.unenter.live/<slug>
// GitButler-style: colored hero, share rail, markdown prose (code highlighting,
// heading anchors, TOC), author card, "More to Read", newsletter band.

import { Metadata, ResolvingMetadata } from "next";
import { notFound }     from "next/navigation";
import { cookies, headers } from "next/headers";
import Link             from "next/link";
import { createClient } from "@/utils/supabase/server";
import { GridCard }     from "../_components/Cards";
import ShareRail        from "../_components/ShareRail";
import ChartHydrator    from "../_components/ChartHydrator";
import NewsletterBand   from "../_components/NewsletterBand";
import { fetchBlogSettings } from "../_components/settings";
import { fetchPostImageMap, resolvePostCover, resolvePostRefs } from "../_components/postImages";
import { renderMarkdown, type TocEntry } from "../_components/markdown";
import { formatDate, readTime, slugifyTag, type BlogPostSummary } from "../_components/helpers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawAuthor {
  id:          string;
  slug:        string;
  name:        string;
  avatar_url:  string | null;
  bio:         Record<string, string> | null;
  website_url: string | null;
  github_url:  string | null;
  bluesky_url: string | null;
  x_url:       string | null;
}

interface RawPost {
  id:             string;
  slug:           string;
  title:          Record<string, string>;
  excerpt:        Record<string, string>;
  content:        Record<string, string>;
  content_format: "md" | "html";
  cover_image:    string | null;
  author:         string | null;
  tags:           string[];
  published_at:   string | null;
  updated_at:     string | null;
  revision:       number | null;
  blog_authors:   RawAuthor | null;
  blog_post_tags: { blog_tags: { slug: string; name: string } }[] | null;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPost(slug: string, locale: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select(`
      id, slug, title, excerpt, content, content_format, cover_image,
      author, tags, published_at, updated_at, revision,
      blog_authors ( id, slug, name, avatar_url, bio, website_url, github_url, bluesky_url, x_url ),
      blog_post_tags ( blog_tags ( slug, name ) )
    `)
    .eq("slug", slug)
    .eq("is_published", true)
    .single<RawPost>();

  if (error || !data) return null;

  const joinedTags = (data.blog_post_tags ?? []).map((t) => t.blog_tags);
  const tagLinks = joinedTags.length > 0
    ? joinedTags
    : (data.tags ?? []).map((name) => ({ name, slug: slugifyTag(name) }));

  return {
    id:            data.id,
    slug:          data.slug,
    title:         data.title?.[locale]   ?? data.title?.en   ?? "",
    excerpt:       data.excerpt?.[locale] ?? data.excerpt?.en ?? "",
    content:       data.content?.[locale] ?? data.content?.en ?? "",
    contentFormat: data.content_format ?? "html",
    coverImage:    data.cover_image,
    authorProfile: data.blog_authors,
    authorName:    data.blog_authors?.name ?? data.author,
    tags:          tagLinks.map((tag) => tag.name),
    tagLinks,
    publishedAt:   data.published_at,
    updatedAt:     data.updated_at,
    revision:      data.revision ?? 1,
  };
}

async function fetchMorePosts(excludeSlug: string, locale: string): Promise<BlogPostSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, cover_image, author, tags, published_at, blog_authors ( name )")
    .eq("is_published", true)
    .neq("slug", excludeSlug)
    .order("published_at", { ascending: false })
    .limit(4);

  if (error) return [];

  return Promise.all((data ?? []).map(async (row: any) => ({
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

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: PageProps,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const post     = await fetchPost(slug, "en");

  if (!post) return { title: "Post Not Found | Unenter Blog" };

  // Resolve a slot-based cover (post://cover) to its real storage URL.
  post.coverImage = await resolvePostCover(slug, post.coverImage);

  // The cover is the post's card + share art (GitButler-style): it fronts the
  // post everywhere even though the post body never renders it. OG scrapers
  // need ABSOLUTE URLs, so relative covers get the zone origin prefixed.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "blog.unenter.live";
  const origin = `https://${host}`;
  const abs = (u: string) => (u.startsWith("http") ? u : `${origin}${u}`);

  return {
    title:       `${post.title} | Unenter Blog`,
    description: post.excerpt,
    // No cover → omit openGraph entirely so the zone-level default OG image
    // (public.zones og_image via generateSiteMetadata) applies instead.
    ...(post.coverImage
      ? {
          openGraph: {
            type:          "article",
            title:         post.title,
            description:   post.excerpt,
            url:           `${origin}/${post.slug}`,
            siteName:      "Unenter Blog",
            publishedTime: post.publishedAt ?? undefined,
            authors:       post.authorName ? [post.authorName] : undefined,
            tags:          post.tags.length > 0 ? post.tags : undefined,
            images:        [{ url: abs(post.coverImage), alt: post.title }],
          },
          twitter: {
            card:        "summary_large_image",
            title:       post.title,
            description: post.excerpt,
            images:      [abs(post.coverImage)],
          },
        }
      : {}),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: PageProps) {
  const { slug }    = await params;
  const cookieStore = await cookies();
  const locale      = (cookieStore.get("Next-Locale")?.value ?? "en") as string;

  const post = await fetchPost(slug, locale);

  if (!post) notFound();

  const [morePosts, { newsletter }] = await Promise.all([
    fetchMorePosts(slug, locale).then((p) => p.slice(0, 4)),
    fetchBlogSettings(),
  ]);

  // Resolve predictable image slots (post://cover, post://image-1, …) against
  // the posts/<slug>/ folder in the blog-images bucket before rendering.
  let content = post.content;
  if (content.includes("post://") || post.coverImage?.startsWith("post://")) {
    const imageMap = await fetchPostImageMap(slug);
    content = resolvePostRefs(content, imageMap);
    if (post.coverImage?.startsWith("post://")) {
      post.coverImage = imageMap.get(post.coverImage.slice("post://".length)) ?? post.coverImage;
    }
  }

  // Render content: markdown gets highlighting + anchors + TOC; legacy HTML passes through.
  let contentHtml = content;
  let toc: TocEntry[] = [];
  if (post.contentFormat === "md") {
    const rendered = renderMarkdown(content);
    contentHtml = rendered.html;
    toc = rendered.toc;
  }

  const a = post.authorProfile;
  const authorLinks = a
    ? ([
        a.website_url && { label: "Website", href: a.website_url },
        a.github_url  && { label: "GitHub",  href: a.github_url },
        a.bluesky_url && { label: "Bluesky", href: a.bluesky_url },
        a.x_url       && { label: "X",       href: a.x_url },
      ].filter(Boolean) as { label: string; href: string }[])
    : [];
  const authorBio = a?.bio?.[locale] || a?.bio?.en || "";

  return (
    <>
      {/* Hero band */}
      <section className="bg-[hsl(var(--background))] pb-14 pt-8 text-[hsl(var(--foreground))] md:pb-20 md:pt-12">
        <div className="container">
          <div className="mx-auto max-w-4xl">
            {/* Meta row */}
            <div className="mb-6 space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {post.publishedAt && <span>{formatDate(post.publishedAt)}</span>}
                {post.authorName && (
                  <>
                    {post.publishedAt && <span className="opacity-50">{"\u2022"}</span>}
                    <span>by {post.authorName}</span>
                  </>
                )}
                {(post.publishedAt || post.authorName) && (
                  <span className="opacity-50">{"\u2022"}</span>
                )}
                <span>{readTime(post.content)}</span>
                {/* Revision badge \u2014 only once a post has actually been revised.
                    rev 1 is just "published"; the counter earns its pixels at 2+. */}
                {post.revision > 1 && (
                  <>
                    <span className="opacity-50">{"\u2022"}</span>
                    <span
                      className="rounded-full border border-current px-2 py-0.5 font-mono text-xs opacity-75"
                      title={post.updatedAt ? `Last revised ${formatDate(post.updatedAt)}` : undefined}
                    >
                      rev {post.revision}
                      {post.updatedAt ? ` \u00b7 ${formatDate(post.updatedAt)}` : ""}
                    </span>
                  </>
                )}
              </div>

              {post.tagLinks.length > 0 && (
                <nav aria-label="Post tags" className="flex flex-wrap gap-2">
                  {post.tagLinks.map((tag) => (
                    <Link
                      key={tag.slug}
                      href={`/tag/${encodeURIComponent(tag.slug)}`}
                      className="rounded-full border border-current px-3 py-1 text-xs capitalize opacity-75 transition hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))] hover:opacity-100"
                    >
                      {tag.name}
                    </Link>
                  ))}
                </nav>
              )}
            </div>

            <h1 className="font-serif text-4xl leading-tight md:text-6xl">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed opacity-80">
                {post.excerpt}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Body: share rail + prose */}
      <section className="py-14 md:py-20">
        <div className="container">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:gap-12">
            <aside className="order-1 shrink-0 lg:w-9">
              <ShareRail title={post.title} />
            </aside>

            <div className="order-2 min-w-0 max-w-3xl grow">
              <div
                className="blog-content text-lg leading-relaxed text-[hsl(var(--foreground))]/90"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
              {/* Hydrates any ``` chart ``` blocks in the content above into
                  interactive, theme-colored Chart.js charts. No-op if none. */}
              <ChartHydrator />

              {/* Author card */}
              {post.authorName && (
                <div className="mt-16 flex items-start gap-5 rounded-2xl border border-[hsl(var(--border))] p-6 md:p-8">
                  {a?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.avatar_url}
                      alt={post.authorName}
                      className="h-14 w-14 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 font-serif text-xl font-bold uppercase text-primary">
                      {post.authorName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      Written by <span className="font-bold">{post.authorName}</span>
                    </p>
                    {authorBio && (
                      <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                        {authorBio}
                      </p>
                    )}
                    {authorLinks.length > 0 && (
                      <p className="mt-2 text-sm">
                        {authorLinks.map((l, i) => (
                          <span key={l.label}>
                            {i > 0 && <span className="mx-2 text-[hsl(var(--muted-foreground))]">|</span>}
                            <a
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {l.label}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Table of Contents */}
              {toc.length > 1 && (
                <nav className="mt-10">
                  <h2 className="mb-4 font-serif text-2xl text-[hsl(var(--foreground))]">
                    Table <em className="italic">of</em> Contents
                  </h2>
                  <ul className="space-y-1.5">
                    {toc.map((entry) => (
                      <li key={entry.id} className={entry.depth === 3 ? "pl-5" : ""}>
                        <a
                          href={`#${entry.id}`}
                          className="text-sm text-[hsl(var(--muted-foreground))] hover:text-primary hover:underline"
                        >
                          {entry.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              {/* Back link */}
              <div className="mt-10">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                    className="rotate-180"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M3 8H13M13 8L9 4M13 8L9 12"
                      stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                  Back to Blog
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* More to Read */}
      {morePosts.length > 0 && (
        <section className="pb-16 md:pb-24">
          <div className="container">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-10 font-serif text-3xl text-[hsl(var(--foreground))] md:text-4xl">
                More to <em className="italic">Read</em>
              </h2>
              <div className="grid gap-10 md:grid-cols-2 md:gap-x-8 md:gap-y-14">
                {morePosts.map((p) => (
                  <GridCard key={p.id} post={p} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <NewsletterBand {...newsletter} />
    </>
  );
}
