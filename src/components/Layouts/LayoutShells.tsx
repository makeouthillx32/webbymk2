"use client";

// components/Layouts/LayoutShells.tsx
// Shared UI fragments used by multiple layout branches.
// Keeps DashboardLayout, AuthLayout, and ShopLayout thin.

import { lazy, Suspense } from "react";
import { Toaster } from "react-hot-toast";
import ConditionalOverlays from "@/components/Layouts/overlays/ConditionalOverlays";
import type { ScreenSize } from "@/components/Layouts/hooks/useScreenSize";

const AccessibilityOverlay = lazy(
  () => import("@/components/Layouts/overlays/accessibility/accessibility")
);
const CookieConsent = lazy(() =>
  import("@/components/CookieConsent").then((m) => ({ default: m.CookieConsent }))
);

// ─── Toaster (shared config) ─────────────────────────────

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
          border: "1px solid hsl(var(--border))",
        },
        success: {
          iconTheme: {
            primary: "hsl(var(--primary))",
            secondary: "hsl(var(--primary-foreground))",
          },
        },
        error: {
          iconTheme: {
            primary: "hsl(var(--destructive))",
            secondary: "hsl(var(--destructive-foreground))",
          },
        },
      }}
    />
  );
}

// ─── Accessibility overlay (shared) ──────────────────────

export function AppAccessibility() {
  return (
    <Suspense fallback={null}>
      <AccessibilityOverlay />
    </Suspense>
  );
}

// ─── Cookie consent (shared, screen-size aware) ──────────

const COOKIE_MESSAGES: Record<ScreenSize, string> = {
  mobile:
    "We use cookies to enhance your experience. Essential cookies are required for functionality.",
  tablet:
    "We use cookies to enhance your experience and analyze usage. Essential cookies required.",
  desktop:
    "We use cookies to enhance your experience, analyze site usage, and improve our services. Essential cookies are required for basic functionality.",
};

export function AppCookieConsent({ screenSize }: { screenSize: ScreenSize }) {
  return (
    <Suspense fallback={null}>
      <CookieConsent message={COOKIE_MESSAGES[screenSize]} />
    </Suspense>
  );
}

// ─── Re-export ConditionalOverlays for convenience ───────

export { ConditionalOverlays };