// app/settings/collections/_components/DeleteConfirmModal.tsx
"use client";

import { CollectionModal } from "./CollectionModal";
import type { CollectionRow } from "./CollectionsTable";

type Props = {
  open: boolean;
  collection: CollectionRow | null;
  onClose: () => void;
  onConfirm: (collection: CollectionRow) => Promise<void> | void;
};

export function DeleteConfirmModal({ open, collection, onClose, onConfirm }: Props) {
  if (!open || !collection) return null;

  const handleDelete = async () => {
    await onConfirm(collection);
    onClose();
  };

  return (
    <CollectionModal
      open={open}
      title="Delete collection"
      description="This will permanently delete the collection. If products are assigned, the delete may fail unless your DB cascades or you remove assignments first."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <p className="text-sm text-[hsl(var(--foreground))]">You are about to delete:</p>
          <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
            {collection.name}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            /collections/{collection.slug}
          </p>
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
    </CollectionModal>
  );
}