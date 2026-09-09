-- Tank Tavern Phase 2: tank_join_tavern_queue(). tank_tavern_queue has no
-- user-facing INSERT policy (own-row SELECT/DELETE only — see Phase 1
-- schema), and the position column is meant to come from
-- tank_tavern_queue_position_seq (already created in Phase 1) rather than a
-- read-max-then-insert race in application code. Wrapped as a RPC instead
-- of a plain admin-client insert so nextval() + the idempotent insert stay
-- atomic and race-free under concurrent joins.
create or replace function public.tank_join_tavern_queue() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_position bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'sign in required');
  end if;

  if exists (select 1 from public.tank_tavern_shifts where status = 'active' and bartender_id = v_user_id) then
    return jsonb_build_object('success', false, 'error', 'you already hold the Apron');
  end if;

  select position into v_position from public.tank_tavern_queue where user_id = v_user_id;
  if v_position is not null then
    return jsonb_build_object('success', true, 'position', v_position);
  end if;

  v_position := nextval('public.tank_tavern_queue_position_seq');
  insert into public.tank_tavern_queue (user_id, position) values (v_user_id, v_position);

  return jsonb_build_object('success', true, 'position', v_position);
exception
  when unique_violation then
    select position into v_position from public.tank_tavern_queue where user_id = v_user_id;
    return jsonb_build_object('success', true, 'position', v_position);
end;
$$;

revoke all on function public.tank_join_tavern_queue() from public, anon;
grant execute on function public.tank_join_tavern_queue() to authenticated;
