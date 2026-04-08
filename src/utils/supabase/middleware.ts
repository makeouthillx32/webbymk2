// utils/supabase/middleware.ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRoute, isProtectedRoute } from "@/lib/protectedRoutes";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ── Bypass webhook routes entirely ───────────────────────────
  // Stripe (and any future webhooks) send raw bodies with signature
  // headers. If middleware reads/buffers the request first, the body
  // is consumed and the webhook handler can't verify the signature.
  if (pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  let res = NextResponse.next({ request: req });

  // ── Invite capture ──────────────────────────────────────────
  const invite = req.nextUrl.searchParams.get("invite");
  if (invite) {
    res.cookies.set("invite", invite, { path: "/", maxAge: 60 * 10 });
  }

  // ── Guest key ───────────────────────────────────────────────
  if (!req.cookies.get("dcg_guest_key")) {
    res.cookies.set("dcg_guest_key", crypto.randomUUID(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // ── Skip auth logic on auth pages ───────────────────────────
  if (isAuthRoute(pathname)) return res;

  // ── Supabase session ─────────────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ── Protect pages (not API routes) ──────────────────────────
  if (isProtectedRoute(pathname) && !session) {
    const target = pathname + (req.nextUrl.search || "");
    const url = new URL(`/sign-in?next=${encodeURIComponent(target)}`, req.url);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
//trying test keys 