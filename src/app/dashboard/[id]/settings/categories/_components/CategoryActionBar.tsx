"use client";

import { Plus } from "lucide-react";
import { CategoriesSearchBar } from "./CategoriesSearchBar";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
};

export function CategoryActionBar({
  search,
  onSearchChange,
  onCreate,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:max-w-sm">
        <CategoriesSearchBar
          value={search}
          onChange={onSearchChange}
          placeholder="Search categories or slugs…"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Future: reorder / expand buttons go here */}

        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Category
        </button>
      </div>
    </div>
  );
}
