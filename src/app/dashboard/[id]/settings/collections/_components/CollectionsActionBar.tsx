// app/settings/collections/_components/CollectionsActionBar.tsx
"use client";

import { Plus } from "lucide-react";
import { CollectionsSearchBar } from "./CollectionsSearchBar";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
};

export function CollectionsActionBar({ search, onSearchChange, onCreate }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:max-w-sm">
        <CollectionsSearchBar value={search} onChange={onSearchChange} />
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        New Collection
      </button>
    </div>
  );
}