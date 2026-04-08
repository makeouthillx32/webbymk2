// components/ConditionalOverlays.tsx
"use client";

import { usePathname } from "next/navigation";
import AccessibilityOverlay from "@/components/Layouts/overlays/accessibility/accessibility";
import CartButton from "@/components/Layouts/overlays/cart/CartButton";
import CartDrawer from "@/components/Layouts/overlays/cart/CartDrawer";

export default function ConditionalOverlays() {
  const pathname = usePathname();

  // Exclude overlays from app and dashboard pages
  const isAppPage = pathname?.startsWith('/app');
  const isDashboardPage = pathname?.startsWith('/dashboard');
  
  const shouldShowOverlays = !isAppPage && !isDashboardPage;

  if (!shouldShowOverlays) {
    return null;
  }

  return (
    <>
      {/* 🛒 Cart Button - bottom left */}
      <CartButton />
      
      {/* ♿ Accessibility Overlay - bottom right */}
      <AccessibilityOverlay />
      
      {/* 🛒 Cart Drawer - slide-out panel */}
      <CartDrawer />
    </>
  );
}