-- 1: The Foundation (CLEAN / NO FUTURE REFERENCES)
-- Goal:
-- - Setup extensions, core utility functions, and system-wide logging.
-- IMPORTANT:
-- - This block must NOT reference tables that do not exist yet
--   (profiles, carts, products, etc. are created in later blocks).

-- A) EXTENSIONS
-- Used later for fast ILIKE / similarity search (Block 9).
create extension if not exists pg_trgm;

-- B) UPDATED_AT UTILITY FUNCTION
-- Generic trigger function used by many tables later.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- C) ADMIN AUDIT LOG
-- Track who did what, to what.
-- NOTE: No foreign keys here (avoids dependency-order failures).
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),

  actor_profile_id uuid null,         -- soft reference to profiles.id (no FK here)
  actor_auth_user_id uuid null,       -- soft reference to auth.users.id (no FK here)

  action text not null,               -- e.g. 'SOFT_DELETE_PROFILE', 'UPDATE_PRICE'
  entity_type text not null,          -- e.g. 'profile', 'product', 'order'
  entity_id uuid null,                -- ID of the affected row

  reason text null,                   -- Internal notes
  ip inet null,                       -- Network context
  user_agent text null,               -- Browser/Device context

  meta jsonb not null default '{}'::jsonb, -- Snapshots of data changes
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log(entity_type, entity_id);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log(actor_auth_user_id);

-- 2) Marketing & Storefront
-- Top banner (the "Free shipping..." row)
create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,              -- e.g. 'top_banner'
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_banner_items (
  id uuid primary key default gen_random_uuid(),
  banner_id uuid not null references public.site_banners(id) on delete cascade,
  text text not null,                    -- e.g. 'Free shipping over $75'
  position int not null default 0,
  is_enabled boolean not null default true
);

create index if not exists site_banner_items_banner_idx on public.site_banner_items(banner_id);
create unique index if not exists site_banner_items_unique_pos on public.site_banner_items(banner_id, position);

--  Hero section (pill, headline, subtext, buttons)
create table if not exists public.home_hero (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,              -- e.g. 'default'
  is_enabled boolean not null default true,

  pill_text text null,                   -- "Desert Cowgirl • Western-inspired..."
  headline_line1 text not null,          -- "Wear the desert."
  headline_line2 text null,              -- "Keep it classic."
  subtext text null,

  primary_button_label text not null default 'Shop Now',
  primary_button_href text not null default '#shop',
  secondary_button_label text not null default 'New Releases',
  secondary_button_href text not null default '#new-releases',

  hero_image_url text null,              -- optional future (or storage path)
  hero_image_alt text null,

  updated_at timestamptz not null default now()
);

-- C) Trust tiles under hero (Fast shipping / Easy returns / Secure checkout)
create table if not exists public.home_trust_tiles (
  id uuid primary key default gen_random_uuid(),
  hero_key text not null default 'default', -- ties to home_hero.key
  eyebrow text not null,                    -- "Fast shipping"
  title text not null,                      -- "Packed with care"
  position int not null default 0,
  is_enabled boolean not null default true
);

create index if not exists home_trust_tiles_hero_key_idx on public.home_trust_tiles(hero_key);
create unique index if not exists home_trust_tiles_unique_pos on public.home_trust_tiles(hero_key, position);
--HOMEPAGE CONTENT (banner + hero + promo panels + featured slots)
create table if not exists public.homepage_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- e.g. 'top_banner', 'hero', 'promo_panels'
  json jsonb not null,
  updated_at timestamptz not null default now()
);

--3: The Catalog "Folders"
--) TAGS + JOIN (fast filtering)
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create index if not exists product_tags_tag_idx on public.product_tags(tag_id);


--CATEGORIES (optional nesting)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid null references public.categories(id) on delete set null,
  position int not null default 0
);

create table if not exists public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

--COLLECTIONS (for New Releases, Restocks, Cowkids, etc.)
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text null,
  position int not null default 0,
  is_home_section boolean not null default false
);

create table if not exists public.collection_products (
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position int not null default 0,
  primary key (collection_id, product_id)
);

create index if not exists collection_products_collection_idx on public.collection_products(collection_id);

-- 4: THE PRODUCT CORE (FIXED: search_text is created IN-TABLE)
-- Fixes included:
-- ✅ products.search_text exists before Block 9 search functions/triggers/indexes
-- ✅ keeps dependency order clean (no ALTER TABLE needed earlier)

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique,
  title text not null,
  description text null,

  -- pricing
  price_cents int not null check (price_cents >= 0),
  compare_at_price_cents int null check (compare_at_price_cents >= 0),
  currency text not null default 'USD',

  status text not null default 'active'
    check (status in ('active','draft','archived')),

  is_featured boolean not null default false,

  -- ✅ search document (must exist BEFORE Block 9 search logic)
  search_text text null,

  -- SEO / OG overrides (optional)
  seo_title text null,
  seo_description text null,
  og_image_override_url text null,

  -- “Shopify-feel” badging
  badge text null, -- e.g. 'New', 'Restock', 'Sale'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_status_idx on public.products(status);
create index if not exists products_featured_idx on public.products(is_featured);

-- PRODUCT IMAGES (gallery)
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,

  storage_path text not null, -- Supabase Storage path like 'products/<productId>/<file>.jpg'
  alt text null,
  position int not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists product_images_product_idx on public.product_images(product_id);

create unique index if not exists product_images_unique_position
  on public.product_images(product_id, position);

--5: The Specifics (Variants & Stock)
-- PRODUCT VARIANTS + INVENTORY (handles singular items + quantity)

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,

  -- supports simple products and later size/color
  title text not null default 'Default',     -- e.g. "Small / Black" or "Default"
  sku text null unique,

  -- ✅ structured variant metadata for UI selectors (size/color/etc)
  -- example: {"size":"M","color":"Black"}
  options jsonb not null default '{}'::jsonb,
  -- enforce object (not array/string/etc)
  constraint product_variants_options_is_object
    check (jsonb_typeof(options) = 'object'),

  -- optional: prevent duplicate option combos per product
  options_text text generated always as (options::text) stored,

  price_cents int null check (price_cents >= 0),           -- override product.price_cents if set
  compare_at_price_cents int null check (compare_at_price_cents >= 0),

  is_active boolean not null default true,
  position int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_variants_unique_options_per_product
    unique (product_id, options_text)
);

create index if not exists product_variants_product_idx
  on public.product_variants(product_id);

create unique index if not exists product_variants_unique_position
  on public.product_variants(product_id, position);

-- helps queries like: WHERE options @> '{"size":"M"}'
create index if not exists product_variants_options_gin_idx
  on public.product_variants using gin (options);

-- ✅ Variant-to-Image mapping (fixes variant image selection blind spot)
-- Links a variant to existing product_images rows.
create table if not exists public.variant_images (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  image_id uuid not null references public.product_images(id) on delete cascade,
  position int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (variant_id, image_id)
);

create index if not exists variant_images_variant_idx
  on public.variant_images(variant_id);

create index if not exists variant_images_image_idx
  on public.variant_images(image_id);

create unique index if not exists variant_images_unique_position
  on public.variant_images(variant_id, position)
  where position is not null;

-- inventory model:
-- - track_inventory=false = "infinite" (no stock checks)
-- - track_inventory=true + quantity=1 = "singular item"
-- - track_inventory=true + quantity>1 = normal quantity product
create table if not exists public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  track_inventory boolean not null default true,
  quantity int not null default 0 check (quantity >= 0),
  allow_backorder boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 6: Profiles + Soft-Delete System (MOVED CONTENT)
-- Goal:
-- - Define the soft-delete + restore functions safely (profiles + carts exist now)
-- - Add admin-friendly views that depend on live tables
-- Assumes:
-- - public.profiles exists (created earlier in this block or immediately before this block)
-- - public.carts exists (Block 6.1 from your Sales Prep block, or earlier)

-- A) Soft-delete function
create or replace function public.soft_delete_profile(
  p_profile_id uuid,
  p_deleted_by_auth_user_id uuid,
  p_reason text default null
) returns void
language plpgsql
as $$
begin
  update public.profiles
    set deleted_at = now(),
        deleted_by_auth_user_id = p_deleted_by_auth_user_id,
        delete_reason = p_reason,
        updated_at = now()
  where id = p_profile_id;

  -- Cleanup active carts (guest/member)
  update public.carts
    set status = 'abandoned',
        updated_at = now()
  where profile_id = p_profile_id
    and status = 'active';
end;
$$;

-- B) Restore function
create or replace function public.restore_profile(
  p_profile_id uuid,
  p_actor_auth_user_id uuid
) returns void
language plpgsql
as $$
begin
  update public.profiles
    set deleted_at = null,
        deleted_by_auth_user_id = null,
        delete_reason = null,
        updated_at = now()
  where id = p_profile_id;
end;
$$;

-- C) Admin view (safe now because profiles exists)
-- Shows deletion state + basic audit fields useful for an admin panel.
drop view if exists public.profiles_admin_view;
create view public.profiles_admin_view as
select
  p.id,
  p.auth_user_id,
  p.email,
  p.display_name,
  p.avatar_url,
  p.role,
  p.is_active,
  p.created_at,
  p.updated_at,

  -- soft delete fields (must exist on profiles)
  p.deleted_at,
  p.deleted_by_auth_user_id,
  p.delete_reason,

  -- derived convenience
  (p.deleted_at is not null) as is_deleted
from public.profiles p;

-- D) Purge readiness view (safe now)
-- You can tune the interval. This is a "reporting" view; purging is still an explicit action.
drop view if exists public.profiles_ready_for_purge;
create view public.profiles_ready_for_purge as
select
  p.id,
  p.email,
  p.display_name,
  p.deleted_at,
  p.deleted_by_auth_user_id,
  p.delete_reason,
  p.updated_at
from public.profiles p
where p.deleted_at is not null
  and p.deleted_at < (now() - interval '30 days');

-- E) Optional indexes to speed admin queries (no-ops if columns already indexed)
create index if not exists profiles_deleted_at_idx on public.profiles(deleted_at);
create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);


-- 7: THE MONEY (ORDERS & SHIPPING) — FIXED (Restock Guard + Race-Safe)
-- Fixes included:
-- ✅ Adds orders.restocked_at (guard flag)
-- ✅ Restock trigger is idempotent + race-safe:
--    - uses an atomic UPDATE ... WHERE restocked_at IS NULL ... RETURNING
--    - if no row is returned, restock is skipped (prevents double-restock on toggle or concurrent updates)

-- ----------------------------
-- 7.1) SHIPPING PRESETS
-- ----------------------------
create table if not exists public.shipping_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- e.g. "Default Shipping"
  is_active boolean not null default true,

  free_shipping_threshold_cents int null check (free_shipping_threshold_cents >= 0),
  currency text not null default 'USD',

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  shipping_profile_id uuid not null references public.shipping_profiles(id) on delete cascade,

  name text not null, -- e.g. "Standard", "Priority"
  provider_hint text null,
  service_code text null,

  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',

  min_subtotal_cents int null check (min_subtotal_cents >= 0),
  max_subtotal_cents int null check (max_subtotal_cents >= 0),

  country text null,
  region text null,

  is_active boolean not null default true,
  position int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipping_rates_profile_idx on public.shipping_rates(shipping_profile_id);
create index if not exists shipping_rates_active_idx on public.shipping_rates(is_active);
create unique index if not exists shipping_rates_unique_pos
  on public.shipping_rates(shipping_profile_id, position);

-- Shipping “from” address (store config)
create table if not exists public.shipping_origin (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,

  name text null,
  company text null,
  line1 text null,
  line2 text null,
  city text null,
  region text null,
  postal_code text null,
  country text null default 'US',
  phone text null,
  email text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipping_origin_active_idx on public.shipping_origin(is_active);

-- Package presets (optional)
create table if not exists public.package_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,

  weight_oz int null check (weight_oz >= 0),
  length_in numeric null check (length_in >= 0),
  width_in numeric null check (width_in >= 0),
  height_in numeric null check (height_in >= 0),

  is_active boolean not null default true,
  position int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_presets_active_idx on public.package_presets(is_active);
create unique index if not exists package_presets_unique_pos on public.package_presets(position);

-- ----------------------------
-- 7.2) ORDERS
-- ----------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null references public.profiles(id) on delete restrict,
  auth_user_id uuid null,

  -- order display id (nice for emails/receipts)
  order_number bigserial,

  status text not null default 'pending'
    check (status in ('pending','paid','fulfilled','cancelled','refunded')),

  currency text not null default 'USD',

  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  shipping_cents int not null default 0 check (shipping_cents >= 0),
  tax_cents int not null default 0 check (tax_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),

  -- ✅ restock guard flag (prevents phantom stock from repeated cancels)
  restocked_at timestamptz null,

  -- guest/member info snapshot at time of purchase
  customer_email text null,
  customer_first_name text null,
  customer_last_name text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_profile_idx on public.orders(profile_id);
create index if not exists orders_status_idx on public.orders(status);

-- Order items (immutable snapshot)
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,

  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,

  product_title text not null,
  variant_title text not null default 'Default',

  quantity int not null check (quantity > 0),

  price_cents int not null check (price_cents >= 0),
  compare_at_price_cents int null check (compare_at_price_cents >= 0),
  currency text not null default 'USD',

  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id);

-- Shipping address snapshot (optional but recommended)
create table if not exists public.order_addresses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,

  full_name text null,
  line1 text null,
  line2 text null,
  city text null,
  region text null,
  postal_code text null,
  country text null,
  phone text null,

  created_at timestamptz not null default now()
);

-- Payments / attempts log (optional but recommended)
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,

  provider text not null,
  provider_ref text null,
  status text not null default 'created'
    check (status in ('created','authorized','captured','failed','refunded','voided')),

  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_payments_order_idx on public.order_payments(order_id);

-- Link orders to shipping selection + snapshots (must run AFTER orders exists)
alter table public.orders
  add column if not exists shipping_rate_id uuid null references public.shipping_rates(id) on delete set null,
  add column if not exists shipping_method_name text null,
  add column if not exists shipping_provider_hint text null,
  add column if not exists shipping_service_code text null;

-- ----------------------------
-- 7.3) RESTOCK TRIGGER (GUARDED + RACE-SAFE)
-- ----------------------------
create or replace function public.trg_restock_inventory_on_order_cancel()
returns trigger
language plpgsql
as $$
declare
  v_marked boolean;
begin
  -- Only act when transitioning INTO cancelled
  if (old.status is distinct from 'cancelled') and (new.status = 'cancelled') then

    -- ✅ Atomic guard acquisition:
    -- Whoever successfully sets restocked_at from NULL "owns" the restock.
    with marked as (
      update public.orders o
      set restocked_at = now(),
          updated_at = now()
      where o.id = new.id
        and o.restocked_at is null
      returning 1
    )
    select exists (select 1 from marked) into v_marked;

    -- If already restocked (toggle or concurrency), do nothing
    if v_marked then
      update public.inventory i
      set quantity = i.quantity + oi.quantity,
          updated_at = now()
      from public.order_items oi
      where oi.order_id = new.id
        and oi.variant_id = i.variant_id
        and i.track_inventory = true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_restock_on_cancel on public.orders;
create trigger trg_orders_restock_on_cancel
after update of status on public.orders
for each row execute function public.trg_restock_inventory_on_order_cancel();

-- -------------------------------------------------------------------
-- 8.0) RESTOCK SAFETY (prevents "phantom stock" from toggle-cancel)
-- -------------------------------------------------------------------
-- Ensure guard column exists (idempotent)
alter table public.orders
  add column if not exists restocked_at timestamptz null;

-- Safe, idempotent restock trigger:
-- - fires only when status transitions INTO 'cancelled'
-- - uses row lock + restocked_at guard to ensure "run once" behavior
create or replace function public.trg_restock_inventory_on_order_cancel()
returns trigger
language plpgsql
as $$
declare
  v_lock uuid;
begin
  -- only run when transitioning into cancelled
  if old.status is distinct from 'cancelled'
     and new.status = 'cancelled' then

    -- lock the order row to avoid concurrent double-restock
    select o.id into v_lock
    from public.orders o
    where o.id = new.id
    for update;

    -- if already restocked, do nothing
    if (select restocked_at from public.orders where id = new.id) is not null then
      return new;
    end if;

    -- restock tracked variants only
    update public.inventory i
    set quantity = i.quantity + oi.quantity,
        updated_at = now()
    from public.order_items oi
    where oi.order_id = new.id
      and oi.variant_id = i.variant_id
      and i.track_inventory = true;

    -- mark as restocked (prevents repeat restocks)
    update public.orders
      set restocked_at = now(),
          updated_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_restock_on_cancel on public.orders;
create trigger trg_orders_restock_on_cancel
after update of status on public.orders
for each row execute function public.trg_restock_inventory_on_order_cancel();

-- Optional: if an admin "uncancels" an order, clear restocked_at so a future cancel can restock again
-- (ONLY enable if your operational flow truly supports toggling out of cancelled safely.)
create or replace function public.trg_clear_restock_guard_on_uncancel()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    update public.orders
      set restocked_at = null,
          updated_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_clear_restock_guard on public.orders;
create trigger trg_orders_clear_restock_guard
after update of status on public.orders
for each row execute function public.trg_clear_restock_guard_on_uncancel();

-- -------------------------------------------------------------------
-- 8.1) Fulfillment records (multiple shipments per order supported)
-- -------------------------------------------------------------------
create table if not exists public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,

  status text not null default 'unfulfilled'
    check (status in ('unfulfilled','partial','fulfilled','cancelled')),

  -- where it's going (snapshot)
  ship_to_name text null,
  ship_to_line1 text null,
  ship_to_line2 text null,
  ship_to_city text null,
  ship_to_region text null,
  ship_to_postal_code text null,
  ship_to_country text null,
  ship_to_phone text null,

  -- internal notes
  note text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fulfillments_order_idx on public.fulfillments(order_id);
create index if not exists fulfillments_status_idx on public.fulfillments(status);

-- -------------------------------------------------------------------
-- 8.2) Fulfillment items (what was shipped in this fulfillment)
-- -------------------------------------------------------------------
create table if not exists public.fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete cascade,

  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity int not null check (quantity > 0),

  created_at timestamptz not null default now()
);

create index if not exists fulfillment_items_fulfillment_idx on public.fulfillment_items(fulfillment_id);
create unique index if not exists fulfillment_items_unique_item
  on public.fulfillment_items(fulfillment_id, order_item_id);

-- ✅ Keep orders.status in sync with fulfillment coverage
-- Rule:
-- - If every order_item for the order has at least one fulfillment_items row -> orders.status = 'fulfilled'
-- - Otherwise, do not force (allows pending/paid/partial flows handled by app/payment logic)
create or replace function public.trg_sync_order_status_from_fulfillment_items()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_total_items int;
  v_fulfilled_items int;
begin
  -- resolve order_id from the fulfillment referenced by the fulfillment_items row
  select f.order_id
    into v_order_id
  from public.fulfillments f
  where f.id = coalesce(new.fulfillment_id, old.fulfillment_id);

  if v_order_id is null then
    return coalesce(new, old);
  end if;

  -- total order items for this order
  select count(*) into v_total_items
  from public.order_items oi
  where oi.order_id = v_order_id;

  -- how many distinct order_items have been linked to ANY fulfillment_items
  select count(distinct oi.id) into v_fulfilled_items
  from public.order_items oi
  join public.fulfillments f on f.order_id = oi.order_id
  join public.fulfillment_items fi
    on fi.fulfillment_id = f.id
   and fi.order_item_id = oi.id
  where oi.order_id = v_order_id;

  if v_total_items > 0 and v_fulfilled_items = v_total_items then
    update public.orders
      set status = 'fulfilled',
          updated_at = now()
    where id = v_order_id
      and status <> 'fulfilled';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fulfillment_items_sync_order_status on public.fulfillment_items;
create trigger trg_fulfillment_items_sync_order_status
after insert or delete on public.fulfillment_items
for each row execute function public.trg_sync_order_status_from_fulfillment_items();

-- -------------------------------------------------------------------
-- 8.3) Tracking numbers (multiple tracking numbers per fulfillment supported)
-- -------------------------------------------------------------------
create table if not exists public.fulfillment_tracking (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete cascade,

  carrier text null,              -- 'USPS','UPS','FedEx'
  tracking_number text not null,
  tracking_url text null,

  created_at timestamptz not null default now()
);

create index if not exists fulfillment_tracking_fulfillment_idx on public.fulfillment_tracking(fulfillment_id);
create unique index if not exists fulfillment_tracking_unique
  on public.fulfillment_tracking(fulfillment_id, tracking_number);

-- -------------------------------------------------------------------
-- 8.4) REVIEWS + RATINGS (fast review links from email, guest+member friendly)
-- -------------------------------------------------------------------
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid null references public.product_variants(id) on delete set null,

  -- who wrote it (always a profile, member or guest)
  profile_id uuid not null references public.profiles(id) on delete cascade,
  auth_user_id uuid null,

  -- optional linkage to the purchase (helps verify + email deep links)
  order_id uuid null references public.orders(id) on delete set null,
  order_item_id uuid null references public.order_items(id) on delete set null,

  rating int not null check (rating between 1 and 5),
  title text null,
  body text null,

  is_verified_purchase boolean not null default false,

  -- moderation
  status text not null default 'published'
    check (status in ('published','pending','hidden')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- if an order_item_id is provided, an order_id must also be provided
  constraint product_reviews_order_item_requires_order check (
    order_item_id is null or order_id is not null
  )
);

create index if not exists product_reviews_product_idx on public.product_reviews(product_id);
create index if not exists product_reviews_variant_idx on public.product_reviews(variant_id);
create index if not exists product_reviews_profile_idx on public.product_reviews(profile_id);
create index if not exists product_reviews_status_idx on public.product_reviews(status);
create index if not exists product_reviews_created_idx on public.product_reviews(created_at desc);

create unique index if not exists product_reviews_unique_profile_product
  on public.product_reviews(profile_id, product_id);

create unique index if not exists product_reviews_unique_order_item
  on public.product_reviews(order_item_id)
  where order_item_id is not null;

-- -------------------------------------------------------------------
-- 8.5) Review invites (email deep-link token)
-- -------------------------------------------------------------------
create table if not exists public.review_invites (
  id uuid primary key default gen_random_uuid(),

  token uuid not null unique default gen_random_uuid(),

  profile_id uuid not null references public.profiles(id) on delete cascade,
  auth_user_id uuid null,

  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid null references public.order_items(id) on delete set null,

  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid null references public.product_variants(id) on delete set null,

  email text not null, -- snapshot where we sent it

  expires_at timestamptz not null default (now() + interval '30 days'),
  used_at timestamptz null,

  created_at timestamptz not null default now()
);

create index if not exists review_invites_profile_idx on public.review_invites(profile_id);
create index if not exists review_invites_order_idx on public.review_invites(order_id);
create index if not exists review_invites_product_idx on public.review_invites(product_id);
create index if not exists review_invites_expires_idx on public.review_invites(expires_at);
create index if not exists review_invites_used_idx on public.review_invites(used_at);

create unique index if not exists review_invites_unique_order_item
  on public.review_invites(order_item_id)
  where order_item_id is not null;

-- -------------------------------------------------------------------
-- 8.6) Lightweight aggregates (optional cache)
-- -------------------------------------------------------------------
create table if not exists public.product_review_stats (
  product_id uuid primary key references public.products(id) on delete cascade,

  review_count int not null default 0 check (review_count >= 0),
  avg_rating numeric not null default 0 check (avg_rating >= 0 and avg_rating <= 5),

  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------
-- 8.7) updated_at triggers (ties into public.set_updated_at)
-- -------------------------------------------------------------------
drop trigger if exists trg_fulfillments_updated_at on public.fulfillments;
create trigger trg_fulfillments_updated_at
before update on public.fulfillments
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_reviews_updated_at on public.product_reviews;
create trigger trg_product_reviews_updated_at
before update on public.product_reviews
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_review_stats_updated_at on public.product_review_stats;
create trigger trg_product_review_stats_updated_at
before update on public.product_review_stats
for each row execute function public.set_updated_at();

-- 9: THE "BRAIN" (SEARCH + TRIGGERS & LOGIC) — FULL FILE FIX (Deep Sync / Ripple Triggers Added)
-- Fixes included:
-- ✅ Product refresh trigger (title/description/badge changes)
-- ✅ Join-table refresh triggers (product_tags, product_categories, collection_products) on insert/delete/update
-- ✅ RIPPLE triggers:
--    - tags.name rename       -> refresh all linked products
--    - categories.name rename -> refresh all linked products
--    - collections.name rename -> refresh all linked products
-- ✅ Fast trigram index on products.search_text
-- ✅ Search RPC
--
-- IMPORTANT:
-- - Best practice: define `search_text` directly in Block 4 (products CREATE TABLE).
-- - The ALTER below is a safe guard *only if products exists by Block 9*.

-- A) Ensure pg_trgm exists (safe even if already created in Block 1)
create extension if not exists pg_trgm;

-- B) Ensure search_text exists (guard; ideally already in Block 4)
alter table public.products
  add column if not exists search_text text null;

-- C) Refresh function: recompute a product's denormalized search_text
create or replace function public.refresh_product_search_text(p_product_id uuid)
returns void
language plpgsql
as $$
declare
  v_title text;
  v_desc text;
  v_badge text;
  v_tags text;
  v_cats text;
  v_cols text;
begin
  -- product fields
  select title, coalesce(description,''), coalesce(badge,'')
    into v_title, v_desc, v_badge
  from public.products
  where id = p_product_id;

  -- tag names
  select coalesce(string_agg(t.name, ' '), '')
    into v_tags
  from public.product_tags pt
  join public.tags t on t.id = pt.tag_id
  where pt.product_id = p_product_id;

  -- category names
  select coalesce(string_agg(c.name, ' '), '')
    into v_cats
  from public.product_categories pc
  join public.categories c on c.id = pc.category_id
  where pc.product_id = p_product_id;

  -- collection names
  select coalesce(string_agg(col.name, ' '), '')
    into v_cols
  from public.collection_products cp
  join public.collections col on col.id = cp.collection_id
  where cp.product_id = p_product_id;

  update public.products
    set search_text =
      trim(
        coalesce(v_title,'') || ' ' ||
        coalesce(v_desc,'') || ' ' ||
        coalesce(v_badge,'') || ' ' ||
        coalesce(v_tags,'') || ' ' ||
        coalesce(v_cats,'') || ' ' ||
        coalesce(v_cols,'')
      )
  where id = p_product_id;
end;
$$;

-- D) Product trigger: if product text changes, refresh its own search_text
create or replace function public.trg_products_refresh_search_text()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_product_search_text(new.id);
  return new;
end;
$$;

drop trigger if exists trg_products_search_text on public.products;
create trigger trg_products_search_text
after insert or update of title, description, badge
on public.products
for each row execute function public.trg_products_refresh_search_text();

-- E) Join-table trigger: if mappings change, refresh affected product
create or replace function public.trg_refresh_product_search_from_join()
returns trigger
language plpgsql
as $$
declare
  v_product_id uuid;
begin
  v_product_id := coalesce(new.product_id, old.product_id);

  if v_product_id is not null then
    perform public.refresh_product_search_text(v_product_id);
  end if;

  return coalesce(new, old);
end;
$$;

-- product_tags mapping changes
drop trigger if exists trg_product_tags_refresh_search on public.product_tags;
create trigger trg_product_tags_refresh_search
after insert or delete or update on public.product_tags
for each row execute function public.trg_refresh_product_search_from_join();

-- product_categories mapping changes
drop trigger if exists trg_product_categories_refresh_search on public.product_categories;
create trigger trg_product_categories_refresh_search
after insert or delete or update on public.product_categories
for each row execute function public.trg_refresh_product_search_from_join();

-- collection_products mapping changes
drop trigger if exists trg_collection_products_refresh_search on public.collection_products;
create trigger trg_collection_products_refresh_search
after insert or delete or update on public.collection_products
for each row execute function public.trg_refresh_product_search_from_join();

-- ✅ F) RIPPLE TRIGGERS: rename metadata -> refresh all connected products

-- Tags.name changed -> refresh all products that use that tag
create or replace function public.trg_refresh_product_search_on_tag_rename()
returns trigger
language plpgsql
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  -- refresh every product that has this tag
  perform public.refresh_product_search_text(pt.product_id)
  from public.product_tags pt
  where pt.tag_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_tags_refresh_product_search on public.tags;
create trigger trg_tags_refresh_product_search
after update of name on public.tags
for each row execute function public.trg_refresh_product_search_on_tag_rename();

-- Categories.name changed -> refresh all products that use that category
create or replace function public.trg_refresh_product_search_on_category_rename()
returns trigger
language plpgsql
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  perform public.refresh_product_search_text(pc.product_id)
  from public.product_categories pc
  where pc.category_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_categories_refresh_product_search on public.categories;
create trigger trg_categories_refresh_product_search
after update of name on public.categories
for each row execute function public.trg_refresh_product_search_on_category_rename();

-- Collections.name changed -> refresh all products that use that collection
create or replace function public.trg_refresh_product_search_on_collection_rename()
returns trigger
language plpgsql
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  perform public.refresh_product_search_text(cp.product_id)
  from public.collection_products cp
  where cp.collection_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_collections_refresh_product_search on public.collections;
create trigger trg_collections_refresh_product_search
after update of name on public.collections
for each row execute function public.trg_refresh_product_search_on_collection_rename();

-- G) Indexes (fast ILIKE + basic storefront filters)

-- trigram index (fast ILIKE / similarity on search_text)
create index if not exists products_search_text_trgm_idx
  on public.products using gin (search_text gin_trgm_ops);

-- common storefront filters
create index if not exists products_slug_idx on public.products(slug);
create index if not exists products_badge_idx on public.products(badge);
create index if not exists products_price_idx on public.products(price_cents);

-- joins / faceting speedups
create index if not exists product_tags_product_idx on public.product_tags(product_id);
create index if not exists product_categories_product_idx on public.product_categories(product_id);
create index if not exists collection_products_product_idx on public.collection_products(product_id);

-- H) Search RPC (paginated)
create or replace function public.search_products(
  q text,
  limit_count int default 24,
  offset_count int default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  price_cents int,
  badge text,
  status text,
  is_featured boolean,
  created_at timestamptz,
  score real
)
language sql
stable
as $$
  select
    p.id,
    p.slug,
    p.title,
    p.price_cents,
    p.badge,
    p.status,
    p.is_featured,
    p.created_at,
    greatest(
      similarity(coalesce(p.search_text,''), q),
      similarity(coalesce(p.title,''), q)
    )::real as score
  from public.products p
  where p.status = 'active'
    and (
      q is null
      or length(trim(q)) = 0
      or coalesce(p.search_text,'') ilike ('%' || q || '%')
      or p.title ilike ('%' || q || '%')
    )
  order by
    case when q is null or length(trim(q)) = 0 then 0 else 1 end desc,
    score desc,
    p.is_featured desc,
    p.created_at desc
  limit limit_count
  offset offset_count;
$$;

-- I) Optional one-time backfill (run manually after deploying Block 9)
-- select public.refresh_product_search_text(id) from public.products;

-- 10: INDEX + CONSTRAINT HARDENING (SAFE)
-- Will NOT crash if tables/columns are missing.
-- It silently skips anything that doesn't exist yet.

-- =========================================================
-- 10.0) Helper checks (inline patterns)
-- =========================================================

-- =========================================================
-- 10.1) FINANCIAL / INTEGRITY CONSTRAINTS (SAFE)
-- =========================================================

-- PRODUCTS: price_cents >= 0
do $$
begin
  if to_regclass('public.products') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='products' and column_name='price_cents'
     )
  then
    begin
      alter table public.products
        add constraint products_price_cents_nonneg check (price_cents >= 0);
    exception when duplicate_object then null;
    end;

    begin
      -- compare_at_price_cents >= 0
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='products' and column_name='compare_at_price_cents'
      ) then
        alter table public.products
          add constraint products_compare_at_price_cents_nonneg
          check (compare_at_price_cents is null or compare_at_price_cents >= 0);
      end if;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- PRODUCT VARIANTS: price fields >= 0
do $$
begin
  if to_regclass('public.product_variants') is not null then
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='product_variants' and column_name='price_cents'
      ) then
        alter table public.product_variants
          add constraint product_variants_price_cents_nonneg
          check (price_cents is null or price_cents >= 0);
      end if;
    exception when duplicate_object then null;
    end;

    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='product_variants' and column_name='compare_at_price_cents'
      ) then
        alter table public.product_variants
          add constraint product_variants_compare_at_price_cents_nonneg
          check (compare_at_price_cents is null or compare_at_price_cents >= 0);
      end if;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- INVENTORY: quantity >= 0
do $$
begin
  if to_regclass('public.inventory') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='inventory' and column_name='quantity'
     )
  then
    begin
      alter table public.inventory
        add constraint inventory_quantity_nonneg check (quantity >= 0);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- CART ITEMS: quantity > 0, prices >= 0
do $$
begin
  if to_regclass('public.cart_items') is not null then
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='cart_items' and column_name='quantity'
      ) then
        alter table public.cart_items
          add constraint cart_items_quantity_pos check (quantity > 0);
      end if;
    exception when duplicate_object then null;
    end;

    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='cart_items' and column_name='price_cents'
      ) then
        alter table public.cart_items
          add constraint cart_items_price_cents_nonneg check (price_cents >= 0);
      end if;
    exception when duplicate_object then null;
    end;

    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='cart_items' and column_name='compare_at_price_cents'
      ) then
        alter table public.cart_items
          add constraint cart_items_compare_at_price_cents_nonneg
          check (compare_at_price_cents is null or compare_at_price_cents >= 0);
      end if;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ORDERS: money fields >= 0
do $$
begin
  if to_regclass('public.orders') is not null then
    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='subtotal_cents') then
        alter table public.orders add constraint orders_subtotal_cents_nonneg check (subtotal_cents >= 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='discount_cents') then
        alter table public.orders add constraint orders_discount_cents_nonneg check (discount_cents >= 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_cents') then
        alter table public.orders add constraint orders_shipping_cents_nonneg check (shipping_cents >= 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='tax_cents') then
        alter table public.orders add constraint orders_tax_cents_nonneg check (tax_cents >= 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total_cents') then
        alter table public.orders add constraint orders_total_cents_nonneg check (total_cents >= 0);
      end if;
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ORDER ITEMS: quantity > 0, prices >= 0
do $$
begin
  if to_regclass('public.order_items') is not null then
    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='quantity') then
        alter table public.order_items add constraint order_items_quantity_pos check (quantity > 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='price_cents') then
        alter table public.order_items add constraint order_items_price_cents_nonneg check (price_cents >= 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='compare_at_price_cents') then
        alter table public.order_items
          add constraint order_items_compare_at_price_cents_nonneg
          check (compare_at_price_cents is null or compare_at_price_cents >= 0);
      end if;
    exception when duplicate_object then null; end;
  end if;
end $$;

-- PAYMENTS: amount >= 0
do $$
begin
  if to_regclass('public.order_payments') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_payments' and column_name='amount_cents')
  then
    begin
      alter table public.order_payments
        add constraint order_payments_amount_cents_nonneg check (amount_cents >= 0);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- DISCOUNTS: value sanity (only if columns exist)
do $$
begin
  if to_regclass('public.discounts') is not null then
    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='discounts' and column_name='amount_off_cents') then
        alter table public.discounts
          add constraint discounts_amount_off_cents_pos
          check (amount_off_cents is null or amount_off_cents > 0);
      end if;
    exception when duplicate_object then null; end;

    begin
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='discounts' and column_name='percent_off') then
        alter table public.discounts
          add constraint discounts_percent_off_range
          check (percent_off is null or (percent_off > 0 and percent_off <= 100));
      end if;
    exception when duplicate_object then null; end;
  end if;
end $$;

-- DISCOUNT REDEMPTIONS: amount_discounted >= 0
do $$
begin
  if to_regclass('public.discount_redemptions') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='discount_redemptions' and column_name='amount_discounted_cents')
  then
    begin
      alter table public.discount_redemptions
        add constraint discount_redemptions_amount_nonneg check (amount_discounted_cents >= 0);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- =========================================================
-- 10.2) PERFORMANCE INDEXES (SAFE, column-guarded)
-- =========================================================

-- PRODUCTS indexes (only if columns exist)
do $$
begin
  if to_regclass('public.products') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='slug') then
      execute 'create unique index if not exists products_slug_uidx on public.products (slug);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='status')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='created_at')
    then
      execute 'create index if not exists products_status_created_idx on public.products (status, created_at desc);';
      execute 'create index if not exists products_active_created_idx on public.products (created_at desc) where status = ''active'';';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='is_featured')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='created_at')
    then
      execute 'create index if not exists products_featured_created_idx on public.products (is_featured, created_at desc) where is_featured is true;';
      execute 'create index if not exists products_featured_idx on public.products (is_featured);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='badge') then
      execute 'create index if not exists products_badge_idx on public.products (badge) where badge is not null;';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='search_text') then
      -- trigram index requires pg_trgm (safe if it exists)
      execute 'create index if not exists products_search_text_trgm_idx on public.products using gin (search_text gin_trgm_ops);';
    end if;
  end if;
end $$;

-- PRODUCT IMAGES (position is optional, guard it)
do $$
begin
  if to_regclass('public.product_images') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_images' and column_name='product_id') then
      execute 'create index if not exists product_images_product_idx on public.product_images (product_id);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_images' and column_name='product_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_images' and column_name='position')
    then
      execute 'create index if not exists product_images_product_position_idx on public.product_images (product_id, position);';
    end if;
  end if;
end $$;

-- TAGS + JOIN
do $$
begin
  if to_regclass('public.tags') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='tags' and column_name='slug') then
      execute 'create unique index if not exists tags_slug_uidx on public.tags (slug);';
    end if;
  end if;

  if to_regclass('public.product_tags') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_tags' and column_name='product_id') then
      execute 'create index if not exists product_tags_product_idx on public.product_tags (product_id);';
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_tags' and column_name='tag_id') then
      execute 'create index if not exists product_tags_tag_idx on public.product_tags (tag_id);';
    end if;
  end if;
end $$;

-- CATEGORIES + JOIN (parent_id/position are optional; guard)
do $$
begin
  if to_regclass('public.categories') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='slug') then
      execute 'create unique index if not exists categories_slug_uidx on public.categories (slug);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='parent_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='position')
    then
      execute 'create index if not exists categories_parent_position_idx on public.categories (parent_id, position);';
    end if;
  end if;

  if to_regclass('public.product_categories') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_categories' and column_name='product_id') then
      execute 'create index if not exists product_categories_product_idx on public.product_categories (product_id);';
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_categories' and column_name='category_id') then
      execute 'create index if not exists product_categories_category_idx on public.product_categories (category_id);';
    end if;
  end if;
end $$;

-- COLLECTIONS + JOIN (is_home_section/position optional; guard)
do $$
begin
  if to_regclass('public.collections') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='collections' and column_name='slug') then
      execute 'create unique index if not exists collections_slug_uidx on public.collections (slug);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='collections' and column_name='is_home_section')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='collections' and column_name='position')
    then
      execute 'create index if not exists collections_home_position_idx on public.collections (is_home_section, position);';
    end if;
  end if;

  if to_regclass('public.collection_products') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='collection_products' and column_name='collection_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='collection_products' and column_name='position')
    then
      execute 'create index if not exists collection_products_collection_position_idx on public.collection_products (collection_id, position);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='collection_products' and column_name='product_id') then
      execute 'create index if not exists collection_products_product_idx on public.collection_products (product_id);';
    end if;
  end if;
end $$;

-- VARIANTS + INVENTORY (position optional; sku optional; guard)
do $$
begin
  if to_regclass('public.product_variants') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='product_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='position')
    then
      execute 'create index if not exists product_variants_product_position_idx on public.product_variants (product_id, position);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='product_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='is_active')
    then
      execute 'create index if not exists product_variants_product_active_idx on public.product_variants (product_id, is_active);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='sku') then
      execute 'create unique index if not exists product_variants_sku_uidx on public.product_variants (sku) where sku is not null;';
    end if;
  end if;

  if to_regclass('public.inventory') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='inventory' and column_name='quantity')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='inventory' and column_name='track_inventory')
    then
      execute 'create index if not exists inventory_in_stock_idx on public.inventory (quantity) where track_inventory is true;';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='inventory' and column_name='allow_backorder')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='inventory' and column_name='allow_backorder')
    then
      execute 'create index if not exists inventory_backorder_idx on public.inventory (allow_backorder) where allow_backorder is true;';
    end if;
  end if;
end $$;

-- CARTS + CART ITEMS
do $$
begin
  if to_regclass('public.carts') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='carts' and column_name='profile_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='carts' and column_name='status')
    then
      execute 'create unique index if not exists carts_one_active_per_profile_uidx on public.carts (profile_id) where status = ''active'';';
      execute 'create index if not exists carts_profile_idx on public.carts (profile_id);';
      execute 'create index if not exists carts_status_idx on public.carts (status);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='carts' and column_name='auth_user_id') then
      execute 'create index if not exists carts_auth_user_idx on public.carts (auth_user_id) where auth_user_id is not null;';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='carts' and column_name='updated_at')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='carts' and column_name='status')
    then
      execute 'create index if not exists carts_status_updated_idx on public.carts (status, updated_at desc);';
    end if;
  end if;

  if to_regclass('public.cart_items') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cart_items' and column_name='cart_id') then
      execute 'create index if not exists cart_items_cart_idx on public.cart_items (cart_id);';
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cart_items' and column_name='variant_id') then
      execute 'create index if not exists cart_items_variant_idx on public.cart_items (variant_id);';
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='cart_items' and column_name='cart_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='cart_items' and column_name='variant_id')
    then
      execute 'create unique index if not exists cart_items_unique_variant_uidx on public.cart_items (cart_id, variant_id);';
    end if;
  end if;
end $$;

-- ORDERS + ORDER ITEMS
do $$
begin
  if to_regclass('public.orders') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='profile_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='created_at')
    then
      execute 'create index if not exists orders_profile_created_idx on public.orders (profile_id, created_at desc);';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='auth_user_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='created_at')
    then
      execute 'create index if not exists orders_auth_user_created_idx on public.orders (auth_user_id, created_at desc) where auth_user_id is not null;';
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='order_number') then
      execute 'create unique index if not exists orders_order_number_uidx on public.orders (order_number);';
    end if;
  end if;

  if to_regclass('public.order_items') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='order_id') then
      execute 'create index if not exists order_items_order_idx on public.order_items (order_id);';
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='product_id') then
      execute 'create index if not exists order_items_product_idx on public.order_items (product_id);';
    end if;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='variant_id') then
      execute 'create index if not exists order_items_variant_idx on public.order_items (variant_id);';
    end if;
  end if;
end $$;

-- =========================================================
-- 10.3) UPDATED_AT TRIGGERS (SAFE)
-- =========================================================

do $$
begin
  if to_regclass('public.products') is not null then
    execute 'drop trigger if exists trg_products_updated_at on public.products;';
    execute 'create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.product_variants') is not null then
    execute 'drop trigger if exists trg_product_variants_updated_at on public.product_variants;';
    execute 'create trigger trg_product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.inventory') is not null then
    execute 'drop trigger if exists trg_inventory_updated_at on public.inventory;';
    execute 'create trigger trg_inventory_updated_at before update on public.inventory for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.carts') is not null then
    execute 'drop trigger if exists trg_carts_updated_at on public.carts;';
    execute 'create trigger trg_carts_updated_at before update on public.carts for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.cart_items') is not null then
    execute 'drop trigger if exists trg_cart_items_updated_at on public.cart_items;';
    execute 'create trigger trg_cart_items_updated_at before update on public.cart_items for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.orders') is not null then
    execute 'drop trigger if exists trg_orders_updated_at on public.orders;';
    execute 'create trigger trg_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.order_payments') is not null then
    execute 'drop trigger if exists trg_order_payments_updated_at on public.order_payments;';
    execute 'create trigger trg_order_payments_updated_at before update on public.order_payments for each row execute function public.set_updated_at();';
  end if;

  -- optional tables
  if to_regclass('public.shipping_origin') is not null then
    execute 'drop trigger if exists trg_shipping_origin_updated_at on public.shipping_origin;';
    execute 'create trigger trg_shipping_origin_updated_at before update on public.shipping_origin for each row execute function public.set_updated_at();';
  end if;

  if to_regclass('public.package_presets') is not null then
    execute 'drop trigger if exists trg_package_presets_updated_at on public.package_presets;';
    execute 'create trigger trg_package_presets_updated_at before update on public.package_presets for each row execute function public.set_updated_at();';
  end if;
end $$;


-------------------------------------------------------------
-- stuff i had to add to make it work 
-------------------------------------------------------------
alter table public.products 
  add column if not exists is_featured boolean default false,
  add column if not exists badge text,
  add column if not exists price_cents int default 0,
  add column if not exists search_text text;

alter table public.product_variants 
  add column if not exists position int default 0,
  add column if not exists price_cents int; -- If missing here too

alter table public.profiles 
  add column if not exists auth_user_id uuid,
  add column if not exists deleted_at timestamptz,
  add column if not exists delete_reason text;

-- Fix Product table columns blovk 4 fix
alter table public.products add column if not exists is_featured boolean default false;
alter table public.products add column if not exists badge text;
alter table public.products add column if not exists search_text text;

-- Fix Product Images (This is where your specific error came from)
alter table public.product_images add column if not exists position int default 0;

-- Now run your index again:
create unique index if not exists product_images_unique_position
  on public.product_images(product_id, position);


alter table public.product_variants add column if not exists position int default 0;
alter table public.product_variants add column if not exists is_active boolean default true;
--block 5 fix 

-- Patching the existing Profiles table to match Block 6 requirements
alter table public.profiles 
  add column if not exists is_active boolean not null default true,
  add column if not exists auth_user_id uuid,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_auth_user_id uuid,
  add column if not exists delete_reason text;

-- Now that the columns exist, the index will work:
create index if not exists profiles_deleted_at_idx on public.profiles(deleted_at);
create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);

-- Fix the Profiles table missing column
alter table public.profiles 
  add column if not exists updated_at timestamptz not null default now();

-- Now that the column exists, re-run your Block 6 code.
-- 1. Fix Products (Existing)
alter table public.products 
  add column if not exists price_cents int default 0,
  add column if not exists compare_at_price_cents int;

-- 2. Fix Product Variants (Existing)
alter table public.product_variants 
  add column if not exists price_cents int,
  add column if not exists compare_at_price_cents int;

-- 3. Fix Cart Items (Only if it exists)
do $$ begin
  if to_regclass('public.cart_items') is not null then
    alter table public.cart_items 
      add column if not exists price_cents int default 0,
      add column if not exists compare_at_price_cents int;
  end if;
end $$;

-- 4. Fix Order Items (Only if it exists)
do $$ begin
  if to_regclass('public.order_items') is not null then
    alter table public.order_items 
      add column if not exists price_cents int default 0,
      add column if not exists compare_at_price_cents int;
  end if;
end $$;

alter table public.product_images
add column if not exists product_id uuid;

do $$
begin
  alter table public.product_images
    add constraint product_images_product_id_fkey
    foreign key (product_id)
    references public.products(id)
    on delete cascade;
exception
  when duplicate_object then null;
end $$;
