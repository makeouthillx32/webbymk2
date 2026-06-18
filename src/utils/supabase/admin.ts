// utils/supabase/admin.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY service-role Supabase client. Bypasses RLS, so every caller MUST
// enforce its own scoping.
//
// Why this exists: guest carts. The `carts`/`cart_items` RLS policies key guest
// access on `request.jwt.claims ->> 'session_id'`, but anonymous requests never
// carry that claim, so anon-client cart writes always fail (the read-back of an
// inserted cart returns nothing → CART_CREATE_FAILED). This breaks add-to-cart
// for any guest — e.g. every visitor on shop.unenter.live, where the host-scoped
// auth cookie from www doesn't apply.
//
// The cart routes resolve identity with the cookie client (verified user_id via
// getUser(), else the x-session-id token), then run carts/cart_items ops through
// THIS client, constrained by that identity. Never expose the service-role key
// to the browser; never import this from a client component.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("admin client: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
