"use client";

// components/Layouts/hooks/useMetaThemeColor.ts
import { useLayoutEffect } from "react";

export type MetaLayout = "shop" | "dashboard" | "app" | "landing";

/**
 * Resolves a CSS token to a hex color by appending a probe element as a child
 * of `parent` (so it inherits the parent's scoped custom properties) and
 * reading the browser-computed background color.
 *
 * Works for any level of var() chaining, e.g.:
 *   --lt-status-bar → var(--gp-bg) → hsl(var(--secondary)) → rgb(...)
 */
function resolveToken(cssValue: string, parent: Element): string | null {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;" +
    `background:${cssValue}`;
  parent.appendChild(probe);
  const computed = getComputedStyle(probe).backgroundColor;
  parent.removeChild(probe);

  if (!computed || computed === "transparent" || computed === "rgba(0, 0, 0, 0)") return null;
  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  if (el.content !== content) el.content = content;
}

export function useMetaThemeColor(layout: MetaLayout, themeType: "light" | "dark") {
  useLayoutEffect(() => {
    let cancelled = false;

    const updateStatusBar = () => {
      if (cancelled) return;

      let hex: string | null = null;

      // Primary: read --lt-status-bar from the [data-layout] element.
      // The token is already defined in layout-tokens.css for every layout
      // type (landing, shop, app, dashboard) and always points to --gp-bg.
      // We use a probe child so it inherits the element's scoped variables.
      const layoutEl = document.querySelector<HTMLElement>(
        `[data-layout="${layout}"]`
      );
      if (layoutEl) {
        hex = resolveToken("var(--lt-status-bar)", layoutEl);
        // If --lt-status-bar resolved to nothing, try --lt-bg as a backup
        if (!hex) hex = resolveToken("var(--lt-bg)", layoutEl);
      }

      // Fallback: resolve --background from <html> (always reliable,
      // stored as HSL components: "36 33% 97%" → wrap in hsl())
      if (!hex) {
        hex = resolveToken("hsl(var(--background))", document.documentElement);
      }

      if (!hex) return;

      setMeta("theme-color", hex);

      // "default"           → light status bar text (for light backgrounds)
      // "black-translucent" → dark/white status bar text that overlays content
      setMeta(
        "apple-mobile-web-app-status-bar-style",
        themeType === "dark" ? "black-translucent" : "default"
      );
    };

    updateStatusBar();

    // Re-run whenever the theme class or inline style changes on <html>
    // (covers dark-mode toggles, theme-id switches, and CSS-var updates).
    const observer = new MutationObserver(() => {
      if (!cancelled) updateStatusBar();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [layout, themeType]);
}