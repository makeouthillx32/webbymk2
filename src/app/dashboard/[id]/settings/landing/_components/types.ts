// app/dashboard/[id]/settings/landing/_components/types.ts

export type LandingSectionType =
  | "top_banner"
  | "hero_carousel"
  | "categories_grid"
  | "static_html"
  | "products_grid";

export type LandingSectionRow = {
  id: string;
  position: number;
  type: string;
  is_active: boolean;
  config: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
};
