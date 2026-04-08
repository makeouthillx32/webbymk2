// components/POS/types.ts

export interface POSVariant {
  id: string;
  title: string;
  sku: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  options: Record<string, string>;
  inventory_qty: number;
  track_inventory: boolean;
  allow_backorder: boolean;
}

export interface POSProduct {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  image_url: string | null;
  variants: POSVariant[];
  collections: { id: string; title: string; slug: string }[];
  categories: { id: string; name: string; slug: string }[];
}

export interface POSCartItem {
  /** Unique key for this cart line */
  key: string;
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string;
  sku: string | null;
  price_cents: number;
  image_url: string | null;
  quantity: number;
}

export type POSView = "catalog" | "checkout" | "receipt";

export interface POSState {
  products: POSProduct[];
  cart: POSCartItem[];
  view: POSView;
  search: string;
  filterCollection: string | null;
  filterCategory: string | null;
  selectedProduct: POSProduct | null;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  loading: boolean;
  error: string | null;
  lastOrder: { id: string; order_number: string; total_cents: number } | null;
  paymentIntentClientSecret: string | null;
  isProcessing: boolean;
}