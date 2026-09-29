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
import { forwardedHostHeaders } from "./forwardedHost";

export function createAdminClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://db.unenter.live";
  // A `kong:8000` value here means the container was built/deployed correctly
  // for in-Docker use — that hostname resolves fast and reliably over the
  // `unenter` bridge network, container-to-container, never leaving the
  // host. It used to get unconditionally swapped for the PUBLIC
  // https://db.unenter.live URL instead — a real, confirmed bug live
  // 2026-09-02/03: every admin-client call ended up hairpinning back out
  // through NPM to reach itself, and when that public edge had any trouble
  // (its own separate, unrelated issue), every one of THESE calls failed
  // with it too, even though the fast internal path was sitting right
  // there and working the whole time (confirmed via Kong's own access log
  // showing other in-container callers succeeding on kong:8000 during the
  // exact window this admin client was 502ing on the public path).
  // SUPABASE_INTERNAL_URL remains a deliberate escape hatch for a real
  // bare-host/non-Docker runtime that still somehow has NEXT_PUBLIC_
  // SUPABASE_URL set to kong:8000 (which wouldn't resolve there) — but it
  // must be explicitly opted into, never assumed just because kong:8000
  // is present.
  if (url.includes("kong:8000") && process.env.SUPABASE_INTERNAL_URL) {
    url = process.env.SUPABASE_INTERNAL_URL;
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("admin client: SUPABASE_SERVICE_ROLE_KEY not set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // The admin client is what sends invites and password resets, so it needs
    // the same correction as the cookie client. See forwardedHost.ts.
    global: { headers: forwardedHostHeaders(url) },
  });
}
