// src/zones/test14/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Test14 zone  ·  test14.unenter.live
//
// ──────────────────────────────────────────────────────
//  START BUILDING HERE
//  This is the root page for your new Unenter zone.
//
//  Delete everything below <main> and replace it with
//  your own components whenever you're ready.
//  The branded shell is already wired — just build.
// ──────────────────────────────────────────────────────
//
// HOW THIS WORKS
// ──────────────
// The zone's layout.tsx already mounts:
//   <Providers>           — theme, auth/session, role context
//   <ZoneLayout>          — reads zone.config.ts, renders header + footer
//
// Every component you put here inherits the full Unenter design system.
// You can import from @/components, @/utils, @/lib, @/themes — they all
// resolve against the shared core at Docker build time (overlay model).
//
// DYNAMIC SECTIONS (if you picked any in the wizard)
// ──────────────────────────────────────────────────
// Each selected section is scaffolded as:
//   zones/test14/src/app/{routePath}/page.tsx   ← thin re-export
//   src/zones/test14/{routePath}/Page.tsx        ← build content here
//
// See the "Your Dynamic Sections" card below for the exact paths.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import {
  SectionComponents,
  type SectionRow,
} from "@/components/shop/sections/SectionRegistry";

// ── Zone identity (injected by the scaffolder — do not edit these) ────────────
const ZONE_KEY = "test14";
const ZONE_LABEL = "Test14";
const ZONE_DOMAIN = "test14.unenter.live";

export const metadata: Metadata = {
  title: `${ZONE_LABEL} | Unenter`,
  description: `${ZONE_LABEL} — built on unenter.live.`,
};

// ISR: re-render at most once per 60 s so CMS edits appear without a redeploy.
// Remove or set to 0 for fully dynamic pages; set to false to fully static.
export const revalidate = 60;

// ─────────────────────────────────────────────────────────────────────────────

export default async function Test14Page() {

  // ── Pull any CMS landing sections assigned to this zone ────────────────────
  // Insert rows with  page = "test14"  from the landing editor and they
  // will appear here instead of the developer guide below.
  const supabase = await createClient();
  const { data: sectionsData, error } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", ZONE_KEY)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    console.error(`[${ZONE_KEY}] landing_sections fetch error:`, error.message);
  }

  const sections: SectionRow[] = (sectionsData as SectionRow[] | null) ?? [];

  // ── Once you have real content wired, remove the guide below ───────────────
  return (
    <main>

      {/* ── CMS sections (shown when landing_sections rows exist) ──────────── */}
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

      {/* ── Developer guide (shown when no CMS sections exist yet) ─────────── */}
      {sections.length === 0 && (
        <>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <section className="relative overflow-hidden border-b border-stroke py-20 md:py-28 dark:border-dark-3">
            <div className="container relative z-10">
              <div className="mx-auto max-w-3xl text-center">

                {/* Zone badge */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  {ZONE_DOMAIN}
                </div>

                <h1 className="mb-5 text-4xl font-bold leading-tight text-black dark:text-white sm:text-5xl lg:text-6xl">
                  {ZONE_LABEL} is live.
                  <br />
                  <span className="text-primary">Start building.</span>
                </h1>

                <p className="mb-8 text-lg leading-relaxed text-body-color">
                  Your zone is bootstrapped, branded, and deployed.
                  The scaffold has already wired the layout shell, theme system,
                  auth context, and Supabase client — open{" "}
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm text-black dark:bg-dark-2 dark:text-white">
                    src/zones/{ZONE_KEY}/Page.tsx
                  </code>{" "}
                  and replace this page with anything you can imagine.
                </p>

                {/* CTA row */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/dashboard"
                    className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-primary/90"
                  >
                    Open Dashboard
                  </Link>
                  <a
                    href={`https://supabase.com/dashboard`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-stroke bg-white px-6 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-gray-50 dark:border-dark-3 dark:bg-dark dark:text-white dark:hover:bg-dark/70"
                  >
                    Supabase Dashboard
                  </a>
                </div>

              </div>
            </div>
          </section>

          {/* ── What is already wired ─────────────────────────────────────── */}
          <section className="py-14 md:py-20">
            <div className="container">

              <SectionLabel>Platform — already included</SectionLabel>
              <h2 className="mb-3 text-2xl font-bold text-black dark:text-white sm:text-3xl">
                Everything bootstrapped for you
              </h2>
              <p className="mb-10 max-w-2xl text-body-color">
                The scaffold wired the full Unenter stack before your first
                deploy. You inherit this from{" "}
                <code className="text-sm">layout.tsx</code> — no setup needed.
              </p>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon="🎨"
                  title="Theme System"
                  desc="CSS design tokens (--gp-*, --lt-*) + dark/light mode. Customize in globals.css or extend via @import."
                />
                <FeatureCard
                  icon="🔐"
                  title="Auth & Session"
                  desc="Supabase auth, session context, and role providers are mounted in <Providers> — user state is available anywhere."
                />
                <FeatureCard
                  icon="🗄️"
                  title="Supabase Client"
                  desc="Server and browser clients pre-configured. Import from @/utils/supabase/server or /client on any page."
                />
                <FeatureCard
                  icon="🧩"
                  title="Shared Components"
                  desc="Import from @/components — buttons, modals, cards, forms, and the full SectionRegistry for CMS-driven content."
                />
                <FeatureCard
                  icon="🗺️"
                  title="Routing & Layout Shell"
                  desc="ClientLayout mounts the correct header + footer for your layout type. Route classification is pre-patched."
                />
                <FeatureCard
                  icon="🌐"
                  title="i18n Ready"
                  desc="Locale detection (en / de) is wired into layout.tsx via middleware cookies. Add more in VALID_LOCALES."
                />
                <FeatureCard
                  icon="📦"
                  title="CMS Section Pipeline"
                  desc="Add landing_sections rows with page = &quot;{ZONE_KEY}&quot; and they render here automatically via SectionRegistry."
                />
                <FeatureCard
                  icon="🔁"
                  title="ISR Revalidation"
                  desc="export const revalidate = 60 — CMS changes appear in ≤60 s without a redeploy. Tune or remove to taste."
                />
                <FeatureCard
                  icon="🐳"
                  title="Docker Overlay Build"
                  desc="Your Dockerfile copies the shared src/ tree then overlays zones/{ZONE_KEY}/src/app/ — branded pages cost zero extra."
                />
              </div>

            </div>
          </section>

          {/* ── What you can build ────────────────────────────────────────── */}
          <section className="border-t border-stroke py-14 md:py-20 dark:border-dark-3">
            <div className="container">

              <SectionLabel>Examples — what zones become</SectionLabel>
              <h2 className="mb-3 text-2xl font-bold text-black dark:text-white sm:text-3xl">
                A zone is a full application
              </h2>
              <p className="mb-10 max-w-2xl text-body-color">
                Zones are not landing pages — they are standalone Next.js
                applications that share the Unenter brand, components, and
                data layer. Here is what they commonly become.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ExampleCard
                  layout="shop"
                  title="Storefront"
                  href="/products"
                  items={[
                    "Product catalogue + detail pages",
                    "Collection and category browsing",
                    "Shopping cart and checkout flow",
                    "Order tracking and history",
                  ]}
                />
                <ExampleCard
                  layout="dashboard"
                  title="Admin Panel"
                  href="/dashboard"
                  items={[
                    "Workspace overview with KPI cards",
                    "Data tables with filter + sort",
                    "User management and role controls",
                    "Analytics charts and audit logs",
                  ]}
                />
                <ExampleCard
                  layout="app"
                  title="Client Portal"
                  href="/portal"
                  items={[
                    "Project or account overview",
                    "Document and file sharing",
                    "Status and notification feeds",
                    "Settings / profile management",
                  ]}
                />
                <ExampleCard
                  layout="landing"
                  title="Content Site"
                  href="/blog"
                  items={[
                    "Marketing landing with CMS sections",
                    "Blog or editorial with /[slug] routes",
                    "Documentation with versioned paths",
                    "Campaign or event-specific pages",
                  ]}
                />
                <ExampleCard
                  layout="app"
                  title="Internal Tool"
                  href="/tools"
                  items={[
                    "CSV import / export pipelines",
                    "Reporting and data extraction",
                    "Bulk-edit interfaces",
                    "Ops dashboards and monitors",
                  ]}
                />
                <ExampleCard
                  layout="minimal"
                  title="Custom Experience"
                  href="/"
                  items={[
                    "Brand microsites + campaign pages",
                    "Interactive visualisations",
                    "Embeddable widgets or iframes",
                    "Any canvas — no header enforced",
                  ]}
                />
              </div>

            </div>
          </section>

          {/* ── Dynamic sections explainer ────────────────────────────────── */}
          <section className="border-t border-stroke py-14 md:py-20 dark:border-dark-3">
            <div className="container">

              <SectionLabel>Dynamic Sections — grow beyond one page</SectionLabel>
              <h2 className="mb-3 text-2xl font-bold text-black dark:text-white sm:text-3xl">
                Your zone is not one page.
                <br />
                It is an ecosystem.
              </h2>
              <p className="mb-6 max-w-2xl text-body-color">
                Dynamic sections are Next.js route segments scaffolded
                alongside your root page. Each one is a full route — static
                or dynamic — with its own{" "}
                <code className="text-sm">page.tsx</code> entry wired through
                the same branded shell. Add as many as your application needs;
                the scaffold engine generates all the glue.
              </p>

              {/* How it works */}
              <div className="mb-10 rounded-xl border border-stroke bg-gray-50 p-6 dark:border-dark-3 dark:bg-dark-2">
                <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-body-color">
                  How sections are scaffolded
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CodeBlock
                    label="Entry wrapper (auto-generated, do not edit)"
                    code={`zones/${ZONE_KEY}/src/app/{routePath}/page.tsx\n→ export { default } from "@/zones/${ZONE_KEY}/{routePath}/Page";`}
                  />
                  <CodeBlock
                    label="Content file (edit this — it is yours)"
                    code={`src/zones/${ZONE_KEY}/{routePath}/Page.tsx\n→ Build your page here. Import anything from @/`}
                  />
                </div>
              </div>

              {/* Section types */}
              <p className="mb-5 font-semibold text-black dark:text-white">
                Sections available per layout type (select more in the TUI wizard):
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DsSectionBadge route="products/[slug]" label="Product detail" layouts="shop" />
                <DsSectionBadge route="collections/[slug]" label="Collection listing" layouts="shop" />
                <DsSectionBadge route="[categorySlug]" label="Top-level category" layouts="shop" />
                <DsSectionBadge route="checkout" label="Checkout flow" layouts="shop" />
                <DsSectionBadge route="cart" label="Shopping cart" layouts="shop" />
                <DsSectionBadge route="dashboard/[id]" label="Workspace dashboard" layouts="dashboard" />
                <DsSectionBadge route="profile/[id]" label="User profile" layouts="shop · dashboard · app" />
                <DsSectionBadge route="settings/[...setting]" label="Settings (catch-all)" layouts="app" />
                <DsSectionBadge route="[slug]" label="Blog posts / CMS pages" layouts="landing" />
                <DsSectionBadge route="pages/[slug]" label="Static CMS pages" layouts="landing" />
              </div>

              <p className="mt-8 text-sm text-body-color">
                Not seeing a section you need?{" "}
                <span className="font-medium text-black dark:text-white">
                  Add a new entry to <code>DS_CATALOG</code> in{" "}
                  <code>src/ink/zone-scaffold.ts</code>
                </span>{" "}
                and it will appear as a toggleable option in the TUI wizard for
                every future zone of that layout type.
              </p>

            </div>
          </section>

          {/* ── Your dynamic sections (populated by scaffolder) ───────────── */}
          

          {/* ── Quick start CTA ───────────────────────────────────────────── */}
          <section className="border-t border-stroke py-14 dark:border-dark-3">
            <div className="container">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="mb-4 text-2xl font-bold text-black dark:text-white">
                  Ready to build?
                </h2>
                <p className="mb-8 text-body-color">
                  Open the file below and replace this page with your first real
                  component. Everything is already wired — the only thing missing
                  is your code.
                </p>
                <div className="mb-8 rounded-xl border border-stroke bg-gray-50 px-6 py-4 font-mono text-sm text-black dark:border-dark-3 dark:bg-dark-2 dark:text-white">
                  src/zones/{ZONE_KEY}/Page.tsx
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/dashboard"
                    className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-primary/90"
                  >
                    Open Dashboard
                  </Link>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-stroke bg-white px-6 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-gray-50 dark:border-dark-3 dark:bg-dark dark:text-white dark:hover:bg-dark/70"
                  >
                    Supabase Dashboard
                  </a>
                </div>
              </div>
            </div>
          </section>

        </>
      )}

    </main>
  );
}

// ── Small presentational components (inline — delete once you replace the page) ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
      {children}
    </p>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-stroke bg-white p-5 dark:border-dark-3 dark:bg-dark">
      <div className="mb-3 text-2xl">{icon}</div>
      <p className="mb-1 font-semibold text-black dark:text-white">{title}</p>
      <p className="text-sm leading-relaxed text-body-color">{desc}</p>
    </div>
  );
}

function ExampleCard({
  layout, title, href, items,
}: {
  layout: string; title: string; href: string; items: string[];
}) {
  const layoutColor: Record<string, string> = {
    shop: "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/30  dark:text-blue-300  dark:border-blue-800",
    dashboard: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800",
    app: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
    landing: "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
    minimal: "bg-gray-100  text-gray-600   border-gray-200   dark:bg-dark-2       dark:text-gray-400  dark:border-dark-3",
  };
  return (
    <div className="rounded-xl border border-stroke bg-white p-5 dark:border-dark-3 dark:bg-dark">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-black dark:text-white">{title}</p>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${layoutColor[layout] ?? layoutColor.minimal}`}>
          {layout}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-body-color">
            <span className="mt-0.5 text-primary">→</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <p className="mb-2 text-xs text-body-color">{label}</p>
      <pre className="overflow-x-auto rounded-lg bg-white p-4 text-xs leading-relaxed text-black dark:bg-dark dark:text-white">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function DsSectionBadge({
  route, label, layouts,
}: {
  route: string; label: string; layouts: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-stroke bg-white p-4 dark:border-dark-3 dark:bg-dark">
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-mono text-xs text-primary">/{route}</p>
        <p className="text-sm font-medium text-black dark:text-white">{label}</p>
        <p className="text-xs text-body-color">{layouts}</p>
      </div>
    </div>
  );
}
