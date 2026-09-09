// app/dashboard/[id]/settings/taxonomy/page.tsx
'use client';

// One manager for all three product taxonomies.
//
// These used to be three separate sidebar entries with overlapping names, which
// made it genuinely hard to tell what any given storefront row was reading from
// — the same words ("Outerwear", "Sale", "New Arrival") existed in more than one
// table. Same tabbed-panel pattern as the Landing manager: each panel is the
// real page component, rendered with `embedded` so it drops its own heading.
//
// The three axes stay SEPARATE tables on purpose — each answers a different
// question, and merging them would lose a distinction you'd immediately want
// back. What's unified here is the interface, not the data.

import { useState } from 'react';
import { FolderTree, LayoutGrid, Tags } from 'lucide-react';
import CategoriesPage from '../categories/page';
import CollectionsPage from '../collections/page';
import TagsPage from '../tags/page';

const TABS = [
  {
    id: 'categories',
    label: 'Browse Structure',
    sub: 'Nav',
    icon: FolderTree,
    desc: 'The navigation tree. Name, slug and nesting — nothing else. Artwork for these same categories lives under Featured Rows.',
  },
  {
    id: 'featured',
    label: 'Featured Rows',
    sub: 'Artwork',
    icon: LayoutGrid,
    desc: 'The cards a shopper sees. Upload a cover and write the copy laid over it — for collections and for categories alike.',
  },
  {
    id: 'tags',
    label: 'Attributes',
    sub: 'Tags',
    icon: Tags,
    desc: 'What a product is LIKE. Cross-cutting traits used as filters — a tee can be Fem and Limited Edition at once.',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Featured Rows holds two GROUPS rather than one table.
 *
 * Collections and categories are different questions — what you are pushing
 * versus what a product is — but presenting a card is the same job for both:
 * a cover image plus the copy over it. Grouping them here means artwork is
 * managed in one place, while Browse Structure stays purely the nav tree.
 */
const FEATURED_GROUPS = [
  { id: 'collections', label: 'Collections', desc: 'Merchandising rows — New Arrivals, Sale, Restocks.' },
  { id: 'categories',  label: 'Categories',  desc: 'The same categories as Browse Structure, edited for how their card looks.' },
] as const;

type FeaturedGroup = (typeof FEATURED_GROUPS)[number]['id'];

export default function TaxonomySettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('categories');
  const [group, setGroup] = useState<FeaturedGroup>('collections');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Taxonomy</h1>
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

      {/* Panels — all three stay mounted, inactive ones hidden, so switching
          tabs doesn't discard an in-progress edit or re-fetch every list. */}
      {/* Browse Structure — nav only.

          Unlike the other panels this one MOUNTS conditionally. Categories now
          appear in two places, and each CategoriesPage fetches its own copy of
          the same rows — so keeping both alive means renaming a category here
          leaves the Featured Rows copy showing the old name until a reload.
          Mounting one at a time makes the switch itself the refetch. */}
      <div className={activeTab === 'categories' ? 'block' : 'hidden'}>
        {activeTab === 'categories' && <CategoriesPage embedded mode="structure" />}
      </div>

      {/* Featured Rows — two groups, same job. */}
      <div className={activeTab === 'featured' ? 'block' : 'hidden'}>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
            {FEATURED_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g.id)}
                className={
                  'rounded-md px-3 py-1.5 text-sm transition ' +
                  (group === g.id
                    ? 'bg-[hsl(var(--background))] font-semibold text-[hsl(var(--foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')
                }
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {FEATURED_GROUPS.find((g) => g.id === group)!.desc}
          </p>
        </div>

        {/* Both stay mounted so switching groups doesn't discard an edit. */}
        <div className={group === 'collections' ? 'block' : 'hidden'}>
          <CollectionsPage embedded />
        </div>
        <div className={group === 'categories' ? 'block' : 'hidden'}>
          {activeTab === 'featured' && group === 'categories' && (
            <CategoriesPage embedded mode="display" />
          )}
        </div>
      </div>
      <div className={activeTab === 'tags' ? 'block' : 'hidden'}>
        <TagsPage embedded />
      </div>
    </div>
  );
}
