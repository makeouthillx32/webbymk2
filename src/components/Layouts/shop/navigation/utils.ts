import type { NavNode as UnifiedNavNode } from "@/lib/navigation";

/**
 * Simplified nav node for shop navigation rendering
 * Flattened structure optimized for desktop/mobile display
 */
export type NavNode = {
  key: string;
  label: string;
  href: string;
  routeType: "real" | "hash";
  children?: NavNode[];
};

/**
 * Transform unified nav nodes to shop-friendly format
 * Only keep categories and collections (filters out static pages, external links)
 */
export function transformNavTree(nodes: UnifiedNavNode[]): NavNode[] {
  return nodes
    .filter((node) => node.type === "category" || node.type === "collection")
    .map((node) => ({
      key: node.key,
      label: node.label,
      href: node.href,
      routeType: node.routeType,
      children: node.children
        ? node.children
            .filter((child) => child.type === "category" || child.type === "collection")
            .map((child) => ({
              key: child.key,
              label: child.label,
              href: child.href,
              routeType: child.routeType,
              // Include grandchildren for desktop mega menu
              children: child.children
                ? child.children
                    .filter((gc) => gc.type === "category" || gc.type === "collection")
                    .map((gc) => ({
                      key: gc.key,
                      label: gc.label,
                      href: gc.href,
                      routeType: gc.routeType,
                    }))
                : undefined,
            }))
        : undefined,
    }));
}

/**
 * Fetch navigation tree from API
 * Shared by both desktop and mobile components
 */
export async function fetchNavigationTree(): Promise<NavNode[]> {
  try {
    const res = await fetch("/api/navigation/tree", {
      cache: "no-store",
      next: { revalidate: 300 }, // 5 minutes
    });

    if (!res.ok) {
      console.error("Navigation fetch failed:", res.status);
      return [];
    }

    const json = await res.json();

    if (!json?.nodes) {
      console.error("Invalid navigation response:", json);
      return [];
    }

    return transformNavTree(json.nodes);
  } catch (error) {
    console.error("Navigation fetch error:", error);
    return [];
  }
}