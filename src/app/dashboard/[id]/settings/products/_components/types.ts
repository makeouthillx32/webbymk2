// Shared types used by both create and manage flows

// Category & Collection types
export type CategoryNode = {
  id: string;
  name?: string;
  title?: string;
  label?: string;
  slug?: string;
  children?: CategoryNode[];
};

export type CollectionRow = {
  id: string;
  name?: string;
  title?: string;
  label?: string;
  slug?: string;
  is_home_section?: boolean;
  is_homepage?: boolean;
};

// Image types
export type ImageWithAlt = {
  file: File;
  alt: string;
  preview: string;
  position: number;
  isPrimary: boolean;
};

export type ProductImageRow = {
  id?: string;
  bucket_name: string | null;
  object_path: string | null;
  alt_text?: string | null;
  sort_order?: number | null;
  position?: number | null;
  is_primary?: boolean | null;
  is_public?: boolean | null;
  created_at?: string;
};

// Variant option types
export type SizeOption = { 
  id: string; 
  value: string; 
};

export type ColorOption = { 
  id: string; 
  name: string; 
  hex: string; 
};

export type MaterialOption = { 
  id: string; 
  value: string; 
};

export type MadeInOption = { 
  id: string; 
  value: string; 
};

// Variant input (for creation)
export type VariantInput = {
  id: string;
  title: string;
  sku: string;
  selectedSizes: string[];
  selectedColors: string[];
  selectedMaterials: string[];
  selectedMadeIn: string[];
  customOptions: Record<string, string>;
  weight_grams: string;
  price_override: string;
  initial_stock: string;
};

// Product row (for management)
export type ProductRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  material: string | null;
  made_in: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  badge: string | null;
  is_featured: boolean;
  status?: string;
  created_at: string;
  product_images?: ProductImageRow[];
  product_variants?: any[];
  categories?: any[];
  collections?: any[];
  tags?: { id: string; slug: string; name: string }[];
};

// Tab types for ProductModal
export type TabType = "details" | "media" | "variants" | "inventory" | "categories" | "collections" | "tags" | "advanced";