-- Two live-cutover fixes, both found by driving the real checkout rather than
-- reading code. Applied to the running database first; recorded here so a
-- fresh deploy does not regress them.

-- 1. Stripe customer ids are mode-scoped. A cus_ created in test does not exist
-- in live, and the id string carries no hint of which mode made it -- so live
-- checkout handed a test customer to the live API and died with "No such
-- customer" for every account that had been through checkout during testing.
alter table public.tank_profiles
  add column if not exists stripe_customer_mode text;

comment on column public.tank_profiles.stripe_customer_mode is
  'Stripe mode (test|live) that stripe_customer_id belongs to. Reuse the customer only when it matches the current mode.';

update public.tank_profiles
set stripe_customer_mode = 'test'
where stripe_customer_id is not null
  and stripe_customer_mode is null;

-- 2. The product_key check is a second catalog pinned in SQL. Adding a product
-- to TANK_PRODUCTS and the store UI is not enough -- without this the insert
-- fails and the product cannot be sold at all, and the failure lands on a
-- customer mid-checkout instead of at build time.
alter table public.tank_purchases
  drop constraint if exists tank_purchases_product_key_check;

alter table public.tank_purchases
  add constraint tank_purchases_product_key_check
  check (product_key = any (array[
    'season_pass',
    'season_pass_xl',
    'tokens_500',
    'tokens_1500',
    'tokens_5000',
    'room_vip',
    'tank_bnb'
  ]));
