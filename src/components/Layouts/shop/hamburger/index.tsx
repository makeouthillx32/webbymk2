"use client";

import React from "react";
import { HamburgerIcons } from "./icons";

interface HamburgerProps {
  onMenuClick?: () => void;
  isOpen?: boolean; 
}

export const Hamburger = ({ onMenuClick, isOpen }: HamburgerProps) => {
  const handleClick = (e: React.MouseEvent) => {
    // Prevents the click from bubbling to document listeners 
    // which often causes immediate drawer closing
    e.stopPropagation(); 
    onMenuClick?.();
  };

  return (
    <button
      className={`mobile-hamburger ${isOpen ? "menu-open" : ""}`}
      onClick={handleClick}
      aria-label={isOpen ? "Close Menu" : "Open Menu"}
      type="button"
    >
      <HamburgerIcons.Menu className="hamburger-icon" />
    </button>
  );
};