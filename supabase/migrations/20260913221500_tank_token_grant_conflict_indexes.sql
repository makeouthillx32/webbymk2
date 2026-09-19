-- Token grant idempotency: ON CONFLICT needs a FULL unique index.
--
-- 20260913202332 gave stripe_invoice_id a PARTIAL unique index
-- (WHERE stripe_invoice_id IS NOT NULL). Postgres cannot infer a partial
-- index from `ON CONFLICT (stripe_invoice_id)`, so every season-pass token
-- grant raised 42P10, the invoice.paid handler threw, and the webhook 500'd.
-- The pass activated (that write happens earlier) but the tokens never landed
-- and Stripe retried into the same wall.
--
-- Full indexes below. A unique index on a nullable column is safe here because
-- Postgres treats NULLs as distinct -- the 34 existing rows with no invoice and
-- no purchase stay legal.
--
-- purchase_id got the same treatment when this bit us the first time, but that
-- fix was applied straight to the live DB and never written down; a fresh
-- deploy would have regressed it. It is captured here so it survives.

create unique index if not exists tank_token_transactions_stripe_invoice_id_key
  on public.tank_token_transactions (stripe_invoice_id);

create unique index if not exists tank_token_transactions_purchase_id_key
  on public.tank_token_transactions (purchase_id);
