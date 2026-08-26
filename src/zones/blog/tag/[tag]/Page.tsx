import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { GridCard } from "../../_components/Cards";
import type { BlogPostSummary } from "../../_components/helpers";
import { resolvePostCover } from "../../_components/postImages";

interface PageProps {
  params: Promise<{ tag: string }>;
}

interface TagRecord {
  id: string;
  slug: string;
  name: string;
}

interface RawPost {
  id: string;
  slug: string;
  title: Record<string, string>;
  excerpt: Record<string, string>;
  cover_image: string | null;
  author: string | null;
  tags: string[];
  published_at: string | null;
  blog_authors: { name: string } | null;
}

async function fetchTag(slug: string): Promise<TagRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_tags")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle<TagRecord>();

  if (error) {
    console.error("[blog/tag] tag fetch error:", error.message);
    return null;
  }

  return data;
}

async function fetchTaggedPosts(tagId: string, locale: string): Promise<BlogPostSummary[]> {
  const supabase = await createClient();
  const { data: links, error: linksError } = await supabase
    .from("blog_post_tags")
    .select("post_id")
    .eq("tag_id", tagId);

  if (linksError) {
    console.error("[blog/tag] link fetch error:", linksError.message);
    return [];
  }

  const postIds = (links ?? []).map((link) => link.post_id);
  if (postIds.length === 0) return [];

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, cover_image, author, tags, published_at, blog_authors ( name )")
    .in("id", postIds)
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[blog/tag] post fetch error:", error.message);
    return [];
  }

  return Promise.all(((data ?? []) as unknown as RawPost[]).map(async (post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title?.[locale] ?? post.title?.en ?? "",
    excerpt: post.excerpt?.[locale] ?? post.excerpt?.en ?? "",
    coverImage: await resolvePostCover(post.slug, post.cover_image),
    author: post.blog_authors?.name ?? post.author,
    tags: post.tags ?? [],
    publishedAt: post.published_at,
  })));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag: slug } = await params;
  const tag = await fetchTag(slug);

  if (!tag) return { title: "Tag Not Found | Unenter Blog" };

  return {
    title: `Tagged with ${tag.name} | Unenter Blog`,
    description: `Read Unenter blog posts tagged with ${tag.name}.`,
  };
}

export default async function BlogTagPage({ params }: PageProps) {
  const { tag: slug } = await params;
  const cookieStore = await cookies();
  const locale = cookieStore.get("Next-Locale")?.value ?? "en";
  const tag = await fetchTag(slug);

  if (!tag) notFound();

  const posts = await fetchTaggedPosts(tag.id, locale);

  return (
    <>
      <section className="border-b border-current/10 bg-[hsl(var(--secondary))] py-14 text-[hsl(var(--secondary-foreground))] md:py-20">
        <div className="container">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="font-serif text-4xl leading-tight md:text-6xl">
              Tagged with &ldquo;{tag.name}&rdquo;
            </h1>
            <p className="mt-5 text-base opacity-70">
              {posts.length} {posts.length === 1 ? "article" : "articles"}
            </p>
          </div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-4xl">
            {posts.length > 0 ? (
              <div className="grid gap-12 md:grid-cols-2 md:gap-x-8 md:gap-y-16">
                {posts.map((post) => (
                  <GridCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-[hsl(var(--muted-foreground))]">
                No published articles use this tag yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
