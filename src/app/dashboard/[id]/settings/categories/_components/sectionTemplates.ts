// _components/sectionTemplates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pre-built category trees for new sections.
// Each template maps to a TUI zone layoutType so the wizard can auto-select
// the right starting point. The TUI can also POST /api/categories/seed to
// apply a template programmatically without opening the admin UI.
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateCategoryNode = {
  name: string;
  slug: string;
  children?: TemplateCategoryNode[];
};

export type SectionTemplate = {
  id: string;
  label: string;
  description: string;
  layoutHint: "shop" | "landing" | "app" | "minimal" | "blank";
  emoji: string;
  tree: TemplateCategoryNode[];
};

export const SECTION_TEMPLATES: SectionTemplate[] = [
  // ── Shop ──────────────────────────────────────────────────────────────────
  {
    id: "shop",
    label: "Shop",
    description: "Standard storefront nav — tops, bottoms, accessories, sale rail.",
    layoutHint: "shop",
    emoji: "🛍️",
    tree: [
      {
        name: "Tops",
        slug: "tops",
        children: [
          { name: "Graphic Tees", slug: "graphic-tees" },
          { name: "Tanks & Mesh", slug: "tanks-mesh" },
          { name: "Blouses", slug: "blouses" },
          { name: "Outerwear", slug: "outerwear" },
        ],
      },
      {
        name: "Bottoms & Sets",
        slug: "bottoms",
        children: [
          { name: "Jeans", slug: "jeans" },
          { name: "Skirts", slug: "skirts" },
          { name: "Sets", slug: "sets" },
        ],
      },
      {
        name: "Accessories",
        slug: "accessories",
        children: [
          { name: "Jewelry", slug: "jewelry" },
          { name: "Bags", slug: "bags" },
          { name: "Hats", slug: "hats" },
        ],
      },
      { name: "Sale", slug: "sale" },
      { name: "New Arrivals", slug: "new-arrivals" },
    ],
  },

  // ── Landing ───────────────────────────────────────────────────────────────
  {
    id: "landing",
    label: "Landing",
    description: "Content-first nav — hero sections, features, pricing, blog.",
    layoutHint: "landing",
    emoji: "🚀",
    tree: [
      {
        name: "Pages",
        slug: "pages",
        children: [
          { name: "Home", slug: "home" },
          { name: "About", slug: "about" },
          { name: "Pricing", slug: "pricing" },
          { name: "Contact", slug: "contact" },
        ],
      },
      {
        name: "Blog",
        slug: "blog",
        children: [
          { name: "News", slug: "news" },
          { name: "Tutorials", slug: "tutorials" },
          { name: "Announcements", slug: "announcements" },
        ],
      },
      { name: "Legal", slug: "legal" },
    ],
  },

  // ── App ───────────────────────────────────────────────────────────────────
  {
    id: "app",
    label: "App",
    description: "Dashboard-style sections — features, modules, settings areas.",
    layoutHint: "app",
    emoji: "⚡",
    tree: [
      {
        name: "Core",
        slug: "core",
        children: [
          { name: "Dashboard", slug: "dashboard" },
          { name: "Profile", slug: "profile" },
          { name: "Settings", slug: "settings" },
        ],
      },
      {
        name: "Modules",
        slug: "modules",
        children: [
          { name: "Analytics", slug: "analytics" },
          { name: "Integrations", slug: "integrations" },
          { name: "Billing", slug: "billing" },
        ],
      },
      { name: "Help", slug: "help" },
    ],
  },

  // ── Minimal ───────────────────────────────────────────────────────────────
  {
    id: "minimal",
    label: "Minimal",
    description: "Bare-bones start — just a root and one sub for orientation.",
    layoutHint: "minimal",
    emoji: "✦",
    tree: [
      {
        name: "Root",
        slug: "root",
        children: [
          { name: "Section One", slug: "section-one" },
        ],
      },
    ],
  },

  // ── Blank ─────────────────────────────────────────────────────────────────
  {
    id: "blank",
    label: "Blank",
    description: "Empty section — build the tree yourself from scratch.",
    layoutHint: "blank",
    emoji: "○",
    tree: [],
  },
];
