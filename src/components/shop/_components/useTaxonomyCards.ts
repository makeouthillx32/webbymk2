// src/components/shop/_components/useTaxonomyCards.ts
// ─────────────────────────────────────────────────────────────────────────────
// Card rows for a taxonomy grid, from whichever axis the section points at.
//
// Why only categories and collections
// ───────────────────────────────────
// The three taxonomies answer different questions and only two of them are
// things you LOOK at:
//
//   categories   what a product IS       — browse structure, hierarchical nav
//   collections  what you are PUSHING    — merchandising, made to be displayed
//   tags         what a product is LIKE  — filters and labels attached to items
//
// A tag never renders as a card with its own artwork, so it is not offered as
// a source here. That distinction is the whole reason the three tables stayed
// separate; letting a tag masquerade as a display row would collapse it again.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export type TaxonomySource = "categories" | "collections";

export type TaxonomyCard = {
  id: string;
  name: string;
  slug: string;
  coverImageUrl?: string | null;
  cover_image_alt?: string | null;
  /** Where the card links to — differs per source. */
  href: string;
  eyebrow?: string | null;
  tagline?: string | null;
  subtitle?: string | null;
  cta_label?: string | null;
  text_color_token?: string | null;
};

/** The editorial columns all three tables share. */
const CARD_COLUMNS =
  "id, name, slug, cover_image_bucket, cover_image_path, cover_image_alt, " +
  "eyebrow, tagline, subtitle, cta_label, text_color_token, position";

export function useTaxonomyCards(source: TaxonomySource = "categories") {
  const [cards, setCards] = useState<TaxonomyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const supabase = createClient();
        let query = supabase.from(source).select(CARD_COLUMNS);

        // Only categories and tags carry is_active; collections gate visibility
        // with is_home_section instead, so filtering blindly on is_active would
        // throw for collections.
        if (source === "categories") query = query.eq("is_active", true);

        const { data, error: qErr } = await query.order("position", { ascending: true });
        if (qErr) throw new Error(`${source} failed: ${qErr.message}`);

        const rows: TaxonomyCard[] = (data ?? []).map((row: any) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          coverImageUrl:
            row.cover_image_bucket && row.cover_image_path
              ? supabase.storage.from(row.cover_image_bucket).getPublicUrl(row.cover_image_path).data
                  .publicUrl
              : null,
          cover_image_alt: row.cover_image_alt,
          // Categories are the browse tree and sit at the root; collections
          // live under /collections.
          href: source === "collections" ? `/collections/${row.slug}` : `/${row.slug}`,
          eyebrow: row.eyebrow,
          tagline: row.tagline,
          subtitle: row.subtitle,
          cta_label: row.cta_label,
          text_color_token: row.text_color_token,
        }));

        if (!alive) return;
        setCards(rows);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load taxonomy cards");
        setCards([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [source]);

  return { cards, loading, error };
}
