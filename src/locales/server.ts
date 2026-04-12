import { createI18nServer } from "next-international/server";

// Locale detection strategy (cookie-based):
//
// next-international reads the active locale from — in priority order:
//   1. The "X-Next-Locale" request header   ← set by middleware for the
//      current request so server components see the locale immediately,
//      even on the very first visit before the cookie is in the browser.
//   2. The "Next-Locale" request cookie     ← persisted by middleware on the
//      response and re-sent by the browser on all subsequent requests.
//
// No [locale] dynamic segment is needed; the middleware intercepts
// /en/* and /de/* URLs, sets the header + cookie, and rewrites to the
// flat path (e.g. /en/about → /about).

export const { getCurrentLocale, getI18n, getScopedI18n, getStaticParams } =
  createI18nServer({
    en: () => import("./en"),
    de: () => import("./de"),
  });
