begin;

create or replace function public.tank_claim_audio_request(
  p_worker_id text,
  p_room_keys text[] default null
)
returns setof public.tank_audio_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare v_id uuid;
begin
  select q.id into v_id
  from public.tank_audio_requests q
  join public.tank_rooms r on r.room_key = q.target_room_key
  where q.status = 'approved'
    and q.target_type = 'room'
    and q.attempts < q.max_attempts
    and r.audio_output_kind = 'host-bluetooth'
    and not coalesce((r.audio_output_config ->> 'muted')::boolean, false)
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

commit;
