// app/dashboard/[id]/settings/products/_components/ProductCollectionsInline.tsx
"use client";

import { useState } from "react";
import { Grid3x3, X, Plus, Search, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "react-hot-toast";

interface Collection {
  id: string;
  name: string;
  slug: string;
  is_home_section: boolean;
}

interface ProductCollectionsInlineProps {
  productId: string;
  assignedCollections: Collection[];
  availableCollections: Collection[];
  onChanged: () => void;
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

export default function ProductCollectionsInline({
  productId,
  assignedCollections,
  availableCollections,
  onChanged,
}: ProductCollectionsInlineProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? availableCollections.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : availableCollections;

  const assignedIds = assignedCollections.map((c) => c.id);

  const handleAssign = async (collectionId: string) => {
    try {
      const res = await fetch(`/api/products/admin/${productId}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_id: collectionId }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed");

      toast.success("Collection assigned");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign collection");
    }
  };

  const handleUnassign = async (collectionId: string) => {
    try {
      const res = await fetch(
        `/api/products/admin/${productId}/collections?collection_id=${collectionId}`,
        { method: "DELETE" }
      );
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed");

      toast.success("Collection removed");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove collection");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Grid3x3 size={16} />
          Collections ({assignedCollections.length})
        </h3>
        {!showPicker && (
          <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
            <Plus size={14} className="mr-1" />
            Assign
          </Button>
        )}
      </div>

      {assignedCollections.length > 0 && (
        <div className="space-y-1">
          {assignedCollections.map((col) => (
            <div
              key={col.id}
              className="flex items-center justify-between bg-[hsl(var(--accent))] px-3 py-2 rounded-md"
            >
              <span className="text-sm flex items-center gap-1.5">
                {col.name}
                {col.is_home_section && (
                  <Home size={12} className="text-[hsl(var(--muted-foreground))]" />
                )}
              </span>
              <button
                onClick={() => handleUnassign(col.id)}
                className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <div className="border border-[hsl(var(--border))] rounded-lg p-3 space-y-3">
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

          <div className="max-h-60 overflow-auto space-y-1 border border-[hsl(var(--border))] rounded-md p-2">
            {filtered.length === 0 ? (
              <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                No collections found
              </div>
            ) : (
              filtered.map((col) => {
                const isAssigned = assignedIds.includes(col.id);
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-[hsl(var(--accent))] rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={isAssigned}
                      onCheckedChange={() =>
                        isAssigned ? handleUnassign(col.id) : handleAssign(col.id)
                      }
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
                );
              })
            )}
          </div>

          <Button size="sm" variant="outline" onClick={() => setShowPicker(false)}>
            Done
          </Button>
        </div>
      )}

      {assignedCollections.length === 0 && !showPicker && (
        <div className="text-center py-8 text-sm text-[hsl(var(--muted-foreground))]">
          No collections assigned. Click "Assign" to add.
        </div>
      )}
    </div>
  );
}
