"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { ACTIVE_THEME } from "../../theme";

export type ConsoleButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  variant?: "gray" | "red" | "orange";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
  href?: string;
};

/**
 * 3D pill-shaped console button with metallic button PNG texture overlays,
 * tactile push states, and authentic typography.
 */
export function ConsoleButton({
  children,
  onClick,
  active = false,
  variant = "gray",
  className = "",
  type = "button",
  disabled = false,
  ariaLabel,
  href,
}: ConsoleButtonProps) {
  const bgImage =
    active || variant === "orange"
      ? ACTIVE_THEME.images.buttonOrange
      : variant === "red"
        ? ACTIVE_THEME.images.buttonRed
        : ACTIVE_THEME.images.buttonGray;

  const content = (
    <span className="relative z-10 flex items-center justify-center gap-1.5 drop-shadow-[0_1px_0_rgba(255,255,255,.4)]">
      {children}
    </span>
  );

  const sharedStyle: React.CSSProperties = {
    backgroundImage: `url(${bgImage})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    color: active || variant !== "gray" ? "#241f14" : "#2e2b26",
    fontFamily: ACTIVE_THEME.fonts.label,
    textShadow: "0 1px 0 rgba(255,255,255,.4)",
  };

  const sharedClasses = `relative inline-flex items-center justify-center px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all select-none focus:outline-none ${
    disabled
      ? "opacity-50 cursor-not-allowed filter grayscale"
      : "active:translate-y-[1px] hover:brightness-105"
  } ${className}`;

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={sharedClasses} style={sharedStyle}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={sharedClasses}
      style={sharedStyle}
    >
      {content}
    </button>
  );
}
