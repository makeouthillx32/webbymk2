begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.tank_audio_redemptions
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text;

create table if not exists public.tank_room_audio_effects (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.tank_audio_requests(id) on delete cascade,
  room_key text not null references public.tank_rooms(room_key) on delete cascade,
  effect_key text not null,
  effect_config jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at),
  check (expires_at <= starts_at + interval '5 minutes')
);

create index if not exists tank_room_audio_effects_active_idx
  on public.tank_room_audio_effects (room_key, expires_at desc)
  where revoked_at is null;

alter table public.tank_room_audio_effects enable row level security;
revoke all on public.tank_room_audio_effects from public, anon, authenticated;
grant all on public.tank_room_audio_effects to service_role;
drop policy if exists "Service manages Tank room audio effects" on public.tank_room_audio_effects;
create policy "Service manages Tank room audio effects"
  on public.tank_room_audio_effects for all to service_role
  using (true) with check (true);
drop policy if exists "Service manages Tank TTS cache" on public.tank_tts_cache;
create policy "Service manages Tank TTS cache"
  on public.tank_tts_cache for all to service_role
  using (true) with check (true);

create or replace function private.tank_refund_audio_request(
  p_request_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.tank_audio_requests%rowtype;
  v_redemption public.tank_audio_redemptions%rowtype;
  v_refund_txn uuid;
begin
  select * into v_request from public.tank_audio_requests where id = p_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Audio request not found.'; end if;
  select * into v_redemption from public.tank_audio_redemptions where request_id = p_request_id for update;
  if not found or v_redemption.refunded_at is not null then return v_request.refund_transaction_id; end if;

  if v_redemption.redemption_kind = 'tokens' and v_redemption.token_amount > 0 then
    insert into public.tank_token_transactions (user_id, amount, reason)
      values (v_request.user_id, v_redemption.token_amount, left(p_reason, 120))
      returning id into v_refund_txn;
    update public.tank_audio_requests set refund_transaction_id = v_refund_txn where id = p_request_id;
  elsif v_redemption.redemption_kind = 'inventory' and v_redemption.inventory_item_id is not null then
    insert into public.tank_player_inventory (item_id, user_id, quantity, acquired_at)
      values (v_redemption.inventory_item_id, v_request.user_id, 1, now())
      on conflict (item_id, user_id) do update
        set quantity = public.tank_player_inventory.quantity + 1;
  end if;

  update public.tank_audio_redemptions
    set refunded_at = clock_timestamp(), refund_reason = left(p_reason, 240)
    where request_id = p_request_id;
  return v_refund_txn;
end;
$$;

revoke all on function private.tank_refund_audio_request(uuid,text) from public, anon, authenticated;
grant execute on function private.tank_refund_audio_request(uuid,text) to service_role;

create or replace function public.tank_moderate_audio_request(
  p_request_id uuid,
  p_moderator_id uuid,
  p_decision text
)
returns public.tank_audio_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare v_request public.tank_audio_requests%rowtype;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Decision must be approve or reject.';
  end if;
  select * into v_request from public.tank_audio_requests where id = p_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Audio request not found.'; end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = format('Audio request is already %s.', v_request.status);
  end if;
  if p_decision = 'reject' then
    perform private.tank_refund_audio_request(p_request_id, v_request.kind || '_audio_request_rejected');
  end if;
  update public.tank_audio_requests
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      moderated_by = p_moderator_id, moderated_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_request_id returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.tank_moderate_audio_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.tank_moderate_audio_request(uuid,uuid,text) to service_role;

create or replace function public.tank_finish_audio_request(
  p_request_id uuid,
  p_worker_id text,
  p_success boolean,
  p_error_message text default null,
  p_generated_audio_path text default null,
  p_generated_audio_content_type text default null,
  p_generated_audio_duration_ms integer default null,
  p_tts_provider text default null
)
returns public.tank_audio_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare v_request public.tank_audio_requests%rowtype;
begin
  select * into v_request from public.tank_audio_requests
    where id = p_request_id and status = 'playing' and claimed_by = left(p_worker_id, 120)
    for update;
  if not found then raise exception using errcode = 'P0002', message = 'Claimed audio request not found.'; end if;

  if not p_success and v_request.attempts < v_request.max_attempts then
    update public.tank_audio_requests
    set status = 'approved', claimed_by = null, claimed_at = null,
        error_message = left(coalesce(p_error_message, 'Playback failed; retry queued.'), 1000),
        updated_at = clock_timestamp()
    where id = p_request_id returning * into v_request;
    return v_request;
  end if;

  if not p_success then
    perform private.tank_refund_audio_request(p_request_id, v_request.kind || '_audio_request_failed');
  end if;
  update public.tank_audio_requests
  set status = case when p_success then 'completed' else 'failed' end,
      completed_at = case when p_success then clock_timestamp() else completed_at end,
      failed_at = case when p_success then failed_at else clock_timestamp() end,
      error_message = case when p_success then null else left(coalesce(p_error_message, 'Playback failed.'), 1000) end,
      generated_audio_path = coalesce(p_generated_audio_path, generated_audio_path),
      generated_audio_content_type = coalesce(p_generated_audio_content_type, generated_audio_content_type),
      generated_audio_duration_ms = coalesce(p_generated_audio_duration_ms, generated_audio_duration_ms),
      tts_provider = coalesce(p_tts_provider, tts_provider),
      updated_at = clock_timestamp()
  where id = p_request_id returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.tank_finish_audio_request(uuid,text,boolean,text,text,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.tank_finish_audio_request(uuid,text,boolean,text,text,text,integer,text)
  to service_role;

create or replace function public.tank_complete_client_audio_request(p_request_id uuid)
returns public.tank_audio_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare v_request public.tank_audio_requests%rowtype;
begin
  update public.tank_audio_requests
  set status = 'completed', started_at = coalesce(started_at, clock_timestamp()),
      completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_request_id and status = 'approved'
  returning * into v_request;
  if not found then raise exception using errcode = 'P0002', message = 'Approved audio request not found.'; end if;
  return v_request;
end;
$$;

revoke all on function public.tank_complete_client_audio_request(uuid) from public, anon, authenticated;
grant execute on function public.tank_complete_client_audio_request(uuid) to service_role;

create or replace function private.tank_activate_room_audio_effect()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare v_seconds integer;
begin
  if new.kind <> 'hazard_effect' or new.status <> 'approved' or old.status = 'approved' then return new; end if;
  v_seconds := greatest(1, least(300, coalesce((new.payload ->> 'durationSeconds')::integer, 30)));
  insert into public.tank_room_audio_effects (
    request_id, room_key, effect_key, effect_config, starts_at, expires_at
  ) values (
    new.id, new.target_room_key, new.voice_or_sound_key, new.payload,
    clock_timestamp(), clock_timestamp() + make_interval(secs => v_seconds)
  ) on conflict (request_id) do nothing;
  return new;
end;
$$;

drop trigger if exists activate_tank_room_audio_effect on public.tank_audio_requests;
create trigger activate_tank_room_audio_effect
  after update of status on public.tank_audio_requests
  for each row execute function private.tank_activate_room_audio_effect();

commit;
