"use client";

import React from "react";
import type { OverlaySkin } from "../overlaySkin";

/**
 * The skinned box every HUD piece sits in.
 *
 * One component so the four pieces cannot drift apart visually — they are meant
 * to read as one instrument panel even when an operator places them on opposite
 * corners of a scene, which is the whole reason for splitting them up.
 */
export function HudPanel({
  skin,
  children,
  className = "",
  style,
}: {
  skin: OverlaySkin;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${className}`}
      style={{ ...skin.panel, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * The outer layer for a HUD piece rendered as its OWN browser source.
 *
 * `pointer-events-none` and `select-none` matter: OBS composites the whole
 * document, and a source that can take a click or show a text cursor is a
 * source that can interfere with the ones beneath it in the stack.
 *
 * Each piece anchors itself, because a browser source IS its coordinate space —
 * sizing one to a small box does not crop the overlay, it re-anchors it inside
 * that box.
 */
export function HudStandaloneFrame({
  anchor,
  children,
}: {
  anchor: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center";
  children: React.ReactNode;
}) {
  const vertical = anchor.startsWith("top") ? "top-0" : "bottom-0";
  const horizontal = anchor.endsWith("left")
    ? "justify-start"
    : anchor.endsWith("right")
      ? "justify-end"
      : "justify-center";

  return (
    <main
      className={`fixed inset-x-0 ${vertical} ${horizontal} flex p-4 sm:p-6 bg-transparent pointer-events-none select-none z-30`}
    >
      {children}
    </main>
  );
}
