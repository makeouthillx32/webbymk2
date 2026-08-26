// app/search/page.tsx
//
// labs.unenter.live/search — browse/search the full research chemical
// catalog. Zone-gated to labs for now; other zones 404 (shop never had a
// dedicated search page to begin with, so this doesn't regress anything).

import { notFound } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";
import { getZoneContext } from "@/lib/zoneContext";
import { getResearchCatalog } from "@/lib/research/queries";
import ResearchCatalogClient from "@/components/research/ResearchCatalogClient";

export const metadata = {
  title: "Search | Unenter Labs",
  description:
    "Search and browse the full Unenter Labs research chemical catalog.",
};

export const revalidate = 300;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    q?: string | string[];
  }>;
}) {
  const zoneCtx = await getZoneContext();
  if (zoneCtx.zone !== "labs") {
    notFound();
  }

  const supabase = await createServerClient();
  const { products, categories } = await getResearchCatalog(supabase);
  const params = await searchParams;
  const requestedCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const requestedQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const initialCategory = categories.some(
    (category) => category.slug === requestedCategory,
  )
    ? requestedCategory
    : null;

  return (
    <ResearchCatalogClient
      products={products}
      categories={categories}
      initialCategory={initialCategory}
      initialQuery={requestedQuery ?? ""}
      showSearchInput
      heading="Search Research Chemicals"
      description="For laboratory research use only. Not for human consumption."
    />
  );
}
