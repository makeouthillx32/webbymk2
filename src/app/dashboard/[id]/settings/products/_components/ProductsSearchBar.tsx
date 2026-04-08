"use client";

import React from "react";
import { Search, X } from "lucide-react";

interface ProductsSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;

  // Optional: if you want a "submit" behavior (ex: fetch on Enter)
  onSubmitSearch?: () => void;

  // Optional UI text overrides
  placeholder?: string;
}

export default function ProductsSearchBar({
  searchQuery,
  onSearchQueryChange,
  onSubmitSearch,
  placeholder = "Search title / slug / tag…",
}: ProductsSearchBarProps) {
  const hasValue = Boolean(searchQuery?.trim());

  return (
    <div className="w-full md:w-auto">
      <div className="relative w-full md:w-[320px]">
        {/* Icon */}
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />

        {/* Input */}
        <input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onSubmitSearch) onSubmitSearch();
            if (e.key === "Escape") onSearchQueryChange("");
          }}
          placeholder={placeholder}
          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-9 py-2 text-sm text-[hsl(var(--foreground))] shadow-[var(--shadow-xs)] outline-none transition-colors
                     placeholder:text-[hsl(var(--muted-foreground))]
                     focus:border-[hsl(var(--sidebar-primary))] focus:ring-1 focus:ring-[hsl(var(--sidebar-primary))/0.35]"
          aria-label="Search products"
        />

        {/* Clear button */}
        {hasValue && (
          <button
            type="button"
            onClick={() => onSearchQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition"
            aria-label="Clear search"
            title="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* tiny helper (optional) */}
      {onSubmitSearch && (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Press <span className="font-semibold">Enter</span> to search
        </p>
      )}
    </div>
  );
}
