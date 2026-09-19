// app/api/analytics/visitors/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

interface VisitorAnalytics {
  x: string; // date or hour
  y: number; // visitor count
  sessions?: number;
  pageViews?: number;
}

// ── Why this route is cached and single-flighted ────────────────────────────
// Load-tested 2026-09-10. `analytics_daily_stats` stopped being written on
// 2026-02-02, so the last-30-days aggregate query returns zero rows and EVERY
// request falls through to the raw-scan branch below — ~7,250 `analytics_sessions`
// rows pulled over PostgREST and folded in JS. The Postgres side is trivial
// (4.7ms index scan); the cost is entirely CPU on the Node event loop, which is
// single-threaded, so this endpoint stalls every other request the container is
// serving. Measured: 10 concurrent clients here took the core homepage from
// 199ms to 7,306ms p50 (37x) — core, blog, docs and status all share unt_app.
//
// Three things keep that from happening again:
//   1. the fold below is single-pass (it used to run `sessions.filter()` inside
//      a `.map()` over each day — O(days x sessions), ~160k Date parses/request),
//   2. identical concurrent requests share one computation (single-flight),
//   3. results are held briefly, so a burst costs one scan instead of N.
// Fixing the stale aggregation job removes the raw scan entirely; until then
// this keeps the fallback from being a site-wide denial of service.
const CACHE_TTL_MS = 60_000;

type CacheEntry = { expires: number; payload: { visitors: VisitorAnalytics[] } };

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<{ visitors: VisitorAnalytics[] }>>();

// Safe to share across callers: RLS on analytics_sessions / analytics_daily_stats
// is a single `USING (true)` policy for `public`, so the rows — and therefore
// this response — do not vary by caller identity.
function readCache(key: string) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeCache(key: string, payload: { visitors: VisitorAnalytics[] }) {
  responseCache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload });
  // Bounded so a param-fuzzing client can't grow this without limit.
  if (responseCache.size > 64) {
    for (const [k, v] of responseCache) {
      if (v.expires <= Date.now()) responseCache.delete(k);
    }
    if (responseCache.size > 64) {
      responseCache.delete(responseCache.keys().next().value as string);
    }
  }
}

async function computeVisitors(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  granularity: string
): Promise<{ visitors: VisitorAnalytics[] } | { error: string; status: number }> {
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
      return { error: 'Failed to fetch hourly stats', status: 500 };
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
      return { error: 'Failed to fetch daily stats', status: 500 };
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

  // If no aggregated data exists, fall back to real-time calculation.
  // Single pass per branch: one Date parse per row, buckets accumulated as we
  // go. The previous version re-scanned every session once per bucket.
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
        const hourlyUsers = new Map<string, Set<string>>();
        const hourlyCounts = new Map<string, number>();

        for (const session of sessions) {
          const hour = new Date(session.created_at).getHours().toString();
          let userSet = hourlyUsers.get(hour);
          if (!userSet) {
            userSet = new Set();
            hourlyUsers.set(hour, userSet);
            hourlyCounts.set(hour, 0);
          }
          userSet.add(session.user_id);
          hourlyCounts.set(hour, hourlyCounts.get(hour)! + 1);
        }

        visitors = Array.from(hourlyUsers.entries()).map(([hour, userSet]) => ({
          x: hour,
          y: userSet.size,
          sessions: hourlyCounts.get(hour)!
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
        const dailyUsers = new Map<string, Set<string>>();
        const dailyCounts = new Map<string, number>();

        for (const session of sessions) {
          const date = new Date(session.created_at).toISOString().split('T')[0];
          let userSet = dailyUsers.get(date);
          if (!userSet) {
            userSet = new Set();
            dailyUsers.set(date, userSet);
            dailyCounts.set(date, 0);
          }
          userSet.add(session.user_id);
          dailyCounts.set(date, dailyCounts.get(date)! + 1);
        }

        visitors = Array.from(dailyUsers.entries()).map(([date, userSet], index) => ({
          x: (index + 1).toString(),
          y: userSet.size,
          sessions: dailyCounts.get(date)!
        }));
      }
    }
  }

  return { visitors: visitors.sort((a, b) => parseInt(a.x) - parseInt(b.x)) };
}

export async function GET(request: NextRequest) {
  try {
    // Site-wide visitor analytics is admin-only data. This route used to be
    // unauthenticated and read through the anon client, which — combined with
    // the `USING (true)` grants that used to sit on the analytics tables —
    // put every visitor's session history one public request away.
    const gate = await requireAdmin();
    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);

    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const granularity = searchParams.get('granularity') || 'daily';

    const startDate = startParam || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = endParam || new Date().toISOString();

    // Key on the request's own params, not the resolved timestamps — the
    // defaults embed Date.now() and would make every key unique, which is
    // exactly the hot path (the dashboard calls this with no params at all).
    const cacheKey = `${granularity}|${startParam ?? ''}|${endParam ?? ''}`;

    const cached = readCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Collapse a burst of identical requests into one scan.
    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const result = await computeVisitors(gate.admin, startDate, endDate, granularity);
        if ('error' in result) throw Object.assign(new Error(result.error), { status: result.status });
        writeCache(cacheKey, result);
        return result;
      })().finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, pending);
    }

    return NextResponse.json(await pending);

  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 500 && error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error('Visitors API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
