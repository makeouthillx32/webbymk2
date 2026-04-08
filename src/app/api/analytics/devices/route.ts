// app/api/analytics/devices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    // Calculate date range
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    // Get device statistics from sessions
    const { data: sessionsData, error } = await supabase
      .from('analytics_sessions')
      .select('device_type, browser, os')
      .gte('created_at', daysAgo.toISOString());
    
    if (error) {
      console.error('Error fetching device stats:', error);
      return NextResponse.json({ error: 'Failed to fetch device analytics' }, { status: 500 });
    }
    
    // Get page views count for each device combination
    const { data: pageViewsData, error: pageViewsError } = await supabase
      .from('analytics_page_views')
      .select('user_id')
      .gte('created_at', daysAgo.toISOString());
    
    if (pageViewsError) {
      console.error('Error fetching page views:', pageViewsError);
      return NextResponse.json({ error: 'Failed to fetch page views' }, { status: 500 });
    }
    
    // Process the data to match your expected format
    const deviceMap = new Map();
    
    sessionsData?.forEach(session => {
      const key = `${session.device_type || 'unknown'}-${session.browser || 'unknown'}-${session.os || 'unknown'}`;
      
      if (!deviceMap.has(key)) {
        deviceMap.set(key, {
          device_type: session.device_type || 'unknown',
          browser: session.browser || 'unknown',
          os: session.os || 'unknown',
          sessions_count: 0,
          users_count: 0,
          page_views_count: 0,
          bounce_rate: 0
        });
      }
      
      const device = deviceMap.get(key);
      device.sessions_count++;
      device.users_count++; // Simplified - each session = 1 user for now
    });
    
    // Add page views count (simplified distribution)
    const totalPageViews = pageViewsData?.length || 0;
    const totalSessions = sessionsData?.length || 0;
    const avgPageViewsPerSession = totalSessions > 0 ? totalPageViews / totalSessions : 0;
    
    // Convert map to array and add page views
    const devices = Array.from(deviceMap.values()).map(device => ({
      ...device,
      page_views_count: Math.round(device.sessions_count * avgPageViewsPerSession)
    }));
    
    const response = {
      devices,
      meta: {
        hasDetailedData: true,
        totalCombinations: devices.length,
        totalSessions: totalSessions,
        dateRange: {
          startDate: daysAgo.toISOString(),
          endDate: new Date().toISOString()
        }
      }
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Device analytics error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}