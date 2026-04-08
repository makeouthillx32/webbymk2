// app/api/analytics/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface DeviceAnalytics {
  name: string;
  percentage: number;
  amount: number;
  sessions: number;
  bounceRate: number;
}

interface VisitorAnalytics {
  x: string;
  y: number;
  sessions?: number;
  pageViews?: number;
}

interface PageAnalytics {
  page: string;
  views: number;
  uniqueUsers: number;
  bounceRate: number;
}

interface DashboardResponse {
  overview: {
    totalUsers: number;
    totalSessions: number; 
    totalPageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
    periodComparison: {
      users: { current: number; previous: number; change: number };
      sessions: { current: number; previous: number; change: number };
      pageViews: { current: number; previous: number; change: number };
    };
  };
  devices: DeviceAnalytics[];
  visitors: VisitorAnalytics[];
  topPages: PageAnalytics[];
  realtimeUsers: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    // Default to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    
    // Previous period for comparison
    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - 30);

    // Helper function to calculate percentage change
    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Get current period overview stats
    const [
      totalUsersResult,
      totalSessionsResult,
      totalPageViewsResult,
      avgBounceRateResult,
      avgSessionDurationResult
    ] = await Promise.all([
      // Total unique users
      supabase
        .from('analytics_users')
        .select('id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      
      // Total sessions  
      supabase
        .from('analytics_sessions')
        .select('id, is_bounce, duration')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      
      // Total page views
      supabase
        .from('analytics_page_views')
        .select('id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      
      // Bounce rate (from sessions)
      supabase
        .from('analytics_sessions')
        .select('is_bounce')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString()),
      
      // Average session duration
      supabase
        .from('analytics_sessions')
        .select('duration')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .not('duration', 'is', null)
    ]);

    // Get previous period stats for comparison
    const [
      prevUsersResult,
      prevSessionsResult,
      prevPageViewsResult
    ] = await Promise.all([
      supabase
        .from('analytics_users')
        .select('id')
        .gte('created_at', prevStartDate.toISOString())
        .lte('created_at', prevEndDate.toISOString()),
      
      supabase
        .from('analytics_sessions')
        .select('id')
        .gte('created_at', prevStartDate.toISOString())
        .lte('created_at', prevEndDate.toISOString()),
      
      supabase
        .from('analytics_page_views')
        .select('id')
        .gte('created_at', prevStartDate.toISOString())
        .lte('created_at', prevEndDate.toISOString())
    ]);

    // Calculate overview metrics
    const totalUsers = totalUsersResult.data?.length || 0;
    const totalSessions = totalSessionsResult.data?.length || 0;
    const totalPageViews = totalPageViewsResult.data?.length || 0;
    
    const bounceCount = avgBounceRateResult.data?.filter(s => s.is_bounce).length || 0;
    const bounceRate = totalSessions > 0 ? Math.round((bounceCount / totalSessions) * 100) : 0;
    
    const durations = avgSessionDurationResult.data?.map(s => s.duration).filter(d => d != null) || [];
    const avgSessionDuration = durations.length > 0 
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) 
      : 0;

    // Previous period totals
    const prevUsers = prevUsersResult.data?.length || 0;
    const prevSessions = prevSessionsResult.data?.length || 0;
    const prevPageViews = prevPageViewsResult.data?.length || 0;

    // Get device analytics
    const { data: deviceStats } = await supabase
      .from('analytics_device_stats')
      .select('device_type, sessions_count, users_count, bounce_rate')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    // Aggregate device data
    const deviceTotals = new Map<string, {
      sessions: number;
      users: number;
      bounceRate: number;
      count: number;
    }>();

    deviceStats?.forEach(stat => {
      const existing = deviceTotals.get(stat.device_type) || {
        sessions: 0, users: 0, bounceRate: 0, count: 0
      };
      existing.sessions += stat.sessions_count || 0;
      existing.users += stat.users_count || 0;
      existing.bounceRate += stat.bounce_rate || 0;
      existing.count += 1;
      deviceTotals.set(stat.device_type, existing);
    });

    const totalDeviceSessions = Array.from(deviceTotals.values())
      .reduce((sum, device) => sum + device.sessions, 0);

    const devices: DeviceAnalytics[] = Array.from(deviceTotals.entries()).map(([type, data]) => ({
      name: capitalizeDeviceType(type),
      percentage: totalDeviceSessions > 0 ? data.sessions / totalDeviceSessions : 0,
      amount: data.users,
      sessions: data.sessions,
      bounceRate: data.count > 0 ? Math.round(data.bounceRate / data.count) : 0
    }));

    // Get visitor timeline (last 7 days for dashboard)
    const { data: dailyStats } = await supabase
      .from('analytics_daily_stats')
      .select('date, metric_type, metric_value')
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .in('metric_type', ['unique_users', 'sessions'])
      .order('date');

    // Process visitor data
    const visitorMap = new Map<string, { users: number; sessions: number }>();
    dailyStats?.forEach(stat => {
      const existing = visitorMap.get(stat.date) || { users: 0, sessions: 0 };
      if (stat.metric_type === 'unique_users') existing.users = stat.metric_value;
      if (stat.metric_type === 'sessions') existing.sessions = stat.metric_value;
      visitorMap.set(stat.date, existing);
    });

    const visitors: VisitorAnalytics[] = Array.from(visitorMap.entries())
      .map(([date, data], index) => ({
        x: (index + 1).toString(),
        y: data.users,
        sessions: data.sessions
      }));

    // Get top pages
    const { data: pageViews } = await supabase
      .from('analytics_page_views')
      .select('page_url, user_id')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    // Aggregate page stats
    const pageMap = new Map<string, { views: number; users: Set<string> }>();
    pageViews?.forEach(view => {
      const existing = pageMap.get(view.page_url) || { views: 0, users: new Set() };
      existing.views += 1;
      existing.users.add(view.user_id);
      pageMap.set(view.page_url, existing);
    });

    const topPages: PageAnalytics[] = Array.from(pageMap.entries())
      .map(([url, data]) => ({
        page: url,
        views: data.views,
        uniqueUsers: data.users.size,
        bounceRate: 0 // Would need more complex calculation
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Get realtime users (active in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: realtimeData } = await supabase
      .from('analytics_page_views')
      .select('user_id')
      .gte('created_at', fiveMinutesAgo.toISOString());

    const realtimeUsers = new Set(realtimeData?.map(r => r.user_id) || []).size;

    // Build response
    const response: DashboardResponse = {
      overview: {
        totalUsers,
        totalSessions,
        totalPageViews,
        bounceRate,
        avgSessionDuration,
        periodComparison: {
          users: {
            current: totalUsers,
            previous: prevUsers,
            change: calcChange(totalUsers, prevUsers)
          },
          sessions: {
            current: totalSessions,
            previous: prevSessions,
            change: calcChange(totalSessions, prevSessions)
          },
          pageViews: {
            current: totalPageViews,
            previous: prevPageViews,
            change: calcChange(totalPageViews, prevPageViews)
          }
        }
      },
      devices,
      visitors,
      topPages,
      realtimeUsers
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function
function capitalizeDeviceType(deviceType: string): string {
  const typeMap: Record<string, string> = {
    'desktop': 'Desktop',
    'mobile': 'Mobile', 
    'tablet': 'Tablet',
    'bot': 'Bots',
    'unknown': 'Unknown'
  };
  return typeMap[deviceType?.toLowerCase()] || 'Unknown';
}