// app/dashboard/[id]/settings/landing/page.tsx
'use client';

import { useState } from 'react';
import LandingManager from './_components/LandingManager';
import './_components/landing.scss';
import { Home } from 'lucide-react';

// Shop and Labs moved to their own zones (Shop > Landing, Labs > Landing) —
// same <LandingManager>, just reached from where the rest of that zone's
// settings live. Content keeps the Core home page, which has no zone of its own.
const TABS = [
  { id: 'home',  label: 'Home Heroes',  icon: Home, desc: 'Edit Kick, Discord, Pickme and slogan sections on the home page' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function LandingSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Landing</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">{active.desc}</p>
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
      <div className={activeTab === 'home' ? 'block' : 'hidden'}>
        <LandingManager embedded page="home" />
      </div>
    </div>
  );
}
