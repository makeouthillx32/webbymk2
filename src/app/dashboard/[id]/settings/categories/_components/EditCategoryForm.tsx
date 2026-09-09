"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Upload, Trash2, ImageIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

/** Default cover bucket. Labs passes its own — see the `bucket` prop. */
const DEFAULT_BUCKET = "category-covers";
import { publicStorageUrl } from "@/lib/storageUrl";
import {
  CardOverlaySlots,
  CardScrim,
} from "@/components/shop/_components/CardOverlaySlots";

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active?: boolean;
  cover_image_bucket?: string | null;
  cover_image_path?: string | null;
  cover_image_alt?: string | null;
  eyebrow?: string | null;
  tagline?: string | null;
  subtitle?: string | null;
  cta_label?: string | null;
};

/**
 * Which concern this editor is serving.
 *
 * The same category row answers two unrelated questions, and mixing them is
 * what made this area confusing. "structure" is the nav tree — name, slug and
 * nesting. "display" is the artwork a card renders with — cover image and the
 * copy laid over it. Splitting the FORM rather than the TABLE keeps one row of
 * truth while letting each screen ask only what it is actually for.
 *
 * Hidden fields still hydrate from the row and still round-trip through save,
 * so editing in one mode never blanks what the other mode owns.
 */
export type CategoryFormMode = "structure" | "display";

interface EditCategoryFormProps {
  open: boolean;
  category: Category | null;
  categories: Category[];
  mode?: CategoryFormMode;
  /** Storage bucket for cover uploads. Lets Labs reuse this editor as-is. */
  bucket?: string;
  /**
   * Table the cover write targets.
   *
   * The image is saved directly by this form rather than through onSave, so it
   * needs the table too — hardcoded to "categories" it would have written a
   * Labs cover path onto the shop table and silently matched no row.
   */
  table?: "categories" | "research_categories";
  onClose: () => void;
  onSave: (data: { id: string; name: string; slug: string; parent_id: string | null; eyebrow: string | null; tagline: string | null; subtitle: string | null; cta_label: string | null }) => Promise<void>;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Browser-safe public URL — see lib/storageUrl. */
const getCoverUrl = publicStorageUrl;

export function EditCategoryForm({
  open,
  category,
  categories,
  mode = "structure",
  bucket = DEFAULT_BUCKET,
  table = "categories",
  onClose,
  onSave,
}: EditCategoryFormProps) {
  const isDisplay = mode === "display";
  // Calling createClient() directly rather than passing a url/key: the wrapper
  // ignores both arguments anyway, so passing them only implied a control that
  // does not exist. Uploads were always fine; it was the hand-built public URL
  // (see lib/storageUrl) that pointed at the unreachable internal address.
  const supabase = React.useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState<string>("");
  // Optional editorial copy — all blank renders the plain card.
  const [eyebrow, setEyebrow] = useState("");
  const [tagline, setTagline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  // Optional editorial copy — blank means "render the plain card".

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDeleting, setImageDeleting] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSlug(category.slug);
      setParentId(category.parent_id ?? "");
      setEyebrow(category.eyebrow ?? "");
      setTagline(category.tagline ?? "");
      setSubtitle(category.subtitle ?? "");
      setCtaLabel(category.cta_label ?? "");
      setError(null);
      setImageError(null);
      setImagePath(category.cover_image_path ?? null);
      setImageUrl(getCoverUrl(category.cover_image_bucket, category.cover_image_path));
    }
  }, [category?.id]);

  const handleSlugChange = (val: string) => setSlug(slugify(val));

  // Prevent circular parent assignment
  const getDescendantIds = (id: string): Set<string> => {
    const result = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const current = queue.shift()!;
      categories.forEach((c) => {
        if (c.parent_id === current && !result.has(c.id)) {
          result.add(c.id);
          queue.push(c.id);
        }
      });
    }
    return result;
  };

  const invalidParents = category
    ? new Set([category.id, ...getDescendantIds(category.id)])
    : new Set<string>();

  const parentOptions = categories.filter((c) => !invalidParents.has(c.id));

  const getOptionLabel = (cat: Category): string => {
    if (!cat.parent_id) return cat.name;
    const parent = categories.find((c) => c.id === cat.parent_id);
    return parent ? `${parent.name} › ${cat.name}` : cat.name;
  };

  // Upload image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !category) return;

    if (!file.type.startsWith("image/")) {
      setImageError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be under 5MB.");
      return;
    }

    setImageUploading(true);
    setImageError(null);

    try {
      // Delete old image first if exists
      if (imagePath) {
        await supabase.storage.from(bucket).remove([imagePath]);
      }

      const ext = file.name.split(".").pop() ?? "jpg";
      const newPath = `${category.id}/cover.${ext}?t=${Date.now()}`;
      const cleanPath = `${category.id}/cover.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(cleanPath, file, { upsert: true });

      if (uploadError) {
        setImageError(uploadError.message);
        return;
      }

      // Save to DB
      const { error: dbError } = await supabase
        .from(table)
        .update({
          cover_image_bucket: bucket,
          cover_image_path: cleanPath,
          cover_image_alt: name,
        })
        .eq("id", category.id);

      if (dbError) {
        setImageError(dbError.message);
        return;
      }

      setImagePath(cleanPath);
      setImageUrl(publicStorageUrl(bucket, cleanPath, true));
    } catch (e: any) {
      setImageError(e?.message ?? "Upload failed.");
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete image
  const handleImageDelete = async () => {
    if (!imagePath || !category) return;
    setImageDeleting(true);
    setImageError(null);

    try {
      await supabase.storage.from(bucket).remove([imagePath]);

      await supabase
        .from(table)
        .update({ cover_image_bucket: null, cover_image_path: null, cover_image_alt: null })
        .eq("id", category.id);

      setImagePath(null);
      setImageUrl(null);
    } catch (e: any) {
      setImageError(e?.message ?? "Delete failed.");
    } finally {
      setImageDeleting(false);
    }
  };

  const handleSubmit = async () => {
    if (!category) return;
    if (!name.trim()) { setError("Name is required."); return; }
    if (!slug.trim()) { setError("Slug is required."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: category.id,
        name: name.trim(),
        slug: slug.trim(),
        parent_id: parentId || null,
        eyebrow: eyebrow.trim() || null,
        tagline: tagline.trim() || null,
        subtitle: subtitle.trim() || null,
        cta_label: ctaLabel.trim() || null,
      });
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !category) return null;

  const selectedParentName = categories.find((c) => c.id === parentId)?.name;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))] sticky top-0 bg-[hsl(var(--background))] z-10">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Edit Category</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          {/* Cover Image — display concern only. */}
          {isDisplay && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Cover Image
            </label>

            {imageUrl ? (
              // 1:1, because the storefront card is aspect-square. The old
              // preview was a 160px-tall letterbox strip, so it cropped
              // differently from the real card and the overlay landed nowhere
              // near where it actually sits.
              <div
                className="group relative mx-auto w-full max-w-[320px] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                style={{ aspectRatio: "1 / 1" }}
              >
                <img
                  src={imageUrl}
                  alt={name}
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* The real renderer, over the real art, at the real ratio. */}
                <CardScrim opacity={0.25} />
                <CardOverlaySlots
                  card={{
                    name,
                    eyebrow: eyebrow || null,
                    tagline: tagline || null,
                    subtitle: subtitle || null,
                    cta_label: ctaLabel || null,
                  }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-gray-900 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Upload size={12} />
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={handleImageDelete}
                    disabled={imageDeleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
                {(imageUploading || imageDeleting) && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                className="w-full h-32 rounded-lg border-2 border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--ring))] bg-[hsl(var(--muted))/30] hover:bg-[hsl(var(--muted))/50] transition-colors flex flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))] disabled:opacity-50"
              >
                {imageUploading ? (
                  <div className="w-5 h-5 border-2 border-[hsl(var(--muted-foreground))] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ImageIcon size={20} />
                    <span className="text-xs">Click to upload cover image</span>
                  </>
                )}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {imageError && (
              <p className="text-xs text-red-600">{imageError}</p>
            )}
          </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
            />
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">/shop/{slug || "…"}</p>
          </div>

          {/* Card copy — display concern only. Text laid over the artwork
              instead of baked into it, so it stays editable and readable. */}
          {isDisplay && (
          <div className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Card copy (optional)</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Text laid over the cover image on the shop front end. Leave blank for the plain card.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Eyebrow</span>
                <input
                  type="text"
                  value={eyebrow}
                  onChange={(e) => setEyebrow(e.target.value)}
                  maxLength={40}
                  placeholder="UNENTER"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">Small label, top-left</span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Tagline</span>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={60}
                  placeholder="EST. 2024 BUILT DIFFERENT"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">Top-right corner</span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Subtitle</span>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  maxLength={80}
                  placeholder="FRESH DROPS. SAME ENERGY."
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">Under the name</span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">CTA label</span>
                <input
                  type="text"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  maxLength={30}
                  placeholder="SHOP NOW"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">The card is already a link</span>
              </label>
            </div>
          </div>
          )}

          {/* Parent Category — nav concern only. */}
          {!isDisplay && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Parent Category
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
            >
              <option value="">— None (top-level) —</option>
              {parentOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {getOptionLabel(cat)}
                </option>
              ))}
            </select>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {parentId
                ? `Sub-link under "${selectedParentName}" in the nav dropdown.`
                : "Top-level — appears directly in the navigation bar."}
            </p>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(var(--border))] sticky bottom-0 bg-[hsl(var(--background))]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !slug.trim()}
            className="px-4 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}