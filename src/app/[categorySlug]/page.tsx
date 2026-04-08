//app/categorySlug]/age.tsx
import { createServerClient, createServiceClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import CategoryPageClient from "./_components/CategoryPageClient";


// Generate static params for all active categories at build time
export async function generateStaticParams() {
  // ✅ Use service client for build-time data fetching (no cookies needed)
  const supabase = createServiceClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("slug")
    .eq("is_active", true);

  return categories?.map((category) => ({
    categorySlug: category.slug,
  })) ?? [];
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;
  const supabase = await createServerClient();

  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .single();

  if (!category) {
    return {
      title: "Category Not Found",
    };
  }

  return {
    title: category.name,
    description: `Shop ${category.name} products`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;
  const supabase = await createServerClient();

  // Fetch category data
  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .single();

  if (!category) {
    notFound();
  }

  // Fetch subcategories (children of this category)
  const { data: subcategories } = await supabase
    .from("categories")
    .select("*")
    .eq("parent_id", category.id)
    .eq("is_active", true)
    .order("position", { ascending: true });

  // Fetch products in this category
  const { data: productCategories } = await supabase
    .from("product_categories")
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
    .eq("category_id", category.id);

  // Extract and filter active products with images
  const products = (productCategories || [])
    .map((pc: any) => pc.products)
    .filter((p: any) => p && p.status === "active")
    .map((product: any) => ({
      ...product,
      images: product.product_images || [],
    }));

  // Build breadcrumb trail
  const breadcrumbs = [];
  let currentCategory = category;
  breadcrumbs.unshift(currentCategory);

  // Traverse up to build full breadcrumb path
  while (currentCategory.parent_id) {
    const { data: parent } = await supabase
      .from("categories")
      .select("*")
      .eq("id", currentCategory.parent_id)
      .single();

    if (parent) {
      breadcrumbs.unshift(parent);
      currentCategory = parent;
    } else {
      break;
    }
  }

  return (
    <CategoryPageClient
      category={category}
      subcategories={subcategories || []}
      products={products}
      breadcrumbs={breadcrumbs}
    />
  );
}

// Revalidate every 5 minutes (same as collections)
export const revalidate = 300;