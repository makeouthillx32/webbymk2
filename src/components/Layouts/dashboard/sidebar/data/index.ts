"use client";

import * as Icons from "../icons";

export const NAV_DATA = [
  // ─────────────────────────────────────────────
  // MAIN MENU
  // ─────────────────────────────────────────────
  {
    label: "MAIN MENU",
    items: [
      {
        title: "Dashboard",
        url: "/",
        icon: Icons.HomeIcon,
        roles: ["admin", "marketing"],
        items: [],
      },
      {
        title: "Messages",
        url: "/messages",
        icon: Icons.MessageIcon,
        items: [],
      },

      // ── Content ─────────────────────────────
      // ── Home (Core zone) ────────────────────
      // Renamed from "Content": it manages the CORE zone's presentation, the
      // same way Shop and Labs manage theirs. Shop/Labs landings moved to their
      // own zones; Pages moved out because the page engine serves every zone.
      //
      // `roles` (here and below): which profiles.role values see this item in
      // the sidebar. Omitted = admin-only (the default — every item was
      // admin-only until the marketing role existed, so absence must stay the
      // safe/restrictive choice). Keep this in sync with the actual API-level
      // guards (requireRole calls) — showing a nav item whose route 403s is
      // worse than not showing it.
      {
        title: "Home",
        icon: Icons.HomeIcon,
        roles: ["admin", "marketing"],
        items: [
          {
            title: "Landing",
            url: "/settings/landing",
            icon: Icons.FourCircle,
          },
          {
            // Home has no hero carousel — hero_slides has zero page="home" rows
            // and its hero is the interactive banner. This slot configures that
            // banner's assets instead of managing slides that don't exist.
            title: "Interactive Banner",
            url: "/settings/home/interactive-banner",
            icon: Icons.FourCircle,
          },
          {
            title: "Footer Artwork",
            url: "/settings/home/footer-artwork",
            icon: Icons.FourCircle,
          },
          {
            title: "Home-Page",
            url: "/settings/homepage_content",
            icon: Icons.FourCircle,
          },
        ],
      },

      // ── Pages ───────────────────────────────
      // Top-level on purpose: the static-page engine backs every zone, so it
      // isn't a Core-only concern.
      {
        title: "Pages",
        url: "/settings/static-pages",
        icon: Icons.Table,
        roles: ["admin", "marketing"],
        items: [],
      },

      // ── Blog ────────────────────────────────
      {
        title: "Blog",
        icon: Icons.Table,
        roles: ["admin", "marketing"],
        items: [
          {
            title: "Posts",
            url: "/blog",
            icon: Icons.Table,
          },
          {
            title: "Chrome",
            url: "/blog/chrome",
            icon: Icons.FourCircle,
          },
        ],
      },

      // ── Shop ────────────────────────────────
      {
        title: "Shop",
        icon: Icons.Table,
        items: [
          // Zone-scoped presentation. Content > Landing still manages all three
          // landings in one tabbed page; these are the planned per-zone homes
          // for that work. Routes do NOT exist yet — placed here to fix the
          // information architecture before the migration, so both are expected
          // to 404 until the pages land.
          {
            title: "Landing",
            url: "/settings/shop/landing",
            icon: Icons.FourCircle,
          },
          {
            title: "Hero Carousel",
            url: "/settings/shop/hero-carousel",
            icon: Icons.FourCircle,
          },
          {
            title: "PoS",
            url: "/POS",
            icon: Icons.Calendar,
          },
          {
            title: "Orders",
            url: "/Orders",
            icon: Icons.User,
          },
          {
            title: "Banners",
            url: "/settings/top-banner",
            icon: Icons.FourCircle,
          },
          {
            title: "Discounts",
            url: "/settings/discounts",
            icon: Icons.Table,
          },
          {
            title: "Inventory",
            url: "/settings/inventory",
            icon: Icons.Table,
          },
          {
            // One entry for all three product taxonomies. They were three
            // separate items with overlapping names, which made it hard to tell
            // which one a storefront row was reading from. The tables stay
            // separate — only the interface is unified.
            title: "Taxonomy",
            url: "/settings/taxonomy",
            icon: Icons.FourCircle,
          },
          {
            title: "Products",
            url: "/settings/products",
            icon: Icons.Authentication,
          },
        ],
      },

      // ── Labs ────────────────────────────────
      {
        title: "Labs",
        icon: Icons.Table,
        items: [
          // Planned per-zone presentation for Labs — see the note in Shop.
          // Routes do not exist yet.
          {
            title: "Landing",
            url: "/settings/labs/landing",
            icon: Icons.FourCircle,
          },
          {
            title: "Hero Carousel",
            url: "/settings/labs/hero-carousel",
            icon: Icons.FourCircle,
          },
          {
            // Labs keeps its own taxonomy: research_categories, its own nav
            // tree and its own cover bucket, scoped apart from the shop.
            title: "Taxonomy",
            url: "/settings/labs-taxonomy",
            icon: Icons.FourCircle,
          },
          {
            // research_inventory — stock scoped apart from shop.
            title: "Inventory",
            url: "/settings/labs-inventory",
            icon: Icons.Table,
          },
          {
            title: "Research Chemicals",
            url: "/settings/research-products",
            icon: Icons.Authentication,
          },
          {
            title: "Creators",
            url: "/settings/creators",
            icon: Icons.User,
          },
          {
            // Moved in from a top-level group — it is a Labs concern.
            title: "LIMS & Peptide Testing",
            url: "/settings/lims",
            icon: Icons.PieChart,
          },
        ],
      },

      // ── Tank ────────────────────────────────
      {
        title: "Tank",
        icon: Icons.Table,
        items: [
          {
            title: "Cameras",
            url: "/settings/tank/cameras",
            icon: Icons.FourCircle,
          },
          {
            title: "Rooms",
            url: "/settings/tank/rooms",
            icon: Icons.FourCircle,
          },
          {
            title: "Audio Sources",
            url: "/settings/tank/audio-sources",
            icon: Icons.Table,
          },
          {
            title: "Art",
            url: "/settings/tank/art",
            icon: Icons.FourCircle,
          },
          {
            title: "Emoji",
            url: "/settings/tank/emoji",
            icon: Icons.FourCircle,
          },
        ],
      },

      // ── LIMS & Peptide Testing Engine ───────
      // ── Admin ───────────────────────────────
      {
        title: "Admin",
        icon: Icons.SettingsIcon,
        items: [
          {
            title: "Sites & Apps",
            url: "/settings/sites",
            icon: Icons.FourCircle,
          },
          {
            title: "Members",
            url: "/settings/members",
            icon: Icons.User,
          },
          {
            title: "Theme Maker",
            url: "/settings/thememaker",
            icon: Icons.SettingsIcon,
          },
          {
            title: "Mail",
            url: "/settings/mail",
            icon: Icons.MessageIcon,
            roles: ["admin", "marketing"],
          },
        ],
      },

      // ── Storage ─────────────────────────────
      {
        title: "Storage",
        url: "/settings/storage",
        icon: Icons.Table,
        items: [],
      },
    ],
  },

  // ─────────────────────────────────────────────
  // ADMIN
  // ─────────────────────────────────────────────
  {
    label: "ADMIN",
    collapsible: true,
    items: [
      {
        title: "Forms",
        icon: Icons.Alphabet,
        items: [
          {
            title: "Form Elements",
            url: "/forms/form-elements",
          },
          {
            title: "Form Layout",
            url: "/forms/form-layout",
          },
        ],
      },
      {
        title: "Invites",
        url: "/settings/invites",
        icon: Icons.Table,
        items: [],
      },
      {
        title: "Tables",
        icon: Icons.Table,
        items: [
          {
            title: "Tables",
            url: "/tables",
          },
        ],
      },
      {
        title: "Charts",
        icon: Icons.FourCircle,
        items: [
          {
            title: "Basic Chart",
            url: "/charts/basic-chart",
          },
        ],
      },
      {
        title: "UI Elements",
        icon: Icons.FourCircle,
        items: [
          {
            title: "Alerts",
            url: "/ui-elements/alerts",
          },
          {
            title: "Buttons",
            url: "/ui-elements/buttons",
          },
        ],
      },
    ],
  },

];
