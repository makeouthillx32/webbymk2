//app/categorySlug]/age.tsx
import { createServerClient } from "@/utils/supabase/server";
import { createServerClient as createSupabaseClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import CategoryPageClient from "./_components/CategoryPageClient";


// Generate static params for all active categories at build time
export async function generateStaticParams() {
  // Use a cookie-free client — cookies() is unavailable at build time
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
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
        ),
        product_variants (
          options,
          is_active
        )
      )
    `)
    .eq("category_id", category.id);

  // Extract and filter active products with images. Derive the display options
  // (distinct colors + size count) from each product's active variants so the
  // grid card can show swatches without shipping the full variant tree.
  const products = (productCategories || [])
    .map((pc: any) => pc.products)
    .filter((p: any) => p && p.status === "active")
    .map((product: any) => {
      const variants = (product.product_variants || []).filter(
        (v: any) => v?.is_active !== false
      );
      const colorMap = new Map<string, { name: string; hex: string }>();
      const sizes = new Set<string>();
      for (const v of variants) {
        const c = v?.options?.color;
        if (c && typeof c === "object" && typeof c.name === "string" && c.name && !colorMap.has(c.name)) {
          colorMap.set(c.name, { name: c.name, hex: typeof c.hex === "string" ? c.hex : "" });
        }
        const s = v?.options?.size;
        if (typeof s === "string" && s) sizes.add(s);
      }
      return {
        ...product,
        images: product.product_images || [],
        colors: [...colorMap.values()],
        sizeCount: sizes.size,
      };
    });

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
