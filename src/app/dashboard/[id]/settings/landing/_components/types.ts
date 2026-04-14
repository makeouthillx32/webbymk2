// app/dashboard/[id]/settings/landing/_components/types.ts

// Shop landing section types
export type ShopSectionType =
  | "top_banner"
  | "hero_carousel"
  | "categories_grid"
  | "static_html"
  | "products_grid";

// Home page hero section types
export type HomeSectionType =
  | "kick"
  | "discord"
  | "pickme"
  | "youtube";

export type LandingSectionType = ShopSectionType | HomeSectionType;

export type LandingSectionRow = {
  id: string;
  position: number;
  type: string;
  page: string;
  is_active: boolean;
  config: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
};
