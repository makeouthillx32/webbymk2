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
import { createBrowserClient as createSupabaseBrowserClient } from "@/utils/supabase/client";

const BROWSER_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
  process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createClient() {
  return createSupabaseBrowserClient(BROWSER_URL, ANON_KEY);
}

// Drop-in replacement for direct @supabase/ssr createBrowserClient calls.
// Ignores any passed url/key — always uses the browser-safe env vars above.
export function createBrowserClient(_url?: string, _key?: string) {
  return createClient();
}
