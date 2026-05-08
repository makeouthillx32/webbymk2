// src/zones/yayy/[slug]/Page.tsx
// Yayy zone — Posts / Pages
// Edit this file to build out the posts / pages page.
// Import shared components from @/components/ (src/app/ is not available in zone builds).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  // TODO: query Supabase and return all valid param values.
  // import { createServerClient as createSupabaseClient } from "@supabase/ssr";
  // const supabase = createSupabaseClient(url, key, { cookies: { getAll: () => [], setAll: () => {} } });
  // const { data } = await supabase.from("...").select("slug");
  // return data?.map((r) => ({ slug: r.slug })) ?? [];
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const display = slug;
  return { title: `Posts / Pages: ${display} | Yayy` };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;

  // TODO: fetch data from Supabase and render your component.
  // import { createServerClient } from "@/utils/supabase/server";
  // const supabase = await createServerClient();
  // const { data } = await supabase.from("...").select("*").eq("slug", slug).single();
  // if (!data) notFound();

  return (
    <main className="py-16 md:py-20 lg:py-28">
      <div className="container">
        <h1 className="text-3xl font-bold">Posts / Pages</h1>
        <p className="mt-2 text-body-color">Yayy zone dynamic route: [slug]</p>
      </div>
    </main>
  );
}
