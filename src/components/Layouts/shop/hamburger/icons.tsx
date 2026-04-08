import React from "react";
import { Menu } from "lucide-react";

export const HamburgerIcons = {
  Menu: ({ className }: { className?: string }) => (
    <Menu className={className} aria-hidden="true" />
  ),
};