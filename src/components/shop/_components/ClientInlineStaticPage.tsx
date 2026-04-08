// components/shop/_components/ClientInlineStaticPage.tsx
"use client";

import { useEffect, useState } from 'react';

interface ClientInlineStaticPageProps {
  slug: string;
  compact?: boolean;
  showFooter?: boolean;
}

type StaticPageData = {
  title: string;
  slug: string;
  content: string;
  content_format: 'html' | 'markdown';
  meta_description?: string | null;
  updated_at?: string | null;
  version?: number | null;
};

export function ClientInlineStaticPage({
  slug,
  compact = true,
  showFooter = false,
}: ClientInlineStaticPageProps) {
  const [page, setPage] = useState<StaticPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPage() {
      if (!slug || slug === 'undefined') {
        console.error('[ClientInlineStaticPage] Invalid slug:', slug);
        setError('Invalid page slug');
        setLoading(false);
        return;
      }

      try {
        console.log('[ClientInlineStaticPage] Fetching page with slug:', slug);
        const response = await fetch(`/api/static-pages/${slug}`);
        
        console.log('[ClientInlineStaticPage] Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[ClientInlineStaticPage] Page loaded:', data.title);
          setPage(data);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[ClientInlineStaticPage] Failed to fetch page:', errorData);
          setError(`Failed to load page: ${errorData.error || response.statusText}`);
        }
      } catch (error) {
        console.error('[ClientInlineStaticPage] Fetch error:', error);
        setError('Failed to fetch static page');
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [slug]);

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg bg-gray-800 aspect-[4/3] p-8 animate-pulse">
            <div className="h-10 bg-gray-700 rounded w-3/4 mb-4"></div>
            <div className="h-6 bg-gray-700 rounded w-full mb-2"></div>
            <div className="h-6 bg-gray-700 rounded w-2/3"></div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] aspect-[4/3] p-8 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
            <div className="w-40 h-40 bg-gray-200 rounded-lg mx-auto mb-4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/3 mx-auto mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4 mx-auto"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ClientInlineStaticPage] Error:', error, 'Slug:', slug);
    }
    return null;
  }

  if (!page) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-16">
      {page.content_format === 'html' ? (
        <div 
          className="static-page-content"
          style={{
            fontFamily: 'var(--font-family-base)',
            color: 'var(--foreground)',
          }}
          dangerouslySetInnerHTML={{ __html: page.content }} 
        />
      ) : (
        <div className="prose prose-slate max-w-none">
          {page.content}
        </div>
      )}
    </section>
  );
}