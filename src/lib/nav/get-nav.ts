import { createServerClient } from "@/utils/supabase/server";

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  position: number;
};

export type CategoryNode = CategoryRow & { children: CategoryNode[] };

function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const r of rows) map.set(r.id, { ...r, children: [] });

  for (const node of map.values()) {
    if (!node.parent_id) roots.push(node);
    else map.get(node.parent_id)?.children.push(node);
  }

  const sort = (a: CategoryNode, b: CategoryNode) => a.position - b.position;
  const sortDeep = (nodes: CategoryNode[]) => {
    nodes.sort(sort);
    nodes.forEach((n) => sortDeep(n.children));
  };
  sortDeep(roots);

  return roots;
}

export async function getNavTree(): Promise<CategoryNode[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id, position")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  return buildCategoryTree((data ?? []) as CategoryRow[]);
}
