// components/Layouts/shop/Header.tsx
"use client";

import React, { useEffect } from "react";
import { Menu, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import { useTheme, useAuth } from "@/app/provider";
import SwitchtoDarkMode from "@/components/Layouts/SwitchtoDarkMode";
import DesktopNav from "@/components/Layouts/shop/DesktopNav";
import { useSignInHref } from "@/lib/useSignInHref";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps = {}) {
  const { session, refreshSession } = useAuth();
  const { themeType } = useTheme();
  const signInHref = useSignInHref();
  const { itemCount, toggleCart } = useCart();

  const handleAccountClick = () => {
    window.location.href = "/profile/me";
  };

  // ✅ Listen to custom auth events from Provider
  useEffect(() => {
    console.log('[Header] Setting up auth listener');
    
    const handleAuthChange = (e: Event) => {
      const { event, session } = (e as CustomEvent).detail;
      console.log('[Header] Auth event received:', event, 'Session exists:', !!session);
      
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        console.log('[Header] Triggering refreshSession()');
        refreshSession();
      }
    };

    window.addEventListener('supabase-auth-change', handleAuthChange);

    return () => {
      console.log('[Header] Cleaning up auth listener');
      window.removeEventListener('supabase-auth-change', handleAuthChange);
    };
  }, [refreshSession]);

  // ✅ Add logging to debug
  console.log('[Header] Session state:', session ? 'authenticated' : 'not authenticated');

  return (
    <header 
      data-layout="shop"
      className="header-container bg-[var(--lt-bg)] text-[var(--lt-fg)] border-b border-[var(--lt-border)]"
    >
      <div className="header-content">
        {/* LEFT (Mobile): Hamburger */}
        <div className="header-left">
          <button
            className="mobile-hamburger text-[var(--lt-fg)] focus:ring-primary"
            onClick={onMenuClick}
            aria-label="Open menu"
            type="button"
          >
            <Menu className="hamburger-icon" />
          </button>
        </div>

        {/* CENTER: Logo */}
        <div className="header-logo">
          <Link href="/" className="logo-link focus:ring-primary">
            <img
              src={
                themeType === "dark"
                  ? "/images/home/dartlogowhite.svg"
                  : "/images/home/dartlogo.svg"
              }
              alt="DART Logo"
              className="logo-image"
            />
          </Link>
        </div>

        {/* CENTER (Desktop): Desktop Nav */}
        <div className="header-nav">
          <DesktopNav />
        </div>

        {/* RIGHT: Auth + Theme */}
        <div className="header-actions">
          {/* Desktop Auth */}
          <div className="header-auth">
            {!session ? (
              <Link
                href={signInHref}
                className="auth-button text-[var(--lt-fg)] hover:text-[var(--lt-fg)] focus:ring-primary"
                aria-label="Sign in"
              >
                {/* Mobile: text */}
                <span className="md:hidden">Sign In</span>

                {/* Desktop: icon */}
                <span className="hidden md:inline-flex items-center">
                  <User className="w-5 h-5" aria-hidden="true" />
                </span>
              </Link>
            ) : (
              <button
                onClick={handleAccountClick}
                className="auth-button text-[var(--lt-fg)] hover:text-[var(--lt-fg)] focus:ring-primary"
                type="button"
                aria-label="Account"
              >
                {/* Mobile: text */}
                <span className="md:hidden">Account</span>

                {/* Desktop: icon */}
                <span className="hidden md:inline-flex items-center text-[var(--lt-fg)] hover:text-primary transition-colors">
                  <User className="w-5 h-5" aria-hidden="true" />
                </span>
              </button>
            )}
          </div>

          {/* Cart Trigger */}
          <button
            onClick={toggleCart}
            className="header-cart relative inline-flex items-center justify-center p-2 rounded-full text-[var(--lt-fg)] hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label={`Shopping cart with ${itemCount} items`}
            type="button"
          >
            <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </button>

          {/* Theme Switcher */}
          <div className="theme-switcher text-[var(--lt-fg)] hover:text-primary transition-colors">
            <SwitchtoDarkMode />
          </div>
        </div>
      </div>
    </header>
  );
}