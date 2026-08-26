"use client";
// Right-hand column of the editor: identity, imagery, byline, tags, publishing.
// Grouped into labelled sections so a long form stays scannable.

import { Field } from "@/components/dashboard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/slug";
import { resolveCoverUrl } from "@/lib/blog/images";
import { postUrl } from "@/lib/blog/posts";
import type { UseBlogAuthorsResult } from "@/hooks/blog/useBlogAuthors";
import type { UsePostSlotsResult } from "@/hooks/blog/usePostSlots";
import type { BlogPostDraft } from "@/types/blog";
import { BlogTagPicker } from "../BlogTagPicker";
import { AuthorPanel } from "./AuthorPanel";
import { ImageLibrary } from "./ImageLibrary";
import { PostImageSlots } from "./PostImageSlots";
import { PublishPanel } from "./PublishPanel";

export function MetaPane({
  draft,
  slug,
  slots,
  authors,
  tagIds,
  onTagIdsChange,
  onFieldChange,
  onInsert,
}: {
  draft: BlogPostDraft;
  slug: string;
  slots: UsePostSlotsResult;
  authors: UseBlogAuthorsResult;
  tagIds: string[];
  onTagIdsChange: (ids: string[]) => void;
  onFieldChange: <K extends keyof BlogPostDraft>(key: K, value: BlogPostDraft[K]) => void;
  onInsert: (snippet: string) => void;
}) {
  const coverUrl = resolveCoverUrl(draft.cover_image, slots.slots);

  return (
    <div className="space-y-4">
      <SectionCard title="Identity">
        <Field
          label="Slug"
          htmlFor="post-slug"
          hint={slug ? postUrl(slug) : "Derived from the English title until you set one"}
        >
          <Input
            id="post-slug"
            value={draft.slug}
            onChange={(event) => onFieldChange("slug", event.target.value)}
            onBlur={(event) => onFieldChange("slug", slugify(event.target.value))}
            placeholder={slugify(draft.title.en ?? "")}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Images" description="Cover and numbered slots for this post">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt="Cover"
            className="mb-3 h-28 w-full rounded-[var(--radius)] object-cover"
          />
        ) : null}

        <PostImageSlots
          slug={slug}
          slots={slots}
          coverImage={draft.cover_image}
          onSetCover={(ref) => onFieldChange("cover_image", ref)}
          onInsert={onInsert}
        />
      </SectionCard>

      <SectionCard title="Byline">
        <AuthorPanel
          authors={authors}
          value={draft.author_id}
          onChange={(authorId) => onFieldChange("author_id", authorId)}
        />
      </SectionCard>

      <SectionCard title="Tags">
        <BlogTagPicker value={tagIds} onChange={onTagIdsChange} />
      </SectionCard>

      <SectionCard title="Publishing">
        <PublishPanel draft={draft} onChange={onFieldChange} />
      </SectionCard>

      <SectionCard title="Image library" description="Reuse anything already uploaded">
        <ImageLibrary postId={draft.id ?? null} onInsert={onInsert} />
      </SectionCard>
    </div>
  );
}
