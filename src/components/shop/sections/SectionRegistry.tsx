// components/shop/sections/SectionRegistry.tsx
import type React from "react";

import TopBannerSection from "./TopBannerSection";
import HeroCarouselSection from "./HeroCarouselSection";
import CategoriesGridSection from "./CategoriesGridSection";
import ProductsGridSection from "./ProductsGridSection";
import StaticHtmlSection from "./StaticHtmlSection";

export type SectionType =
  | "top_banner"
  | "hero_carousel"
  | "categories_grid"
  | "products_grid"
  | "static_html"
  | "testimonials"
  | "instagram_feed";

export type SectionRow = {
  id: string;
  position: number;
  type: SectionType | string; // tolerate unknown types from DB
  is_active: boolean;
  config: Record<string, any> | null;
};

export type SectionComponentProps = {
  section: SectionRow;
};

export type SectionComponent = (props: SectionComponentProps) => React.ReactNode | Promise<React.ReactNode>;

export const SectionComponents: Record<string, SectionComponent> = {
  top_banner: TopBannerSection,
  hero_carousel: HeroCarouselSection,
  categories_grid: CategoriesGridSection,
  products_grid: ProductsGridSection,
  static_html: StaticHtmlSection,
};