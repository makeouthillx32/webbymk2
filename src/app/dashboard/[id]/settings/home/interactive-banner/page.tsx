// app/dashboard/[id]/settings/home/interactive-banner/page.tsx
'use client';

// Interactive Banner configuration — replaces the Home "Hero Carousel" slot.
//
// Home has no hero carousel (hero_slides has zero page="home" rows and never
// had any); its hero IS the interactive banner — 4K video + starry backdrop +
// three.js logo. So this slot configures that instead of managing slides that
// don't exist.
//
// Every asset resolves through the site_assets registry, so uploading here is
// live on the next page load: no rebuild, no redeploy. Clearing a slot reverts
// to the URL baked into LANDING_ASSETS.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, RotateCcw, RefreshCw, Film, Box } from 'lucide-react';

type Slot = {
  slot: string;
  key: string;
  label: string;
  hint: string;
  kind: 'video' | 'model';
  accept: string;
  maxBytes: number;
  url: string | null;
  format: string | null;
  updatedAt: string | null;
};

function mb(n: number) {
  return `${Math.round(n / 1024 / 1024)} MB`;
}

export default function InteractiveBannerPage() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/landing/banner-assets', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `load failed (${res.status})`);
      setSlots(body.slots as Slot[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load banner assets');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function upload(slot: string, file: File) {
    setBusy(slot); setError(null); setNotice(null);
    try {
      const fd = new FormData();
      fd.append('slot', slot);
      fd.append('file', file);
      const res = await fetch('/api/landing/banner-assets', { method: 'POST', body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `upload failed (${res.status})`);
      setNotice('Updated — live on the next page load, no rebuild needed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (inputs.current[slot]) inputs.current[slot]!.value = '';
    }
  }

  async function revert(slot: string) {
    setBusy(slot); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/landing/banner-assets?slot=${slot}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `revert failed (${res.status})`);
      setNotice('Reverted to the default asset.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revert failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Interactive Banner</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            The Core home hero — 4K video, starry backdrop and the 3D logo. Swap any of them
            here; changes are live immediately without a rebuild.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-md border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.1)] px-3 py-2 text-sm text-[hsl(var(--primary))]">
          {notice}
        </p>
      )}

      {slots === null ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {slots.map((s) => {
            const isBusy = busy === s.slot;
            const Icon = s.kind === 'model' ? Box : Film;
            return (
              <div
                key={s.slot}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-[hsl(var(--card-foreground))]">
                    <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                    {s.label}
                  </span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-xs font-medium ' +
                      (s.url
                        ? 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]')
                    }
                  >
                    {s.url ? `custom · ${s.format}` : 'default'}
                  </span>
                </div>
                <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">{s.hint}</p>

                <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)]">
                  {s.kind === 'video' && s.url ? (
                    <video
                      src={`${s.url}?v=${encodeURIComponent(s.updatedAt ?? '')}`}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <span className="px-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
                      {s.kind === 'model'
                        ? s.url
                          ? 'Custom model uploaded'
                          : 'Using the default model'
                        : 'Using the default video'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={(el) => { inputs.current[s.slot] = el; }}
                    type="file"
                    accept={s.accept}
                    disabled={isBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(s.slot, f);
                    }}
                    className="hidden"
                    id={`slot-${s.slot}`}
                  />
                  <label
                    htmlFor={`slot-${s.slot}`}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {isBusy ? 'Uploading…' : s.url ? 'Replace' : 'Upload'}
                  </label>
                  {s.url && (
                    <button
                      type="button"
                      onClick={() => void revert(s.slot)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--destructive))] disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Revert
                    </button>
                  )}
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    max {mb(s.maxBytes)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-[hsl(var(--muted-foreground))]">
        Home has no hero carousel — its hero is this banner. Slides live under Shop and Labs.
      </p>
    </div>
  );
}
