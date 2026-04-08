// app/api/calendar/work-locations/route.ts
import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[API] Getting work locations');

    // Get all active work locations
    const { data, error } = await supabase
      .from('work_locations')
      .select(`
        id,
        location_name,
        location_type,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        phone,
        contact_person,
        contact_email,
        accessibility_features,
        parking_available,
        public_transit_access,
        wifi_available,
        capacity,
        hourly_rate,
        is_active,
        notes
      `)
      .eq('is_active', true)
      .order('location_name');

    if (error) {
      console.error('[API] Error fetching work locations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch work locations' },
        { status: 500 }
      );
    }

    console.log('[API] Found work locations:', data?.length || 0);

    return NextResponse.json(data || []);

  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}