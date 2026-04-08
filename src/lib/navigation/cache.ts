// lib/navigation/cache.ts
/**
 * Navigation Tree Cache
 * Server-side caching for navigation data to improve performance
 */

import { unstable_cache } from "next/cache";
import { getNavigationTree, getCategoryNavigation, getStaticPages } from "./getNavigationTree";
import type { NavigationTree, CategoryNode, StaticPageNode } from "./types";

/**
 * Cache configuration
 */
const CACHE_CONFIG = {
  // Cache navigation tree for 1 hour
  navigationTree: {
    revalidate: 3600, // 1 hour in seconds
    tags: ["navigation-tree"],
  },
  
  // Cache category navigation for 30 minutes
  categoryNav: {
    revalidate: 1800, // 30 minutes
    tags: ["category-navigation"],
  },
  
  // Static pages don't change, cache for 24 hours
  staticPages: {
    revalidate: 86400, // 24 hours
    tags: ["static-pages"],
  },
};

/**
 * Cached navigation tree getter
 * Uses Next.js unstable_cache for server-side caching
 */
export const getCachedNavigationTree = unstable_cache(
  async (): Promise<NavigationTree> => {
    return await getNavigationTree();
  },
  ["navigation-tree"],
  {
    revalidate: CACHE_CONFIG.navigationTree.revalidate,
    tags: CACHE_CONFIG.navigationTree.tags,
  }
);

/**
 * Cached category navigation getter
 * Optimized for header/navigation rendering
 */
export const getCachedCategoryNavigation = unstable_cache(
  async (): Promise<CategoryNode[]> => {
    return await getCategoryNavigation();
  },
  ["category-navigation"],
  {
    revalidate: CACHE_CONFIG.categoryNav.revalidate,
    tags: CACHE_CONFIG.categoryNav.tags,
  }
);

/**
 * Cached static pages getter
 */
export const getCachedStaticPages = unstable_cache(
  async (): Promise<StaticPageNode[]> => {
    return await getStaticPages();
  },
  ["static-pages"],
  {
    revalidate: CACHE_CONFIG.staticPages.revalidate,
    tags: CACHE_CONFIG.staticPages.tags,
  }
);

/**
 * Revalidate navigation cache
 * Call this when categories are updated in the database
 */
export async function revalidateNavigationCache() {
  const { revalidateTag } = await import("next/cache");
  
  revalidateTag("navigation-tree");
  revalidateTag("category-navigation");
  
  console.log("✅ Navigation cache revalidated");
}

/**
 * In-memory cache for client-side components
 * Useful for client components that need navigation data
 */
class NavigationCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  set(key: string, data: any, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now() + ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.timestamp) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiration
    if (Date.now() > entry.timestamp) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
}

// Singleton instance for client-side caching
export const navigationCache = new NavigationCache();

/**
 * Client-side hook-friendly cache getter
 * Fetches from API route if not in cache
 */
export async function getClientNavigationTree(): Promise<NavigationTree> {
  const cached = navigationCache.get<NavigationTree>("navigation-tree");
  if (cached) return cached;

  // Fetch from API route
  const response = await fetch("/api/navigation/tree");
  if (!response.ok) {
    throw new Error("Failed to fetch navigation tree");
  }

  const data = await response.json();
  navigationCache.set("navigation-tree", data);
  
  return data;
}

/**
 * Prefetch navigation data
 * Call this in layouts or early in the app lifecycle
 */
export async function prefetchNavigation() {
  try {
    await Promise.all([
      getCachedNavigationTree(),
      getCachedCategoryNavigation(),
      getCachedStaticPages(),
    ]);
    console.log("✅ Navigation data prefetched");
  } catch (error) {
    console.error("❌ Error prefetching navigation:", error);
  }
}

/**
 * Cache statistics (useful for debugging)
 */
export function getCacheStats() {
  return {
    config: CACHE_CONFIG,
    clientCacheSize: navigationCache["cache"].size,
  };
}