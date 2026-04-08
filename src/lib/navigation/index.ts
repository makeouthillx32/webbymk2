// lib/navigation/index.ts
/**
 * Unified Navigation System
 * Single source of truth for routing, navigation, and page rendering
 * 
 * Usage:
 * import { getNavigationTree, getCachedNavigationTree } from "@/lib/navigation";
 */

// Types
export type {
  NavNode,
  NavNodeType,
  RouteType,
  CategoryNode,
  CollectionNode,
  StaticPageNode,
  ExternalNode,
  CustomPageNode,
  NavigationTree,
  NavFetchOptions,
  BreadcrumbItem,
  PageConfig,
  StaticPage,
  DatabaseNode,
  SectionIdMap,
} from "./types";

// Core functions
export {
  getNavigationTree,
  getNavigationNode,
  getBreadcrumbs,
  getCategoryNavigation,
  getStaticPages,
  getPageTreeCompat,
  getSectionIdMap,
} from "./getNavigationTree";

// Cache functions
export {
  getCachedNavigationTree,
  getCachedCategoryNavigation,
  getCachedStaticPages,
  revalidateNavigationCache,
  navigationCache,
  getClientNavigationTree,
  prefetchNavigation,
  getCacheStats,
} from "./cache";