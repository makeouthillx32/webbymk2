// app/dashboard/[id]/settings/products/_components/ProductCategoriesSection.tsx
"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, FolderTree, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

interface CategoryNode extends Category {
  children?: CategoryNode[];
}

interface ProductCategoriesSectionProps {
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function ProductCategoriesSection({
  selectedIds,
  onSelectedIdsChange,
}: ProductCategoriesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (expanded && categories.length === 0) {
      loadCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/categories?include=tree");
      const json = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setCategories(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectedIdsChange([...selectedIds, id]);
    }
  };

  const removeCategory = (id: string) => {
    onSelectedIdsChange(selectedIds.filter((x) => x !== id));
  };

  // Flatten tree for display
  const flatCategories: Category[] = [];
  const flatten = (nodes: CategoryNode[], depth = 0) => {
    nodes.forEach((node) => {
      flatCategories.push({ ...node });
      if (node.children?.length) flatten(node.children, depth + 1);
    });
  };
  flatten(categories);

  const filtered = search.trim()
    ? flatCategories.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : flatCategories;

  const selectedCategories = flatCategories.filter((c) =>
    selectedIds.includes(c.id)
  );

  return (
    <div className="rounded-xl border border-[hsl(var(--border))]">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[hsl(var(--accent))] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <FolderTree size={16} />
          <span className="text-sm font-semibold">Categories (Optional)</span>
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {selectedIds.length} selected
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--border))] pt-3">
          {/* Selected categories */}
          {selectedCategories.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Selected:
              </div>
              <div className="space-y-1">
                {selectedCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between bg-[hsl(var(--accent))] px-3 py-1.5 rounded-md"
                  >
                    <span className="text-sm">{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories..."
              className="pl-9"
            />
          </div>

          {/* Category list */}
          {loading ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
              Loading categories...
            </div>
          ) : (
            <div className="max-h-60 overflow-auto space-y-1 border border-[hsl(var(--border))] rounded-md p-2">
              {filtered.length === 0 ? (
                <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                  {search.trim() ? "No categories found" : "No categories available"}
                </div>
              ) : (
                filtered.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-[hsl(var(--accent))] rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                    />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
