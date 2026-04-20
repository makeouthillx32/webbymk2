// src/data/fetchServicesData.ts
//
// Server-side fetch for service data — use in Server Components and Route Handlers.
// Uses the SSR Supabase client (reads auth cookies, respects RLS).
//
// Usage in a Server Component:
//   import { fetchServicesData } from "@/data/fetchServicesData";
//   const services = await fetchServicesData("de");

import { createClient } from "@/utils/supabase/server";
import type { Services, subService } from "@/types";

type Translations = Record<string, Record<string, string>>;

interface RawListItem {
  id: string;
  position: number;
  translations: Translations;
}

interface RawNestedList {
  id: string;
  position: number;
  translations: Translations;
  service_nested_list_items: RawListItem[];
}

interface RawSubService {
  id: string;
  path: string;
  images: string[];
  position: number;
  translations: Translations;
  service_nested_lists: RawNestedList[];
}

interface RawCategory {
  id: string;
  slug: string;
  image: string | null;
  tags: string[];
  position: number;
  translations: Translations;
  service_sub_services: RawSubService[];
}

function transform(rows: RawCategory[], locale: string): Services[] {
  return rows.map((cat) => ({
    title:     cat.translations?.[locale]?.title     ?? cat.translations?.de?.title     ?? "",
    paragraph: cat.translations?.[locale]?.paragraph ?? cat.translations?.de?.paragraph ?? "",
    image:     cat.image ?? "",
    tags:      cat.tags ?? [],
    subServices: (cat.service_sub_services ?? [])
      .sort((a, b) => a.position - b.position)
      .map((ss): subService => ({
        title:       ss.translations?.[locale]?.title       ?? ss.translations?.de?.title       ?? "",
        description: ss.translations?.[locale]?.description ?? ss.translations?.de?.description ?? "",
        paragraph:   ss.translations?.[locale]?.paragraph   ?? ss.translations?.de?.paragraph   ?? "",
        cta:         ss.translations?.[locale]?.cta         ?? ss.translations?.de?.cta         ?? "",
        path:        ss.path ?? "",
        images:      ss.images ?? [],
        nestedList: (ss.service_nested_lists ?? [])
          .sort((a, b) => a.position - b.position)
          .map((nl) => ({
            title: nl.translations?.[locale]?.title ?? nl.translations?.de?.title ?? "",
            list: (nl.service_nested_list_items ?? [])
              .sort((a, b) => a.position - b.position)
              .map((item) => item.translations?.[locale]?.text ?? item.translations?.de?.text ?? ""),
          })),
      })),
  }));
}

export async function fetchServicesData(locale: string = "en"): Promise<Services[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select(`
      id, slug, image, tags, position, translations,
      service_sub_services (
        id, path, images, position, translations,
        service_nested_lists (
          id, position, translations,
          service_nested_list_items (
            id, position, translations
          )
        )
      )
    `)
    .eq("is_active", true)
    .eq("service_sub_services.is_active", true)
    .order("position", { ascending: true })
    .returns<RawCategory[]>();

  if (error) {
    console.error("[fetchServicesData] Supabase error:", error.message);
    return [];
  }

  return transform(data ?? [], locale);
}

// Fetch a single category by slug (useful for individual service pages)
export async function fetchServiceCategory(
  slug: string,
  locale: string = "en"
): Promise<Services | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select(`
      id, slug, image, tags, position, translations,
      service_sub_services (
        id, path, images, position, translations,
        service_nested_lists (
          id, position, translations,
          service_nested_list_items (
            id, position, translations
          )
        )
      )
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single()
    .returns<RawCategory>();

  if (error || !data) return null;

  return transform([data], locale)[0] ?? null;
}
