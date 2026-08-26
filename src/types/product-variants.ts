export type VariantColor = string | { name: string; hex?: string | null };

export type VariantOptions = Record<string, unknown> & {
  size?: string;
  color?: VariantColor;
  material?: string;
  made_in?: string;
};

export type VariantInventory = {
  quantity: number;
  track_inventory: boolean;
  allow_backorder: boolean;
};

export type VariantImage = {
  image_id?: string;
  object_path?: string | null;
  alt_text?: string | null;
  position?: number;
  is_primary?: boolean;
};

export type ProductVariant = {
  id: string;
  title: string;
  sku: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  weight_grams: number | null;
  track_inventory: boolean;
  allow_backorder: boolean;
  is_active: boolean;
  options?: VariantOptions | null;
  inventory?: VariantInventory | null;
  images?: VariantImage[];
  created_at: string;
  updated_at: string;
};

export type CreateVariantInput = {
  title: string;
  sku?: string | null;
  price_cents?: number;
  compare_at_price_cents?: number | null;
  weight_grams?: number | null;
  track_inventory?: boolean;
  quantity?: number;
  allow_backorder?: boolean;
  options?: VariantOptions;
  is_active?: boolean;
};

export type UpdateVariantInput = Partial<CreateVariantInput>;
