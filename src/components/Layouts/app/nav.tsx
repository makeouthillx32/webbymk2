// components/Layouts/app/nav.tsx
"use client";

import React from "react";
import { useTheme } from "@/app/provider";
import Link from "next/link";
import SwitchtoDarkMode from "../SwitchtoDarkMode";
import { CustomDropdown } from "@/components/Layouts/app/dropdown-menu";

interface NavProps {
  pageTitle?: string;
}

export function Header({ pageTitle }: NavProps = {}) {
  const { themeType } = useTheme();

  return (
    <nav
      data-layout="app"
      className="sticky top-0 z-30 flex justify-between items-center p-4 transition-colors bg-[var(--lt-bg)] text-[var(--lt-fg)] shadow-[var(--lt-shadow)] border-b border-[var(--lt-border)]"
    >
      <div className="flex items-center gap-3">
        {/* Logo - clickable, takes you to home */}
        <Link href="/" className="flex-shrink-0 hover:opacity-80 transition-opacity">
          <img
            src={
              themeType === "dark"
                ? "/images/home/dartlogowhite.svg"
                : "/images/home/dartlogo.svg"
            }
            alt="DART Logo"
            className="h-10 w-auto"
          />
        </Link>
        
        {/* Page Title */}
        {pageTitle && (
          <h1 className="text-lg font-medium font-[var(--font-sans)]">
            {pageTitle}
          </h1>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        {/* Theme toggle */}
        <SwitchtoDarkMode />
        
        {/* Dropdown menu */}
        <div className="relative z-10">
          <CustomDropdown />
        </div>
      </div>
    </nav>
  );
}