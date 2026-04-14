'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Plus, Trash2, Save, ChevronUp, ChevronDown,
  Layers, ChevronRight, GripVertical,
} from 'lucide-react';
import { LoadingState } from './LoadingState';
import { ErrorAlert } from './ErrorAlert';
import { DeleteConfirmModal } from './DeleteConfirmModal';

// ── Types ──────────────────────────────────────────────────────────────────────

type Locale = 'en' | 'de';

type ListItem = { id: string; position: number; translations: Record<Locale, { text: string }> };
type NestedList = { id: string; position: number; translations: Record<Locale, { title: string }>; service_nested_list_items: ListItem[] };
type SubService  = { id: string; path: string; images: string[]; position: number; is_active: boolean; translations: Record<Locale, { title: string; description: string; paragraph: string; cta: string }>; service_nested_lists: NestedList[] };
type Category    = { id: string; slug: string; image: string | null; tags: string[]; position: number; is_active: boolean; translations: Record<Locale, { title: string; paragraph: string }>; service_sub_services: SubService[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20';
const EMPTY_SUB_TRANS = { en: { title: '', description: '', paragraph: '', cta: '' }, de: { title: '', description: '', paragraph: '', cta: '' } };
const EMPTY_CAT_TRANS = { en: { title: '', paragraph: '' }, de: { title: '', paragraph: '' } };

// ── Main component ─────────────────────────────────────────────────────────────

export function ServicesManager() {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [selCat, setSelCat]           = useState<Category | null>(null);
  const [selSub, setSelSub]           = useState<SubService | null>(null);
  const [locale, setLocale]           = useState<Locale>('en');
  const [saving, setSaving]           = useState(false);
  const [deleteTarget, setDel]        = useState<{ type: 'category' | 'sub'; id: string; name: string } | null>(null);

  // Category edit form
  const [catForm, setCatForm] = useState({ slug: '', image: '', tags: '', is_active: true, translations: EMPTY_CAT_TRANS });
  const [catNew, setCatNew]   = useState(false);

  // Sub-service edit form
  const [subForm, setSubForm] = useState({ path: '', images: '', is_active: true, translations: EMPTY_SUB_TRANS, service_nested_lists: [] as NestedList[] });
  const [subNew, setSubNew]   = useState(false);

  const supabase = createClient();

  const load = useCallback(async (selCatId?: string, selSubId?: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('service_categories')
      .select(`id, slug, image, tags, position, is_active, translations,
        service_sub_services (id, path, images, position, is_active, translations,
          service_nested_lists (id, position, translations,
            service_nested_list_items (id, position, translations)
          )
        )`)
      .order('position')
      .returns<Category[]>();

    if (error) { setError(error.message); setLoading(false); return; }
    const cats = data ?? [];
    setCategories(cats);

    const cat = selCatId ? cats.find((c) => c.id === selCatId) : cats[0];
    if (cat) {
      setSelCat(cat);
      applyCatForm(cat);
      const subs = [...(cat.service_sub_services ?? [])].sort((a, b) => a.position - b.position);
      const sub = selSubId ? subs.find((s) => s.id === selSubId) : subs[0];
      if (sub) { setSelSub(sub); applySubForm(sub); }
      else { setSelSub(null); }
    }
    setLoading(false);
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  function applyCatForm(cat: Category) {
    setCatNew(false);
    setCatForm({
      slug: cat.slug,
      image: cat.image ?? '',
      tags: (cat.tags ?? []).join(', '),
      is_active: cat.is_active,
      translations: {
        en: { title: cat.translations?.en?.title ?? '', paragraph: cat.translations?.en?.paragraph ?? '' },
        de: { title: cat.translations?.de?.title ?? '', paragraph: cat.translations?.de?.paragraph ?? '' },
      },
    });
  }

  function applySubForm(sub: SubService) {
    setSubNew(false);
    setSubForm({
      path: sub.path ?? '',
      images: (sub.images ?? []).join(', '),
      is_active: sub.is_active,
      translations: {
        en: { title: sub.translations?.en?.title ?? '', description: sub.translations?.en?.description ?? '', paragraph: sub.translations?.en?.paragraph ?? '', cta: sub.translations?.en?.cta ?? '' },
        de: { title: sub.translations?.de?.title ?? '', description: sub.translations?.de?.description ?? '', paragraph: sub.translations?.de?.paragraph ?? '', cta: sub.translations?.de?.cta ?? '' },
      },
      service_nested_lists: [...(sub.service_nested_lists ?? [])].sort((a, b) => a.position - b.position),
    });
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────

  function newCategory() {
    setCatNew(true);
    setSelCat(null);
    setSelSub(null);
    setCatForm({ slug: '', image: '', tags: '', is_active: true, translations: EMPTY_CAT_TRANS });
  }

  async function saveCategory() {
    setSaving(true); setError(null);
    const payload = {
      slug: catForm.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      image: catForm.image || null,
      tags: catForm.tags.split(',').map((s) => s.trim()).filter(Boolean),
      is_active: catForm.is_active,
      translations: catForm.translations,
    };
    if (catNew) {
      const { data, error } = await supabase.from('service_categories').insert([{ ...payload, position: categories.length }]).select('id').single();
      if (error) { setError(error.message); setSaving(false); return; }
      await load(data.id);
    } else if (selCat) {
      const { error } = await supabase.from('service_categories').update(payload).eq('id', selCat.id);
      if (error) { setError(error.message); setSaving(false); return; }
      await load(selCat.id, selSub?.id);
    }
    setSaving(false);
  }

  async function moveCategory(cat: Category, dir: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await supabase.from('service_categories').update({ position: swap.position }).eq('id', cat.id);
    await supabase.from('service_categories').update({ position: cat.position }).eq('id', swap.id);
    await load(selCat?.id, selSub?.id);
  }

  // ── Sub-service CRUD ──────────────────────────────────────────────────────

  function newSubService() {
    if (!selCat) return;
    setSubNew(true);
    setSelSub(null);
    setSubForm({ path: '', images: '', is_active: true, translations: EMPTY_SUB_TRANS, service_nested_lists: [] });
  }

  async function saveSubService() {
    if (!selCat) return;
    setSaving(true); setError(null);
    const subs = (selCat.service_sub_services ?? []).sort((a, b) => a.position - b.position);
    const payload = {
      category_id: selCat.id,
      path: subForm.path.trim() || null,
      images: subForm.images.split(',').map((s) => s.trim()).filter(Boolean),
      is_active: subForm.is_active,
      translations: subForm.translations,
    };
    if (subNew) {
      const { data, error } = await supabase.from('service_sub_services').insert([{ ...payload, position: subs.length }]).select('id').single();
      if (error) { setError(error.message); setSaving(false); return; }
      await load(selCat.id, data.id);
    } else if (selSub) {
      const { error } = await supabase.from('service_sub_services').update(payload).eq('id', selSub.id);
      if (error) { setError(error.message); setSaving(false); return; }
      await load(selCat.id, selSub.id);
    }
    setSaving(false);
  }

  async function moveSub(sub: SubService, dir: -1 | 1) {
    const sorted = [...(selCat?.service_sub_services ?? [])].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((s) => s.id === sub.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await supabase.from('service_sub_services').update({ position: swap.position }).eq('id', sub.id);
    await supabase.from('service_sub_services').update({ position: sub.position }).eq('id', swap.id);
    await load(selCat?.id, selSub?.id);
  }

  // ── Nested list CRUD ──────────────────────────────────────────────────────

  function addNestedList() {
    setSubForm((f) => ({
      ...f,
      service_nested_lists: [
        ...f.service_nested_lists,
        { id: `new-${Date.now()}`, position: f.service_nested_lists.length, translations: { en: { title: '' }, de: { title: '' } }, service_nested_list_items: [] },
      ],
    }));
  }

  function updateListTitle(listIdx: number, loc: Locale, value: string) {
    setSubForm((f) => {
      const lists = [...f.service_nested_lists];
      lists[listIdx] = { ...lists[listIdx], translations: { ...lists[listIdx].translations, [loc]: { title: value } } };
      return { ...f, service_nested_lists: lists };
    });
  }

  function addListItem(listIdx: number) {
    setSubForm((f) => {
      const lists = [...f.service_nested_lists];
      const list = lists[listIdx];
      lists[listIdx] = {
        ...list,
        service_nested_list_items: [...list.service_nested_list_items, { id: `new-${Date.now()}`, position: list.service_nested_list_items.length, translations: { en: { text: '' }, de: { text: '' } } }],
      };
      return { ...f, service_nested_lists: lists };
    });
  }

  function updateItemText(listIdx: number, itemIdx: number, loc: Locale, value: string) {
    setSubForm((f) => {
      const lists = [...f.service_nested_lists];
      const items = [...lists[listIdx].service_nested_list_items];
      items[itemIdx] = { ...items[itemIdx], translations: { ...items[itemIdx].translations, [loc]: { text: value } } };
      lists[listIdx] = { ...lists[listIdx], service_nested_list_items: items };
      return { ...f, service_nested_lists: lists };
    });
  }

  function removeListItem(listIdx: number, itemIdx: number) {
    setSubForm((f) => {
      const lists = [...f.service_nested_lists];
      const items = lists[listIdx].service_nested_list_items.filter((_, i) => i !== itemIdx);
      lists[listIdx] = { ...lists[listIdx], service_nested_list_items: items };
      return { ...f, service_nested_lists: lists };
    });
  }

  function removeNestedList(listIdx: number) {
    setSubForm((f) => ({ ...f, service_nested_lists: f.service_nested_lists.filter((_, i) => i !== listIdx) }));
  }

  // Save nested lists (called as part of saveSubService flow via separate button)
  async function saveNestedLists() {
    if (!selSub || subNew) return saveSubService(); // For new subs, save the whole thing first
    setSaving(true); setError(null);
    const subId = selSub.id;

    for (const list of subForm.service_nested_lists) {
      const isNew = list.id.startsWith('new-');
      if (isNew) {
        const { data: nl, error: nlErr } = await supabase
          .from('service_nested_lists')
          .insert([{ sub_service_id: subId, position: list.position, translations: list.translations }])
          .select('id').single();
        if (nlErr) { setError(nlErr.message); setSaving(false); return; }
        for (const item of list.service_nested_list_items) {
          await supabase.from('service_nested_list_items').insert([{ nested_list_id: nl.id, position: item.position, translations: item.translations }]);
        }
      } else {
        await supabase.from('service_nested_lists').update({ position: list.position, translations: list.translations }).eq('id', list.id);
        for (const item of list.service_nested_list_items) {
          if (item.id.startsWith('new-')) {
            await supabase.from('service_nested_list_items').insert([{ nested_list_id: list.id, position: item.position, translations: item.translations }]);
          } else {
            await supabase.from('service_nested_list_items').update({ position: item.position, translations: item.translations }).eq('id', item.id);
          }
        }
      }
    }
    await load(selCat?.id, selSub.id);
    setSaving(false);
  }

  // ── Delete confirm ────────────────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'category') {
      await supabase.from('service_categories').delete().eq('id', deleteTarget.id);
      setSelCat(null); setSelSub(null);
      await load();
    } else {
      await supabase.from('service_sub_services').delete().eq('id', deleteTarget.id);
      await load(selCat?.id);
    }
    setDel(null);
  }

  if (loading) return <LoadingState />;

  const sortedCats = [...categories].sort((a, b) => a.position - b.position);
  const sortedSubs = selCat ? [...(selCat.service_sub_services ?? [])].sort((a, b) => a.position - b.position) : [];

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      {/* Language toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium">Language:</span>
        <div className="flex gap-1 rounded-md border border-[hsl(var(--border))] p-0.5">
          {(['en', 'de'] as Locale[]).map((l) => (
            <button key={l} onClick={() => setLocale(l)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${locale === l ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            >{l === 'en' ? '🇺🇸 EN' : '🇩🇪 DE'}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_240px_1fr]">
        {/* ── Col 1: Categories ─────────────────────────────────────────── */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Categories</span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={newCategory}><Plus className="h-3 w-3" /></Button>
          </div>
          {sortedCats.map((cat) => (
            <div key={cat.id}
              className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors ${(selCat?.id === cat.id && !catNew) ? 'border-[hsl(var(--ring))] bg-[hsl(var(--primary))]/10' : 'border-transparent hover:bg-[hsl(var(--muted))]/50'}`}
              onClick={() => { setSelCat(cat); applyCatForm(cat); setSelSub(null); setSubNew(false); const subs = [...(cat.service_sub_services ?? [])].sort((a,b) => a.position - b.position); if (subs[0]) { setSelSub(subs[0]); applySubForm(subs[0]); } }}
            >
              <Layers className="h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{cat.translations?.[locale]?.title || cat.slug}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">/{cat.slug}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); moveCategory(cat, -1); }} className="rounded p-0.5 hover:bg-[hsl(var(--muted))]"><ChevronUp className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); moveCategory(cat, 1);  }} className="rounded p-0.5 hover:bg-[hsl(var(--muted))]"><ChevronDown className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
          {catNew && (
            <div className="rounded-lg border border-dashed border-[hsl(var(--ring))] bg-[hsl(var(--primary))]/5 p-2">
              <p className="text-xs font-medium text-[hsl(var(--primary))]">+ New category</p>
            </div>
          )}
        </aside>

        {/* ── Col 2: Sub-services ───────────────────────────────────────── */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Sub-services</span>
            {selCat && !catNew && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={newSubService}><Plus className="h-3 w-3" /></Button>
            )}
          </div>
          {!selCat && !catNew && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">← Select a category</p>
          )}
          {sortedSubs.map((sub) => (
            <div key={sub.id}
              className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors ${(selSub?.id === sub.id && !subNew) ? 'border-[hsl(var(--ring))] bg-[hsl(var(--primary))]/10' : 'border-transparent hover:bg-[hsl(var(--muted))]/50'}`}
              onClick={() => { setSelSub(sub); applySubForm(sub); }}
            >
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{sub.translations?.[locale]?.title || '(untitled)'}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{sub.path || '—'}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <button onClick={(e) => { e.stopPropagation(); moveSub(sub, -1); }} className="rounded p-0.5 hover:bg-[hsl(var(--muted))]"><ChevronUp className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); moveSub(sub, 1);  }} className="rounded p-0.5 hover:bg-[hsl(var(--muted))]"><ChevronDown className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
          {subNew && (
            <div className="rounded-lg border border-dashed border-[hsl(var(--ring))] bg-[hsl(var(--primary))]/5 p-2">
              <p className="text-xs font-medium text-[hsl(var(--primary))]">+ New sub-service</p>
            </div>
          )}
        </aside>

        {/* ── Col 3: Editor ─────────────────────────────────────────────── */}
        <main className="space-y-4 min-w-0">
          {/* Category editor */}
          {(catNew || (selCat && !selSub && !subNew)) && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[hsl(var(--foreground))]">
                  {catNew ? 'New Category' : `Category — ${catForm.slug}`}
                </h3>
                <div className="flex gap-2">
                  {!catNew && selCat && (
                    <Button variant="destructive" size="sm" className="h-8" onClick={() => setDel({ type: 'category', id: selCat.id, name: catForm.translations.en.title || selCat.slug })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" className="h-8" onClick={saveCategory} disabled={saving}>
                    <Save className="mr-1 h-3 w-3" />{saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Slug</label>
                  <input className={INPUT} value={catForm.slug} onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value }))} placeholder="formtechnik" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Hero Image URL</label>
                  <input className={INPUT} value={catForm.image} onChange={(e) => setCatForm((f) => ({ ...f, image: e.target.value }))} placeholder="/images/mold-close.webp" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Title ({locale.toUpperCase()})</label>
                  <input className={INPUT} value={catForm.translations[locale].title} onChange={(e) => setCatForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], title: e.target.value } } }))} placeholder="What I Offer" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Paragraph ({locale.toUpperCase()})</label>
                  <input className={INPUT} value={catForm.translations[locale].paragraph} onChange={(e) => setCatForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], paragraph: e.target.value } } }))} placeholder="Short description…" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Tags (comma-separated)</label>
                  <input className={INPUT} value={catForm.tags} onChange={(e) => setCatForm((f) => ({ ...f, tags: e.target.value }))} placeholder="Formentechnik, Mold" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={catForm.is_active} onChange={(e) => setCatForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded border-[hsl(var(--input))]" />
                <span className="text-xs text-[hsl(var(--foreground))]">Active / visible on website</span>
              </label>
            </Card>
          )}

          {/* Sub-service editor */}
          {(subNew || selSub) && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[hsl(var(--foreground))]">
                  {subNew ? 'New Sub-service' : `Edit — ${subForm.translations.en.title || '(untitled)'}`}
                </h3>
                <div className="flex gap-2">
                  {!subNew && selSub && (
                    <Button variant="destructive" size="sm" className="h-8" onClick={() => setDel({ type: 'sub', id: selSub.id, name: subForm.translations.en.title || '(untitled)' })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" className="h-8" onClick={saveSubService} disabled={saving}>
                    <Save className="mr-1 h-3 w-3" />{saving ? 'Saving…' : 'Save Info'}
                  </Button>
                </div>
              </div>

              {/* Path + Images */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">URL Path</label>
                  <input className={INPUT} value={subForm.path} onChange={(e) => setSubForm((f) => ({ ...f, path: e.target.value }))} placeholder="/werkzeugherstellung" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Gallery Images (comma-separated URLs)</label>
                  <input className={INPUT} value={subForm.images} onChange={(e) => setSubForm((f) => ({ ...f, images: e.target.value }))} placeholder="/images/blog/img-01.jpg, …" />
                </div>
              </div>

              {/* Translations */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                  Content — {locale.toUpperCase()}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[hsl(var(--foreground))]">Title</label>
                    <input className={INPUT} value={subForm.translations[locale].title} onChange={(e) => setSubForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], title: e.target.value } } }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[hsl(var(--foreground))]">Short Description</label>
                    <input className={INPUT} value={subForm.translations[locale].description} onChange={(e) => setSubForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], description: e.target.value } } }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">Paragraph</label>
                  <textarea rows={3} className={INPUT} value={subForm.translations[locale].paragraph} onChange={(e) => setSubForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], paragraph: e.target.value } } }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[hsl(var(--foreground))]">CTA Text</label>
                  <input className={INPUT} value={subForm.translations[locale].cta} onChange={(e) => setSubForm((f) => ({ ...f, translations: { ...f.translations, [locale]: { ...f.translations[locale], cta: e.target.value } } }))} placeholder="Contact us to…" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={subForm.is_active} onChange={(e) => setSubForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded border-[hsl(var(--input))]" />
                <span className="text-xs text-[hsl(var(--foreground))]">Active / visible</span>
              </label>

              {/* ── Nested lists ──────────────────────────────────────── */}
              <div className="border-t border-[hsl(var(--border))] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Bullet Lists</p>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={addNestedList}><Plus className="h-3 w-3 mr-1" />Add Group</Button>
                </div>

                {subForm.service_nested_lists.map((list, li) => (
                  <div key={list.id} className="rounded-lg border border-[hsl(var(--border))] p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))] flex-shrink-0" />
                      <input
                        className={INPUT + ' flex-1'}
                        value={list.translations?.[locale]?.title ?? ''}
                        onChange={(e) => updateListTitle(li, locale, e.target.value)}
                        placeholder="Group heading (e.g. Key Equipment:)"
                      />
                      <button onClick={() => removeNestedList(li)} className="flex-shrink-0 rounded p-1 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {list.service_nested_list_items.map((item, ii) => (
                      <div key={item.id} className="flex items-center gap-2 ml-6">
                        <span className="text-[hsl(var(--muted-foreground))] text-xs">•</span>
                        <input
                          className={INPUT + ' flex-1'}
                          value={item.translations?.[locale]?.text ?? ''}
                          onChange={(e) => updateItemText(li, ii, locale, e.target.value)}
                          placeholder="Bullet item text…"
                        />
                        <button onClick={() => removeListItem(li, ii)} className="flex-shrink-0 rounded p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addListItem(li)} className="ml-6 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                      <Plus className="h-3 w-3" /> Add item
                    </button>
                  </div>
                ))}

                {!subNew && selSub && subForm.service_nested_lists.length > 0 && (
                  <Button size="sm" onClick={saveNestedLists} disabled={saving} className="w-full">
                    <Save className="mr-1 h-3 w-3" />{saving ? 'Saving lists…' : 'Save Bullet Lists'}
                  </Button>
                )}
              </div>
            </Card>
          )}

          {!selCat && !catNew && (
            <Card className="p-12 text-center">
              <Layers className="mx-auto h-12 w-12 text-[hsl(var(--muted-foreground))]" />
              <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">Select a category</h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">or click + to create one</p>
            </Card>
          )}
        </main>
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          title={`Delete ${deleteTarget.type}`}
          message={`Permanently delete "${deleteTarget.name}"? All nested content will also be removed.`}
          onCancel={() => setDel(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
