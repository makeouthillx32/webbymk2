// app/products/[slug]/_components/ProductPageClient.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ShoppingCart, Heart, Share2 } from "lucide-react";

interface ProductImage {
  id: string;
  object_path: string;
  bucket_name: string;
  alt_text: string;
  position: number;
  is_primary: boolean;
}

interface ProductVariant {
  id: string;
  sku: string;
  option1_value?: string;
  option2_value?: string;
  option3_value?: string;
  price_cents: number;
  compare_at_price_cents?: number;
  inventory_quantity: number;
  weight_grams?: number;
  position: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  title: string;
  slug: string;
  description?: string;
  price_cents: number;
  compare_at_price_cents?: number;
  currency: string;
  status: string;
  badge?: string;
  is_featured: boolean;
  option1_name?: string;
  option2_name?: string;
  option3_name?: string;
  material?: string;
  made_in?: string;
  images: ProductImage[];
  variants: ProductVariant[];
  categories: Category[];
}

interface ProductPageClientProps {
  product: Product;
}

export default function ProductPageClient({ product }: ProductPageClientProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<{
    option1?: string;
    option2?: string;
    option3?: string;
  }>({});

  // Get image URL from Supabase Storage
  const getImageUrl = (image: ProductImage) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/${image.bucket_name}/${image.object_path}`;
  };

  // Get unique option values
  const getOptionValues = (optionName: 'option1' | 'option2' | 'option3') => {
    const values = product.variants
      .map((v) => v[`${optionName}_value`])
      .filter((v): v is string => v !== null && v !== undefined);
    return Array.from(new Set(values));
  };

  const option1Values = product.option1_name ? getOptionValues('option1') : [];
  const option2Values = product.option2_name ? getOptionValues('option2') : [];
  const option3Values = product.option3_name ? getOptionValues('option3') : [];

  // Find matching variant based on selected options
  const selectedVariant = useMemo(() => {
    if (product.variants.length === 0) return null;
    if (product.variants.length === 1) return product.variants[0];

    return product.variants.find(
      (v) =>
        (!product.option1_name || v.option1_value === selectedOptions.option1) &&
        (!product.option2_name || v.option2_value === selectedOptions.option2) &&
        (!product.option3_name || v.option3_value === selectedOptions.option3)
    ) || product.variants[0];
  }, [product.variants, selectedOptions, product.option1_name, product.option2_name, product.option3_name]);

  // Calculate price (use variant price if available, otherwise product price)
  const displayPrice = selectedVariant?.price_cents ?? product.price_cents;
  const compareAtPrice = selectedVariant?.compare_at_price_cents ?? product.compare_at_price_cents;
  const hasDiscount = compareAtPrice && compareAtPrice > displayPrice;

  // Check if product is in stock
  const inStock = selectedVariant ? selectedVariant.inventory_quantity > 0 : true;

  // Navigate gallery
  const previousImage = () => {
    setSelectedImageIndex((prev) => (prev === 0 ? product.images.length - 1 : prev - 1));
  };

  const nextImage = () => {
    setSelectedImageIndex((prev) => (prev === product.images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <span>/</span>
        {product.categories.length > 0 && (
          <>
            <Link 
              href={`/${product.categories[0].slug}`} 
              className="hover:text-foreground transition-colors"
            >
              {product.categories[0].name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-foreground">{product.title}</span>
      </nav>

      {/* Product Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image Gallery */}
        <div className="space-y-4">
          {/* Main Image */}
          <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
            {product.images.length > 0 ? (
              <>
                <Image
                  src={getImageUrl(product.images[selectedImageIndex])}
                  alt={product.images[selectedImageIndex].alt_text || product.title}
                  fill
                  className="object-cover"
                  priority
                />
                
                {/* Gallery Navigation */}
                {product.images.length > 1 && (
                  <>
                    <button
                      onClick={previousImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full p-2 transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full p-2 transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </>
                )}

                {/* Badge */}
                {product.badge && (
                  <div className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                    {product.badge}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No image available
              </div>
            )}
          </div>

          {/* Thumbnail Gallery */}
          {product.images.length > 1 && (
            <div className="grid grid-cols-6 gap-2">
              {product.images.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`aspect-square relative rounded-lg overflow-hidden border-2 transition-colors ${
                    index === selectedImageIndex
                      ? 'border-primary'
                      : 'border-transparent hover:border-muted-foreground'
                  }`}
                >
                  <Image
                    src={getImageUrl(image)}
                    alt={image.alt_text || `${product.title} - Image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold mb-4">{product.title}</h1>
            
            {/* Price */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-3xl font-bold">
                ${(displayPrice / 100).toFixed(2)}
              </span>
              {hasDiscount && compareAtPrice && (
                <span className="text-xl text-muted-foreground line-through">
                  ${(compareAtPrice / 100).toFixed(2)}
                </span>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div className="prose prose-sm max-w-none mb-6">
                <p>{product.description}</p>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-4">
            {/* Option 1 (e.g., Size) */}
            {product.option1_name && option1Values.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {product.option1_name}
                </label>
                <div className="flex flex-wrap gap-2">
                  {option1Values.map((value) => (
                    <button
                      key={value}
                      onClick={() => setSelectedOptions(prev => ({ ...prev, option1: value }))}
                      className={`px-4 py-2 border rounded-md transition-colors ${
                        selectedOptions.option1 === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:border-primary'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Option 2 (e.g., Color) */}
            {product.option2_name && option2Values.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {product.option2_name}
                </label>
                <div className="flex flex-wrap gap-2">
                  {option2Values.map((value) => (
                    <button
                      key={value}
                      onClick={() => setSelectedOptions(prev => ({ ...prev, option2: value }))}
                      className={`px-4 py-2 border rounded-md transition-colors ${
                        selectedOptions.option2 === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:border-primary'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Option 3 */}
            {product.option3_name && option3Values.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {product.option3_name}
                </label>
                <div className="flex flex-wrap gap-2">
                  {option3Values.map((value) => (
                    <button
                      key={value}
                      onClick={() => setSelectedOptions(prev => ({ ...prev, option3: value }))}
                      className={`px-4 py-2 border rounded-md transition-colors ${
                        selectedOptions.option3 === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:border-primary'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stock Status */}
          {selectedVariant && (
            <div className="text-sm">
              {inStock ? (
                <span className="text-green-600 font-medium">
                  ✓ In Stock ({selectedVariant.inventory_quantity} available)
                </span>
              ) : (
                <span className="text-red-600 font-medium">
                  Out of Stock
                </span>
              )}
            </div>
          )}

          {/* Add to Cart */}
          <div className="flex gap-3">
            <Button 
              size="lg" 
              className="flex-1"
              disabled={!inStock}
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              Add to Cart
            </Button>
            <Button size="lg" variant="outline">
              <Heart className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline">
              <Share2 className="w-5 h-5" />
            </Button>
          </div>

          {/* Product Details */}
          <div className="border-t pt-6 space-y-2 text-sm">
            {selectedVariant?.sku && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">SKU:</span>
                <span className="font-medium">{selectedVariant.sku}</span>
              </div>
            )}
            {product.material && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Material:</span>
                <span className="font-medium">{product.material}</span>
              </div>
            )}
            {product.made_in && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Made In:</span>
                <span className="font-medium">{product.made_in}</span>
              </div>
            )}
            {selectedVariant?.weight_grams && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Weight:</span>
                <span className="font-medium">{selectedVariant.weight_grams}g</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}