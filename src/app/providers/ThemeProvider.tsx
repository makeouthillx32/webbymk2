"use client";

// src/app/providers/ThemeProvider.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Theme concern — isolated from auth.
//
// Exports:
//   ThemeContext          — raw context (for advanced consumers)
//   useTheme              — hook; throws if called outside ThemeProviderWrapper
//   ThemeProviderWrapper  — component; wraps children in ThemeContext.Provider
//
// Zone layout.tsx files that need theme state import useTheme from
// "@/app/provider" (the re-export barrel) — no direct import of this file
// is required unless you want tree-shake granularity.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useState } from "react";
import { setCookie, getCookie } from "@/lib/cookieUtils";
import { Theme } from "@/types/theme";
import { defaultThemeId, getThemeById, getAvailableThemeIds } from "@/themes";
import { dynamicFontManager } from "@/lib/dynamicFontManager";
import { transitionTheme, smoothThemeToggle } from "@/utils/themeTransitions";

// ── Context type ──────────────────────────────────────────────────────────────

export interface EnhancedThemeContextType {
  themeType: "light" | "dark";
  toggleTheme: (element?: HTMLElement) => Promise<void>;
  themeId: string;
  setThemeId: (id: string, element?: HTMLElement) => Promise<void>;
  getTheme: (id?: string) => Promise<Theme | null>;
  availableThemes: string[];
}

export const ThemeContext = createContext<EnhancedThemeContextType | undefined>(undefined);

export const useTheme = (): EnhancedThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProviderWrapper");
  return context;
};

// ── Internal helper ───────────────────────────────────────────────────────────

function dismissPreloader() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("dcg-theme-ready"));
}

// ── ThemeProviderWrapper ──────────────────────────────────────────────────────

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  const [themeType, setThemeType] = useState<"light" | "dark">("light");
  const [themeId, setThemeIdState] = useState<string>(defaultThemeId);
  const [mounted, setMounted] = useState(false);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);

  // ── Theme resolution ────────────────────────────────────────────────────────

  const getTheme = async (id?: string): Promise<Theme | null> => {
    const targetId = id || themeId;
    try {
      const theme = await getThemeById(targetId);
      if (!theme) {
        console.warn(`⚠️ Theme ${targetId} not found, falling back to default`);
        return await getThemeById(defaultThemeId);
      }
      return theme;
    } catch (error) {
      console.error(`❌ Error getting theme ${targetId}:`, error);
      return await getThemeById(defaultThemeId);
    }
  };

  const setThemeId = async (id: string, element?: HTMLElement) => {
    const themeChangeCallback = async () => {
      try {
        const theme = await getThemeById(id);
        if (theme) {
          setThemeIdState(id);
          localStorage.setItem("themeId", id);
          setCookie("themeId", id, { path: "/", maxAge: 31536000 });
          console.log(`🎨 Theme changed to: ${theme.name} (${id})`);
        } else {
          console.warn(`⚠️ Theme ${id} not found in database`);
        }
      } catch (error) {
        console.error(`❌ Error setting theme ${id}:`, error);
      }
    };

    if (element) await smoothThemeToggle(element, themeChangeCallback);
    else await transitionTheme(themeChangeCallback);
  };

  const toggleTheme = async (element?: HTMLElement) => {
    const themeChangeCallback = () => {
      setThemeType((prev) => (prev === "light" ? "dark" : "light"));
    };

    if (element) await smoothThemeToggle(element, themeChangeCallback);
    else await transitionTheme(themeChangeCallback);
  };

  // ── Initialisation effects ──────────────────────────────────────────────────

  // Load the catalogue of available theme IDs once on mount.
  useEffect(() => {
    const loadAvailableThemes = async () => {
      try {
        const themeIds = await getAvailableThemeIds();
        setAvailableThemes(themeIds);
        console.log(`📚 Loaded ${themeIds.length} available themes:`, themeIds);
      } catch (error) {
        console.error("❌ Error loading available themes:", error);
        setAvailableThemes([defaultThemeId]);
      }
    };
    loadAvailableThemes();
  }, []);

  // Hydrate themeId + themeType from localStorage / cookie on first client render.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMounted(true);

    const initializeTheme = async () => {
      const savedThemeId = localStorage.getItem("themeId") || getCookie("themeId");
      if (savedThemeId) {
        const theme = await getThemeById(savedThemeId);
        if (theme) setThemeIdState(savedThemeId);
        else {
          console.warn(`⚠️ Saved theme ${savedThemeId} not found, using default`);
          setThemeIdState(defaultThemeId);
        }
      }

      const savedThemeType = localStorage.getItem("theme") || getCookie("theme");
      if (!savedThemeType) {
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setThemeType(systemPrefersDark ? "dark" : "light");
      } else {
        setThemeType(savedThemeType as "light" | "dark");
      }
    };

    initializeTheme();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply CSS variables, fonts, and persist selection whenever theme changes.
  useEffect(() => {
    if (!mounted || availableThemes.length === 0) return;

    const applyTheme = async () => {
      try {
        const theme = await getTheme();
        if (!theme) {
          console.error("❌ No theme available to apply");
          dismissPreloader();
          return;
        }

        console.log(`🎨 Applying theme: ${theme.name} (${themeType} mode)`);
        const variables = themeType === "dark" ? theme.dark : theme.light;
        const html = document.documentElement;

        html.classList.remove("light", "dark");
        availableThemes.forEach((id) => html.classList.remove(`theme-${id}`));
        html.classList.add(themeType);
        html.classList.add(`theme-${themeId}`);

        console.log(`🔧 Applying ${Object.keys(variables).length} CSS variables`);
        for (const [key, value] of Object.entries(variables)) {
          html.style.setProperty(key, value);
        }

        try {
          console.log(`🔤 Auto-loading fonts from CSS variables...`);
          await dynamicFontManager.autoLoadFontsFromCSS();
        } catch (error) {
          console.error("❌ Failed to auto-load fonts:", error);
        }

        if (theme.typography?.trackingNormal) {
          document.body.style.letterSpacing = theme.typography.trackingNormal;
        }

        localStorage.setItem("theme", themeType);
        setCookie("theme", themeType, { path: "/", maxAge: 31536000 });

        // Cache resolved bg + primary HSL values so the preloader inline script
        // can read them synchronously on the next page load (before React runs).
        try {
          const bgValue = variables["--background"];
          const primaryValue = variables["--primary"];
          if (bgValue) localStorage.setItem(`dcg-preloader-bg-${themeType}`, bgValue);
          if (primaryValue) localStorage.setItem("dcg-preloader-primary", primaryValue);
        } catch (_) { /* non-critical */ }

        console.log(`✅ Theme applied: ${theme.name} (${themeType})`);

        // Signal the preloader to fade out — colours are now live on the page.
        dismissPreloader();
      } catch (error) {
        console.error("❌ Error applying theme:", error);
        // Always clear the preloader even on error so the user isn't stuck.
        dismissPreloader();
      }
    };

    applyTheme();
  }, [themeType, themeId, mounted, availableThemes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ThemeContext.Provider
      value={{ themeType, toggleTheme, themeId, setThemeId, getTheme, availableThemes }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
