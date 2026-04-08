// app/dashboard/[id]/settings/products/_components/ProductCategoriesInline.tsx
"use client";

import { useState } from "react";
import { FolderTree, X, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "react-hot-toast";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategoryNode extends Category {
  children?: CategoryNode[];
}

interface ProductCategoriesInlineProps {
  productId: string;
  assignedCategories: Category[];
  availableCategories: CategoryNode[];
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

export default function ProductCategoriesInline({
  productId,
  assignedCategories,
  availableCategories,
  onChanged,
}: ProductCategoriesInlineProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const flatCategories: Category[] = [];
  const flatten = (nodes: CategoryNode[]) => {
    nodes.forEach((n) => {
      flatCategories.push({ id: n.id, name: n.name, slug: n.slug });
      if (n.children?.length) flatten(n.children);
    });
  };
  flatten(availableCategories);

  const filtered = search.trim()
    ? flatCategories.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : flatCategories;

  const assignedIds = assignedCategories.map((c) => c.id);

  const handleAssign = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/products/admin/${productId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed");

      toast.success("Category assigned");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign category");
    }
  };

  const handleUnassign = async (categoryId: string) => {
    try {
      const res = await fetch(
        `/api/products/admin/${productId}/categories?category_id=${categoryId}`,
        { method: "DELETE" }
      );
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed");

      toast.success("Category removed");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove category");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FolderTree size={16} />
          Categories ({assignedCategories.length})
        </h3>
        {!showPicker && (
          <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
            <Plus size={14} className="mr-1" />
            Assign
          </Button>
        )}
      </div>

      {assignedCategories.length > 0 && (
        <div className="space-y-1">
          {assignedCategories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between bg-[hsl(var(--accent))] px-3 py-2 rounded-md"
            >
              <span className="text-sm">{cat.name}</span>
              <button
                onClick={() => handleUnassign(cat.id)}
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
              placeholder="Search categories..."
              className="pl-9"
            />
          </div>

          <div className="max-h-60 overflow-auto space-y-1 border border-[hsl(var(--border))] rounded-md p-2">
            {filtered.length === 0 ? (
              <div className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                No categories found
              </div>
            ) : (
              filtered.map((cat) => {
                const isAssigned = assignedIds.includes(cat.id);
                return (
                  <label
                    key={cat.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-[hsl(var(--accent))] rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={isAssigned}
                      onCheckedChange={() =>
                        isAssigned ? handleUnassign(cat.id) : handleAssign(cat.id)
                      }
                    />
                    <span className="text-sm">{cat.name}</span>
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

      {assignedCategories.length === 0 && !showPicker && (
        <div className="text-center py-8 text-sm text-[hsl(var(--muted-foreground))]">
          No categories assigned. Click "Assign" to add.
        </div>
      )}
    </div>
  );
}
