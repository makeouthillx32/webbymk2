// src/zones/blog/Page.tsx
// Core: Blog list page — served at blog.unenter.live/

import { Metadata }     from "next";
import { cookies }      from "next/headers";
import Link             from "next/link";
import Image            from "next/image";
import { createClient } from "@/utils/supabase/server";
import Breadcrumb       from "@/components/Common/Breadcrumb";

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

async function fetchPosts(locale: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, cover_image, author, tags, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .returns<RawPost[]>();

  if (error) {
    console.error("[blog/page] fetch error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id:          row.id,
    slug:        row.slug,
    title:       row.title?.[locale]   ?? row.title?.en   ?? "",
    excerpt:     row.excerpt?.[locale] ?? row.excerpt?.en ?? "",
    coverImage:  row.cover_image,
    author:      row.author,
    tags:        row.tags ?? [],
    publishedAt: row.published_at,
  }));
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

export default async function BlogPage() {
  const cookieStore = await cookies();
  const locale      = (cookieStore.get("Next-Locale")?.value ?? "en") as string;

  const posts = await fetchPosts(locale);

  return (
    <>
      <Breadcrumb
        pageName="Blog"
        description="Latest news, guides, and updates from the Unenter team."
      />

      <section className="py-16 md:py-20 lg:py-28">
        <div className="container">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-body-color text-lg">No posts published yet — check back soon.</p>
            </div>
          ) : (
            <div className="-mx-4 flex flex-wrap">
              {posts.map((post) => (
                <div key={post.id} className="w-full px-4 md:w-2/3 lg:w-1/2 xl:w-1/3 mb-10">
                  <BlogCard post={post} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ── Blog Card ─────────────────────────────────────────────────────────────────

function BlogCard({
  post,
}: {
  post: {
    slug:        string;
    title:       string;
    excerpt:     string;
    coverImage:  string | null;
    author:      string | null;
    tags:        string[];
    publishedAt: string | null;
  };
}) {
  return (
    <div className="group rounded-sm bg-white shadow-one hover:shadow-two duration-300 dark:bg-dark dark:shadow-three dark:hover:shadow-gray-dark overflow-hidden">
      {/* Cover image */}
      <Link href={`/${post.slug}`} className="relative block h-[220px] w-full overflow-hidden">
        {post.coverImage ? (
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            className="object-cover transition group-hover:scale-105 duration-500"
          />
        ) : (
          <div className="h-full w-full bg-primary/10 flex items-center justify-center">
            <span className="text-5xl text-primary/30">✎</span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="p-6 sm:p-8 md:py-8 md:px-6 lg:p-8 xl:py-8 xl:px-5 2xl:p-8">
        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h3>
          <Link
            href={`/${post.slug}`}
            className="mb-4 block text-xl font-bold text-black hover:text-primary dark:text-white dark:hover:text-primary sm:text-2xl"
          >
            {post.title}
          </Link>
        </h3>

        {/* Excerpt */}
        <p className="mb-6 text-base font-medium leading-relaxed text-body-color line-clamp-3">
          {post.excerpt}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between border-t border-body-color/10 pt-5 dark:border-white/10">
          {post.author && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold uppercase">
                {post.author.charAt(0)}
              </div>
              <span className="text-sm font-medium text-body-color">{post.author}</span>
            </div>
          )}
          {post.publishedAt && (
            <span className="text-sm text-body-color">{formatDate(post.publishedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
