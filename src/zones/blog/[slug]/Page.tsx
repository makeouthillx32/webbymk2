// src/zones/blog/[slug]/Page.tsx
// Core: Blog post detail page — served at blog.unenter.live/<slug>

import { Metadata, ResolvingMetadata } from "next";
import { notFound }     from "next/navigation";
import { cookies }      from "next/headers";
import Image            from "next/image";
import Link             from "next/link";
import { createClient } from "@/utils/supabase/server";
import Breadcrumb       from "@/components/Common/Breadcrumb";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawPost {
  id:           string;
  slug:         string;
  title:        Record<string, string>;
  excerpt:      Record<string, string>;
  content:      Record<string, string>;
  cover_image:  string | null;
  author:       string | null;
  tags:         string[];
  published_at: string | null;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPost(slug: string, locale: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, content, cover_image, author, tags, published_at")
    .eq("slug", slug)
    .eq("is_published", true)
    .single<RawPost>();

  if (error || !data) return null;

  return {
    id:          data.id,
    slug:        data.slug,
    title:       data.title?.[locale]   ?? data.title?.en   ?? "",
    excerpt:     data.excerpt?.[locale] ?? data.excerpt?.en ?? "",
    content:     data.content?.[locale] ?? data.content?.en ?? "",
    coverImage:  data.cover_image,
    author:      data.author,
    tags:        data.tags ?? [],
    publishedAt: data.published_at,
  };
}


// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: PageProps,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const post     = await fetchPost(slug, "en");

  if (!post) return { title: "Post Not Found | Unenter Blog" };

  return {
    title:       `${post.title} | Unenter Blog`,
    description: post.excerpt,
    openGraph:   post.coverImage ? { images: [{ url: post.coverImage }] } : undefined,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year:  "numeric",
    month: "long",
    day:   "numeric",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: PageProps) {
  const { slug }    = await params;
  const cookieStore = await cookies();
  const locale      = (cookieStore.get("Next-Locale")?.value ?? "en") as string;

  const post = await fetchPost(slug, locale);

  if (!post) notFound();

  return (
    <>
      <Breadcrumb pageName={post.title} description={post.excerpt} />

      <section className="py-16 md:py-20 lg:py-28">
        <div className="container">
          <div className="mx-auto max-w-3xl">

            {/* Cover image */}
            {post.coverImage && (
              <div className="relative mb-10 h-[360px] w-full overflow-hidden rounded-sm">
                <Image
                  src={post.coverImage}
                  alt={post.title}
                  fill
                  priority
                  className="object-cover"
                />
              </div>
            )}

            {/* Meta row */}
            <div className="mb-8 flex flex-wrap items-center gap-4 border-b border-body-color/10 pb-6 dark:border-white/10">
              {post.author && (
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold uppercase">
                    {post.author.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-body-color">{post.author}</span>
                </div>
              )}

              {post.publishedAt && (
                <span className="text-sm text-body-color">{formatDate(post.publishedAt)}</span>
              )}

              {post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 ml-auto">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Content — stored as HTML in the DB */}
            <div
              className="blog-content text-body-color leading-relaxed"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Back link */}
            <div className="mt-12 pt-6 border-t border-body-color/10 dark:border-white/10">
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
      </section>
    </>
  );
}
