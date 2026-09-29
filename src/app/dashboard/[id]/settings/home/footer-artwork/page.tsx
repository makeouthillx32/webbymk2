// app/dashboard/[id]/settings/home/footer-artwork/page.tsx
'use client';

// Footer artwork — its own page.
//
// This panel used to live at the BOTTOM of Home > Landing, below the whole
// section list, with no sidebar entry. It worked, but it was effectively
// undiscoverable: you had to already know it was there and scroll past nine
// sections to reach it. Own route, own sidebar entry.
//
// Scope note: these two shapes are in the CORE landing footer
// (components/Layouts/Landing/Footer). Shop and Labs use layoutType "shop",
// which renders ShopFooter — that footer has no decorative SVGs at all, so
// swapping art there would need decoration slots added to it first.

import FooterArtworkPanel from '../../landing/_components/FooterArtworkPanel';

export default function FooterArtworkPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Footer Artwork</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Swap the decorative shapes in the Core landing footer. Uploads go live immediately —
          no rebuild.
        </p>
      </div>
      <FooterArtworkPanel />
    </div>
  );
}
