// app/api/analytics/visitors/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface VisitorAnalytics {
  x: string; // date or hour
  y: number; // visitor count
  sessions?: number;
  pageViews?: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('start') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = searchParams.get('end') || new Date().toISOString();
    const granularity = searchParams.get('granularity') || 'daily';

    let visitors: VisitorAnalytics[] = [];

    if (granularity === 'hourly') {
      // Get hourly stats for the last 24 hours
      const { data: hourlyStats, error } = await supabase
        .from('analytics_hourly_stats')
        .select('date_hour, metric_type, metric_value')
        .gte('date_hour', startDate)
        .lte('date_hour', endDate)
        .in('metric_type', ['unique_users', 'sessions', 'page_views'])
        .order('date_hour');

      if (error) {
        console.error('Hourly stats query error:', error);
        return NextResponse.json({ error: 'Failed to fetch hourly stats' }, { status: 500 });
      }

      // Group by hour
      const hourlyData = new Map<string, { users: number; sessions: number; pageViews: number }>();
      
      hourlyStats?.forEach(stat => {
        const hour = new Date(stat.date_hour).getHours().toString();
        const existing = hourlyData.get(hour) || { users: 0, sessions: 0, pageViews: 0 };
        
        switch (stat.metric_type) {
          case 'unique_users':
            existing.users = stat.metric_value;
            break;
          case 'sessions':
            existing.sessions = stat.metric_value;
            break;
          case 'page_views':
            existing.pageViews = stat.metric_value;
            break;
        }
        
        hourlyData.set(hour, existing);
      });

      // Convert to array format
      visitors = Array.from(hourlyData.entries()).map(([hour, data]) => ({
        x: hour,
        y: data.users,
        sessions: data.sessions,
        pageViews: data.pageViews
      }));

    } else {
      // Get daily stats
      const { data: dailyStats, error } = await supabase
        .from('analytics_daily_stats')
        .select('date, metric_type, metric_value')
        .gte('date', startDate.split('T')[0])
        .lte('date', endDate.split('T')[0])
        .in('metric_type', ['unique_users', 'sessions', 'page_views'])
        .order('date');

      if (error) {
        console.error('Daily stats query error:', error);
        return NextResponse.json({ error: 'Failed to fetch daily stats' }, { status: 500 });
      }

      // Group by date
      const dailyData = new Map<string, { users: number; sessions: number; pageViews: number }>();
      
      dailyStats?.forEach(stat => {
        const date = stat.date;
        const existing = dailyData.get(date) || { users: 0, sessions: 0, pageViews: 0 };
        
        switch (stat.metric_type) {
          case 'unique_users':
            existing.users = stat.metric_value;
            break;
          case 'sessions':
            existing.sessions = stat.metric_value;
            break;
          case 'page_views':
            existing.pageViews = stat.metric_value;
            break;
        }
        
        dailyData.set(date, existing);
      });

      // Convert to array format with day numbers
      visitors = Array.from(dailyData.entries()).map(([date, data], index) => ({
        x: (index + 1).toString(), // Day number as string
        y: data.users,
        sessions: data.sessions,
        pageViews: data.pageViews
      }));
    }

    // If no aggregated data exists, fall back to real-time calculation
    if (visitors.length === 0) {
      // Calculate visitor stats from raw data
      if (granularity === 'hourly') {
        // Get hourly breakdown from sessions
        const { data: sessions, error: sessionsError } = await supabase
          .from('analytics_sessions')
          .select('created_at, user_id')
          .gte('created_at', startDate)
          .lte('created_at', endDate);

        if (!sessionsError && sessions) {
          const hourlyMap = new Map<string, Set<string>>();
          
          sessions.forEach(session => {
            const hour = new Date(session.created_at).getHours().toString();
            if (!hourlyMap.has(hour)) {
              hourlyMap.set(hour, new Set());
            }
            hourlyMap.get(hour)!.add(session.user_id);
          });

          visitors = Array.from(hourlyMap.entries()).map(([hour, userSet]) => ({
            x: hour,
            y: userSet.size,
            sessions: sessions.filter(s => new Date(s.created_at).getHours().toString() === hour).length
          }));
        }
      } else {
        // Get daily breakdown from sessions
        const { data: sessions, error: sessionsError } = await supabase
          .from('analytics_sessions')
          .select('created_at, user_id')
          .gte('created_at', startDate)
          .lte('created_at', endDate);

        if (!sessionsError && sessions) {
          const dailyMap = new Map<string, Set<string>>();
          
          sessions.forEach(session => {
            const date = new Date(session.created_at).toISOString().split('T')[0];
            if (!dailyMap.has(date)) {
              dailyMap.set(date, new Set());
            }
            dailyMap.get(date)!.add(session.user_id);
          });

          visitors = Array.from(dailyMap.entries()).map(([date, userSet], index) => ({
            x: (index + 1).toString(),
            y: userSet.size,
            sessions: sessions.filter(s => new Date(s.created_at).toISOString().split('T')[0] === date).length
          }));
        }
      }
    }

    return NextResponse.json({ 
      visitors: visitors.sort((a, b) => parseInt(a.x) - parseInt(b.x))
    });

  } catch (error) {
    console.error('Visitors API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}