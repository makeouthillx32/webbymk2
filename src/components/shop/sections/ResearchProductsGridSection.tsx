// components/shop/sections/ResearchProductsGridSection.tsx
//
// Labs-aware counterpart to ProductsGridSection.tsx — reads research_products
// via the public /api/research-products list route instead of shop's
// /api/products, and links to /research/[slug] instead of /products/[slug].
// Kept as a separate section type (research_products_grid) rather than
// branching ProductsGridSection, per the note in zones/labs/Page.tsx: wiring
// shop's products_grid into Labs would show Shop inventory, not the research
// catalog.
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FlaskConical, ArrowRight } from "lucide-react";
import type { SectionComponentProps } from "./SectionRegistry";
import { ResearchProductCard, type ResearchProductCardProduct } from "@/components/shop/_components/ResearchProductCard";

export default function ResearchProductsGridSection({ section }: SectionComponentProps) {
  const [products, setProducts] = useState<ResearchProductCardProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const config = section.config || {};
  const title = config.title || "Research Chemicals";
  const limit = Number(config.limit || 8);
  const category = config.category; // research_categories slug, optional
  const sortBy = config.sortBy || "newest";
  const featured = config.featured === true;
  const viewAllHref = config.viewAllHref || "/search";

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (category) params.append("category", category);
        if (featured) params.append("featured", "true");
        params.append("limit", String(limit));
        params.append("sort", sortBy);

        const response = await fetch(`/api/research-products?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch research products");

        const data = await response.json();
        const productsList = data.data?.products || data.data || data.products || [];
        setProducts(productsList);
      } catch (error) {
        console.error("[ResearchProductsGridSection] Error fetching products:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [category, limit, sortBy, featured]);

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
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-3xl sm:text-4xl font-bold flex items-center gap-3">
              <FlaskConical className="h-8 w-8 text-primary" /> {title}
            </h3>
            {config.description && <p className="text-muted-foreground mt-2">{config.description}</p>}
          </div>
        </div>
        <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center bg-muted/20">
          <p className="text-lg font-semibold text-foreground mb-2">No Products Found</p>
          <p className="text-sm text-muted-foreground">
            No active research chemicals to show yet. Add some from the dashboard's Labs → Research Chemicals tab.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
            <FlaskConical className="h-3.5 w-3.5" /> High-Purity Compounds
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
