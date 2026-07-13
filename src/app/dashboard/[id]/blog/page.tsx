// app/dashboard/[id]/blog/page.tsx
// Blog manager: posts table + editor (mirrors the products/collections pattern).
"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { PostEditor, type AdminPost, type TagRow } from "./_components/PostEditor";

interface PostRow extends AdminPost {
  id: string;
  created_at: string;
  blog_authors?: { id: string; name: string } | null;
  blog_post_tags?: { blog_tags: TagRow }[];
}

async function readJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default function BlogManagerPage() {
  const [rows, setRows]       = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [status, setStatus]   = useState<"all" | "published" | "draft">("all");

  const [editing, setEditing]   = useState<AdminPost | null | "new">(null);
  const [deleting, setDeleting] = useState<PostRow | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ status, ...(search.trim() ? { q: search.trim() } : {}) });
    const j = await fetch(`/api/blog/admin?${params}`).then(readJson);
    if (j?.ok) setRows(j.data);
    else toast.error(j?.error?.message ?? "Failed to load posts");
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const confirmDelete = async () => {
    if (!deleting) return;
    const j = await fetch(`/api/blog/admin/${deleting.id}`, { method: "DELETE" }).then(readJson);
    if (!j?.ok) return toast.error(j?.error?.message ?? "Delete failed");
    toast.success("Post deleted");
    setDeleting(null);
    load();
  };

  if (editing) {
    return (
      <div className="p-4 md:p-6">
        <PostEditor
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Blog</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Write, edit and publish posts for blog.unenter.live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or slug…"
            className="rounded border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm text-[hsl(var(--foreground))]"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-2 text-sm text-[hsl(var(--foreground))]"
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
          <Button onClick={() => setEditing("new")}>New post</Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">No posts found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[hsl(var(--border))]/50 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-[hsl(var(--foreground))]">
                      {row.title?.en || row.slug}
                    </span>
                    <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">/{row.slug}</span>
                    {row.content_format === "html" && (
                      <span className="ml-2 rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                        HTML
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {row.blog_authors?.name ?? row.author ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.blog_post_tags ?? []).map((t) => (
                        <span
                          key={t.blog_tags.id}
                          className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]"
                        >
                          {t.blog_tags.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        row.is_published
                          ? "bg-primary/10 text-primary"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                      )}
                    >
                      {row.is_published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{fmtDate(row.published_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(row)}
                      className="mr-3 text-sm font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(row)}
                      className="text-sm font-medium text-[hsl(var(--destructive))] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">Delete post?</h3>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              “{deleting.title?.en || deleting.slug}” will be permanently removed.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
