-- Checkout stores the optional reservation returned by reserve_discount_use.
-- Keep this nullable because orders without a capped promotion have no hold.
alter table public.orders
  add column if not exists discount_reservation_id uuid;

-- Research checkout has its own auth-only cart table. Reusing orders.cart_id
-- incorrectly points a research cart UUID at public.carts and violates the
-- shop-cart foreign key. Keep the two cart domains explicit.
alter table public.orders
  add column if not exists research_cart_id uuid
  references public.research_carts(id) on delete set null;

create index if not exists orders_research_cart_idx
  on public.orders (research_cart_id)
  where research_cart_id is not null;

create unique index if not exists orders_pending_research_cart_uidx
  on public.orders (research_cart_id)
  where research_cart_id is not null
    and order_source = 'research'
    and payment_status = 'pending';

comment on column public.orders.discount_reservation_id is
  'Optional atomic discount-use reservation associated with this checkout.';

comment on column public.orders.research_cart_id is
  'Auth-only Labs research cart that produced this order; separate from the shop cart foreign key.';
