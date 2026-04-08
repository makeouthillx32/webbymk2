// lib/navigation/getNavigationTree.ts
/**
 * Unified Navigation Tree
 * Combines database categories/collections with static pages
 * Single source of truth for all routing and navigation
 */

import { createServiceClient } from "@/utils/supabase/server";
import type {
  NavigationTree,
  NavNode,
  CategoryNode,
  CollectionNode,
  StaticPageNode,
  NavFetchOptions,
} from "./types";

// Import static page components
import HomePage from "@/components/shop/Landing";
import AboutUsPage from "@/components/shop/AboutUs";
import TermsPage from "@/components/shop/TermsPage";
import PrivacyPolicy from "@/components/shop/PrivacyPolicy";

/**
 * Static pages configuration
 * These are React components rendered via Home.tsx + pageTree
 */
const STATIC_PAGES: StaticPageNode[] = [
  {
    id: "static-about",
    key: "about",
    label: "About Us",
    href: "#about",
    type: "static",
    routeType: "hash",
    Component: AboutUsPage,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "about",
    position: 1000, // Put static pages at end
    isActive: true,
  },
  {
    id: "static-terms",
    key: "terms",
    label: "Terms & Conditions",
    href: "#terms",
    type: "static",
    routeType: "hash",
    Component: TermsPage,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "terms",
    position: 1001,
    isActive: true,
  },
  {
    id: "static-privacy",
    key: "privacy",
    label: "Privacy Policy",
    href: "#privacy",
    type: "static",
    routeType: "hash",
    Component: PrivacyPolicy,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "privacy",
    position: 1002,
    isActive: true,
  },
  // Home/Landing is handled separately (it's the default page)
  {
    id: "static-home",
    key: "home",
    label: "Home",
    href: "/",
    type: "static",
    routeType: "real",
    Component: HomePage,
    anchorId: "home",
    position: -1, // First
    isActive: true,
  },
];

/**
 * Fetch categories from database and build hierarchy
 */
async function fetchCategories(): Promise<CategoryNode[]> {
  const supabase = createServiceClient();

  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, parent_id, position, is_active")
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  // Transform to CategoryNode format
  const categoryNodes: CategoryNode[] = (categories || []).map((cat) => ({
    id: cat.id,
    key: cat.slug,
    label: cat.name,
    href: `/${cat.slug}`,
    type: "category",
    routeType: "real",
    categoryId: cat.id,
    parentId: cat.parent_id,
    slug: cat.slug,
    description: cat.description || undefined,
    position: cat.position || 0,
    isActive: cat.is_active,
  }));

  // Build hierarchy
  return buildHierarchy(categoryNodes);
}

/**
 * Build hierarchical tree from flat category list
 */
function buildHierarchy(nodes: CategoryNode[]): CategoryNode[] {
  const nodeMap = new Map<string, CategoryNode>();
  const rootNodes: CategoryNode[] = [];

  // Create map for quick lookup
  nodes.forEach((node) => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  // Build tree
  nodes.forEach((node) => {
    const current = nodeMap.get(node.id)!;

    if (!node.parentId) {
      // Root node
      rootNodes.push(current);
    } else {
      // Child node - attach to parent
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(current);
      } else {
        // Parent not found, treat as root
        rootNodes.push(current);
      }
    }
  });

  return rootNodes;
}

/**
 * Fetch featured collections
 */
async function fetchCollections(): Promise<CollectionNode[]> {
  const supabase = createServiceClient();

  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, name, slug, description, is_home_section")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching collections:", error);
    return [];
  }

  return (collections || []).map((col) => ({
    id: col.id,
    key: col.slug,
    label: col.name,
    href: `/collections/${col.slug}`,
    type: "collection",
    routeType: "real",
    collectionId: col.id,
    slug: col.slug,
    description: col.description || undefined,
    isHomeSection: col.is_home_section,
    isActive: true,
  }));
}

/**
 * Get complete navigation tree
 * Combines database content with static pages
 */
export async function getNavigationTree(
  options: NavFetchOptions = {}
): Promise<NavigationTree> {
  const {
    includeInactive = false,
    includeCounts = false,
    maxDepth = 3,
  } = options;

  try {
    // Fetch database content in parallel
    const [categories, collections] = await Promise.all([
      fetchCategories(),
      fetchCollections(),
    ]);

    // Combine all nodes
    const allNodes: NavNode[] = [
      ...categories,
      ...collections,
      ...STATIC_PAGES,
    ];

    // Filter inactive if needed
    const filteredNodes = includeInactive
      ? allNodes
      : allNodes.filter((node) => node.isActive !== false);

    // Sort by position
    const sortedNodes = filteredNodes.sort(
      (a, b) => (a.position || 0) - (b.position || 0)
    );

    return {
      nodes: sortedNodes,
      lastUpdated: new Date(),
      version: "1.0",
    };
  } catch (error) {
    console.error("Error building navigation tree:", error);
    
    // Fallback: return just static pages
    return {
      nodes: STATIC_PAGES,
      lastUpdated: new Date(),
      version: "1.0",
    };
  }
}

/**
 * Get navigation node by key
 */
export async function getNavigationNode(
  key: string
): Promise<NavNode | null> {
  const tree = await getNavigationTree();
  return findNodeByKey(tree.nodes, key);
}

/**
 * Recursively find node by key
 */
function findNodeByKey(nodes: NavNode[], key: string): NavNode | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children) {
      const found = findNodeByKey(node.children, key);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get breadcrumb trail for a given key
 */
export async function getBreadcrumbs(
  key: string
): Promise<Array<{ label: string; href: string; routeType: string }>> {
  const tree = await getNavigationTree();
  const trail: Array<{ label: string; href: string; routeType: string }> = [];

  function findPath(nodes: NavNode[], targetKey: string, currentPath: NavNode[]): boolean {
    for (const node of nodes) {
      const newPath = [...currentPath, node];

      if (node.key === targetKey) {
        trail.push(
          ...newPath.map((n) => ({
            label: n.label,
            href: n.href,
            routeType: n.routeType,
          }))
        );
        return true;
      }

      if (node.children && findPath(node.children, targetKey, newPath)) {
        return true;
      }
    }
    return false;
  }

  // Always start with Home
  trail.push({ label: "Home", href: "/", routeType: "real" });
  
  // Find path from root
  findPath(tree.nodes, key, []);

  return trail;
}

/**
 * Get only category nodes (for header navigation)
 */
export async function getCategoryNavigation(): Promise<CategoryNode[]> {
  const tree = await getNavigationTree();
  return tree.nodes.filter((node): node is CategoryNode => node.type === "category");
}

/**
 * Get only static pages (for pageTree compatibility)
 */
export async function getStaticPages(): Promise<StaticPageNode[]> {
  return STATIC_PAGES;
}

/**
 * Get pageTree format (backward compatibility)
 * Returns Record<string, PageConfig> for old Home.tsx
 */
export function getPageTreeCompat(): Record<string, { 
  Component: any; 
  backKey?: string; 
  backLabel?: string; 
  anchorId?: string; 
}> {
  const pageTree: Record<string, any> = {};

  STATIC_PAGES.forEach((page) => {
    pageTree[page.key] = {
      Component: page.Component,
      backKey: page.backKey,
      backLabel: page.backLabel,
      anchorId: page.anchorId,
    };
  });

  return pageTree;
}

/**
 * Get section ID map (backward compatibility)
 */
export function getSectionIdMap(): Record<string, string> {
  const sectionMap: Record<string, string> = {};

  STATIC_PAGES.forEach((page) => {
    if (page.anchorId) {
      sectionMap[page.key] = page.anchorId;
    }
  });

  return sectionMap;
}