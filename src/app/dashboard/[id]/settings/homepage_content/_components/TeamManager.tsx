'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Plus, Pencil, Trash2, UserCircle2, Search, X, Save } from 'lucide-react';
import { LoadingState } from './LoadingState';
import { ErrorAlert } from './ErrorAlert';
import { DeleteConfirmModal } from './DeleteConfirmModal';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── MemberModal ───────────────────────────────────────────────────────────────

function MemberModal({
  member,
  memberCount,
  onClose,
  onSaved,
}: {
  member: TeamMember | null; // null = create new
  memberCount: number;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [form, setForm]     = useState<MemberForm>(() =>
    member
      ? {
          image_url: member.image_url ?? '',
          position: member.position,
          tags: member.tags ?? [],
          is_active: member.is_active,
          translations: {
            en: { name: member.translations?.en?.name ?? '', role: member.translations?.en?.role ?? '' },
            de: { name: member.translations?.de?.name ?? '', role: member.translations?.de?.role ?? '' },
          },
        }
      : { ...EMPTY_FORM, position: memberCount }
  );

  function updateLocale(field: 'name' | 'role', value: string) {
    setForm((f) => ({
      ...f,
      translations: { ...f.translations, [locale]: { ...f.translations[locale], [field]: value } },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    if (member) {
      const { error } = await supabase.from('team_members').update(form).eq('id', member.id);
      if (error) { setError(error.message); setSaving(false); return; }
      onSaved(member.id);
    } else {
      const { data, error } = await supabase.from('team_members').insert([form]).select('id').single();
      if (error) { setError(error.message); setSaving(false); return; }
      onSaved(data.id);
    }
    setSaving(false);
  }

  const inputCls =
    'w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {member ? `Edit — ${member.translations?.en?.name || 'Team Member'}` : 'New Team Member'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

          {/* Avatar preview + URL */}
          <div className="flex gap-4 items-start">
            <div className="h-16 w-16 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden flex-shrink-0">
              {form.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserCircle2 className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Photo URL</label>
              <input
                type="text"
                className={inputCls}
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="/images/team/member.jpg"
              />
            </div>
          </div>

          {/* Locale tabs */}
          <div>
            <div className="mb-3 flex gap-1 rounded-md border border-[hsl(var(--border))] p-0.5 w-fit">
              {(['en', 'de'] as Locale[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Name <span className="text-xs text-[hsl(var(--muted-foreground))]">({locale.toUpperCase()})</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.translations[locale].name}
                  onChange={(e) => updateLocale('name', e.target.value)}
                  placeholder="Unenter"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Role <span className="text-xs text-[hsl(var(--muted-foreground))]">({locale.toUpperCase()})</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.translations[locale].role}
                  onChange={(e) => updateLocale('role', e.target.value)}
                  placeholder="Founder"
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Tags <span className="text-xs text-[hsl(var(--muted-foreground))]">Comma-separated</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={form.tags.join(', ')}
              onChange={(e) =>
                setForm((f) => ({ ...f, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))
              }
              placeholder="Coding, Streaming, Dev"
            />
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {form.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--foreground))]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-[hsl(var(--input))] accent-[hsl(var(--primary))]"
            />
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">Visible on website</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(var(--border))]">
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-4 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
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

// ── TeamManager ───────────────────────────────────────────────────────────────

export function TeamManager() {
  const supabase = createClient();
  const [members, setMembers]     = useState<TeamMember[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [editTarget, setEdit]     = useState<TeamMember | null | 'new'>('new' as never); // track modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDelete] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('position');
    if (error) setError(error.message);
    setMembers((data ?? []) as TeamMember[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.translations?.en?.name ?? '').toLowerCase().includes(q) ||
        (m.translations?.en?.role ?? '').toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [members, search]);

  function openCreate() {
    setEdit(null);
    setModalOpen(true);
  }

  function openEdit(m: TeamMember) {
    setEdit(m);
    setModalOpen(true);
  }

  function handleModalSaved() {
    setModalOpen(false);
    setEdit(null);
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('team_members').delete().eq('id', deleteTarget.id);
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
            placeholder="Search members…"
            className="h-10 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] pl-9 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          New Member
        </button>
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      {/* Table */}
      <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--muted))]/60 border-b border-[hsl(var(--border))]">
                <th className="py-2.5 px-4 w-12" />
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                  Role
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                  Tags
                </th>
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                  Status
                </th>
                <th className="py-2.5 px-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    {search ? 'No members match your search.' : 'No team members yet. Add your first one above.'}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/40 transition-colors group"
                  >
                    {/* Avatar */}
                    <td className="py-2.5 px-4 w-12">
                      <div className="w-9 h-9 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden shrink-0">
                        {m.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <UserCircle2 className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                        )}
                      </div>
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-[hsl(var(--foreground))]">
                        {m.translations?.en?.name || '—'}
                      </span>
                    </td>

                    {/* Role */}
                    <td className="py-2.5 px-3 text-[hsl(var(--muted-foreground))]">
                      {m.translations?.en?.role || '—'}
                    </td>

                    {/* Tags */}
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {(m.tags ?? []).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--foreground))]"
                          >
                            {tag}
                          </span>
                        ))}
                        {(m.tags ?? []).length > 3 && (
                          <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                            +{m.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3">
                      {m.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Active
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
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                          title="Edit member"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDelete(m)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-[hsl(var(--muted-foreground))] hover:text-red-600 transition-colors"
                          title="Delete member"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modalOpen && (
        <MemberModal
          member={editTarget as TeamMember | null}
          memberCount={members.length}
          onClose={() => { setModalOpen(false); setEdit(null); }}
          onSaved={handleModalSaved}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title="Remove team member"
          message={`Remove "${deleteTarget.translations?.en?.name ?? 'this member'}" from the team? This cannot be undone.`}
          onCancel={() => setDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
