// lib/research/references/queries.ts
//
// Fetches rows from the `research_references` table (see migration
// create_research_references_table). Deliberately generic — takes a
// group_key string, not a product name baked into a filename or function
// name. Follows the same SupabaseClient-passed-in convention as
// src/lib/research/queries.ts.
//
// Not called from any page yet — src/components/research/SourcesReferences.tsx
// is built and ready, just parked until a page decides to import this.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchReference } from "./types";

export async function getResearchReferences(
  supabase: SupabaseClient,
  groupKey: string
): Promise<ResearchReference[]> {
  const { data, error } = await supabase
    .from("research_references")
    .select("id, journal, title, year, authors, pmid, doi, url")
    .eq("group_key", groupKey)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(`[research/references] Failed to load references for "${groupKey}":`, error.message);
    return [];
  }

  return data ?? [];
}
