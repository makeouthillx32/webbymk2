-- 20260826083000_tank_presence_deduplication.sql
-- Deduplicates presence counting so multi-tab / rapid-refresh sessions for the same user or device
-- do not artificially inflate the active viewer count.

create or replace function public.tank_human_presence_snapshot(p_ttl_seconds integer default 45)
returns table (
  online bigint,
  members bigint,
  anonymous bigint,
  automated bigint,
  on_cellular bigint,
  shared_connections bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select *
    from public.tank_viewer_sessions
    where last_seen_at >= now() - make_interval(secs => greatest(5, least(p_ttl_seconds, 300)))
  ), shared as (
    select s.ip_hash
    from live s
    where s.client_kind = 'human' and s.ip_hash is not null
    group by s.ip_hash
    having count(distinct coalesce(s.user_id::text, s.viewer_key)) > 1
  )
  select
    coalesce(
      (count(distinct l.user_id) filter (where l.client_kind = 'human' and l.user_id is not null)) +
      (count(distinct l.viewer_key) filter (where l.client_kind = 'human' and l.user_id is null)),
      0
    )::bigint as online,
    coalesce(count(distinct l.user_id) filter (where l.client_kind = 'human' and l.user_id is not null), 0)::bigint as members,
    coalesce(count(distinct l.viewer_key) filter (where l.client_kind = 'human' and l.user_id is null), 0)::bigint as anonymous,
    coalesce(count(distinct l.viewer_key) filter (where l.client_kind = 'bot'), 0)::bigint as automated,
    coalesce(
      (count(distinct l.user_id) filter (where l.client_kind = 'human' and l.user_id is not null and l.connection_type = 'cellular')) +
      (count(distinct l.viewer_key) filter (where l.client_kind = 'human' and l.user_id is null and l.connection_type = 'cellular')),
      0
    )::bigint as on_cellular,
    (select count(*) from shared)::bigint as shared_connections
  from live l;
$$;

revoke all on function public.tank_human_presence_snapshot(integer) from public, anon, authenticated;
grant execute on function public.tank_human_presence_snapshot(integer) to service_role;