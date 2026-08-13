// components/shop/sections/SectionRegistry.tsx
import type React from "react";

import TopBannerSection from "./TopBannerSection";
import HeroCarouselSection from "./HeroCarouselSection";
import CategoriesGridSection from "./CategoriesGridSection";
import ProductsGridSection from "./ProductsGridSection";
import ResearchProductsGridSection from "./ResearchProductsGridSection";
import FeaturedResearchCarouselSection from "./FeaturedResearchCarouselSection";
import FamilyHighlightSection from "./FamilyHighlightSection";
import StaticHtmlSection from "./StaticHtmlSection";

export type SectionType =
  | "top_banner"
  | "hero_carousel"
  | "categories_grid"
  | "products_grid"
  | "research_products_grid"
  | "featured_research_carousel"
  | "family_highlight"
  | "static_html"
  | "testimonials"
  | "instagram_feed";

export type SectionRow = {
  id: string;
  position: number;
  type: SectionType | string; // tolerate unknown types from DB
  is_active: boolean;
  config: Record<string, any> | null;
  page?: string; // landing_sections.page — which zone this row belongs to
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
  research_products_grid: ResearchProductsGridSection,
  featured_research_carousel: FeaturedResearchCarouselSection,
  family_highlight: FamilyHighlightSection,
  static_html: StaticHtmlSection,
};