// components/shop/sections/FeaturedResearchCarouselSection.tsx
//
// Featured Research Products section built with the exact same container,
// skeleton loader, and grid structure (grid grid-cols-2 md:grid-cols-4 gap-4)
// as ResearchProductsGridSection ("Explore Catalog").
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { SectionComponentProps } from "./SectionRegistry";
import { ResearchProductCard, type ResearchProductCardProduct } from "@/components/shop/_components/ResearchProductCard";

export default function FeaturedResearchCarouselSection({ section }: SectionComponentProps) {
  const [products, setProducts] = useState<ResearchProductCardProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const config = section.config || {};
  const title = config.title || "Featured Products";
  const limit = Number(config.limit || 8);
  const category = config.category;
  const viewAllHref = config.viewAllHref || "/search";

  useEffect(() => {
    async function fetchFeatured() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("featured", "true");
        if (category) params.append("category", category);
        params.append("limit", String(limit));

        const response = await fetch(`/api/research-products?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch featured products");

        const data = await response.json();
        let productsList: ResearchProductCardProduct[] = data.data?.products || data.data || data.products || [];

        if (productsList.length === 0) {
          const fallbackRes = await fetch(`/api/research-products?limit=${limit}`);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            productsList = fallbackData.data?.products || fallbackData.data || fallbackData.products || [];
          }
        }

        setProducts(productsList);
      } catch (error) {
        console.error("[FeaturedResearchCarouselSection] Error:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFeatured();
  }, [category, limit]);

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-64 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Featured Compounds
          </div>
          <h3 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h3>
          {config.description && <p className="text-muted-foreground mt-2 text-sm sm:text-base">{config.description}</p>}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group shrink-0"
          >
            Explore Catalog <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.slice(0, limit).map((product) => (
          <ResearchProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
