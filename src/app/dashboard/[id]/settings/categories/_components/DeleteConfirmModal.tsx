// app/settings/categories/_components/DeleteConfirmModal.tsx
"use client";

import { CategoryModal } from "./CategoryModal";
import type { CategoryRow } from "./CategoriesTable";

type Props = {
  open: boolean;
  category: CategoryRow | null;
  onClose: () => void;
  onConfirm: (category: CategoryRow) => Promise<void> | void;
};

export function DeleteConfirmModal({ open, category, onClose, onConfirm }: Props) {
  if (!category) return null;

  const handleDelete = async () => {
    await onConfirm(category);
    onClose();
  };

  return (
    <CategoryModal
      open={open}
      title="Delete category"
      description="This will permanently delete the category. If it has children, the delete may fail unless your DB cascades or you delete children first."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <p className="text-sm text-[hsl(var(--foreground))]">
            You are about to delete:
          </p>
          <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
            {category.name}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">/{category.slug}</p>
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
    </CategoryModal>
  );
}