// src/zones/test3/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Test3 zone  ·  test3.unenter.live
//
// This is the root page for the test3 zone.  It follows the same pattern
// as src/app/page.tsx (the core home): fetch landing_sections server-side for
// this zone's page key and render each through SectionComponents.
//
//   DB filter  →  landing_sections.page = "test3"
//   Ordering   →  position asc, is_active = true
//   Renderer   →  SectionComponents[section.type]  (shared registry)
//
// To populate this zone's page, INSERT rows into  landing_sections  with
// page = "test3".  The fallback hero below is shown only while the
// table is empty for this zone.
//
// Dynamic route sections (sub-routes, not landing_sections) are scaffolded
// alongside this file:
//   zones/test3/src/app/{route}/page.tsx   ← thin re-export wrapper
//   src/zones/test3/{route}/Page.tsx        ← edit these (core content)
//
// Edit freely — the layout (header, footer, providers) is already wired via
// zones/test3/src/app/layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link              from "next/link";
import { createClient }  from "@/utils/supabase/server";
import {
  SectionComponents,
  type SectionRow,
} from "@/components/shop/sections/SectionRegistry";

// ── Zone identity (baked by the scaffolder) ───────────────────────────────────
const ZONE_KEY    = "test3";
const ZONE_LABEL  = "Test3";
const ZONE_DOMAIN = "test3.unenter.live";

export const metadata: Metadata = {
  title:       `${ZONE_LABEL} | Unenter`,
  description: `${ZONE_LABEL} — ${ZONE_DOMAIN}`,
};

// Revalidate every 60s so edits in the landing_sections admin UI show up
// without needing a fresh deploy.
export const revalidate = 60;

export default async function Test3Page() {
  // ── Fetch dynamic landing_sections for this zone ──────────────────────────
  const supabase = await createClient();
  const { data: sectionsData, error } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page",      ZONE_KEY)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    // Don't crash the zone — log and fall through to the empty-state hero.
    console.error(`[${ZONE_KEY}] landing_sections fetch error:`, error.message);
  }

  const sections: SectionRow[] = (sectionsData as SectionRow[] | null) ?? [];

  return (
    <main>

      {/* ── Dynamic landing_sections ──────────────────────────────────────── */}
      {sections.length > 0 && (
        <div className={`dynamic-${ZONE_KEY}-sections flex flex-col w-full`}>
          {sections.map((section) => {
            const Component = SectionComponents[section.type];
            if (!Component) {
              console.warn(
                `[${ZONE_KEY}] Unknown section type: ${section.type}`,
              );
              return null;
            }
            return <Component key={section.id} section={section} />;
          })}
        </div>
      )}

      {/* ── Fallback hero (shown only when no sections are configured) ────── */}
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
                This zone is live but has no <code>landing_sections</code> rows yet.
              </p>
              <p className="text-sm text-body-color/80">
                Add rows with <code>page = &quot;{ZONE_KEY}&quot;</code> to the
                {" "}<code>landing_sections</code> table (or use the landing-editor
                admin UI) and they will render here in <em>position</em> order.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-primary/90"
                >
                  Open dashboard
                </Link>
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-stroke bg-white px-5 py-2.5 text-sm font-medium text-black shadow-sm transition hover:bg-gray-50 dark:border-dark-3 dark:bg-dark dark:text-white dark:hover:bg-dark/70"
                >
                  Edit landing_sections
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

    </main>
  );
}
