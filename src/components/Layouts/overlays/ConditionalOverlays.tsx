// components/ConditionalOverlays.tsx
"use client";

import { usePathname } from "next/navigation";
import AccessibilityOverlay from "@/components/Layouts/overlays/accessibility/accessibility";
import CartButton from "@/components/Layouts/overlays/cart/CartButton";
import CartDrawer from "@/components/Layouts/overlays/cart/CartDrawer";
import ResearchDisclaimerOverlay from "@/components/Layouts/overlays/research-disclaimer/ResearchDisclaimerOverlay";
import ResearchCartButton from "@/components/Layouts/overlays/research-cart/ResearchCartButton";
import ResearchCartDrawer from "@/components/Layouts/overlays/research-cart/ResearchCartDrawer";

export default function ConditionalOverlays() {
  const pathname = usePathname();
  const isShopZone = process.env.NEXT_PUBLIC_ZONE === "shop";
  const isLabsZone = process.env.NEXT_PUBLIC_ZONE === "labs";
  const isTankZone = process.env.NEXT_PUBLIC_ZONE === "tank";

  // Exclude overlays from tank, app, and dashboard pages
  if (isTankZone) {
    return null;
  }

  const isAppPage = pathname?.startsWith('/app');
  const isDashboardPage = pathname?.startsWith('/dashboard');
  
  const shouldShowOverlays = !isAppPage && !isDashboardPage;

  if (!shouldShowOverlays) {
    return null;
  }

  return (
    <>
      {/* ⚠️ Research use & compliance gate — blocks the whole zone until acknowledged */}
      {isLabsZone && <ResearchDisclaimerOverlay />}

      {/* 🛒 Cart Button - bottom left */}
      {isShopZone && <CartButton />}
      {isLabsZone && <ResearchCartButton />}

      {/* ♿ Accessibility Overlay - bottom right */}
      <AccessibilityOverlay />

      {/* 🛒 Cart Drawer - slide-out panel */}
      {isShopZone && <CartDrawer />}
      {isLabsZone && <ResearchCartDrawer />}
    </>
  );
}
