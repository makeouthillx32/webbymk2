"use client";

// components/Layouts/hooks/useMetaThemeColor.ts
import { useLayoutEffect } from "react";

export type MetaLayout = "shop" | "dashboard" | "app";

export function useMetaThemeColor(layout: MetaLayout, themeType: "light" | "dark") {
  useLayoutEffect(() => {
    let cancelled = false;
    let lastColor = "";

    const updateStatusBar = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-layout="${layout}"]`);
      if (!el) return;

      const bgColor = getComputedStyle(el).backgroundColor;
      if (!bgColor || bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") return;

      const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return;

      const hex = `#${(
        (1 << 24) +
        (Number(match[1]) << 16) +
        (Number(match[2]) << 8) +
        Number(match[3])
      )
        .toString(16)
        .slice(1)}`;

      if (hex === lastColor) return;
      lastColor = hex;

      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.content = hex;

      let appleMeta = document.querySelector<HTMLMetaElement>(
        'meta[name="apple-mobile-web-app-status-bar-style"]'
      );
      if (!appleMeta) {
        appleMeta = document.createElement("meta");
        appleMeta.name = "apple-mobile-web-app-status-bar-style";
        document.head.appendChild(appleMeta);
      }
      appleMeta.content = "default";

      // Force repaint so Safari picks up the new theme-color
      el.style.visibility = "hidden";
      el.offsetHeight; // trigger reflow
      el.style.visibility = "visible";
    };

    updateStatusBar();

    const observer = new MutationObserver((mutations) => {
      if (cancelled) return;
      const hasClassChange = mutations.some((m) => m.attributeName === "class");
      if (hasClassChange) updateStatusBar();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [layout, themeType]);
}