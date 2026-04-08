// app/settings/tags/_components/TagsTable.tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";

export type TagRow = {
  id: string;
  name: string;
  slug: string;
};

type Props = {
  tags: TagRow[];
  onEdit: (tag: TagRow) => void;
  onDelete: (tag: TagRow) => void;
};

export function TagsTable({ tags, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-2">
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="flex items-center justify-between rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
              {tag.name}
            </p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              {tag.slug}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(tag)}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(tag)}
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