// app/settings/inventory/_components/InventoryModal.tsx
"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
};

export function InventoryModal({ open, title, description, children, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-80">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />

      <div className="absolute left-1/2 top-1/2 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)]">
          <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-[hsl(var(--foreground))]" />
            </button>
          </div>

          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}