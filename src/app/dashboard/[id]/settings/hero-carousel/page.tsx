'use client';

import { useState } from 'react';
import { HeroCarouselManager } from './_components/HeroCarouselManager';
import { ShoppingBag, FlaskConical } from 'lucide-react';

const TABS = [
  { id: 'shop', label: 'Shop Hero',  icon: ShoppingBag,  desc: 'Manage the shop landing page hero carousel slides.' },
  { id: 'labs', label: 'Labs Hero',  icon: FlaskConical, desc: 'Manage the Unenter Labs landing page hero carousel slides.' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HeroCarouselSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('shop');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10 pt-[calc(env(safe-area-inset-top)+16px)] pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Hero Carousel</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{active.desc}</p>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-1 w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[hsl(var(--background))] shadow-sm text-[hsl(var(--foreground))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Panels — render both, hide inactive to preserve state */}
        <div className={activeTab === 'shop' ? 'block' : 'hidden'}>
          <HeroCarouselManager page="shop" />
        </div>
        <div className={activeTab === 'labs' ? 'block' : 'hidden'}>
          <HeroCarouselManager page="labs" />
        </div>
      </div>
    </div>
  );
}
