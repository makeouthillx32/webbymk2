// components/shop/sections/FamilyHighlightSection.tsx
//
// Family Highlight section built with the exact same container, skeleton loader,
// and grid structure (grid grid-cols-2 md:grid-cols-4 gap-4) as ResearchProductsGridSection.
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { SectionComponentProps } from "./SectionRegistry";
import { ResearchProductCard, type ResearchProductCardProduct } from "@/components/shop/_components/ResearchProductCard";

export default function FamilyHighlightSection({ section }: SectionComponentProps) {
  const [products, setProducts] = useState<ResearchProductCardProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const config = section.config || {};
  const family = config.family || "ghk";
  const title = config.title || `Featured ${family.toUpperCase()} Family`;
  const badge = config.badge || "Highlighted Family";
  const description =
    config.description ||
    `Explore all research formulations of the ${family.toUpperCase()} compound family.`;
  const limit = Number(config.limit || 4);

  useEffect(() => {
    async function fetchFamilyProducts() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("q", family);
        params.append("limit", String(limit));

        const response = await fetch(`/api/research-products?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch family products");

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
        console.error("[FamilyHighlightSection] Error:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFamilyProducts();
  }, [family, limit]);

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
      <div className="p-6 sm:p-8 md:p-10 rounded-[calc(var(--radius)*3)] bg-gradient-to-br from-[hsl(var(--primary))/0.08] via-[hsl(var(--card))] to-[hsl(var(--secondary))/0.1] border border-[hsl(var(--primary))/0.22] shadow-sm">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
              <Sparkles className="h-3.5 w-3.5" /> {badge}
            </div>
            <h3 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h3>
            {description && <p className="text-muted-foreground mt-2 text-sm sm:text-base">{description}</p>}
          </div>
          <Link
            href={`/search?q=${encodeURIComponent(family)}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group shrink-0"
          >
            View Family <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* 2-Column Mobile Grid Matching Explore Catalog */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.slice(0, limit).map((product) => (
            <ResearchProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
