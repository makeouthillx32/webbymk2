"use client";

import React, { type ReactNode } from "react";
import { ACTIVE_THEME } from "../../theme";

export type ChromePanelProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  withScrews?: boolean;
  style?: React.CSSProperties;
};

/**
 * Industrial metal console panel with gradient, outset bevel border,
 * real brushed aluminum / metal overlay textures, and 4 corner bolt screws.
 * 
 * Corner bolts sit at top-2/bottom-2 (8px inset) with a 16px footprint.
 * When `withScrews` is true, content is placed inside a guaranteed clearance
 * safe-zone so child elements never collide or overlap the bolt heads.
 */
export function ChromePanel({
  children,
  className = "",
  contentClassName = "",
  withScrews = false,
  style,
}: ChromePanelProps) {
  return (
    <div
      className={`relative overflow-hidden rounded ${className}`}
      style={{
        backgroundColor: "#6e737b",
        backgroundImage: "var(--tank-panel-texture, url(https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/light-aluminum-comp.webp))",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
        border: "3px outset hsla(300,5%,79%,.75)",
        outline: "2px solid rgba(0,0,0,.5)",
        boxShadow:
          "-2px 2px 1px rgba(0,0,0,.75), inset 0 0 4px #cbc6cb, 4px 4px 0 rgba(0,0,0,.75)",
        isolation: "isolate",
        ...style,
      }}
    >
      {/* Texture Lighting & Bevel Overlays */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-30 mix-blend-overlay"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(0,0,0,0.4) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-20 mix-blend-multiply"
        style={{
          backgroundImage: `url(${ACTIVE_THEME.images.metalTexture})`,
        }}
      />

      {/* 4 Corner Bolt Screws pushed to absolute corners */}
      {withScrews && (
        <>
          <img
            src={ACTIVE_THEME.images.screwTopLeft}
            alt=""
            className="pointer-events-none absolute left-1 top-1 z-20 h-3.5 w-3.5 select-none drop-shadow-[1px_1px_1px_rgba(0,0,0,0.8)]"
          />
          <img
            src={ACTIVE_THEME.images.screwTopRight}
            alt=""
            className="pointer-events-none absolute right-1 top-1 z-20 h-3.5 w-3.5 select-none drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.8)]"
          />
          <img
            src={ACTIVE_THEME.images.screwBottomLeft}
            alt=""
            className="pointer-events-none absolute bottom-1 left-1 z-20 h-3.5 w-3.5 select-none drop-shadow-[1px_-1px_1px_rgba(0,0,0,0.8)]"
          />
          <img
            src={ACTIVE_THEME.images.screwBottomRight}
            alt=""
            className="pointer-events-none absolute bottom-1 right-1 z-20 h-3.5 w-3.5 select-none drop-shadow-[-1px_-1px_1px_rgba(0,0,0,0.8)]"
          />
        </>
      )}

      {/* Content wrapper with screw clearance */}
      <div
        className={`relative z-10 ${
          withScrews ? "px-3 py-2 sm:px-6 sm:py-4" : ""
        } ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
