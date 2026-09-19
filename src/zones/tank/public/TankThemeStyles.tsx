"use client";

import React, { useEffect } from "react";
import {
  ACTIVE_THEME,
  TANK_NEUTRAL_CHROME_THEME,
  getTankBackgroundTheme,
  getTankDesignTheme,
  resolveTankTheme,
  buildTankThemeCssVariables,
  type TankDesignTheme,
  type TankThemeCustomOverrides,
} from "../theme";

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
  designTheme?: TankDesignTheme | string;
  customTheme?: Partial<TankDesignTheme> | TankThemeCustomOverrides;
};

// Generates stable @font-face rules, iOS status bar meta sync, and mobile WebKit resilience guardrails for the Tank zone.
// Injected into document.head ONCE on mount so iOS WebKit never purges font caches during React re-renders.
export function TankThemeStylesComponent({
  statusBarColor,
  designTheme,
  customTheme,
}: TankThemeStylesProps) {
  // 1. Sync Theme Custom Properties, iOS Theme Color & Status Bar Meta Tags
  useEffect(() => {
    if (typeof document === "undefined") return;

    const baseTheme =
      typeof designTheme === "string"
        ? designTheme === TANK_NEUTRAL_CHROME_THEME.id
          ? TANK_NEUTRAL_CHROME_THEME
          : getTankDesignTheme(designTheme)
        : designTheme ??
          getTankDesignTheme(
            statusBarColor
              ? statusBarColor.toLowerCase() === "#557194"
                ? "tank-arcade-blue"
                : statusBarColor.toLowerCase() === "#637f6d"
                  ? "tank-arcade-green"
                  : undefined
              : undefined,
          );

    const theme = resolveTankTheme(baseTheme, customTheme);

    const effectiveStatusBar = statusBarColor || theme.statusBarHex;
    setMeta("theme-color", effectiveStatusBar);
    setMeta("apple-mobile-web-app-status-bar-style", "black-translucent");

    // Sync all design tokens to documentElement CSS custom properties
    const html = document.documentElement;
    const cssVars = buildTankThemeCssVariables(theme);
    // Wallpaper/status-bar selection is independent from the UI chrome. These
    // canvas variables follow the chosen background while panel, metal, and
    // accent variables continue to come from the neutral/custom chrome theme.
    cssVars["--tank-color-background"] = effectiveStatusBar;
    cssVars["--lt-status-bar"] = effectiveStatusBar;
    cssVars["--lt-bg"] = effectiveStatusBar;
    cssVars["--background"] = effectiveStatusBar;
    for (const [key, val] of Object.entries(cssVars)) {
      html.style.setProperty(key, val);
    }
  }, [statusBarColor, designTheme, customTheme]);

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
        background-color: var(--tank-color-background, #557194);
      }

      body {
        overscroll-behavior-y: none;
        overflow-x: hidden;
        width: 100%;
        min-width: 320px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background-color: var(--tank-color-background, #557194);
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

      /* All Rooms CRT hover burst. The effect is deliberately strong: the
         reference briefly replaces the camera with visible RGB interference,
         rather than relying on a border that disappears into metal chrome. */
      .tank-room-crt-hover {
        position: absolute;
        inset: 0;
        z-index: 15;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        background:
          radial-gradient(circle at 22% 35%, rgba(255, 30, 92, .78), transparent 28%),
          radial-gradient(circle at 76% 58%, rgba(0, 238, 255, .72), transparent 31%),
          linear-gradient(112deg, rgba(0, 255, 128, .45), rgba(70, 0, 255, .4) 48%, rgba(255, 92, 0, .52));
        mix-blend-mode: screen;
        animation: none;
      }

      .tank-room-crt-hover::before {
        content: "";
        position: absolute;
        inset: -18%;
        background:
          repeating-linear-gradient(90deg,
            rgba(255, 25, 96, .72) 0 2px,
            rgba(0, 245, 255, .58) 2px 4px,
            rgba(100, 255, 55, .64) 4px 6px,
            rgba(18, 8, 28, .36) 6px 9px),
          repeating-linear-gradient(0deg,
            rgba(255,255,255,.56) 0 1px,
            rgba(0,0,0,.45) 1px 3px,
            transparent 3px 6px);
        background-size: 37px 100%, 100% 7px;
        filter: contrast(2.2) saturate(2.6);
        opacity: .9;
        animation: none;
      }

      .tank-room-crt-tear {
        position: absolute;
        inset-inline: -8%;
        top: 18%;
        height: 28%;
        background:
          repeating-linear-gradient(90deg,
            rgba(0,255,220,.72) 0 13px,
            rgba(255,0,72,.82) 13px 27px,
            rgba(255,226,0,.65) 27px 35px,
            rgba(30,0,50,.72) 35px 48px);
        box-shadow:
          0 -9px 0 rgba(255, 0, 72, .34),
          0 11px 0 rgba(0, 225, 255, .3);
        opacity: .9;
        animation: none;
      }

      .tank-room-crt-sweep {
        position: absolute;
        inset-inline: 0;
        top: -22%;
        height: 20%;
        background: linear-gradient(to bottom, transparent, rgba(255,255,255,.78), rgba(30,255,210,.36), transparent);
        filter: blur(.5px);
        animation: none;
      }

      @keyframes tank-room-crt-burst {
        0%   { opacity: 0; }
        10%  { opacity: .98; }
        62%  { opacity: .88; }
        100% { opacity: 0; }
      }

      @keyframes tank-room-crt-noise {
        0%   { transform: translate3d(-4%, -3%, 0) scale(1.06); background-position: 0 0, 0 0; }
        25%  { transform: translate3d(3%, 2%, 0) scale(1.1); background-position: 19px -3px, 0 2px; }
        50%  { transform: translate3d(-1%, 4%, 0) scale(1.08); background-position: -11px 4px, 0 -3px; }
        75%  { transform: translate3d(4%, -1%, 0) scale(1.12); background-position: 7px 2px, 0 4px; }
        100% { transform: translate3d(-4%, -3%, 0) scale(1.06); background-position: 0 0, 0 0; }
      }

      @keyframes tank-room-crt-tear {
        0%, 100% { top: 12%; transform: translateX(-3%) skewX(-4deg); height: 12%; }
        22%      { top: 62%; transform: translateX(5%) skewX(7deg); height: 21%; }
        47%      { top: 31%; transform: translateX(-7%) skewX(-9deg); height: 8%; }
        71%      { top: 76%; transform: translateX(2%) skewX(3deg); height: 15%; }
      }

      @keyframes tank-room-crt-sweep {
        from { transform: translateY(0); }
        to   { transform: translateY(610%); }
      }

      @media (hover: hover) and (pointer: fine) {
        [data-tank-room-tile]:hover {
          border-color: var(--tank-color-link, #42e8ff) !important;
          box-shadow:
            0 0 0 2px rgba(255,255,255,.72),
            0 0 18px var(--tank-color-link, #42e8ff),
            inset 0 0 22px rgba(255,255,255,.3) !important;
          transform: translateY(-2px) scale(1.012);
        }

        [data-tank-room-tile]:hover video {
          filter: brightness(.92) contrast(1.45) saturate(1.75);
        }

        [data-tank-room-tile]:hover .tank-room-crt-hover {
          animation: tank-room-crt-burst 300ms linear both;
        }

        [data-tank-room-tile]:hover .tank-room-crt-hover::before {
          animation: tank-room-crt-noise 300ms steps(3, end) both;
        }

        [data-tank-room-tile]:hover .tank-room-crt-tear {
          animation: tank-room-crt-tear 300ms steps(3, end) both;
        }

        [data-tank-room-tile]:hover .tank-room-crt-sweep {
          animation: tank-room-crt-sweep 300ms linear both;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .tank-room-crt-hover::before,
        .tank-room-crt-tear,
        .tank-room-crt-sweep {
          animation: none !important;
        }

        .tank-room-crt-hover {
          animation: none !important;
        }
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
