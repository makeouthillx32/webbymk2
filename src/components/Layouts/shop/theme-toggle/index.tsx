"use client";

import SwitchtoDarkMode from "@/components/Layouts/SwitchtoDarkMode";

export function ThemeToggle() {
  return (
    <div className="theme-switcher text-[var(--lt-fg)] hover:text-primary transition-colors">
      <SwitchtoDarkMode />
    </div>
  );
}