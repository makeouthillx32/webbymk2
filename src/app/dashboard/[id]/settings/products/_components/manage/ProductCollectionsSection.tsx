// app/dashboard/[id]/settings/products/_components/ProductCollectionsSection.tsx
"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Grid3x3, X, Search, Home } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface Collection {
  id: string;
  name: string;
  slug: string;
  is_home_section: boolean;
}

interface ProductCollectionsSectionProps {
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

export default function ProductCollectionsSection({
  selectedIds,
  onSelectedIdsChange,
}: ProductCollectionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (expanded && collections.length === 0) {
      loadCollections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collections");
      const json = await safeReadJson(res);
      if (res.ok && json?.ok) {
        setCollections(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleCollection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectedIdsChange([...selectedIds, id]);
    }
  };

  const removeCollection = (id: string) => {
    onSelectedIdsChange(selectedIds.filter((x) => x !== id));
  };

  const filtered = search.trim()
    ? collections.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : collections;

  const selectedCollections = collections.filter((c) =>
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
          <Grid3x3 size={16} />
          <span className="text-sm font-semibold">Collections (Optional)</span>
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {selectedIds.length} selected
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--border))] pt-3">
          {/* Selected collections */}
          {selectedCollections.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Selected:
              </div>
              <div className="space-y-1">
                {selectedCollections.map((col) => (
                  <div
                    key={col.id}
                    className="flex items-center justify-between bg-[hsl(var(--accent))] px-3 py-1.5 rounded-md"
                  >
                    <span className="text-sm flex items-center gap-1.5">
                      {col.name}
                      {col.is_home_section && (
                        <Home size={12} className="text-[hsl(var(--muted-foreground))]" />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCollection(col.id)}
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
              placeholder="Search collections..."
              className="pl-9"
            />
          </div>

          {/* Collection list */}
          {loading ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
              Loading collections...
            </div>
          ) : (
            <div className="max-h-60 overflow-auto space-y-1 border border-[hsl(var(--border))] rounded-md p-2">
              {filtered.length === 0 ? (
                <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                  {search.trim() ? "No collections found" : "No collections available"}
                </div>
              ) : (
                filtered.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-[hsl(var(--accent))] rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.includes(col.id)}
                      onCheckedChange={() => toggleCollection(col.id)}
                    />
                    <span className="text-sm flex items-center gap-1.5">
                      {col.name}
                      {col.is_home_section && (
                        <Home
                          size={12}
                          className="text-[hsl(var(--muted-foreground))]"
                          title="Featured on homepage"
                        />
                      )}
                    </span>
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
