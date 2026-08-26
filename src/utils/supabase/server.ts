// utils/supabase/server.ts
// ─── Server-side client (App Router / Server Components / Route Handlers) ─────
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { CORE_DOMAIN } from "@/lib/multiZone";

// Production only — a bare `localhost` request can never accept a cookie
// scoped to Domain=.unenter.live (the browser silently drops it), so this
// must stay off for `bun run dev` / local Docker dev.
const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? `.${CORE_DOMAIN}` : undefined;

export async function createClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Pinned explicitly: @supabase/ssr defaults the auth cookie name to
      // `sb-${new URL(url).hostname.split(".")[0]}-auth-token`. This client
      // uses the internal kong:8000 URL while the browser client (client.ts)
      // must use the public db.unenter.live URL — two different hostnames
      // would silently produce two different cookie names, leaving the
      // browser client's session unset (requests fall back to role=anon).
      // Pinning the same literal name here and in client.ts/middleware.ts
      // keeps both clients reading/writing the one cookie.
      //
      // domain: without this, the cookie is host-only (scoped to whichever
      // *.unenter.live subdomain issued it), so signing in on www.unenter.live
      // never carries over to labs.unenter.live / shop.unenter.live / etc —
      // researchers could create an account but couldn't add anything to cart
      // on a zone subdomain. Found via E2E checkout test, 2026-08-06.
      cookieOptions: { name: "sb-unenter-auth-token", domain: COOKIE_DOMAIN },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
            // (middleware handles session refresh)
          }
        },
      },
    }
  );
}

// Named export aliases for compatibility
export const createServerClient = createClient;
export const createServiceClient = createClient;