// lib/navigation/types.ts
/**
 * Unified Navigation Tree Types
 * Single source of truth for routing, navigation, and page rendering
 */

import { type FC } from "react";

/**
 * Navigation node type
 * Distinguishes between different content sources
 */
export type NavNodeType = 
  | "category"      // From database categories table
  | "collection"    // From database collections table
  | "static"        // Static React component (About, Terms, etc.)
  | "external"      // External URL
  | "page";         // Custom page from database

/**
 * Route type
 * Determines how the route is handled
 */
export type RouteType =
  | "real"          // Next.js route (/tops, /products/slug)
  | "hash"          // Hash navigation (#about, #terms)
  | "external";     // External link (https://...)

/**
 * Base navigation node
 * All nodes extend this interface
 */
export interface BaseNavNode {
  id: string;                    // Unique identifier (can be DB id or custom key)
  key: string;                   // URL-safe key (e.g., "tops", "about")
  label: string;                 // Display name
  href: string;                  // Full path (/tops, #about, /products/slug)
  type: NavNodeType;             // Content source
  routeType: RouteType;          // How to handle navigation
  description?: string;          // Optional description
  position?: number;             // Sort order
  isActive?: boolean;            // Visibility flag
  isFeatured?: boolean;          // Show in special sections (homepage, etc.)
  metadata?: Record<string, any>; // Flexible metadata
  children?: NavNode[];          // Child nodes (for hierarchy)
}

/**
 * Category node (from database)
 */
export interface CategoryNode extends BaseNavNode {
  type: "category";
  routeType: "real";
  categoryId: string;            // UUID from categories table
  parentId?: string | null;      // Parent category ID
  slug: string;                  // URL slug
  productCount?: number;         // Optional: number of products
}

/**
 * Collection node (from database)
 */
export interface CollectionNode extends BaseNavNode {
  type: "collection";
  routeType: "real";
  collectionId: string;          // UUID from collections table
  slug: string;                  // URL slug
  isHomeSection?: boolean;       // Show on homepage
}

/**
 * Static page node (React component)
 */
export interface StaticPageNode extends BaseNavNode {
  type: "static";
  routeType: "hash";             // Usually hash navigation
  Component: FC<any>;            // React component to render
  backKey?: string;              // Parent key for back navigation
  backLabel?: string;            // Back button label
  anchorId?: string;             // HTML anchor ID
}

/**
 * External link node
 */
export interface ExternalNode extends BaseNavNode {
  type: "external";
  routeType: "external";
  target?: "_blank" | "_self";  // Link target
  rel?: string;                  // Rel attribute (e.g., "noopener noreferrer")
}

/**
 * Custom page node (from database pages table - future)
 */
export interface CustomPageNode extends BaseNavNode {
  type: "page";
  routeType: "real";
  pageId: string;                // UUID from pages table
  slug: string;                  // URL slug
  template?: string;             // Page template type
}

/**
 * Union type for all navigation nodes
 */
export type NavNode = 
  | CategoryNode 
  | CollectionNode 
  | StaticPageNode 
  | ExternalNode 
  | CustomPageNode;

/**
 * Navigation tree structure
 * Hierarchical tree with metadata
 */
export interface NavigationTree {
  nodes: NavNode[];              // Top-level navigation nodes
  lastUpdated?: Date;            // Cache timestamp
  version?: string;              // Tree version for cache invalidation
}

/**
 * Navigation fetcher options
 */
export interface NavFetchOptions {
  includeInactive?: boolean;     // Include inactive categories
  includeCounts?: boolean;       // Include product counts
  maxDepth?: number;             // Max hierarchy depth (default: 3)
  cacheTime?: number;            // Cache duration in seconds
}

/**
 * Breadcrumb item
 */
export interface BreadcrumbItem {
  label: string;
  href: string;
  routeType: RouteType;
}

/**
 * Page configuration (for pageTree compatibility)
 */
export interface PageConfig {
  Component: FC<any>;
  backKey?: string;
  backLabel?: string;
  anchorId?: string;
}

/**
 * Helper type: Extract static pages from NavNode
 */
export type StaticPage = Extract<NavNode, { type: "static" }>;

/**
 * Helper type: Extract database-driven nodes
 */
export type DatabaseNode = Extract<NavNode, { type: "category" | "collection" | "page" }>;

/**
 * Section ID map (for backward compatibility with old pageTree)
 */
export type SectionIdMap = Record<string, string>;