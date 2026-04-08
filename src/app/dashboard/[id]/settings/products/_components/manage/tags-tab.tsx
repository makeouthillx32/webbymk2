import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductRow } from "../types";

interface TagsTabProps {
  detail: ProductRow;
  tagInput: string;
  setTagInput: (v: string) => void;
  addTag: () => void;
  removeTag: (tagIdOrSlug: string) => void;
}

export function TagsTab({
  detail,
  tagInput,
  setTagInput,
  addTag,
  removeTag,
}: TagsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Tag name or slug"
          onKeyDown={(e) => e.key === "Enter" && addTag()}
        />
        <Button onClick={addTag}>Add</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(detail.tags ?? []).map((tag) => (
          <div
            key={tag.id}
            className="px-3 py-1 bg-[hsl(var(--accent))] rounded-full text-sm flex items-center gap-2"
          >
            <span>{tag.name}</span>
            <button
              onClick={() => removeTag(tag.id || tag.slug)}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}