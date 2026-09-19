-- 20260910_analytics_access_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Two problems, found together during a load test of the multi-zone stack.
--
-- 1. PERFORMANCE. `analytics_daily_stats` stopped being written on 2026-02-02:
--    aggregate_daily_stats() existed but was never scheduled (pg_cron ran only
--    the three tank-* jobs). With the aggregate empty for recent dates, every
--    /api/analytics/visitors request fell through to its raw-scan fallback —
--    ~7,250 analytics_sessions rows folded in JS on the single Node event loop.
--    Measured: 10 concurrent clients on that one endpoint took the core
--    homepage from 199ms to 7,306ms p50 (37x), because core/, blog, docs and
--    status all share the unt_app container.
--
-- 2. ACCESS. All analytics tables carried a policy *named* "service role full
--    access" that was actually granted to {public} with USING (true) / ALL,
--    on top of blanket table grants. The anon key ships in every browser
--    bundle, so db.unenter.live served 22,512 analytics_users rows — including
--    ip_address and full browser fingerprints — to anyone who asked, and
--    allowed UPDATE/DELETE/TRUNCATE on all of it. Five more analytics tables
--    (conversions, errors, geo_stats, hourly_stats, performance) had RLS
--    switched off entirely with the same full grants; all five were empty.
--
-- The read routes (visitors/dashboard/devices/performance GET) now go through
-- requireAdmin() + the service-role client, so they don't need anon grants.
-- The public write routes (track, event) keep working on the anon client with
-- exactly the columns they touch and nothing more.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Keep the aggregate current ───────────────────────────────────────────
-- Hourly rather than daily, and covering today as well as yesterday, so the
-- 30-day window the dashboard reads is never stale and a missed run self-heals
-- on the next tick instead of leaving a permanent hole.
SELECT cron.unschedule('analytics-daily-aggregate')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-daily-aggregate');

SELECT cron.schedule(
  'analytics-daily-aggregate',
  '7 * * * *',
  $$SELECT aggregate_daily_stats(CURRENT_DATE - 1), aggregate_daily_stats(CURRENT_DATE);$$
);

-- Backfill the 2026-02-03 → today gap. aggregate_daily_stats() is idempotent
-- (ON CONFLICT DO UPDATE), so re-running this is safe.
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series('2026-02-03'::date, CURRENT_DATE, '1 day')::date LOOP
    PERFORM aggregate_daily_stats(d);
  END LOOP;
END $$;

-- ── 2. Turn RLS on where it was simply off ──────────────────────────────────
-- No policies are added: with RLS enabled and no policy, anon/authenticated get
-- nothing while service_role continues to bypass RLS.
ALTER TABLE public.analytics_conversions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_errors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_geo_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_hourly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_performance  ENABLE ROW LEVEL SECURITY;

-- ── 3. Reduce anon/authenticated to exactly what the write path touches ─────
-- Column-level grants are the effective control here: PostgREST needs SELECT on
-- a column to return or filter on it, and a column-level REVOKE cannot carve a
-- hole out of a table-level grant, so each table is revoked then re-granted.

-- track: .select('id, created_at').eq('session_id', …), and writes ip_address
-- without ever reading it back.
REVOKE SELECT ON public.analytics_users FROM anon, authenticated;
GRANT  SELECT (id, session_id, created_at) ON public.analytics_users TO anon, authenticated;

-- track: .select('id, entry_page, created_at').eq('session_id', …)
REVOKE SELECT ON public.analytics_sessions FROM anon, authenticated;
GRANT  SELECT (id, session_id, entry_page, created_at) ON public.analytics_sessions TO anon, authenticated;

-- Insert-only from the app; never read back.
REVOKE SELECT ON public.analytics_page_views FROM anon, authenticated;

-- event: .insert(…).select('id, created_at') needs those two columns returned.
-- Event names, categories, labels, metadata and user_id stay unreadable.
REVOKE SELECT ON public.analytics_events FROM anon, authenticated;
GRANT  SELECT (id, created_at) ON public.analytics_events TO anon, authenticated;

-- Nothing in the application deletes analytics rows; cleanup_old_analytics_data()
-- runs with owner privileges.
REVOKE DELETE, TRUNCATE ON
  public.analytics_users, public.analytics_sessions, public.analytics_page_views,
  public.analytics_events, public.analytics_daily_stats, public.analytics_device_stats,
  public.analytics_conversions, public.analytics_errors, public.analytics_geo_stats,
  public.analytics_hourly_stats, public.analytics_performance
FROM anon, authenticated;

-- ── 4. Let the page-view counter keep working ───────────────────────────────
-- This AFTER INSERT trigger updates analytics_sessions. It ran as the invoking
-- role, so revoking anon's write access to analytics_sessions broke every
-- page-view insert with "permission denied for table analytics_sessions".
-- It is internal bookkeeping, so it should run as the owner regardless.
CREATE OR REPLACE FUNCTION public.update_session_page_views()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    UPDATE analytics_sessions
    SET
        page_views = page_views + 1,
        is_bounce = CASE WHEN page_views = 0 THEN FALSE ELSE is_bounce END,
        updated_at = NOW()
    WHERE session_id = NEW.session_id;
    RETURN NEW;
END;
$function$;

COMMIT;

-- ── Deferred: drop the misnamed {public} policies ────────────────────────────
-- analytics_daily_stats / analytics_device_stats still carry the "service role
-- full access" policy, and anon still holds SELECT on them, because the
-- currently-deployed unt_app image reads them through the anon client. Once the
-- requireAdmin() version of the analytics read routes is deployed, run:
--
--   DROP POLICY "service role full access" ON public.analytics_daily_stats;
--   DROP POLICY "service role full access" ON public.analytics_device_stats;
--   DROP POLICY "service role full access" ON public.analytics_users;
--   DROP POLICY "service role full access" ON public.analytics_sessions;
--   DROP POLICY "service role full access" ON public.analytics_page_views;
--   DROP POLICY "service role full access" ON public.analytics_events;
--   REVOKE SELECT ON public.analytics_daily_stats, public.analytics_device_stats
--     FROM anon, authenticated;
--
-- The column grants above are what actually blocks reads today; dropping the
-- policies removes the misleading name and the second, redundant path.
