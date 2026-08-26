"use client";
// Status pill for a post. `scheduled` is a real state — a published post with a
// future published_at is not live yet, and the old badge hid that.

import { CalendarClock, CircleDot, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { POST_STATUS_LABEL, postStatus } from "@/lib/blog/posts";
import type { BlogPostRow } from "@/types/blog";

export function PostStatusBadge({
  post,
}: {
  post: Pick<BlogPostRow, "is_published" | "published_at">;
}) {
  const status = postStatus(post);

  if (status === "published") {
    return (
      <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
        <CircleDot aria-hidden="true" />
        {POST_STATUS_LABEL.published}
      </Badge>
    );
  }

  if (status === "scheduled") {
    return (
      <Badge variant="outline" className="border-primary/40 text-primary">
        <CalendarClock aria-hidden="true" />
        {POST_STATUS_LABEL.scheduled}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      <FileEdit aria-hidden="true" />
      {POST_STATUS_LABEL.draft}
    </Badge>
  );
}
