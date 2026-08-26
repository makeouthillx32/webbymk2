// app/dashboard/[id]/blog/page.tsx
// Blog manager shell: list ⇄ editor. State lives in hooks (useBlogPosts,
// usePostForm), table markup in shared dashboard primitives, so this file only
// decides which view is showing.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { FilterTabs, PageHeader, SearchInput } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useBlogPosts } from "@/hooks/blog/useBlogPosts";
import { postTitle } from "@/lib/blog/posts";
import type { BlogPostRow, PostStatusFilter } from "@/types/blog";
import { PostsTable } from "./_components/PostsTable";
import { PostEditor } from "./_components/editor/PostEditor";

type EditorTarget = BlogPostRow | "new" | null;

const STATUS_OPTIONS: { value: PostStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
];

export default function BlogManagerPage() {
  const params = useParams<{ id: string }>();
  const chromeHref = `/dashboard/${params?.id ?? ""}/blog/chrome`;

  const {
    posts,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    reload,
    deletePost,
    togglePublished,
    mutatingId,
  } = useBlogPosts();

  const [editing, setEditing] = useState<EditorTarget>(null);
  const [pendingDelete, setPendingDelete] = useState<BlogPostRow | null>(null);

  if (editing) {
    return (
      <div className="p-4 md:p-6">
        <PostEditor
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Blog"
        description="Write, edit and publish posts for blog.unenter.live."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={chromeHref}>
                <Settings2 size={16} />
                Chrome
              </Link>
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} />
              New post
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search title or slug…"
          className="w-full sm:w-72"
        />
        <FilterTabs
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
          ariaLabel="Filter posts by status"
        />
        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
          {loading ? "Loading…" : `${posts.length} post${posts.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error ? (
        <div className="mb-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10 px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
          <button onClick={() => void reload()} className="ml-3 font-medium underline">
            Retry
          </button>
        </div>
      ) : null}

      <PostsTable
        posts={posts}
        loading={loading}
        mutatingId={mutatingId}
        filtered={Boolean(search.trim()) || status !== "all"}
        onEdit={setEditing}
        onDelete={setPendingDelete}
        onTogglePublished={togglePublished}
        onCreate={() => setEditing("new")}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        tone="destructive"
        title="Delete this post?"
        description={
          pendingDelete
            ? `“${postTitle(pendingDelete)}” and its tag links will be permanently removed. Uploaded images stay in storage.`
            : undefined
        }
        confirmLabel="Delete post"
        onConfirm={async () => {
          if (!pendingDelete) return;
          const ok = await deletePost(pendingDelete);
          if (ok) setPendingDelete(null);
        }}
      />
    </div>
  );
}
