// app/dashboard/[id]/settings/labs-taxonomy/page.tsx
'use client';

// Taxonomy for the LABS catalog — the research mirror of settings/taxonomy.
//
// Labs is scoped apart from shop on purpose: separate products
// (research_products), separate categories (research_categories), separate
// storage bucket, separate nav. Pointing Labs at the shop taxonomy would merge
// two catalogs that must not share a namespace — "Peptides" and "Tops" are not
// siblings, and a research category appearing in the shop nav would be wrong
// in a way that is hard to notice and worse to explain.
//
// The MANAGER is shared, though. research_categories carries the same shape as
// categories — nesting, section, cover image, card copy — so CategoriesPage is
// reused with a different table and bucket rather than forked. A fork would
// have drifted the moment either side changed.

import { useState } from 'react';
import { FolderTree, LayoutGrid, FlaskConical } from 'lucide-react';
import CategoriesPage from '../categories/page';

const RESEARCH_TABLE = 'research_categories' as const;
const RESEARCH_BUCKET = 'research-category-covers';
/** Partitions research_categories away from any shop tree in the same table. */
const RESEARCH_SECTION = 'labs';

const TABS = [
  {
    id: 'structure',
    label: 'Browse Structure',
    sub: 'Nav',
    icon: FolderTree,
    desc: 'The Labs navigation tree. Name, slug and nesting — nothing else. Artwork for these same categories lives under Featured Rows.',
  },
  {
    id: 'featured',
    label: 'Featured Rows',
    sub: 'Artwork',
    icon: LayoutGrid,
    desc: 'The cards a visitor sees on Labs. Upload a cover and write the copy laid over it.',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function LabsTaxonomySettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('structure');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Labs Taxonomy</h1>
        </div>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{active.desc}</p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 inline-flex gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ' +
                (isActive
                  ? 'bg-[hsl(var(--background))] font-semibold text-[hsl(var(--foreground))] shadow-sm'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')
              }
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span className="hidden text-xs opacity-60 sm:inline">({tab.sub})</span>
            </button>
          );
        })}
      </div>

      {/* Only one list is mounted at a time: both tabs read the same rows, so
          keeping both alive would leave one showing a stale name after an edit
          in the other. Switching tabs is the refetch. */}
      <div className={activeTab === 'structure' ? 'block' : 'hidden'}>
        {activeTab === 'structure' && (
          <CategoriesPage embedded mode="structure" table={RESEARCH_TABLE} bucket={RESEARCH_BUCKET} defaultSection={RESEARCH_SECTION} />
        )}
      </div>

      <div className={activeTab === 'featured' ? 'block' : 'hidden'}>
        {activeTab === 'featured' && (
          <CategoriesPage embedded mode="display" table={RESEARCH_TABLE} bucket={RESEARCH_BUCKET} defaultSection={RESEARCH_SECTION} />
        )}
      </div>

      {/* Labs has no equivalent of collections or tags — there is no
          research_collections or research_tags table. Saying so beats leaving
          empty tabs that look broken. */}
      <p className="mt-8 border-t border-[hsl(var(--border))] pt-4 text-xs text-[hsl(var(--muted-foreground))]">
        Labs has one taxonomy axis. The shop additionally has Collections (merchandising rows) and
        Attributes (filter tags); no equivalent tables exist for research yet.
      </p>
    </div>
  );
}
