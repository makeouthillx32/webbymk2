// components/shop/sections/CategoriesGridSection.tsx
"use client";

import type { SectionComponentProps } from "./SectionRegistry";
import { useLandingData } from "@/components/shop/_components/useLandingData";
import Link from "next/link";
import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export default function CategoriesGridSection({ section }: SectionComponentProps) {
  const { categories, loading } = useLandingData();

  const title = section.config?.title ?? "Shop by Category";
  const categoryIds = section.config?.categoryIds || [];

  // Filter categories based on categoryIds config
  // If categoryIds is empty, show all categories
  const displayCategories = categoryIds.length > 0
    ? (categories ?? []).filter(c => categoryIds.includes(c.id))
    : (categories ?? []);

  if (loading) {
    return (
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-10 bg-gray-200 rounded w-64 mx-auto mb-12 animate-pulse"></div>
          <div className="flex flex-col gap-6 md:hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse"></div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse"></div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
          {title}
        </h2>

        {/* Mobile: Vertical Stack */}
        <div className="md:hidden flex flex-col gap-6 max-w-md mx-auto">
          {displayCategories.map((c) => (
            <Link
              key={c.id}
              href={`/${c.slug}`}
              className="group relative block overflow-hidden rounded-lg aspect-square bg-[var(--sidebar)] w-full"
            >
              {c.coverImageUrl ? (
                <Image
                  src={c.coverImageUrl}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  alt={c.name}
                  sizes="(max-width: 768px) 100vw, 400px"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-[var(--muted)] opacity-50" />
              )}

              <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-all duration-300" />

              <div className="absolute inset-0 flex items-center justify-center p-6">
                <h3 className="text-2xl md:text-3xl font-bold text-white text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  {c.name}
                </h3>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop/Tablet: Horizontal Carousel */}
        <div className="hidden md:block max-w-5xl mx-auto">
          <Carousel
            opts={{
              align: "start",
              loop: false,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {displayCategories.map((c) => (
                <CarouselItem key={c.id} className="pl-4 md:basis-1/2 lg:basis-1/3">
                  <Link
                    href={`/${c.slug}`}
                    className="group relative block overflow-hidden rounded-lg aspect-square bg-[var(--sidebar)] w-full"
                  >
                    {c.coverImageUrl ? (
                      <Image
                        src={c.coverImageUrl}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                        alt={c.name}
                        sizes="400px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-[var(--muted)] opacity-50" />
                    )}

                    <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-all duration-300" />

                    <div className="absolute inset-0 flex items-center justify-center p-6">
                      <h3 className="text-2xl md:text-3xl font-bold text-white text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                        {c.name}
                      </h3>
                    </div>
                  </Link>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>

        {!loading && displayCategories.length === 0 ? (
          <div className="text-center text-sm text-[var(--muted-foreground)] py-12">
            {categoryIds.length > 0 
              ? "No matching categories found. Check your section configuration."
              : "No categories yet. Create categories in Dashboard → Settings → Categories."}
          </div>
        ) : null}
      </div>
    </section>
  );
}