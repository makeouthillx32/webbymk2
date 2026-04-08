// components/Layouts/shop/index.tsx
"use client";

import { Logo } from "./logo";
import { Navigation } from "./navigation";
import { AuthButton } from "./auth-button";
import { ThemeToggle } from "./theme-toggle";
import { Hamburger } from "./hamburger";
import "./shop.scss";

interface HeaderProps {
  onMenuClick?: () => void;
  isOpen?: boolean;
}

export function Header({ onMenuClick, isOpen = false }: HeaderProps) {
  return (
    <header data-layout="shop" className="header-container">
      <div className="header-content">
        {/* VIEWPORT ADAPTIVE LEFT SECTION */}
        <div className="header-left">
          <Hamburger 
            onMenuClick={() => onMenuClick?.()} 
            isOpen={isOpen} 
          />
        </div>

        {/* LOGO SECTION */}
        <div className="header-logo">
          <Logo />
        </div>

        {/* UNIFIED NAVIGATION 
            Logic for viewport switching is handled within this component and its SCSS
        */}
        <div className="header-nav">
          <Navigation 
            isOpen={isOpen} 
            onClose={() => onMenuClick?.()} 
          />
        </div>

        {/* ACTIONS SECTION */}
        <div className="header-actions">
          <div className="header-auth">
            <AuthButton />
          </div>
          <div className="theme-switcher">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}