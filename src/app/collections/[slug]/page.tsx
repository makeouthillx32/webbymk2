import { createServerClient, createServiceClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CollectionPageClient from "./_components/CollectionPageClient";


// Generate static params for all collections at build time
export async function generateStaticParams() {
  // ✅ Use service client for build-time data fetching (no cookies needed)
  const supabase = createServiceClient();
  const { data: collections } = await supabase
    .from("collections")
    .select("slug");

  return collections?.map((collection) => ({
    slug: collection.slug,
  })) ?? [];
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: collection } = await supabase
    .from("collections")
    .select("name, description")
    .eq("slug", slug)
    .single();

  if (!collection) {
    return {
      title: "Collection Not Found",
    };
  }

  return {
    title: collection.name,
    description: collection.description || `Shop ${collection.name} collection`,
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createServerClient();

  // Fetch collection data
  const { data: collection } = await supabase
    .from("collections")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!collection) {
    notFound();
  }

  // Fetch products in this collection
  const { data: productCollections } = await supabase
    .from("product_collections")
    .select(`
      product_id,
      products (
        id,
        title,
        slug,
        price_cents,
        compare_at_price_cents,
        currency,
        status,
        badge,
        is_featured,
        product_images (
          id,
          object_path,
          bucket_name,
          alt_text,
          position,
          is_primary
        )
      )
    `)
    .eq("collection_id", collection.id);

  // Extract and filter active products with images
  const products = (productCollections || [])
    .map((pc: any) => pc.products)
    .filter((p: any) => p && p.status === "active")
    .map((product: any) => ({
      ...product,
      images: product.product_images || [],
    }));

  return (
    <CollectionPageClient collection={collection} products={products} />
  );
}

// Revalidate every 5 minutes (collections change more often than products)
export const revalidate = 300;