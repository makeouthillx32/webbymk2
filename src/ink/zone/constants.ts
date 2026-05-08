// src/ink/zone/constants.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone scaffolding constants.
//
//   LAYOUT_OPTIONS — header/footer shell types selectable in the TUI wizard
//   DS_CATALOG     — dynamic route sections available per layout type
//
// Runtime zone data lives in Supabase → public.zones (see registry.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { LayoutType, DynamicSection } from "./types.ts";

// ── Layout options presented in the TUI wizard ───────────────────────────────

export const LAYOUT_OPTIONS: {
  type:  LayoutType;
  label: string;
  desc:  string;
}[] = [
  { type: "landing", label: "Landing", desc: "LandingHeader + LandingFooter  (blogs, marketing)" },
  { type: "shop",    label: "Shop",    desc: "ShopHeader + ShopFooter         (e-commerce)"      },
  { type: "app",     label: "App",     desc: "AppHeader + selectable footer   (web apps)"        },
  { type: "minimal", label: "Minimal", desc: "No header or footer             (bare canvas)"     },
];

// ── Dynamic sections (DS) catalog ─────────────────────────────────────────────
//
// hasCore:true  → route lives entirely in the core (src/app/).
//                 The Dockerfile preserves it via the layout-aware `for dir` loop.
//                 The wizard shows it read-only; no zone wrapper files are generated.
//
// hasCore:false → zone-managed route.
//                 scaffoldZone generates both the wrapper (zones/{key}/src/app/…)
//                 and the starter core module (src/zones/{key}/…/Page.tsx).

export const DS_CATALOG: Record<LayoutType, DynamicSection[]> = {
  shop: [
    { id: "products",    routePath: "products/[slug]",       param: "slug",         label: "Products",     desc: "/products/[slug]   — product detail page",       defaultOn: true,  hasCore: true  },
    { id: "collections", routePath: "collections/[slug]",    param: "slug",         label: "Collections",  desc: "/collections/[slug] — collection listing",       defaultOn: true,  hasCore: true  },
    { id: "category",    routePath: "[categorySlug]",        param: "categorySlug", label: "Categories",   desc: "/[categorySlug]     — top-level category",       defaultOn: true,  hasCore: true  },
    { id: "checkout",    routePath: "checkout",              param: null,           label: "Checkout",     desc: "/checkout           — checkout flow",             defaultOn: true,  hasCore: true  },
    { id: "cart",        routePath: "cart",                  param: null,           label: "Cart",         desc: "/cart               — shopping cart",             defaultOn: false                 },
    { id: "profile",     routePath: "profile/[id]",          param: "id",           label: "Profile",      desc: "/profile/[id]       — user profile pages",       defaultOn: false                 },
  ],
  landing: [
    { id: "post",        routePath: "[slug]",                param: "slug",         label: "Posts / Pages", desc: "/[slug]            — blog posts or CMS pages",   defaultOn: true                  },
    { id: "pages",       routePath: "pages/[slug]",          param: "slug",         label: "Static pages",  desc: "/pages/[slug]       — CMS-managed static pages", defaultOn: false, hasCore: true  },
  ],
  app: [
    { id: "profile",     routePath: "profile/[id]",          param: "id",           label: "Profile",      desc: "/profile/[id]       — user profile pages",       defaultOn: false                 },
    { id: "settings",    routePath: "settings/[...setting]", param: "...setting",   label: "Settings",     desc: "/settings/...       — settings pages",           defaultOn: false                 },
  ],
  minimal: [],
};
