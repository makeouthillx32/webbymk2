// app/api/landing/sections/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status }
  );
}

// GET - Fetch all sections (or just active ones for public)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    let query = supabase
      .from('landing_sections')
      .select('*')
      .order('position', { ascending: true });

    // For admin dashboard, get all sections
    // For public landing page, get only active sections
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[landing/sections] Database error:', error);
      return jsonError(500, 'database_error', error.message, error);
    }

    return NextResponse.json({
      ok: true,
      sections: data || []
    });
  } catch (error: any) {
    console.error('[landing/sections] Unexpected error:', error);
    return jsonError(500, 'unexpected_error', error?.message || 'Failed to fetch sections');
  }
}

// POST - Create new section
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError(400, 'invalid_json', 'Invalid JSON body');
    }

    const { position, type, is_active, config } = body;

    if (!type) {
      return jsonError(400, 'missing_type', 'Section type is required');
    }

    const { data, error } = await supabase
      .from('landing_sections')
      .insert({
        position: Number(position) || 999,
        type: String(type),
        is_active: is_active !== undefined ? !!is_active : true,
        config: config || {},
      })
      .select('*')
      .single();

    if (error) {
      console.error('[landing/sections] Insert error:', error);
      return jsonError(500, 'insert_failed', error.message, error);
    }

    return NextResponse.json({
      ok: true,
      section: data
    });
  } catch (error: any) {
    console.error('[landing/sections] Create error:', error);
    return jsonError(500, 'create_failed', error?.message || 'Failed to create section');
  }
}

// PATCH - Update section (supports swap mode for reordering)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const body = await req.json().catch(() => null);

    if (!body) {
      return jsonError(400, 'invalid_json', 'Invalid JSON body');
    }

    // Swap mode - for reordering multiple sections at once
    if (Array.isArray(body.swap)) {
      const swaps: { id: string; position: number }[] = body.swap;

      for (const s of swaps) {
        const { error } = await supabase
          .from('landing_sections')
          .update({ position: Number(s.position) })
          .eq('id', s.id);

        if (error) {
          console.error('[landing/sections] Swap error:', error);
          return jsonError(500, 'swap_failed', error.message, error);
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Single update mode
    const { id, position, type, is_active, config } = body;

    if (!id) {
      return jsonError(400, 'missing_id', 'Section ID is required');
    }

    const patch: any = {};
    if (position !== undefined) patch.position = Number(position);
    if (type !== undefined) patch.type = String(type);
    if (is_active !== undefined) patch.is_active = !!is_active;
    if (config !== undefined) patch.config = config || {};

    const { data, error } = await supabase
      .from('landing_sections')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[landing/sections] Update error:', error);
      return jsonError(500, 'update_failed', error.message, error);
    }

    return NextResponse.json({
      ok: true,
      section: data
    });
  } catch (error: any) {
    console.error('[landing/sections] Patch error:', error);
    return jsonError(500, 'patch_failed', error?.message || 'Failed to update section');
  }
}

// DELETE - Remove section
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return jsonError(400, 'missing_id', 'Section ID is required');
    }

    const { error } = await supabase
      .from('landing_sections')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[landing/sections] Delete error:', error);
      return jsonError(500, 'delete_failed', error.message, error);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[landing/sections] Delete error:', error);
    return jsonError(500, 'delete_failed', error?.message || 'Failed to delete section');
  }
}

// Optional: Add revalidation time
export const revalidate = 60; // Revalidate every 60 seconds