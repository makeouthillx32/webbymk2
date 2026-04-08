"use client";

import React from "react";
import { RefreshCw, Plus } from "lucide-react";

interface ProductActionBarProps {
  onRefresh: () => void;
  onCreateProduct: () => void;
  isRefreshing: boolean;
  createLabel?: string; // optional override
  refreshLabel?: string; // optional override
}

export default function ProductActionBar({
  onRefresh,
  onCreateProduct,
  isRefreshing,
  createLabel = "Create Product",
  refreshLabel = "Refresh",
}: ProductActionBarProps) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center px-3 py-1 border border-[hsl(var(--border))] rounded-[var(--radius)] text-sm text-[hsl(var(--foreground))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] disabled:opacity-50 shadow-[var(--shadow-xs)] transition-colors"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? "Refreshing..." : refreshLabel}
      </button>

      <button
        onClick={onCreateProduct}
        className="flex items-center px-3 py-1 bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] rounded-[var(--radius)] text-sm hover:bg-[hsl(var(--sidebar-primary))/0.9] shadow-[var(--shadow-xs)] transition-colors"
      >
        <Plus className="mr-2 h-4 w-4" />
        {createLabel}
      </button>
    </div>
  );
}
