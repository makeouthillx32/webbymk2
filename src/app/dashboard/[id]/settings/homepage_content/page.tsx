'use client';

import { useState } from 'react';
import { AboutManager } from './_components/AboutManager';
import { TeamManager } from './_components/TeamManager';
import { ServicesManager } from './_components/ServicesManager';
import { Info, Users, Layers } from 'lucide-react';

const TABS = [
  { id: 'about',    label: 'About Page', icon: Info,   desc: 'Title, intro copy, and description shown on /about' },
  { id: 'team',     label: 'Team',       icon: Users,  desc: 'Manage the team member accordion cards' },
  { id: 'services', label: 'Services',   icon: Layers, desc: 'Edit service categories, sub-services, and bullet lists' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HomepageContentPage() {
  const [activeTab, setActiveTab] = useState<TabId>('about');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Content Manager</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {active.desc}
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[hsl(var(--background))] shadow-sm text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {activeTab === 'about'    && <AboutManager />}
      {activeTab === 'team'     && <TeamManager />}
      {activeTab === 'services' && <ServicesManager />}
    </div>
  );
}
