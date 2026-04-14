'use client';

import { useMemo, useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ExternalLink,
  Save,
  FileText,
  Shield,
  Info,
  Plus,
  Trash2,
} from 'lucide-react';
import { LoadingState } from './LoadingState';
import { ErrorAlert } from './ErrorAlert';
import { CreatePageModal, DeletePageModal, normalizeSlug } from './manageModal';
import { createStaticPage } from './createPage';

type StaticPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  content_format: 'html' | 'markdown';
  meta_description: string | null;
  is_published: boolean;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

const PAGE_CONFIGS = {
  'privacy-policy': {
    icon: <Shield className="h-4 w-4" />,
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect customer data',
  },
  'terms-and-conditions': {
    icon: <FileText className="h-4 w-4" />,
    title: 'Terms & Conditions',
    description: 'Legal terms for using the boutique',
  },
  'about-us': {
    icon: <Info className="h-4 w-4" />,
    title: 'About Desert Cowgirl',
    description: 'Brand story and philosophy',
  },
};

export function StaticPagesManager() {
  const [pages, setPages] = useState<StaticPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<StaticPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    content: '',
    content_format: 'html' as 'html' | 'markdown',
    slug: '',
    meta_description: '',
    is_published: true,
  });

  const [createForm, setCreateForm] = useState({
    title: '',
    slug: '',
    content: '',
    content_format: 'html' as 'html' | 'markdown',
    meta_description: '',
    is_published: true,
  });

  const supabase = createClient();

  useEffect(() => {
    fetchPages();
  }, []);

  useEffect(() => {
    if (selectedPage) {
      setEditForm({
        title: selectedPage.title,
        content: selectedPage.content,
        content_format: selectedPage.content_format,
        slug: selectedPage.slug,
        meta_description: selectedPage.meta_description || '',
        is_published: selectedPage.is_published,
      });
    }
  }, [selectedPage]);

  const existingSlugs = useMemo(
    () => new Set((pages ?? []).map((p) => normalizeSlug(p.slug))),
    [pages]
  );

  async function fetchPages(selectId?: string | null) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('static_pages')
        .select('*')
        .order('slug');

      if (error) throw error;
      const list = (data || []) as StaticPage[];
      setPages(list);

      const targetId = selectId ?? selectedPage?.id ?? null;
      if (list.length > 0) {
        const found = targetId ? list.find((p) => p.id === targetId) : null;
        setSelectedPage(found ?? list[0]);
      } else {
        setSelectedPage(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedPage) return;

    const nextSlug = normalizeSlug(editForm.slug);
    if (!nextSlug) {
      setError('Slug is required.');
      return;
    }

    const currentSlug = normalizeSlug(selectedPage.slug);
    if (nextSlug !== currentSlug && existingSlugs.has(nextSlug)) {
      setError(`Slug "/${nextSlug}" is already in use.`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('static_pages')
        .update({
          title: editForm.title,
          content: editForm.content,
          content_format: editForm.content_format,
          slug: nextSlug,
          meta_description: editForm.meta_description || null,
          is_published: editForm.is_published,
          version: selectedPage.version + 1,
        })
        .eq('id', selectedPage.id);

      if (updateError) throw updateError;

      await fetchPages(selectedPage.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const slug = normalizeSlug(createForm.slug);
    if (!slug) {
      setError('Slug is required.');
      return;
    }
    if (existingSlugs.has(slug)) {
      setError(`Slug "/${slug}" is already in use.`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const data = await createStaticPage(supabase, {
        title: createForm.title,
        slug,
        content: createForm.content,
        content_format: createForm.content_format,
        meta_description: createForm.meta_description,
        is_published: createForm.is_published,
      });

      setCreateOpen(false);
      setCreateForm({
        title: '',
        slug: '',
        content: '',
        content_format: 'html',
        meta_description: '',
        is_published: true,
      });

      await fetchPages(data.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPage) return;
    try {
      setDeleting(true);
      setError(null);

      const { error } = await supabase
        .from('static_pages')
        .delete()
        .eq('id', selectedPage.id);
      if (error) throw error;

      setDeleteOpen(false);
      await fetchPages(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  function getPageConfig(slug: string) {
    return PAGE_CONFIGS[slug as keyof typeof PAGE_CONFIGS];
  }

  if (loading) return <LoadingState />;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Static Pages
          </h3>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Page
          </Button>
        </div>

        {pages.length === 0 ? (
          <Card className="p-6">
            <div className="text-center">
              <FileText className="mx-auto h-8 w-8 text-[hsl(var(--muted-foreground))]" />
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                No pages found
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Run the migration to create default pages.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-1">
            {pages.map((page) => {
              const config = getPageConfig(page.slug);
              return (
                <button
                  key={page.id}
                  onClick={() => setSelectedPage(page)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selectedPage?.id === page.id
                      ? 'border-[hsl(var(--ring))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                      : 'border-transparent hover:bg-[hsl(var(--muted))]/50'
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">{config?.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{page.title}</p>
                    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))] truncate">
                      /{page.slug}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          page.is_published
                            ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400'
                        }`}
                      >
                        {page.is_published ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        v{page.version}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <main className="space-y-6">
        {selectedPage ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {getPageConfig(selectedPage.slug)?.icon}
                  <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
                    {editForm.title}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {getPageConfig(selectedPage.slug)?.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/${selectedPage.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Preview
                  </a>
                </Button>

                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={saving || deleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="page-title"
                  className="block text-sm font-medium text-[hsl(var(--foreground))]"
                >
                  Page Title
                </label>
                <input
                  id="page-title"
                  type="text"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="page-format"
                  className="block text-sm font-medium text-[hsl(var(--foreground))]"
                >
                  Content Format
                </label>
                <select
                  id="page-format"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={editForm.content_format}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      content_format: e.target.value as 'html' | 'markdown',
                    })
                  }
                >
                  <option value="html">HTML</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-3">
                <label
                  htmlFor="page-slug"
                  className="block text-sm font-medium text-[hsl(var(--foreground))]"
                >
                  Slug
                  <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                    Example: terms-and-conditions
                  </span>
                </label>
                <input
                  id="page-slug"
                  type="text"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={editForm.slug}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                />
                {normalizeSlug(editForm.slug) !== normalizeSlug(selectedPage.slug) &&
                existingSlugs.has(normalizeSlug(editForm.slug)) ? (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    That slug is already used by another page.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="page-content"
                className="block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                Content
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                  HTML or Markdown supported
                </span>
              </label>
              <textarea
                id="page-content"
                rows={24}
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 font-mono text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                placeholder="Enter your page content here..."
                style={{ fontSize: '14px', lineHeight: '1.5' }}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="meta-description"
                className="block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                Meta Description (SEO)
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Brief description for search engines (max 160 chars)
                </span>
              </label>
              <textarea
                id="meta-description"
                rows={2}
                maxLength={160}
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={editForm.meta_description}
                onChange={(e) =>
                  setEditForm({ ...editForm, meta_description: e.target.value })
                }
                placeholder="A short description of this page..."
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {editForm.meta_description.length}/160 characters
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.is_published}
                onChange={(e) => setEditForm({ ...editForm, is_published: e.target.checked })}
                className="h-4 w-4 rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
              />
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                Published (visible on website)
              </span>
            </label>

            <Card className="border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4">
              <div className="grid gap-4 text-xs text-[hsl(var(--muted-foreground))] sm:grid-cols-3">
                <div>
                  <span className="font-medium text-[hsl(var(--foreground))]">Version:</span>{' '}
                  {selectedPage.version}
                </div>
                <div>
                  <span className="font-medium text-[hsl(var(--foreground))]">Created:</span>{' '}
                  {new Date(selectedPage.created_at).toLocaleDateString()}
                </div>
                <div>
                  <span className="font-medium text-[hsl(var(--foreground))]">Last Updated:</span>{' '}
                  {new Date(selectedPage.updated_at).toLocaleDateString()}
                </div>
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-[hsl(var(--muted-foreground))]" />
              <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">
                No page selected
              </h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Select a page from the sidebar to start editing
              </p>
            </div>
          </Card>
        )}

        {createOpen ? (
          <CreatePageModal
            saving={saving}
            existingSlugs={existingSlugs}
            value={createForm}
            onChange={(next) => setCreateForm(next)}
            onCancel={() => setCreateOpen(false)}
            onCreate={handleCreate}
          />
        ) : null}

        <DeletePageModal
          open={deleteOpen && !!selectedPage}
          title={selectedPage?.title ?? ''}
          slug={selectedPage?.slug ?? ''}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
        />
      </main>
    </div>
  );
}



// CreatePageModal was moved to ./manageModal (shared modal UI)

