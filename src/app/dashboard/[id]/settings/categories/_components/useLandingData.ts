// components/shop/_components/useLandingData.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export type LandingCategory = {
  id: string;
  name: string;
  slug: string;
  cover_image_bucket?: string | null;
  cover_image_path?: string | null;
  cover_image_alt?: string | null;
  coverImageUrl?: string | null;
};

export type LandingProductImage = {
  bucket_name: string;
  object_path: string;
  alt_text?: string | null;
  sort_order?: number | null;
  position?: number | null;
  is_primary?: boolean | null;
  is_public?: boolean | null;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
};

export type LandingProduct = {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  badge: string | null;
  is_featured: boolean;
  product_images: LandingProductImage[];
};

export function useLandingData() {
  const [categories, setCategories] = useState<LandingCategory[]>([]);
  const [featured, setFeatured] = useState<LandingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        const supabase = createClient();

        // Fetch top-level categories only (parent_id = null)
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name, slug, cover_image_bucket, cover_image_path, cover_image_alt")
          .is("parent_id", null) // ✅ Only top-level categories
          .order("position", { ascending: true })
          .limit(6);

        if (categoriesError) {
          throw new Error(`Categories failed: ${categoriesError.message}`);
        }

        // Generate cover image URLs
        const categoriesWithUrls = (categoriesData || []).map((category) => {
          let coverImageUrl: string | null = null;
          
          if (category.cover_image_bucket && category.cover_image_path) {
            const { data: urlData } = supabase.storage
              .from(category.cover_image_bucket)
              .getPublicUrl(category.cover_image_path);
            coverImageUrl = urlData.publicUrl;
          }

          return {
            ...category,
            coverImageUrl,
          };
        });

        // Fetch featured products
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select(`
            id,
            slug,
            title,
            price_cents,
            compare_at_price_cents,
            currency,
            badge,
            is_featured,
            product_images (
              bucket_name,
              object_path,
              alt_text,
              position,
              is_primary
            )
          `)
          .eq("status", "active")
          .eq("is_featured", true)
          .order("created_at", { ascending: false })
          .limit(4);

        if (productsError) {
          throw new Error(`Products failed: ${productsError.message}`);
        }

        if (!alive) return;

        setCategories(categoriesWithUrls);
        setFeatured(productsData || []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load landing data");
        setCategories([]);
        setFeatured([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { categories, featured, loading, error };
}