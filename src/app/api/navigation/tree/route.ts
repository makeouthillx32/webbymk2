// app/api/navigation/tree/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

export const revalidate = 300; // 5 minutes

type DbCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  position: number;
  is_active: boolean;
};

type NavNode = {
  key: string;
  label: string;
  href: string;
  type: "category";
  routeType: "real";
  children?: NavNode[];
};

function buildTree(flat: DbCategory[]): NavNode[] {
  // Build a map for fast lookup
  const map = new Map<string, NavNode & { _children: NavNode[] }>();

  for (const cat of flat) {
    map.set(cat.id, {
      key: `cat-${cat.id}`,
      label: cat.name,
      href: `/shop/category/${cat.slug}`,
      type: "category",
      routeType: "real",
      _children: [],
    });
  }

  const roots: NavNode[] = [];

  for (const cat of flat) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!._children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Move _children -> children (only if non-empty), sort each level by position
  const finalize = (nodes: NavNode[]): NavNode[] => {
    return nodes
      .map((n) => {
        const raw = n as any;
        const kids: NavNode[] = finalize(raw._children ?? []);
        const { _children, ...rest } = raw;
        return kids.length > 0 ? { ...rest, children: kids } : rest;
      });
  };

  // Sort roots by position using the original flat array order
  const sortedRoots = roots.sort((a, b) => {
    const catA = flat.find((c) => `cat-${c.id}` === a.key)!;
    const catB = flat.find((c) => `cat-${c.id}` === b.key)!;
    return (catA?.position ?? 0) - (catB?.position ?? 0);
  });

  return finalize(sortedRoots);
}

export async function GET() {
  try {
    const supabase = await createServerClient();

    // Fetch all active categories in one query, ordered by position
    const { data: categories, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, position, is_active")
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[navigation/tree] categories error:", error.message);
      return NextResponse.json({ nodes: [] });
    }

    const nodes = buildTree((categories as DbCategory[]) ?? []);

    return NextResponse.json({ nodes });
  } catch (err) {
    console.error("[navigation/tree] unexpected error:", err);
    return NextResponse.json({ nodes: [] });
  }
}