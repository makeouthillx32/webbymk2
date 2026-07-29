"use client";
// Posts list — column definitions only. All state lives in useBlogPosts, all
// table markup in the shared DataTable.

import { ExternalLink, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPostDate, postAuthorName, postTags, postTitle, postUrl } from "@/lib/blog/posts";
import type { BlogPostRow } from "@/types/blog";
import { PostStatusBadge } from "./PostStatusBadge";

export function PostsTable({
  posts,
  loading,
  mutatingId,
  onEdit,
  onDelete,
  onTogglePublished,
  onCreate,
  filtered,
}: {
  posts: BlogPostRow[];
  loading: boolean;
  mutatingId: string | null;
  onEdit: (post: BlogPostRow) => void;
  onDelete: (post: BlogPostRow) => void;
  onTogglePublished: (post: BlogPostRow) => void;
  onCreate: () => void;
  /** True when a search/filter is narrowing the list — changes the empty copy. */
  filtered: boolean;
}) {
  const columns: DataTableColumn<BlogPostRow>[] = [
    {
      key: "title",
      header: "Title",
      cell: (post) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[hsl(var(--foreground))]">{postTitle(post)}</span>
            {post.content_format === "html" ? (
              <Badge variant="secondary" className="text-[10px]">
                HTML
              </Badge>
            ) : null}
            {post.title?.de?.trim() ? (
              <Badge variant="outline" className="text-[10px]">
                DE
              </Badge>
            ) : null}
          </div>
          <span className="mt-0.5 block truncate text-xs text-[hsl(var(--muted-foreground))]">
            /{post.slug}
          </span>
        </div>
      ),
    },
    {
      key: "author",
      header: "Author",
      hideOnMobile: true,
      cell: (post) => (
        <span className="text-[hsl(var(--muted-foreground))]">{postAuthorName(post)}</span>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      hideOnMobile: true,
      cell: (post) => {
        const tags = postTags(post);
        if (tags.length === 0) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-[hsl(var(--muted-foreground))]">
                {tag.name}
              </Badge>
            ))}
            {tags.length > 3 ? (
              <Badge variant="outline" className="text-[hsl(var(--muted-foreground))]">
                +{tags.length - 3}
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (post) => <PostStatusBadge post={post} />,
    },
    {
      key: "published",
      header: "Published",
      hideOnMobile: true,
      cell: (post) => (
        <span className="whitespace-nowrap text-[hsl(var(--muted-foreground))]">
          {formatPostDate(post.published_at)}
          {(post.revision ?? 1) > 1 ? (
            <span className="ml-2 font-mono text-xs opacity-70">rev {post.revision}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (post) => (
        // Row clicks open the editor — actions must not also trigger that.
        <div
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={mutatingId === post.id}
            title={post.is_published ? "Move back to drafts" : "Publish now"}
            onClick={() => onTogglePublished(post)}
          >
            {post.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
            <span className="sr-only">
              {post.is_published ? "Unpublish" : "Publish"} {postTitle(post)}
            </span>
          </Button>

          {post.is_published ? (
            <Button size="sm" variant="ghost" asChild title="Open the live post">
              <a href={postUrl(post.slug)} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />
                <span className="sr-only">View {postTitle(post)} live</span>
              </a>
            </Button>
          ) : null}

          <Button size="sm" variant="ghost" onClick={() => onEdit(post)} title="Edit">
            <Pencil size={15} />
            <span className="sr-only">Edit {postTitle(post)}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
            onClick={() => onDelete(post)}
            title="Delete"
          >
            <Trash2 size={15} />
            <span className="sr-only">Delete {postTitle(post)}</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={posts}
      columns={columns}
      loading={loading}
      getRowId={(post) => post.id}
      onRowClick={onEdit}
      emptyTitle={filtered ? "No posts match those filters" : "No posts yet"}
      emptyDescription={
        filtered
          ? "Try a different search term or switch the status filter."
          : "Write the first one, or drop a .dra draft into the editor."
      }
      emptyAction={filtered ? undefined : <Button onClick={onCreate}>New post</Button>}
    />
  );
}
