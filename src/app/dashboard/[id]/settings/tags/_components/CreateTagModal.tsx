// app/settings/tags/_components/CreateTagModal.tsx
"use client";

import { useState } from "react";
import { TagModal } from "./TagModal";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; slug: string }) => Promise<void> | void;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateTagModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !slug.trim()) return;
    try {
      setSubmitting(true);
      await onCreate({ name: name.trim(), slug: slug.trim() });
      setName("");
      setSlug("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TagModal
      open={open}
      title="Create tag"
      description="Tags help organize products and can be used as subcategories."
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
            disabled={submitting}
            onClick={handleSubmit}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </TagModal>
  );
}