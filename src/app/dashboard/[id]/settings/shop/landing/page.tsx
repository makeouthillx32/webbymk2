// app/dashboard/[id]/settings/shop/landing/page.tsx
'use client';

// Shop landing sections — zone-scoped.
//
// No new manager: this renders the SAME <LandingManager> the Content > Landing
// page uses, pinned to page="shop". The component already took a `page` prop,
// so "extracting" it was really just giving each zone its own door to it —
// which is why this file is thin and there is no duplicated logic to drift.
//
// Content > Landing keeps page="home" only; shop and labs now live with their
// zone, next to the rest of that zone's settings.

import LandingManager from '../../landing/_components/LandingManager';
import '../../landing/_components/landing.scss';

export default function ShopLandingPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Shop Landing</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Sections on the shop storefront landing page.</p>
      </div>
      <LandingManager embedded page="shop" />
    </div>
  );
}
