'use client';

import { useState } from 'react';
import { AboutManager } from './_components/AboutManager';
import { TeamManager } from './_components/TeamManager';
import { ServicesManager } from './_components/ServicesManager';
import { CategoriesTab } from './_components/CategoriesTab';
import './_components/content-manager.scss';
import { Info, Users, Layers, Navigation } from 'lucide-react';

const TABS = [
  { id: 'about',      label: 'About Page',  icon: Info,        desc: 'Title, intro copy, and description shown on /about' },
  { id: 'team',       label: 'Team',        icon: Users,       desc: 'Manage team member cards shown in the about accordion' },
  { id: 'services',   label: 'Services',    icon: Layers,      desc: 'Edit service categories, sub-services, and bullet lists' },
  { id: 'categories', label: 'Navigation',  icon: Navigation,  desc: 'Manage the landing page header nav links (About, Contact, etc.)' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HomepageContentPage() {
  const [activeTab, setActiveTab] = useState<TabId>('about');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="content-manager p-6">
      <div className="content-header">
        {/* Title + tabs row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Content</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{active.desc}</p>
          </div>

          {/* Segment tabs */}
          <div className="flex gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-1 w-fit flex-shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
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
        </div>
      </div>

      {/* Panels */}
      <div className="content-table">
        {activeTab === 'about'      && <AboutManager />}
        {activeTab === 'team'       && <TeamManager />}
        {activeTab === 'services'   && <ServicesManager />}
        {activeTab === 'categories' && <CategoriesTab />}
      </div>
    </div>
  );
}
