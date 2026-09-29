// app/dashboard/[id]/settings/storage/page.tsx
'use client';

// Supabase storage browser — every bucket, folder-style.
//
// The old "Storage" sidebar entry pointed at /Documents, which renders
// <OrdersManager>; clicking Storage opened Orders. This is the real thing.

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Folder, File as FileIcon, Trash2, RefreshCw, Lock, Globe } from 'lucide-react';

type Bucket = {
  id: string;
  name: string;
  public: boolean;
  sizeLimit: number | null;
  mimeTypes: string[] | null;
};

type FileRow = {
  name: string;
  path: string;
  size: number | null;
  mimeType: string | null;
  updatedAt: string | null;
  publicUrl: string | null;
};

function bytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function StoragePage() {
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBuckets = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/storage/browse', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `failed (${res.status})`);
      setBuckets(body.buckets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load buckets');
    }
  }, []);

  const loadPath = useCallback(async (b: string, p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/storage/browse?bucket=${encodeURIComponent(b)}&prefix=${encodeURIComponent(p)}`,
        { cache: 'no-store' }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `failed (${res.status})`);
      setFolders(body.folders ?? []);
      setFiles(body.files ?? []);
      setIsPublic(!!body.isPublic);
      setTruncated(!!body.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not list objects');
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBuckets(); }, [loadBuckets]);
  useEffect(() => { if (bucket) void loadPath(bucket, prefix); }, [bucket, prefix, loadPath]);

  async function remove(path: string) {
    if (!bucket) return;
    if (!confirm(`Delete "${path}" from ${bucket}? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/storage/browse?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
        { method: 'DELETE' }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `failed (${res.status})`);
      await loadPath(bucket, prefix);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const crumbs = prefix ? prefix.replace(/\/$/, '').split('/') : [];
  const card = 'rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]';

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Storage</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Every Supabase bucket, browsable as folders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (bucket ? void loadPath(bucket, prefix) : void loadBuckets())}
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

      {/* Bucket list */}
      {!bucket && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {buckets === null && <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading buckets…</p>}
          {buckets?.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { setBucket(b.name); setPrefix(''); }}
              className={`${card} p-4 text-left transition hover:border-[hsl(var(--primary))]`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[hsl(var(--card-foreground))]">{b.name}</span>
                {b.public
                  ? <Globe className="h-4 w-4 text-[hsl(var(--primary))]" aria-label="public" />
                  : <Lock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-label="private" />}
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                {b.public ? 'Public' : 'Private'}
                {b.sizeLimit ? ` · max ${bytes(b.sizeLimit)}` : ''}
              </p>
              {b.mimeTypes?.length ? (
                <p className="mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                  {b.mimeTypes.join(', ')}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {/* Object browser */}
      {bucket && (
        <>
          <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => { setBucket(null); setPrefix(''); }} className="text-[hsl(var(--primary))] hover:underline">
              All buckets
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
            <button type="button" onClick={() => setPrefix('')} className="text-[hsl(var(--primary))] hover:underline">
              {bucket}
            </button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                <button
                  type="button"
                  onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/') + '/')}
                  className="text-[hsl(var(--primary))] hover:underline"
                >
                  {c}
                </button>
              </span>
            ))}
            <span className="ml-2 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              {isPublic ? 'public' : 'private'}
            </span>
          </nav>

          <div className={`${card} divide-y divide-[hsl(var(--border))]`}>
            {loading && <p className="p-4 text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>}

            {!loading && folders.length === 0 && files.length === 0 && (
              <p className="p-4 text-sm text-[hsl(var(--muted-foreground))]">This folder is empty.</p>
            )}

            {folders.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setPrefix(prefix ? `${prefix.replace(/\/$/, '')}/${f}/` : `${f}/`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--muted)/0.4)]"
              >
                <Folder className="h-4 w-4 text-[hsl(var(--primary))]" />
                <span className="text-sm font-medium">{f}</span>
              </button>
            ))}

            {files.map((f) => (
              <div key={f.path} className="flex items-center gap-3 px-4 py-3">
                <FileIcon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                <div className="min-w-0 flex-1">
                  {f.publicUrl ? (
                    <a href={f.publicUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-[hsl(var(--primary))] hover:underline">
                      {f.name}
                    </a>
                  ) : (
                    <span className="block truncate text-sm">{f.name}</span>
                  )}
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {bytes(f.size)}{f.mimeType ? ` · ${f.mimeType}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(f.path)}
                  aria-label={`Delete ${f.name}`}
                  className="rounded-md p-2 text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--destructive))]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {truncated && (
            <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
              Showing the first 100 entries in this folder.
            </p>
          )}
        </>
      )}
    </div>
  );
}
