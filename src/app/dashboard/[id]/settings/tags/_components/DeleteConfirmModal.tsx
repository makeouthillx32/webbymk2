// app/settings/tags/_components/DeleteConfirmModal.tsx
"use client";

import { TagModal } from "./TagModal";
import type { TagRow } from "./TagsTable";

type Props = {
  open: boolean;
  tag: TagRow | null;
  onClose: () => void;
  onConfirm: (tag: TagRow) => Promise<void> | void;
};

export function DeleteConfirmModal({ open, tag, onClose, onConfirm }: Props) {
  if (!open || !tag) return null;

  const handleDelete = async () => {
    await onConfirm(tag);
    onClose();
  };

  return (
    <TagModal
      open={open}
      title="Delete tag"
      description="This will permanently delete the tag. If products are assigned, the delete may fail unless assignments are removed first."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <p className="text-sm text-[hsl(var(--foreground))]">You are about to delete:</p>
          <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">{tag.name}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{tag.slug}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--destructive))] px-4 text-sm text-[hsl(var(--destructive-foreground))]"
          >
            Delete
          </button>
        </div>
      </div>
    </TagModal>
  );
}