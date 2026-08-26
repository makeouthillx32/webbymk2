"use client";

import React, { useEffect } from "react";
import { ACTIVE_THEME, getTankBackgroundTheme } from "../theme";

const TANK_STYLE_TAG_ID = "tank-theme-static-styles";

function setMeta(name: string, content: string) {
  if (typeof document === "undefined") return;
  const elements = Array.from(
    document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`),
  );

  if (elements.length === 0) {
    const element = document.createElement("meta");
    element.name = name;
    element.content = content;
    document.head.appendChild(element);
    return;
  }

  elements.forEach((element) => {
    if (element.content !== content) element.content = content;
  });
}

export type TankThemeStylesProps = {
  statusBarColor?: string;
};

// Generates stable @font-face rules, iOS status bar meta sync, and mobile WebKit resilience guardrails for the Tank zone.
// Injected into document.head ONCE on mount so iOS WebKit never purges font caches during React re-renders.
export function TankThemeStylesComponent({ statusBarColor = "#637F6D" }: TankThemeStylesProps) {
  // 1. Sync iOS Theme Color & Status Bar Meta Tags
  useEffect(() => {
    if (typeof document === "undefined") return;
    setMeta("theme-color", statusBarColor);
    setMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
    
    // Also sync CSS variable --background & --lt-status-bar on <html>
    const html = document.documentElement;
    html.style.setProperty("--lt-status-bar", statusBarColor);
    html.style.setProperty("--lt-bg", statusBarColor);
    html.style.setProperty("--background", "141.43 12.39% 44.31%");
  }, [statusBarColor]);

  // 2. Inject immutable font-face & WebKit guardrail stylesheet once
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (document.getElementById(TANK_STYLE_TAG_ID)) return;

    const fontFacesCss = ACTIVE_THEME.fontFaces
      .map(
        (face) =>
          `@font-face{font-family:"${face.family}";src:url("${face.url}") format("${face.format}");font-weight:${face.weight ?? "400"};font-style:${face.style ?? "normal"};font-display:block;}`,
      )
      .join("\n");

    const guardrailsCss = `
      /* WebKit & iOS Small-Screen Resilience Guardrails */
      html {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        -webkit-tap-highlight-color: transparent;
        overscroll-behavior-y: none;
        touch-action: manipulation;
        background-color: ${statusBarColor};
      }

      body {
        overscroll-behavior-y: none;
        overflow-x: hidden;
        width: 100%;
        min-width: 320px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background-color: ${statusBarColor};
      }

      /* Prevent iOS Safari 16px font auto-zoom jump on text inputs. */
      @media screen and (max-width: 768px) {
        input, textarea, select {
          font-size: 16px !important;
        }
        .tank-input-overlay-text {
          font-size: 16px !important;
        }
      }

      /* iOS smooth momentum scrolling */
      .overflow-y-auto, .overflow-x-auto, [data-scrollable="true"] {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      /* iOS WebKit Subpixel Text Jitter & Baseline Jumping Guardrails */
      .tank-chat-feed, .tank-chat-message, .tank-chat-body {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: geometricPrecision;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        line-height: 1.4 !important;
      }

      /* Standardize emoji inline baseline metrics so inline images never alter line-box height */
      .tank-chat-emoji {
        display: inline-block !important;
        vertical-align: -0.22em !important;
        height: 1.25em !important;
        width: 1.25em !important;
        max-height: 22px !important;
        max-width: 22px !important;
        object-fit: contain !important;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      /* Prevent subpixel layout thrashing on message rows during touch / hover */
      .tank-chat-row {
        contain: layout style;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      /* GPU-accelerated video & transition surfaces */
      video {
        -webkit-transform: translate3d(0, 0, 0);
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      /* Sleek Dark Metallic Tank Scrollbars */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(12, 15, 18, 0.5);
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.18);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.32);
        border-color: rgba(255, 255, 255, 0.16);
      }
      ::-webkit-scrollbar-thumb:active {
        background: rgba(245, 158, 11, 0.6);
        border-color: rgba(245, 158, 11, 0.4);
      }
      ::-webkit-scrollbar-button {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      ::-webkit-scrollbar-corner {
        background: transparent !important;
      }

      /* Firefox scrollbar styling */
      * {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) rgba(12, 15, 18, 0.5);
      }

      /* Custom scrollbar utility classes */
      .custom-scrollbar::-webkit-scrollbar,
      .tank-chat-feed::-webkit-scrollbar {
        width: 5px;
        height: 5px;
      }
      .custom-scrollbar::-webkit-scrollbar-track,
      .tank-chat-feed::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.35);
        border-radius: 4px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb,
      .tank-chat-feed::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 4px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover,
      .tank-chat-feed::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.35);
      }

      /* Utility classes to hide scrollbars on horizontal button strips */
      .scrollbar-none,
      .no-scrollbar {
        -ms-overflow-style: none !important;
        scrollbar-width: none !important;
      }
      .scrollbar-none::-webkit-scrollbar,
      .no-scrollbar::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `;

    const styleEl = document.createElement("style");
    styleEl.id = TANK_STYLE_TAG_ID;
    styleEl.textContent = `${fontFacesCss}\n${guardrailsCss}`;
    document.head.appendChild(styleEl);
  }, []);

  return null;
}

export const TankThemeStyles = React.memo(TankThemeStylesComponent);
