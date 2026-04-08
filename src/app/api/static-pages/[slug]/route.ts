// app/api/static-pages/[slug]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPublishedStaticPageBySlug } from '@/lib/landing/static-pages.server';

type Params = {
  slug: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const { slug } = await context.params;

  // Fetch the published static page
  const page = await getPublishedStaticPageBySlug(slug);

  if (!page) {
    return NextResponse.json(
      { error: 'Page not found' },
      { status: 404 }
    );
  }

  // Return the page data
  return NextResponse.json(page);
}