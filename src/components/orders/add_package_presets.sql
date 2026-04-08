-- migration: add_package_presets
-- Stores reusable package dimension presets for USPS label generation.
-- Used by the PackagePicker component when printing shipping labels.

create table if not exists public.package_presets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                        -- e.g. "Poly Mailer — Small"
  description  text null,                            -- e.g. "T-shirts, cardigans"
  weight_lb    numeric(6,3) not null check (weight_lb > 0),
  length_in    numeric(6,2) not null check (length_in > 0),
  width_in     numeric(6,2) not null check (width_in > 0),
  height_in    numeric(6,2) not null check (height_in > 0),
  is_active    boolean not null default true,
  position     int not null default 0,               -- display order
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Only admins can manage presets; anyone authenticated can read them
alter table public.package_presets enable row level security;

create policy "Admins can manage package presets"
  on public.package_presets
  for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Authenticated users can read package presets"
  on public.package_presets
  for select
  using (auth.uid() is not null);

-- Seed with the same defaults as the hardcoded PackagePicker presets
insert into public.package_presets (name, description, weight_lb, length_in, width_in, height_in, position)
values
  ('Poly Mailer — Small',  'T-shirts, cardigans, soft items',         0.500, 10.0, 13.0, 1.0, 0),
  ('Poly Mailer — Large',  'Bulkier clothing, multiple items',         1.000, 14.5, 19.0, 1.0, 1),
  ('Small Box',            'Accessories, jewelry, small gifts',        0.750,  8.0,  6.0, 4.0, 2),
  ('Medium Box',           'Boots, shoes',                             3.000, 14.0, 10.0, 6.0, 3);
