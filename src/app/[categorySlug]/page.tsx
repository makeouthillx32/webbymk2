//app/[categorySlug]/page.tsx
//
// Root-level slug resolver. Owned by shop by default (category pages), but
// zone-branches for Labs: under labs.unenter.live the same [categorySlug]
// segment resolves against research_categories (category grid) or
// research_products (product detail) instead — so Labs gets
// labs.unenter.live/<product-or-category> without a /products or /research
// prefix, forked from this same route rather than a separate tree.
import { createServerClient } from "@/utils/supabase/server";
import { createServerClient as createSupabaseClient } from "@supabase/ssr";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CategoryPageClient from "./_components/CategoryPageClient";
import { getPublishedStaticPageBySlug } from "@/lib/landing/static-pages.server";
import { getZoneContext } from "@/lib/zoneContext";
import {
  getResearchCategoryBySlug,
  getResearchProductBySlug,
  getResearchCatalog,
  getRelatedResearchProducts,
} from "@/lib/research/queries";
import ResearchCatalogClient from "@/components/research/ResearchCatalogClient";
import ResearchProductDetailClient from "@/components/research/ResearchProductDetailClient";
import { ClientInlineStaticPage } from "@/components/shop/_components/ClientInlineStaticPage";

import { getPrimaryImageUrl, getResearchProductOgImage } from "@/lib/images";

// Generate static params for all active categories at build time, plus
// research categories/products so the labs zone's build pre-renders them
// too (harmless in other zones — those slugs simply won't resolve there).
export async function generateStaticParams() {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );

  const [
    { data: categories },
    { data: researchCategories },
    { data: researchProducts },
  ] = await Promise.all([
    supabase.from("categories").select("slug").eq("is_active", true),
    supabase.from("research_categories").select("slug"),
    supabase.from("research_products").select("slug").eq("status", "active"),
  ]);

  const slugs = new Set<string>();
  (categories ?? []).forEach((c: any) => c.slug && slugs.add(c.slug));
  (researchCategories ?? []).forEach((c: any) => c.slug && slugs.add(c.slug));
  (researchProducts ?? []).forEach((p: any) => p.slug && slugs.add(p.slug));

  return [...slugs].map((categorySlug) => ({ categorySlug }));
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ categorySlug: string }>;
}): Promise<Metadata> {
  const { categorySlug } = await params;
  const supabase = await createServerClient();
  const zoneCtx = await getZoneContext();

  if (zoneCtx.zone === "labs") {
    if (
      ["search", "catalog", "products", "all", "research"].includes(
        categorySlug.toLowerCase(),
      )
    ) {
      return {
        title: `${categorySlug === "search" ? "Search" : "Catalog"} | Unenter Labs`,
        description: "Browse all high-purity research compounds.",
      };
    }

    const category = await getResearchCategoryBySlug(supabase, categorySlug);
    if (category) {
      const title = `${category.name} | Unenter Labs`;
      const description = `Browse high-purity ${category.name} research chemicals. For laboratory research use only.`;
      const url = `https://labs.unenter.live/${category.slug}`;
      const ogImageUrl = `https://labs.unenter.live/${category.slug}/opengraph-image`;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url,
          siteName: "Unenter Labs",
          type: "website",
          images: [
            { url: ogImageUrl, width: 1200, height: 630, alt: category.name },
          ],
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [ogImageUrl],
        },
      };
    }
    const product = await getResearchProductBySlug(supabase, categorySlug);
    if (product) {
      const primaryImageUrl = getResearchProductOgImage(product);
      const title = `${product.title} | Unenter Labs`;
      const description =
        product.description ??
        `Research chemical: ${product.title}. For laboratory research use only.`;
      const url = `https://labs.unenter.live/${product.slug}`;
      const fallbackOgImage = `https://labs.unenter.live/${product.slug}/opengraph-image`;

      // Use the direct primary product photo if available, or fall back to the dynamic OG image generator
      const selectedOgImage = primaryImageUrl || fallbackOgImage;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url,
          siteName: "Unenter Labs",
          type: "website",
          images: [
            {
              url: selectedOgImage,
              width: 1200,
              height: 630,
              alt: product.title,
            },
          ],
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [selectedOgImage],
        },
      };
    }

    const staticPage = await getPublishedStaticPageBySlug(categorySlug);
    if (staticPage) {
      return {
        title: `${staticPage.title} | Unenter Labs`,
        description:
          staticPage.meta_description ||
          `Official ${staticPage.title} page for Unenter Labs.`,
      };
    }

    return { title: "Not Found | Unenter Labs" };
  }

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

export default async function CategorySlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{
    category?: string | string[];
    q?: string | string[];
  }>;
}) {
  const { categorySlug } = await params;
  const supabase = await createServerClient();
  const zoneCtx = await getZoneContext();

  // ── Labs: category first, catalog/search fallback, then product, else 404 ──
  if (zoneCtx.zone === "labs") {
    if (
      ["search", "catalog", "products", "all", "research"].includes(
        categorySlug.toLowerCase(),
      )
    ) {
      const { products, categories } = await getResearchCatalog(supabase);
      const queryParams = await searchParams;
      const requestedCategory = Array.isArray(queryParams.category)
        ? queryParams.category[0]
        : queryParams.category;
      const requestedQuery = Array.isArray(queryParams.q)
        ? queryParams.q[0]
        : queryParams.q;
      const initialCategory = categories.some(
        (category) => category.slug === requestedCategory,
      )
        ? requestedCategory
        : null;
      const isSearchPage = categorySlug.toLowerCase() === "search";
      return (
        <ResearchCatalogClient
          products={products}
          categories={categories}
          initialCategory={initialCategory}
          initialQuery={requestedQuery ?? ""}
          showSearchInput={isSearchPage}
          heading={
            isSearchPage ? "Search Research Catalog" : "Research Catalog"
          }
          description="Browse all high-purity research compounds."
        />
      );
    }

    const category = await getResearchCategoryBySlug(supabase, categorySlug);
    if (category) {
      const { products, categories } = await getResearchCatalog(supabase);
      return (
        <ResearchCatalogClient
          products={products}
          categories={categories}
          initialCategory={category.slug}
          heading={category.name}
          description={undefined}
          showSearchInput={false}
          showCategoryNavigation={false}
        />
      );
    }

    const product = await getResearchProductBySlug(supabase, categorySlug);
    if (product) {
      const related = await getRelatedResearchProducts(
        supabase,
        product.id,
        product.categories.map((c) => c.id),
      );
      return (
        <ResearchProductDetailClient product={product as any} related={related} />
      );
    }

    const staticPage = await getPublishedStaticPageBySlug(categorySlug);
    if (staticPage) {
      return (
        <div className="min-h-screen bg-[hsl(var(--background))] pb-16 pt-24 sm:pt-28">
          <ClientInlineStaticPage
            slug={categorySlug}
            containerWidth="contained"
            showFooter={true}
          />
        </div>
      );
    }

    notFound();
  }

  // ── Everyone else: original shop category behavior, unchanged ─────────
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
    .select(
      `
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
    `,
    )
    .eq("category_id", category.id);

  // Extract and filter active products with images. Derive the display options
  // (distinct colors + size count) from each product's active variants so the
  // grid card can show swatches without shipping the full variant tree.
  const products = (productCategories || [])
    .map((pc: any) => pc.products)
    .filter((p: any) => p && p.status === "active")
    .map((product: any) => {
      const variants = (product.product_variants || []).filter(
        (v: any) => v?.is_active !== false,
      );
      const colorMap = new Map<string, { name: string; hex: string }>();
      const sizes = new Set<string>();
      for (const v of variants) {
        const c = v?.options?.color;
        if (
          c &&
          typeof c === "object" &&
          typeof c.name === "string" &&
          c.name &&
          !colorMap.has(c.name)
        ) {
          colorMap.set(c.name, {
            name: c.name,
            hex: typeof c.hex === "string" ? c.hex : "",
          });
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
