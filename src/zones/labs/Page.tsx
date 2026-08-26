// src/zones/labs/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs zone  ·  labs.unenter.live
//
// Same DB-driven pattern as the core home page and the other landing-preset
// zones: this page fetches landing_sections rows for this zone and renders
// each one through the shared SectionComponents registry — nothing here is
// hardcoded copy.
//
//   DB filter  →  landing_sections.page = "labs"
//   Ordering   →  position asc, is_active = true
//   Renderer   →  SectionComponents[section.type]  (shared registry)
//
// Manage this from the dashboard: Landing → "Labs Landing" tab.
// (src/app/dashboard/[id]/settings/landing/page.tsx)
//
// Section types that work as-is today: top_banner, hero_carousel, static_html
// (up to as many static_pages-backed HTML banners as you want).
//
// Section types that DO NOT work yet for Labs: categories_grid, products_grid
// — both are hardwired to shop's products/categories/collections tables, not
// research_products/research_categories. Adding one of those here would show
// SHOP inventory on the Labs page, not the research catalog. A labs-aware
// products grid needs its own section type + API route before that's safe to
// use — flagged, not silently wired.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import {
  SectionComponents,
  type SectionRow,
} from "@/components/shop/sections/SectionRegistry";

const ZONE_KEY = "labs";
const ZONE_LABEL = "Unenter Labs";
const ZONE_DOMAIN = "labs.unenter.live";

export const metadata: Metadata = {
  title: `${ZONE_LABEL} | Unenter`,
  description: `${ZONE_LABEL} — research compounds for laboratory use. ${ZONE_DOMAIN}`,
};

// Revalidate every 60s so edits made in the dashboard's Labs Landing tab
// show up without a fresh deploy.
export const revalidate = 60;

export default async function UnenterLabsPage() {
  const supabase = await createClient();
  const { data: sectionsData, error } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", ZONE_KEY)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    // Don't crash the zone — log and fall through to the empty-state hero.
    console.error(`[${ZONE_KEY}] landing_sections fetch error:`, error.message);
  }

  const sections: SectionRow[] = (sectionsData as SectionRow[] | null) ?? [];

  return (
    <main>
      {/* ── Dynamic landing_sections (managed from the dashboard) ─────────── */}
      {sections.length > 0 && (
        <div className={`dynamic-${ZONE_KEY}-sections flex flex-col w-full`}>
          {sections.map((section) => {
            const Component = SectionComponents[section.type];
            if (!Component) {
              console.warn(`[${ZONE_KEY}] Unknown section type: ${section.type}`);
              return null;
            }
            return <Component key={section.id} section={section} />;
          })}
        </div>
      )}

      {/* ── Fallback hero (shown only while no sections are configured) ──── */}
      {sections.length === 0 && (
        <section className="py-20 md:py-28 lg:py-32">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                {ZONE_DOMAIN}
              </div>
              <h1 className="mb-6 text-4xl font-bold leading-tight text-black dark:text-white sm:text-5xl">
                {ZONE_LABEL}
              </h1>
              <p className="mb-3 text-lg leading-relaxed text-body-color">
                Research compounds for laboratory use. This page is live but has
                no <code>landing_sections</code> rows yet.
              </p>
              <p className="text-sm text-body-color/80">
                Add sections from the dashboard&apos;s <strong>Landing → Labs Landing</strong> tab
                and they will render here in <em>position</em> order.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-primary/90"
                >
                  Open dashboard
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
