// components/shop/sections/ProductsGridSection.tsx
"use client";

import { useState, useEffect } from "react";
import type { SectionComponentProps } from "./SectionRegistry";
import { LandingProductCard } from "@/components/shop/_components/ProductCard";
import Link from "next/link";

interface ProductImage {
  id?: string;
  bucket_name: string;
  object_path: string;
  alt_text?: string | null;
  position?: number | null;
  is_primary?: boolean | null;
}

interface Product {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  compare_at_price_cents?: number | null;
  currency?: string;
  badge?: string | null;
  is_featured?: boolean;
  product_images?: ProductImage[];
}

export default function ProductsGridSection({ section }: SectionComponentProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const config = section.config || {};
  const title = config.title || "Products";
  const limit = Number(config.limit || 8);
  const collection = config.collection; // Collection slug
  const sortBy = config.sortBy || "newest";
  const featured = config.featured === true;
  const viewAllHref = config.viewAllHref || "/shop";

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        // Build query parameters
        const params = new URLSearchParams();
        
        if (collection) {
          params.append('collection', collection);
        }
        
        if (featured) {
          params.append('featured', 'true');
        }
        
        params.append('limit', String(limit));
        params.append('sort', sortBy);

        const response = await fetch(`/api/products?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch products');
        }

        const data = await response.json();
        
        // Handle both response formats
        const productsList = data.data?.products || data.data || data.products || [];
        setProducts(productsList);
      } catch (error) {
        console.error('[ProductsGridSection] Error fetching products:', error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [collection, limit, sortBy, featured]);

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-64 animate-pulse"></div>
          {viewAllHref && (
            <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-24 animate-pulse"></div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </section>
    );
  }

  // Show message if no collection specified
  if (!collection) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-3xl sm:text-4xl font-bold">{title}</h3>
            {config.description && (
              <p className="text-muted-foreground mt-2">{config.description}</p>
            )}
          </div>
        </div>
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            No Collection Selected
          </p>
          <p className="text-sm text-muted-foreground">
            This section needs a collection to display products. Please edit this section and select a collection.
          </p>
        </div>
      </section>
    );
  }

  // Show message if collection has no products
  if (products.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-3xl sm:text-4xl font-bold">{title}</h3>
            {config.description && (
              <p className="text-muted-foreground mt-2">{config.description}</p>
            )}
          </div>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-sm font-semibold text-primary hover:opacity-80 transition"
            >
              View All →
            </Link>
          )}
        </div>
        <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center bg-muted/20">
          <p className="text-lg font-semibold text-foreground mb-2">
            No Products Found
          </p>
          <p className="text-sm text-muted-foreground">
            The "{collection}" collection doesn't have any products yet. Add products to this collection to display them here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-3xl sm:text-4xl font-bold">{title}</h3>
          {config.description && (
            <p className="text-muted-foreground mt-2">{config.description}</p>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-primary hover:opacity-80 transition"
          >
            View All →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.slice(0, limit).map((product) => (
          <LandingProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}