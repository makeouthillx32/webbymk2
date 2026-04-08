// app/settings/top-banner/_components/DeleteConfirmModal.tsx
"use client";

import { X } from "lucide-react";
import type { BannerItemRow } from "./BannerItemsTable";

type Props = {
  open: boolean;
  item: BannerItemRow | null;
  onClose: () => void;
  onConfirm: (item: BannerItemRow) => Promise<void> | void;
};

export function DeleteConfirmModal({ open, item, onClose, onConfirm }: Props) {
  if (!open || !item) return null;

  const handleDelete = async () => {
    await onConfirm(item);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-80">
      {/* Backdrop */}
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="absolute left-1/2 top-1/2 w-[calc(100%-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Delete banner message
            </h2>
            <button
              onClick={onClose}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              This will permanently delete this message:
            </p>

            <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
              <p className="text-sm text-[hsl(var(--foreground))]">{item.text}</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Position {item.position}
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
        </div>
      </div>
    </div>
  );
}