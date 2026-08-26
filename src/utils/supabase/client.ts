// utils/supabase/client.ts
// ─── Browser-side client ──────────────────────────────────────────────────────
//
// IMPORTANT: Always use NEXT_PUBLIC_SUPABASE_URL_BROWSER for browser clients.
// NEXT_PUBLIC_SUPABASE_URL points to the internal Docker address (kong:8000)
// which browsers cannot reach. NEXT_PUBLIC_SUPABASE_URL_BROWSER is the public
// HTTPS address (db.unenter.live) that works from any browser.
//
// createBrowserClient accepts-and-ignores url/key args so it works as a
// drop-in replacement anywhere @supabase/ssr's createBrowserClient was called
// directly with process.env.NEXT_PUBLIC_SUPABASE_URL.
// ─────────────────────────────────────────────────────────────────────────────
import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import { CORE_DOMAIN } from "@/lib/multiZone";

const BROWSER_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
  process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Production only — see the matching comment in utils/supabase/server.ts.
// A cookie scoped to Domain=.unenter.live is silently rejected by the
// browser on localhost, so this must stay off for local dev.
const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? `.${CORE_DOMAIN}` : undefined;

export function createClient() {
  // Pinned to the same cookie name used by the server client (server.ts)
  // and middleware.ts. Without this, @supabase/ssr derives the auth cookie
  // name from the URL hostname — kong:8000 (server) vs db.unenter.live
  // (browser) resolve to two DIFFERENT default cookie names, so the browser
  // client never sees a valid session and every direct browser->Supabase
  // call (e.g. storage.upload()) silently goes out as role=anon and gets
  // RLS-rejected instead of erroring as "not logged in".
  //
  // domain: shares the session across every *.unenter.live subdomain — see
  // server.ts for why this matters (cart/checkout on zone subdomains was
  // broken without it).
  return createSupabaseBrowserClient(BROWSER_URL, ANON_KEY, {
    cookieOptions: { name: "sb-unenter-auth-token", domain: COOKIE_DOMAIN },
  });
}

// Drop-in replacement for direct @supabase/ssr createBrowserClient calls.
// Ignores any passed url/key — always uses the browser-safe env vars above.
export function createBrowserClient(_url?: string, _key?: string) {
  return createClient();
}
