// app/settings/top-banner/_components/BannerItemsTable.tsx
"use client";

import { GripVertical, Pencil, Trash2 } from "lucide-react";

export type BannerItemRow = {
  id: string;
  text: string;
  position: number;
  is_enabled: boolean;
};

type Props = {
  items: BannerItemRow[];
  onEdit: (item: BannerItemRow) => void;
  onDelete: (item: BannerItemRow) => void;
  onToggleEnabled: (item: BannerItemRow, enabled: boolean) => void;
};

export function BannerItemsTable({
  items,
  onEdit,
  onDelete,
  onToggleEnabled,
}: Props) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <GripVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />

            <div className="min-w-0">
              <p className="truncate text-sm text-[hsl(var(--foreground))]">
                {item.text}
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Position {item.position}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              <input
                type="checkbox"
                checked={item.is_enabled}
                onChange={(e) => onToggleEnabled(item, e.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--border))]"
              />
              Enabled
            </label>

            <button
              type="button"
              onClick={() => onEdit(item)}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(item)}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
            >
              <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}