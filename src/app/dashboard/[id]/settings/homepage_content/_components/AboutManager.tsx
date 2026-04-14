'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Globe, Plus } from 'lucide-react';
import { LoadingState } from './LoadingState';
import { ErrorAlert } from './ErrorAlert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DEFAULT_LOCALES = [
  { id: 'en', label: '🇺🇸 English' },
  { id: 'de', label: '🇩🇪 Deutsch' },
];

type LocaleContent = { title: string; paragraph: string; description: string };
type Translations = Record<string, LocaleContent>;

const EMPTY: LocaleContent = { title: '', paragraph: '', description: '' };

export function AboutManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [locales, setLocales] = useState<{id: string, label: string}[]>(DEFAULT_LOCALES);
  const [locale, setLocale]   = useState('en');
  const [translations, setTranslations] = useState<Translations>({ en: { ...EMPTY }, de: { ...EMPTY } });

  const [isAddLanguageOpen, setIsAddLanguageOpen] = useState(false);
  const [newLangId, setNewLangId] = useState('');
  const [newLangLabel, setNewLangLabel] = useState('');

  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('homepage_content')
      .select('json')
      .eq('key', 'about_page')
      .single();

    if (error && error.code !== 'PGRST116') { setError(error.message); }
    if (data?.json) {
      const loadedLocales = data.json.locales || DEFAULT_LOCALES;
      setLocales(loadedLocales);
      
      if (data.json.translations) {
        const loadedTranslations: Translations = {};
        loadedLocales.forEach((l: { id: string }) => {
          loadedTranslations[l.id] = { ...EMPTY, ...(data.json.translations[l.id] || {}) };
        });
        setTranslations(loadedTranslations);
      }
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('homepage_content')
      .upsert({ key: 'about_page', json: { locales, translations } }, { onConflict: 'key' });

    if (error) { setError(error.message); }
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  }

  function handleAddLanguage() {
    if (!newLangId.trim() || !newLangLabel.trim()) return;
    const normalizedId = newLangId.trim().toLowerCase();
    if (locales.find((l) => l.id === normalizedId)) {
      setError('Language ID already exists.');
      return;
    }

    setLocales((prev) => [...prev, { id: normalizedId, label: newLangLabel.trim() }]);
    setTranslations((prev) => ({
      ...prev,
      [normalizedId]: { ...EMPTY },
    }));
    setLocale(normalizedId);
    setNewLangId('');
    setNewLangLabel('');
    setIsAddLanguageOpen(false);
  }

  function update(field: keyof LocaleContent, value: string) {
    setTranslations((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], [field]: value },
    }));
  }

  if (loading) return <LoadingState />;

  const t = translations[locale] || EMPTY;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">Editing language:</span>
          <div className="flex flex-wrap gap-1 rounded-md border border-[hsl(var(--border))] p-0.5">
            {locales.map((l) => (
              <button
                key={l.id}
                onClick={() => setLocale(l.id)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  locale === l.id
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => setIsAddLanguageOpen(true)}
              className="rounded px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors flex items-center justify-center"
              title="Add Language"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Button onClick={save} disabled={saving} size="sm">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <Card className="p-6 space-y-5">
        {/* Title */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
            Page Title
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
              Shown in the breadcrumb header
            </span>
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
            value={t.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder={locale === 'de' ? 'Über Uns' : 'About Me'}
          />
        </div>

        {/* Paragraph */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
            Sub-heading / Tagline
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
              Shown below the title in the breadcrumb
            </span>
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
            value={t.paragraph}
            onChange={(e) => update('paragraph', e.target.value)}
            placeholder={locale === 'de' ? 'Formen Werkstatt…' : 'Im 22 from Socal…'}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
            Description / Quote
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
              The main body text shown in the about section
            </span>
          </label>
          <textarea
            rows={5}
            className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
            value={t.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Enter a description or quote…"
          />
        </div>
      </Card>

      {/* Preview of both locales */}
      <Card className="p-4 bg-[hsl(var(--muted))]/30">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          All Translations
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {locales.map((l) => (
            <div key={l.id} className={`rounded-md p-3 text-xs ${locale === l.id ? 'ring-1 ring-[hsl(var(--ring))]' : 'opacity-60 border border-[hsl(var(--border))]'}`}>
              <p className="font-semibold mb-1">{l.label}</p>
              <p><span className="text-[hsl(var(--muted-foreground))]">Title: </span>{(translations[l.id] && translations[l.id].title) || '—'}</p>
              <p className="mt-1"><span className="text-[hsl(var(--muted-foreground))]">Tagline: </span>{(translations[l.id] && translations[l.id].paragraph) || '—'}</p>
              <p className="mt-1 line-clamp-2"><span className="text-[hsl(var(--muted-foreground))]">Desc: </span>{(translations[l.id] && translations[l.id].description) || '—'}</p>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={isAddLanguageOpen} onOpenChange={setIsAddLanguageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Language</DialogTitle>
            <DialogDescription>
              Enter the abbreviation and label for the new language. 
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">Abbreviation</label>
              <input
                type="text"
                placeholder="e.g. es, fr, ja"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={newLangId}
                onChange={(e) => setNewLangId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">Label</label>
              <input
                type="text"
                placeholder="e.g. 🇪🇸 Spanish"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={newLangLabel}
                onChange={(e) => setNewLangLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddLanguageOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLanguage}>Add Language</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
