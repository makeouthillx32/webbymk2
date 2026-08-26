"use client";
// Post editor shell. Composes the hooks (form state, image slots, tag/author
// catalogues, .dra import) and hands each pane exactly what it needs — no data
// fetching or upload logic lives in this file.

import { useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { useBlogAuthors } from "@/hooks/blog/useBlogAuthors";
import { useBlogTags } from "@/hooks/blog/useBlogTags";
import { useImageDropInsert } from "@/hooks/blog/useImageDropInsert";
import { usePostForm } from "@/hooks/blog/usePostForm";
import { usePostSlots } from "@/hooks/blog/usePostSlots";
import { useTextInsertion } from "@/hooks/useTextInsertion";
import { COVER_SLOT } from "@/lib/blog/constants";
import { slotRef } from "@/lib/blog/images";
import type { BlogPostDraft, BlogPostRow } from "@/types/blog";

function revisionOf(post: BlogPostRow | BlogPostDraft | null): number | undefined {
  return post && "revision" in post ? (post as BlogPostRow).revision : undefined;
}
import { ContentPane } from "./ContentPane";
import { EditorHeader } from "./EditorHeader";
import { MetaPane } from "./MetaPane";
import { useDraImport } from "./useDraImport";

export function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  /** null = create a new post. */
  post: BlogPostRow | BlogPostDraft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Saving commits this session's provisional image uploads; the ref breaks
  // the ordering knot (form needs the callback before slots exists).
  const commitSessionRef = useRef<() => void>(() => {});

  const form = usePostForm({
    post,
    onSaved: () => {
      commitSessionRef.current();
      onSaved();
    },
  });
  const tags = useBlogTags();
  const authors = useBlogAuthors();

  const slots = usePostSlots({
    slug: form.slug,
    // Uploading into the cover slot points cover_image at the slot, not a URL,
    // so replacing the file later needs no edit to the post.
    onCoverChange: (url) => form.setField("cover_image", url ? slotRef(COVER_SLOT) : null),
  });
  commitSessionRef.current = slots.commitSession;

  /**
   * Cancel = images pasted this session but never saved are deleted from
   * storage. Uploads are immediate (the preview needs the bytes) but
   * provisional until Save — otherwise abandoned edits leak orphaned files
   * into posts/<slug>/ forever.
   */
  const handleClose = useCallback(() => {
    void slots.discardSession().then((removed) => {
      if (removed > 0) toast(`Removed ${removed} unsaved image${removed === 1 ? "" : "s"}`);
    });
    onClose();
  }, [slots, onClose]);

  const insertion = useTextInsertion(form.draft.content[form.locale] ?? "", (next) =>
    form.setLocalizedField("content", next),
  );

  const images = useImageDropInsert({
    reserveSlot: slots.reserveSlot,
    upload: slots.upload,
    insert: insertion.insert,
    enabled: Boolean(form.slug),
  });

  const dra = useDraImport({
    hasContent: Boolean(form.draft.title.en.trim() || form.draft.content.en?.trim()),
    replaceDraft: form.replaceDraft,
    setTagIds: form.setTagIds,
    resolveTags: tags.resolveTags,
    resolveAuthorByName: authors.resolveAuthorByName,
    refreshSlots: slots.refresh,
  });

  /** One entry point for files arriving from anywhere in the editor. */
  const handleFiles = useCallback(
    (files: File[]) => {
      const draFile = files.find((file) => file.name.toLowerCase().endsWith(".dra"));
      if (draFile) {
        void dra.importDra(
          draFile,
          files.filter((file) => file !== draFile),
        );
        return;
      }
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        void images.ingest(imageFiles);
        return;
      }
      toast("Drop images or a .dra draft here", { duration: 3000 });
    },
    [dra, images],
  );

  return (
    <DragDropUpload onFilesDropped={handleFiles}>
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 pb-6 md:px-6">
        <EditorHeader
          draft={form.draft}
          slug={form.slug}
          locale={form.locale}
          onLocaleChange={form.setLocale}
          dirty={form.dirty}
          saving={form.saving || dra.importing}
          isNew={form.isNew}
          revision={revisionOf(post)}
          onSave={() => void form.save()}
          onClose={handleClose}
        />

        {/* min-w-0 on both tracks: a grid item's default min-width is auto
            (its content's min-content size), not 0 — without this, one long
            unbroken token anywhere in either pane (a URL, a filename, a
            single long word inside the code editor's own content) forces
            that column wider than the viewport instead of wrapping, and the
            whole page gains horizontal scroll with the other pane peeking
            in as a sliver at the edge. Mobile has no second explicit
            grid-cols track to constrain it, so it's the only thing holding
            width to 100% there. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="min-w-0">
            <ContentPane
              draft={form.draft}
              locale={form.locale}
              slots={slots.slots}
              insertion={insertion}
              onLocalizedChange={(field, value) => form.setLocalizedField(field, value)}
              onPasteFiles={images.handlePaste}
              onDropFiles={handleFiles}
              onImportDra={(file) => void dra.importDra(file)}
              uploadingImages={images.pending}
              canUploadImages={Boolean(form.slug)}
            />
          </div>

          <div className="min-w-0">
            <MetaPane
              draft={form.draft}
              slug={form.slug}
              slots={slots}
              authors={authors}
              tagIds={form.tagIds}
              onTagIdsChange={form.setTagIds}
              onFieldChange={form.setField}
              onInsert={insertion.insert}
            />
          </div>
        </div>
      </div>
    </DragDropUpload>
  );
}
