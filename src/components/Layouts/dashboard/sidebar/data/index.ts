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
        items: [],
      },
      {
        title: "Messages",
        url: "/messages",
        icon: Icons.MessageIcon,
        items: [],
      },

      // ── Chrome ──────────────────────────────
      {
        title: "Chrome",
        icon: Icons.FourCircle,
        items: [
          {
            title: "Categories Header",
            url: "/settings/categories",
            icon: Icons.Table,
          },
        ],
      },

      // ── Content ─────────────────────────────
      {
        title: "Content",
        icon: Icons.HomeIcon,
        items: [
          {
            title: "Landing",
            url: "/settings/landing",
            icon: Icons.FourCircle,
          },
          {
            title: "Pages",
            url: "/settings/static-pages",
            icon: Icons.Table,
          },
          {
            title: "Home-Page",
            url: "/settings/homepage_content",
            icon: Icons.FourCircle,
          },
        ],
      },

      // ── Shop ────────────────────────────────
      {
        title: "Shop",
        icon: Icons.Table,
        items: [
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
            title: "Tags / Subcategories",
            url: "/settings/tags",
            icon: Icons.Alphabet,
          },
          {
            title: "Collections",
            url: "/settings/collections",
            icon: Icons.FourCircle,
          },
          {
            title: "Products",
            url: "/settings/products",
            icon: Icons.Authentication,
          },
        ],
      },

      // ── Admin ───────────────────────────────
      {
        title: "Admin",
        icon: Icons.SettingsIcon,
        items: [
          {
            title: "Members",
            url: "/settings/members",
            icon: Icons.User,
          },
          {
            title: "Permissions",
            url: "/settings/permissions",
            icon: Icons.Authentication,
          },
          {
            title: "Theme Maker",
            url: "/settings/thememaker",
            icon: Icons.SettingsIcon,
          },
        ],
      },

      // ── Storage ─────────────────────────────
      {
        title: "Storage",
        icon: Icons.Alphabet,
        items: [
          {
            title: "Images",
            url: "/settings/hero-carousel",
            icon: Icons.FourCircle,
          },
          {
            title: "Storage",
            url: "/Documents",
            icon: Icons.Alphabet,
          },
        ],
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
