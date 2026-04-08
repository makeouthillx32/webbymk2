'use client';

import { HeroCarouselManager } from './_components/HeroCarouselManager';

export default function HeroCarouselSettingsPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10 pt-[calc(env(safe-area-inset-top)+16px)] pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Hero Carousel</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Manage your homepage hero carousel slides.
          </p>
        </div>

        <HeroCarouselManager />
      </div>
    </div>
  );
}