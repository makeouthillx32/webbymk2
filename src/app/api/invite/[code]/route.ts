// app/api/invite/[code]/route.ts
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: { code: string } }
) {
  const { code } = params;
  const supabase = createRouteHandlerClient({ cookies, headers });

  // Attempt to delete the invite row
  const { error } = await supabase
    .from('invites')
    .delete()
    .eq('code', code);

  if (error) {
    console.error(`DELETE /api/invite/${code} error:`, error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
