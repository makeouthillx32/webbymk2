// src/data/useBlogData.ts
//
// Fetches blog post data from Supabase.
//
// Client components: call `useBlogPosts()` / `useBlogPost(slug)` (React hooks).
// Server components / RSC: import `queryBlogPosts` / `queryBlogPost` directly.

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlogPost {
  id:           string;
  slug:         string;
  title:        string;
  excerpt:      string;
  content:      string;
  coverImage:   string | null;
  author:       string | null;
  tags:         string[];
  publishedAt:  string | null;
}

interface RawBlogPost {
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

// ── Transform ─────────────────────────────────────────────────────────────────

function transformPost(row: RawBlogPost, locale: string): BlogPost {
  return {
    id:          row.id,
    slug:        row.slug,
    title:       row.title?.[locale]   ?? row.title?.en   ?? "",
    excerpt:     row.excerpt?.[locale] ?? row.excerpt?.en ?? "",
    content:     row.content?.[locale] ?? row.content?.en ?? "",
    coverImage:  row.cover_image,
    author:      row.author,
    tags:        row.tags ?? [],
    publishedAt: row.published_at,
  };
}

// ── Supabase queries ──────────────────────────────────────────────────────────

export async function queryBlogPosts(locale: string = "en"): Promise<BlogPost[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, cover_image, author, tags, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .returns<RawBlogPost[]>();

  if (error) {
    console.error("[useBlogData] queryBlogPosts error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => transformPost(row, locale));
}

export async function queryBlogPost(
  slug: string,
  locale: string = "en"
): Promise<BlogPost | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, content, cover_image, author, tags, published_at")
    .eq("slug", slug)
    .eq("is_published", true)
    .single<RawBlogPost>();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 = "no rows returned" — expected for missing slugs
      console.error("[useBlogData] queryBlogPost error:", error.message);
    }
    return null;
  }

  return data ? transformPost(data, locale) : null;
}

// ── React hooks (client components) ──────────────────────────────────────────

export type UseBlogPostsResult = {
  data:    BlogPost[];
  loading: boolean;
};

export function useBlogPosts(locale: string = "en"): UseBlogPostsResult {
  const [posts,   setPosts]   = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    queryBlogPosts(locale).then((data) => {
      setPosts(data);
      setLoading(false);
    });
  }, [locale]);

  return { data: posts, loading };
}

export type UseBlogPostResult = {
  post:    BlogPost | null;
  loading: boolean;
};

export function useBlogPost(slug: string, locale: string = "en"): UseBlogPostResult {
  const [post,    setPost]    = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    queryBlogPost(slug, locale).then((data) => {
      setPost(data);
      setLoading(false);
    });
  }, [slug, locale]);

  return { post, loading };
}
