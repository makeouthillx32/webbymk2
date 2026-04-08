// components/shop/_components/InlineStaticPage.tsx
import { getPublishedStaticPageBySlug } from '@/lib/landing/static-pages.server';
import { StaticPageShell } from './StaticPageShell';

interface InlineStaticPageProps {
  slug: string;
  compact?: boolean;
  showFooter?: boolean;
}

/**
 * Server component that fetches a static page by slug and renders it inline
 * Uses the StaticPageShell for consistent styling with the landing page
 */
export async function InlineStaticPage({
  slug,
  compact = true,
  showFooter = false,
}: InlineStaticPageProps) {
  // Fetch the published page from database
  const page = await getPublishedStaticPageBySlug(slug);

  // If page doesn't exist or isn't published, don't render anything
  if (!page) {
    return null;
  }

  // Render using StaticPageShell with landing-friendly settings
  return (
    <StaticPageShell
      page={page}
      compact={compact}
      showFooter={showFooter}
    />
  );
}