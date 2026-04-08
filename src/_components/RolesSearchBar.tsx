'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

interface RolesSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}

export default function RolesSearchBar({
  searchQuery,
  onSearchQueryChange,
}: RolesSearchBarProps) {
  return (
    <div className="relative flex-grow">
      <Search
        size={18}
        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
      />
      <input
        type="text"
        placeholder="Search roles…"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        className="w-full pl-10 pr-10 py-2 border border-[hsl(var(--input))] rounded-[var(--radius)] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-[var(--shadow-xs)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))] transition-all"
      />
      {searchQuery && (
        <button
          onClick={() => onSearchQueryChange('')}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}