-- Durable Tank daily-login streaks.
--
-- A claim becomes available 24 hours after the previous claim. From that
-- point the viewer has a 24-hour continuation window. If that window is
-- missed, the active streak returns to zero; the next successful claim then
-- starts a fresh streak at tick 1. Claim history is retained independently so
-- future reward-tree/item work can build on real data without changing the
-- claim contract.

alter table public.tank_profiles
  add column if not exists daily_streak integer not null default 0,
  add column if not exists longest_daily_streak integer not null default 0,
  add column if not exists daily_claim_count integer not null default 0,
  add column if not exists last_daily_claim_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tank_profiles_daily_streak_nonnegative'
      and conrelid = 'public.tank_profiles'::regclass
  ) then
    alter table public.tank_profiles
      add constraint tank_profiles_daily_streak_nonnegative
      check (daily_streak >= 0 and longest_daily_streak >= 0 and daily_claim_count >= 0);
  end if;
end
$$;

create table if not exists public.tank_daily_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  streak_tick integer not null check (streak_tick > 0),
  total_claims integer not null check (total_claims > 0),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  tokens_awarded integer not null default 0 check (tokens_awarded >= 0)
);

create index if not exists tank_daily_claims_user_claimed_at_idx
  on public.tank_daily_claims (user_id, claimed_at desc);

alter table public.tank_daily_claims enable row level security;

drop policy if exists "Users can read their own daily claims" on public.tank_daily_claims;
create policy "Users can read their own daily claims"
  on public.tank_daily_claims
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Service role manages daily claims" on public.tank_daily_claims;
create policy "Service role manages daily claims"
  on public.tank_daily_claims
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.tank_daily_claims from public, anon, authenticated;
grant select on table public.tank_daily_claims to authenticated;
grant all on table public.tank_daily_claims to service_role;
grant usage, select on sequence public.tank_daily_claims_id_seq to service_role;

-- This RPC is only callable by the server-side service role. The application
-- authenticates the viewer before passing the verified auth user id. A row
-- lock makes double-clicks and simultaneous requests resolve atomically.
create or replace function public.tank_claim_daily_streak(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_last_claim timestamptz;
  v_previous_streak integer := 0;
  v_streak integer := 0;
  v_total_claims integer := 0;
  v_longest_streak integer := 0;
  v_next_claim_at timestamptz;
  v_streak_expires_at timestamptz;
  v_xp_gain integer := 50;
  v_token_gain integer := 25;
begin
  insert into public.tank_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select
    last_daily_claim_at,
    daily_streak,
    daily_claim_count,
    longest_daily_streak
  into
    v_last_claim,
    v_previous_streak,
    v_total_claims,
    v_longest_streak
  from public.tank_profiles
  where user_id = p_user_id
  for update;

  if v_last_claim is not null then
    v_next_claim_at := v_last_claim + interval '24 hours';
    v_streak_expires_at := v_last_claim + interval '48 hours';

    if v_now < v_next_claim_at then
      return jsonb_build_object(
        'success', false,
        'error', 'Daily reward already claimed.',
        'streak_day', v_previous_streak,
        'total_claims', v_total_claims,
        'longest_streak', v_longest_streak,
        'next_claim_at', v_next_claim_at,
        'streak_expires_at', v_streak_expires_at,
        'next_claim_in_seconds', greatest(0, ceil(extract(epoch from (v_next_claim_at - v_now)))::integer)
      );
    end if;

    if v_now > v_streak_expires_at then
      v_previous_streak := 0;
    end if;
  end if;

  v_streak := v_previous_streak + 1;
  v_total_claims := v_total_claims + 1;
  v_longest_streak := greatest(v_longest_streak, v_streak);

  update public.tank_profiles
  set
    daily_streak = v_streak,
    longest_daily_streak = v_longest_streak,
    daily_claim_count = v_total_claims,
    last_daily_claim_at = v_now,
    xp = xp + v_xp_gain
  where user_id = p_user_id;

  insert into public.tank_token_transactions (user_id, amount, reason)
  values (p_user_id, v_token_gain, 'Daily login bonus - streak ' || v_streak::text);

  insert into public.tank_daily_claims (
    user_id,
    claimed_at,
    streak_tick,
    total_claims,
    xp_awarded,
    tokens_awarded
  ) values (
    p_user_id,
    v_now,
    v_streak,
    v_total_claims,
    v_xp_gain,
    v_token_gain
  );

  return jsonb_build_object(
    'success', true,
    'streak_day', v_streak,
    'total_claims', v_total_claims,
    'longest_streak', v_longest_streak,
    'xp_gained', v_xp_gain,
    'tokens_gained', v_token_gain,
    'claimed_at', v_now,
    'next_claim_at', v_now + interval '24 hours',
    'streak_expires_at', v_now + interval '48 hours'
  );
end;
$$;

revoke all on function public.tank_claim_daily_streak(uuid)
  from public, anon, authenticated;
grant execute on function public.tank_claim_daily_streak(uuid)
  to service_role;

-- Reset expired active streaks in small, idempotent passes. Rows already at
-- base zero are untouched, so repeated runs are harmless.
create or replace function private.tank_reset_expired_daily_streaks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_count integer := 0;
begin
  update public.tank_profiles
  set daily_streak = 0
  where daily_streak <> 0
    and last_daily_claim_at < clock_timestamp() - interval '48 hours';

  get diagnostics v_reset_count = row_count;
  return v_reset_count;
end;
$$;

revoke all on function private.tank_reset_expired_daily_streaks()
  from public, anon, authenticated;
grant execute on function private.tank_reset_expired_daily_streaks()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'tank-daily-streak-expiry';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'tank-daily-streak-expiry',
    '*/15 * * * *',
    'select private.tank_reset_expired_daily_streaks();'
  );
end
$$;
