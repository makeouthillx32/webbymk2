"use client";

import { useEffect, useState } from "react";

type StaticPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  content_format: "html" | "markdown";
  meta_description: string | null;
  updated_at: string;
  version: number;
};

function renderContent(page: Pick<StaticPage, "content" | "content_format">) {
  if (page.content_format === "html") {
    return (
      <div
        className="prose prose-slate max-w-none dark:prose-invert
          prose-headings:text-[hsl(var(--foreground))]
          prose-p:text-[hsl(var(--foreground))]
          prose-a:text-[hsl(var(--primary))]
          prose-strong:text-[hsl(var(--foreground))]
          prose-ul:text-[hsl(var(--foreground))]
          prose-ol:text-[hsl(var(--foreground))]"
        dangerouslySetInnerHTML={{ __html: page.content }}
      />
    );
  }

  // basic markdown (same model as your pages/[slug] route)
  return (
    <div className="prose prose-slate max-w-none dark:prose-invert">
      {page.content.split("\n").map((line, i) => {
        if (line.trim().startsWith("#")) {
          const level = line.match(/^#+/)?.[0].length || 1;
          const text = line.replace(/^#+\s*/, "");
          const Tag = `h${level}` as keyof JSX.IntrinsicElements;
          return (
            <Tag key={i} className="text-[hsl(var(--foreground))]">
              {text}
            </Tag>
          );
        }

        return line.trim() ? (
          <p key={i} className="mb-3 text-[hsl(var(--foreground))]">
            {line}
          </p>
        ) : (
          <div key={i} className="h-3" />
        );
      })}
    </div>
  );
}

export function StaticPageShell({
  slug,
  className = "",
  showHeader = false,
  fallback = null,
}: {
  slug: string;
  className?: string;
  showHeader?: boolean;
  fallback?: React.ReactNode;
}) {
  const [page, setPage] = useState<StaticPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/static-pages/${encodeURIComponent(slug)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || `Failed to load page: ${slug}`);
        }

        if (!cancelled) setPage(json.data as StaticPage);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load page");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return fallback;
  if (err) return null; // keep landing clean; no noisy iframe-like errors
  if (!page) return null;

  return (
    <div className={className}>
      {showHeader ? (
        <header className="mb-6 border-b border-[hsl(var(--border))] pb-4">
          <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]">
            {page.title}
          </h2>
          {page.meta_description ? (
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {page.meta_description}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
            <span>
              Updated{" "}
              {new Date(page.updated_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span>•</span>
            <span>v{page.version}</span>
          </div>
        </header>
      ) : null}

      {renderContent(page)}
    </div>
  );
}
