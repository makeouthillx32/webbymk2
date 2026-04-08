export type StoreCategory = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
};

export type StoreProductImage = {
  id?: string;
  storage_path: string;
  alt: string | null;
  position: number;
};

export type StoreVariant = {
  id: string;
  title: string;
  sku: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  position: number;

  // may be present only if include=inventory was used
  inventory_enabled?: boolean;
  stock_on_hand?: number;
  low_stock_threshold?: number;
};

export type StoreProductListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  badge: string | null;
  is_featured: boolean;
  created_at: string;
  product_images?: StoreProductImage[];
};

export type StoreProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  badge: string | null;
  is_featured: boolean;

  seo_title: string | null;
  seo_description: string | null;
  og_image_override_url: string | null;

  created_at: string;
  updated_at: string;

  product_images: StoreProductImage[];
  product_variants: StoreVariant[];
  categories: StoreCategory[];
  primary_image: StoreProductImage | null;
};
