-- Tank identity setup and rename economy.
--
-- A provider-supplied display name is not proof that a person chose their
-- Tank identity. Existing and future members therefore begin with setup
-- incomplete, confirm or replace that name once during setup, receive one
-- later free rename, and then consume Rename Ticket inventory atomically.

alter table public.tank_profiles
  add column if not exists display_name_confirmed_at timestamptz,
  add column if not exists free_rename_used_at timestamptz;

-- Auth owns verification. Repair the older Tank mirror rather than asking an
-- already-confirmed Shop/Labs/Core member to verify the same platform email.
update public.tank_profiles tp
set email_verified = true,
    verified_via = case
      when coalesce(tp.verified_via, 'unverified') = 'unverified' then 'platform_auth'
      else tp.verified_via
    end,
    updated_at = now()
from auth.users au
where au.id = tp.user_id
  and au.email_confirmed_at is not null
  and tp.email_verified is not true;

create unique index if not exists tank_profiles_confirmed_display_name_unique
  on public.tank_profiles (lower(display_name))
  where display_name_confirmed_at is not null
    and nullif(btrim(display_name), '') is not null;

insert into public.tank_inventory_items (
  slug,
  name,
  description,
  rarity,
  is_active
)
values (
  'rename-ticket',
  'Rename Ticket',
  'Changes your Tank display name after your free rename has been used.',
  'rare',
  true
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    rarity = excluded.rarity,
    is_active = excluded.is_active;

create or replace function public.tank_set_display_name(
  p_user_id uuid,
  p_display_name text
)
returns table (
  display_name text,
  change_kind text,
  setup_complete boolean,
  free_rename_available boolean,
  rename_ticket_quantity integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_current_name text;
  v_confirmed_at timestamptz;
  v_free_rename_used_at timestamptz;
  v_ticket_id uuid;
  v_ticket_quantity integer;
  v_change_kind text;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'Tank display names may only be changed by the trusted server.';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_display_name, '')), '[[:space:]]+', ' ', 'g');

  if char_length(v_name) < 3 or char_length(v_name) > 24 then
    raise exception using
      errcode = '22023',
      message = 'Display name must be between 3 and 24 characters.';
  end if;

  if v_name ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Display name contains unsupported characters.';
  end if;

  insert into public.tank_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select tp.display_name, tp.display_name_confirmed_at, tp.free_rename_used_at
    into v_current_name, v_confirmed_at, v_free_rename_used_at
  from public.tank_profiles tp
  where tp.user_id = p_user_id
  for update;

  if v_confirmed_at is null then
    v_change_kind := 'setup';

    update public.tank_profiles
    set display_name = v_name,
        display_name_confirmed_at = now(),
        updated_at = now()
    where user_id = p_user_id;
  elsif lower(coalesce(v_current_name, '')) = lower(v_name) then
    v_change_kind := 'unchanged';
  elsif v_free_rename_used_at is null then
    v_change_kind := 'free_rename';

    update public.tank_profiles
    set display_name = v_name,
        free_rename_used_at = now(),
        updated_at = now()
    where user_id = p_user_id;
  else
    select item.id, inventory.quantity
      into v_ticket_id, v_ticket_quantity
    from public.tank_inventory_items item
    join public.tank_player_inventory inventory
      on inventory.item_id = item.id
     and inventory.user_id = p_user_id
    where item.slug = 'rename-ticket'
      and item.is_active
    for update of inventory;

    if v_ticket_id is null or coalesce(v_ticket_quantity, 0) < 1 then
      raise exception using
        errcode = 'P0001',
        message = 'A Rename Ticket is required for another name change.';
    end if;

    if v_ticket_quantity = 1 then
      delete from public.tank_player_inventory
      where item_id = v_ticket_id and user_id = p_user_id;
    else
      update public.tank_player_inventory
      set quantity = quantity - 1
      where item_id = v_ticket_id and user_id = p_user_id;
    end if;

    v_change_kind := 'ticket_rename';

    update public.tank_profiles
    set display_name = v_name,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  update public.profiles
  set display_name = v_name,
      updated_at = now()
  where id = p_user_id;

  select coalesce(inventory.quantity, 0)
    into v_ticket_quantity
  from public.tank_inventory_items item
  left join public.tank_player_inventory inventory
    on inventory.item_id = item.id
   and inventory.user_id = p_user_id
  where item.slug = 'rename-ticket';

  return query
  select
    v_name,
    v_change_kind,
    true,
    (select tp.free_rename_used_at is null from public.tank_profiles tp where tp.user_id = p_user_id),
    coalesce(v_ticket_quantity, 0);
end;
$$;

revoke all on function public.tank_set_display_name(uuid, text) from public;
revoke all on function public.tank_set_display_name(uuid, text) from anon;
revoke all on function public.tank_set_display_name(uuid, text) from authenticated;
grant execute on function public.tank_set_display_name(uuid, text) to service_role;

comment on function public.tank_set_display_name(uuid, text) is
  'Trusted-server Tank identity update with setup, one free rename, then atomic Rename Ticket consumption.';
