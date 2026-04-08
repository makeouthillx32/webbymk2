// app/pages/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPublishedStaticPageBySlug } from '@/lib/landing/static-pages.server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const revalidate = 60; // Revalidate every 60 seconds

type Props = {
  params: Promise<{ slug: string }>;
};

// Generate metadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedStaticPageBySlug(slug);

  if (!page) {
    return {
      title: 'Page Not Found',
    };
  }

  return {
    title: page.title,
    description: page.meta_description || undefined,
    keywords: page.meta_keywords || undefined,
    openGraph: page.og_image_url
      ? {
        images: [page.og_image_url],
      }
      : undefined,
  };
}

/**
 * Detects if the stored HTML is a full document (has <html> or <body> tags).
 * If so, extracts the <style> blocks and <body> inner content separately
 * so the page's own CSS doesn't leak out and break the shop layout.
 */
function extractHtmlParts(html: string): { styles: string; body: string } | null {
  const isFullDoc = /<html[\s>]|<!DOCTYPE/i.test(html);
  if (!isFullDoc) return null;

  // Extract all <style>...</style> blocks
  const styleMatches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  const styles = styleMatches.map((m) => m[1]).join('\n');

  // Extract inner content of <body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  return { styles, body };
}

function stripInlineWidths(html: string): string {
  return html
    // Remove width="600" style attributes on elements
    .replace(/\s+width=["']\d+["']/gi, '')
    // Remove width:Xpx from inline style attributes
    .replace(/(style=["'][^"']*)width\s*:\s*\d+px\s*;?/gi, '$1')
    .replace(/(style=["'][^"']*)max-width\s*:\s*\d+px\s*;?/gi, '$1');
}

// Render content based on format
function renderContent(page: { content: string; content_format: 'html' | 'markdown' }) {
  if (page.content_format === 'html') {
    const extracted = extractHtmlParts(page.content);

    if (extracted) {
      // Full HTML document — render styles scoped + body content isolated
      return (
        <div className="static-page-content w-full overflow-x-hidden">
          <style
            dangerouslySetInnerHTML={{
              __html: `
                .static-page-content {
                  display: block !important;
                  align-items: unset !important;
                  flex-direction: unset !important;
                }
                .static-page-content body,
                .static-page-content html {
                  display: block;
                }
                ${extracted.styles
                  .replace(/\bbody\b/g, '.static-page-content')
                  .replace(/\bhtml\b/g, '.static-page-content')}
                .static-page-content *,
                .static-page-content *::before,
                .static-page-content *::after {
                  box-sizing: border-box !important;
                  max-width: 100% !important;
                }
                .static-page-content table,
                .static-page-content div,
                .static-page-content main,
                .static-page-content article,
                .static-page-content section,
                .static-page-content center,
                .static-page-content td,
                .static-page-content tr {
                  max-width: 100% !important;
                  width: auto !important;
                  box-sizing: border-box !important;
                }
                .static-page-content img {
                  max-width: 100% !important;
                  height: auto !important;
                }
              `,
            }}
          />
          <div dangerouslySetInnerHTML={{ __html: extracted.body }} />
        </div>
      );
    }

    // Partial HTML — apply the same width-busting overrides via a scoped style tag
    return (
      <div className="static-page-content w-full overflow-x-hidden">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .static-page-content *,
              .static-page-content *::before,
              .static-page-content *::after {
                box-sizing: border-box !important;
                max-width: 100% !important;
              }
              .static-page-content table,
              .static-page-content div,
              .static-page-content main,
              .static-page-content article,
              .static-page-content section,
              .static-page-content center,
              .static-page-content td,
              .static-page-content tr {
                max-width: 100% !important;
                width: auto !important;
                box-sizing: border-box !important;
              }
              .static-page-content img {
                max-width: 100% !important;
                height: auto !important;
              }
            `,
          }}
        />
        <div
          className="
            prose prose-slate max-w-none dark:prose-invert
            prose-headings:text-[hsl(var(--foreground))]
            prose-p:text-[hsl(var(--foreground))]
            prose-a:text-[hsl(var(--primary))]
            prose-strong:text-[hsl(var(--foreground))]
            prose-ul:text-[hsl(var(--foreground))]
            prose-ol:text-[hsl(var(--foreground))]
            prose-li:text-[hsl(var(--foreground))]
            [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md
            [&_table]:w-full [&_table]:overflow-x-auto [&_table]:block
            [&_pre]:overflow-x-auto [&_pre]:text-sm
            [&_iframe]:max-w-full [&_iframe]:w-full
            [&_video]:max-w-full [&_video]:w-full
          "
          dangerouslySetInnerHTML={{ __html: stripInlineWidths(page.content) }}
        />
      </div>
    );
  }

  // Basic markdown rendering
  return (
    <div className="prose prose-slate max-w-none dark:prose-invert overflow-x-hidden">
      {page.content.split('\n').map((line, i) => {
        if (line.trim().startsWith('#')) {
          const level = line.match(/^#+/)?.[0].length || 1;
          const text = line.replace(/^#+\s*/, '');
          const Tag = `h${level}` as keyof JSX.IntrinsicElements;
          return (
            <Tag key={i} className="text-[hsl(var(--foreground))]">
              {text}
            </Tag>
          );
        }
        return line.trim() ? (
          <p key={i} className="text-[hsl(var(--foreground))]">{line}</p>
        ) : (
          <br key={i} />
        );
      })}
    </div>
  );
}

export default async function StaticPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPublishedStaticPageBySlug(slug);

  if (!page) {
    notFound();
  }

  return (
    // pt accounts for the sticky shop header:
    //   mobile  → single row ~5rem  → pt-20 (5rem)
    //   desktop → logo + nav rows ~13rem → md:pt-52
    <div className="min-h-screen bg-[hsl(var(--background))] pt-20 md:pt-52">
      {/* Page header */}
      <div className="border-b border-[hsl(var(--border))]">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
          <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl lg:text-4xl">
            {page.title}
          </h1>
          {page.meta_description && (
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
              {page.meta_description}
            </p>
          )}
          {(page.published_at || page.updated_at || page.version) && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {(page.published_at || page.updated_at) && (
                <>
                  Last updated:{' '}
                  {new Date(page.published_at ?? page.updated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </>
              )}
              {(page.published_at || page.updated_at) && page.version && ' · '}
              {page.version && `v${page.version}`}
            </p>
          )}
        </div>
      </div>

      {/* Page content — full width so HTML from Supabase renders as intended */}
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        <div className="overflow-x-hidden">
          {renderContent(page)}
        </div>
      </div>
    </div>
  );
}