"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

interface CreateCategoryModalProps {
  open: boolean;
  categories: Category[];
  activeSection: string;
  onClose: () => void;
  /**
   * Which concern is creating. Nav assigns a parent; Featured Rows uploads the
   * artwork instead — the two screens create the same row from opposite ends,
   * and offering both fields in both places is what made this confusing.
   */
  mode?: "structure" | "display";
  onCreate: (data: {
    name: string;
    slug: string;
    parent_id: string | null;
    /** Only ever set from Featured Rows; uploaded after the row exists. */
    coverFile?: File | null;
  }) => Promise<void>;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CreateCategoryModal({
  open,
  categories,
  activeSection,
  onClose,
  mode = "structure",
  onCreate,
}: CreateCategoryModalProps) {
  const isDisplay = mode === "display";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [parentId, setParentId] = useState<string>("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setSlugManual(false);
      setParentId("");
      setCoverFile(null);
      setCoverPreview(null);
      setError(null);
    }
  }, [open]);

  const handleSlugChange = (val: string) => {
    setSlugManual(true);
    setSlug(slugify(val));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    if (!slug.trim()) { setError("Slug is required."); return; }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        slug: slug.trim(),
        // A category created from Featured Rows is top-level; nesting is a nav
        // decision and belongs to Browse Structure.
        parent_id: isDisplay ? null : parentId || null,
        coverFile: isDisplay ? coverFile : null,
      });
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const getOptionLabel = (cat: Category): string => {
    if (!cat.parent_id) return cat.name;
    const parent = categories.find((c) => c.id === cat.parent_id);
    return parent ? `${parent.name} › ${cat.name}` : cat.name;
  };

  const selectedParentName = categories.find((c) => c.id === parentId)?.name;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            New Category
            <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded capitalize">
              {activeSection}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Graphic Tees"
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="graphic-tees"
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] font-mono placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">/{activeSection}/{slug || "…"}</p>
          </div>

          {isDisplay ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Cover Image
              </label>
              <div className="flex items-start gap-3">
                <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">None</span>
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <input
                    id="new-category-cover"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setCoverFile(f);
                      // Revoke on replace so repeated picks don't leak blobs.
                      setCoverPreview((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return f ? URL.createObjectURL(f) : null;
                      });
                    }}
                  />
                  <label
                    htmlFor="new-category-cover"
                    className="inline-flex cursor-pointer items-center rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
                  >
                    {coverFile ? "Change image" : "Upload image"}
                  </label>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Optional — uploaded once the category is created. Card copy is added by editing it.
                  </p>
                </div>
              </div>
            </div>
          ) : (
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
              {categories.map((cat) => (
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

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(var(--border))]">
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
            {saving ? "Creating…" : "Create Category"}
          </button>
        </div>
      </div>
    </div>
  );
}