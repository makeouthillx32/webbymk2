"use client";
// Blog post editor: EN/DE markdown authoring with live preview, cover +
// inline image uploads, tag and author pickers, publish controls.

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { marked } from "marked";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { BlogImageUploader } from "./BlogImageUploader";
import { BlogTagPicker, type TagRow } from "./BlogTagPicker";
import { PostImageSlots } from "./PostImageSlots";

export type { TagRow } from "./BlogTagPicker";

function slugifyClient(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
}

type Locale = "en" | "de";

export interface AuthorRow { id: string; slug: string; name: string; avatar_url?: string | null }

export interface AdminPost {
  id?: string;
  slug: string;
  title:   Record<string, string>;
  excerpt: Record<string, string>;
  content: Record<string, string>;
  content_format: "md" | "html";
  cover_image: string | null;
  author_id: string | null;
  is_published: boolean;
  published_at: string | null;
  blog_post_tags?: { blog_tags: TagRow }[];
}

const EMPTY: AdminPost = {
  slug: "",
  title:   { en: "", de: "" },
  excerpt: { en: "", de: "" },
  content: { en: "", de: "" },
  content_format: "md",
  cover_image: null,
  author_id: null,
  is_published: false,
  published_at: null,
};

async function readJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

export function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: AdminPost | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm]       = useState<AdminPost>(post ?? EMPTY);
  const [locale, setLocale]   = useState<Locale>("en");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving]   = useState(false);

  const [authors, setAuthors]   = useState<AuthorRow[]>([]);
  const [tagIds, setTagIds]     = useState<string[]>(
    (post?.blog_post_tags ?? []).map((t) => t.blog_tags.id),
  );
  const [newAuthor, setNewAuthor] = useState("");

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);

  // Predictable image slots (posts/<slug>/cover, image-1, …)
  const [slotMap, setSlotMap] = useState<Record<string, string>>({});
  const effectiveSlug = form.slug || slugifyClient(form.title.en);

  useEffect(() => {
    fetch("/api/blog/admin/authors").then(readJson).then((j) => j?.ok && setAuthors(j.data));
  }, []);

  const setField = (key: keyof AdminPost, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setLocalized = (key: "title" | "excerpt" | "content", value: string) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [locale]: value } }));

  const previewHtml = useMemo(() => {
    let src = form.content[locale] ?? "";
    // Resolve post://<slot> references so the preview matches the live render.
    src = src.replace(/post:\/\/([\w][\w.-]*)/g, (whole, slot: string) => slotMap[slot] ?? whole);
    if (form.content_format === "html") return src;
    try { return marked.parse(src, { async: false }) as string; } catch { return ""; }
  }, [form.content, form.content_format, locale, slotMap]);

  const insertAtCursor = (snippet: string) => {
    const ta = contentRef.current;
    const src = form.content[locale] ?? "";
    const pos = ta ? ta.selectionStart : src.length;
    setLocalized("content", `${src.slice(0, pos)}${snippet}${src.slice(pos)}`);
  };

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "md" && extension !== "markdown") {
      return toast.error("Choose a .md or .markdown file");
    }
    if (file.size > 2 * 1024 * 1024) {
      return toast.error("Markdown files must be 2 MB or smaller");
    }

    const currentContent = form.content[locale]?.trim();
    if (
      currentContent &&
      !window.confirm(`Replace the current ${locale.toUpperCase()} content with ${file.name}?`)
    ) {
      return;
    }

    try {
      const source = (await file.text()).replace(/^\uFEFF/, "");
      if (!source.trim()) return toast.error("That Markdown file is empty");

      setForm((current) => ({
        ...current,
        content_format: "md",
        content: { ...current.content, [locale]: source },
      }));
      setPreview(false);
      toast.success(`${file.name} imported into ${locale.toUpperCase()}`);
      requestAnimationFrame(() => contentRef.current?.focus());
    } catch {
      toast.error("Could not read that Markdown file");
    }
  };

  const createAuthor = async () => {
    if (!newAuthor.trim()) return;
    const j = await fetch("/api/blog/admin/authors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAuthor.trim() }),
    }).then(readJson);
    if (!j?.ok) return toast.error(j?.error?.message ?? "Author create failed");
    setAuthors((a) => [...a, j.data]);
    setField("author_id", j.data.id);
    setNewAuthor("");
  };

  const save = async () => {
    if (!form.title.en.trim()) return toast.error("English title is required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        blog_post_tags: undefined,
        tag_command: { command: "tags.replace", tag_ids: tagIds },
      };
      const res = form.id
        ? await fetch(`/api/blog/admin/${form.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/blog/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const j = await readJson(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error?.message ?? `Save failed (${res.status})`);
      toast.success(form.id ? "Post updated" : "Post created");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full rounded border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-primary";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]";

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 md:p-7">
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          {form.id ? "Edit post" : "New post"}
          {form.content_format === "html" && (
            <span className="ml-3 rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              legacy HTML
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {(["en", "de"] as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={cn(
                "rounded px-3 py-1 text-sm font-semibold uppercase transition",
                locale === l
                  ? "bg-primary text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Left: content */}
        <div className="space-y-4">
          <div>
            <label className={label}>Title ({locale})</label>
            <input
              className={input}
              value={form.title[locale] ?? ""}
              onChange={(e) => setLocalized("title", e.target.value)}
            />
          </div>

          <div>
            <label className={label}>Excerpt / subtitle ({locale})</label>
            <textarea
              className={cn(input, "min-h-[64px]")}
              value={form.excerpt[locale] ?? ""}
              onChange={(e) => setLocalized("excerpt", e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className={label}>
                Content ({locale}) — {form.content_format === "md" ? "Markdown" : "HTML"}
              </label>
              <div className="flex shrink-0 items-center gap-3">
                <input
                  ref={markdownInputRef}
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  className="hidden"
                  onChange={importMarkdown}
                />
                <button
                  type="button"
                  title={`Import Markdown into ${locale.toUpperCase()}`}
                  onClick={() => markdownInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <FileUp size={14} aria-hidden="true" />
                  Import .md
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(!preview)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {preview ? "Edit" : "Preview"}
                </button>
              </div>
            </div>

            {preview ? (
              <div
                className="blog-content min-h-[320px] rounded border border-[hsl(var(--border))] p-4 text-[hsl(var(--foreground))]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <textarea
                ref={contentRef}
                className={cn(input, "min-h-[320px] font-mono text-xs leading-relaxed")}
                value={form.content[locale] ?? ""}
                onChange={(e) => setLocalized("content", e.target.value)}
                placeholder={"## Heading\n\nWrite markdown here…\n\n```ts\nconst code = true;\n```"}
              />
            )}
          </div>

          <div className="rounded border border-dashed border-[hsl(var(--border))] p-3">
            <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">
              Insert an image at the cursor:
            </p>
            <BlogImageUploader
              postId={form.id ?? null}
              label="Upload + insert"
              onUploaded={(url, alt) => insertAtCursor(`\n![${alt || "image"}](${url})\n`)}
            />
          </div>
        </div>

        {/* Right: meta */}
        <div className="space-y-4">
          <div>
            <label className={label}>Slug</label>
            <input
              className={input}
              value={form.slug}
              onChange={(e) => setField("slug", e.target.value)}
              placeholder="auto-generated from English title"
            />
          </div>

          <div>
            <label className={label}>Post images (predictable slots)</label>
            {form.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.cover_image}
                alt="cover"
                className="mb-2 h-28 w-full rounded object-cover"
              />
            )}
            <PostImageSlots
              slug={effectiveSlug}
              onCoverChange={(url) => setField("cover_image", url)}
              onInsertRef={insertAtCursor}
              onMapChange={setSlotMap}
            />
          </div>

          <div>
            <label className={label}>Author</label>
            <select
              className={input}
              value={form.author_id ?? ""}
              onChange={(e) => setField("author_id", e.target.value || null)}
            >
              <option value="">— none —</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              <input
                className={input}
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                placeholder="New author name"
              />
              <Button type="button" size="sm" variant="outline" onClick={createAuthor}>Add</Button>
            </div>
          </div>

          <div>
            <label className={label}>Tags</label>
            <BlogTagPicker value={tagIds} onChange={setTagIds} />
          </div>

          <div className="rounded border border-[hsl(var(--border))] p-3">
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setField("is_published", e.target.checked)}
              />
              Published
            </label>
            <div className="mt-2">
              <label className={label}>Publish date</label>
              <input
                type="datetime-local"
                className={input}
                value={form.published_at ? form.published_at.slice(0, 16) : ""}
                onChange={(e) =>
                  setField("published_at", e.target.value ? new Date(e.target.value).toISOString() : null)
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] pt-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Create post"}
        </Button>
      </div>
    </div>
  );
}
