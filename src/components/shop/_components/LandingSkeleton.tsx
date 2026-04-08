"use client";

import { ReactNode } from "react";

/**
 * LandingSkeleton
 * * Fixes:
 * 1. ReferenceError: Added missing SquareCardSkeleton, PromoCardSkeleton, and ProductCardSkeleton.
 * 2. UI Error: Removed 'w-screen' and negative margins that caused desktop white space.
 * 3. Never Crop: Used aspect-ratio for the hero placeholder to match the dynamic image logic.
 */
export function LandingSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero Carousel Skeleton - Proportional height */}
      <div className="w-full relative">
        <div className="aspect-[16/9] md:aspect-[21/9] w-full bg-[var(--muted)] animate-pulse" />
      </div>

      {/* What's Trending Section */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          {/* Title Skeleton */}
          <div className="h-10 w-64 bg-[var(--muted)] animate-pulse rounded-lg mx-auto mb-12" />
        </div>

        {/* Trending Cards Carousel */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex gap-6 pb-4">
            <SquareCardSkeleton />
            <SquareCardSkeleton />
            <SquareCardSkeleton />
          </div>
        </div>
      </section>

      {/* Promo Grid Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PromoCardSkeleton />
          <PromoCardSkeleton />
        </div>
      </section>

      {/* Shop Bestsellers Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        {/* Section Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="h-10 w-64 bg-[var(--muted)] animate-pulse rounded-lg" />
          <div className="h-6 w-24 bg-[var(--muted)] animate-pulse rounded-lg" />
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
      </section>

      {/* Curated For You Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        {/* Section Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="h-10 w-56 bg-[var(--muted)] animate-pulse rounded-lg" />
          <div className="h-6 w-24 bg-[var(--muted)] animate-pulse rounded-lg" />
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
      </section>

      {/* Footer Spacing */}
      <div className="pb-10" />
    </div>
  );
}

/* ------------------------------ */
/* Helper Components              */
/* ------------------------------ */

function SquareCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
      <div className="aspect-square bg-[var(--muted)] animate-pulse rounded-lg" />
    </div>
  );
}

function PromoCardSkeleton() {
  return (
    <div className="aspect-[4/3] bg-[var(--muted)] animate-pulse rounded-lg p-8">
      <div className="space-y-4">
        <div className="h-8 w-48 bg-background/30 rounded" />
        <div className="h-6 w-64 bg-background/30 rounded" />
        <div className="h-6 w-40 bg-background/30 rounded" />
      </div>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="space-y-3">
      {/* Image */}
      <div className="aspect-[3/4] bg-[var(--muted)] animate-pulse rounded-lg" />
      
      {/* Title */}
      <div className="h-4 w-full bg-[var(--muted)] animate-pulse rounded" />
      <div className="h-4 w-3/4 bg-[var(--muted)] animate-pulse rounded" />
      
      {/* Price */}
      <div className="h-5 w-20 bg-[var(--muted)] animate-pulse rounded" />
    </div>
  );
}