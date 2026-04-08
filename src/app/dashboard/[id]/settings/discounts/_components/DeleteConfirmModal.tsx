// app/settings/discounts/_components/DeleteConfirmModal.tsx
"use client";

import { DiscountModal } from "./DiscountModal";
import type { DiscountRow } from "./DiscountsTable";

type Props = {
  open: boolean;
  discount: DiscountRow | null;
  onClose: () => void;
  onConfirm: (discount: DiscountRow) => Promise<void> | void;
};

export function DeleteConfirmModal({ open, discount, onClose, onConfirm }: Props) {
  if (!open || !discount) return null;

  const handleDelete = async () => {
    await onConfirm(discount);
    onClose();
  };

  return (
    <DiscountModal
      open={open}
      title="Delete discount"
      description="This will permanently delete the discount code."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <p className="text-sm text-[hsl(var(--foreground))]">You are about to delete:</p>
          <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">{discount.code}</p>
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
    </DiscountModal>
  );
}