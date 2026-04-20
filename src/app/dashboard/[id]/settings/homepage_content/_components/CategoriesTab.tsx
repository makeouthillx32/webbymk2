'use client';

// CategoriesTab.tsx — Landing header navigation manager.
// Top-level nav items + expandable children (service categories → sub-services).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Plus, Pencil, Trash2, Search, X, Save,
  ChevronUp, ChevronDown, ChevronRight, ExternalLink,
  Layers, FileText,
} from 'lucide-react';
import { LoadingState } from './LoadingState';
import { ErrorAlert } from './ErrorAlert';
import { DeleteConfirmModal } from './DeleteConfirmModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = {
  id: string;
  translations: Record<string, string>;
  path: string | null;
  submenu_type: string | null;
  position: number;
  is_active: boolean;
  open_in_new_tab: boolean;
};

type NavForm = Omit<NavItem, 'id'>;

type SubService = {
  id: string;
  path: string;
  position: number;
  translations: Record<string, Record<string, string>>;
};

type ServiceCategory = {
  id: string;
  slug: string;
  position: number;
  translations: Record<string, Record<string, string>>;
  service_sub_services: SubService[];
};

const EMPTY_FORM: NavForm = {
  translations: { en: '', de: '' },
  path: '',
  submenu_type: null,
  position: 0,
  is_active: true,
  open_in_new_tab: false,
};

const SUBMENU_OPTIONS = [
  { value: '',         label: 'None — direct link' },
  { value: 'services', label: 'Services dropdown' },
];

// ── Helper: get title from nested translations ────────────────────────────────
function getTitle(
  translations: Record<string, Record<string, string>> | undefined,
  locale = 'en',
): string {
  return (
    translations?.[locale]?.title ??
    translations?.['de']?.title ??
    translations?.['en']?.title ??
    '—'
  );
}

// ── NavItemModal ──────────────────────────────────────────────────────────────

function NavItemModal({
  item,
  itemCount,
  onClose,
  onSaved,
}: {
  item: NavItem | null;
  itemCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [locale, setLocale] = useState<'en' | 'de'>('en');
  const [form, setForm]     = useState<NavForm>(() =>
    item
      ? {
          translations:    item.translations ?? { en: '', de: '' },
          path:            item.path ?? '',
          submenu_type:    item.submenu_type ?? null,
          position:        item.position,
          is_active:       item.is_active,
          open_in_new_tab: item.open_in_new_tab,
        }
      : { ...EMPTY_FORM, position: itemCount },
  );

  const hasSubmenu = !!form.submenu_type;

  function setTranslation(lang: string, value: string) {
    setForm((f) => ({ ...f, translations: { ...f.translations, [lang]: value } }));
  }

  async function handleSave() {
    const enTitle = (form.translations['en'] ?? '').trim();
    if (!enTitle) { setError('English label is required.'); return; }
    if (!hasSubmenu && !form.path?.trim()) { setError('Path is required when no submenu is selected.'); return; }
    setSaving(true);
    setError(null);
    const payload: NavForm = {
      ...form,
      path:         hasSubmenu ? null : (form.path?.trim() || null),
      submenu_type: form.submenu_type || null,
    };
    const { error } = item
      ? await supabase.from('landing_nav_items').update(payload).eq('id', item.id)
      : await supabase.from('landing_nav_items').insert([payload]);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  }

  const inputCls =
    'w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {item ? `Edit — ${item.translations?.en || 'Nav Item'}` : 'New Nav Item'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

          {/* EN / DE tabs */}
          <div>
            <div className="mb-3 flex gap-1 rounded-md border border-[hsl(var(--border))] p-0.5 w-fit">
              {(['en', 'de'] as const).map((l) => (
                <button key={l} onClick={() => setLocale(l)}
                  className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                    locale === l
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  {l === 'en' ? '🇺🇸 EN' : '🇩🇪 DE'}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Label <span className="text-xs text-[hsl(var(--muted-foreground))]">({locale.toUpperCase()})</span>
                {locale === 'en' && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input type="text" className={inputCls}
                value={form.translations[locale] ?? ''}
                onChange={(e) => setTranslation(locale, e.target.value)}
                placeholder={locale === 'en' ? 'About Me' : 'Über Uns'}
              />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Type</label>
            <select className={inputCls}
              value={form.submenu_type ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, submenu_type: e.target.value || null, path: e.target.value ? '' : f.path }))}
            >
              {SUBMENU_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Path */}
          {!hasSubmenu && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Path <span className="text-red-500">*</span>
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">e.g. /about</span>
              </label>
              <input type="text" className={inputCls}
                value={form.path ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                placeholder="/about"
              />
            </div>
          )}

          {/* Toggles */}
          <div className="space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-[hsl(var(--input))] accent-[hsl(var(--primary))]"
              />
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">Visible in header</span>
            </label>
            {!hasSubmenu && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={form.open_in_new_tab}
                  onChange={(e) => setForm((f) => ({ ...f, open_in_new_tab: e.target.checked }))}
                  className="h-4 w-4 rounded border-[hsl(var(--input))] accent-[hsl(var(--primary))]"
                />
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">Open in new tab</span>
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(var(--border))]">
          <button onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-4 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-service rows (level 2) ────────────────────────────────────────────────

function SubServiceRows({ subServices }: { subServices: SubService[] }) {
  const sorted = [...subServices].sort((a, b) => a.position - b.position);
  return (
    <>
      {sorted.map((ss) => (
        <tr key={ss.id} className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10">
          {/* indent */}
          <td className="py-2 px-3 w-10" />
          <td colSpan={4} className="py-2 px-3" style={{ paddingLeft: '4rem' }}>
            <div className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))] text-xs select-none">└</span>
              <FileText className="h-3 w-3 text-[hsl(var(--muted-foreground))] flex-shrink-0" />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                {getTitle(ss.translations)}
              </span>
              {ss.path && (
                <code className="text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded ml-1">
                  /services{ss.path}
                </code>
              )}
            </div>
          </td>
          <td className="py-2 px-4" />
        </tr>
      ))}
    </>
  );
}

// ── Service-category rows (level 1) ──────────────────────────────────────────

function ServiceCategoryRows({
  categories,
  expandedCats,
  onToggleCat,
}: {
  categories: ServiceCategory[];
  expandedCats: Set<string>;
  onToggleCat: (id: string) => void;
}) {
  const sorted = [...categories].sort((a, b) => a.position - b.position);
  return (
    <>
      {sorted.map((cat) => {
        const hasChildren = (cat.service_sub_services ?? []).length > 0;
        const isExpanded  = expandedCats.has(cat.id);
        return (
          <React.Fragment key={cat.id}>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 hover:bg-[hsl(var(--muted))]/30 transition-colors">
              {/* indent */}
              <td className="py-2.5 px-3 w-10" />
              <td colSpan={4} className="py-2.5 px-3" style={{ paddingLeft: '2.5rem' }}>
                <div className="flex items-center gap-2">
                  {/* expand/collapse sub-services */}
                  <button
                    type="button"
                    onClick={() => hasChildren && onToggleCat(cat.id)}
                    className={`w-5 h-5 flex items-center justify-center rounded shrink-0 ${
                      hasChildren
                        ? 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    {hasChildren ? (
                      <ChevronRight
                        size={13}
                        className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    ) : (
                      <span className="w-3 h-px bg-[hsl(var(--border))] block ml-1" />
                    )}
                  </button>
                  <Layers className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] flex-shrink-0" />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {getTitle(cat.translations)}
                  </span>
                  {hasChildren && (
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] rounded-full px-1.5 py-0.5 leading-none">
                      {cat.service_sub_services.length}
                    </span>
                  )}
                  <code className="text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded">
                    /{cat.slug}
                  </code>
                </div>
              </td>
              <td className="py-2.5 px-4" />
            </tr>
            {isExpanded && hasChildren && (
              <SubServiceRows subServices={cat.service_sub_services} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── CategoriesTab (NavManager) ────────────────────────────────────────────────

export function CategoriesTab() {
  const supabase = createClient();

  // Nav items
  const [items, setItems]         = useState<NavItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [editItem, setEditItem]   = useState<NavItem | null | undefined>(undefined);
  const [deleteTarget, setDelete] = useState<NavItem | null>(null);

  // Expanded nav items (show children)
  const [expandedNav, setExpandedNav] = useState<Set<string>>(new Set());
  // Expanded service categories (show sub-services)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Service categories (loaded once, shown when services row is expanded)
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [navRes, svcRes] = await Promise.all([
      supabase
        .from('landing_nav_items')
        .select('*')
        .order('position', { ascending: true }),
      supabase
        .from('service_categories')
        .select(`
          id, slug, position, translations,
          service_sub_services (
            id, path, position, translations
          )
        `)
        .order('position', { ascending: true }),
    ]);
    if (navRes.error) setError(navRes.error.message);
    if (svcRes.error) setError(svcRes.error.message);
    setItems((navRes.data ?? []) as NavItem[]);
    setServiceCategories((svcRes.data ?? []) as ServiceCategory[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        Object.values(i.translations).some((v) => v.toLowerCase().includes(q)) ||
        (i.path ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  function toggleNav(id: string) {
    setExpandedNav((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCat(id: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function move(item: NavItem, dir: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.position - b.position);
    const idx  = sorted.findIndex((x) => x.id === item.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await supabase.from('landing_nav_items').update({ position: swap.position }).eq('id', item.id);
    await supabase.from('landing_nav_items').update({ position: item.position }).eq('id', swap.id);
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('landing_nav_items').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDelete(null);
    load();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nav items…"
            className="h-10 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] pl-9 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditItem(null)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          New Nav Item
        </button>
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        These items appear in the landing page header. Reorder with arrows. Items with a dropdown show their sub-sections — click the chevron to expand.
      </p>

      {/* Table */}
      <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--muted))]/60 border-b border-[hsl(var(--border))]">
                <th className="py-2.5 px-3 w-10" />
                <th className="py-2.5 px-3 w-8" />
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Label</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Path / Type</th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Status</th>
                <th className="py-2.5 px-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    {search ? 'No nav items match your search.' : 'No nav items yet. Add your first one above.'}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const hasChildren  = !!item.submenu_type;
                  const isExpanded   = expandedNav.has(item.id);

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/40 transition-colors group"
                      >
                        {/* Reorder */}
                        <td className="py-2.5 px-3 w-10">
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => move(item, -1)}
                              className="rounded p-0.5 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button onClick={() => move(item, 1)}
                              className="rounded p-0.5 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        {/* Expand toggle */}
                        <td className="py-2.5 px-2 w-8">
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleNav(item.id)}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                            >
                              <ChevronRight
                                size={14}
                                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              />
                            </button>
                          ) : (
                            <span className="w-6 block" />
                          )}
                        </td>

                        {/* Label */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[hsl(var(--foreground))]">
                              {item.translations?.en || '—'}
                            </span>
                            {item.translations?.de && (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">/ {item.translations.de}</span>
                            )}
                            {item.open_in_new_tab && (
                              <ExternalLink className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                            )}
                          </div>
                        </td>

                        {/* Path / Type */}
                        <td className="py-2.5 px-3">
                          {item.submenu_type ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--primary))]">
                              dropdown:{item.submenu_type}
                            </span>
                          ) : (
                            <code className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
                              {item.path || '—'}
                            </code>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3">
                          {item.is_active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              Visible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" />
                              Hidden
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button type="button" onClick={() => setEditItem(item)}
                              className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                              title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => setDelete(item)}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-[hsl(var(--muted-foreground))] hover:text-red-600 transition-colors"
                              title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Children: render service categories when services dropdown is expanded */}
                      {isExpanded && item.submenu_type === 'services' && (
                        <ServiceCategoryRows
                          categories={serviceCategories}
                          expandedCats={expandedCats}
                          onToggleCat={toggleCat}
                        />
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {editItem !== undefined && (
        <NavItemModal
          item={editItem}
          itemCount={items.length}
          onClose={() => setEditItem(undefined)}
          onSaved={() => { setEditItem(undefined); load(); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title="Remove nav item"
          message={`Remove "${deleteTarget.translations?.en ?? 'this item'}" from the header? This cannot be undone.`}
          onCancel={() => setDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
