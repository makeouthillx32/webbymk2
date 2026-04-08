"use client";

import React from "react";
import { ChevronRight, ChevronDown, Pencil, Trash2, ImageIcon } from "lucide-react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  position: number;
  sort_order: number;
  is_active: boolean;
  cover_image_bucket?: string | null;
  cover_image_path?: string | null;
  cover_image_alt?: string | null;
  children?: CategoryRow[];
};

type Category = CategoryRow;

interface CategoriesTableProps {
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

function buildTree(flat: Category[]): Category[] {
  const map: Record<string, Category> = {};
  const roots: Category[] = [];

  flat.forEach((c) => { map[c.id] = { ...c, children: [] }; });
  flat.forEach((c) => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children!.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });

  const sortLevel = (nodes: Category[]) => {
    nodes.sort((a, b) => a.position - b.position || a.sort_order - b.sort_order);
    nodes.forEach((n) => n.children?.length && sortLevel(n.children));
  };
  sortLevel(roots);
  return roots;
}

function getCoverUrl(bucket: string | null | undefined, path: string | null | undefined): string | null {
  if (!bucket || !path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

function CategoryRowItem({
  category,
  depth,
  onEdit,
  onDelete,
  expanded,
  onToggle,
}: {
  category: Category;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = (category.children?.length ?? 0) > 0;
  const isExpanded = expanded.has(category.id);
  const coverUrl = getCoverUrl(category.cover_image_bucket, category.cover_image_path);

  return (
    <>
      <tr className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))/40] transition-colors group">
        {/* Thumbnail */}
        <td className="py-2.5 px-4 w-12">
          <div className="w-9 h-9 rounded-md overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-center justify-center shrink-0">
            {coverUrl ? (
              <img src={coverUrl} alt={category.cover_image_alt ?? category.name} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={14} className="text-[hsl(var(--muted-foreground))]" />
            )}
          </div>
        </td>

        {/* Name */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
            <button
              type="button"
              onClick={() => hasChildren && onToggle(category.id)}
              className={`w-5 h-5 flex items-center justify-center rounded shrink-0 ${
                hasChildren
                  ? "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer"
                  : "cursor-default"
              }`}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                depth > 0 && <span className="w-3 h-px bg-[hsl(var(--border))] block ml-1" />
              )}
            </button>

            {depth > 0 && (
              <span className="text-[hsl(var(--muted-foreground))] text-xs select-none">└</span>
            )}

            <span className={`font-medium text-sm ${depth === 0 ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}>
              {category.name}
            </span>

            {hasChildren && (
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] rounded-full px-1.5 py-0.5 leading-none">
                {category.children!.length}
              </span>
            )}
          </div>
        </td>

        {/* Slug */}
        <td className="py-2.5 px-3">
          <code className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
            /{category.slug}
          </code>
        </td>

        {/* Level */}
        <td className="py-2.5 px-3">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {depth === 0 ? "Root" : "Sub"}
          </span>
        </td>

        {/* Actions */}
        <td className="py-2.5 px-4 text-right">
          <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onEdit(category)}
              className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              title="Edit category"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(category)}
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-[hsl(var(--muted-foreground))] hover:text-red-600 transition-colors"
              title="Delete category"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>

      {hasChildren && isExpanded &&
        category.children!.map((child) => (
          <CategoryRowItem
            key={child.id}
            category={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

export function CategoriesTable({ categories, onEdit, onDelete }: CategoriesTableProps) {
  const tree = buildTree(categories);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    categories.forEach((c) => {
      if (!c.parent_id && categories.some((ch) => ch.parent_id === c.id)) s.add(c.id);
    });
    return s;
  });

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (categories.length === 0) {
    return (
      <div className="text-center py-16 text-[hsl(var(--muted-foreground))] text-sm">
        No categories yet. Create your first one above.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[hsl(var(--muted))/60] border-b border-[hsl(var(--border))]">
            <th className="py-2.5 px-4 w-12" />
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Name
            </th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Slug
            </th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Level
            </th>
            <th className="py-2.5 px-4" />
          </tr>
        </thead>
        <tbody>
          {tree.map((root) => (
            <CategoryRowItem
              key={root.id}
              category={root}
              depth={0}
              onEdit={onEdit}
              onDelete={onDelete}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}