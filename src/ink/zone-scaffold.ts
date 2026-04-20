// src/ink/zone-scaffold.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone scaffolding engine.
//
// ARCHITECTURE — core-first
// ─────────────────────────
// All zone content lives in the core (src/), not in the zone folder:
//
//   src/zones/{key}/Page.tsx   ← edit this to change the zone's page
//   zones/{key}/src/app/page.tsx  ← auto-generated re-export, do not edit
//
// The zone's Dockerfile copies all of src/ at build time, so
// @/zones/{key}/Page resolves correctly inside the zone's Next.js build.
//
// WHAT GETS CREATED
// ─────────────────
//   src/zones/{key}/Page.tsx          ← zone page content (from template)
//   zones/{key}/Dockerfile
//   zones/{key}/package.json
//   zones/{key}/src/app/page.tsx      ← thin re-export
//   zones/{key}/src/app/layout.tsx
//   zones/{key}/src/app/globals.css
//
// WHAT GETS PATCHED
// ─────────────────
//   src/config/zones.ts               ← new Zone entry appended
//   src/components/Layouts/routeClassifier.ts  ← layout override inserted
//
// POST-CREATION
// ─────────────
//   NPM proxy host created automatically via npmAddZone()
// ─────────────────────────────────────────────────────────────────────────────

import { join }                                 from "path";
import { readFileSync, existsSync }             from "fs";
import { mkdir, readdir, copyFile, rm }         from "fs/promises";
import { pathExists, writeFileAtomic }          from "../utils/zoneScaffolding.ts";
import { PROJECT_DIR, DOMAIN }                  from "../config/stack.ts";
import { KONG_URL, SERVICE_KEY }                from "./db-api.ts";
import { invalidateZoneCache }                  from "./zone-store.ts";
import { npmFindHost, npmDeleteHost, npmGetToken } from "./npm-api.ts";

export type OnLine = (line: string) => void;

// ── Layout types ──────────────────────────────────────────────────────────────

export type LayoutType = "landing" | "shop" | "dashboard" | "app" | "minimal";

export const LAYOUT_OPTIONS: {
  type:  LayoutType;
  label: string;
  desc:  string;
}[] = [
  { type: "landing",   label: "Landing",   desc: "LandingHeader + LandingFooter  (blogs, marketing)" },
  { type: "shop",      label: "Shop",      desc: "ShopHeader + ShopFooter         (e-commerce)"      },
  { type: "dashboard", label: "Dashboard", desc: "Sidebar + DashboardHeader       (admin panels)"    },
  { type: "app",       label: "App",       desc: "AppHeader only                  (web apps)"        },
  { type: "minimal",   label: "Minimal",   desc: "No header or footer             (bare canvas)"     },
];

// ── Dynamic sections (DS) catalog ────────────────────────────────────────────
//
// Dynamic route sections are Next.js route segments containing a dynamic param
// (e.g. [slug], [id]) or static child routes (e.g. checkout, cart) that a zone
// needs in addition to its root page.tsx.
//
// Each entry in DS_CATALOG maps a LayoutType to the sections that make sense
// for it.  The wizard pre-selects defaultOn:true entries; the user can toggle.
//
// Scaffold creates two files per section:
//   zones/{key}/src/app/{routePath}/page.tsx  ← thin re-export wrapper
//   src/zones/{key}/{routePath}/Page.tsx       ← starter content in core

export interface DynamicSection {
  id:          string;        // unique key, e.g. "products"
  routePath:   string;        // Next.js path, e.g. "products/[slug]"
  param:       string | null; // dynamic segment name, null for static routes
  label:       string;        // human label
  desc:        string;        // one-line description shown in wizard
  defaultOn:   boolean;       // pre-selected when layout is chosen
  hasCore?:    boolean;       // if true, re-exports from @/core/sections/[categorySlug]
}

export const DS_CATALOG: Record<LayoutType, DynamicSection[]> = {
  shop: [
    { id: "products",    routePath: "products/[slug]",       param: "slug",         label: "Products",     desc: "/products/[slug]   — product detail page",    defaultOn: true, hasCore: true  },
    { id: "collections", routePath: "collections/[slug]",    param: "slug",         label: "Collections",  desc: "/collections/[slug] — collection listing",    defaultOn: true, hasCore: true  },
    { id: "category",    routePath: "[categorySlug]",        param: "categorySlug", label: "Categories",   desc: "/[categorySlug]     — top-level category",    defaultOn: true, hasCore: true  },
    { id: "checkout",    routePath: "checkout",              param: null,           label: "Checkout",     desc: "/checkout           — checkout flow",          defaultOn: true,  hasCore: true  },
    { id: "cart",        routePath: "cart",                  param: null,           label: "Cart",         desc: "/cart               — shopping cart",          defaultOn: false },
    { id: "profile",     routePath: "profile/[id]",          param: "id",           label: "Profile",      desc: "/profile/[id]       — user profile pages",     defaultOn: false },
  ],
  dashboard: [
    { id: "dash-id",     routePath: "dashboard/[id]",        param: "id",           label: "Dashboard",    desc: "/dashboard/[id]     — workspace dashboard",   defaultOn: true  },
    { id: "profile",     routePath: "profile/[id]",          param: "id",           label: "Profile",      desc: "/profile/[id]       — user profile pages",     defaultOn: false },
  ],
  landing: [
    { id: "post",        routePath: "[slug]",                param: "slug",         label: "Posts / Pages", desc: "/[slug]            — blog posts or CMS pages", defaultOn: true  },
    { id: "pages",       routePath: "pages/[slug]",          param: "slug",         label: "Static pages", desc: "/pages/[slug]       — CMS-managed static pages", defaultOn: false, hasCore: true  },
  ],
  app: [

    { id: "profile",     routePath: "profile/[id]",          param: "id",           label: "Profile",      desc: "/profile/[id]       — user profile pages",     defaultOn: false },
    { id: "settings",    routePath: "settings/[...setting]", param: "...setting",   label: "Settings",     desc: "/settings/...       — settings pages",         defaultOn: false },
  ],
  minimal: [],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NewZoneParams {
  key:        string;       // e.g. "docs"
  label:      string;       // e.g. "Docs"
  layoutType: LayoutType;   // chosen header/footer shell
  dynamicSections?: DynamicSection[]; // DS route sections to scaffold
}

export interface DerivedZone {
  key:            string;
  label:          string;
  layoutType:     LayoutType;
  domain:         string;
  service:        string;
  container:      string;
  image:          string;
  dockerfile:     string;
  upstreamEnvKey: string;
  devPort:        number;
  dynamicSections: DynamicSection[]; // DS sections selected in wizard
}

// ── Derive all zone values from key + label ───────────────────────────────────

export function deriveZone(params: NewZoneParams, devPort: number): DerivedZone {
  const { key, label, layoutType, dynamicSections } = params;
  const rootDomain = DOMAIN || "unenter.live";
  return {
    key,
    label,
    layoutType,
    domain:          `${key}.${rootDomain}`,
    service:         key,
    container:       `unt_${key}`,
    image:           `ghcr.io/makeouthillx32/unenter-${key}:latest`,
    dockerfile:      `zones/${key}/Dockerfile`,
    upstreamEnvKey:  `UPSTREAM_${key.toUpperCase()}`,
    devPort,
    dynamicSections: dynamicSections ?? [],
  };
}

// ── Find next available dev port ──────────────────────────────────────────────
// Scans all zones/{*}/package.json for "next dev -p XXXX" and picks next free.

export async function findNextDevPort(): Promise<number> {
  const zonesDir = join(PROJECT_DIR, "zones");
  const usedPorts = new Set<number>();

  try {
    const entries = await readdir(zonesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(zonesDir, entry.name, "package.json");
      if (!existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const devScript: string = pkg?.scripts?.dev ?? "";
        const match = devScript.match(/-p\s+(\d+)/);
        if (match) usedPorts.add(Number(match[1]));
      } catch {
        // ignore malformed package.json
      }
    }
  } catch {
    // zones/ doesn't exist yet — that's fine
  }

  let port = 3001;
  while (usedPorts.has(port)) port++;
  return port;
}

// ── File generators ───────────────────────────────────────────────────────────

function genDockerfile(z: DerivedZone): string {
  return `# zones/${z.key}/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Build context: project root
# Zone: ${z.label}  (${z.domain})
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM oven/bun:1.2 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package.json next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/

# Swap src/app/: keep core logic + provider.tsx + globals.css, overlay ${z.key} zone pages.
# We preserve essential shop routes, APIs, provider.tsx (Providers context) and
# globals.css (which @imports ../style/layout-tokens.css so --lt-* / --gp-*
# theme tokens resolve for AppHeader / ShopFooter).  Dropping globals.css was
# the exact cause of a white-header bug — shop zone's Dockerfile uses core's
# globals.css directly and renders themed correctly; we now match.
RUN mkdir -p /tmp/core-app && \\
    for dir in api actions _components [categorySlug] products collections checkout pages; do \\
      if [ -d "src/app/$dir" ]; then cp -r "src/app/$dir" /tmp/core-app/; fi; \\
    done && \\
    if [ -f src/app/provider.tsx ]; then cp src/app/provider.tsx /tmp/core-app/; fi && \\
    if [ -f src/app/globals.css ]; then cp src/app/globals.css /tmp/core-app/; fi && \\
    rm -rf src/app && \\
    mkdir -p src/app && \\
    cp -r /tmp/core-app/* src/app/

# Zone overlay: copy everything from zones/${z.key}/src/app/ so any future
# loading.tsx / not-found.tsx / etc. gets picked up automatically.
COPY zones/${z.key}/src/app/ ./src/app/

# CRITICAL: restore core's globals.css on top of any zone copy.  The zone's
# globals.css (if it exists) is self-contained and DOES NOT @import
# layout-tokens.css, so it breaks AppHeader / ShopFooter theming.  Core's
# globals.css is the only one that imports layout-tokens, so it must win.
# This was the root cause of a white-header-and-footer bug on first scaffold.
RUN cp /tmp/core-app/globals.css src/app/globals.css 2>/dev/null || true

ENV NEXT_PUBLIC_ZONE=${z.key}
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_URL_BROWSER
ARG NEXT_PUBLIC_APP_TITLE
ARG NEXT_PUBLIC_COMPANY_NAME
ARG NEXT_PUBLIC_OWNER_USERNAME
ARG NEXT_PUBLIC_OWNER_EMAIL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL_BROWSER=$NEXT_PUBLIC_SUPABASE_URL_BROWSER
ENV NEXT_PUBLIC_APP_TITLE=$NEXT_PUBLIC_APP_TITLE
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME
ENV NEXT_PUBLIC_OWNER_USERNAME=$NEXT_PUBLIC_OWNER_USERNAME
ENV NEXT_PUBLIC_OWNER_EMAIL=$NEXT_PUBLIC_OWNER_EMAIL

RUN bun run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM oven/bun:1.2-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ZONE=${z.key}
ENV HOME=/tmp

RUN addgroup --system --gid 1001 nodejs && \\
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public           ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
`;
}

function genPackageJson(z: DerivedZone): string {
  return JSON.stringify({
    name:    `@unenter/${z.key}`,
    version: "0.0.0",
    private: true,
    scripts: {
      dev:   `next dev -p ${z.devPort}`,
      build: "next build",
      start: "next start",
    },
  }, null, 2) + "\n";
}

/**
 * Thin re-export wrapper — the zone's app/page.tsx.
 * All real content lives in src/zones/{key}/Page.tsx (core).
 * Edit that file instead of this one.
 */
function genPageTsx(z: DerivedZone): string {
  return `// zones/${z.key}/src/app/page.tsx
// ─── AUTO-GENERATED — do not edit ────────────────────────────────────────────
// Zone content lives in  src/zones/${z.key}/Page.tsx  (core).
// That file is included in the build via src/ COPY in the Dockerfile and
// resolves as  @/zones/${z.key}/Page  inside the zone's Next.js app.
//
// To change what this zone displays, edit:
//   src/zones/${z.key}/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
export { default, metadata } from "@/zones/${z.key}/Page";
`;
}

/**
 * Core page component — the actual zone content.
 * Read from the rich template (with placeholder substitution), or fall back
 * to a minimal starter if the template file is missing.
 */
function genDsSection(z: DerivedZone): string {
  if (z.dynamicSections.length === 0) return "";

  const links = z.dynamicSections
    .map((ds) => {
      // Derive a clean href: strip dynamic segments from the route path
      const href = "/" + ds.routePath.split("/").filter((s) => !s.startsWith("[")).join("/");
      return `      <Link href="${href}" className="group flex flex-col gap-2 rounded-lg border border-stroke bg-white p-5 transition hover:border-primary hover:shadow-md dark:border-dark-3 dark:bg-dark">
        <p className="font-semibold text-black transition group-hover:text-primary dark:text-white">${ds.label}</p>
        <p className="text-sm text-body-color">${ds.desc}</p>
      </Link>`;
    })
    .join("\n");

  return `
      {/* ── Dynamic sections ────────────────────────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="container">
          <h2 className="mb-8 text-2xl font-bold text-black dark:text-white">Sections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
${links}
          </div>
        </div>
      </section>`;
}

function genCorePageModule(z: DerivedZone): string {
  const dsSection = genDsSection(z);
  const templatePath = join(
    PROJECT_DIR, "src", "ink", "templates", "zone", "src", "app", "page.tsx"
  );
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, "utf-8")
      .replace(/__ZONE_KEY__/g,        z.key)
      .replace(/__ZONE_LABEL__/g,      z.label)
      .replace(/__ZONE_PASCAL__/g,     z.label.replace(/\s+/g, ""))
      .replace(/__ZONE_DOMAIN__/g,     z.domain)
      .replace(/__ZONE_DS_SECTION__/g, dsSection);
  }
  // Minimal fallback
  const pascal = z.label.replace(/\s+/g, "");
  return `// src/zones/${z.key}/Page.tsx
// ${z.label} zone — ${z.domain}
// Edit this file to change the zone's page content.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "${z.label} | Unenter",
  description: "Welcome to the ${z.label} zone.",
};

export default function ${pascal}Page() {
  return (
    <main className="py-16 md:py-20 lg:py-28">
      <div className="container">
        <h1 className="text-3xl font-bold">${z.label}</h1>
        <p className="mt-4 text-body-color">
          ${z.domain} is up and running.
        </p>
      </div>
    </main>
  );
}
`;
}

function genLayoutTsx(z: DerivedZone): string {
  return `// zones/${z.key}/src/app/layout.tsx
// Root layout for the ${z.key} zone (${z.domain}).

import type { Metadata, Viewport } from "next";
import { Titillium_Web }           from "next/font/google";
import type { ReactNode }          from "react";
import { cookies, headers }        from "next/headers";
import { Providers }               from "@/app/provider";
import ClientLayout                from "@/components/Layouts/ClientLayout";
import "./globals.css";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)",  color: "hsl(24, 40%, 25%)" },
  ],
};

export const metadata: Metadata = {
  title: {
    default:  "${z.label} | Unenter",
    template: "%s | ${z.label} – Unenter",
  },
  description: "Welcome to the ${z.label} zone.",
};

const VALID_LOCALES = ["en", "de"] as const;
type Locale = (typeof VALID_LOCALES)[number];
function isValidLocale(v: string | undefined | null): v is Locale {
  return VALID_LOCALES.includes(v as Locale);
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
  const rawLocale =
    headersList.get("X-Next-Locale") ??
    cookieStore.get("Next-Locale")?.value;
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : "en";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={titillium.className} suppressHydrationWarning>
        <Providers>
          <ClientLayout locale={locale}>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
`;
}

// ── Supabase zone registry ────────────────────────────────────────────────────
// Zone topology is stored in the `public.zones` table (not in source).
// These helpers INSERT / DELETE rows and bust the in-memory cache so the TUI
// reflects changes immediately without a restart.

async function insertZoneToDb(z: DerivedZone, onLine: OnLine): Promise<void> {
  // Append after the current highest sort_order
  const maxRes = await fetch(
    `${KONG_URL}/rest/v1/zones?select=sort_order&order=sort_order.desc&limit=1`,
    { headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY } }
  );
  const maxRows = (await maxRes.json()) as Array<{ sort_order: number }>;
  const sortOrder = (maxRows[0]?.sort_order ?? -1) + 1;

  const payload = {
    key:              z.key,
    label:            z.label,
    domain:           z.domain,
    service:          z.service,
    container:        z.container,
    image:            z.image,
    dockerfile:       z.dockerfile,
    upstream_env_key: z.upstreamEnvKey,
    sort_order:       sortOrder,
    enabled:          true,
  };

  const res = await fetch(`${KONG_URL}/rest/v1/zones`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey":        SERVICE_KEY,
      "Content-Type":  "application/json",
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    onLine(`✗ Failed to register zone in DB (${res.status}): ${body}`);
    throw new Error(`DB insert failed: ${res.status}`);
  }

  invalidateZoneCache();
  onLine(`✓ Registered in Supabase zones table`);
}

async function deleteZoneFromDb(key: string, onLine: OnLine): Promise<void> {
  const res = await fetch(
    `${KONG_URL}/rest/v1/zones?key=eq.${encodeURIComponent(key)}`,
    {
      method:  "DELETE",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey":        SERVICE_KEY,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    onLine(`⚠ Could not remove zone from DB (${res.status}): ${body}`);
    return;
  }

  invalidateZoneCache();
  onLine(`✓ Removed from Supabase zones table`);
}

// ── routeClassifier.ts patcher ────────────────────────────────────────────────

function genRouteOverride(z: DerivedZone): string {
  const { key, label, layoutType } = z;
  const dashes = "─".repeat(Math.max(0, 52 - label.length));

  let returnBody: string;

  if (layoutType === "landing") {
    returnBody =
      `    return {\n` +
      `      isHome:             cleanPathname === "/",\n` +
      `      isToolsPage:        false,\n` +
      `      isDashboardPage:    false,\n` +
      `      isProductsPage:     false,\n` +
      `      isCollectionsPage:  false,\n` +
      `      isPagesRoute:       false,\n` +
      `      isCheckoutRoute:    false,\n` +
      `      isProfileMeRoute:   false,\n` +
      `      isAuthPage:         false,\n` +
      `      isCategoryPage:     false,\n` +
      `      isShopRoute:        false,\n` +
      `      useAppHeader:       false,\n` +
      `      isLocalePage,\n` +
      `      isLandingPage:      true,\n` +
      `    };\n`;
  } else if (layoutType === "shop") {
    returnBody =
      `    return {\n` +
      `      isHome:             cleanPathname === "/",\n` +
      `      isToolsPage:        false,\n` +
      `      isDashboardPage:    false,\n` +
      `      isProductsPage:     false,\n` +
      `      isCollectionsPage:  false,\n` +
      `      isPagesRoute:       false,\n` +
      `      isCheckoutRoute:    false,\n` +
      `      isProfileMeRoute:   false,\n` +
      `      isAuthPage,\n` +
      `      isCategoryPage:     false,\n` +
      `      isShopRoute:        true,\n` +
      `      useAppHeader:       false,\n` +
      `      isLocalePage,\n` +
      `      isLandingPage:      false,\n` +
      `    };\n`;
  } else if (layoutType === "dashboard") {
    returnBody =
      `    return {\n` +
      `      isHome:             false,\n` +
      `      isToolsPage:        false,\n` +
      `      isDashboardPage:    true,\n` +
      `      isProductsPage:     false,\n` +
      `      isCollectionsPage:  false,\n` +
      `      isPagesRoute:       false,\n` +
      `      isCheckoutRoute:    false,\n` +
      `      isProfileMeRoute:   false,\n` +
      `      isAuthPage:         false,\n` +
      `      isCategoryPage:     false,\n` +
      `      isShopRoute:        false,\n` +
      `      useAppHeader:       false,\n` +
      `      isLocalePage,\n` +
      `      isLandingPage:      false,\n` +
      `    };\n`;
  } else if (layoutType === "app") {
    // AppHeader rendered inside ShopLayout (useAppHeader + isShopRoute)
    returnBody =
      `    return {\n` +
      `      isHome:             cleanPathname === "/",\n` +
      `      isToolsPage:        false,\n` +
      `      isDashboardPage:    false,\n` +
      `      isProductsPage:     false,\n` +
      `      isCollectionsPage:  false,\n` +
      `      isPagesRoute:       false,\n` +
      `      isCheckoutRoute:    false,\n` +
      `      isProfileMeRoute:   false,\n` +
      `      isAuthPage,\n` +
      `      isCategoryPage:     false,\n` +
      `      isShopRoute:        true,\n` +
      `      useAppHeader:       true,\n` +
      `      isLocalePage,\n` +
      `      isLandingPage:      false,\n` +
      `    };\n`;
  } else {
    // minimal — bare canvas (no header/footer)
    returnBody =
      `    return {\n` +
      `      isHome:             cleanPathname === "/",\n` +
      `      isToolsPage:        false,\n` +
      `      isDashboardPage:    false,\n` +
      `      isProductsPage:     false,\n` +
      `      isCollectionsPage:  false,\n` +
      `      isPagesRoute:       false,\n` +
      `      isCheckoutRoute:    false,\n` +
      `      isProfileMeRoute:   false,\n` +
      `      isAuthPage:         true,\n` +
      `      isCategoryPage:     false,\n` +
      `      isShopRoute:        false,\n` +
      `      useAppHeader:       false,\n` +
      `      isLocalePage,\n` +
      `      isLandingPage:      false,\n` +
      `    };\n`;
  }

  return (
    `\n  // ── ${label} zone override ${dashes}\n` +
    `  // NEXT_PUBLIC_ZONE=${key} — layout: ${layoutType}\n` +
    `  if (process.env.NEXT_PUBLIC_ZONE === "${key}" && !isAuthPage) {\n` +
    returnBody +
    `  }\n`
  );
}

async function patchRouteClassifier(z: DerivedZone, onLine: OnLine): Promise<void> {
  const classifierPath = join(
    PROJECT_DIR, "src", "components", "Layouts", "routeClassifier.ts"
  );

  if (!existsSync(classifierPath)) {
    onLine(`⚠ routeClassifier.ts not found — skipping layout patch`);
    return;
  }

  const content = readFileSync(classifierPath, "utf-8");

  if (content.includes(`NEXT_PUBLIC_ZONE === "${z.key}"`)) {
    onLine(`⚠ routeClassifier.ts already has an override for "${z.key}" — skipping`);
    return;
  }

  const marker = "  const isCategoryPage =";
  const idx    = content.indexOf(marker);
  if (idx === -1) {
    onLine(`⚠ Could not locate insertion point in routeClassifier.ts — skipping`);
    return;
  }

  const newContent =
    content.slice(0, idx) +
    genRouteOverride(z) +
    content.slice(idx);

  await writeFileAtomic(classifierPath, newContent);
  onLine(`✓ Layout override (${z.layoutType}) added to routeClassifier.ts`);
}

async function removeFromRouteClassifier(key: string, onLine: OnLine): Promise<void> {
  const classifierPath = join(
    PROJECT_DIR, "src", "components", "Layouts", "routeClassifier.ts"
  );

  if (!existsSync(classifierPath)) { onLine(`⚠ routeClassifier.ts not found — skipping`); return; }

  const content = readFileSync(classifierPath, "utf-8");

  if (!content.includes(`NEXT_PUBLIC_ZONE === "${key}"`)) {
    onLine(`⚠ No override for "${key}" in routeClassifier.ts — skipping`);
    return;
  }

  // Match: \n  // ── {anything}\n  // NEXT_PUBLIC_ZONE={key}{anything}\n  if ...{ ... }\n
  // The closing  }\n  has exactly 2-space indent (the if-block close), which
  // differs from the 4-space indent of the return body's closing };\n
  const overrideRegex = new RegExp(
    `\\n  // ──[^\\n]+\\n  // NEXT_PUBLIC_ZONE=${key}[^\\n]*\\n  if [\\s\\S]*?\\n  \\}\\n`
  );

  const newContent = content.replace(overrideRegex, "\n");

  if (newContent === content) {
    onLine(`⚠ Could not remove override for "${key}" — remove it manually`);
    return;
  }
  await writeFileAtomic(classifierPath, newContent);
  onLine(`✓ Layout override removed from routeClassifier.ts`);
}

// ── docker-compose.yml patcher ───────────────────────────────────────────────

function genComposeService(z: DerivedZone): string {
  return `
  ${z.service}:
    # image: the GHCR-published tag this zone builds to.  Without this line,
    # 'docker compose pull' is a no-op ("Skipped No image to be pulled") and
    # 'docker compose up' falls back to '{project}-{service}:latest' (e.g.
    # 'webbymk2-${z.key}:latest') which is NOT what our TUI build produces —
    # the TUI tags builds as ${z.image}.  Missing this line was the exact
    # cause of "No such image: webbymk2-${z.key}:latest" on first deploy.
    image: ${z.image}
    build:
      context: .
      dockerfile: zones/${z.key}/Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL:
        NEXT_PUBLIC_SUPABASE_URL_BROWSER:
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
        NEXT_PUBLIC_APP_TITLE:
        NEXT_PUBLIC_COMPANY_NAME:
        NEXT_PUBLIC_OWNER_USERNAME:
        NEXT_PUBLIC_OWNER_EMAIL:
    container_name: ${z.container}
    restart: unless-stopped
    env_file: .env
    environment:
      NEXT_PUBLIC_ZONE: "${z.key}"
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"require('http').get('http://localhost:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))\\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s
    depends_on:
      db:
        condition: service_healthy
      kong:
        condition: service_started
    networks:
      - unenter
`;
}

async function patchDockerCompose(z: DerivedZone, onLine: OnLine): Promise<void> {
  const composePath = join(PROJECT_DIR, "docker-compose.yml");

  if (!existsSync(composePath)) {
    onLine(`⚠ docker-compose.yml not found — skipping`);
    return;
  }

  let content = readFileSync(composePath, "utf-8");

  // Guard: already patched
  if (content.includes(`container_name: ${z.container}`)) {
    onLine(`⚠ docker-compose.yml already has service for "${z.key}" — skipping`);
    return;
  }

  // 1. Add service block — append after the last zone service.
  //    We look for the last "      - unenter" line (each service's network attachment)
  //    and insert after it.  This avoids hitting the top-level `networks:` definition
  //    which appears at the TOP of the file (before `services:`), not the bottom.
  const networkAttach = "      - unenter";
  const attachIdx = content.lastIndexOf(networkAttach);
  if (attachIdx === -1) {
    // Fallback: just append at the very end
    content = content.trimEnd() + "\n" + genComposeService(z);
    onLine(`✓ Added compose service  "${z.service}"  (appended)`);
  } else {
    const insertAfter = attachIdx + networkAttach.length;
    content =
      content.slice(0, insertAfter) +
      genComposeService(z) +
      content.slice(insertAfter);
    onLine(`✓ Added compose service  "${z.service}"`);
  }

  // 2. Add UPSTREAM_ env var to proxy — insert after last non-comment UPSTREAM_ line
  const upstreamAnchor = `      UPSTREAM_AUTH:      "http://authzone:3000"`;
  if (content.includes(upstreamAnchor)) {
    const newLine = `\n      ${z.upstreamEnvKey}:  "http://${z.service}:3000"`;
    content = content.replace(upstreamAnchor, upstreamAnchor + newLine);
    onLine(`✓ Added ${z.upstreamEnvKey} to proxy environment`);
  } else {
    onLine(`⚠ Could not find UPSTREAM_AUTH anchor — add ${z.upstreamEnvKey}: "http://${z.service}:3000" to proxy env manually`);
  }

  // 3. Add zone to proxy depends_on — insert after last depends_on entry
  const depsAnchor = `      authzone:\n        condition: service_healthy`;
  if (content.includes(depsAnchor)) {
    const newDep = `\n      ${z.service}:\n        condition: service_healthy`;
    content = content.replace(depsAnchor, depsAnchor + newDep);
    onLine(`✓ Added "${z.service}" to proxy depends_on`);
  } else {
    onLine(`⚠ Could not find proxy depends_on anchor — add "${z.service}" manually`);
  }

  await writeFileAtomic(composePath, content);
}

// ── Main scaffolding entry point ──────────────────────────────────────────────

/**
 * Scaffold a new zone from either:
 *   • NewZoneParams   — port auto-detected via findNextDevPort()
 *   • DerivedZone     — already fully resolved (use this from the wizard so
 *                       the port shown in the confirm step matches what's used)
 */
// ── DS file generators ────────────────────────────────────────────────────────

/** 
 * Thin re-export wrappers — lives in zones/{key}/src/app/{ds.routePath}/*.tsx 
 * @returns Map of filename -> content
 */
function genDsWrappers(z: DerivedZone, ds: DynamicSection): Record<string, string> {
  const files: Record<string, string> = {};
  const coreBase = ds.hasCore ? `@/app/${ds.routePath}/page` : `@/zones/${z.key}/${ds.routePath}/Page`;

  // Main page
  files["page.tsx"] = `// zones/${z.key}/src/app/${ds.routePath}/page.tsx
// ─── AUTO-GENERATED — do not edit ────────────────────────────────────────────
export { default, generateMetadata, generateStaticParams } from "${coreBase}";
`;

  // If it's a core pass-through, we also need loading, error, and not-found wrappers
  if (ds.hasCore) {
    files["loading.tsx"] = `export { default } from "@/app/${ds.routePath}/loading";`;
    files["error.tsx"]   = `export { default } from "@/app/${ds.routePath}/error";`;
    files["not-found.tsx"] = `export { default } from "@/app/${ds.routePath}/not-found";`;
  }

  return files;
}

function toPascal(str: string): string {
  return str
    .replace(/[-/[\]]/g, " ")
    .replace(/\.{3}/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** Starter core module — lives in src/zones/{key}/{ds.routePath}/Page.tsx */
function genDsCorePageTsx(z: DerivedZone, ds: DynamicSection): string {
  if (ds.hasCore) {
    return `// src/zones/${z.key}/${ds.routePath}/Page.tsx
// Re-export core implementation by default.
// Edit this file if you want to override the core behavior for THIS zone.
export { default, generateMetadata, generateStaticParams } from "@/app/${ds.routePath}/page";
`;
  }

  const componentName = `${toPascal(ds.id)}Page`;

  if (!ds.param) {
    // Static route — no dynamic param
    return `// src/zones/${z.key}/${ds.routePath}/Page.tsx
// ${z.label} zone — ${ds.label}
// Edit this file to build out the ${ds.label.toLowerCase()} page.
// Import shared components from @/components/ (src/app/ is not available in zone builds).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "${ds.label} | ${z.label}",
};

export default function ${componentName}() {
  return (
    <main className="py-16 md:py-20 lg:py-28">
      <div className="container">
        <h1 className="text-3xl font-bold">${ds.label}</h1>
        <p className="mt-4 text-body-color text-sm">
          Wire up your components in{" "}
          <code>src/zones/${z.key}/${ds.routePath}/Page.tsx</code>
        </p>
      </div>
    </main>
  );
}
`;
  }

  // Dynamic route with param(s)
  const isCatchAll = ds.param.startsWith("...");
  const paramName  = isCatchAll ? ds.param.slice(3) : ds.param;
  const paramsType = isCatchAll ? `{ ${paramName}: string[] }` : `{ ${paramName}: string }`;
  const valueExpr  = isCatchAll ? `${paramName}.join("/")` : paramName;

  return `// src/zones/${z.key}/${ds.routePath}/Page.tsx
// ${z.label} zone — ${ds.label}
// Edit this file to build out the ${ds.label.toLowerCase()} page.
// Import shared components from @/components/ (src/app/ is not available in zone builds).

import type { Metadata } from "next";
import { notFound }      from "next/navigation";

interface PageProps {
  params: Promise<${paramsType}>;
}

export async function generateStaticParams() {
  // TODO: query Supabase and return all valid param values.
  // import { createServerClient as createSupabaseClient } from "@supabase/ssr";
  // const supabase = createSupabaseClient(url, key, { cookies: { getAll: () => [], setAll: () => {} } });
  // const { data } = await supabase.from("...").select("${paramName}");
  // return data?.map((r) => ({ ${paramName}: r.${paramName} })) ?? [];
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ${paramName} } = await params;
  const display = ${valueExpr};
  return { title: \`${ds.label}: \${display} | ${z.label}\` };
}

export default async function ${componentName}({ params }: PageProps) {
  const { ${paramName} } = await params;

  // TODO: fetch data from Supabase and render your component.
  // import { createServerClient } from "@/utils/supabase/server";
  // const supabase = await createServerClient();
  // const { data } = await supabase.from("...").select("*").eq("${paramName}", ${valueExpr}).single();
  // if (!data) notFound();

  return (
    <main className="py-16 md:py-20 lg:py-28">
      <div className="container">
        <h1 className="text-3xl font-bold">${ds.label}</h1>
        <p className="mt-2 text-body-color">
          <code>{${valueExpr}}</code>
        </p>
        <p className="mt-4 text-body-color text-sm">
          Wire up your components in{" "}
          <code>src/zones/${z.key}/${ds.routePath}/Page.tsx</code>
        </p>
      </div>
    </main>
  );
}
`;
}


export async function scaffoldZone(
  params: NewZoneParams | DerivedZone,
  onLine: OnLine
): Promise<{ zone: DerivedZone; exitCode: number }> {
  const z: DerivedZone = "domain" in params
    ? params
    : deriveZone(params, await findNextDevPort());

  const zoneDir         = join(PROJECT_DIR, "zones", z.key);
  const appDir          = join(zoneDir, "src", "app");
  const coreZonesDir    = join(PROJECT_DIR, "src", "zones", z.key);
  const templateGlobals = join(PROJECT_DIR, "src", "ink", "templates", "zone", "src", "app", "globals.css");
  const blogGlobals     = join(PROJECT_DIR, "zones", "blog", "src", "app", "globals.css");

  onLine(`Zone     →  ${z.key}  (${z.label})`);
  onLine(`Domain   →  ${z.domain}`);
  onLine(`Layout   →  ${z.layoutType}`);
  onLine(`Dev port →  :${z.devPort}`);
  onLine("");

  // ── Guard: already exists ──────────────────────────────────────────────────
  if (await pathExists(zoneDir)) {
    onLine(`✗ zones/${z.key}/ already exists — choose a different key`);
    return { zone: z, exitCode: 1 };
  }

  // ── Create directory tree ──────────────────────────────────────────────────
  onLine(`Creating zones/${z.key}/...`);
  await mkdir(appDir,          { recursive: true });
  await mkdir(coreZonesDir,    { recursive: true });
  onLine(`✓ zones/${z.key}/src/app/`);
  onLine(`✓ src/zones/${z.key}/`);

  // ── Write core page module (src/zones/{key}/Page.tsx) ─────────────────────
  await writeFileAtomic(join(coreZonesDir, "Page.tsx"), genCorePageModule(z));
  const usingTemplate = existsSync(
    join(PROJECT_DIR, "src", "ink", "templates", "zone", "src", "app", "page.tsx")
  );
  onLine(`✓ src/zones/${z.key}/Page.tsx  ${usingTemplate ? "(from template)" : "(minimal fallback)"}`);

  // ── Write zone files ───────────────────────────────────────────────────────
  await writeFileAtomic(join(zoneDir, "Dockerfile"),   genDockerfile(z));
  onLine(`✓ Dockerfile`);

  await writeFileAtomic(join(zoneDir, "package.json"), genPackageJson(z));
  onLine(`✓ package.json  (dev port :${z.devPort})`);

  await writeFileAtomic(join(appDir, "page.tsx"),      genPageTsx(z));
  onLine(`✓ zones/${z.key}/src/app/page.tsx  (re-export wrapper)`);

  await writeFileAtomic(join(appDir, "layout.tsx"),    genLayoutTsx(z));
  onLine(`✓ zones/${z.key}/src/app/layout.tsx`);

  // ── globals.css — prefer template, fall back to blog, then minimal ─────────
  if (existsSync(templateGlobals)) {
    await copyFile(templateGlobals, join(appDir, "globals.css"));
    onLine(`✓ src/app/globals.css  (from template)`);
  } else if (existsSync(blogGlobals)) {
    await copyFile(blogGlobals, join(appDir, "globals.css"));
    onLine(`✓ src/app/globals.css  (copied from zones/blog/)`);
  } else {
    await writeFileAtomic(join(appDir, "globals.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
    onLine(`✓ src/app/globals.css  (minimal fallback)`);
  }

  onLine("");


  // ── Dynamic sections (DS) ──────────────────────────────────────────────────
  if (z.dynamicSections.length > 0) {
    onLine(`Creating ${z.dynamicSections.length} dynamic route section(s)...`);
    for (const ds of z.dynamicSections) {
      // routePath e.g. "products/[slug]" → zone wrapper dir + core dir
      const wrapperDir = join(appDir,       ds.routePath);  // zones/{key}/src/app/products/[slug]
      const coreDir    = join(coreZonesDir, ds.routePath);  // src/zones/{key}/products/[slug]
      await mkdir(wrapperDir, { recursive: true });
      await mkdir(coreDir,    { recursive: true });

      // Generate wrappers (page.tsx, and potentially loading/error/not-found)
      const wrappers = genDsWrappers(z, ds);
      for (const [filename, content] of Object.entries(wrappers)) {
        await writeFileAtomic(join(wrapperDir, filename), content);
      }

      // Generate core starter (src/zones/{key}/.../Page.tsx)
      await writeFileAtomic(join(coreDir,    "Page.tsx"), genDsCorePageTsx(z, ds));

      onLine(`✓ DS: ${ds.routePath}  (wrappers + core re-export)`);
    }
    onLine("");
  }

    // ── Register in Supabase zones table ───────────────────────────────────────
  await insertZoneToDb(z, onLine);

  // ── Patch routeClassifier.ts ───────────────────────────────────────────────
  await patchRouteClassifier(z, onLine);

  // ── Patch docker-compose.yml ────────────────────────────────────────────────
  await patchDockerCompose(z, onLine);

  onLine("");
  onLine(`✓ Zone "${z.key}" scaffolded — pipeline will build, deploy, and cert automatically`);

  return { zone: z, exitCode: 0 };
}

// ── Zone deletion ─────────────────────────────────────────────────────────────

// ── docker-compose.yml remover ───────────────────────────────────────────────

async function removeFromDockerCompose(key: string, onLine: OnLine): Promise<void> {
  const composePath = join(PROJECT_DIR, "docker-compose.yml");
  if (!existsSync(composePath)) { onLine(`⚠ docker-compose.yml not found — skipping`); return; }

  let content = readFileSync(composePath, "utf-8");
  let changed  = false;

  // 1. Remove the service block.
  //    Matches: blank line + "  {key}:\n" + all lines until (and including)
  //    the next "      - unenter\n" (the service's network attachment).
  //    We use a non-greedy match bounded by the network line so we never
  //    accidentally consume a following service.
  const serviceRegex = new RegExp(
    `\\n  ${key}:\\n` +
    `(?:(?!\\n  [a-zA-Z]).|\\n)*?` +   // any content that doesn't start a new top-level service
    `      - unenter\\n`,
    "s"
  );
  const withoutService = content.replace(serviceRegex, "\n");
  if (withoutService !== content) {
    content = withoutService;
    onLine(`✓ Removed service block  "${key}"  from docker-compose.yml`);
    changed = true;
  } else {
    onLine(`⚠ Service block for "${key}" not found in docker-compose.yml — skipping`);
  }

  // 2. Remove UPSTREAM_{KEY}: line from proxy environment.
  const upstreamKey  = `UPSTREAM_${key.toUpperCase()}`;
  const upstreamLine = new RegExp(`      ${upstreamKey}:[^\\n]+\\n`);
  const withoutUp    = content.replace(upstreamLine, "");
  if (withoutUp !== content) {
    content = withoutUp;
    onLine(`✓ Removed ${upstreamKey} from proxy environment`);
    changed = true;
  } else {
    onLine(`⚠ ${upstreamKey} not found in proxy environment — skipping`);
  }

  // 3. Remove depends_on entry from proxy service.
  const depsLine = new RegExp(`      ${key}:\\n        condition: service_healthy\\n`);
  const withoutDeps = content.replace(depsLine, "");
  if (withoutDeps !== content) {
    content = withoutDeps;
    onLine(`✓ Removed "${key}" from proxy depends_on`);
    changed = true;
  } else {
    onLine(`⚠ "${key}" not found in proxy depends_on — skipping`);
  }

  if (changed) {
    await writeFileAtomic(composePath, content);
  }
}

/**
 * Delete a zone entirely:
 *   • Remove zones/{key}/
 *   • Remove src/zones/{key}/   (core page module)
 *   • Remove entry from src/config/zones.ts
 *   • Remove override from routeClassifier.ts
 *   • Remove service block + UPSTREAM_* + depends_on from docker-compose.yml
 *   • Remove NPM proxy host (best-effort; logs and continues on failure)
 */
export async function deleteZone(
  key: string,
  onLine: OnLine
): Promise<{ exitCode: number }> {
  onLine(`Deleting zone: ${key}`);
  onLine("");

  const zoneDir = join(PROJECT_DIR, "zones", key);
  const coreDir = join(PROJECT_DIR, "src", "zones", key);

  // 1. Remove zones/{key}/
  if (await pathExists(zoneDir)) {
    await rm(zoneDir, { recursive: true, force: true });
    onLine(`✓ Removed zones/${key}/`);
  } else {
    onLine(`⚠ zones/${key}/ not found — skipping`);
  }

  // 2. Remove src/zones/{key}/
  if (await pathExists(coreDir)) {
    await rm(coreDir, { recursive: true, force: true });
    onLine(`✓ Removed src/zones/${key}/`);
  } else {
    onLine(`⚠ src/zones/${key}/ not found — skipping`);
  }

  onLine("");

  // 3. Remove from Supabase zones table
  await deleteZoneFromDb(key, onLine);

  // 4. Remove from routeClassifier.ts
  await removeFromRouteClassifier(key, onLine);

  // 5. Remove from docker-compose.yml
  await removeFromDockerCompose(key, onLine);

  // 6. Remove NPM proxy host (best-effort).
  //    If NPM is unreachable or no matching host exists, log and continue —
  //    filesystem removal has already succeeded and the zone is effectively
  //    gone from the app.  Orphan proxy hosts are easy to clean up later
  //    and NOT removing them on delete was the #1 footgun (stale Let's Encrypt
  //    cert matching the newly re-created host, blocking re-creation).
  onLine("");
  await deleteZoneNpmHost(key, onLine);

  onLine("");
  onLine(`✓ Zone "${key}" deleted`);

  return { exitCode: 0 };
}

/**
 * Best-effort removal of the NPM proxy host for a deleted zone.
 *
 * This step is wrapped so any NPM-side failure (NPM offline, creds missing,
 * host already gone, transient 5xx) never blocks deleting the zone.  The
 * caller gets a clear message either way.
 */
async function deleteZoneNpmHost(key: string, onLine: OnLine): Promise<void> {
  const domain = `${key}.${DOMAIN || "unenter.live"}`;
  onLine(`Removing NPM proxy host for ${domain}...`);

  let token: string;
  try {
    token = await npmGetToken();
  } catch (e) {
    onLine(`⚠ NPM auth failed — skipping proxy-host cleanup (${String(e)})`);
    onLine(`  You may need to remove ${domain} manually in the NPM UI.`);
    return;
  }

  let host;
  try {
    host = await npmFindHost(domain, token);
  } catch (e) {
    onLine(`⚠ NPM lookup failed — skipping proxy-host cleanup (${String(e)})`);
    return;
  }

  if (!host) {
    onLine(`✓ No NPM proxy host for ${domain} — nothing to remove`);
    return;
  }

  try {
    await npmDeleteHost(host.id, token);
    onLine(`✓ Removed NPM proxy host #${host.id} (${domain})`);
  } catch (e) {
    onLine(`⚠ NPM delete failed (${String(e)})`);
    onLine(`  Remove host #${host.id} manually in the NPM UI.`);
  }
}
