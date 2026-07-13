// src/ink/zone-templates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Template factory for the zone scaffolding engine.
//
// Template model
// ─────────────────────────────────────────────────────────────────────────────
//  base page        genCorePageModule()   — src/zones/{key}/Page.tsx
//                   Routed by layoutType; each variant has its own template
//                   file under src/ink/templates/zone/pages/{type}.tsx.
//
//  layout shell     genLayoutTsx()        — zones/{key}/src/app/layout.tsx
//                   Identical for all layout types: Providers → ClientLayout →
//                   children.  The visual shell (header/footer) is chosen at
//                   build time by the routeClassifier override in routeClassifier.ts.
//
//  wrapper (thin)   genPageTsx()          — zones/{key}/src/app/page.tsx
//  wrapper (DS)     genDsWrappers()       — zones/{key}/src/app/{route}/page.tsx
//                   Always thin re-exports; real content lives in src/zones/{key}/.
//
//  route starters   genDsCorePageTsx()    — src/zones/{key}/{route}/Page.tsx
//                   One starter per dynamic section, layout-agnostic.
//
// Template selection
// ─────────────────────────────────────────────────────────────────────────────
//  landing    → templates/zone/pages/landing.tsx   (landing_sections + fallback hero)
//  shop       → templates/zone/pages/shop.tsx      (shop home starter)
//  dashboard  → templates/zone/pages/dashboard.tsx (dashboard home starter)
//  app        → templates/zone/pages/app.tsx       (app-shell starter)
//  minimal    → templates/zone/pages/minimal.tsx   (bare canvas starter)
//
// The fallback (no template file found) is an inline minimal page — never the
// landing_sections template.  Landing is now an explicit opt-in, not a default.
// ─────────────────────────────────────────────────────────────────────────────

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { PROJECT_DIR } from "../config/stack.js";
import type { DerivedZone, DynamicSection } from "./zone/types.ts";
import type { Zone } from "../config/zones.ts";


function genDsSection(z: DerivedZone): string {
  if (z.dynamicSections.length === 0) return "";

  const links = z.dynamicSections
    .map((ds) => {
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

function toPascal(str: string): string {
  return str
    .replace(/[-/[\]]/g, " ")
    .replace(/\.{3}/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function genDockerfile(z: DerivedZone): string {
  // Layout-aware core directory list.
  // shop    → include [categorySlug], products, collections, checkout (all hasCore:true)
  // landing → api/actions/_components/pages only — NO [categorySlug]!
  //           Landing zones use [slug] for posts; copying [categorySlug] would cause
  //           Next.js to crash: "different slug names for the same dynamic path"
  // app / minimal → api/actions/_components only (no e-commerce routes)
  const coreDirs =
    z.layoutType === "shop"
      ? "api actions _components providers [categorySlug] products collections checkout pages"
      : z.layoutType === "landing"
      ? "api actions _components providers pages"
      : "api actions _components providers";

  return `# zones/${z.key}/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# ${z.label} zone  ·  ${z.domain}
#
# Build context: project root.  This image packages your zone as a standalone
# Next.js app that still inherits the shared Unenter brand.  The build plays
# out in three short stages — deps install, build (with overlay), final
# runner — and the overlay step is how a zone gets its own pages while still
# speaking the same theme, providers, and globals as core.
#
# HOW THE OVERLAY WORKS
# ─────────────────────
#   1. Start with the whole repo's  src/  tree.
#   2. Stash the pieces every zone needs to share with core:
#        • essential routes (api, actions, providers, layout-specific dirs)
#        • provider.tsx  — Providers context (auth/session/theme/roles)
#        • globals.css   — @imports layout-tokens.css so --gp-* / --lt-*
#                          theme tokens resolve for AppHeader / ShopFooter
#   3. Empty  src/app/  and lay the stashed core files back down.
#   4. Overlay  zones/${z.key}/src/app/  on top — your zone's layout.tsx and
#      route pages win.
#   5. Restore core's globals.css so theme tokens are guaranteed to resolve
#      inside the shared header + footer.
#
# Edit this file freely if your zone needs extra build-time files (custom
# next.config, additional public assets, env vars) — it's your zone.
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
COPY middleware.ts ./
COPY src/ ./src/
COPY public/ ./public/

# Stash the core pieces every branded zone needs, then lay them back down on
# top of the zone overlay.  The directory list is LAYOUT-AWARE so each layout
# type only inherits the core routes it can actually use without route-shape
# conflicts (Next.js rejects multiple slug names for the same dynamic path):
#   shop    → api actions _components providers [categorySlug] products collections checkout pages
#   landing → api actions _components providers pages           (no shop dynamic segments)
#   app     → api actions _components providers                 (pure web app, no e-commerce routes)
#   minimal → api actions _components providers                 (bare canvas)
RUN mkdir -p /tmp/core-app && \\
    for dir in ${coreDirs}; do \\
      if [ -d "src/app/$dir" ]; then cp -r "src/app/$dir" /tmp/core-app/; fi; \\
    done && \\
    if [ -f src/app/provider.tsx ]; then cp src/app/provider.tsx /tmp/core-app/; fi && \\
    if [ -f src/app/globals.css ]; then cp src/app/globals.css /tmp/core-app/; fi && \\
    rm -rf src/app && \\
    mkdir -p src/app && \\
    cp -r /tmp/core-app/* src/app/

# Zone overlay — anything you add under  zones/${z.key}/src/app/  (pages,
# layouts, loading.tsx, error boundaries, route groups) gets picked up
# automatically.  This is how your zone ships its own pages on top of the
# shared shell.
COPY zones/${z.key}/src/app/ ./src/app/

# Always use core's globals.css so shared theme tokens resolve inside the
# branded header + footer.  Core's globals.css @imports layout-tokens.css,
# which is what sets up the --gp-* / --lt-* variables AppHeader / ShopFooter
# rely on.  If a zone later wants to customize global CSS, extend core's
# file via @import rather than replacing it.
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

RUN addgroup --system --gid 1001 nodejs && \
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

export function genPackageJson(z: DerivedZone): string {
  return JSON.stringify({
    name: `@unenter/${z.key}`,
    version: "0.0.0",
    private: true,
    scripts: {
      dev: `next dev -p ${z.devPort}`,
      build: "next build",
      start: "next start",
    },
  }, null, 2) + "\n";
}

export function genPageTsx(z: DerivedZone): string {
  return `// zones/${z.key}/src/app/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// ${z.label} zone · ${z.domain} · entry wrapper
//
// This is a thin re-export so Next.js App Router can pick up the route — the
// real page content lives in the core tree so it can freely import the shared
// Unenter components, theme tokens, and utilities:
//
//   → src/zones/${z.key}/Page.tsx     ← start building here
//
// You can leave this wrapper untouched for most projects.  Editing or
// re-generating it is fine — it's your zone.
// ─────────────────────────────────────────────────────────────────────────────
export { default, metadata } from "@/zones/${z.key}/Page";
`;
}

// ── Template token substitution ───────────────────────────────────────────────

function applyTokens(src: string, z: DerivedZone): string {
  return src
    .replace(/__ZONE_KEY__/g,    z.key)
    .replace(/__ZONE_LABEL__/g,  z.label)
    .replace(/__ZONE_PASCAL__/g, z.label.replace(/\s+/g, ""))
    .replace(/__ZONE_DOMAIN__/g, z.domain)
    .replace(/__ZONE_DS_SECTION__/g, genDsSection(z));
}

// ── Core page module — routes by layoutType ───────────────────────────────────

/**
 * Generates src/zones/{key}/Page.tsx — the editable zone root page.
 *
 * All layout types share one unified starter (zone-starter.tsx).
 * The layout SHELL (header, footer, sidebar, overlays) is controlled entirely
 * by the routeClassifier.ts override — the page content is layout-agnostic.
 * Zones inherit the core's CSS and theme system; no per-zone globals.css needed.
 */
export function genCorePageModule(z: DerivedZone): string {
  const starterTmpl = join(
    PROJECT_DIR, "src", "ink", "templates", "zone", "pages", "zone-starter.tsx"
  );

  if (existsSync(starterTmpl)) {
    return applyTokens(readFileSync(starterTmpl, "utf-8"), z);
  }

  // Hard fallback — zone-starter.tsx missing from install
  const pascal = z.label.replace(/\s+/g, "");
  return `// src/zones/${z.key}/Page.tsx\n` +
    `// ${z.label} zone — ${z.domain}\n` +
    `// Edit this file to build out this zone's root page.\n\n` +
    `import type { Metadata } from "next";\n\n` +
    `export const metadata: Metadata = {\n` +
    `  title:       "${z.label} | Unenter",\n` +
    `  description: "${z.label} — ${z.domain}",\n` +
    `};\n\n` +
    `export default function ${pascal}Page() {\n` +
    `  return (\n` +
    `    <main className="py-16 md:py-20 lg:py-28">\n` +
    `      <div className="container">\n` +
    `        <h1 className="text-3xl font-bold">${z.label}</h1>\n` +
    `        <p className="mt-4 text-body-color">${z.domain} is live.</p>\n` +
    `      </div>\n` +
    `    </main>\n` +
    `  );\n` +
    `}\n`;
}

export function genLayoutTsx(z: DerivedZone): string {
  return `// zones/${z.key}/src/app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// ${z.label} zone  ·  ${z.domain}
//
// Root layout for your new Unenter zone.  This file is your app shell — it
// wires everything a branded Unenter app needs so your pages render correctly
// from the first deploy:
//
//   • <Providers>     — theme system, auth/session, role context, fonts
//   • <ClientLayout>  — the ${z.layoutType} header + footer selected in the wizard,
//                       resolved at runtime via routeClassifier.ts
//   • globals.css     — design tokens (--gp-* / --lt-*) shared with core
//   • locale handling — reads the locale cookie / header set by middleware
//
// You can keep this file as-is; anything you build under  src/zones/${z.key}/
// (or import from elsewhere) renders automatically inside the branded shell.
// Tweak metadata, viewport, or the font here when you want to diverge from
// the defaults — this is your zone's top-level entry point.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Providers } from "@/app/provider";
import ClientLayout from "@/components/Layouts/ClientLayout";
import { generateSiteMetadata } from "@/lib/zoneMetadata";
import "./globals.css";

const titillium = Titillium_Web({ subsets: ["latin"], weight: ["400", "700"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "hsl(28, 25%, 65%)" },
    { media: "(prefers-color-scheme: dark)", color: "hsl(24, 40%, 25%)" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  return generateSiteMetadata();
}

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

export function genZoneConfig(z: DerivedZone): string {
  const sections = z.dynamicSections
    .map((ds) => `  {
    id: ${JSON.stringify(ds.id)},
    routePath: ${JSON.stringify(ds.routePath)},
    param: ${ds.param === null ? "null" : JSON.stringify(ds.param)},
    label: ${JSON.stringify(ds.label)},
    desc: ${JSON.stringify(ds.desc)},
    defaultOn: ${ds.defaultOn},
    hasCore: ${ds.hasCore === true},
  }`)
    .join(",\n");

  return `// zones/${z.key}/src/app/zone.config.ts
// Generated by UNAXIS — sourced from the zone wizard.  Re-running the wizard
// will regenerate this file, so prefer the wizard for changes; quick local
// tweaks are fine, just expect them to be overwritten next time.

const zoneConfig = {
  key: ${JSON.stringify(z.key)},
  label: ${JSON.stringify(z.label)},
  domain: ${JSON.stringify(z.domain)},
  layoutType: ${JSON.stringify(z.layoutType)},
  dynamicSections: [
${sections}
  ],
} as const;

export default zoneConfig;
export { zoneConfig };
`;
}

export function genDsWrappers(z: DerivedZone, ds: DynamicSection): Record<string, string> {
  const files: Record<string, string> = {};
  const coreBase = ds.hasCore ? `@/app/${ds.routePath}/page` : `@/zones/${z.key}/${ds.routePath}/Page`;

  files["page.tsx"] = `// zones/${z.key}/src/app/${ds.routePath}/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Route entry wrapper for  ${ds.routePath}  in the ${z.label} zone.
//
// This file just re-exports the real implementation so Next.js picks up the
// route segment — the branded shell (providers, theme, header + footer) is
// wired automatically via  zones/${z.key}/src/app/layout.tsx .
//
// Edit the page content in:
//   src/zones/${z.key}/${ds.routePath}/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
export { default, generateMetadata, generateStaticParams } from "${coreBase}";
`;

  if (ds.hasCore) {
    // Thin re-exports of the core route's built-in states — replace any of
    // these files with a zone-specific implementation when you want to
    // customize that state for this zone only.
    files["loading.tsx"]   = `// Loading state for ${ds.routePath} — re-export of core; replace to customize.\nexport { default } from "@/app/${ds.routePath}/loading";\n`;
    // error.tsx MUST be a Client Component — Next.js enforces this at build time.
    files["error.tsx"]     = `// Error boundary for ${ds.routePath} — re-export of core; replace to customize.\n"use client";\nexport { default } from "@/app/${ds.routePath}/error";\n`;
    files["not-found.tsx"] = `// Not-found state for ${ds.routePath} — re-export of core; replace to customize.\nexport { default } from "@/app/${ds.routePath}/not-found";\n`;
  }

  return files;
}

export function genDsCorePageTsx(z: DerivedZone, ds: DynamicSection): string {
  if (ds.hasCore) {
    return `// src/zones/${z.key}/${ds.routePath}/Page.tsx
// Re-export core implementation by default.
// Edit this file if you want to override the core behavior for THIS zone.
export { default, generateMetadata, generateStaticParams } from "@/app/${ds.routePath}/page";
`;
  }

  const componentName = `${toPascal(ds.id)}Page`;

  if (!ds.param) {
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

  const isCatchAll = ds.param.startsWith("...");
  const paramName = isCatchAll ? ds.param.slice(3) : ds.param;
  const paramsType = isCatchAll ? `{ ${paramName}: string[] }` : `{ ${paramName}: string }`;
  const valueExpr = isCatchAll ? `${paramName}.join("/")` : paramName;

  return `// src/zones/${z.key}/${ds.routePath}/Page.tsx
// ${z.label} zone — ${ds.label}
// Edit this file to build out the ${ds.label.toLowerCase()} page.
// Import shared components from @/components/ (src/app/ is not available in zone builds).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
        <p className="mt-2 text-body-color">${z.label} zone dynamic route: ${ds.routePath}</p>
      </div>
    </main>
  );
}
`;
}

// ── Per-zone docker-compose.yml ───────────────────────────────────────────────
//
// Compose files are managed artifacts stored in the UNAXIS artifact store
// (outside the repo), not under zones/<key>/.  The TUI uses zoneComposePath()
// from docker.ts to locate them at runtime.  The root docker-compose.yml is
// NOT modified — no regex injection, no YAML mutation.

export function genZoneCompose(z: DerivedZone): string {
  const upstream    = `http://${z.service}:3000`;
  // env_file must be an absolute path because this compose file lives in the
  // UNAXIS artifact store (%APPDATA%\unenter\stacks\<key>\), not the repo root.
  // A relative "../../.env" would resolve to %APPDATA%\unenter\.env — wrong.
  // Forward slashes work on Windows with Docker Desktop (Compose V2).
  const envFilePath = join(PROJECT_DIR, ".env").replace(/\\/g, "/");
  return `# ${z.key}/docker-compose.yml  (UNAXIS managed artifact)
# Generated by UNAXIS — re-runs of the zone wizard will overwrite this file,
# so prefer the wizard or  unaxis zone ${z.key} ...  for routine changes.
# Quick local tweaks are fine; just expect them to be regenerated next time.
# Runtime wrapper: starts the ${z.key} zone container on the shared unenter network.
#
# This file lives in the UNAXIS artifact store, NOT in the source repo.
# Core infra (db, kong, proxy) is managed by the root docker-compose.yml.
# The unenter network is external — both files share it automatically.
#
# Labels (unenter.*) allow any tool with Docker socket access to discover
# zone metadata without reading config files:
#   docker inspect ${z.container} --format '{{json .Config.Labels}}'
#
# Manual commands (locate this file via: unaxis compose-path ${z.key}):
#   docker compose -f <artifact-path> pull
#   docker compose -f <artifact-path> up -d
#   docker compose -f <artifact-path> down

name: unenter-zone-${z.key}

services:
  ${z.service}:
    image: ${z.image}
    build:
      context: ../..
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
    env_file: ${envFilePath}
    environment:
      NEXT_PUBLIC_ZONE: "${z.key}"
    labels:
      unenter.zone.key: "${z.key}"
      unenter.zone.label: "${z.label}"
      unenter.zone.domain: "${z.domain}"
      unenter.zone.layout: "${z.layoutType}"
      unenter.zone.port: "3000"
      unenter.proxy.enabled: "true"
      unenter.proxy.upstream: "${upstream}"
      unaxis.managed: "true"
      unaxis.version: "\${UNAXIS_VERSION:-dev}"
      unaxis.project: "unenter"
      unaxis.domain: "${z.domain}"
      unaxis.role: "zone"
      unaxis.zone: "${z.key}"
      unaxis.source-ref: "\${UNAXIS_SOURCE_REF:-unknown}"
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"require('http').get('http://localhost:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))\\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s
    networks:
      - unenter

networks:
  unenter:
    external: true
`;
}

// ── Build environment manifest ────────────────────────────────────────────────
//
// zones/{key}/build.env — an explicit list of which environment variables
// are build-time (passed as --build-arg to docker build).
//
// This file serves two purposes:
//   1. Auditing: anyone reading the zone directory can see exactly which vars
//      are baked into the image vs injected at runtime.
//   2. loadBuildArgs() reads this file to know which keys to pass, so a
//      future developer can't accidentally bake a secret into an image layer
//      by adding a NEXT_PUBLIC_ entry to a Dockerfile ARG without also
//      declaring it here.
//
// Values are NOT stored here — they come from process.env (loaded from .env
// by ensureRuntimeEnv at startup).  This file is safe to commit.

export function genBuildEnv(z: DerivedZone): string {
  return `# zones/${z.key}/build.env
# Auto-generated by UNAXIS — safe to commit.
#
# Lists the environment variables passed as --build-arg to docker build.
# These values are baked into the image at build time (Next.js needs them
# at compile time to inline NEXT_PUBLIC_* vars into the client bundle).
#
# Runtime-only secrets (service role keys, tokens, passwords) must NEVER
# appear here — they are injected via env_file: ../../.env at container
# start and never reach the image layers.
#
# Add a key here if a new NEXT_PUBLIC_* var is needed at build time.
# Values are read from the project root .env at build time.

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL_BROWSER
NEXT_PUBLIC_APP_TITLE
NEXT_PUBLIC_COMPANY_NAME
NEXT_PUBLIC_OWNER_USERNAME
NEXT_PUBLIC_OWNER_EMAIL
`;
}

export function genZonesCompose(zones: Zone[]): string {
  const envFilePath = join(PROJECT_DIR, ".env").replace(/\\/g, "/");
  const deployable = zones.filter((z) => z.key !== "unenter");
  const services = deployable.map((z) => {
    const upstream = `http://${z.service}:3000`;
    const layout = (z as any).layoutType || "landing";
    return `  ${z.service}:
    image: ${z.image}
    build:
      context: ../..
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
    env_file: ${envFilePath}
    environment:
      NEXT_PUBLIC_ZONE: "${z.key}"
    labels:
      unenter.zone.key: "${z.key}"
      unenter.zone.label: "${z.label ?? z.key}"
      unenter.zone.domain: "${z.domain}"
      unenter.zone.layout: "${layout}"
      unenter.zone.port: "3000"
      unenter.proxy.enabled: "true"
      unenter.proxy.upstream: "${upstream}"
      unaxis.managed: "true"
      unaxis.version: "\${UNAXIS_VERSION:-dev}"
      unaxis.project: "unenter"
      unaxis.domain: "${z.domain}"
      unaxis.role: "zone"
      unaxis.zone: "${z.key}"
      unaxis.source-ref: "\${UNAXIS_SOURCE_REF:-unknown}"
    healthcheck:
      test: ["CMD-SHELL", "node -e \\"require('http').get('http://localhost:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))\\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s
    networks:
      - unenter`;
  }).join("\n\n");

  return `# Branded Zones Stack  (UNAXIS managed artifact)
# Generated by UNAXIS — re-runs of the zone wizard will regenerate this file.
#
# Project: unenter-zones

name: unenter-zones

services:
${services}

networks:
  unenter:
    external: true
`;
}
