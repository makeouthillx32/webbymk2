'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Users } from 'lucide-react';
import { LoadingState } from './LoadingState';
import { ErrorAlert } from './ErrorAlert';
import { DeleteConfirmModal } from './DeleteConfirmModal';

const LOCALES = ['en', 'de'] as const;
type Locale = 'en' | 'de';

type TeamMember = {
  id: string;
  image_url: string;
  position: number;
  tags: string[];
  is_active: boolean;
  translations: Record<Locale, { name: string; role: string }>;
};

type MemberForm = Omit<TeamMember, 'id'>;

const EMPTY_FORM: MemberForm = {
  image_url: '',
  position: 0,
  tags: [],
  is_active: true,
  translations: { en: { name: '', role: '' }, de: { name: '', role: '' } },
};

export function TeamManager() {
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [members, setMembers]       = useState<TeamMember[]>([]);
  const [selected, setSelected]     = useState<TeamMember | null>(null);
  const [form, setForm]             = useState<MemberForm>({ ...EMPTY_FORM });
  const [locale, setLocale]         = useState<Locale>('en');
  const [deleteTarget, setDelete]   = useState<TeamMember | null>(null);
  const [isNew, setIsNew]           = useState(false);

  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load(selectId?: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('position');
    if (error) setError(error.message);
    const list = (data ?? []) as TeamMember[];
    setMembers(list);
    if (list.length > 0) {
      const target = selectId ? list.find((m) => m.id === selectId) : list[0];
      selectMember(target ?? list[0]);
    }
    setLoading(false);
  }

  function selectMember(m: TeamMember) {
    setSelected(m);
    setIsNew(false);
    setForm({
      image_url: m.image_url,
      position: m.position,
      tags: m.tags ?? [],
      is_active: m.is_active,
      translations: {
        en: { name: m.translations?.en?.name ?? '', role: m.translations?.en?.role ?? '' },
        de: { name: m.translations?.de?.name ?? '', role: m.translations?.de?.role ?? '' },
      },
    });
  }

  function startNew() {
    setSelected(null);
    setIsNew(true);
    setForm({ ...EMPTY_FORM, position: members.length });
  }

  function updateLocale(field: 'name' | 'role', value: string) {
    setForm((f) => ({
      ...f,
      translations: { ...f.translations, [locale]: { ...f.translations[locale], [field]: value } },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    if (isNew) {
      const { data, error } = await supabase
        .from('team_members')
        .insert([form])
        .select('id')
        .single();
      if (error) { setError(error.message); setSaving(false); return; }
      await load(data.id);
    } else if (selected) {
      const { error } = await supabase
        .from('team_members')
        .update(form)
        .eq('id', selected.id);
      if (error) { setError(error.message); setSaving(false); return; }
      await load(selected.id);
    }
    setSaving(false);
  }

  async function move(m: TeamMember, dir: -1 | 1) {
    const sorted = [...members].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((x) => x.id === m.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await supabase.from('team_members').update({ position: swap.position }).eq('id', m.id);
    await supabase.from('team_members').update({ position: m.position }).eq('id', swap.id);
    await load(selected?.id);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('team_members').delete().eq('id', deleteTarget.id);
    if (error) setError(error.message);
    setDelete(null);
    setSelected(null);
    setIsNew(false);
    await load();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className="space-y-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Team Members</h3>
          <Button size="sm" variant="outline" onClick={startNew}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        {members.length === 0 ? (
          <Card className="p-6 text-center">
            <Users className="mx-auto h-8 w-8 text-[hsl(var(--muted-foreground))]" />
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No team members yet</p>
          </Card>
        ) : (
          <div className="space-y-1">
            {[...members].sort((a, b) => a.position - b.position).map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-2 rounded-lg border p-2 transition-colors cursor-pointer ${
                  selected?.id === m.id && !isNew
                    ? 'border-[hsl(var(--ring))] bg-[hsl(var(--primary))]/10'
                    : 'border-transparent hover:bg-[hsl(var(--muted))]/50'
                }`}
                onClick={() => selectMember(m)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.image_url} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0 bg-[hsl(var(--muted))]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{m.translations?.en?.name || '—'}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{m.translations?.en?.role || ''}</p>
                </div>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); move(m, -1); }} className="rounded p-0.5 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><ChevronUp className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); move(m, 1); }}  className="rounded p-0.5 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><ChevronDown className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Editor panel */}
      <main>
        {(selected || isNew) ? (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                {isNew ? 'New Team Member' : `Edit — ${selected?.translations?.en?.name ?? ''}`}
              </h2>
              <div className="flex gap-2">
                {!isNew && selected && (
                  <Button variant="destructive" size="sm" onClick={() => setDelete(selected)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                )}
                <Button size="sm" onClick={save} disabled={saving}>
                  <Save className="mr-1 h-4 w-4" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>

            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

            <Card className="p-5 space-y-5">
              {/* Image URL */}
              <div className="flex gap-4 items-start">
                {form.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.image_url} alt="" className="h-16 w-16 rounded-xl object-cover flex-shrink-0 bg-[hsl(var(--muted))]" />
                )}
                <div className="flex-1 space-y-2">
                  <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Photo URL</label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                    placeholder="/images/testimonials/auth-01.png"
                  />
                </div>
              </div>

              {/* Language tabs */}
              <div>
                <div className="mb-3 flex gap-1 rounded-md border border-[hsl(var(--border))] p-0.5 w-fit">
                  {LOCALES.map((l) => (
                    <button key={l} onClick={() => setLocale(l)}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        locale === l
                          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                      }`}
                    >{l === 'en' ? '🇺🇸 EN' : '🇩🇪 DE'}</button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Name ({locale.toUpperCase()})</label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                      value={form.translations[locale].name}
                      onChange={(e) => updateLocale('name', e.target.value)}
                      placeholder="Unenter"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Role ({locale.toUpperCase()})</label>
                    <input
                      type="text"
                      className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                      value={form.translations[locale].role}
                      onChange={(e) => updateLocale('role', e.target.value)}
                      placeholder="Founder"
                    />
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Tags
                  <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">Comma-separated</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={form.tags.join(', ')}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="Floral, Highlands, Wildflowers"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--foreground))]">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-[hsl(var(--input))]"
                />
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">Visible on website</span>
              </label>
            </Card>
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-[hsl(var(--muted-foreground))]" />
            <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">Select a team member</h3>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">or click Add to create one</p>
          </Card>
        )}
      </main>

      {deleteTarget && (
        <DeleteConfirmModal
          title="Remove team member"
          message={`Remove "${deleteTarget.translations?.en?.name ?? ''}" from the team? This cannot be undone.`}
          onCancel={() => setDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
