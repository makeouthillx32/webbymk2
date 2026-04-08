// app/settings/tags/_components/EditTagForm.tsx
"use client";

import { useEffect, useState } from "react";
import { TagModal } from "./TagModal";
import type { TagRow } from "./TagsTable";

type Props = {
  open: boolean;
  tag: TagRow | null;
  onClose: () => void;
  onSave: (data: { id: string; name: string; slug: string }) => Promise<void> | void;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function EditTagForm({ open, tag, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tag) return;
    setName(tag.name);
    setSlug(tag.slug);
  }, [tag]);

  if (!open || !tag) return null;

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) return;
    try {
      setSaving(true);
      await onSave({ id: tag.id, name: name.trim(), slug: slug.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <TagModal
      open={open}
      title="Edit tag"
      description="Update the tag name and slug."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Name</label>
          <input
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              setSlug(slugify(v));
            }}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Slug</label>
          <input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </TagModal>
  );
}