begin;

-- Tank physical-room audio backend. The existing tank_player_inventory and
-- tank_token_transactions tables remain the sources of truth for ownership
-- and currency; this migration adds an auditable redemption trail and evolves
-- the previously prototyped request concept into a worker-safe queue.

create table if not exists public.tank_sfx_library (
  id uuid primary key default gen_random_uuid(),
  sound_key text not null unique,
  name text not null,
  file_url text not null,
  category text not null default 'general',
  default_volume double precision not null default 1.0
    check (default_volume between 0.0 and 1.0),
  duration_ms integer check (duration_ms is null or duration_ms between 1 and 300000),
  is_premium boolean not null default false,
  required_item_slug text,
  token_cost integer not null default 75 check (token_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sound_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$')
);

comment on table public.tank_sfx_library is
  'Public-safe SFX metadata. file_url may only point at approved Tank storage/CDN assets; credentials never belong here.';

alter table public.tank_inventory_items
  add column if not exists audio_effect_type text,
  add column if not exists audio_effect_payload jsonb not null default '{}'::jsonb;

alter table public.tank_inventory_items
  drop constraint if exists tank_inventory_items_audio_effect_type_check;
alter table public.tank_inventory_items
  add constraint tank_inventory_items_audio_effect_type_check
  check (audio_effect_type is null or audio_effect_type in ('sfx_pass', 'tts_pass', 'hazard_effect'));

create table if not exists public.tank_audio_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tts', 'sfx', 'hazard_effect')),
  message text,
  voice_or_sound_key text not null,
  target_type text not null default 'room' check (target_type in ('website', 'room')),
  target_room_key text references public.tank_rooms(room_key) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  cost integer not null default 0 check (cost >= 0),
  priority integer not null default 0 check (priority between 0 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'playing', 'completed', 'failed', 'rejected')),
  sfx_id uuid references public.tank_sfx_library(id) on delete set null,
  inventory_item_id uuid references public.tank_inventory_items(id) on delete set null,
  token_transaction_id uuid references public.tank_token_transactions(id) on delete set null,
  refund_transaction_id uuid references public.tank_token_transactions(id) on delete set null,
  generated_audio_path text,
  generated_audio_content_type text,
  generated_audio_duration_ms integer,
  tts_provider text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  claimed_by text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tank_audio_requests_room_target_needs_room_key
    check (target_type = 'website' or target_room_key is not null),
  constraint tank_audio_requests_tts_message_check
    check (kind <> 'tts' or (message is not null and char_length(btrim(message)) between 1 and 250)),
  constraint tank_audio_requests_generated_duration_check
    check (generated_audio_duration_ms is null or generated_audio_duration_ms between 1 and 300000)
);

-- Forward compatibility if the earlier prototype table is present.
alter table public.tank_audio_requests
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists priority integer not null default 0,
  add column if not exists sfx_id uuid references public.tank_sfx_library(id) on delete set null,
  add column if not exists inventory_item_id uuid references public.tank_inventory_items(id) on delete set null,
  add column if not exists generated_audio_path text,
  add column if not exists generated_audio_content_type text,
  add column if not exists generated_audio_duration_ms integer,
  add column if not exists tts_provider text,
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists claimed_by text,
  add column if not exists claimed_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.tank_audio_requests drop constraint if exists tank_audio_requests_kind_check;
alter table public.tank_audio_requests add constraint tank_audio_requests_kind_check
  check (kind in ('tts', 'sfx', 'hazard_effect'));
alter table public.tank_audio_requests drop constraint if exists tank_audio_requests_status_check;
update public.tank_audio_requests set status = 'completed' where status = 'played';
alter table public.tank_audio_requests add constraint tank_audio_requests_status_check
  check (status in ('pending', 'approved', 'playing', 'completed', 'failed', 'rejected'));

create table if not exists public.tank_audio_redemptions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tank_audio_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid references public.tank_inventory_items(id) on delete set null,
  token_transaction_id uuid references public.tank_token_transactions(id) on delete set null,
  redemption_kind text not null check (redemption_kind in ('inventory', 'tokens', 'free')),
  quantity integer not null default 0 check (quantity >= 0),
  token_amount integer not null default 0 check (token_amount >= 0),
  created_at timestamptz not null default now(),
  unique (request_id)
);

create table if not exists public.tank_tts_cache (
  cache_key text primary key,
  provider text not null,
  voice_key text not null,
  model_key text,
  storage_path text not null,
  content_type text not null,
  duration_ms integer,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (cache_key ~ '^[a-f0-9]{64}$')
);

create index if not exists tank_sfx_library_active_category_idx
  on public.tank_sfx_library (category, name) where is_active;
create index if not exists tank_audio_requests_user_created_idx
  on public.tank_audio_requests (user_id, created_at desc);
create index if not exists tank_audio_requests_dispatch_idx
  on public.tank_audio_requests (priority desc, created_at)
  where status = 'approved';
create index if not exists tank_audio_requests_room_history_idx
  on public.tank_audio_requests (target_room_key, created_at desc)
  where target_room_key is not null;
create unique index if not exists tank_audio_requests_one_playing_per_room_uidx
  on public.tank_audio_requests (target_room_key)
  where status = 'playing' and target_room_key is not null;
create index if not exists tank_audio_redemptions_user_created_idx
  on public.tank_audio_redemptions (user_id, created_at desc);
create index if not exists tank_tts_cache_last_used_idx
  on public.tank_tts_cache (last_used_at);

alter table public.tank_sfx_library enable row level security;
alter table public.tank_audio_requests enable row level security;
alter table public.tank_audio_redemptions enable row level security;
alter table public.tank_tts_cache enable row level security;

revoke all on public.tank_sfx_library from public, anon, authenticated;
revoke all on public.tank_audio_requests from public, anon, authenticated;
revoke all on public.tank_audio_redemptions from public, anon, authenticated;
revoke all on public.tank_tts_cache from public, anon, authenticated;
grant select on public.tank_sfx_library to anon, authenticated;
grant select on public.tank_audio_requests to authenticated;
grant select on public.tank_audio_redemptions to authenticated;
grant all on public.tank_sfx_library, public.tank_audio_requests,
  public.tank_audio_redemptions, public.tank_tts_cache to service_role;

drop policy if exists "Public reads active Tank SFX" on public.tank_sfx_library;
create policy "Public reads active Tank SFX"
  on public.tank_sfx_library for select to anon, authenticated using (is_active);

drop policy if exists "Users read own Tank audio requests" on public.tank_audio_requests;
create policy "Users read own Tank audio requests"
  on public.tank_audio_requests for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read own Tank audio redemptions" on public.tank_audio_redemptions;
create policy "Users read own Tank audio redemptions"
  on public.tank_audio_redemptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- All request creation is server-only and atomic. The caller is an authenticated
-- Tank API route using service_role after it independently verifies the user.
create or replace function public.tank_enqueue_audio_request(
  p_user_id uuid,
  p_kind text,
  p_message text,
  p_voice_or_sound_key text,
  p_target_type text,
  p_target_room_key text,
  p_cost integer,
  p_priority integer default 0,
  p_payload jsonb default '{}'::jsonb,
  p_inventory_item_slug text default null,
  p_sfx_id uuid default null
)
returns public.tank_audio_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.tank_profiles%rowtype;
  v_item public.tank_inventory_items%rowtype;
  v_inventory public.tank_player_inventory%rowtype;
  v_txn_id uuid;
  v_request public.tank_audio_requests%rowtype;
  v_redemption_kind text := 'free';
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Authenticated user is required.';
  end if;
  if p_kind not in ('tts', 'sfx', 'hazard_effect') then
    raise exception using errcode = '22023', message = 'Unsupported audio request kind.';
  end if;
  if p_target_type not in ('website', 'room')
     or (p_target_type = 'room' and nullif(btrim(p_target_room_key), '') is null) then
    raise exception using errcode = '22023', message = 'A valid audio target is required.';
  end if;
  if p_kind = 'tts' and (nullif(btrim(p_message), '') is null or char_length(btrim(p_message)) > 250) then
    raise exception using errcode = '22023', message = 'TTS must contain between 1 and 250 characters.';
  end if;
  if coalesce(p_cost, 0) < 0 then
    raise exception using errcode = '22023', message = 'Audio request cost cannot be negative.';
  end if;

  select * into v_profile from public.tank_profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Tank profile not found.';
  end if;

  if nullif(btrim(p_inventory_item_slug), '') is not null then
    select * into v_item
      from public.tank_inventory_items
      where slug = p_inventory_item_slug and is_active
      for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'Audio inventory item is unavailable.';
    end if;
    select * into v_inventory
      from public.tank_player_inventory
      where user_id = p_user_id and item_id = v_item.id
      for update;
    if not found or v_inventory.quantity < 1 then
      raise exception using errcode = 'P0001', message = 'This audio item is not in your inventory.';
    end if;
    if v_inventory.quantity = 1 then
      delete from public.tank_player_inventory where user_id = p_user_id and item_id = v_item.id;
    else
      update public.tank_player_inventory set quantity = quantity - 1
        where user_id = p_user_id and item_id = v_item.id;
    end if;
    v_redemption_kind := 'inventory';
  elsif coalesce(p_cost, 0) > 0 then
    if v_profile.tokens < p_cost then
      raise exception using errcode = 'P0001',
        message = format('Not enough tokens (need %s, have %s).', p_cost, v_profile.tokens);
    end if;
    insert into public.tank_token_transactions (user_id, amount, reason)
      values (p_user_id, -p_cost, p_kind || '_audio_request') returning id into v_txn_id;
    v_redemption_kind := 'tokens';
  end if;

  insert into public.tank_audio_requests (
    user_id, kind, message, voice_or_sound_key, target_type, target_room_key,
    payload, cost, priority, status, sfx_id, inventory_item_id, token_transaction_id
  ) values (
    p_user_id, p_kind, case when p_kind = 'tts' then btrim(p_message) else null end,
    left(p_voice_or_sound_key, 120), p_target_type,
    case when p_target_type = 'room' then p_target_room_key else null end,
    coalesce(p_payload, '{}'::jsonb), p_cost, greatest(0, least(1000, coalesce(p_priority, 0))),
    'pending', p_sfx_id, v_item.id, v_txn_id
  ) returning * into v_request;

  insert into public.tank_audio_redemptions (
    request_id, user_id, inventory_item_id, token_transaction_id,
    redemption_kind, quantity, token_amount
  ) values (
    v_request.id, p_user_id, v_item.id, v_txn_id, v_redemption_kind,
    case when v_redemption_kind = 'inventory' then 1 else 0 end,
    case when v_redemption_kind = 'tokens' then p_cost else 0 end
  );

  return v_request;
end;
$$;

revoke all on function public.tank_enqueue_audio_request(uuid,text,text,text,text,text,integer,integer,jsonb,text,uuid)
  from public, anon, authenticated;
grant execute on function public.tank_enqueue_audio_request(uuid,text,text,text,text,text,integer,integer,jsonb,text,uuid)
  to service_role;

-- One claim per room at a time. SKIP LOCKED permits multiple workers to serve
-- different rooms without ever overlapping output on the same speaker.
create or replace function public.tank_claim_audio_request(
  p_worker_id text,
  p_room_keys text[] default null
)
returns setof public.tank_audio_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select q.id into v_id
  from public.tank_audio_requests q
  join public.tank_rooms r on r.room_key = q.target_room_key
  where q.status = 'approved'
    and q.target_type = 'room'
    and q.attempts < q.max_attempts
    and r.audio_output_kind = 'host-bluetooth'
    and (p_room_keys is null or q.target_room_key = any(p_room_keys))
    and not exists (
      select 1 from public.tank_audio_requests active
      where active.target_room_key = q.target_room_key and active.status = 'playing'
    )
  order by q.priority desc, q.created_at
  for update of q skip locked
  limit 1;

  if v_id is null then return; end if;

  return query
  update public.tank_audio_requests
  set status = 'playing', claimed_by = left(p_worker_id, 120), claimed_at = clock_timestamp(),
      started_at = clock_timestamp(), attempts = attempts + 1, error_message = null,
      updated_at = clock_timestamp()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.tank_claim_audio_request(text,text[]) from public, anon, authenticated;
grant execute on function public.tank_claim_audio_request(text,text[]) to service_role;

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
  where id = p_request_id and status = 'playing' and claimed_by = left(p_worker_id, 120)
  returning * into v_request;
  if not found then
    raise exception using errcode = 'P0002', message = 'Claimed audio request not found.';
  end if;
  return v_request;
end;
$$;

revoke all on function public.tank_finish_audio_request(uuid,text,boolean,text,text,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.tank_finish_audio_request(uuid,text,boolean,text,text,text,integer,text)
  to service_role;

-- Stale worker recovery is deliberate and bounded. A later worker can claim a
-- request only after the prior 10-minute lease has clearly expired.
create or replace function public.tank_requeue_stale_audio_requests()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  update public.tank_audio_requests
  set status = case when attempts < max_attempts then 'approved' else 'failed' end,
      failed_at = case when attempts < max_attempts then failed_at else clock_timestamp() end,
      error_message = case when attempts < max_attempts then 'Worker lease expired; queued for retry.'
        else 'Worker lease expired; retry limit reached.' end,
      claimed_by = null, claimed_at = null, updated_at = clock_timestamp()
  where status = 'playing' and claimed_at < clock_timestamp() - interval '10 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.tank_requeue_stale_audio_requests() from public, anon, authenticated;
grant execute on function public.tank_requeue_stale_audio_requests() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tank-audio-cache', 'tank-audio-cache', false, 10485760,
  array['audio/mpeg','audio/wav','audio/ogg','audio/mp4']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.tank_platform_settings (key, value)
values
  ('tts_enabled', '{"enabled": false}'::jsonb),
  ('sfx_enabled', '{"enabled": false}'::jsonb),
  ('hazard_audio_enabled', '{"enabled": false}'::jsonb),
  ('audio_moderation_required', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

commit;
