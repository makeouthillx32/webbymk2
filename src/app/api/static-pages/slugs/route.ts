// app/api/static-pages/slugs/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('static_pages')
    .select('id, slug, title, is_published')
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}