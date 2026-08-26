-- Forward hardening for databases where the LIMS and creator migrations were
-- applied before their access controls were corrected.

alter table if exists public.peptide_requests enable row level security;
alter table if exists public.peptide_request_status_log enable row level security;
alter table if exists public.clickup_user_mapping enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'peptide_requests',
    'peptide_request_status_log',
    'clickup_user_mapping'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'revoke all on table public.%I from anon, authenticated',
        table_name
      );
    end if;
  end loop;
end
$$;

-- The service role already bypasses RLS, so these money-adjacent RPCs do not
-- need definer privileges. They must not remain executable by PUBLIC.
alter function public.request_creator_cashout(uuid) security invoker;
alter function public.resolve_creator_cashout(uuid, text, text, text, uuid) security invoker;
alter function public.credit_creator_commission(uuid, text, integer, text) security invoker;
alter function public.reverse_creator_commission(uuid) security invoker;

revoke all on function public.request_creator_cashout(uuid) from public, anon, authenticated;
revoke all on function public.resolve_creator_cashout(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_creator_commission(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.reverse_creator_commission(uuid) from public, anon, authenticated;

grant execute on function public.request_creator_cashout(uuid) to service_role;
grant execute on function public.resolve_creator_cashout(uuid, text, text, text, uuid) to service_role;
grant execute on function public.credit_creator_commission(uuid, text, integer, text) to service_role;
grant execute on function public.reverse_creator_commission(uuid) to service_role;

create unique index if not exists creator_ledger_entries_order_kind_uidx
  on public.creator_ledger_entries(order_id, kind)
  where order_id is not null and kind in ('earned', 'reversal');
