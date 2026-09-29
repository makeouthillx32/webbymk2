// app/dashboard/[id]/settings/labs/hero-carousel/page.tsx
'use client';

// Labs hero carousel — zone-scoped.
//
// Renders the SAME <HeroCarouselManager> the shared page used, pinned to
// page="labs". The manager already accepted a `page` prop, so there is no
// second implementation to keep in sync.

import { HeroCarouselManager } from '../../hero-carousel/_components/HeroCarouselManager';

export default function LabsHeroCarouselPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Labs Hero Carousel</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Hero carousel slides on the Unenter Labs storefront.</p>
        </div>
        <HeroCarouselManager page="labs" />
      </div>
    </div>
  );
}
