"use client";

import React, { useEffect, useState } from "react";

export type CrtTransitionProps = {
  triggerKey?: string | number | null;
  durationMs?: number;
};

/**
 * Subtle, gentle CRT static roll & scanline transition effect.
 * Calmed down to prevent eye strain and screen flash.
 */
export function CrtTransition({
  triggerKey,
  durationMs = 180,
}: CrtTransitionProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!triggerKey) return;
    setActive(true);
    const timer = setTimeout(() => {
      setActive(false);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [triggerKey, durationMs]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden select-none transform-gpu"
      style={{ willChange: "transform, opacity" }}
    >
      {/* 1. Subtle soft flash burst */}
      <div className="absolute inset-0 bg-white/10 animate-out fade-out duration-200 pointer-events-none" />

      {/* 2. Soft horizontal scanlines */}
      <div
        className="absolute inset-0 opacity-18 mix-blend-screen pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.95) 0px, rgba(255, 255, 255, 0.15) 1px, rgba(0, 0, 0, 0.95) 3px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* 3. Rolling horizontal sync bar */}
      <div
        className="absolute inset-x-0 h-6 bg-white/10 blur-[1px] pointer-events-none"
        style={{
          boxShadow: "0 0 6px rgba(255,255,255,0.2)",
        }}
      />

      {/* 4. Mild Chromatic RGB shift fringing */}
      <div
        className="absolute inset-0 opacity-12 mix-blend-screen pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(57,255,106,0.15) 0%, rgba(255,59,47,0.15) 100%)",
        }}
      />
    </div>
  );
}
export default CrtTransition;
