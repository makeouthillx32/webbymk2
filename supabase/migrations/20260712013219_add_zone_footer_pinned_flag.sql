alter table public.zones
  add column if not exists footer_pinned boolean not null default false;

comment on column public.zones.footer_pinned is
  'Controls whether this app is shown in the public landing footer links.';

update public.zones
set footer_pinned = true,
    updated_at = now()
where key in ('blog', 'shop', 'docs')
  and not exists (
    select 1
    from public.zones
    where footer_pinned = true
  );
