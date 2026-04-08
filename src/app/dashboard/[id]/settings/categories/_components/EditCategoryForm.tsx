"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Upload, Trash2, ImageIcon } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

const BUCKET = "category-covers";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active?: boolean;
  cover_image_bucket?: string | null;
  cover_image_path?: string | null;
  cover_image_alt?: string | null;
};

interface EditCategoryFormProps {
  open: boolean;
  category: Category | null;
  categories: Category[];
  onClose: () => void;
  onSave: (data: { id: string; name: string; slug: string; parent_id: string | null }) => Promise<void>;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function getCoverUrl(bucket: string | null | undefined, path: string | null | undefined): string | null {
  if (!bucket || !path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export function EditCategoryForm({
  open,
  category,
  categories,
  onClose,
  onSave,
}: EditCategoryFormProps) {
  const supabase = React.useMemo(
    () => createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    []
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState<string>("");
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
        await supabase.storage.from(BUCKET).remove([imagePath]);
      }

      const ext = file.name.split(".").pop() ?? "jpg";
      const newPath = `${category.id}/cover.${ext}?t=${Date.now()}`;
      const cleanPath = `${category.id}/cover.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(cleanPath, file, { upsert: true });

      if (uploadError) {
        setImageError(uploadError.message);
        return;
      }

      // Save to DB
      const { error: dbError } = await supabase
        .from("categories")
        .update({
          cover_image_bucket: BUCKET,
          cover_image_path: cleanPath,
          cover_image_alt: name,
        })
        .eq("id", category.id);

      if (dbError) {
        setImageError(dbError.message);
        return;
      }

      setImagePath(cleanPath);
      setImageUrl(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${cleanPath}?t=${Date.now()}`);
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
      await supabase.storage.from(BUCKET).remove([imagePath]);

      await supabase
        .from("categories")
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
      await onSave({ id: category.id, name: name.trim(), slug: slug.trim(), parent_id: parentId || null });
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

          {/* Cover Image */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Cover Image
            </label>

            {imageUrl ? (
              <div className="relative group rounded-lg overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                <img
                  src={imageUrl}
                  alt={name}
                  className="w-full h-40 object-cover"
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

          {/* Parent Category */}
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