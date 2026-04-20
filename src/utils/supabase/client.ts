// utils/supabase/client.ts
// ─── Browser-side client ──────────────────────────────────────────────────────
import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Named export alias for compatibility
export const createBrowserClient = createClient;