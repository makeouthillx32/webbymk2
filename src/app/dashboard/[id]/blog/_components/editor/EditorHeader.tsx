"use client";
// Sticky editor header: identity, locale switch, live-post link, save state.
// Sticky so Save is reachable from anywhere in a long post.
//
// Collapses to a slim toolbar once the page scrolls — full-size (title,
// slug/rev line, labeled buttons) is fine when it's sitting at the top of
// the page next to nothing, but once it's pinned over actual content it's
// pure overhead height for information the author already saw. Collapsed
// state drops what's purely informational (subtitle line, button labels)
// but keeps every ACTION reachable — back, both locales, View, Cancel,
// Save — just smaller. Nothing becomes unreachable, it just gets denser.

import { ArrowLeft, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { postUrl } from "@/lib/blog/posts";
import { BLOG_LOCALES, type BlogPostDraft, type Locale } from "@/types/blog";

export function EditorHeader({
  draft,
  slug,
  locale,
  onLocaleChange,
  dirty,
  saving,
  isNew,
  revision,
  onSave,
  onClose,
}: {
  draft: BlogPostDraft;
  slug: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  dirty: boolean;
  saving: boolean;
  isNew: boolean;
  /** Current stored revision (DB trigger bumps it on each content save). */
  revision?: number;
  onSave: () => void;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // The sentinel sits immediately above the sticky header, in normal flow.
  // Once ANY scroll carries it out of view, the header itself has started
  // sticking over real content — that's the "after you scroll" moment.
  // Watching an element instead of a raw scrollY number means this keeps
  // working no matter what sits above the editor or how tall it is.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <div
        className={cn(
          "sticky top-[var(--dashboard-header-h,64px)] z-20 -mx-4 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-4 backdrop-blur transition-[padding] duration-150 md:-mx-6 md:px-6",
          collapsed ? "py-1.5" : "py-3",
        )}
      >
        <Button variant="ghost" size="sm" onClick={onClose} title="Back to posts">
          <ArrowLeft size={16} />
          {collapsed ? null : "Posts"}
        </Button>

        <div className="min-w-0">
          <h2
            className={cn(
              "truncate font-semibold text-[hsl(var(--foreground))] transition-all",
              collapsed ? "text-xs" : "text-sm",
            )}
          >
            {draft.title.en?.trim() || (isNew ? "New post" : "Untitled post")}
          </h2>
          {collapsed ? null : (
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              /{slug || "slug-appears-here"}
              {revision ? ` · rev ${revision}` : ""}
              {draft.content_format === "html" ? " · legacy HTML" : ""}
            </p>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && !collapsed ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
              Unsaved
            </Badge>
          ) : null}
          {dirty && collapsed ? (
            <span
              aria-label="Unsaved changes"
              title="Unsaved changes"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            />
          ) : null}

          <div
            role="group"
            aria-label="Editing language"
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius)] border border-[hsl(var(--border))] transition-all",
              collapsed ? "p-0.5" : "p-1",
            )}
          >
            {BLOG_LOCALES.map((code) => {
              const filled = Boolean(draft.title[code]?.trim() || draft.content[code]?.trim());
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={locale === code}
                  onClick={() => onLocaleChange(code)}
                  title={filled ? `${code.toUpperCase()} has content` : `${code.toUpperCase()} is empty`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] text-xs font-semibold uppercase transition",
                    collapsed ? "px-1.5 py-0.5" : "px-2.5 py-1",
                    locale === code
                      ? "bg-primary text-[hsl(var(--primary-foreground))]"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                  )}
                >
                  {code}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      filled ? "bg-emerald-500" : "bg-[hsl(var(--muted-foreground))]/40",
                    )}
                  />
                </button>
              );
            })}
          </div>

          {draft.id && draft.is_published ? (
            <Button variant="outline" size="sm" asChild title="View the live post">
              <a href={postUrl(slug)} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />
                {collapsed ? null : "View"}
              </a>
            </Button>
          ) : null}

          <Button variant="outline" size="sm" onClick={onClose} title="Cancel">
            {collapsed ? <X size={15} /> : "Cancel"}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving} title={isNew ? "Create post" : "Save changes"}>
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
            {saving ? (collapsed ? null : "Saving…") : collapsed ? "Save" : isNew ? "Create post" : "Save changes"}
          </Button>
        </div>
      </div>
    </>
  );
}
