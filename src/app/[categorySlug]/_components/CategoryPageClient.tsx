"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/money";
import { ChevronRight } from "lucide-react";

interface ProductImage {
  id: string;
  object_path: string;
  bucket_name: string;
  alt_text?: string;
  position: number;
  is_primary: boolean;
}

interface Product {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
  compare_at_price_cents?: number;
  currency: string;
  status: string;
  badge?: string;
  is_featured: boolean;
  images: ProductImage[];
}

interface Category {
  id: string;
  slug: string;
  name: string;
  parent_id?: string;
  sort_order: number;
  is_active: boolean;
  position: number;
}

interface CategoryPageClientProps {
  category: Category;
  subcategories: Category[];
  products: Product[];
  breadcrumbs: Category[];
}

type SortOption = "featured" | "price-asc" | "price-desc" | "newest" | "title";

export default function CategoryPageClient({
  category,
  subcategories,
  products,
  breadcrumbs,
}: CategoryPageClientProps) {
  const [sortBy, setSortBy] = useState<SortOption>("featured");

  // Get image URL from Supabase Storage
  const getImageUrl = (image: ProductImage) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/${image.bucket_name}/${image.object_path}`;
  };

  // Get primary image for a product
  const getPrimaryImage = (product: Product) => {
    const primary = product.images.find((img) => img.is_primary);
    if (primary) return primary;

    // Fallback to first image sorted by position
    const sorted = [...product.images].sort((a, b) => a.position - b.position);
    return sorted[0];
  };

  // Sort products based on selected option
  const sortedProducts = useMemo(() => {
    const sorted = [...products];

    switch (sortBy) {
      case "featured":
        return sorted.sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          return 0;
        });
      case "price-asc":
        return sorted.sort((a, b) => a.price_cents - b.price_cents);
      case "price-desc":
        return sorted.sort((a, b) => b.price_cents - a.price_cents);
      case "title":
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "newest":
        return sorted;
      default:
        return sorted;
    }
  }, [products, sortBy]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="w-4 h-4" />
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.id} className="flex items-center gap-2">
            {index === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{crumb.name}</span>
            ) : (
              <>
                <Link
                  href={`/${crumb.slug}`}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.name}
                </Link>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </div>
        ))}
      </nav>

      {/* Category Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-2">{category.name}</h1>
      </div>

      {/* Subcategories Grid */}
      {subcategories.length > 0 && (
        <div className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Shop by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {subcategories.map((subcategory) => (
              <Link
                key={subcategory.id}
                href={`/${subcategory.slug}`}
                className="group border rounded-lg p-6 hover:border-primary hover:shadow-md transition-all"
              >
                <h3 className="font-medium text-center group-hover:text-primary transition-colors">
                  {subcategory.name}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <p className="text-sm text-muted-foreground">
          {sortedProducts.length} {sortedProducts.length === 1 ? "product" : "products"}
        </p>

        <div className="flex gap-4 items-center">
          <label htmlFor="sort" className="text-sm font-medium">
            Sort by:
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border rounded-md px-4 py-2 text-sm bg-background"
          >
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="title">Name: A-Z</option>
          </select>
        </div>
      </div>

      {/* Product Grid */}
      {sortedProducts.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sortedProducts.map((product) => {
            const primaryImage = getPrimaryImage(product);
            const hasDiscount =
              product.compare_at_price_cents &&
              product.compare_at_price_cents > product.price_cents;

            return (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className="group"
              >
                {/* Product Image */}
                <div className="aspect-square relative bg-muted rounded-lg overflow-hidden mb-4">
                  {primaryImage ? (
                    <Image
                      src={getImageUrl(primaryImage)}
                      alt={primaryImage.alt_text || product.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      No image
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-2">
                    {product.badge && (
                      <Badge className="bg-primary text-primary-foreground">
                        {product.badge}
                      </Badge>
                    )}
                    {product.is_featured && (
                      <Badge variant="secondary">Featured</Badge>
                    )}
                  </div>
                </div>

                {/* Product Info */}
                <div className="space-y-1">
                  <h3 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-2">
                    {product.title}
                  </h3>

                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {formatCurrency(product.price_cents, product.currency)}
                    </span>
                    {hasDiscount && (
                      <span className="text-sm text-muted-foreground line-through">
                        {formatCurrency(
                          product.compare_at_price_cents!,
                          product.currency
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        // Empty State
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🛍️</div>
          <h3 className="text-lg font-semibold mb-2">No products yet</h3>
          <p className="text-muted-foreground mb-6">
            {subcategories.length > 0
              ? "Check out the subcategories above or browse all products."
              : "This category is empty. Check back soon for new products!"}
          </p>
          <Button asChild>
            <Link href="/shop">Browse All Products</Link>
          </Button>
        </div>
      )}
    </div>
  );
}