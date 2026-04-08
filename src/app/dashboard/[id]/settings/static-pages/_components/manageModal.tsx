'use client';

import { Button } from '@/components/ui/button';
import { DeleteConfirmModal } from './DeleteConfirmModal';

export function normalizeSlug(input: string) {
  return (input || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_/]/g, '')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function slugFromTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export type CreateFormValue = {
  title: string;
  slug: string;
  content: string;
  content_format: 'html' | 'markdown';
  meta_description: string;
  is_published: boolean;
};

export function CreatePageModal({
  saving,
  existingSlugs,
  value,
  onChange,
  onCancel,
  onCreate,
}: {
  saving: boolean;
  existingSlugs: Set<string>;
  value: CreateFormValue;
  onChange: (next: CreateFormValue) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const normalized = normalizeSlug(value.slug);
  const slugTaken = normalized ? existingSlugs.has(normalized) : false;

  function handleTitleChange(title: string) {
    const next: CreateFormValue = { ...value, title };
    // Auto-derive slug from title only if user hasn't manually edited it
    if (!value.slug || value.slug === slugFromTitle(value.title)) {
      next.slug = slugFromTitle(title);
    }
    onChange(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-6">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Create Static Page
          </h2>

          <button
            onClick={onCancel}
            className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Title
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={value.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Terms & Conditions"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Format
              </label>
              <select
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={value.content_format}
                onChange={(e) =>
                  onChange({
                    ...value,
                    content_format: e.target.value as 'html' | 'markdown',
                  })
                }
              >
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-3">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Slug
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Auto-generated from title — edit to override
                </span>
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={value.slug}
                onChange={(e) => onChange({ ...value, slug: e.target.value })}
                placeholder="auto-generated"
              />
              {slugTaken ? (
                <p className="text-xs text-[hsl(var(--destructive))]">
                  That slug is already used by another page.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Content
            </label>
            <textarea
              rows={10}
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
              value={value.content}
              onChange={(e) => onChange({ ...value, content: e.target.value })}
              placeholder={
                value.content_format === 'html'
                  ? '<div>...</div>'
                  : '# Heading\n\nBody...'
              }
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Meta Description (SEO)
            </label>
            <textarea
              rows={2}
              maxLength={160}
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
              value={value.meta_description}
              onChange={(e) =>
                onChange({ ...value, meta_description: e.target.value })
              }
              placeholder="Brief description for search engines..."
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {value.meta_description.length}/160 characters
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.is_published}
              onChange={(e) =>
                onChange({ ...value, is_published: e.target.checked })
              }
              className="h-4 w-4 rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
            />
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              Published (visible on website)
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] p-6">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={saving || !normalized || slugTaken}>
            {saving ? 'Creating...' : 'Create Page'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DeletePageModal({
  open,
  title,
  slug,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  slug: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <DeleteConfirmModal
      title="Delete page"
      message={`This will permanently delete \"${title}\" (/${slug}). This cannot be undone.`}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}