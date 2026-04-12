import { NextRequest, NextResponse } from "next/server";

const LOCALES = ["en", "de"] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_COOKIE = "Next-Locale";
const LOCALE_HEADER = "X-Next-Locale";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const locale = LOCALES.find(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  ) as Locale | undefined;

  if (!locale) return NextResponse.next();

  const flatPath =
    pathname === `/${locale}` ? "/" : pathname.slice(`/${locale}`.length);

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = flatPath;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);

  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });

  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/(en|de)", "/(en|de)/:path*"],
};
