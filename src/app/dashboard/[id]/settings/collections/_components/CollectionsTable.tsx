// app/dashboard/[id]/settings/collections/_components/CollectionsTable.tsx
"use client";

import { Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { useMemo } from "react";

export type CollectionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_home_section: boolean;
  cover_image_bucket?: string | null;
  cover_image_path?: string | null;
  cover_image_alt?: string | null;

  // ✅ NEW: provided by /api/collections
  product_count?: number | null;
};

type Props = {
  collections: CollectionRow[];
  onEdit: (collection: CollectionRow) => void;
  onDelete: (collection: CollectionRow) => void;
};

export function CollectionsTable({ collections, onEdit, onDelete }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const getCoverImageUrl = (collection: CollectionRow): string | null => {
    if (!collection.cover_image_bucket || !collection.cover_image_path) {
      return null;
    }

    const { data } = supabase.storage
      .from(collection.cover_image_bucket)
      .getPublicUrl(collection.cover_image_path);

    return data.publicUrl;
  };

  return (
    <div className="space-y-2">
      {collections.map((col) => {
        const coverUrl = getCoverImageUrl(col);
        const count =
          typeof col.product_count === "number" ? col.product_count : null;

        return (
          <div
            key={col.id}
            className="flex items-center gap-3 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3"
          >
            {/* Cover Image Thumbnail */}
            <div className="flex-shrink-0">
              {coverUrl ? (
                <div className="relative w-16 h-20 rounded-md overflow-hidden border border-[hsl(var(--border))]">
                  <Image
                    src={coverUrl}
                    alt={col.cover_image_alt || col.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
              ) : (
                <div className="w-16 h-20 rounded-md border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                </div>
              )}
            </div>

            {/* Collection Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                  {col.name}
                </p>

                {/* ✅ Product count badge */}
                {count !== null && (
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))]"
                    title="Products in this collection"
                    aria-label={`${count} products in this collection`}
                  >
                    {count}
                  </span>
                )}
              </div>

              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                /collections/{col.slug}
              </p>

              {col.is_home_section && (
                <p className="mt-1 text-xs text-[hsl(var(--primary))]">
                  ✓ Shown on homepage
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(col)}
                className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))] transition-colors"
                aria-label="Edit collection"
              >
                <Pencil className="h-4 w-4 text-[hsl(var(--foreground))]" />
              </button>

              <button
                onClick={() => onDelete(col)}
                className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))] transition-colors"
                aria-label="Delete collection"
              >
                <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" />
              </button>
            </div>
          </div>
        );
      })}

      {collections.length === 0 && (
        <div className="text-center py-12 text-sm text-[hsl(var(--muted-foreground))]">
          No collections yet. Click "Create Collection" to get started.
        </div>
      )}
    </div>
  );
}
