// components/shop/sections/HeroCarouselSection.tsx
import type { SectionComponentProps } from "./SectionRegistry";
import { HeroCarousel } from "@/components/shop/_components/Herocarousel";
import { useHeroSlides } from "@/components/shop/_components/useHeroSlides";

export default function HeroCarouselSection({ section }: SectionComponentProps) {
  const { slides, loading } = useHeroSlides();
  
  if (loading || slides.length === 0) {
    return null;
  }
  
  return <HeroCarousel slides={slides} {...(section.config ?? {})} />;
}