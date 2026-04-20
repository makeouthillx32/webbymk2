// src/data/useServiceData.ts
//
// Fetches service content from Supabase.
// Returns the same `Services[]` shape as before — no consuming components need to change.
//
// Client components: call `useServicesData()` (React hook, fetches on mount).
// Server components / RSC: import `fetchServicesData` from "@/data/fetchServicesData".

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Services, subService } from "@/types";

// ── Raw DB row types ──────────────────────────────────────────────────────────

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

// ── Transform DB rows → Services[] ───────────────────────────────────────────

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

// ── Supabase query (shared between client hook + server fetch) ────────────────

export async function queryServices(locale: string): Promise<Services[]> {
  const supabase = createClient();

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
    console.error("[useServiceData] Supabase error:", error.message);
    return [];
  }

  return transform(data ?? [], locale);
}

// ── React hook (client components) ───────────────────────────────────────────

type UseServicesDataResult = {
  data: Services[];
  loading: boolean;
};

const useServicesData = (locale: string = "en"): UseServicesDataResult => {
  const [services, setServices] = useState<Services[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    queryServices(locale).then((data) => {
      setServices(data);
      setLoading(false);
    });
  }, [locale]);

  return { data: services, loading };
};

export default useServicesData;
